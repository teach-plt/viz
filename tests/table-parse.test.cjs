const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../table-parse.html'),'utf8');
const script=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
function load(search='') {
  const elements=new Map();let document;
  class Element {
    constructor(){this.children=[];this.style={setProperty(k,v){this[k]=v}};this.attributes={};this.listeners={};this.className='';this.value='';this.scrollTop=0;this.scrollLeft=0;this.offsetTop=0;this.offsetHeight=38;this.clientHeight=344;this.selectionStart=this.selectionEnd=0;this.text='';}
    set textContent(value){this.text=value;this.children=[]}get textContent(){return this.text+this.children.map(c=>c.textContent).join('')}
    append(...items){for(const item of items){if(item.fragment)this.append(...item.children);else this.children.push(item)}}
    replaceChildren(...items){this.children=[];this.text='';this.append(...items)}
    setAttribute(k,v){this.attributes[k]=v}addEventListener(k,v){this.listeners[k]=v}
    focus(){document.activeElement=this}select(){this.selected=true}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}
  }
  document={activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement(tag){return Object.assign(new Element(),{tagName:tag})},createTextNode(text){return Object.assign(new Element(),{textContent:text})},createDocumentFragment(){return Object.assign(new Element(),{fragment:true})}};
  const context=vm.createContext({document,URL,URLSearchParams,location:{search,href:'file:///test/table-parse.html'+search}});
  vm.runInContext(script,context);
  return {field:id=>document.getElementById(id),run:code=>vm.runInContext(code,context),edit(id,text){const field=elements.get(id);field.focus();field.value=text;field.selectionStart=field.selectionEnd=text.length;field.listeners.input();return field.value},available(){return elements.get('grammar-highlight').children.filter(c=>c.className==='grammar-rule available').map(c=>c.children[0].textContent)}};
}
function setup(grammar,input) {
 const params=new URLSearchParams({grammar,input});return load('?'+params);
}
function key(page,key) {page.field('table-scroll').listeners.keydown({key,preventDefault(){}});}
function finish(page) {
 for(let i=0;i<100;i++) {
  if(page.run('accepted(activeState(),game)'))return;
  assert.ok(page.run('availableActions(activeState(),game).length')>0,'parser can progress');
  key(page,'Enter');
 }
 assert.fail('parser did not terminate');
}
test('unaugmented entrypoint kernel, closure, table headers and initial keyboard focus',()=>{
 const p=setup('s. S ::= A;\na. A ::= "x";','x');
 assert.equal(p.run('game.grammar.rules.length'),2);
 assert.equal(p.run('JSON.stringify(game.table.states[0].kernel)'),JSON.stringify([{r:0,d:0}]));
 assert.equal(p.run('game.table.states[0].items.length'),2);
 assert.equal(p.run('JSON.stringify(game.table.terminals.map(s=>s.value))'),'["x"]');
 assert.equal(p.run('JSON.stringify(game.table.nonterminals.map(s=>s.value))'),'["S","A"]');
 assert.equal(p.run('document.activeElement'),p.field('table-scroll'));
 assert.equal(p.run('availableActions(activeState(),game)[0].type'),'shift');
 assert.ok(!html.includes('id="user-input"'));
 assert.match(html,/Automate shift-reduce parsing\./);
});
test('state zero contains every entrypoint production and builtins are shift columns',()=>{
 const p=setup('i. E ::= Integer;\ne. E ::= "(" E ")";','42');
 assert.equal(p.run('game.table.states[0].kernel.length'),2);
 assert.equal(p.run('JSON.stringify(game.table.terminals.map(s=>s.value))'),'["Integer","(",")"]');
 finish(p);assert.equal(p.run('activeState().stack[0].value'),'E');
});
test('shift and reduction push and pop matching symbols and interspersed states',()=>{
 const p=setup('s. S ::= A "y";\na. A ::= "x";','xy');
 key(p,' ');assert.equal(p.run('activeState().offset'),1);assert.equal(p.run('activeState().numbers.length'),2);
 key(p,'Enter');assert.equal(p.run('activeState().stack[0].value'),'A');assert.equal(p.run('activeState().numbers[0]'),0);
 assert.equal(p.run('activeState().numbers.length'),1);
 assert.equal(p.run('availableActions(activeState(),game)[0].type'),'goto');
 key(p,'Enter');
 assert.equal(p.run('activeState().numbers[1]'),p.run('game.table.states[0].transitions.get(symbolKey({kind:"category",value:"A"})).to'));
 finish(p);assert.equal(p.run('activeState().stack.length'),1);assert.equal(p.run('activeState().numbers[0]'),0);
 assert.match(p.field('history').textContent,/S/);
});
test('epsilon and empty input finish, recursive grammar parses with explicit conflict choice',()=>{
 const p=setup('s. S ::= A;\na. A ::= ;','');finish(p);
 assert.equal(p.run('game.cursor'),3);
 const q=load();
 // The default LR(0) grammar has a shift/reduce conflict on *: choose shift.
 for(let n=0;n<100&&!q.run('accepted(activeState(),game)');n++) {
  q.run('selectedAction = Math.max(0,availableActions(activeState(),game).findIndex(a=>a.type==="shift"))');
  key(q,'Enter');
 }
 assert.equal(q.run('accepted(activeState(),game)'),true);
});
test('lookahead restricts shifts; conflicts expose and cycle all reductions and matching shift',()=>{
 const p=setup('s. S ::= A "x";\na. A ::= ;\nb. A ::= "x";','x');
 assert.match(p.run('game.table.states[0].conflict'),/Shift\/reduce/);
 assert.equal(p.run('JSON.stringify(availableActions(activeState(),game).map(a=>a.type))'),'["reduce","shift"]');
 key(p,'ArrowLeft');assert.equal(p.run('selectedAction'),1);key(p,'ArrowRight');assert.equal(p.run('selectedAction'),0);
 key(p,' ');assert.equal(p.run('activeState().stack[0].value'),'A');finish(p);
 const rr=setup('s. S ::= A;\nt. S ::= B;\na. A ::= "x";\nb. B ::= "x";','x');
 key(rr,'Enter');assert.equal(rr.run('availableActions(activeState(),game).length'),2);
 assert.match(rr.run('game.table.states[activeState().numbers.at(-1)].conflict'),/Reduce\/reduce/);
 key(rr,'ArrowRight');key(rr,'Enter');assert.equal(rr.run('activeState().stack[0].value'),'B');
 const invalid=setup('s. S ::= "x";','y');assert.equal(invalid.run('availableActions(activeState(),game).length'),0);assert.match(invalid.field('history').textContent,/ERROR/);
});
test('undo retains future, alternative action branches, and SAVE restores exact position and focus',()=>{
 const p=setup('s. S ::= A;\nt. S ::= B;\na. A ::= "x";\nb. B ::= "x";','x');
 key(p,'Enter');key(p,'Enter');key(p,'ArrowUp');
 assert.equal(p.run('game.cursor'),1);assert.equal(p.run('game.played.length'),2);
 assert.ok(p.field('history').children.some(c=>c.className.includes('future')));
 key(p,'ArrowRight');p.field('save').listeners.click();
 const url=new URL(p.field('url').value);assert.ok(p.field('url').selected);
 const restored=load(url.search);assert.equal(restored.run('game.cursor'),1);assert.equal(restored.run('game.played.length'),2);assert.equal(restored.run('selectedAction'),1);
 key(restored,'Enter');assert.equal(restored.run('game.played.length'),2);assert.equal(restored.run('activeState().stack[0].value'),'B');
});
test('grammar and input edits replay saved actions into errors and recover; whitespace preserves history',()=>{
 const p=setup('s. S ::= "x";','x');key(p,'Enter');const before=p.run('JSON.stringify(game.played)');
 p.edit('grammar',' s . S ::= "x" ; ');assert.equal(p.run('JSON.stringify(game.played)'),before);assert.equal(p.run('activeState().error'),undefined);
 p.edit('parser-input','y');assert.match(p.field('history').textContent,/ERROR/);
 p.edit('parser-input','x');assert.equal(p.run('activeState().error'),undefined);
 p.edit('grammar','broken');assert.equal(p.field('grammar').attributes['aria-invalid'],'true');assert.match(p.field('history').textContent,/ERROR/);
 p.edit('grammar','s. S ::= "x";');finish(p);
});
test('horizontal divider supports pointer and keyboard resizing with bounded percentages',()=>{
 const p=load(),game=p.field('game'),divider=p.field('table-divider');
 game.clientHeight=500;p.field('parse-table').offsetHeight=600;
 game.getBoundingClientRect=()=>({top:100,height:500});game.classList={add(){},remove(){}};divider.setPointerCapture=()=>{};
 p.run('globalThis.getComputedStyle = el => ({getPropertyValue:name=>el.style[name]||"60%"})');
 divider.listeners.pointerdown({button:0,pointerId:1,preventDefault(){}});
 divider.listeners.pointermove({clientY:350});assert.equal(game.style['--history-share'],'50%');divider.listeners.pointerup();
 divider.listeners.keydown({key:'ArrowUp',preventDefault(){}});assert.equal(game.style['--history-share'],'48%');
 divider.listeners.keydown({key:'End',preventDefault(){}});assert.equal(game.style['--history-share'],'98%');
});
test('every transition is the full advanced kernel and completed items become reductions',()=>{
 const p=load();
 assert.equal(p.run(`game.table.states.every(state => {
   const expected=state.items.filter(i=>i.d===game.grammar.rules[i.r].rhs.length).map(i=>i.r);
   if(JSON.stringify(expected)!==JSON.stringify(state.reductions))return false;
   return [...state.transitions.values()].every(t=>{
     const kernel=state.items.filter(i=>symbolKey(game.grammar.rules[i.r].rhs[i.d]||{})===symbolKey(t.symbol)).map(i=>({r:i.r,d:i.d+1}));
     return kernelKey(kernel)===kernelKey(game.table.states[t.to].kernel);
   });
 })`),true);
});
test('column splitter handles pointer dragging, keyboard resizing, and minimum widths',()=>{
  const page=load(),panels=page.field('panels'),divider=page.field('panel-divider');
  panels.getBoundingClientRect=()=>({left:100,width:1000});
  panels.style.setProperty=(name,value)=>{panels.style[name]=value};
  const classes=new Set();panels.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
  let capture;divider.setPointerCapture=id=>{capture=id};
  page.run("globalThis.getComputedStyle = el => ({getPropertyValue:name => el.style[name] || '38%'});");
  key(page,'Enter');
  let prevented=false;
  divider.listeners.pointerdown({button:0,pointerId:7,preventDefault(){prevented=true}});
  assert.ok(prevented);assert.equal(capture,7);assert.ok(classes.has('resizing'));assert.equal(page.run('document.activeElement'),divider);
  divider.listeners.pointermove({clientX:650});assert.ok(Math.abs(parseFloat(panels.style['--grammar-width'])-55)<1e-9);
  divider.listeners.pointermove({clientX:2000});assert.equal(divider.attributes['aria-valuenow'],'83');
  divider.listeners.pointerup();assert.ok(!classes.has('resizing'));
  divider.listeners.pointermove({clientX:200});assert.equal(divider.attributes['aria-valuenow'],'83');
  const resizeKey=key=>divider.listeners.keydown({key,preventDefault(){}});
  resizeKey('Home');assert.equal(divider.attributes['aria-valuenow'],'12');resizeKey('ArrowRight');assert.equal(divider.attributes['aria-valuenow'],'14');resizeKey('ArrowLeft');assert.equal(divider.attributes['aria-valuenow'],'12');resizeKey('End');assert.equal(divider.attributes['aria-valuenow'],'83');
  assert.equal(page.run('game.cursor'),1);assert.equal(page.run('game.played.length'),1);
});
test('action splitter supports dragging, keyboard input, and responsive proportions',()=>{
  const page=load(),history=page.field('history-panel'),states=page.field('states'),divider=page.field('action-divider');
  states.clientWidth=600;history.getBoundingClientRect=()=>({left:400,width:states.clientWidth});
  history.style.setProperty=(name,value)=>{history.style[name]=value};
  const classes=new Set();history.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
  divider.setPointerCapture=()=>{};
  page.run("globalThis.getComputedStyle = el => ({getPropertyValue:name => el.style[name] || (name === '--action-width' ? '86px' : '38%')});refreshActionSplit();");
  const width=()=>parseFloat(history.style['--action-width']);assert.ok(Math.abs(width()-86)<1e-9);
  key(page,'Enter');
  divider.listeners.pointerdown({button:0,pointerId:1,preventDefault(){}});
  divider.listeners.pointermove({clientX:790});divider.listeners.pointerup();
  assert.equal(divider.attributes['aria-valuenow'],'65');assert.ok(Math.abs(width()-210)<1e-9);assert.ok(!classes.has('resizing'));
  states.clientWidth=900;page.run('refreshActionSplit()');assert.ok(Math.abs(width()-315)<1e-9);
  divider.listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.ok(Math.abs(width()-297)<1e-9);
  divider.listeners.keydown({key:'End',preventDefault(){}});assert.ok(Math.abs(width()-54)<1e-9);
  states.clientWidth=150;page.run('refreshActionSplit()');assert.ok(width()>=37.5-1e-9);assert.ok(states.clientWidth-width()>=82.5-1e-9);
  states.clientWidth=900;page.run('refreshActionSplit()');assert.ok(Math.abs(width()-54)<1e-9);
  assert.equal(page.run('game.cursor'),1);assert.equal(page.run('game.played.length'),1);
});
test('reduction returns to the uncovered state and exposes only the separate goto cell',()=>{
 const p=setup('s. S ::= A "y";\na. A ::= "x";','xy');
 key(p,'Enter');assert.equal(p.field('initial-action').textContent,'shift');
 key(p,'Enter');
 assert.equal(p.run('JSON.stringify(activeState().numbers)'),'[0]');
 assert.equal(p.run('JSON.stringify(activeState().stack.map(s=>s.value))'),'["A"]');
 assert.equal(p.run('activeState().offset'),1);
 assert.equal(p.run('JSON.stringify(availableActions(activeState(),game).map(a=>a.id))'),'["g:A"]');
 const rows=p.field('parse-table').children[1].children;
 assert.equal(rows[0].attributes['aria-current'],'true');
 const gotoCell=rows[0].children.at(-1);
 assert.match(gotoCell.className,/available/);assert.match(gotoCell.children[0].className,/selected/);
 assert.equal(gotoCell.children[0].attributes['aria-label'],'Goto A');
 p.field('save').listeners.click();const restored=load(new URL(p.field('url').value).search);
 assert.equal(restored.run('availableActions(activeState(),game)[0].type'),'goto');
 key(restored,' ');assert.equal(restored.run('activeState().numbers.length'),2);
 assert.equal(restored.run('activeState().offset'),1);assert.equal(restored.run('activeState().stack.length'),1);
 assert.match(restored.field('history').textContent,/goto A/);
 key(restored,'ArrowUp');assert.equal(restored.run('availableActions(activeState(),game)[0].type'),'goto');
 key(restored,'ArrowDown');assert.equal(restored.run('availableActions(activeState(),game)[0].type'),'shift');
 finish(restored);
});
test('entrypoint goto is also explicit when the unaugmented table contains one',()=>{
 const p=setup('p. S ::= S "+" T;\ns. S ::= T;\nt. T ::= "x";','x');
 key(p,'Enter');key(p,'Enter');key(p,'Enter');key(p,'Enter');
 assert.equal(p.run('activeState().stack[0].value'),'S');
 assert.equal(p.run('accepted(activeState(),game)'),false);
 assert.equal(p.run('availableActions(activeState(),game)[0].id'),'g:S');
 key(p,'Enter');assert.equal(p.run('accepted(activeState(),game)'),true);
});
test('table values keep identical element types and text as focus and parser actions change',()=>{
 const p=load();
 function layoutContent() {
  return p.field('parse-table').children[1].children.map(row=>row.children.slice(1).map(cell=>
   cell.children.map(node=>[node.tagName,node.textContent])));
 }
 const before=layoutContent();key(p,'Enter');assert.deepEqual(layoutContent(),before);
 key(p,'Enter');assert.deepEqual(layoutContent(),before);
 key(p,'Enter');assert.deepEqual(layoutContent(),before);
 key(p,'ArrowRight');assert.deepEqual(layoutContent(),before);
});
test('history labels reductions and shows green accept only when no reduce or goto remains',()=>{
 const p=setup('s. S ::= "x";','x');finish(p);
 const rows=p.field('history').children;
 assert.equal(rows[0].children[1].textContent,'red s');
 assert.equal(rows.at(-1).children[1].textContent,'accept');
 assert.match(rows.at(-1).children[1].className,/accept-action/);
 key(p,'ArrowUp');assert.ok(!p.field('history').children.find(row=>row.className.includes('current')).children[1].className.includes('accept-action'));
 const q=setup('s. S ::= S;\nx. S ::= "x";','x');
 key(q,'Enter');key(q,'Enter');
 assert.equal(q.run('availableActions(activeState(),game)[0].type'),'goto');
 assert.equal(q.run('accepted(activeState(),game)'),false);
 key(q,'Enter');
 assert.equal(q.run('availableActions(activeState(),game)[0].type'),'reduce');
 assert.equal(q.run('accepted(activeState(),game)'),false);
 assert.ok(!q.field('history').children.at(-1).children[1].className.includes('accept-action'));
});
test('table initially fits its contents up to 60%, and window resizing caps unused space',()=>{
 const p=load(),game=p.field('game'),table=p.field('parse-table'),scroll=p.field('table-scroll');
 game.clientHeight=1000;table.offsetHeight=399;scroll.offsetHeight=scroll.clientHeight=400;
 p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'60%');
 // Larger windows give the extra space to grammar and history, keeping all table rows visible.
 game.clientHeight=2000;p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'80%');
 // Smaller windows cap the initial table at 60% and allow scrolling.
 game.clientHeight=500;p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'40%');
 p.run('setTableSplit(70)');assert.equal(game.style['--history-share'],'70%');
 game.clientHeight=1000;p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'70%');
 game.clientHeight=2000;p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'80%');
 // Include horizontal scrollbar thickness when fitting the table.
 scroll.offsetHeight=415;p.run('fitTableHeight()');assert.equal(game.style['--history-share'],'79.25%');
});
