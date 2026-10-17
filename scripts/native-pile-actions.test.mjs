import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
const base = path.resolve('.runtime')
await mkdir(base, {recursive:true})
const runtime = await mkdtemp(path.join(base, 'native-pile-actions-'))
const previous = {window:globalThis.window, fetch:globalThis.fetch}
try {
  const output = path.join(runtime, 'ui.mjs')
  await buildPilotEntry('lab/pilot/native-pile-ui.tsx', output)
  const {LCOSNativePileTitleCommit,LCOSNativePileOperation}=await import(pathToFileURL(output).href)
  const ref={projectId:'p',canvasId:'c',workspaceId:'w',collectionId:'col'}
  const pile={id:'pile',type:'pile',position:{x:100,y:120},selected:true,data:{id:'pile',title:'Before',lcos_native_collection:true,lcos_collection_ref:ref,memberIds:[]}}
  const material=(id,artifactId,viewId)=>({id,type:'text',position:{x:50,y:90},data:{id,title:'Material '+id,lcos_ref:{version:1,entityType:'view',entityId:viewId,artifactId,artifactViewId:viewId,revisionId:'rev-'+id}}})
  const nodes=[pile,material('a','artifact-a','view-a'),material('a2','artifact-a','view-a2'),material('b','artifact-b','view-b')]
  const bindings=[{...ref,spatialId:'pile',spatialKind:'node',entityType:'collection',entityId:'col'},...nodes.slice(1).map(n=>({...ref,spatialId:n.id,spatialKind:'node',entityType:'view',entityId:n.data.lcos_ref.artifactViewId}))]
  const collection={id:'col',projectId:'p',title:'Before'};const members=[];let receipts=0;let lostPost=false;let deferRead
  const requests=[];const errors=[];const api={getNode:id=>nodes.find(n=>n.id===id),getNodes:()=>nodes,synchronizeCollectionCarrier:async input=>{receipts++;pile.data={...pile.data,...input.node.data};return{ok:true}}}
  const events=new EventTarget()
  globalThis.window=events;window.__LCOS_NODE_LAB__={projectId:'p',canvasId:'c',api}
  events.addEventListener('lcos:native-collection-updated',e=>{if(e.detail.error)errors.push(e.detail.error)})
  globalThis.fetch=async(url,init={})=>{
    const method=init.method||'GET';requests.push({url,method,body:init.body&&JSON.parse(init.body)})
    if(deferRead&&String(url).endsWith('/members')&&method==='GET')await deferRead
    const json=value=>({ok:true,status:200,json:async()=>value})
    if(String(url).endsWith('/members')){
      if(method==='POST'){const body=JSON.parse(init.body);if(!members.some(m=>m.memberRef.type===body.memberType&&m.memberRef.id===body.memberId))members.push({memberRef:{type:body.memberType,id:body.memberId}});if(lostPost){lostPost=false;throw new Error('Response lost')}}
      if(method==='DELETE'){const body=JSON.parse(init.body);const i=members.findIndex(m=>m.memberRef.type===body.memberType&&m.memberRef.id===body.memberId);if(i>=0)members.splice(i,1)}
      return json({ok:true,value:{collection:{...collection},members:structuredClone(members),previews:[]}})
    }
    if(String(url).endsWith('/spatial/bindings'))return json({ok:true,value:bindings})
    if(String(url).endsWith('/projection'))return json({code:0,data:{node:{...pile,data:{...pile.data,title:collection.title,memberIds:nodes.slice(1).filter(n=>members.some(m=>m.memberRef.id===n.data.lcos_ref.artifactId)).map(n=>n.id)}}}})
    if(String(url).startsWith('/api/canvas/v1/canvases/'))return json({code:0,data:{nodes}})
    if(method==='PATCH'){Object.assign(collection,JSON.parse(init.body));return json({ok:true,value:{...collection}})}
    throw new Error('Unexpected '+url)
  }
  const idle=()=>new Promise(resolve=>events.addEventListener('lcos:native-collection-updated',function listener(e){if(e.detail.pending===false){events.removeEventListener('lcos:native-collection-updated',listener);queueMicrotask(resolve)}}))
  assert.equal(LCOSNativePileTitleCommit({...pile,data:{id:'pile'}}),undefined,'ordinary title retains donor route')
  const commit=LCOSNativePileTitleCommit(pile)
  await commit('After')
  assert.equal(collection.title,'After');assert.equal(pile.data.title,'After');assert.equal(receipts,1)
  await commit('After');assert.equal(requests.filter(r=>r.method==='PATCH').length,1,'same title is idempotent')
  const old=LCOSNativePileTitleCommit(pile)
  window.__LCOS_NODE_LAB__={projectId:'p',canvasId:'other',api}
  await old('Late');assert.equal(collection.title,'After','unmount debounce cannot change departed scene')
  window.__LCOS_NODE_LAB__={projectId:'p',canvasId:'c',api}
  let done=idle();assert.equal(LCOSNativePileOperation('addMember',nodes,'pile',['a','a2','b']),true);await done
  assert.deepEqual(members.map(m=>m.memberRef.id),['artifact-a','artifact-b'])
  assert.equal(requests.filter(r=>r.method==='POST').length,2,'distinct views create one Artifact membership')
  assert.deepEqual(pile.data.memberIds,['a','a2','b'],'all exact projections remain visible')
  done=idle();LCOSNativePileOperation('addMember',nodes,'pile',['a','b']);await done
  assert.equal(requests.filter(r=>r.method==='POST').length,2,'confirmed repeated drop is read-only')
  const before=structuredClone(members);done=idle();LCOSNativePileOperation('addMember',nodes,'pile',['a','forged']);await done
  assert.deepEqual(members,before,'whole selection validates before any member mutation')
  assert.equal(requests.filter(r=>r.method==='POST').length,2)
  done=idle();LCOSNativePileOperation('removeMember',nodes,'pile','b');await done
  assert.deepEqual(members.map(m=>m.memberRef.id),['artifact-a']);assert.ok(requests.some(r=>r.method==='DELETE'))
  lostPost=true;done=idle();LCOSNativePileOperation('addMember',nodes,'pile',['b']);await done
  assert.deepEqual(members.map(m=>m.memberRef.id),['artifact-a','artifact-b'],'lost response retains actual Core fact')
  const lostCount=requests.filter(r=>r.method==='POST').length
  done=idle();LCOSNativePileOperation('addMember',nodes,'pile',['b']);await done
  assert.equal(requests.filter(r=>r.method==='POST').length,lostCount,'readback resolves lost reply without automatic POST replay')
  let release;deferRead=new Promise(resolve=>{release=resolve})
  const late=LCOSNativePileTitleCommit(pile)('Ignored')
  window.__LCOS_NODE_LAB__={projectId:'p',canvasId:'c',api:{...api}}
  release();await late
  assert.equal(collection.title,'After','same IDs on a replacement API do not adopt a delayed commit')
  assert.deepEqual(pile.position,{x:100,y:120});assert.equal(pile.selected,true)
  console.log(JSON.stringify({passed:true,scope:'synthetic runtime, production UI port + exact Core DTO/readback; no live service or model',rename:true,originalTitleFactory:true,multiNodeDrop:true,allViewsPreserved:true,idempotent:true,lostReplyReadback:true,staleOwnerRejected:true,geometrySelectionPreserved:true,requests:requests.reduce((o,r)=>(o[r.method]=(o[r.method]||0)+1,o),{})}))
} finally {
  if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window
  globalThis.fetch=previous.fetch
  assert.ok(path.resolve(runtime).startsWith(base+path.sep)&&path.basename(runtime).startsWith('native-pile-actions-'))
  await rm(runtime,{recursive:true,force:true})
}
