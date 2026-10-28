import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { Server } from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runtime = path.join(root, '.runtime/isolated-native-emphasis-' + randomUUID());
await fs.mkdir(runtime, { recursive: true });
const output = path.join(root, 'output/Agent纯GUI强调_20261027/真实Core与MCP', stamp);
await fs.mkdir(output, { recursive: true });
const keys = ['HUABU_CONNECTION_TOKEN','LCOS_RECOVERY_TRANSPORT','LCOS_CAPTURE_STAGING_ROOT','LCOS_OCR_RUNTIME_DIR','LCOS_OLLAMA_URL'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
process.env.HUABU_CONNECTION_TOKEN = 'e'.repeat(64); // owned disposable credential, never a running Host key
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr'); process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
const originalFetch = globalThis.fetch;
const report = { passed: false, checks: [], modelCalls: 0, activeRuntimeTouched: false, userProjectFilesWritten: false,
  scope: 'Actual isolated Core/SQLite/Huabu facade + original MERGE_NODE_DATA emphasis subset + real installed MCP stdio client/server over owned authenticated loopback HTTP. No provider or real page.', requests: [], runtime };
let facade, server, streamRequest, streamResponse, serial = 0;
const owned = () => new Set(process._getActiveHandles().filter(handle => handle instanceof Server && handle.listening).flatMap(handle => {
  const address = handle.address(); return address && typeof address !== 'string' && ['127.0.0.1','::1'].includes(address.address)
    ? ['http://' + (address.address === '::1' ? '[::1]' : address.address) + ':' + address.port] : [];
}));
globalThis.fetch = (address, options) => {
  assert(owned().has(new URL(String(address)).origin), 'only this test process loopback servers are allowed');
  return originalFetch(address, options);
};
const until = async predicate => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw Error('Expected original save/SSE state was not observed'); await new Promise(resolve => setTimeout(resolve, 5)); } };
const python = process.argv.find(value => value.startsWith('--python='))?.slice(9)
  ?? 'C:/Users/1/AppData/Local/Programs/Python/Python312/python.exe';
