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
const runtime = path.join(root, '.runtime/isolated-native-gui-markers-' + randomUUID());
await fs.mkdir(runtime, { recursive: true });
const output = path.join(root, 'output/Agent导航固定与ColorPin_20261027/真实Core与MCP', stamp);
await fs.mkdir(output, { recursive: true });
const keys = ['HUABU_CONNECTION_TOKEN','LCOS_RECOVERY_TRANSPORT','LCOS_CAPTURE_STAGING_ROOT','LCOS_OCR_RUNTIME_DIR','LCOS_OLLAMA_URL'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
process.env.HUABU_CONNECTION_TOKEN = 'e'.repeat(64); // owned disposable credential, never a running Host key
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr'); process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
const originalFetch = globalThis.fetch;
const report = { passed: false, checks: [], modelCalls: 0, activeRuntimeTouched: false, userProjectFilesWritten: false,
  scope: 'Actual isolated Core/SQLite/Huabu facade + original navigation/ColorPin owner + real installed MCP stdio client/server over owned authenticated loopback HTTP. No provider or real page.', requests: [], runtime };
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

  assert.deepEqual((await call('GET',base+'/capabilities')).body.guiTypes,['SET_NAVIGATION_PIN','SET_COLOR_PIN','RENAME_COLOR_PIN']);
  for(const [name,operation] of [['set_node_pinned','SET_NAVIGATION_PIN'],['set_node_color_pin','SET_COLOR_PIN'],['rename_color_pin','RENAME_COLOR_PIN']]) {
    const tool=listed.tools.find(t=>t.name===name);assert.ok(tool);assert.equal(tool.inputSchema.additionalProperties,false);assert.equal(Object.hasOwn(tool.inputSchema.properties,'type'),false);
    const schema=await call('GET',base+'/capabilities/gui/'+operation);assert.equal(schema.status,200);assert.equal(schema.body.schema.properties.type.const,operation);
  }
  const inspect=async()=>{const receipt=await mcp('inspect_nodes',{ids:[target]});assert.equal(receipt.result.isError,false,JSON.stringify(receipt));const node=receipt.result.structuredContent.result.nodes[0];assert.equal(node.id,target);assert.equal(node.gui.available,true);assert.equal(node.gui.navigation.available,true);assert.equal(node.gui.colors.available,true);return node.gui;};
  const initialGui=await inspect(),targetRef=initialGui.navigation.targetRef;
  assert.equal(initialGui.navigation.markers.length,0);
  const pin=async pinned=>{const r=await mcp('set_node_pinned',{nodeId:target,pinned});assert.equal(r.calls,1);assert.equal(r.result.isError,false,JSON.stringify(r.result));assert.equal(r.result.structuredContent.status,'confirmed');return r.result.structuredContent;};
  let result=await pin(true);assert.equal(result.changed,true);assert.ok(result.changeSetId);assert.deepEqual(result.marker.targetRef,targetRef);assert.equal(result.marker.sourceSurfaceRef,'main');
  assert.equal((await inspect()).navigation.markers.length,1);
  const journalSize=()=>facade.core.repository.listMutationChangeSets(projectId,10000).length;
  const savedJournal=journalSize();assert.equal((await pin(true)).changed,false);assert.equal(journalSize(),savedJournal);
  result=await pin(false);assert.equal(result.changed,true);assert.equal((await inspect()).navigation.markers.length,0);
  const navUser=await call('POST','/api/lcos/core/projects/'+projectId+'/spatial-markers',{targetRef,scope:'local',sourceSurfaceRef:'main'});assert.equal(navUser.status,201,JSON.stringify(navUser.body));
  assert.equal((await inspect()).navigation.markers[0].id,navUser.body.value.id);await pin(false);
  report.checks.push('Actual MCP fixed/unfixed and original user POST alternate on the same Core marker and ChangeSet; inspect_nodes reads actual facts. Explicit no-op creates no journal; no Run required.');
  const color='#F0606B';
  const setColor=async present=>{const r=await mcp('set_node_color_pin',{nodeId:target,color,present});assert.equal(r.calls,1);assert.equal(r.result.isError,false,JSON.stringify(r.result));assert.equal(r.result.structuredContent.status,'confirmed');return r.result.structuredContent;};
  result=await setColor(true);assert.equal(result.changed,true);assert.deepEqual(result.membership.targetRef,targetRef);
  const colorJournal=journalSize();assert.equal((await setColor(true)).changed,false);assert.equal(journalSize(),colorJournal);
  let facts=await inspect(),definition=facts.colors.definitions.find(d=>d.color.toUpperCase()===color);assert.ok(definition);
  let renamed=await mcp('rename_color_pin',{definitionId:definition.id,label:'仅GUI颜色组',expectedLabel:definition.label??null,expectedUpdatedAt:definition.updatedAt});
  assert.equal(renamed.result.isError,false,JSON.stringify(renamed));assert.equal(renamed.result.structuredContent.definition.label,'仅GUI颜色组');
  const staleJournal=journalSize();renamed=await mcp('rename_color_pin',{definitionId:definition.id,label:'过期改名不能盖掉',expectedLabel:definition.label??null,expectedUpdatedAt:definition.updatedAt});assert.equal(renamed.result.isError,true);assert.equal(journalSize(),staleJournal);
  facts=await inspect();assert.equal(facts.colors.definitions.find(d=>d.id===definition.id).label,'仅GUI颜色组');
  await setColor(false);assert.equal((await inspect()).colors.memberships.filter(m=>m.targetRef.kind==='view'&&m.colorPinId===definition.id).length,0);
  report.checks.push('Actual MCP Color Pin add/no-op/remove and original label CAS, exact current View and stale rename rejection; tool readback includes definition names/update times.');
  const ordinaryId='ordinary-frame-mcp',ordinaryColor='#654321';
  const produced=await facade.spatial.execute(main,[{type:'CREATE_NODES',nodes:[{id:ordinaryId,nodeType:'frame',position:{x:2000,y:1700},size:{width:420,height:260},data:{label:'原普通分组',sizing:'manual'}}]}]);
  assert.ok(produced.results.every(row=>row.applied));
  const ordinaryBefore=structuredClone((await facade.spatial.read(main)).state.nodes.find(row=>row.id===ordinaryId));
  for(const pinned of [true,false]){const value=await mcp('set_node_pinned',{nodeId:ordinaryId,pinned});assert.equal(value.result.isError,false,JSON.stringify(value));assert.equal(value.result.structuredContent.status,'confirmed');assert.equal(value.result.structuredContent.targetRef,undefined);}
  const rawSet=await mcp('set_node_color_pin',{nodeId:ordinaryId,color:ordinaryColor,present:true});assert.equal(rawSet.result.isError,false,JSON.stringify(rawSet));
  const ordinaryInspect=await mcp('inspect_nodes',{ids:[ordinaryId]});assert.equal(ordinaryInspect.result.isError,false);
  assert.equal(ordinaryInspect.result.structuredContent.result.nodes[0].gui.colors.definitions.some(row=>row.color===ordinaryColor),false);
  const beforeMissingGroup=journalSize(),missingGroup=await mcp('rename_color_pin',{color:'#010203',label:'没有当前颜色不能另建组',expectedDefinitionId:null});
  assert.equal(missingGroup.result.isError,true);assert.equal(missingGroup.result.structuredContent.error.code,'GUI_COLOR_GROUP_UNAVAILABLE');assert.equal(journalSize(),beforeMissingGroup);
  const createdName=await mcp('rename_color_pin',{color:ordinaryColor,label:'普通颜色单独命名',expectedDefinitionId:null});assert.equal(createdName.result.isError,false,JSON.stringify(createdName));
  const rawDefinition=createdName.result.structuredContent.definition;assert.equal(rawDefinition.color,ordinaryColor);assert.equal(rawDefinition.label,'普通颜色单独命名');
  const rawJournal=journalSize(),staleAbsence=await mcp('rename_color_pin',{color:ordinaryColor,label:'过期无定义不能覆盖',expectedDefinitionId:null});assert.equal(staleAbsence.result.isError,true);assert.equal(journalSize(),rawJournal);
  const mixedName=await mcp('rename_color_pin',{color:ordinaryColor,label:'混合参数不能写',expectedDefinitionId:null,definitionId:rawDefinition.id,expectedLabel:rawDefinition.label,expectedUpdatedAt:rawDefinition.updatedAt});assert.equal(mixedName.result.isError,true);assert.equal(journalSize(),rawJournal);
  const rawRenamed=await mcp('rename_color_pin',{definitionId:rawDefinition.id,label:'原普通颜色组',expectedLabel:rawDefinition.label,expectedUpdatedAt:rawDefinition.updatedAt});assert.equal(rawRenamed.result.isError,false,JSON.stringify(rawRenamed));
  const rawClear=await mcp('set_node_color_pin',{nodeId:ordinaryId,color:ordinaryColor,present:false});assert.equal(rawClear.result.isError,false,JSON.stringify(rawClear));
  const ordinaryAfter=(await facade.spatial.read(main)).state.nodes.find(row=>row.id===ordinaryId),withoutGui=node=>{const copy=structuredClone(node);delete copy.data.color_pins;delete copy.data.lcos_gui_navigation_pin;return copy;};
  assert.deepEqual(withoutGui(ordinaryAfter),withoutGui(ordinaryBefore));
  const rawSnapshot=await call('GET','/api/lcos/core/projects/'+projectId+'/color-pins');assert.equal(rawSnapshot.body.value.memberships.some(row=>row.colorPinId===rawDefinition.id),false);
  report.checks.push('Actual installed MCP edits a genuine ordinary Frame and names its raw-only color with observed absence, then uses the same existing-definition CAS. No fake target/membership, mixed/stale arguments do not write, original Frame body/parent/geometry remain unchanged.');
  for(const [tool,args] of [['set_node_pinned',{nodeId:target,pinned:true,runId:'not-required'}],['set_node_color_pin',{nodeId:target,color,present:true,content:'forbidden'}],['set_node_pinned',{nodeId:'surface-context-image',pinned:true}],['set_node_pinned',{nodeId:target,pinned:'true'}]]) {
    const current=await facade.spatial.read(main),journal=journalSize(),r=await mcp(tool,args);assert.equal(r.result.isError,true);assert.deepEqual(await facade.spatial.read(main),current);assert.equal(journalSize(),journal);
  }
  const wrong=await call('POST',base+'/gui',{type:'SET_COLOR_PIN',nodeId:target,color,present:true,workflowId:'forbidden'});assert.equal(wrong.status,400);
  await facade.spatial.execute(main,[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{locked:true}}]}]);
  const journalLocked=journalSize(),locked=await mcp('set_node_pinned',{nodeId:target,pinned:true});assert.equal(locked.result.isError,true);assert.equal(locked.result.structuredContent.error.code,'GUI_NODE_LOCKED');assert.equal(journalSize(),journalLocked);
  await facade.spatial.execute(main,[{type:'MERGE_NODE_DATA',patches:[{nodeId:target,patch:{locked:false}}]}]);
  assert.deepEqual(await graph(),graphBefore);assert.deepEqual(await facade.spatial.read('surface-core-workflow'),otherBefore);assert.equal(facade.core.repository.getProjectExecutionProjection(projectId).runs.length,0);
  report.checks.push('Actual MCP and facade reject lock, foreign nodes, wrong booleans, content/Run/workflow injection without domain or journal writes. Original content/other scene/execution remain intact.');
  await pin(true);await facade.close();facade=await start();assert.equal((await inspect()).navigation.markers.length,1);await pin(false);
  report.checks.push('Owned Core close/reopen persists navigation records; the same real MCP reads and edits after reopen, with no provider or live runtime touched.');
  report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  streamResponse?.destroy();streamRequest?.destroy();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  await facade?.close();globalThis.fetch=originalFetch;
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));


