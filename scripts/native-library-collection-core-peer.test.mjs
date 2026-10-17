import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Reuse the already-owned disposable Core bootstrap, stopping before its
// material-specific fixture. No running App or user database is contacted.
const root = path.resolve(import.meta.dirname, '..');
const source = await fs.readFile(path.join(root, 'scripts/native-material-placement.test.mjs'), 'utf8');
const seam = "  const main = await canvas('surface-core-main'), destination = await canvas('surface-core-context');";
if (source.split(seam).length !== 2) throw new Error('Disposable Core bootstrap changed');
const prefix = source.slice(0, source.indexOf(seam)).replace(
  "    `export {createNativeMaterialPlacement} from ${JSON.stringify(relative('lab/pilot/native-material-placement.ts'))};`,",
  "    `export {createNativeMaterialPlacement} from ${JSON.stringify(relative('lab/pilot/native-material-placement.ts'))};`,\n"
    + "    `export {placeNativeLibraryCollection} from ${JSON.stringify(relative('lab/pilot/native-library-collection-placement.ts'))};`,");
const output = path.join(root, 'output/原生库集合整合_20261017g/前端真实Core对接', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const driver = `
  report.mode='production Collection Library frontend client → real disposable Core Assembly/ProjectToSpaceProjection/binding → actual O8 Collection receipt owner';
  report.writes=['synthetic canonical Collections only; existing synthetic material membership; real Collection Presentation receive/carrier/binding'];
  const safeCoreFetch=globalThis.fetch,requests=[];
  const main=await canvas('surface-core-main'),artifactId=main.nodes.find(n=>n.type==='text'&&n.data?.lcos_ref?.artifactId).data.lcos_ref.artifactId;
  const sourceHistory=await fs.readFile(path.join(root,'lab/startup-history-intent.js'),'utf8');
  let loseNext=false,holdCollection=null,heldOnce=false,heldEntered,heldRelease,onRequest;
  globalThis.fetch=async(address,init={})=>{
    if(typeof address==='string'&&address.startsWith('/api/lcos/canvases/')){
      const method=init.method??'GET',record={method,address,body:init.body?JSON.parse(init.body):null};requests.push(record);onRequest?.(record);
      const response=await call(method,address,init.body?JSON.parse(init.body):undefined);
      record.state=response.body?.data?.state;record.status=response.status;
      if(loseNext&&method==='POST'&&response.status===200){loseNext=false;throw new Error('Synthetic committed 200 withheld from frontend');}
      return Response.json(response.body,{status:response.status});
    }
    if(holdCollection&&!heldOnce&&(init.method??'GET')==='POST'&&String(address).endsWith('/assembly/apply')
      &&JSON.parse(init.body).sourceRefs?.some(ref=>ref.kind==='collection'&&ref.id===holdCollection)){
      heldOnce=true;heldEntered();await new Promise(resolve=>heldRelease=resolve);
    }
    return safeCoreFetch(address,init);
  };
  const collectionsBySurface={};
  for(const [index,surface] of ['main','context','workflow'].entries()){
    const made=await safeCoreFetch(coreOrigin+'/projects/'+projectId+'/collections',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title:'Synthetic original Library client '+surface,members:[{type:'artifact',id:artifactId}]})});
    assert.equal(made.status,201);const collection=(await made.json()).value;collectionsBySurface[surface]=collection;
    const target='surface-core-'+surface,old=await canvas(target);
    let nodes=structuredClone(old.nodes);const before=structuredClone(nodes),raw={current:nodes},history=[{state:{nodes:structuredClone(nodes),edges:structuredClone(old.edges)}}],listeners=new Set();
    const sandbox={};new Function('window',sourceHistory)(sandbox);
    const api={getNodes:()=>nodes,getEdges:()=>old.edges,getViewport:()=>({x:20,y:30,zoom:1}),flushCanvas:async()=> 'saved',
      subscribeNative(cb){listeners.add(cb);return()=>listeners.delete(cb)},
      async synchronizeCollectionCarrier(input,options){
        assert.equal(options.isCurrent(),true);
        return sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({receiptKind:'collection-projection',...input,history,currentNodesRef:raw,flushHistory(){},suppress(){},
          setNodes(next){queueMicrotask(()=>{nodes=next;listeners.forEach(cb=>cb())})}});
      }};
    const workspace=repository.getWorkspaces(projectId).find(w=>w.canvasId===target),position={x:1500+index*400.125,y:-140.25-index*25};
    const input={projectId,canvasId:target,workspaceId:String(workspace.id),collectionId:collection.id,position};
    const start=requests.length;
    if(surface==='workflow')loseNext=true;
    let placed=await module.placeNativeLibraryCollection(input,{api,isCurrent:()=>true});
    if(surface==='workflow'){
      assert.equal(placed.status,'unconfirmed');assert.equal(nodes.length,before.length);
      placed=await module.placeNativeLibraryCollection(input,{api,isCurrent:()=>true,readOnly:true});
      assert.equal(placed.status,'already-present');
    }else assert.equal(placed.status,'placed');
    const writes=requests.slice(start).filter(r=>r.method==='POST');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{collectionId:collection.id,position});
    const landing=nodes.find(n=>n.id===placed.nodeId);assert.equal(landing.type,'pile');assert.equal(landing.data.lcos_native_collection,true);assert.deepEqual(landing.position,position);
    assert.equal(landing.data.lcos_collection_ref.collectionId,collection.id);assert.equal(nodes.length,before.length+1);
    for(const prior of before)assert.deepEqual(nodes.find(n=>n.id===prior.id),prior);
    assert.equal(history.length,1);assert.equal(history[0].state.nodes.length,before.length+1);assert.equal(listeners.size,0);
    const repeated=await module.placeNativeLibraryCollection({...input,position:{x:9999,y:9999}},{api,isCurrent:()=>true,readOnly:true});
    assert.equal(repeated.nodeId,placed.nodeId);assert.equal(repeated.status,'already-present');assert.equal(requests.slice(start).filter(r=>r.method==='POST').length,1);
    const saved=await canvas(target);assert.equal(saved.nodes.find(n=>n.id===placed.nodeId).type,'pile');assert.deepEqual(saved.nodes.find(n=>n.id===placed.nodeId).position,position);
    assert.equal(repository.getProjectionBindings(projectId).filter(b=>b.canvasId===target&&b.entityType==='collection'&&b.entityId===collection.id).length,1);
    report.cases.push(surface+': original Library client exact POST → real Collection receive/unique raw carrier/binding → actual O8 native pile; repeat GET does not move; old edits/history preserved'+(surface==='workflow'?'; real committed200 withheld, explicit GETonly restores same carrier':''));
  }
  for(const [index,surface] of ['context','workflow'].entries()){
    const shared=collectionsBySurface.main,target='surface-core-'+surface,old=await canvas(target),before=structuredClone(old.nodes);
    const state=await call('GET','/api/lcos/canvases/'+target+'/collections/'+shared.id+'/projection');
    assert.equal(state.status,200);assert.equal(state.body.data.state,'absent','A legitimate untouched second Canvas must allow its first carrier');
    if(surface==='context')assert.equal(state.body.data.presentation_received,true,'Main/Context share their actual root Presentation');
    let nodes=structuredClone(old.nodes);const raw={current:nodes},history=[{state:{nodes:structuredClone(nodes),edges:old.edges}}],listeners=new Set(),sandbox={};
    new Function('window',sourceHistory)(sandbox);
    const api={getNodes:()=>nodes,getEdges:()=>old.edges,getViewport:()=>({x:20,y:30,zoom:1}),flushCanvas:async()=> 'saved',
      subscribeNative(cb){listeners.add(cb);return()=>listeners.delete(cb)},
      async synchronizeCollectionCarrier(value){return sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({receiptKind:'collection-projection',...value,
        history,currentNodesRef:raw,flushHistory(){},suppress(){},setNodes(next){queueMicrotask(()=>{nodes=next;listeners.forEach(cb=>cb())})}})}};
    const workspace=repository.getWorkspaces(projectId).find(w=>w.canvasId===target),position={x:2800+index*400,y:220.125};
    const start=requests.length,placed=await module.placeNativeLibraryCollection({projectId,canvasId:target,workspaceId:String(workspace.id),collectionId:shared.id,position},{api,isCurrent:()=>true});
    assert.equal(placed.status,'placed');assert.equal(requests.slice(start).filter(r=>r.method==='POST').length,1);
    assert.equal(nodes.length,before.length+1);assert.deepEqual(nodes.find(n=>n.id===placed.nodeId).position,position);
    for(const n of before)assert.deepEqual(nodes.find(value=>value.id===n.id),n);
    const rawSaved=(await facade.spatial.read(target)).state.nodes.find(n=>n.id===placed.nodeId);
    assert.equal(rawSaved.data.lcos_collection_ref.collectionId,shared.id,'The same original CREATE carries its exact canonical source echo');
    assert.equal(rawSaved.data.lcos_collection_ref.workspaceId,String(workspace.id));
    report.cases.push('same canonical Collection Main -> '+surface+': already received Presentation without this Canvas binding/echo remains a legitimate absent first placement; one original CREATE stores exact source echo, one O8 pile, old geometry unchanged');
  }
  // Exact UI lifetime analogue: first Popover closes while its receive POST is
  // still in flight; a fresh detail GET still sees absent and can submit again.
  // This does not pretend that the UI retained unknown. The real original
  // Assembly CAS must grant only one first-creation licence to these two POSTs.
  const raceMade=await safeCoreFetch(coreOrigin+'/projects/'+projectId+'/collections',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({title:'Synthetic Popover remount while first receive waits',members:[{type:'artifact',id:artifactId}]})});
  assert.equal(raceMade.status,201);const racedCollection=(await raceMade.json()).value,target='surface-core-main',old=await canvas(target);
  const createApi=()=>{
    let nodes=structuredClone(old.nodes);const raw={current:nodes},history=[{state:{nodes:structuredClone(nodes),edges:old.edges}}],listeners=new Set(),sandbox={};
    new Function('window',sourceHistory)(sandbox);
    const api={getNodes:()=>nodes,getEdges:()=>old.edges,getViewport:()=>({x:20,y:30,zoom:1}),flushCanvas:async()=> 'saved',
      subscribeNative(cb){listeners.add(cb);return()=>listeners.delete(cb)},
      async synchronizeCollectionCarrier(value){return sandbox.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({receiptKind:'collection-projection',...value,
        history,currentNodesRef:raw,flushHistory(){},suppress(){},setNodes(next){queueMicrotask(()=>{nodes=next;listeners.forEach(cb=>cb())})}})}};
    return{api,nodes:()=>nodes};
  };
  const firstApi=createApi(),secondApi=createApi(),workspace=repository.getWorkspaces(projectId).find(w=>w.canvasId===target);
  const raceInput={projectId,canvasId:target,workspaceId:String(workspace.id),collectionId:racedCollection.id,position:{x:3100.125,y:-180.5}};
  let firstCurrent=true;holdCollection=racedCollection.id;const entered=new Promise(resolve=>heldEntered=resolve),start=requests.length;
  const first=module.placeNativeLibraryCollection(raceInput,{api:firstApi.api,isCurrent:()=>firstCurrent});await entered;
  firstCurrent=false; // the first original Popover unmounted; late UI result cannot apply there
  let signalSecond;const secondPosted=new Promise(resolve=>signalSecond=resolve);
  onRequest=record=>{if(record.method==='POST'&&record.body.collectionId===racedCollection.id&&requests.slice(start).filter(r=>r.method==='POST').length===2)signalSecond();};
  const reopenedPromise=module.placeNativeLibraryCollection(raceInput,{api:secondApi.api,isCurrent:()=>true});
  try{await Promise.race([secondPosted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fresh detail did not reach its second request')),5000))]);}
  finally{heldRelease();onRequest=undefined;}
  const reopened=await reopenedPromise;assert.ok(['placed','already-present'].includes(reopened.status));const late=await first;holdCollection=null;
  assert.equal(late.status,'unconfirmed');assert.equal(firstApi.nodes().length,old.nodes.length);
  assert.equal(requests.slice(start).filter(row=>row.method==='POST').length,2,'UI remount can issue two attempts; do not call this GET-only UI recovery');
  assert.equal((await canvas(target)).nodes.length,old.nodes.length+1);
  assert.equal(repository.getProjectionBindings(projectId).filter(b=>b.canvasId===target&&b.entityType==='collection'&&b.entityId===racedCollection.id).length,1);
  assert.equal(secondApi.nodes().filter(n=>n.data?.lcos_collection_ref?.collectionId===racedCollection.id).length,1);
  report.cases.push('Popover lifetime analogue: receive blocked before Assembly, close/remount GET absent -> 2 frontend POST attempts; real Assembly grants one applied receipt/one carrier/binding, late old owner not backfilled. UI unknown retention is still incomplete, not GET-only recovery.');
  report.requests=requests;assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;
  await fs.writeFile(${JSON.stringify(path.join(output, 'report.json'))},JSON.stringify(report,null,2));
  if(path.dirname(temp)!==path.resolve(runtimeBase)||!path.basename(temp).startsWith('native-material-placement-test-'))throw new Error('Unexpected owned fixture path');
  await fs.rm(temp,{recursive:true,force:true});console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:${JSON.stringify(path.join(output, 'report.json'))}}));
}
`;
const generated = path.join(root, '.runtime/native-library-collection-peer-' + Date.now() + '.mjs');
await fs.writeFile(generated, prefix + driver);
try { await import(pathToFileURL(generated)); } finally { await fs.unlink(generated); }