const childEnv = Object.fromEntries(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','LANG','LC_ALL']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
async function mcp(tool, argumentsValue, canvasId = 'surface-core-main') {
  const file = path.join(runtime, 'arguments-' + ++serial + '.json'); await fs.writeFile(file, JSON.stringify(argumentsValue));
  const args = ['-X','utf8',path.join(root,'scripts/native-space-kernel-mcp-client.py'),'--runtime-label',path.basename(runtime),'--canvas',canvasId,
    ...(tool ? ['--tool',tool,'--arguments-file',file] : [])];
  return new Promise((resolve, reject) => {
    const child = spawn(python,args,{cwd:root,env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']}); let out='',err='';
    child.stdout.on('data',value=>out+=value); child.stderr.on('data',value=>err+=value);
    child.once('error',reject); child.once('exit',code=>{if(code)reject(Error('Owned MCP test failed: '+err.slice(0,1000)+'\n'+err.slice(-1600)));else try{resolve(JSON.parse(out));}catch(error){reject(error);}});
  });
}
try {
  const bundle = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtime,'facade.mjs'),'node',
    {coreCollectionTitle:true,coreColorPin:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
  const {startSurfaceCoreFacade} = await import(pathToFileURL(bundle));
  const start = () => startSurfaceCoreFacade({runtimeRoot:path.join(runtime,'owned'),publicOrigin:'http://127.0.0.1:19947',fullIntegration:true,
    nativeRailPilot:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true});
  facade = await start();
  const call = (method,url,body) => facade.handle({method,url,body});
  const main='surface-core-main', target='surface-main-image', base='/api/rfs/'+main, projectId=facade.core.projectId;
  const graph = async () => { const value=await call('GET','/api/lcos/core/projects/'+projectId+'/graph'); assert.equal(value.status,200); return value.body.value; };
  const graphBefore=await graph(), otherBefore=await facade.spatial.read('surface-core-workflow');
  const initial=await facade.spatial.read(main), nodeBefore=structuredClone(initial.state.nodes.find(node=>node.id===target));
  const presentationSchema=await call('GET',base+'/capabilities/commands/MERGE_NODE_DATA');
  assert.equal(presentationSchema.status,200); assert.deepEqual(Object.keys(presentationSchema.body.schema.properties.patches.items.properties.patch.properties),['lcos_gui_emphasis']);
  server=http.createServer(async(req,res)=>{
    try {
      if(!facade.authorizeKernel(req.headers.authorization)){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":{"code":"SPACE_AUTHENTICATION_REQUIRED"}}');return;}
      const url=new URL(req.url,'http://127.0.0.1');
      if(await facade.handleCanvasSyncStream(req,res,url))return;
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):undefined;
      report.requests.push({method:req.method,path:url.pathname,command:body?.commands?.[0]?.type});
      const result=await call(req.method,url.pathname,body);res.writeHead(result.status,{'Content-Type':'application/json'});res.end(JSON.stringify(result.body));
    }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":{"code":"OWNED_TEST_HTTP_FAILURE"}}');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  await fs.writeFile(path.join(runtime,'kernel-connection.json'),JSON.stringify({origin,projectId,connectionToken:process.env.HUABU_CONNECTION_TOKEN}));
  const unauthorized=await fetch(origin+base+'/capabilities');assert.equal(unauthorized.status,401);
  const listed=await mcp(null,{});assert.equal(listed.tools.length,8);
  const emphasisTool=listed.tools.find(tool=>tool.name==='set_node_emphasis');assert.ok(emphasisTool);
  assert.equal(emphasisTool.inputSchema.additionalProperties,false);
  assert.deepEqual(Object.keys(emphasisTool.inputSchema.properties.patches.items.properties.patch.properties),['lcos_gui_emphasis']);
  report.checks.push('Real MCP discovery returns eight backend-schema-derived tools; emphasis still reuses MERGE_NODE_DATA with exactly one boolean GUI field. Owned HTTP rejects unauthenticated requests.');
  let stream='';
  await new Promise((resolve,reject)=>{
    streamRequest=http.get(origin+'/api/canvas/'+main+'/sync/stream',{headers:{Authorization:'Bearer '+process.env.HUABU_CONNECTION_TOKEN}},res=>{
      streamResponse=res;res.setEncoding('utf8');res.on('data',value=>stream+=value);resolve();});streamRequest.once('error',reject);
  });
  await until(()=>stream.includes('event: snapshot'));
  const set = value => mcp('set_node_emphasis',{patches:[{nodeId:target,patch:{lcos_gui_emphasis:value}}]});
  const saved=await set(true);assert.equal(saved.result.isError,false,JSON.stringify(saved));
  assert.equal(saved.result.structuredContent.spatialSaved,true);assert.equal(saved.result.structuredContent.coreSaved,false);
  assert.deepEqual(saved.result.structuredContent.changedNodeIds,[target]);
  assert.equal((await facade.spatial.read(main)).state.nodes.find(node=>node.id===target).data.lcos_gui_emphasis,true);
  await until(()=>stream.includes('"lcos_gui_emphasis":true'));
  const noOp=await set(true);assert.equal(noOp.result.isError,false);assert.equal(noOp.result.structuredContent.spatialSaved,false);
  assert.deepEqual(noOp.result.structuredContent.changedNodeIds,[]);assert.equal(noOp.result.structuredContent.fromVersion,noOp.result.structuredContent.toVersion);
  const cleared=await set(false);assert.equal(cleared.result.isError,false);assert.equal(cleared.result.structuredContent.spatialSaved,true);
  assert.equal((await facade.spatial.read(main)).state.nodes.find(node=>node.id===target).data.lcos_gui_emphasis,false);
  report.checks.push('Actual MCP true/false saves the same original node boolean and emits the original persisted SSE delta. CoreSaved=false is truthful for GUI-only writes; repeating the same value is a no-op with no changed node/version.');
  const userSet=await call('POST','/api/canvas/v1/canvases/'+main+'/nodes:batchActions',{canvas_id:main,actions:[{action:'update',updates:[{id:target,data:{lcos_gui_emphasis:true}}]}]});
  assert.equal(userSet.status,200,JSON.stringify(userSet.body));
  assert.equal((await set(false)).result.isError,false);
  const semanticNode=value=>{const next=structuredClone(value);delete next.data.lcos_gui_emphasis;return next;};
  assert.deepEqual(semanticNode((await facade.spatial.read(main)).state.nodes.find(node=>node.id===target)),semanticNode(nodeBefore));
  report.checks.push('Original user node update and Agent MCP alternate on the same field and persistence owner; neither title, position, dimensions nor material facts are rewritten.');
  const textId='surface-main-text',textBefore=structuredClone((await facade.spatial.read(main)).state.nodes.find(node=>node.id===textId));assert.ok(textBefore);
  for(const value of [true,false]){const result=await mcp('set_node_emphasis',{patches:[{nodeId:textId,patch:{lcos_gui_emphasis:value}}]});assert.equal(result.result.isError,false,JSON.stringify(result.result));
    const actual=(await facade.spatial.read(main)).state.nodes.find(node=>node.id===textId);assert.equal(actual.data.lcos_gui_emphasis,value);assert.deepEqual(semanticNode(actual),semanticNode(textBefore));}
  report.checks.push('Real MCP also saves true/false on the original canonical text carrier; internal Huabu label/body/binding/position and full Core content stay intact.');
  for(const bad of [
    {patches:[{nodeId:target,patch:{lcos_gui_emphasis:'true'}}]},
    {patches:[{nodeId:target,patch:{lcos_gui_emphasis:true,content:'forbidden'}}]},
    {patches:[{nodeId:target,patch:{label:'forbidden'}}]},
    {patches:[{nodeId:target,patch:{lcos_gui_emphasis:true},expectRev:'not-a-loop'}]},
    {patches:[{nodeId:target,patch:{lcos_gui_emphasis:true}}],canvasId:'foreign'},
    {patches:[{nodeId:'surface-context-image',patch:{lcos_gui_emphasis:true}}]},
  ]){const before=await facade.spatial.read(main);const result=await mcp('set_node_emphasis',bad);assert.equal(result.result.isError,true);assert.deepEqual(await facade.spatial.read(main),before);}
  for(const body of [
    {runId:'no-run-required',commands:[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{lcos_gui_emphasis:true}}]}]},
    {commands:[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{lcos_gui_emphasis:true}}]},{type:'SET_NODE_GEOMETRY',items:[{nodeId:target,position:{x:1,y:2}}]}]},
  ]){const before=await facade.spatial.read(main);assert.equal((await call('POST',base+'/execute',body)).status,400);assert.deepEqual(await facade.spatial.read(main),before);}
  const foreign=await call('POST','/api/rfs/foreign-canvas/execute',{commands:[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{lcos_gui_emphasis:true}}]}]});assert.equal(foreign.status,404);
  report.checks.push('Real tools reject wrong boolean, content/label injection, expectRev, canvas override and cross-canvas node IDs without writes; the real facade rejects Run attribution, mixed commands and foreign scenes.');
  await facade.spatial.execute(main,[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{locked:true}}]}]);
  const lockedBefore=await facade.spatial.read(main),locked=await set(true);assert.equal(locked.result.isError,true);
  assert.equal(locked.result.structuredContent.error.code,'NODE_LOCKED');assert.deepEqual(await facade.spatial.read(main),lockedBefore);
  await facade.spatial.execute(main,[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{locked:false}}]}]);
  assert.equal((await set(true)).result.isError,false);
  assert.deepEqual(await graph(),graphBefore);assert.deepEqual(await facade.spatial.read('surface-core-workflow'),otherBefore);
  assert.equal(facade.core.repository.getProjectExecutionProjection(projectId).runs.length,0);
  report.checks.push('Original locked-node rejection survives the Agent path. The complete Core graph, another scene and zero Run count remain unchanged; GUI expression needs no version/Run/stage input.');
  streamResponse.destroy();streamRequest.destroy();streamResponse=streamRequest=undefined;
  await facade.close();facade=await start();
  assert.equal((await facade.spatial.read(main)).state.nodes.find(node=>node.id===target).data.lcos_gui_emphasis,true);
  assert.equal((await set(false)).result.isError,false);assert.deepEqual(await graph(),graphBefore);
  report.checks.push('Closing and reopening only this owned Core/Huabu runtime retains emphasis; the same actual MCP can subsequently clear it. No provider session or active runtime was used.');
  report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  streamResponse?.destroy();streamRequest?.destroy();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  await facade?.close();globalThis.fetch=originalFetch;
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));
