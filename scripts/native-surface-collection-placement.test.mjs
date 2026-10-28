import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'.runtime');await mkdir(base,{recursive:true});
const temp=await mkdtemp(path.join(base,'native-surface-collection-'));
const prior={window:globalThis.window,fetch:globalThis.fetch};
try{
  const output=path.join(temp,'client.mjs');await buildPilotEntry('lab/pilot/native-library-collection-placement.ts',output);
  const {placeNativeLibraryCollection}=await import(pathToFileURL(output).href);
  const input={projectId:'p',sourceCanvasId:'main-canvas',canvasId:'context-canvas',workspaceId:'context-root',
    collectionId:'collection-a',position:{x:700,y:120}};
  const present=()=>({state:'present',project_id:'p',canvas_id:input.canvasId,workspace_id:input.workspaceId,
    collection_id:input.collectionId,presentation_received:true,provider_execution_started:false,
    presentation:{projectId:'p',scopeId:'root',capability:'context',state:{memberEntityRefs:[{type:'collection',id:input.collectionId}]}},
    binding:{projectId:'p',canvasId:input.canvasId,spatialKind:'node',spatialId:'target-pile',entityType:'collection',entityId:input.collectionId},
    node:{id:'target-pile',type:'pile',position:input.position,data:{id:'target-pile',memberIds:['target-exact-material'],
      lcos_native_collection:true,lcos_collection_ref:{projectId:'p',canvasId:input.canvasId,workspaceId:input.workspaceId,collectionId:input.collectionId}}}});
  const absent=()=>({...present(),state:'absent',binding:null,node:null,presentation_received:false});
  const fixture=()=>{
    const nodes=[{id:'source-pile',type:'pile',position:{x:13,y:29},selected:true,
      data:{id:'source-pile',memberIds:['source-image'],lcos_native_collection:true,lcos_collection_ref:
        {projectId:'p',canvasId:'main-canvas',workspaceId:'main-root',collectionId:input.collectionId}}}];
    const requests=[],flushes=[];let current=true,sync=0;
    const api={getNodes:()=>nodes,getEdges:()=>[],flushCanvas:async id=>{flushes.push(id);return 'saved';},
      synchronizeCollectionCarrier:async()=>{sync++;throw new Error('Remote carrier must never enter source API');},
      findMaterialPlacement:()=>{throw new Error('Do not choose a remote point from source Canvas');}};
    const f={api,nodes,requests,flushes,current:()=>current,changeScene(){current=false;},syncs:()=>sync,
      handler:async method=>method==='POST'?present():absent()};
    globalThis.window={__LCOS_NODE_LAB__:{projectId:'p',currentCanvasId:'main-canvas',api}};
    globalThis.fetch=async(url,init={})=>{const method=init.method??'GET';requests.push({url,method,body:init.body?JSON.parse(init.body):undefined});
      const value=await f.handler(method);if(value instanceof Error)throw value;
      return {ok:true,json:async()=>({code:0,data:value})};};
    return f;
  };
  const place=(f,options={},overrides={})=>placeNativeLibraryCollection({...input,...overrides},{api:f.api,isCurrent:f.current,...options});
  const checks=[];
  async function check(label,work){await work();checks.push(label);}
  await check('unmounted target: existing Collection producer receives one whole identity, source API only flushes source',async()=>{
    const f=fixture(),before=structuredClone(f.nodes),r=await place(f);
    assert.equal(r.status,'placed');assert.equal(r.nodeId,'target-pile');assert.equal(r.canonicalReceipt.collection_id,input.collectionId);
    assert.deepEqual(f.requests.map(r=>r.method),['GET','POST']);assert.deepEqual(f.flushes,['main-canvas']);
    assert.deepEqual(f.requests[1].body,{collectionId:input.collectionId,position:input.position});
    assert.equal(f.requests[1].url,'/api/lcos/canvases/context-canvas/collections:project');
    assert.equal(f.syncs(),0);assert.deepEqual(f.nodes,before);
  });
  await check('already-present destination is read-only and does not create or relocate another carrier',async()=>{
    const f=fixture();f.handler=async()=>present();const r=await place(f);
    assert.equal(r.status,'already-present');assert.equal(f.requests.length,1);assert.equal(f.syncs(),0);
  });
  await check('lost successful POST reply automatically checks exact target with GET only',async()=>{
    const f=fixture();let committed=false;f.handler=async method=>{
      if(method==='POST'){committed=true;return new Error('response lost');}return committed?present():absent();};
    const before=structuredClone(f.nodes),r=await place(f);
    assert.equal(r.status,'placed');assert.deepEqual(f.requests.map(r=>r.method),['GET','POST','GET']);
    assert.equal(f.syncs(),0);assert.deepEqual(f.nodes,before);
  });
  await check('unknown absence remains unconfirmed without retrying POST, readOnly does not even flush',async()=>{
    const f=fixture();f.handler=async method=>method==='POST'?new Error('unknown'):absent();
    assert.equal((await place(f)).status,'unconfirmed');assert.deepEqual(f.requests.map(r=>r.method),['GET','POST','GET']);
    f.api.flushCanvas=async()=>{throw new Error('readonly flush forbidden');};
    assert.equal((await place(f,{readOnly:true})).status,'unconfirmed');
    assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
  });
  await check('partial destination and missing target point cannot trigger blind projection',async()=>{
    let f=fixture();f.handler=async()=>({...absent(),state:'partial',presentation_received:true});
    assert.equal((await place(f)).status,'unconfirmed');assert.equal(f.requests.length,1);
    f=fixture();assert.equal((await place(f,{}, {position:undefined})).status,'rejected');
    assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
  });
  await check('wrong project/workspace/target Canvas/collection rejects before any POST',async()=>{
    for(const key of ['project_id','canvas_id','workspace_id','collection_id']){
      const f=fixture();f.handler=async()=>({...present(),[key]:'wrong'});
      assert.equal((await place(f)).status,'rejected');assert.equal(f.requests.length,1);assert.equal(f.syncs(),0);
    }
  });
  await check('source API replacement or source scene change never writes target or synchronizes source',async()=>{
    const f=fixture();window.__LCOS_NODE_LAB__.api={...f.api};assert.equal((await place(f)).status,'rejected');assert.equal(f.requests.length,0);
    const g=fixture();g.handler=async method=>{if(method==='POST'){g.changeScene();return present();}return absent();};
    assert.equal((await place(g)).status,'unconfirmed');assert.equal(g.syncs(),0);
  });
  await check('remote target does not require a mounted synchronization API, and a raced existing receipt remains already-present',async()=>{
    const f=fixture();f.api.synchronizeCollectionCarrier=undefined;
    f.handler=async method=>method==='POST'?{...present(),already_present:true}:absent();
    const result=await place(f);assert.equal(result.status,'already-present');
    assert.deepEqual(f.requests.map(r=>r.method),['GET','POST']);assert.equal(f.nodes.length,1);
  });

  console.log(JSON.stringify({passed:true,scope:'production Collection client; controlled HTTP and source API; no Core or browser writes',checks}));
}finally{
  globalThis.fetch=prior.fetch;if(prior.window===undefined)delete globalThis.window;else globalThis.window=prior.window;
  assert.ok(path.resolve(temp).startsWith(base+path.sep)&&path.basename(temp).startsWith('native-surface-collection-'));
  await rm(temp,{recursive:true,force:true});
}
