const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname,'../lr-gen.html'),'utf8');
const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({});
vm.runInContext(script.split('// UI:')[0] + ';globalThis.L = LR0;',context);
const L = context.L;
const plain = value => JSON.parse(JSON.stringify(value));
const texts = model => plain(L.available(model).map(L.actionText));
function step(model,text) { const action = L.available(model).find(a => L.actionText(a) === text); assert.ok(action, `Available: ${text}`); return L.apply(model,action); }
function finish(grammar,pick = () => 0) {
  const model = L.initial(grammar), steps = [];
  for (let i=0; i<1000; i++) {
    const actions = L.available(model);
    if (!actions.length) return {model,steps};
    const action = actions[pick(actions.length,i)]; steps.push(L.actionText(action)); L.apply(model,action);
  }
  assert.fail('Construction failed to terminate');
}
const exampleSteps = ['0 expand E','0 expand T','0 goto E','1 shift $','2 reduce accept','1 shift +','3 expand T','3 goto T','4 reduce EP','3 shift Integer','5 reduce TI','0 goto T','6 reduce ET','0 shift Integer'];
test('default grammar, column order, and the exact example step sequence',() => {
  const grammar = L.parseGrammar(L.DEFAULT_GRAMMAR);
  assert.deepEqual(plain(grammar.terminals.map(s=>s.value)),['$','+','Integer']);
  assert.deepEqual(plain(grammar.nonterminals.map(s=>s.value)),['E','T']);
  assert.deepEqual(texts(L.initial(grammar)),['0 expand E']);
  const {model,steps} = finish(grammar);
  assert.deepEqual(steps,exampleSteps); assert.equal(model.states.length,7);
  assert.equal(model.states[0].transitions.get(grammar.terminals[2].key).to,5);
  assert.equal(model.states[3].transitions.get(grammar.terminals[2].key).to,5);
  assert.ok(model.states.every(s=>!L.conflict(model,s)));
});
test('expansion gates gotos and cannot omit delayed kernel items',() => {
  const grammar=L.parseGrammar('s. S ::= A; ax. A ::= "x"; ab. A ::= B; bx. B ::= "x";');
  const model=L.initial(grammar); step(model,'0 expand S');step(model,'0 expand A');
  assert.ok(!texts(model).includes('0 shift x'));
  step(model,'0 expand B');assert.ok(texts(model).includes('0 shift x'));
  step(model,'0 shift x');assert.equal(model.states[1].kernel.length,2);
});
test('incomplete and complete kernels are not conflated',() => {
  const grammar=L.parseGrammar('p. E ::= E "+" E; n. E ::= Integer;');
  const {model}=finish(grammar);
  const afterE=model.states.filter(s=>s.kernel.some(i=>i.r===1&&i.d===1));
  assert.equal(afterE.length,2);assert.notEqual(afterE[0].key,afterE[1].key);
});
test('nullable closure, cycles, and conflicts terminate correctly',() => {
  for(const source of ['s. S ::= A; a. A ::= ; b. A ::= "x";', 's. S ::= A; a. A ::= B; b. B ::= A; e. B ::= ;']) {
    const {model}=finish(L.parseGrammar(source));assert.deepEqual(texts(model),[]);
    for(const state of model.states) assert.equal(new Set(state.items.map(i=>`${i.r}:${i.d}`)).size,state.items.length);
  }
  const rr=finish(L.parseGrammar('a. S ::= A; b. S ::= B; ax. A ::= "x"; bx. B ::= "x";')).model;
  assert.ok(rr.states.some(s=>L.conflict(rr,s)==='Reduce/reduce conflict'));
  const sr=finish(L.parseGrammar('p. E ::= E "+" E; n. E ::= Integer;')).model;
  assert.ok(sr.states.some(s=>L.conflict(sr,s)==='Shift/reduce conflict'));
});
test('all action orders yield canonical complete LR(0) closures and transitions',() => {
  const grammar=L.parseGrammar('s. S ::= C C; c. C ::= "c" C; d. C ::= "d";');
  const key=items=>items.map(i=>`${i.r}:${i.d}`).sort().join('|');
  function closure(kernel) {
    const result=kernel.map(i=>({...i})),seen=new Set(result.map(i=>`${i.r}:${i.d}`));
    for(let j=0;j<result.length;j++) {
      const symbol=grammar.rules[result[j].r].rhs[result[j].d];
      if(symbol?.kind==='n') grammar.rules.forEach((rule,r)=>{const k=`${r}:0`;if(rule.lhs===symbol.value&&!seen.has(k)){seen.add(k);result.push({r,d:0})}});
    }
    return result;
  }
  const canonical=[closure([{r:0,d:0}])],edges=[];
  for(let i=0;i<canonical.length;i++) {
    const symbols=new Map(canonical[i].map(it=>grammar.rules[it.r].rhs[it.d]).filter(Boolean).map(s=>[s.key,s]));
    for(const symbol of symbols.values()) {
      const target=closure(canonical[i].filter(it=>grammar.rules[it.r].rhs[it.d]?.key===symbol.key).map(it=>({r:it.r,d:it.d+1})));
      let index=canonical.findIndex(items=>key(items)===key(target));
      if(index<0){index=canonical.length;canonical.push(target)}
      edges.push(`${key(canonical[i])} > ${symbol.key} > ${key(target)}`);
    }
  }
  for(const seed of [1,42,2026]) {
    let random=seed;
    const {model}=finish(grammar,n=>{random=(random*1664525+1013904223)>>>0;return random%n});
    assert.deepEqual(plain(model.states.map(s=>key(s.items)).sort()),canonical.map(key).sort());
    const actual=model.states.flatMap(s=>[...s.transitions.values()].map(t=>`${key(s.items)} > ${t.symbol.key} > ${key(model.states[t.to].items)}`));
    assert.deepEqual(plain(actual.sort()),edges.sort());
  }
});
test('URL steps reconstruct the exact confirmed prefix and reject illegal actions',() => {
  const grammar=L.parseGrammar(L.DEFAULT_GRAMMAR), params=new URLSearchParams();
  params.set('grammar',L.DEFAULT_GRAMMAR);params.set('steps',JSON.stringify(exampleSteps.slice(0,9)));
  const restored=L.replay(L.parseGrammar(params.get('grammar')),JSON.parse(params.get('steps')));
  assert.equal(restored.states.length,5);assert.equal(restored.step,9);
  assert.equal(texts(restored)[0],'3 shift Integer');
  assert.throws(()=>L.replay(grammar,['0 shift Integer']),/Invalid step/);
});
test('grammar comments, punctuation, builtins, entrypoints, and reserved names',() => {
  const grammar=L.parseGrammar('/* comment */ entrypoints E; accept. Start ::= E; e. E ::= ";" String; -- comment');
  assert.equal(grammar.rules[0].lhs,"Start'");assert.equal(grammar.rules[0].label,"accept'");
  assert.equal(grammar.rules[0].rhs[0].value,'E');
  assert.deepEqual(plain(grammar.terminals.map(s=>s.value)),['$',';','String']);
  assert.throws(()=>L.parseGrammar('bad. S ::= Missing;'),/no production/);
});
test('new nodes grow below their source and avoid existing or dragged rectangles',() => {
  const root={...L.placeNode(180,150,null,[]),width:180,height:150};
  assert.equal(root.x,90);assert.equal(root.y,75);
  const child={...L.placeNode(200,130,root,[root]),width:200,height:130};
  assert.ok(child.y-child.height/2>root.y+root.height/2);
  assert.equal(child.x-child.width/2,root.x-root.width/2);
  const occupied=[root,child],before=JSON.stringify(occupied);
  const sibling=L.placeNode(190,120,root,occupied);
  assert.ok(sibling.x-95>child.x+child.width/2);
  assert.equal(JSON.stringify(occupied),before);
  const dragged={x:500,y:600,width:240,height:160};
  const later=L.placeNode(180,110,dragged,[root,child,dragged]);
  assert.ok(later.y-55>dragged.y+dragged.height/2);
  assert.equal(later.x-90,dragged.x-dragged.width/2);
});
test('both conflict types are reported for states that have both',() => {
  const {model}=finish(L.parseGrammar('a. S ::= A; b. S ::= B; emptyA. A ::= ; emptyB. B ::= ; x. B ::= "x";'));
  assert.match(L.conflict(model,model.states[0]),/Reduce\/reduce conflict/);
  assert.match(L.conflict(model,model.states[0]),/Shift\/reduce conflict/);
});
test('graph updates preserve node positions, reserved sizes, viewport, and edge routes',() => {
  const cytoscape=require('../vendor/cytoscape.min.js');
  const graph=cytoscape({headless:true,elements:[],zoom:1,pan:{x:28,y:28},layout:{name:'preset',fit:false}});
  const graphContext=vm.createContext({graph});
  const renderGraph=script.slice(script.indexOf('function renderGraph() {'),script.indexOf('\nfunction render(focus'));
  vm.runInContext(script.split('// UI:')[0]+`;let cy=graph,grammar=LR0.parseGrammar(LR0.DEFAULT_GRAMMAR),history=[],cursor=0,current,full;
    const $=()=>({setAttribute(){}});${renderGraph}
    function update(steps){history=steps;cursor=steps.length;current=LR0.replay(grammar,steps);full=LR0.replay(grammar,steps);renderGraph();}`,graphContext);
  const update=steps=>vm.runInContext(`update(${JSON.stringify(steps)})`,graphContext);
  update([]);
  const initialPosition={...graph.getElementById('s0').position()},initialWidth=graph.getElementById('s0').data('width'),initialHeight=graph.getElementById('s0').data('height');
  update(exampleSteps.slice(0,3));
  assert.deepEqual(plain(graph.getElementById('s0').position()),initialPosition);
  assert.equal(graph.getElementById('s0').data('width'),initialWidth);assert.equal(graph.getElementById('s0').data('height'),initialHeight);
  graph.getElementById('s1').position({x:620,y:510});graph.pan({x:-40,y:-20});graph.zoom(.8);
  const positions=new Map(graph.nodes().map(n=>[n.id(),{...n.position()}]));
  const bends=new Map(graph.edges().map(e=>[e.id(),e.data('bend')]));
  update(exampleSteps.slice(0,10));
  for(const [id,position] of positions) assert.deepEqual(plain(graph.getElementById(id).position()),position);
  for(const [id,bend] of bends) assert.equal(graph.getElementById(id).data('bend'),bend);
  assert.deepEqual(graph.pan(),{x:-40,y:-20});assert.equal(graph.zoom(),.8);
  update(exampleSteps);
  assert.equal(graph.nodes().length,7);
  for(const [id,position] of positions) assert.deepEqual(plain(graph.getElementById(id).position()),position);
  // Undo changes appearance only, including the retained future graph.
  const allPositions=graph.nodes().map(n=>({...n.position()}));
  vm.runInContext('cursor=3;current=LR0.replay(grammar,history.slice(0,cursor));renderGraph();',graphContext);
  assert.deepEqual(graph.nodes().map(n=>({...n.position()})),allPositions);
  graph.destroy();
});
// Exercise URL preferences and the DOM output without requiring a browser.
function loadPage(search='') {
  const elements=new Map();let document;
  class Element {
    constructor(tag='div') {this.tagName=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};this.value='';this.className='';this.hidden=true;this.offsetTop=0;this.offsetHeight=34;this.offsetWidth=240;this.clientHeight=440;this.scrollTop=0;this.selectionStart=0;
      this.classList={add:name=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),name])].join(' ')},remove:name=>{this.className=this.className.split(' ').filter(n=>n!==name).join(' ')},contains:name=>this.className.split(' ').includes(name)};
    }
    append(...items){for(const child of items){if(child.fragment){this.append(...child.children)}else{child.parentElement=this;this.children.push(child)}}}
    replaceChildren(...items){this.children=[];this.append(...items)}
    setAttribute(name,value){this.attributes[name]=value}
    addEventListener(name,fn){this.listeners[name]=fn}
    focus(){document.activeElement=this}select(){}setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}
    closest(selector){return selector==='.step-row'?(this.className.split(' ').includes('step-row')?this:this.parentElement?.closest(selector)):null}
    getBoundingClientRect(){return {left:20,top:20,bottom:54}}
  }
  document={activeElement:null,getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element(),{textContent:text}),createDocumentFragment:()=>Object.assign(new Element(),{fragment:true}),addEventListener(){}};
  const page=vm.createContext({document,window:{innerWidth:1000,innerHeight:800,addEventListener(){}},location:{search,href:'file:///lr-gen.html'+search},URL,URLSearchParams});
  vm.runInContext(script,page);
  return {get:id=>elements.get(id),run:code=>vm.runInContext(code,page)};
}
test('tooltips default on, switch off globally, and survive URL save/restore',() => {
  const page=loadPage(),host=page.get('steps-heading');host.dataset.tooltip='Keyboard help';
  assert.equal(page.get('tooltips').attributes['aria-pressed'],'true');
  page.run("showTooltip($('steps-heading'))");assert.equal(page.get('tooltip').hidden,false);
  page.get('tooltips').listeners.click();assert.equal(page.get('tooltip').hidden,true);
  page.run("showTooltip($('steps-heading'))");assert.equal(page.get('tooltip').hidden,true);
  page.get('save').listeners.click();
  const saved=new URL(page.get('url').value);assert.equal(saved.searchParams.get('tooltips'),'off');
  const restored=loadPage(saved.search);assert.equal(restored.get('tooltips').attributes['aria-pressed'],'false');
  for(const value of ['0','false','off']) assert.equal(loadPage('?tooltips='+value).get('tooltips').attributes['aria-pressed'],'false');
});
test('compact table has hover explanations and grammar errors mark the heading',() => {
  const page=loadPage();
  const headings=page.get('parse-table').children[0].children[0].children;
  assert.deepEqual(headings.map(h=>h.textContent),['State','Reduce','$','+','Integer','E','T']);
  assert.equal(headings[1].dataset.tooltip,'Parser reduces with given rule');
  assert.equal(headings[3].dataset.tooltip,'Parser shifts token + and enters given state');
  assert.equal(headings[5].dataset.tooltip,'Parser completed E and enters given state');
  assert.equal(page.get('step-list').children[0].dataset.tooltip,'Add parse items for non-terminal E to state 0');
  page.get('grammar').value='bad grammar';page.get('grammar').listeners.input();
  assert.ok(page.get('grammar-heading').classList.contains('invalid'));
  assert.equal(page.get('grammar-heading').textContent,'ERROR IN LBNF GRAMMAR');
  page.get('grammar').value='n. E ::= Integer;';page.get('grammar').listeners.input();
  assert.ok(!page.get('grammar-heading').classList.contains('invalid'));
  assert.equal(page.get('grammar-heading').textContent,'LBNF GRAMMAR');
  page.run('readGrammar();render();confirm();confirm();confirm();confirm();');
  const rows=page.get('parse-table').children[1].children;
  const accept=rows.flatMap(row=>row.children[1].children).find(span=>span.textContent==='accept');
  assert.ok(accept);assert.equal(accept.dataset.tooltip,'Parsing finished successfully');
});
