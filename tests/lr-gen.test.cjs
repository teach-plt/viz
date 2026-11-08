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
