import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'.runtime');
await fs.mkdir(runtime,{recursive:true});const temp=await fs.mkdtemp(path.join(runtime,'native-material-receive-client-'));
const output=path.join(root,'output/原生文本整合_20261017e/Drop语义客户端验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));
await fs.mkdir(output,{recursive:true});
const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
const report={passed:false,scope:'Actual receiveNativeLibraryMaterial bundle, controlled transport/Canvas publication peer; not original O8/browser or real Core',cases:[],modelsExecuted:false,runsCreated:0,candidateAccessed:false};
let active;
function harness(kind='context',options={}){
  const targetRef=kind==='main'?{kind}:{kind,id:kind==='conversation'?'conversation':'scope-'+kind};
  const input={projectId:'p',canvasId:'c',workspaceId:'w',artifactId:'a',revisionId:'r1',fileRecordId:'f',artifactViewId:'origin',targetRef,
    ...(kind==='conversation'?{}:{position:options.position?{...options.position}:{x:140.5,y:-235}})};
  const original={id:'old',type:'text',position:{x:7,y:8},data:{text:'original unsent draft'},selected:true};
  const nodes=[original],trace={methods:[],signals:[],bodies:[],sync:[],flush:0};
  const api={getNodes:()=>nodes,getEdges:()=>[],flushCanvas:async()=>{trace.flush++;return 'saved'},
    async synchronizeMaterialProjection(value,{isCurrent}){trace.sync.push(value);assert.equal(isCurrent(),true);if(options.rejectSync)return{ok:false};
      const n=structuredClone(value.node);if(options.wrongLive)n.data.lcos_ref.revisionId='foreign';if(options.liveOffset)n.position={...n.position,x:n.position.x+options.liveOffset};
      const index=nodes.findIndex(row=>row.id===n.id);if(index<0)nodes.push(n);else nodes[index]=n;return{ok:true}}};
  globalThis.window={__LCOS_NODE_LAB__:{projectId:'p',canvasId:'c',api}};
  const view='pinned',point={...input.position},scope=kind==='main'?'root':'scope-'+kind;
  const base={project_id:'p',canvas_id:'c',workspace_id:'w',target_ref:targetRef,artifact_id:'a',revision_id:'r1',file_record_id:'f',
    artifact_view_id:view,provider_execution_started:false};
  const node={id:'new',canvas_id:'c',type:'text',position:point,data:{id:'new',text:'selected full body',
    lcos_ref:{version:1,entityType:'view',entityId:view,artifactId:'a',artifactViewId:view,revisionId:'r1'}}};
  const receipt=kind==='conversation'?{...base,state:'present',relation:{id:'rel',projectId:'p',kind:'conversation_context',sourceEntityType:'artifact',sourceEntityId:'conversation-artifact',targetEntityType:'view',targetEntityId:view}}
    :{...base,state:'present',node,binding:{projectId:'p',canvasId:'c',spatialKind:'node',spatialId:'new',entityType:'view',entityId:view},
      presentation:{id:'presentation:'+(kind==='workflow'?'workflow':'context')+':'+scope,projectId:'p',scopeId:scope,
        capability:kind==='workflow'?'workflow':'context',state:{memberViewIds:[view],positions:{[view]:point}}}};
  let committed=options.existing===true,firstRead=true;
  const isCurrent=()=>true;
  globalThis.fetch=async(address,init={})=>{
    const url=new URL(address,'http://local.test');assert.equal(url.origin,'http://local.test','controlled peer refuses network');
    const method=init.method??'GET';trace.methods.push(method+' '+url.pathname);trace.signals.push(init.signal);
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    if(url.pathname.endsWith('/identity'))return Response.json({ok:true,value:{projectId:'p',connectedConversation:{id:'conversation',projectId:'p',conversationSessionId:'session'},
      conversationSession:{id:'session',projectId:'p',conversationArtifactId:'conversation-artifact'},conversationArtifactId:'conversation-artifact'}});
    assert.ok(url.pathname.endsWith('/materials:receive'));
    if(method==='POST'){
      const body=JSON.parse(init.body);trace.bodies.push(body);assert.equal('workspaceId' in body,false);committed=true;
      options.afterPost?.({input,api,nodes,trace});if(options.losePost)throw new TypeError('Synthetic committed response lost');
      const value=structuredClone(receipt);options.mutatePost?.(value);return Response.json({code:0,data:value});
    }
    assert.deepEqual(JSON.parse(url.searchParams.get('targetRef')),targetRef);assert.equal(url.searchParams.has('position'),false);assert.equal(url.searchParams.has('workspaceId'),false);
    if(firstRead){firstRead=false;options.onRead?.({input,api,nodes,trace});}
    const value=committed?structuredClone(receipt):{...base,state:options.partial?'partial':'absent'};
    options.mutateGet?.(value);return Response.json({code:0,data:value});
  };
  return active={input,api,isCurrent,nodes,trace,original,receipt,setExisting(value){committed=value}};
}
try{
  const bundle=path.join(temp,'client.mjs');await buildPilotEntry('lab/pilot/native-material-receive-client.ts',bundle);
  const bundleText=await fs.readFile(bundle,'utf8');assert.doesNotMatch(bundleText,/node:sqlite|createNativeMaterialReceive|SqliteMetadataRepository/,'browser client must not import backend runtime');
  const {receiveNativeLibraryMaterial:receive}=await import(pathToFileURL(bundle));
  for(const kind of ['main','context','workflow']){
    const h=harness(kind,{onRead:({input,nodes})=>{input.position.x=9000;input.revisionId='later-input';nodes[0].measured={width:400,height:80}}});
    const signal=new AbortController().signal,result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal});
    assert.equal(result.status,'placed',JSON.stringify(result));assert.equal(result.revisionId,'r1');assert.equal(result.nodeId,'new');
    assert.deepEqual(h.trace.bodies[0].position,{x:140.5,y:-235});assert.equal(h.trace.bodies[0].revisionId,'r1');
    assert.equal(h.trace.flush,1);assert.equal(h.trace.sync.length,1);assert.equal(h.trace.sync[0].workspaceId,'w');assert.ok(h.trace.signals.every(value=>value===signal));
    assert.equal(h.nodes[0].data.text,'original unsent draft');assert.equal(h.nodes[0].selected,true);
    report.cases.push('surface '+kind+' exact identity/Presentation/position/native publication; release copied before async read, measurement settling allowed, old draft/selection retained');
  }
  {
    const h=harness('context',{losePost:true});const first=new AbortController();
    assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:first.signal})).status,'unconfirmed');first.abort();
    const second=new AbortController(),result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:second.signal,readOnly:true});
    assert.equal(result.status,'already-present');assert.equal(h.trace.flush,1,'GET-only recovery cannot flush a queued POST');
    assert.equal(h.trace.bodies.length,1);assert.equal(h.trace.signals.at(-1),second.signal);assert.equal(result.canonicalReceipt.node.id,'new');
    report.cases.push('lost committed surface response: one POST, new signal GET-only recovery without flush/replay, real native sync and exact canonical receipt');
  }
  {
    const h=harness('conversation',{losePost:true});const a=new AbortController();
    assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:a.signal})).status,'unconfirmed');a.abort();
    const b=new AbortController(),result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:b.signal,readOnly:true});
    assert.equal(result.status,'already-present');assert.equal(result.nodeId,undefined);assert.equal(h.trace.sync.length,0);assert.equal(h.nodes.length,1);
    assert.equal(h.trace.flush,1);assert.equal(h.trace.bodies.length,1);assert.ok(h.trace.methods.filter(m=>m.includes('/identity')).length===2);
    assert.equal(result.canonicalReceipt.relation.sourceEntityId,'conversation-artifact');assert.equal(h.trace.signals.at(-1),b.signal);
    report.cases.push('Glyth linked canonical identity -> durable relation endpoint validation, unknown/fresh-signal GET recovery, no material node/Canvas sync or Workspace write');
  }
  for(const replacement of ['api','scene','edit']){
    const h=harness('context',{onRead:({nodes})=>{if(replacement==='api')window.__LCOS_NODE_LAB__.api={};else if(replacement==='scene')window.__LCOS_NODE_LAB__.canvasId='other';else nodes[0].data.text='later draft'}});
    const result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:new AbortController().signal});assert.equal(result.status,'rejected');assert.equal(h.trace.bodies.length,0);assert.equal(h.trace.sync.length,0);
  }
  report.cases.push('original API/Canvas or true user edit changing during GET prevents all placement POST/native sync');
  for(const mutate of [r=>r.workspace_id='foreign',r=>r.target_ref={kind:'workflow',id:'foreign'},r=>r.file_record_id='foreign',r=>r.node.data.lcos_ref.revisionId='foreign',r=>r.presentation.state.positions.pinned={x:44,y:1},r=>r.presentation.state.memberViewIds='pinned']){
    const h=harness('context',{existing:true,mutateGet:mutate});const result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,readOnly:true,signal:new AbortController().signal});assert.equal(result.status,'unconfirmed');assert.equal(h.trace.sync.length,0);assert.equal(h.trace.flush,0);assert.equal(h.trace.bodies.length,0);
  }
  report.cases.push('foreign workspace/target/FileRecord and malformed exact native ref/Presentation position never confirm or synchronize');
  for(const options of [{mutatePost:r=>r.relation.sourceEntityId='wrong-conversation-artifact'}, {mutatePost:r=>r.node={id:'unexpected-material'}}]){
    const h=harness('conversation',options);assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent})).status,'unconfirmed');assert.equal(h.trace.sync.length,0);assert.equal(h.nodes.length,1);
  }
  report.cases.push('wrong conversation Artifact relation or unexpected material node is unconfirmed, not durable context success');
  for(const options of [{partial:true},{}, {existing:true,rejectSync:true},{existing:true,wrongLive:true}]){
    const h=harness('context',options),result=await receive(h.input,{api:h.api,isCurrent:h.isCurrent,readOnly:true});
    assert.equal(result.status,'unconfirmed');assert.equal(h.trace.bodies.length,0);assert.equal(h.trace.flush,0);
  }
  report.cases.push('readonly absent/partial, rejected native publication and wrong live revision preserve unknown without POST or flush');
  {
    const first=new AbortController();const h=harness('context',{afterPost:()=>first.abort()});
    assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:first.signal})).status,'unconfirmed');
    assert.equal(h.trace.sync.length,0);assert.equal(h.trace.bodies.length,1);
    const fresh=new AbortController();assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent,readOnly:true,signal:fresh.signal})).status,'already-present');
    assert.equal(h.trace.flush,1);assert.equal(h.trace.bodies.length,1);assert.equal(h.trace.signals.at(-1),fresh.signal);
  }
  report.cases.push('abort after peer commit is unknown, not rejected-success; fresh-signal GET-only recovers without another POST/flush');
  {
    const position={x:542.4233409610985,y:-191.24673913043478};
    const rounded=r=>{r.node.position={x:542.42,y:-191.25}};
    const h=harness('context',{position,mutatePost:rounded});
    assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent})).status,'placed');assert.deepEqual(h.nodes[1].position,{x:542.42,y:-191.25});
    const shifted=harness('context',{position,mutatePost:r=>{rounded(r);r.node.position.x+=0.01}});
    assert.equal((await receive(shifted.input,{api:shifted.api,isCurrent:shifted.isCurrent})).status,'unconfirmed');assert.equal(shifted.trace.sync.length,0);
    const wrongLive=harness('context',{position,mutatePost:rounded,liveOffset:0.01});
    assert.equal((await receive(wrongLive.input,{api:wrongLive.api,isCurrent:wrongLive.isCurrent})).status,'unconfirmed');
  }
  report.cases.push('known DC/PC round2 serialized position passes posted release and original live readback; extra 0.01 receipt/live displacement still cannot confirm');
  {
    const h=harness();const c=new AbortController();c.abort();assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent,signal:c.signal})).status,'rejected');assert.equal(h.trace.methods.length,0);
    h.input.position={x:Infinity,y:0};assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent})).status,'rejected');assert.equal(h.trace.methods.length,0);
    h.input.position=undefined;assert.equal((await receive(h.input,{api:h.api,isCurrent:h.isCurrent})).status,'rejected');assert.equal(h.trace.bodies.length,0);
  }
  report.cases.push('already-aborted/non-finite release refuses before transport; missing release point never becomes an automatic position or POST');
  report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};report.lastTrace=active?.trace;throw error}
finally{
  globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtime)+path.sep))throw new Error('Unexpected temporary client build path');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,failure:report.failure?.message,report:path.join(output,'report.json')}));
}
