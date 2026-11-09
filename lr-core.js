'use strict';
const LR0 = (() => {
const DEFAULT_GRAMMAR = `EP. E ::= E "+" T;
ET. E ::= T;
TI. T ::= Integer;`;
function readProductions(source) {
  const tokens = [];
  let i = 0;
  const fail = message => { throw new Error(`Grammar: ${message} (near character ${i + 1}).`); };
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source.startsWith('--', i) || source.startsWith('//', i)) { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (source.startsWith('/*', i) || source.startsWith('{-', i)) {
      const close = source.startsWith('/*', i) ? '*/' : '-}';
      const end = source.indexOf(close, i + 2);
      if (end < 0) fail('unclosed comment');
      i = end + 2; continue;
    }
    if (source[i] === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') { if (source[i] === '\\') i++; i++; }
      if (i >= source.length) fail('unclosed terminal');
      let value;
      try { value = JSON.parse(source.slice(start, ++i)); } catch { fail('invalid quoted terminal'); }
      if (!value) fail('empty terminals are not allowed; use an empty right-hand side');
      tokens.push({kind:'terminal', value}); continue;
    }
    if (source.startsWith('::=', i)) { tokens.push({kind:'::='}); i += 3; continue; }
    if ('.;[]'.includes(source[i])) { tokens.push({kind:source[i++]}); continue; }
    const word = /^[\p{L}_][\p{L}\p{N}_'-]*/u.exec(source.slice(i));
    if (!word) fail(`unexpected ${JSON.stringify(source[i])}`);
    tokens.push({kind:'word', value:word[0]}); i += word[0].length;
  }
  let p = 0;
  function take(kind) { const t = tokens[p++]; if (!t || t.kind !== kind) throw new Error(`Grammar: expected ${kind} near ${tokens[p - 1]?.value || tokens[p - 1]?.kind || 'end of grammar'}.`); return t; }
  function category() { if (tokens[p]?.kind === '[') { p++; const name = '[' + category() + ']'; take(']'); return name; } return take('word').value; }
  const rules = [], labels = new Set();
  let entry = null;
  while (p < tokens.length) {
    if (tokens[p].value === 'entrypoints' && tokens[p + 1]?.kind !== '.') { p++; entry = category(); take(';'); continue; }
    const label = take('word').value; take('.');
    const lhs = category(); take('::=');
    const rhs = [];
    while (tokens[p] && tokens[p].kind !== ';') rhs.push(tokens[p].kind === 'terminal' ? tokens[p++] : {kind:'category', value:category()});
    take(';');
    if (labels.has(label)) throw new Error(`Grammar: duplicate action label “${label}”. Give each production a unique label.`);
    labels.add(label); rules.push({label,lhs,rhs});
  }
  if (!rules.length) throw new Error('Grammar: enter at least one labelled production.');
  const categories = new Set(rules.map(r => r.lhs));
  const builtins = new Set(['Ident','Integer','Double','String','Char']);
  for (const r of rules) for (const symbol of r.rhs) if (symbol.kind === 'category' && !categories.has(symbol.value) && !builtins.has(symbol.value)) throw new Error(`Grammar: category “${symbol.value}” has no production. Use quotes for a terminal. Custom token declarations and LBNF macros must be expanded into labelled productions.`);
  if (entry && !categories.has(entry)) throw new Error(`Grammar: entrypoint “${entry}” has no production.`);
  return {rules, start:entry || rules[0].lhs, categories};
}
function parseGrammar(source) {
  const parsed = readProductions(source);
  let startName = 'Start', acceptLabel = 'accept';
  while (parsed.categories.has(startName)) startName += "'";
  while (parsed.rules.some(r => r.label === acceptLabel)) acceptLabel += "'";
  const symbol = (kind, value) => ({kind,value,key:JSON.stringify([kind,value])});
  const rules = parsed.rules.map(r => ({...r,rhs:r.rhs.map(s => symbol(s.kind === 'terminal' || !parsed.categories.has(s.value) ? 't' : 'n',s.value))}));
  rules.unshift({label:acceptLabel,lhs:startName,rhs:[symbol('n',parsed.start),symbol('t','$')]});
  const terminals = [], nonterminals = [], seen = new Set();
  // EOF leads Shift; other symbols retain their first appearance in the grammar.
  terminals.push(rules[0].rhs[1]); seen.add(rules[0].rhs[1].key);
  for (const rule of rules) {
    const left = symbol('n',rule.lhs);
    if (rule.lhs !== startName && !seen.has(left.key)) { nonterminals.push(left); seen.add(left.key); }
    for (const s of rule.rhs) if (!seen.has(s.key)) { (s.kind === 't' ? terminals : nonterminals).push(s); seen.add(s.key); }
  }
  const byCategory = new Map();
  rules.forEach((r,index) => { if (!byCategory.has(r.lhs)) byCategory.set(r.lhs,[]); byCategory.get(r.lhs).push(index); });
  return {rules,terminals,nonterminals,byCategory};
}
const itemKey = item => `${item.r}:${item.d}`;
const kernelKey = items => items.map(itemKey).sort().join('|');
const nextSymbol = (model,item) => model.grammar.rules[item.r].rhs[item.d];
function closure(grammar,kernel) {
  const items = kernel.map(i => ({r:i.r,d:i.d})), seen = new Set(items.map(itemKey));
  for (let i = 0; i < items.length; i++) {
    const s = grammar.rules[items[i].r].rhs[items[i].d];
    if (s?.kind !== 'n') continue;
    for (const r of grammar.byCategory.get(s.value) || []) {
      const item = {r,d:0};
      if (!seen.has(itemKey(item))) { seen.add(itemKey(item)); items.push(item); }
    }
  }
  return items;
}
function newState(model,kernel,born) {
  const key = kernelKey(kernel), reused = model.states.find(s => s.key === key);
  if (reused) return reused;
  const state = {id:model.states.length,key,born,kernel:kernel.map(i => ({r:i.r,d:i.d})),items:kernel.map(i => ({r:i.r,d:i.d,born,closure:false})),expanded:new Map(),transitions:new Map(),reductions:new Map()};
  state.full = closure(model.grammar,kernel); model.states.push(state); return state;
}
function initial(grammar) { const model = {grammar,states:[],step:0}; newState(model,[{r:0,d:0}],0); return model; }
const symbolText = s => /\s/.test(s.value) ? JSON.stringify(s.value) : s.value;
const actionText = a => `${a.state} ${a.type} ${a.object}`;
function available(model) {
  const actions = [];
  for (const state of [...model.states].reverse()) {
    const symbols = [], seen = new Set();
    for (const item of state.items) {
      const s = nextSymbol(model,item);
      if (s && !seen.has(s.key)) { seen.add(s.key); symbols.push(s); }
    }
    for (const s of symbols) if (s.kind === 'n' && !state.expanded.has(s.key)) actions.push({state:state.id,type:'expand',object:symbolText(s),symbol:s});
    for (const item of state.items) if (!nextSymbol(model,item) && !state.reductions.has(item.r)) actions.push({state:state.id,type:'reduce',object:model.grammar.rules[item.r].label,rule:item.r});
    for (const s of symbols) {
      if (state.transitions.has(s.key) || (s.kind === 'n' && !state.expanded.has(s.key))) continue;
      const relevant = items => items.filter(i => nextSymbol(model,i)?.key === s.key).map(i => ({r:i.r,d:i.d+1}));
      // Never freeze a partial kernel: a later expansion could add another item
      // with this symbol after the dot. Only the complete goto set is reusable.
      if (kernelKey(relevant(state.items)) !== kernelKey(relevant(state.full))) continue;
      actions.push({state:state.id,type:s.kind === 't' ? 'shift' : 'goto',object:symbolText(s),symbol:s});
    }
  }
  return actions;
}
function apply(model,action) {
  const state = model.states[action.state], born = ++model.step;
  if (action.type === 'expand') {
    state.expanded.set(action.symbol.key,born);
    for (const r of model.grammar.byCategory.get(action.symbol.value) || []) if (!state.items.some(i => i.r === r && i.d === 0)) state.items.push({r,d:0,born,closure:true});
  } else if (action.type === 'reduce') state.reductions.set(action.rule,born);
  else {
    const kernel = state.items.filter(i => nextSymbol(model,i)?.key === action.symbol.key).map(i => ({r:i.r,d:i.d+1}));
    const target = newState(model,kernel,born);
    state.transitions.set(action.symbol.key,{symbol:action.symbol,to:target.id,born});
  }
  return model;
}
function replay(grammar,steps) {
  const model = initial(grammar);
  for (const text of steps) {
    const action = available(model).find(a => actionText(a) === text);
    if (!action) throw new Error(`Invalid step ${model.step + 1}: ${text}`);
    apply(model,action);
  }
  return model;
}
function completedItems(model,state) { return state.items.filter(i => !nextSymbol(model,i)); }
function conflict(model,state) {
  const reductions = completedItems(model,state);
  const conflicts = [];
  if (reductions.length > 1) conflicts.push('Reduce/reduce conflict');
  if (reductions.length && state.items.some(i => nextSymbol(model,i)?.kind === 't')) conflicts.push('Shift/reduce conflict');
  return conflicts.join('; ');
}
function description(model,a) {
  if (!a) return 'The LR(0) automaton and parse table are complete.';
  if (a.type === 'expand') return `Add parse items for non-terminal ${a.object} to state ${a.state}`;
  if (a.type === 'goto') return `State after we parsed ${a.object}`;
  if (a.type === 'shift') return `State after we shift token ${a.object} in state ${a.state}`;
  const r = model.grammar.rules[a.rule];
  return `In state ${a.state} rule ${r.label} fires: reduce stack top ${r.rhs.map(symbolText).join(' ') || 'ε'} to ${r.lhs}`;
}
function itemText(grammar,item) {
  const r = grammar.rules[item.r], pieces = r.rhs.map(symbolText); pieces.splice(item.d,0,'•');
  return `${r.lhs} → ${pieces.join(' ')}`;
}
// Build the canonical collection without executing or exposing teaching steps.
async function canonical(grammar, pause = () => Promise.resolve()) {
  const model = initial(grammar), byKey = new Map([[model.states[0].key,model.states[0]]]);
  for (let index = 0; index < model.states.length; index++) {
    const state = model.states[index], groups = new Map();
    for (const item of state.full) {
      const symbol = nextSymbol(model,item);
      if (!symbol) continue;
      if (!groups.has(symbol.key)) groups.set(symbol.key,{symbol,items:[]});
      groups.get(symbol.key).items.push({r:item.r,d:item.d+1});
    }
    for (const {symbol,items} of groups.values()) {
      const key = kernelKey(items);
      let target = byKey.get(key);
      if (!target) { target = newState(model,items,0); byKey.set(key,target); }
      state.transitions.set(symbol.key,{symbol,to:target.id,born:0});
    }
    if (index % 32 === 0) await pause();
  }
  return model;
}
return {DEFAULT_GRAMMAR,parseGrammar,initial,available,actionText,apply,replay,conflict,completedItems,description,itemText,symbolText,kernelKey,canonical};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LR0;
