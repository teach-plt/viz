const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../shift-red2.html'),'utf8');
const script=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
function load(search='') {
  const elements=new Map();let document;
  class Element {
    constructor(){this.children=[];this.style={};this.attributes={};this.listeners={};this.className='';this.value='';this.scrollTop=0;this.scrollLeft=0;this.offsetTop=0;this.offsetHeight=38;this.clientHeight=344;this.selectionStart=this.selectionEnd=0;this.text='';}
    set textContent(value){this.text=value;this.children=[]}get textContent(){return this.text+this.children.map(c=>c.textContent).join('')}
    append(...items){for(const item of items){if(item.fragment)this.append(...item.children);else this.children.push(item)}}
    replaceChildren(...items){this.children=[];this.text='';this.append(...items)}
    setAttribute(k,v){this.attributes[k]=v}addEventListener(k,v){this.listeners[k]=v}
    focus(){document.activeElement=this}select(){this.selected=true}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}
  }
  document={activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement(){return new Element()},createTextNode(text){return Object.assign(new Element(),{textContent:text})},createDocumentFragment(){return Object.assign(new Element(),{fragment:true})}};
  const context=vm.createContext({document,URL,URLSearchParams,location:{search,href:'file:///test/shift-red2.html'+search}});
  vm.runInContext(script,context);
  return {field:id=>elements.get(id),run:code=>vm.runInContext(code,context),edit(id,text){const field=elements.get(id);field.focus();field.value=text;field.selectionStart=field.selectionEnd=text.length;field.listeners.input();return field.value},available(){return elements.get('grammar-highlight').children.filter(c=>c.className==='grammar-rule available').map(c=>c.children[0].textContent)}};
}
test('compact page defaults, action focus, available LBNF labels, and space shortcut',()=>{
  const page=load();assert.equal(page.field('grammar').value,page.run('DEFAULT_GRAMMAR'));assert.equal(page.field('parser-input').value,page.run('DEFAULT_INPUT'));
  assert.deepEqual(page.available(),[]);assert.equal(page.run('document.activeElement'),page.field('user-input'));
  page.edit('user-input','.');assert.deepEqual(page.available(),['x']);
  assert.equal(page.edit('user-input','. '),'.x');assert.deepEqual(page.available(),['a']);
  assert.equal(page.edit('user-input','.x '),'.xa');assert.deepEqual(page.available(),['f']);
  assert.ok(!html.includes('id="start"'));assert.ok(!html.includes('id="clear"'));assert.ok(!html.includes('id="input"'));
});
test('grammar display preserves formatting, comments, quoted punctuation, and rule ranges',()=>{
  const page=load();const grammar='-- keep this\nfirst . S ::=\n  "x;" ;\n\nnext. S ::= "y"; /* keep this too */\n';
  page.edit('grammar',grammar);assert.equal(page.field('grammar-highlight').textContent,grammar+'\n');
  page.edit('parser-input','x;');page.edit('user-input','.');assert.deepEqual(page.available(),['first']);
  const span=page.field('grammar-highlight').children.find(c=>c.className==='grammar-rule available');
  assert.equal(span.children[0].textContent,'first');assert.equal(span.textContent,'first . S ::=\n  "x;" ;');
});
test('whitespace edits keep actions and undo history; semantic edits replay them into ERROR',()=>{
  const page=load();page.edit('user-input','.xa..');page.edit('user-input','.xa');
  const before=page.run('game.played');const grammar=page.field('grammar').value;
  page.edit('grammar','\n  '+grammar.replaceAll('::=','  ::=  ')+'\n');
  assert.equal(page.field('user-input').value,'.xa');assert.equal(page.run('game.played'),before);assert.equal(page.field('user-input').attributes['aria-invalid'],'false');
  assert.equal(page.field('history').children.filter(c=>c.className.includes('future')).length,2);
  page.edit('grammar',grammar.replace('x. A ::= "x";','x. A ::= "z";'));
  assert.equal(page.field('user-input').value,'.xa');assert.equal(page.field('user-input').attributes['aria-invalid'],'true');assert.match(page.field('history').textContent,/ERROR/);
  page.edit('grammar',grammar);assert.equal(page.field('user-input').attributes['aria-invalid'],'false');assert.deepEqual(page.available(),['f']);
});
test('parser input edits replay actions and preserve field focus and saved history',()=>{
  const page=load();page.edit('user-input','.xa');
  const field=page.field('parser-input');page.edit('parser-input','y');assert.equal(page.run('game.current'),'.xa');assert.equal(page.run('game.played'),'.xa');
  assert.equal(page.field('user-input').attributes['aria-invalid'],'true');assert.equal(page.run('document.activeElement'),field);
  page.edit('parser-input','x');assert.equal(page.field('user-input').attributes['aria-invalid'],'false');
  page.edit('user-input','.xaf');assert.equal(page.field('status').textContent,'Accepted · parse complete');
});
test('invalid grammars show ERROR, remain editable, and recover without clearing actions',()=>{
  const page=load();page.edit('user-input','.xa');const grammar=page.field('grammar').value;
  page.edit('grammar','bad grammar');assert.equal(page.field('grammar').attributes['aria-invalid'],'true');assert.match(page.field('history').textContent,/ERROR/);assert.deepEqual(page.available(),[]);
  page.edit('user-input','.');assert.equal(page.run('game.current'),'.');
  page.edit('grammar',grammar);assert.equal(page.field('grammar').attributes['aria-invalid'],'false');assert.deepEqual(page.available(),['x']);
});
test('SAVE round-trips inline edits, actions, undone future, and invalid grammars',()=>{
  const page=load();page.edit('parser-input','x+y');page.edit('user-input','.xa..');page.edit('user-input','.xa');
  page.field('save').listeners.click();assert.ok(page.field('url').selected);
  const url=new URL(page.field('url').value);assert.equal(url.pathname,'/test/shift-red2.html');assert.equal(url.searchParams.get('played'),'.xa..');assert.equal(url.searchParams.get('user-input'),'.xa');assert.equal(url.searchParams.get('input'),'x+y');
  const restored=load(url.search);assert.equal(restored.run('game.played'),'.xa..');assert.equal(restored.run('game.current'),'.xa');assert.equal(restored.field('history').children.filter(c=>c.className.includes('future')).length,2);
  page.edit('grammar','bad grammar');page.field('save').listeners.click();const invalid=load(new URL(page.field('url').value).search);assert.match(invalid.field('history').textContent,/ERROR/);assert.equal(invalid.run('game.current'),'.xa');
});
test('column splitter handles pointer dragging, keyboard resizing, and minimum widths',()=>{
  const page=load(),panels=page.field('panels'),divider=page.field('panel-divider');
  panels.getBoundingClientRect=()=>({left:100,width:1000});
  panels.style.setProperty=(name,value)=>{panels.style[name]=value};
  const classes=new Set();panels.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
  let capture;divider.setPointerCapture=id=>{capture=id};
  page.run("globalThis.getComputedStyle = el => ({getPropertyValue:name => el.style[name] || '38%'});");
  page.edit('user-input','.xa');
  let prevented=false;
  divider.listeners.pointerdown({button:0,pointerId:7,preventDefault(){prevented=true}});
  assert.ok(prevented);assert.equal(capture,7);assert.ok(classes.has('resizing'));assert.equal(page.run('document.activeElement'),divider);
  divider.listeners.pointermove({clientX:650});assert.ok(Math.abs(parseFloat(panels.style['--grammar-width'])-55)<1e-9);
  divider.listeners.pointermove({clientX:2000});assert.equal(divider.attributes['aria-valuenow'],'83');
  divider.listeners.pointerup();assert.ok(!classes.has('resizing'));
  divider.listeners.pointermove({clientX:200});assert.equal(divider.attributes['aria-valuenow'],'83');
  const key=key=>divider.listeners.keydown({key,preventDefault(){}});
  key('Home');assert.equal(divider.attributes['aria-valuenow'],'12');key('ArrowRight');assert.equal(divider.attributes['aria-valuenow'],'14');key('ArrowLeft');assert.equal(divider.attributes['aria-valuenow'],'12');key('End');assert.equal(divider.attributes['aria-valuenow'],'83');
  assert.equal(page.run('game.current'),'.xa');assert.equal(page.run('game.played'),'.xa');
});
