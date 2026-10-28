import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Server} from 'node:net';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';

const root=process.cwd(),runtime=await fs.mkdtemp(path.join(root,'.runtime/native-color-postack-'));
const output=path.join(root,'output/普通颜色交错回执_20261027',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const saved=new Map(Object.entries(process.env).filter(([key])=>/^(LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key)));
for(const key of saved.keys())delete process.env[key];process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
const originalFetch=globalThis.fetch;let facade;
globalThis.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));const owned=process._getActiveHandles().some(handle=>{if(!(handle instanceof Server)||!handle.listening)return false;const address=handle.address();return address&&typeof address!=='string'&&['127.0.0.1','::1'].includes(address.address)&&String(address.port)===url.port;});assert.ok(owned&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only disposable Core owned ports');return originalFetch(input,init);};
const report={passed:false,mode:'fixed-regression',priorCounterexample:'output/普通颜色交错回执_20261027/2026-10-27T15-57-01-830Z/report.json',modelCalls:0,activeRuntimeTouched:false,scope:'Actual createNativeCanvasGuiMarkers production function + actual facade user/Agent named routes + original Huabu storage. Only outer readNodes timing is controlled; no live browser, model, raw SQL or mirrored write implementation.',cases:[],routes:[],checks:[]};
try{
  const entry=path.join(runtime,'fixture.ts'),rel=file=>path.relative(runtime,path.join(root,file)).replaceAll('\\','/');
  await fs.writeFile(entry,'export * from '+JSON.stringify(rel('lab/pilot/native-canvas-gui-markers.ts'))+';export {startSurfaceCoreFacade} from '+JSON.stringify(rel('lab/pilot/surface-core-facade.ts'))+';');
  const bundle=await buildPilotEntry(path.relative(root,entry),path.join(runtime,'fixture.mjs'),'node',{coreColorPin:true,coreCollectionTitle:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
  const module=await import(pathToFileURL(bundle).href);
  facade=await module.startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19993',fullIntegration:true,nativeRailPilot:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true});
  const canvasId='surface-core-main',projectId=facade.core.projectId,repository=facade.core.repository,red='F0606B',blue='4EA8FF';
  const specs=[
    {name:'add-red_then-Agent-add-blue',nodeId:'postack-add-red-add-blue',initial:[],present:true,concurrentColor:blue,concurrentPresent:true,expectedStatus:'confirmed',afterOwn:[red],final:[red,blue]},
    {name:'add-red_then-Agent-remove-red',nodeId:'postack-add-red-remove-red',initial:[],present:true,concurrentColor:red,concurrentPresent:false,expectedStatus:'rejected',afterOwn:[red],final:[]},
    {name:'remove-red_then-Agent-add-blue',nodeId:'postack-remove-red-add-blue',initial:[red],present:false,concurrentColor:blue,concurrentPresent:true,expectedStatus:'confirmed',afterOwn:[],final:[blue]},
  ];
  await facade.spatial.execute(canvasId,[{type:'CREATE_NODES',nodes:specs.map((spec,index)=>({id:spec.nodeId,nodeType:'note',position:{x:80+index*340,y:90},size:{width:280,height:180},data:{label:spec.name,content:'自有临时普通节点；不改正文、几何或任何领域对象。'}}))}]);
  const call=async(method,url,body)=>{report.routes.push({method,url,body:structuredClone(body)});const response=await facade.handle({method,url,body});assert.equal(response.status,200,JSON.stringify(response.body));return response.body.value??response.body.data??response.body;};
  for(const spec of specs.filter(spec=>spec.initial.length)){
    const setup=await call('POST','/api/lcos/canvases/'+encodeURIComponent(canvasId)+'/gui',{type:'SET_COLOR_PIN',nodeId:spec.nodeId,color:'#'+red,present:true});
    assert.equal(setup.status,'confirmed');assert.equal(setup.changed,true);
  }
  const domain={graph:structuredClone(repository.get(projectId)),execution:structuredClone(repository.getProjectExecutionProjection(projectId)),bindings:structuredClone(repository.getProjectionBindings(projectId)),markers:structuredClone(repository.listSpatialMarkerIntents(projectId))};
  const bytesBefore=await Promise.all(domain.graph.fileRecords.map(async file=>[file.id,Buffer.from(await fs.readFile(file.observedPath))]));
  for(const spec of specs){
    const test={name:spec.name,passed:false,timeline:[]};report.cases.push(test);
    const before=structuredClone(await facade.spatial.read(canvasId)),routeStart=report.routes.length;
    let reads=0,ownReceipt,concurrentResult,interleaved=false,commits=0;
    const operation={type:'SET_COLOR_PIN',nodeId:spec.nodeId,color:'#'+red,present:spec.present};
    const adapter=module.createNativeCanvasGuiMarkers({projectId,repository,
      resolveCanvas(id){const graph=repository.get(projectId),owners=graph.workspaces.filter(workspace=>workspace.canvasId===id&&!workspace.archivedAt);return owners.length===1?{projectId,canvasId:id,workspaceId:owners[0].id,surfaceRef:id==='surface-core-main'?'main':'workspace:'+owners[0].id}:undefined;},
      async readNodes(id){
        reads++;test.timeline.push({event:'outer-production-adapter-readNodes',read:reads});
        if(reads===3){
          assert.equal(ownReceipt?.spatialSaved,true,'Own real ACK must precede its postread');
          const current=(await facade.spatial.read(canvasId)).state.nodes.find(node=>node.id===spec.nodeId);
          assert.deepEqual(current.data.color_pins,spec.afterOwn);
          test.timeline.push({event:'own-valid-ACK-before-concurrent-route',receipt:structuredClone(ownReceipt),colors:structuredClone(current.data.color_pins)});
          concurrentResult=await call('POST','/api/rfs/'+encodeURIComponent(canvasId)+'/gui',{type:'SET_COLOR_PIN',nodeId:spec.nodeId,color:'#'+spec.concurrentColor,present:spec.concurrentPresent});
          assert.equal(concurrentResult.status,'confirmed',JSON.stringify(concurrentResult));assert.equal(concurrentResult.changed,true);
          test.timeline.push({event:'Agent-original-named-route-confirmed',receipt:concurrentResult.spatialReceipt});interleaved=true;
        }
        return(await call('GET','/api/canvas/v1/canvases/'+encodeURIComponent(id))).nodes;
      },
      requestCore:async(method,url,body)=>facade.handle({method,url:'/api/lcos/core'+url,body}),
      async commitNativeGui(id,target,patch,expected,originator){
        commits++;assert.equal(id,canvasId);assert.equal(target,spec.nodeId);assert.equal(originator,'user');
        assert.deepEqual(expected.value,spec.initial);assert.deepEqual(patch,{color_pins:spec.afterOwn});
        // Use the actual named user producer, including its original mutex,
        // raw identity and field CAS. Do not mirror its MERGE implementation.
        const value=await call('POST','/api/lcos/canvases/'+encodeURIComponent(id)+'/gui',operation);
        assert.equal(value.status,'confirmed',JSON.stringify(value));assert.equal(value.changed,true);ownReceipt=value.spatialReceipt;return ownReceipt;
      }});
    const result=await adapter.operate(canvasId,operation,'user');
    assert.equal(interleaved,true);assert.equal(reads,3);assert.equal(commits,1);assert.equal(result.status,spec.expectedStatus);assert.equal(result.changed,true);assert.equal(result.pending,undefined);assert.deepEqual(result.spatialReceipt,ownReceipt);
    const after=await facade.spatial.read(canvasId),target=after.state.nodes.find(node=>node.id===spec.nodeId);
    assert.deepEqual(target.data.color_pins,spec.final);
    const routes=report.routes.slice(routeStart),mutations=routes.filter(route=>route.method!=='GET');
    assert.equal(mutations.length,2);assert.equal(mutations.filter(route=>route.url.includes('/api/lcos/canvases/')).length,1);assert.equal(mutations.filter(route=>route.url.includes('/api/rfs/')).length,1);
    assert.equal(after.version,before.version+2);
    const clean=value=>{const copy=structuredClone(value);delete copy.version;delete copy.updatedAt;for(const node of copy.state.nodes)if(node.id===spec.nodeId)delete node.data.color_pins;return copy;};
    assert.deepEqual(clean(after),clean(before),'Only this case node colors and spatial version/time may differ');
    assert.deepEqual(repository.get(projectId),domain.graph);assert.deepEqual(repository.getProjectExecutionProjection(projectId),domain.execution);assert.deepEqual(repository.getProjectionBindings(projectId),domain.bindings);assert.deepEqual(repository.listSpatialMarkerIntents(projectId),domain.markers);
    Object.assign(test,{passed:true,result,actualColors:target.data.color_pins,requestedIntentSatisfied:target.data.color_pins.includes(red)===spec.present,ownCommitCalls:commits,mutations:mutations.length,spatialVersionIncrement:after.version-before.version});
  }
  for(const[id,bytes]of bytesBefore){const file=domain.graph.fileRecords.find(file=>file.id===id);assert.ok((await fs.readFile(file.observedPath)).equals(bytes));}
  report.passed=true;
  report.checks.push('Add red then unrelated blue: confirmed; remove red then unrelated blue: confirmed, both after valid own ACK.');
  report.checks.push('Add red then concurrent removal of the same red: rejected/changed=true, original saved receipt retained, one own commit and no replay.');
  report.checks.push('Every case uses actual production adapter plus actual named user/Agent routes; precommit whole-field CAS/raw identity remain original. Exactly two writes and two spatial version increments per case.');
  report.checks.push('Full Core graph/execution/bindings/markers, all original file bytes, body/label/geometry and all other nodes preserved. No active runtime or model calls.');
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{await facade?.close();globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(/^(LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|DEEPSEEK_)/.test(key))delete process.env[key];for(const[key,value]of saved)process.env[key]=value;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({output,passed:report.passed,cases:report.cases,checks:report.checks,error:report.error,modelCalls:0,activeRuntimeTouched:false},null,2));
