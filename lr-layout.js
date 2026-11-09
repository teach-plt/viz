/* Fixed final-automaton layout; shared by the page, worker and Node tests. */
'use strict';
const LRLayout = (() => {
  const edgeKey = (from,symbol,to) => JSON.stringify([from,symbol,to]);
  const dimensions = (core,grammar,state) => ({
    width:Math.max(134,...state.full.map(item => core.itemText(grammar,item).length*7.25+28)),
    height:42+21*state.full.length
  });
  function inputGraph(core,model,config,width,height) {
    return {
      id:'automaton',
      layoutOptions:{
        'elk.algorithm':'layered','elk.direction':config.direction,
        'elk.edgeRouting':'ORTHOGONAL','elk.randomSeed':'1',
        'elk.padding':'[top=12,left=12,bottom=12,right=12]',
        'elk.spacing.nodeNode':String(config.spacing),
        'elk.layered.spacing.nodeNodeBetweenLayers':String(config.spacing+12),
        'elk.spacing.edgeNode':'10','elk.spacing.edgeEdge':'8',
        'elk.layered.wrapping.strategy':config.wrap,
        'elk.aspectRatio':String(width/height),
        'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES',
        'elk.layered.nodePlacement.bk.fixedAlignment':'LEFTUP'
      },
      children:model.states.map(state => ({id:`n${state.id}`,...dimensions(core,model.grammar,state)})),
      edges:model.states.flatMap(state => [...state.transitions.values()].map((t,index) => ({
        id:`e${state.id}_${index}`,sources:[`n${state.id}`],targets:[`n${t.to}`],
        labels:[{text:core.symbolText(t.symbol),width:Math.max(12,core.symbolText(t.symbol).length*7.25+8),height:18}]
      })))
    };
  }
  function routeRootFanout(nodes,edges,rootKey,direction) {
    // Moving the root into the corner can reverse the order of its departure
    // lanes. Route its fan-out as a group in the empty strip before layer two.
    // Order departure ports by destination. Down/right-going bends take lanes
    // in reverse order; up/left-going bends take them in forward order.
    const primary = direction === 'RIGHT' ? 'x' : 'y';
    const secondary = primary === 'x' ? 'y' : 'x';
    const extent = primary === 'x' ? 'width' : 'height';
    const crossExtent = extent === 'width' ? 'height' : 'width';
    const root = nodes.get(rootKey), boundary = root[primary]+root[extent]/2;
    let limit = Infinity;
    for (const [key,node] of nodes) {
      if (key === rootKey || node[primary]+node[extent]/2 <= boundary) continue;
      limit = Math.min(limit,node[primary]-node[extent]/2);
    }
    const outgoing = [...edges.values()].filter(route => route.from === rootKey);
    if (outgoing.length < 2 || limit-boundary < 20) return;
    const fanout = [];
    for (const route of outgoing) {
      const points = route.points;
      if (Math.abs(points[0][primary]-boundary) > .1) return;
      const exit = points.findIndex(p => p[primary] >= limit-.1);
      if (exit < 1 || Math.abs(points[exit][secondary]-points[exit-1][secondary]) > .1) return;
      fanout.push({route,exit,arrival:points[exit][secondary]});
    }
    fanout.sort((a,b) => a.arrival-b.arrival || a.route.points[0][secondary]-b.route.points[0][secondary]);
    const margin = 8, gap = (limit-boundary-2*margin)/(fanout.length-1);
    const leading = root[secondary]-root[crossExtent]/2;
    fanout.forEach((entry,index) => { entry.port = leading+root[crossExtent]*(index+1)/(fanout.length+1); });
    const inward = fanout.filter(entry => entry.arrival < entry.port);
    const outward = fanout.filter(entry => entry.arrival >= entry.port).reverse();
    [...inward,...outward].forEach((entry,index) => { entry.lane = boundary+margin+index*gap; });
    fanout.forEach(({route,exit,arrival,port,lane}) => {
      const point = (a,b) => ({[primary]:a,[secondary]:b});
      const points = [point(boundary,port),point(lane,port),point(lane,arrival),...route.points.slice(exit)];
      route.points = points.filter((p,i) => !i || p.x !== points[i-1].x || p.y !== points[i-1].y);
    });
  }
  function decode(core,model,graph,config) {
    const nodes = new Map(graph.children.map(node => {
      const state = model.states[Number(node.id.slice(1))];
      return [state.key,{x:node.x+node.width/2,y:node.y+node.height/2,width:node.width,height:node.height}];
    }));
    const edges = new Map();
    for (const edge of graph.edges) {
      const [from,index] = edge.id.slice(1).split('_').map(Number), state = model.states[from];
      const transition = [...state.transitions.values()][index], target = model.states[transition.to];
      const sections = edge.sections || [];
      const points = sections.flatMap(section => [section.startPoint,...(section.bendPoints || []),section.endPoint]);
      if (points.length < 2) throw new Error('The layout engine did not return an edge route.');
      const label = edge.labels[0];
      edges.set(edgeKey(state.key,transition.symbol.key,target.key),{
        points,from:state.key,to:target.key,
        label:core.symbolText(transition.symbol),
        labelPosition:{x:label.x+label.width/2,y:label.y+label.height/2},
        labelWidth:label.width,labelHeight:label.height
      });
    }
    // The unique initial state has no incoming edges. Anchor it in the first
    // layer's upper-left corner, rather than vertically centring it on children.
    const rootKey = model.states[0].key, oldRoot = nodes.get(rootKey);
    const root = {...oldRoot,x:12+oldRoot.width/2,y:12+oldRoot.height/2};
    const collision = [...nodes].some(([key,node]) => key !== rootKey && Math.abs(root.x-node.x) < (root.width+node.width)/2+8 && Math.abs(root.y-node.y) < (root.height+node.height)/2+8);
    if (!collision) {
      const dx = root.x-oldRoot.x, dy = root.y-oldRoot.y;
      nodes.set(rootKey,root);
      for (const route of edges.values()) if (route.from === rootKey) {
        const points = route.points.map(p => ({...p})), start = points[0];
        const horizontal = Math.abs(points[1].x-start.x) > Math.abs(points[1].y-start.y);
        points[0] = {x:start.x+dx,y:start.y+dy};
        if (points.length > 2) {
          if (horizontal) points[1].y += dy;
          else points[1].x += dx;
        } else if (dx || dy) {
          const end = points[1];
          if (horizontal) { const x = (points[0].x+end.x)/2; points.splice(1,0,{x,y:points[0].y},{x,y:end.y}); }
          else { const y = (points[0].y+end.y)/2; points.splice(1,0,{x:points[0].x,y},{x:end.x,y}); }
        }
        // Keep root-edge labels near the destination, clear of the extra
        // departure channels introduced by anchoring the root at the corner.
        const end = points.at(-1), previous = points.at(-2);
        if (Math.abs(end.y-previous.y) < .01 && Math.abs(end.x-previous.x) > route.labelWidth+16)
          route.labelPosition = {x:end.x-Math.sign(end.x-previous.x)*(route.labelWidth/2+8),y:end.y+12};
        else if (Math.abs(end.x-previous.x) < .01 && Math.abs(end.y-previous.y) > route.labelHeight+16)
          route.labelPosition = {x:end.x+route.labelWidth/2+8,y:end.y-Math.sign(end.y-previous.y)*(route.labelHeight/2+8)};
        route.points = points;
      }
      routeRootFanout(nodes,edges,rootKey,config.direction);
    }
    return {nodes,edges,bounds:{x:0,y:0,width:graph.width,height:graph.height},config};
  }
  function fittedScale(bounds,width,height) {
    return Math.min((width-32)/bounds.width,(height-32)/bounds.height);
  }
  // Prefer legible fitted text. Near ties favour less area and downward flow.
  function score(plan,width,height) {
    const scale = fittedScale(plan.bounds,width,height);
    return scale - .002*(plan.bounds.width*plan.bounds.height/(width*height)) + (plan.config.direction === 'DOWN' ? .003 : 0);
  }
  async function plan(core,model,ELK,size,cancelled = () => false) {
    const width = Math.max(280,size.width), height = Math.max(220,size.height);
    const candidates = [
      {direction:'DOWN',wrap:'OFF',spacing:16},
      {direction:'DOWN',wrap:'MULTI_EDGE',spacing:16},
      {direction:'DOWN',wrap:'MULTI_EDGE',spacing:28},
      {direction:'DOWN',wrap:'MULTI_EDGE',spacing:8},
      {direction:'RIGHT',wrap:'OFF',spacing:16},
      {direction:'RIGHT',wrap:'MULTI_EDGE',spacing:12},
      {direction:'RIGHT',wrap:'OFF',spacing:8}
    ];
    const elk = new ELK({algorithms:['layered']}); let best = null, lastError;
    try {
      for (const config of candidates) {
        if (cancelled()) return null;
        try {
          const graph = await elk.layout(inputGraph(core,model,config,width,height));
          const result = decode(core,model,graph,config);
          if (!best || score(result,width,height) > score(best,width,height)) best = result;
        } catch (error) { lastError = error; }
      }
      if (cancelled()) return null;
      if (!best) throw lastError || new Error('Could not plan the automaton layout.');
      return best;
    } finally {
      // The bundled in-process worker has no terminate() method.
      if (typeof elk.worker?.worker?.terminate === 'function') elk.terminateWorker();
    }
  }
  function edgeGeometry(route,nodes,positions) {
    const from = nodes.get(route.from), to = nodes.get(route.to);
    const source = positions.get(route.from) || from, target = positions.get(route.to) || to;
    const deltaA = {x:source.x-from.x,y:source.y-from.y}, deltaB = {x:target.x-to.x,y:target.y-to.y};
    if (deltaA.x === deltaB.x && deltaA.y === deltaB.y) {
      const move = p => ({x:p.x+deltaA.x,y:p.y+deltaA.y});
      return {points:route.points.map(move),labelPosition:move(route.labelPosition)};
    }
    // Only incident edges change when a node is dragged. Keep their attachment
    // sides and replace the old bends with a short orthogonal local route.
    const original = route.points, first = original[0], last = original.at(-1);
    const start = {x:first.x+deltaA.x,y:first.y+deltaA.y}, end = {x:last.x+deltaB.x,y:last.y+deltaB.y};
    const horizontalA = Math.abs(original[1].x-first.x) > Math.abs(original[1].y-first.y);
    const horizontalB = Math.abs(last.x-original.at(-2).x) > Math.abs(last.y-original.at(-2).y);
    const stubA = {...start}, stubB = {...end};
    if (horizontalA) stubA.x += Math.sign(original[1].x-first.x)*12;
    else stubA.y += Math.sign(original[1].y-first.y)*12;
    if (horizontalB) stubB.x -= Math.sign(last.x-original.at(-2).x)*12;
    else stubB.y -= Math.sign(last.y-original.at(-2).y)*12;
    let middle;
    if (horizontalA && horizontalB) { const x = (stubA.x+stubB.x)/2; middle = [{x,y:stubA.y},{x,y:stubB.y}]; }
    else if (!horizontalA && !horizontalB) { const y = (stubA.y+stubB.y)/2; middle = [{x:stubA.x,y},{x:stubB.x,y}]; }
    else middle = [horizontalA ? {x:stubB.x,y:stubA.y} : {x:stubA.x,y:stubB.y}];
    const points = [start,stubA,...middle,stubB,end].filter((p,i,all) => !i || p.x !== all[i-1].x || p.y !== all[i-1].y);
    let labelPosition = route.labelPosition, longest = -1;
    for (let i=1;i<points.length;i++) {
      const a = points[i-1], b = points[i], length = Math.hypot(b.x-a.x,b.y-a.y);
      if (length > longest) { longest = length; labelPosition = {x:(a.x+b.x)/2+(a.x === b.x ? route.labelWidth/2+8 : 0),y:(a.y+b.y)/2+(a.y === b.y ? 12 : 0)}; }
    }
    return {points,labelPosition};
  }
  function fit(bounds,width,height) {
    const zoom = Math.max(.03,Math.min(1.5,fittedScale(bounds,width,height)));
    return {zoom,pan:{x:(width-bounds.width*zoom)/2-bounds.x*zoom,y:(height-bounds.height*zoom)/2-bounds.y*zoom}};
  }
  return {edgeKey,dimensions,inputGraph,plan,edgeGeometry,fit};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LRLayout;
