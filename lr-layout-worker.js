'use strict';
importScripts('lr-core.js','lr-layout.js','vendor/elk.bundled.js');
self.onmessage = async event => {
  try {
    const {source,size} = event.data;
    const model = await LR0.canonical(LR0.parseGrammar(source));
    const plan = await LRLayout.plan(LR0,model,ELK,size);
    self.postMessage({plan});
  } catch (error) { self.postMessage({error:error.message || String(error)}); }
};
