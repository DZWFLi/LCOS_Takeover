import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=(await fs.readFile(path.join(root,'scripts/native-material-placement.test.mjs'),'utf8')).replace(
  "    `export {createNativeMaterialPlacement}","    `export {receiveNativeLibraryMaterial} from ${JSON.stringify(relative('lab/pilot/native-material-receive-client.ts'))};`,\n    `export {createNativeMaterialPlacement}");
const seam='  const repeated = await placement.place(destination.id, input);';
if(source.split(seam).length!==2)throw new Error('Disposable producer fixture changed');
const original=process.argv.includes('--expect-original-failure');
const output=path.join(root,'output/原生文本整合_20261017e/Drop原序列化精度验证',new Date().toISOString().replaceAll(':','-').replace('.','-'));
await fs.mkdir(output,{recursive:true});
const driver=`
  const point={x:542.4233409610985,y:-191.24673913043478},persisted={x:542.42,y:-191.25};
  const selected={projectId,artifactId:input.artifactId,revisionId:input.revisionId,fileRecordId:input.fileRecordId,targetRef:{kind:'main'}};
  const route='/api/lcos/canvases/'+main.id+'/materials:receive';
  const first=await call('POST',route,{...selected,position:point});assert.equal(first.status,200,JSON.stringify(first.body));
  const node=first.body.data.node;
  const save=async(position)=>{const response=await call('POST','/api/canvas/v1/canvases/'+main.id+'/nodes:batchActions',
    {canvas_id:main.id,actions:[{action:'update',updates:[{id:node.id,type:node.type,position,measured:{width:375,height:250}}]}]});
    assert.equal(response.status,200,JSON.stringify(response.body));};
  const read=async()=>{const response=await call('GET',route+'?'+new URLSearchParams({...selected,targetRef:JSON.stringify(selected.targetRef)}));assert.equal(response.status,200,JSON.stringify(response.body));return response.body.data};
  await save(persisted);const rounded=await read();
  assert.equal(rounded.state,${JSON.stringify(original?'partial':'present')});
  const raw=(await canvas(main.id)).nodes.find(n=>n.id===node.id);assert.deepEqual(raw.position,persisted);
  const presentation=repository.getPresentationView(projectId,first.body.data.presentation.id);
  assert.deepEqual(presentation.state.positions[first.body.data.artifact_view_id],point);
  assert.equal(presentation.version,first.body.data.presentation.version,'native measurement echo must not mutate the original Presentation version');
  if(!${original}){
    const oldWindow=globalThis.window,transport=globalThis.fetch,methods=[];
    try{
      const nodes=(await canvas(main.id)).nodes;const signal=new AbortController().signal;
      const api={getNodes:()=>nodes,getEdges:()=>[],flushCanvas:()=>{throw new Error('GET recovery must not flush')},synchronizeMaterialProjection:async()=>({ok:true})};
      globalThis.window={__LCOS_NODE_LAB__:{projectId,canvasId:main.id,api}};
      globalThis.fetch=async(url,options={})=>{if(/^https?:/.test(String(url)))return transport(url,options);methods.push(options.method??'GET');assert.equal(options.signal,signal);
        const value=await call(options.method??'GET',String(url),options.body?JSON.parse(options.body):undefined);return Response.json(value.body,{status:value.status})};
      const checked=await module.receiveNativeLibraryMaterial({...selected,canvasId:main.id,workspaceId:first.body.data.workspace_id},
        {api,isCurrent:()=>true,readOnly:true,signal});
      assert.equal(checked.status,'already-present',JSON.stringify(checked));assert.equal(checked.nodeId,node.id);assert.deepEqual(methods,['GET']);
      report.cases.push('actual receive client against real rounded Core receipt confirms GET-only without flush/POST; publication callback controlled, not original O8');
    }finally{globalThis.fetch=transport;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow}
  }
  const legitimate={x:persisted.x+0.01,y:persisted.y};
  if(!${original}){await save(legitimate);assert.equal((await read()).state,'present');
    assert.deepEqual(repository.getPresentationView(projectId,first.body.data.presentation.id).state.positions[first.body.data.artifact_view_id],legitimate)}
  // This negative is a deliberate inconsistent spatial-only fault. A legal
  // native +0.01 move now synchronizes its Presentation through the same writer.
  await facade.spatial.execute(main.id,[{type:'SET_NODE_GEOMETRY',items:[{nodeId:node.id,position:{x:legitimate.x+0.01,y:legitimate.y}}]}]);
  const displaced=await read();assert.equal(displaced.state,'partial');
  const workflow=repository.getWorkspaces(projectId).find(w=>w.canvasId==='surface-core-workflow');
  const workspaceCarrier=await placement.place(workflow.canvasId,{...input,workspaceId:String(workflow.id),position:point});
  const saved=await call('POST','/api/canvas/v1/canvases/'+workflow.canvasId+'/nodes:batchActions',
    {canvas_id:workflow.canvasId,actions:[{action:'update',updates:[{id:workspaceCarrier.node.id,type:workspaceCarrier.node.type,position:persisted,measured:{width:375,height:250}}]}]});
  assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal((await placement.inspect(workflow.canvasId,{...input,workspaceId:String(workflow.id)})).state,'present');
  report.cases.push(${JSON.stringify(original?'REPRODUCED: real batchActions round2 measurement makes semantic GET partial while Presentation keeps exact released point':'FIXED: real batchActions round2 measurement remains present by the existing original DC/PC placement equivalence')});
  report.cases.push('legal native +0.01 move synchronizes and confirms; a controlled spatial-only +0.01 drift bypassing that bridge remains partial, with membership/Revision/ref unchanged');
  report.cases.push('Workspace inspect already returns real saved carrier without strict Presentation-position equality: no matching false-partial issue, no Workspace position protection changed');
  report.precision={released:point,persisted,semanticState:rounded.state,displacedState:displaced.state,originalFailureReproduction:${original}};
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length,0);report.writes=['isolated actual original View/Assembly/projector and batchActions geometry measurement updates'];report.passed=true;
}finally{
  await facade?.close();globalThis.fetch=originalFetch;await fs.writeFile(${JSON.stringify(path.join(output,'report.json'))},JSON.stringify(report,null,2));
  if(!temp.startsWith(path.resolve(runtimeBase)+path.sep))throw new Error('Unexpected precision runtime');await fs.rm(temp,{recursive:true,force:true});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,precision:report.precision,report:${JSON.stringify(path.join(output,'report.json'))}}));
}
`;
const generated=path.join(root,'.runtime/native-material-precision-'+Date.now()+'.mjs');await fs.mkdir(path.dirname(generated),{recursive:true});
await fs.writeFile(generated,source.slice(0,source.indexOf(seam))+driver);
try{await import(pathToFileURL(generated).href)}finally{await fs.unlink(generated)}
