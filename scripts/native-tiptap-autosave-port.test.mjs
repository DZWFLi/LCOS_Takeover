import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createNativeTextSavePort}=require('../lab/native-text-save-port.js');
function fixture(){
  const ref={version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'};
  let node={id:'n',type:'text',data:{text:'A original',lcos_ref:ref}},reads=0;
  const firstApi={getNode:()=>node,updateNodeData(){throw new Error('prepare must never call a writer')}};
  const host={projectId:'p',canvasId:'c',api:firstApi};
  const port=createNativeTextSavePort({getHost:()=>host,getObservedRevision:()=> 'r1',readCanvasText:async()=>{reads++;return{projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',body:'A original'}}});
  function queued(patch){const data={...node.data,...patch(node)};node={...node,data};const item={id:'n',type:node.type,operationType:'update',data:node.data};port.captureQueuedAutosave('c',item);return item}
  return{port,host,firstApi,get node(){return node},set node(n){node=n},queued,get reads(){return reads}};
}
{
  const f=fixture(),patch=f.port.autosavePatch('n','A pending old body');
  f.node={id:'n',type:'text',data:{text:'B must survive',lcos_ref:{version:1,entityType:'artifact',entityId:'b',artifactId:'b',artifactViewId:'vb',revisionId:'rb'}}};
  const item=f.queued(patch);
  assert.equal(f.node.data.text,'B must survive');
  await f.port.prepareQueuedText('c',[item]);
  assert.equal(f.port.getPending()[0].body,'A pending old body');
  assert.equal(f.port.getPending()[0].status,'wrong-node-or-view');
  assert.equal(f.node.data.text,'B must survive');assert.equal(f.reads,0);
}
for(const change of ['api','project','canvas']){
  const f=fixture(),patch=f.port.autosavePatch('n','old scene pending body');
  if(change==='api')f.host.api={getNode:()=>f.node};
  if(change==='project')f.host.projectId='other-project';
  if(change==='canvas')f.host.canvasId='other-canvas';
  const item=f.queued(patch);await f.port.prepareQueuedText('c',[item]);
  assert.equal(f.port.queueDisposition('c',[item]),'hold',change+' cannot downgrade the old operation to ordinary retry');
  assert.equal(f.port.getPending()[0].body,'old scene pending body');assert.equal(f.reads,0);
}
{
  const f=fixture();let notifications=0;const stop=f.port.subscribe(()=>notifications++);
  const item=f.queued(f.port.autosavePatch('n','queued latest'));
  assert.equal(JSON.stringify(item).includes('api'),false,'the private API provenance never serializes');
  assert.equal(Object.getOwnPropertySymbols(item.data).length,0,'data provenance is consumed before the native DTO');
  await f.port.prepareQueuedText('c',[item]);
  assert.equal(f.port.getPending()[0].source,'native-autosave');assert.equal(f.port.getPending()[0].status,'waiting-batch');
  assert.equal(f.reads,1);assert.ok(notifications>1);stop();
}
{
  const f=fixture(),ref=f.node.data.lcos_ref;
  const make=(body)=>({id:'n',type:'text',operationType:'update',data:{text:body,lcos_ref:ref}});
  const undo=make('before'),redo=make('after');
  f.port.captureHistoryTextOperations({canvasId:'c',phase:'undo',intentId:'one-original-Undo',
    changes:[{type:'replace',id:'n',item:{id:'n',type:'text',data:undo.data}}],operations:[undo]});
  f.port.captureHistoryTextOperations({canvasId:'c',phase:'redo',intentId:'one-original-Redo',
    changes:[{type:'replace',id:'n',item:{id:'n',type:'text',data:redo.data}}],operations:[redo]});
  const groups=[];
  const result=f.port.coalesceQueue('c',[undo,redo],items=>{groups.push(items);return[items.at(-1)]});
  assert.equal(groups.length,2,'two native history directions cannot be collapsed into one same-node update');
  assert.deepEqual(result.map(item=>item.data.text),['before','after']);
  const mismatch=make('not-the-original-change');
  f.port.captureHistoryTextOperations({canvasId:'c',phase:'undo',intentId:'bad-native-proof',
    changes:[{type:'replace',id:'n',item:{id:'n',type:'text',data:undo.data}}],operations:[mismatch]});
  await f.port.prepareQueuedText('c',[mismatch]);
  assert.equal(f.port.queueDisposition('c',[mismatch]),'hold');assert.equal(f.reads,0);
}
{
  let release,node={id:'n',type:'text',data:{text:'A',lcos_ref:{version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'}}};
  const api={getNode:()=>node},host={projectId:'p',canvasId:'c',api};
  const port=createNativeTextSavePort({getHost:()=>host,getObservedRevision:()=> 'r1',readCanvasText:()=>new Promise(resolve=>{release=resolve})});
  const data={...node.data,...port.autosavePatch('n','new A body')(node)},item={id:'n',type:'text',operationType:'update',data};
  port.captureQueuedAutosave('c',item);const preparing=port.prepareQueuedText('c',[item]);
  node={id:'n',type:'text',data:{text:'B survives',lcos_ref:{version:1,entityType:'artifact',entityId:'b',artifactId:'b',artifactViewId:'vb',revisionId:'rb'}}};
  release({projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',body:'A'});await preparing;
  assert.equal(node.data.text,'B survives');assert.equal(port.queueDisposition('c',[item]),'hold');
  assert.equal(port.getPending()[0].status,'wrong-node-or-view','same-API primary swap during the async preflight is rechecked');
}
console.log('PASS: deferred primary/API/project/canvas replacement holds the original draft, never overwrites replacement material, never calls a second writer, and private provenance does not enter JSON.');
