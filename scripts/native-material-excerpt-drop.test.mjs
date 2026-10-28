import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFileUploadScript } from '../lab/native-file-upload-transform.mjs';
import { transformNativeMaterialExcerptDropScript as transform } from '../lab/native-material-excerpt-drop-transform.mjs';

const root=path.resolve(import.meta.dirname,'..'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const runtime=path.join(root,'.runtime/native-material-excerpt-'+stamp),output=path.join(root,'output/画布摘录Drop_20261027/原接收与序列化专项',stamp);
await fs.mkdir(runtime,{recursive:true});await fs.mkdir(output,{recursive:true});
const require=createRequire(path.join(installedRoot,'huabu/apps/web/package.json')),{Window}=require('happy-dom');
const dom=new Window();dom.document.body.innerHTML='<div class="react-flow" id="canvas"><div class="react-flow__pane" id="blank"></div><div class="react-flow__node" id="node"></div></div><div data-media-viewer id="modal"></div><div data-library-panel id="library"></div><textarea id="composer"></textarea>';
const document=dom.document,wrapper=document.querySelector('#canvas'),blank=document.querySelector('#blank');
const report={passed:false,cases:[],networkRequests:0,modelCalls:0,liveCoreAccessed:false,
  scope:'Actual original c7 callbacks after file+excerpt transforms, actual fi/XD, original M8 and whole r6 send function; actual DOM ancestors with controlled hit-test/React/request leaves. No whole App, real mouse Drop, active Core or persistence claim.'};
const priorWindow=globalThis.window;globalThis.window=dom;
const copy=value=>JSON.parse(JSON.stringify(value)),assets=path.join(root,'reference/tapnow-installed/resources/web/assets');
const source=await fs.readFile(path.join(assets,'page-Da_DfwiK.js'),'utf8'),withFiles=transformNativeFileUploadScript('page-Da_DfwiK.js',source),changed=transform('page-Da_DfwiK.js',withFiles),ast=parse(changed,'page-Da_DfwiK.js');
const walk=(node,visit)=>{if(!node?.type)return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value?.type)walk(value,visit);};
const binding=(s,a,name)=>{const rows=a.body.flatMap(row=>row.declarations??[row]).filter(row=>row.id?.name===name);assert.equal(rows.length,1,name+' unique');const n=rows[0];return n.type==='VariableDeclarator'?s.slice(n.init.start,n.init.end):s.slice(n.start,n.end);};
const callbacks={};walk(ast,node=>{if(node.type==='VariableDeclarator'&&node.id?.name==='c7')walk(node.init,part=>{if(part.type==='VariableDeclarator'&&['m','p','x','f','g'].includes(part.id?.name)&&part.init?.callee?.property?.name==='useCallback')callbacks[part.id.name]=changed.slice(part.init.arguments[0].start,part.init.arguments[0].end);});});
const oldAst=parse(withFiles,'page-Da_DfwiK.js'),oldCallbacks={};let originalEffect,changedEffect;
for(const [s,a,out]of[[withFiles,oldAst,oldCallbacks],[changed,ast,{}]])walk(a,node=>{if(node.type==='VariableDeclarator'&&node.id?.name==='c7')walk(node.init,part=>{
  if(part.type==='VariableDeclarator'&&['f','g'].includes(part.id?.name)&&part.init?.callee?.property?.name==='useCallback')out[part.id.name]=s.slice(part.init.arguments[0].start,part.init.arguments[0].end);
  if(part.type==='CallExpression'&&part.callee?.property?.name==='useEffect'&&s.slice(part.start,part.end).includes('document.addEventListener')){if(s===withFiles)originalEffect=s.slice(part.start,part.end);else changedEffect=s.slice(part.start,part.end);}
});});
assert.equal(callbacks.f,oldCallbacks.f,'Original paste callback unchanged');assert.equal(callbacks.g,oldCallbacks.g,'Original leave callback unchanged');assert.equal(changedEffect,originalEffect,'Original document subscription/cleanup is unchanged');
assert.equal(transform('page-Da_DfwiK.js',changed),changed);assert.equal(transform('other.js',source),source);
assert.throws(()=>transform('page-Da_DfwiK.js',source),/foremost/);
const donor=await fs.readFile(path.join(assets,'UnlimitedModeToggle-D4wysAbz.js'),'utf8'),donorAst=parse(donor,'UnlimitedModeToggle-D4wysAbz.js');
let serial=0;
const factory=vm.runInNewContext('('+binding(donor,donorAst,'XD')+')',{
  Ru:{getState:()=>({mergedPolicy:{canvasMeta:{ignoreLocalRuntimeCache:true}}})},ma:{get(){}},Di:{MODEL_PREFS:'unused'},SM:'original-model',Wa:{'original-model':{}},kM:()=>({}),ie:{TEXT:'text'},Pu:()=>String(++serial),sd:{GENERATE:'generate'},zp:{getState:()=>({selectedNodeCount:0})},ar:{width:250,height:250},
});
try{
  const bundle=await buildPilotEntry('lab/pilot/native-material-excerpt-drop.ts',path.join(runtime,'excerpt.mjs'));
  const leaf=await import(pathToFileURL(bundle).href),MIME='application/x-lcos-material-transfer';
  const payload={schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-27T00:00:00Z',source:{projectId:'p',artifactId:'parent',revisionId:'parent-old',fileRecordId:'file-old',viewId:'old-view',title:'Original material',locator:{kind:'selection',textRange:{start:7,end:15,quote:'old text'}}},content:{kind:'text',text:'old text'}};
  const event=(value=payload,target=blank,types=[MIME,'text/plain'])=>{let prevented=false;return{target,clientX:310,clientY:220,dataTransfer:{types,files:[],dropEffect:'none',getData:mime=>mime===MIME?(typeof value==='string'?value:JSON.stringify(value)):'not a second source'},get defaultPrevented(){return prevented},preventDefault(){prevented=true},stopPropagation(){this.stopped=true}};};
  const fixture=()=>{
    const nodes=[],submitted=[],calls=[],notices=[],dragEvents=[],accepted=new Map();let semantic='idle',hit=blank,held,resolveFlush,readOnly=false,tool=false;
    const api={getPointerInteraction:()=>({interactivityLocked:readOnly,explicitToolActive:tool}),getNodes:()=>nodes,flushCanvas:async()=>{
      calls.push('flush');if(held)await new Promise(resolve=>{resolveFlush=resolve});
      const node=nodes.at(-1);if(node){const clientNodeId=node.id;node.id='canonical-'+clientNodeId;node.data={...node.data,id:node.id,lcos_ref:{version:1,entityType:'artifact',entityId:'child',artifactId:'child',artifactViewId:'child-view',revisionId:'child-revision'}};delete node.data.lcos_material_excerpt;accepted.set(clientNodeId,{nodeId:node.id,lcos_ref:node.data.lcos_ref});}
      return 'saved';
    }};
    let world={projectId:'p',canvasId:'c',workspaceId:'w',api,wrapper};
    const ports={world:()=>world,semanticStatus:()=>semantic,hit:()=>hit,acceptedReceipt:input=>input.projectId==='p'&&input.canvasId==='c'&&input.api===api?accepted.get(input.clientNodeId):undefined,
      claim:value=>{dragEvents.push({kind:'claim',payload:copy(value),beforeAdd:calls.length===0});return true},report:(value,result)=>dragEvents.push({kind:'result',payload:copy(value),result})};
    const owner=leaf.createNativeMaterialExcerptDropOwner('c',ports);owner.activate();
    const create={factory,addNodes:items=>{calls.push('add');submitted.push(...copy(items));nodes.push(...items)},screenToFlowPosition:point=>({x:point.x-10.125,y:point.y-20.25}),notice:{error:message=>notices.push({tone:'error',message}),success:message=>notices.push({tone:'success',message})}};
    return{owner,create,nodes,submitted,calls,notices,dragEvents,ports,api,world,accepted,setWorld:value=>{world=value},setHit:value=>{hit=value},setSemantic:value=>{semantic=value},setReadOnly:value=>{readOnly=value},setTool:value=>{tool=value},hold:()=>{held=true},release:()=>{held=false;resolveFlush()},};
  };
  let f=fixture(),e=event();assert.equal(f.owner.over(e),true);assert.equal(e.dataTransfer.dropEffect,'copy');assert.equal(f.owner.label(),'松开放置摘录');
  // A fresh drop event is distinct from its preceding dragover event.
  const result=await f.owner.drop(event(),f.create);if(result.status!=='saved')report.debug={result,nodes:f.nodes,calls:f.calls,accepted:[...f.accepted],notices:f.notices};assert.equal(result.status,'saved');assert.deepEqual(f.calls,['add','flush']);assert.equal(f.nodes.length,1);
  const node=f.submitted[0];assert.equal(node.type,'text');assert.equal(node.data.type,'pure');assert.equal(node.data.text,'old text');assert.deepEqual(copy(node.position),{x:299.875,y:199.75});assert.deepEqual(copy(node.data.lcos_material_excerpt),payload);assert.equal(f.nodes[0].data.lcos_material_excerpt,undefined);assert.notEqual(f.nodes[0].id,node.id);
  assert.equal(f.dragEvents[0].kind,'claim');assert.equal(f.dragEvents[0].beforeAdd,true);assert.equal(f.dragEvents[1].result,'saved');assert.deepEqual(f.dragEvents[0].payload,f.dragEvents[1].payload);
  report.cases.push('Actual fi/XD creates one original pure text carrier with exact old-version payload and exact released world point; one add/flush, no parent placement');
  for(const change of ['bad-json','cross-project','quote-mismatch','invalid-range','group-unselected','non-text']){
    f=fixture();const value=copy(payload);if(change==='cross-project')value.source.projectId='foreign';if(change==='quote-mismatch')value.content.text='different text';if(change==='invalid-range')value.source.locator.textRange.end=22;
    if(change==='group-unselected')value.source.locator={kind:'selection',locations:[value.source.locator,{kind:'lines',start:0,end:1}]};if(change==='non-text')value.content={kind:'image',dataUrl:'data:image/png;base64,AA==',mimeType:'image/png'};
    assert.equal((await f.owner.drop(event(change==='bad-json'?'{broken':value),f.create)).status,'rejected');assert.deepEqual(f.calls,[]);assert.equal(f.notices.length,1);assert.deepEqual(f.dragEvents,[]);
  }
  for(const shape of ['no-view','legacy','selected-group']){f=fixture();const value=copy(payload);if(shape==='no-view')delete value.source.viewId;if(shape==='legacy')value.source.locator={kind:'lines',start:2,end:3,label:'original'};if(shape==='selected-group'){const single=value.source.locator;value.source.locator={kind:'selection',locations:[{kind:'lines',start:1,end:1},single],selected:single};}assert.equal((await f.owner.drop(event(value),f.create)).status,'saved');assert.deepEqual(copy(f.submitted[0].data.lcos_material_excerpt),value);}
  report.cases.push('Invalid own MIME consumes with original notice and zero creation/plain fallback; no-view exact source, legacy locator and explicit group selected preserved');
  for(const state of ['tracking','dwell','preview','committing']){f=fixture();f.setSemantic(state);assert.equal(f.owner.over(event()),false);assert.equal((await f.owner.drop(event(),f.create)).status,'owned');assert.deepEqual(f.calls,[]);assert.deepEqual(f.notices,[]);}
  for(const blocked of ['modal','node','different-wrapper','readonly','tool','policy','missing-flush','old-owner']){
    f=fixture();let target=blank;if(blocked==='modal')f.setHit(document.querySelector('#modal'));if(blocked==='node')f.setHit(document.querySelector('#node'));
    if(blocked==='different-wrapper')target=document.querySelector('#modal');if(blocked==='readonly')f.setReadOnly(true);if(blocked==='tool')f.setTool(true);if(blocked==='policy')f.create.allowedCreateTypes=['IMAGE'];if(blocked==='missing-flush')delete f.api.flushCanvas;if(blocked==='old-owner')f.owner.dispose();
    assert.equal((await f.owner.drop(event(payload,target),f.create)).status,'rejected');assert.deepEqual(f.calls,[]);
  }
  report.cases.push('Existing semantic Drop wins; real modal/node/wrapper identity, original readonly/tool/policy and inactive owner reject without native selection or creation');
  for(const change of ['project','canvas','workspace','api','wrapper','unmount','effect-replay']){
    f=fixture();f.hold();const pending=f.owner.drop(event(),f.create);await Promise.resolve();assert.equal(f.calls[0],'add');assert.equal(f.calls[1],'flush');
    if(change==='unmount'||change==='effect-replay'){f.owner.dispose();if(change==='effect-replay')f.owner.activate();}
    else f.setWorld({...f.world,[change==='project'?'projectId':change==='canvas'?'canvasId':change==='workspace'?'workspaceId':change]:change==='api'?{}:change==='wrapper'?document.body:'foreign'});
    f.release();assert.equal((await pending).status,'stale');assert.equal(f.notices.length,0);assert.equal(f.nodes.length,1);assert.equal(f.dragEvents.at(-1).result,'stale');
  }
  f=fixture();f.api.flushCanvas=async()=>{throw new TypeError('Failed to fetch')};assert.equal((await f.owner.drop(event(),f.create)).status,'unconfirmed');assert.equal(f.calls.filter(x=>x==='add').length,1);assert.ok(f.notices[0].message.includes('勿重复'));assert.ok(!f.notices[0].message.includes('fetch'));
  report.cases.push('Pending flush never creates twice; project/canvas/workspace/API/wrapper/unmount/replay invalidate late notices; failed/unknown save has no automatic retry');
  f=fixture();const listeners=new Set(),queued=[];f.api.subscribeNative=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
  f.create.addNodes=items=>{f.calls.push('add');f.submitted.push(...copy(items));queued.push(...items)};
  const layoutPending=f.owner.drop(event(),f.create);await Promise.resolve();assert.deepEqual(f.calls,['add'],'No early flush before original ReactFlow node publication');
  f.nodes.push(...queued);for(const listener of listeners)listener();assert.equal((await layoutPending).status,'saved');assert.deepEqual(f.calls,['add','flush']);assert.equal(listeners.size,0);
  f=fixture();f.api.flushCanvas=async()=>{f.calls.push('flush');const node=f.nodes[0],ref={version:1,entityType:'artifact',entityId:'child',artifactId:'child',artifactViewId:'child-view',revisionId:'child-revision'};node.data={...node.data,lcos_ref:ref};delete node.data.lcos_material_excerpt;f.accepted.set(node.id,{nodeId:node.id,lcos_ref:ref});return 'saved';};assert.equal((await f.owner.drop(event(),f.create)).status,'saved','Accepted same-ID receipt is legitimate too');
  report.cases.push('Original publication subscription precedes flush; delayed native layout still adds once, exact remapped or same-ID receipt is required, listeners released');
  f=fixture();f.create.factory=()=>{throw Error('Controlled original factory failure')};assert.equal((await f.owner.drop(event(),f.create)).status,'rejected');assert.equal(f.dragEvents.at(-1).result,'rejected');assert.deepEqual(f.calls,[]);
  f=fixture();f.api.flushCanvas=async()=>{throw Error('controlled missing response')};assert.equal((await f.owner.drop(event(),f.create)).status,'unconfirmed');assert.equal(f.dragEvents.at(-1).result,'unconfirmed');assert.equal(f.calls.filter(value=>value==='add').length,1);
  f=fixture();f.ports.claim=()=>false;assert.equal((await f.owner.drop(event(),f.create)).status,'saved');assert.deepEqual(f.dragEvents,[]);
  report.cases.push('Only admitted exact Reader drag is claimed before original add; saved/rejected/unconfirmed/stale follow the actual receiver result, never browser copy effect or an unrelated source');
  // Execute the actual transformed original c7 callbacks. Only hook-provided
  // controls, policy, hit testing and transport are fixture leaves.
  f=fixture();const calls=[],controls={__lcosExcerpt:f.owner,__lcosExcerptAddNodes:f.create.addNodes,__lcosExcerptPolicy:{nodes:{}},fi:factory,se:f.create.notice,s:f.create.screenToFlowPosition,c:value=>calls.push(['mask',value]),LCOSNativeFileUploadEventOwned:event=>!!event.target?.closest('[data-library-panel],textarea'),
    u:()=>false,i:()=>calls.push('original-deselect'),t:()=>1,ul:()=>true,o:key=>key,h:async(files,point)=>calls.push({files:[...files],point}),LCOSNativeFileUploadCanRead:(_file,original)=>original(),d:false,LCOSNativeFileUploadCanTransfer:()=>false};
  const handlers=new Function('controls','with(controls){return{'+Object.entries(callbacks).map(([name,body])=>name+':'+body).join(',')+'}}')(controls);
  await handlers.x(event());assert.equal(f.nodes.length,1);assert.equal(calls.includes('original-deselect'),false);
  for(const id of ['library','composer']){const before=f.nodes.length,ev=event(payload,document.querySelector('#'+id));await handlers.x(ev);assert.equal(ev.defaultPrevented,false);assert.equal(f.nodes.length,before);}
  const normal=event('',blank,['Files']);normal.dataTransfer.files=[{name:'original.txt'}];await handlers.x(normal);assert.ok(calls.includes('original-deselect'));assert.ok(calls.some(row=>row.files?.[0]?.name==='original.txt'));
  const count=f.nodes.length;await handlers.x(event('',blank,['text/plain']));assert.equal(f.nodes.length,count);assert.equal(f.owner.over(event('',blank,['text/plain'])),undefined);
  report.cases.push('Actual c7 x executes narrow MIME before native deselection/file branch; Composer/Library original guard remains first, normal file/plain behavior remains original');
  // Whole original r6 executes its own create DTO and pp, not a replacement
  // serializer. Network/hook scheduling are explicit isolated fixture leaves.
  const rawAst=parse(source,'page-Da_DfwiK.js'),sends=[],context={console,Date,Promise,Map,Set,Object,Array,Math,Number,String,Boolean,JSON,Error,structuredClone,setTimeout,clearTimeout,
    dn:()=>({warn(){},error(){}}),$e:()=>({getEdge(){}}),he:()=>({t:key=>key}),vd:()=>()=>{},bs:{batchOperateNodes:'nodes',batchOperateLinks:'edges'},Sg:{},t6:()=>({recordPersistFailure(){},recordPersistSuccess(){},syncPersistStatus(){}}),
    GN:()=>false,WN:()=>false,YN:(_id,_owner,run)=>run(),$N(){},ix:()=>false,ox:()=>false,ff:JSON.stringify,kl:()=>Promise.resolve(),Fi:{maxRetries:0},v0:25000,se:{error(){}},kP:'__'};
  context.l={useMemo:run=>run(),useCallback:run=>run,useRef:value=>({current:value}),useEffect(){}};context.zi=route=>({abort(){},send:async body=>{sends.push({route,body:copy(body)});return{code:0,data:{}}}});context.window=context;
  const sandbox=vm.createContext(context);for(const name of ['pp','DC','PC','b0','s6','n6','M8','r6'])context[name]=vm.runInContext('('+binding(source,rawAst,name)+')',sandbox);
  const q=context.r6({canvasId:'c',onNodesChange(){},onEdgesChange(){}}),original=factory({type:'pure',text:'old text',prompt:'',lcos_material_excerpt:copy(payload)},{position:{x:12.345,y:23.456}});
  await q.executeBatchOperations(context.M8([{type:'add',item:original}],123),[]);
  assert.equal(sends.length,1);const creates=sends[0].body.actions.flatMap(action=>action.creates??[]);assert.equal(creates.length,1);assert.equal(creates[0].data.lcos_ref,undefined);assert.deepEqual(creates[0].data.lcos_material_excerpt,payload);assert.equal(creates[0].data.text,payload.content.text);assert.equal(creates[0].type,'text');
  report.wire=creates[0];report.cases.push('Actual original fi/XD → M8 → whole r6 → pp → one original request.send retains exact payload/text and never invents lcos_ref');
  report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}finally{
  globalThis.window=priorWindow;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report},null,2));
}
