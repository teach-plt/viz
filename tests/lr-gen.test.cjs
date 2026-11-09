const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname,'../lr-gen.html'),'utf8');
const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
const L = require('../lr-core.js');
const Layout = require('../lr-layout.js');
const ELK = require('../vendor/elk.bundled.js');
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
test('both conflict types are reported for states that have both',() => {
  const {model}=finish(L.parseGrammar('a. S ::= A; b. S ::= B; emptyA. A ::= ; emptyB. B ::= ; x. B ::= "x";'));
  assert.match(L.conflict(model,model.states[0]),/Reduce\/reduce conflict/);
  assert.match(L.conflict(model,model.states[0]),/Shift\/reduce conflict/);
});
test('graph updates preserve planned positions, manual overrides, viewport, and routes',async () => {
  const cytoscape=require('../vendor/cytoscape.min.js');
  const graph=cytoscape({headless:true,elements:[],zoom:1,pan:{x:28,y:28},layout:{name:'preset',fit:false}});
  const layoutPlan=await Layout.plan(L,await L.canonical(L.parseGrammar(L.DEFAULT_GRAMMAR)),ELK,{width:1000,height:440});
  const graphContext=vm.createContext({graph,LR0:L,LRLayout:Layout,layoutPlan,manualPositions:new Map()});
  const renderGraph=script.slice(script.indexOf('function renderGraph() {'),script.indexOf('\nfunction render(focus'));
  vm.runInContext(`let cy=graph,grammar=LR0.parseGrammar(LR0.DEFAULT_GRAMMAR),history=[],cursor=0,current,full;
    const $=()=>({setAttribute(){}});${renderGraph}
    function update(steps){history=steps;cursor=steps.length;current=LR0.replay(grammar,steps);full=LR0.replay(grammar,steps);renderGraph();}`,graphContext);
  const update=steps=>vm.runInContext(`update(${JSON.stringify(steps)})`,graphContext);
  update([]);
  const initialPosition={...graph.getElementById('s0').position()},initialWidth=graph.getElementById('s0').data('width'),initialHeight=graph.getElementById('s0').data('height');
  update(exampleSteps.slice(0,3));
  assert.deepEqual(plain(graph.getElementById('s0').position()),initialPosition);
  assert.equal(graph.getElementById('s0').data('width'),initialWidth);assert.equal(graph.getElementById('s0').data('height'),initialHeight);
  graph.getElementById('s1').position({x:620,y:510});
  graphContext.manualPositions.set(graph.getElementById('s1').data('kernel'),{x:620,y:510});graph.pan({x:-40,y:-20});graph.zoom(.8);
  const positions=new Map(graph.nodes().map(n=>[n.id(),{...n.position()}]));
  const routes=new Map(graph.edges().map(e=>[e.id(),e.data('routeKey')]));
  update(exampleSteps.slice(0,10));
  for(const [id,position] of positions) assert.deepEqual(plain(graph.getElementById(id).position()),position);
  for(const [id,route] of routes) assert.equal(graph.getElementById(id).data('routeKey'),route);
  assert.deepEqual(graph.pan(),{x:-40,y:-20});assert.equal(graph.zoom(),.8);
  update(exampleSteps);
  assert.equal(graph.nodes().length,7);
  for(const [id,position] of positions) assert.deepEqual(plain(graph.getElementById(id).position()),position);
  // Undo changes appearance only, including the retained future graph.
  const allPositions=graph.nodes().map(n=>({...n.position()}));
  vm.runInContext('cursor=3;current=LR0.replay(grammar,history.slice(0,cursor));renderGraph();',graphContext);
  assert.deepEqual(graph.nodes().map(n=>({...n.position()})),allPositions);
  // A different construction numbers the same item sets differently. The
  // dragged state's position must follow its item-set key, not the old number.
  const alternative=L.replay(L.parseGrammar(L.DEFAULT_GRAMMAR),exampleSteps.slice(0,2));
  const alternateSteps=exampleSteps.slice(0,2);step(alternative,'0 shift Integer');alternateSteps.push('0 shift Integer');
  while(L.available(alternative).length){const action=L.available(alternative)[0];alternateSteps.push(L.actionText(action));L.apply(alternative,action)}
  const movedKey=graph.getElementById('s1').data('kernel');
  update(alternateSteps);
  const renumbered=graph.nodes().filter(n=>n.data('kernel')===movedKey);
  assert.notEqual(renumbered.id(),'s1');assert.deepEqual(plain(renumbered.position()),{x:620,y:510});
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
  const page=vm.createContext({LR0:L,LRLayout:Layout,document,window:{innerWidth:1000,innerHeight:800,addEventListener(){}},location:{search,href:'file:///lr-gen.html'+search},URL,URLSearchParams});
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
test('canonical pre-planning includes exactly the final graph under different action orders',async () => {
  const grammar=L.parseGrammar('s. S ::= C C; c. C ::= "c" C; d. C ::= "d";');
  const canonical=await L.canonical(grammar);
  const edges=model=>model.states.flatMap(state=>[...state.transitions.values()].map(t=>Layout.edgeKey(state.key,t.symbol.key,model.states[t.to].key))).sort();
  for(const pick of [()=>0,n=>n-1]) {
    const {model}=finish(grammar,pick);
    assert.deepEqual(model.states.map(s=>s.key).sort(),canonical.states.map(s=>s.key).sort());
    assert.deepEqual(edges(model),edges(canonical));
  }
});
test('ELK plans reserve every state and route, fit the viewport, and anchor the initial state',async () => {
  for(const source of [L.DEFAULT_GRAMMAR,'p. E ::= E "+" E; n. E ::= Integer;','a. S ::= A; b. S ::= B; ax. A ::= "x"; bx. B ::= "x";','s. S ::= A; a. A ::= ; b. A ::= "x" A;']) {
    const model=await L.canonical(L.parseGrammar(source));
    const plan=await Layout.plan(L,model,ELK,{width:950,height:440});
    assert.equal(plan.nodes.size,model.states.length);
    assert.equal(plan.edges.size,model.states.reduce((sum,s)=>sum+s.transitions.size,0));
    const nodes=[...plan.nodes.values()];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
      const a=nodes[i],b=nodes[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2,'No overlapping final rectangles');
    }
    const initial=plan.nodes.get('0:0'); assert.equal(initial.x-initial.width/2,12);assert.equal(initial.y-initial.height/2,12);
    for(const route of plan.edges.values()) {assert.ok(route.points.length>=2);assert.ok(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.ok(Number.isFinite(route.labelPosition.x));}
    const view=Layout.fit(plan.bounds,950,440);assert.ok(plan.bounds.width*view.zoom<=950);assert.ok(plan.bounds.height*view.zoom<=440);
  }
});
test('manual offsets affect incident routes only, and planning is cancellable',async () => {
  const model=await L.canonical(L.parseGrammar(L.DEFAULT_GRAMMAR));
  const plan=await Layout.plan(L,model,ELK,{width:950,height:440});
  const moved=model.states[1].key, node=plan.nodes.get(moved), positions=new Map([[moved,{x:node.x+80,y:node.y+55}]]);
  for(const route of plan.edges.values()) {
    const before=Layout.edgeGeometry(route,plan.nodes,new Map()),after=Layout.edgeGeometry(route,plan.nodes,positions);
    if(route.from!==moved&&route.to!==moved)assert.deepEqual(after,before);
    if(route.from===moved){assert.equal(after.points[0].x,before.points[0].x+80);assert.equal(after.points[0].y,before.points[0].y+55)}
    if(route.to===moved){assert.equal(after.points.at(-1).x,before.points.at(-1).x+80);assert.equal(after.points.at(-1).y,before.points.at(-1).y+55)}
  }
  assert.equal(await Layout.plan(L,model,ELK,{width:950,height:440},()=>true),null);
});
