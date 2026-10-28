import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual as same} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

// This script is inert until the coordinated, explicit real-UI switch is given.
// All writes are one-shot original UI actions or one real MCP call. An unknown
// receipt is recorded, never retried or automatically cleaned up by guessing.
const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const execute=process.argv.includes('--execute-real-ui'),pid=Number(option('expected-pid'));
const root=path.resolve(import.meta.dirname,'..'),origin='http://127.0.0.1:56311',exec=promisify(execFile);
const project='disposable-surface-core-facade',base='/api/lcos/core/projects/'+project,canvasId='surface-core-main';
const runtime='isolated-node-carry-20261020',canvasPath='/api/canvas/v1/canvases/'+canvasId,pinPath=base+'/color-pins';
const target=option('node-id')??'text-9172952a-6fc5-4a71-acd4-f4004fed3af5';
const resumeOwnedMarkerReport=option('resume-owned-marker-report');let resumeMarker;
const concurrentOnly=process.argv.includes('--concurrent-ack-only');
const colorRefreshOnly=process.argv.includes('--color-refresh-only'),colorAckOnly=process.argv.includes('--color-ack-only');
const allowHumanMainPosition=process.argv.includes('--allow-human-main-position');
assert.ok(!allowHumanMainPosition||colorRefreshOnly||colorAckOnly,'Human-position allowance is only for the expressly authorized narrow color checks');
assert.ok([Boolean(resumeOwnedMarkerReport),concurrentOnly,colorRefreshOnly,colorAckOnly].filter(Boolean).length<=1,'Choose at most one narrow real-UI mode');
const output=path.resolve(option('output-root')??path.join(root,'output/导航固定与颜色Agent同步_20261027/真实原页',new Date().toISOString().replace(/[:.]/g,'-')));
if(!execute){console.log(JSON.stringify({preparedOnly:true,script:import.meta.filename,flow:['Original More pin → open directory → real MCP remove/add → original directory remove','Original palette add → same open palette real MCP remove/add → original palette remove','If no definition exists: root explicitly authorizes one original preset #F0606B definition, retained as 珊瑚红 with zero members; no new material/model'],requires:'Root unified build, exact PID and sole writer authorization'}));process.exit(0);}
assert.ok(Number.isSafeInteger(pid)&&pid>0,'--expected-pid=N required');await fs.mkdir(output,{recursive:true});
const report={passed:false,output,expectedPid:pid,target,checks:[],writes:[],mcpCalls:[],blocked:[],screenshots:[],pageErrors:[],routeErrors:[],streams:[],
 modelCalls:0,productSetters:0,observation:'Original agent-ui bytes plus one read-only snapshot function; no state or response-success replacement',unknownWrite:false};
let browser,page,before,beforeBytes,pinsBefore,definition,createdDefinition=false,definitionCreated=false,targetRef,markerRef,stage='preflight',permit,markerOwned=new Set(),membershipOwned=new Set();
let holdPostAckRead=false,releaseAckRead;const ackReadGate=new Promise(resolve=>{releaseAckRead=resolve;});
const get=async route=>{assert.ok(route.startsWith('/')&&!route.startsWith('//'));const response=await fetch(origin+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route);const value=await response.json();return value.value??value.data??value;};
const health=async()=>{const value=await get('/health');assert.equal(value.pid,pid);assert.equal(value.runtimeLabel,runtime);assert.equal(value.realCoreConnected,true);return value;};
const facts=async name=>{await health();const file=path.join(output,name+'.json');await exec(process.execPath,['scripts/native-gui-facts-read.mjs','--output='+file],{cwd:root,windowsHide:true,timeout:120000,maxBuffer:1000000});const value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.summary.pid,pid);return value;};
const bytes=async ids=>{const rows=new Map();for(const id of ids){const response=await fetch(origin+base+'/file-records/'+encodeURIComponent(id)+'/content',{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);rows.set(id,{type:response.headers.get('content-type'),bytes:Buffer.from(await response.arrayBuffer())});}return rows;};
const wait=async(read,test,label,timeout=30000)=>{let last;const end=Date.now()+timeout;do{last=await read();if(test(last))return last;await new Promise(resolve=>setTimeout(resolve,90));}while(Date.now()<end);report.lastPoll={label,last};throw Error(label+' did not become ready');};
const snapshot=()=>page.evaluate(()=>window.__GUI_MARKER_READ__());
const shots=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
const sameTarget=(a,b)=>same(a,b);
const currentMarkers=()=>get(base+'/spatial-markers');
const targetMarkers=rows=>rows.filter(row=>sameTarget(row.targetRef,markerRef)&&row.scope==='local'&&row.sourceSurfaceRef==='main');
const targetMembers=pins=>pins.memberships.filter(row=>sameTarget(row.targetRef,targetRef)&&row.colorPinId===definition.id);
async function mcp(tool,args){
 const index=report.mcpCalls.length+1,argumentsFile=path.join(output,index+'-'+tool+'-args.json'),receipt=path.join(output,index+'-'+tool+'-receipt.json');
 const row={tool,args,submitted:false,confirmed:false,receipt};report.mcpCalls.push(row);await fs.writeFile(argumentsFile,JSON.stringify(args));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 row.submitted=true;report.unknownWrite=true;
 await exec(option('python')??'C:/Users/1/AppData/Local/Programs/Python/Python312/python.exe',['-X','utf8','scripts/native-space-kernel-mcp-client.py','--runtime-label='+runtime,'--canvas='+canvasId,'--tool='+tool,'--arguments-file='+argumentsFile,'--output='+receipt],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:1000000});
 const value=JSON.parse(await fs.readFile(receipt,'utf8'));assert.equal(value.calls,1);assert.equal(value.result.isError,false,'Unknown/failed MCP result must not be replayed');assert.equal(value.result.structuredContent.status,'confirmed');
 row.result=value.result.structuredContent;row.confirmed=true;report.unknownWrite=false;return row.result;
}
function echo(body,persisted){
 if(body?.canvas_id!==canvasId||body.created_by_role!=='user'||!Array.isArray(body.actions)||body.actions.length!==1)return false;
 const action=body.actions[0];if(action.action!=='update'||!Array.isArray(action.updates)||!action.updates.length)return false;
 if(Object.keys(body).some(key=>!['canvas_id','created_by_role','actions','lcos_expected_revisions','lcos_refs'].includes(key))||Object.keys(action).some(key=>!['action','updates'].includes(key)))return false;
 if(body.lcos_refs!==undefined&&!same(body.lcos_refs,persisted.lcos_refs))return false;
 if(Object.entries(body.lcos_expected_revisions??{}).some(([id,revision])=>{const prior=persisted.nodes.find(row=>row.id===id);return !prior||String(revision)!==String(persisted.lcos_expected_revisions?.[id]??prior.lcos_revision_id??prior.data?.lcos_ref?.revisionId??'');}))return false;
 return action.updates.every(patch=>{const prior=persisted.nodes.find(row=>row.id===patch.id);return prior&&Object.entries(patch).every(([key,value])=>{
  if(key==='canvas_id')return value===canvasId;if(key==='parent_id'||key==='parentId')return(value??'')===(prior.parent_id??prior.parentId??'');
  if(key==='data')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([field,next])=>same(next,prior.data?.[field]));
  return['id','type','position','measured','width','height'].includes(key)&&same(value,prior[key]);});});
}
try{
 before=await facts('facts-before');beforeBytes=await bytes(before.data.graph.fileRecords.map(row=>row.id));pinsBefore=await get(pinPath);
 assert.equal(beforeBytes.size,Number(option('expected-file-count')??26));assert.equal(before.summary.totalMessages,36);assert.equal(before.summary.longConversationMessages,28);assert.equal(before.summary.journal,34);
 const node=before.data.canvases[canvasId].nodes.find(row=>row.id===target);assert.equal(node?.type,'text');assert.ok(node.data.lcos_ref?.artifactViewId);
 targetRef={projectId:project,kind:'view',id:node.data.lcos_ref.artifactViewId};markerRef=targetRef;
 if(resumeOwnedMarkerReport){const prior=JSON.parse(await fs.readFile(path.resolve(resumeOwnedMarkerReport),'utf8'));assert.equal(prior.target,target);assert.equal(prior.unknownWrite,false);
  const confirmed=prior.mcpCalls.filter(row=>row.confirmed&&row.tool==='set_node_pinned'&&row.args?.scope==='cross-surface'&&row.args.pinned===true&&row.result?.marker);
  assert.equal(confirmed.length,1,'Resume exactly the one confirmed cross-surface receipt, never infer another target');resumeMarker=confirmed[0].result.marker;
  assert.deepEqual(before.data.markers,[resumeMarker]);assert.deepEqual(resumeMarker.targetRef,markerRef);markerOwned.add(resumeMarker.id);report.resumeOwnedMarker={source:path.resolve(resumeOwnedMarkerReport),marker:resumeMarker};
 }else assert.equal(before.data.markers.length,0,'Never adopt an existing marker for cleanup without its prior confirmed receipt');
 definition=pinsBefore.definitions.find(value=>/^#[0-9a-f]{6}$/i.test(value.color)&&!pinsBefore.memberships.some(row=>row.colorPinId===value.id&&same(row.targetRef,targetRef)));
 if(!definition){assert.equal(pinsBefore.definitions.length,0,'Only the explicitly authorized initially-empty color state may create one original preset definition');definition={color:'#F0606B'};createdDefinition=true;report.allowedColorDifference='One original preset #F0606B definition retained, final label 珊瑚红, zero members; created/updated timestamps recorded. No hidden cleanup.';}
 report.definitionBefore=createdDefinition?null:definition;report.targetRef=targetRef;
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();try{
  if(['data:','blob:'].includes(url.protocol))return route.continue();
  if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(base+'/')){report.blocked.push({stage,path:url.pathname,method,reason:'foreign owner/network'});return route.abort();}
  const streaming=/event-stream/i.test(request.headers().accept??'')||method==='GET'&&/\/sync\/stream$|\/events$/.test(url.pathname);
  if(streaming){const allowed=[base+'/events','/api/canvas/'+canvasId+'/sync/stream'].includes(url.pathname);report.streams.push({path:url.pathname,method,allowed});if(!allowed){report.blocked.push({stage,path:url.pathname,method,reason:'unrelated stream'});return route.abort();}}
  if(holdPostAckRead&&method==='GET'&&(concurrentOnly&&url.pathname===base+'/spatial-markers'||colorAckOnly&&url.pathname===pinPath)){
   holdPostAckRead=false;report.interleaving={held:true,path:url.pathname,method,heldAt:new Date().toISOString(),responseModified:false};
   await ackReadGate;report.interleaving.releasedAt=new Date().toISOString();return route.continue();
  }
  if(method==='GET'&&url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:120000}),source=await response.text();for(const name of ['useCanvasStore','useLcosShellStore','nativeNavigationSnapshot','navigationDirectorySnapshot'])assert.match(source,new RegExp('\\b'+name+'\\b'));
   return route.fulfill({response,body:source+'\nwindow.__GUI_MARKER_READ__=()=>{const c=useCanvasStore.getState(),s=useLcosShellStore.getState(),n=nativeNavigationSnapshot(),d=navigationDirectorySnapshot();return{canvas:c.canvasId,status:c.status,workspace:s.activeWorkspaceId,viewport:c.rfInstance?.getViewport?.(),input:s.composerPrompt,windows:s.windows,document:performance.timeOrigin,navigation:{status:n.status,busy:n.busy,pending:n.pending,notice:n.notice,markers:n.facts?.markers,arrival:n.arrival,returning:n.returning&&{nodeId:n.returning.nodeId,viewport:n.returning.viewport},navigating:n.navigating},directory:{open:d.open,status:d.status,error:d.error,busy:d.busy,pending:d.pending,query:d.query,scroll:d.scroll,selectedMarkerId:d.selectedMarkerId,rows:d.rows.map(r=>({id:r.marker.id,title:r.title}))},focus:document.activeElement?.getAttribute("aria-label")};};'});
  }
  if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();
  const row={stage,path:url.pathname,method,allowed:false};report.writes.push(row);let body;try{body=request.postDataJSON();}catch{body=null;}row.body=body;
  if(method==='POST'&&[base+'/conversations:reconcile','/api/lcos/canvases/'+canvasId+'/execution:reconcile','/api/lcos/canvases/'+canvasId+'/conversations:reconcile'].includes(url.pathname)&&same(body,{})){row.allowed=true;row.lifecycle='original empty reconcile';return route.continue();}
  if(!colorRefreshOnly&&!colorAckOnly&&method==='POST'&&url.pathname===canvasPath+'/nodes:batchActions'&&stage==='opening'&&echo(body,await get(canvasPath))){row.allowed=true;row.lifecycle='exact original DTO echo';return route.continue();}
  const allowed=permit&&((permit.kind==='marker-add'&&method==='POST'&&url.pathname===base+'/spatial-markers'&&same(body,{targetRef:markerRef,scope:'local',sourceSurfaceRef:'main'}))
   ||(permit.kind==='marker-remove'&&method==='DELETE'&&markerOwned.has(decodeURIComponent(url.pathname.slice((base+'/spatial-markers/').length)))&&url.pathname.startsWith(base+'/spatial-markers/'))
   ||(permit.kind==='color-add'&&method==='POST'&&url.pathname===pinPath+'/memberships'&&same(body,{targetRef,...(definition.id?{colorPinId:definition.id}:{color:definition.color})}))
   ||(permit.kind==='color-remove'&&method==='DELETE'&&url.pathname.startsWith(pinPath+'/memberships/')&&membershipOwned.has(decodeURIComponent(url.pathname.slice((pinPath+'/memberships/').length)))));
  if(!allowed||permit.used){report.blocked.push(row);return route.abort();}permit.used=true;row.allowed=true;report.unknownWrite=true;
  const response=await route.fetch({maxRedirects:0}),value=await response.json();row.status=response.status();row.response=value;assert.ok(response.ok()&&value.ok===true,'A write without a confirmed original receipt is not replayed');
  if(permit.kind==='marker-add'){assert.ok(value.value?.id);markerOwned.add(value.value.id);if(concurrentOnly)holdPostAckRead=true;}
  if(permit.kind==='color-add'){assert.ok(value.value?.membership?.id&&value.value?.definition?.id);assert.equal(value.value.definition.color.toUpperCase(),definition.color.toUpperCase());if(definition.id)assert.equal(value.value.definition.id,definition.id);definition=value.value.definition;definitionCreated=createdDefinition;membershipOwned.add(value.value.membership.id);if(colorAckOnly)holdPostAckRead=true;}
  report.unknownWrite=false;return route.fulfill({response});
 }catch(error){report.routeErrors.push(String(error.stack??error));try{await route.abort();}catch{}}});
 await context.routeWebSocket('**/*',socket=>{report.blocked.push({stage,reason:'WebSocket'});socket.close();});page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error.stack??error)));
 stage='opening';await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:120000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:90000});
 await wait(snapshot,value=>value.canvas===canvasId&&value.status==='ready'&&value.navigation.status==='ready','Original scene and navigation ready',90000);
 report.sceneReadyAt=new Date().toISOString();console.log(JSON.stringify({stage:'original-scene-ready',modelCalls:0}));
 const collapse=page.getByRole('button',{name:'收起对话',exact:true});if(await collapse.count()===1){await collapse.click();report.initialOriginalChatCollapse=true;}
 const view=page.locator('.react-flow__node[data-id="'+target+'"]');
 const point=()=>view.evaluate(element=>{const box=element.getBoundingClientRect();for(const dx of [.5,.25,.75])for(const dy of [.5,.25,.75]){const x=box.x+box.width*dx,y=box.y+box.height*dy;if(document.elementFromPoint(x,y)?.closest('.react-flow__node')===element)return{x,y,rect:box.toJSON()};}return null;});
 if(!await point()){const fit=page.getByTestId('canvas-editor-fit-view-btn');assert.equal(await fit.count(),1,'Use the original fit-all control; no hidden camera setter');await fit.click();await wait(point,Boolean,'Original fit-all exposes the existing A');}
 const select=async()=>{const hit=await wait(point,Boolean,'Existing target genuinely hittable');await page.mouse.click(hit.x,hit.y);await wait(()=>page.evaluate(id=>window.__LCOS_NODE_LAB__?.api.getNode(id)?.selected,target),Boolean,'Original node selected');};
 const more=async()=>{await select();const toolbar=page.locator('[data-testid="canvas-node-toolbar"]:visible');await toolbar.waitFor();
  const fallback=toolbar.getByTestId('native-node-navigation-more');if(await fallback.count()===1){await fallback.click();return;}
  const triggers=toolbar.locator('[aria-haspopup="menu"]');if(await triggers.count()===1){await triggers.click();return;}
  report.originalMenuTriggers=await triggers.evaluateAll(elements=>elements.map(element=>element.outerHTML));
  for(let index=0;index<await triggers.count();index++){await triggers.nth(index).hover();const tooltip=page.getByRole('tooltip').filter({hasText:/^(更多|节点操作|More)$/i});if(await tooltip.waitFor({state:'visible',timeout:1200}).then(()=>true,()=>false)){await triggers.nth(index).click();return;}}
  throw Error('Original text toolbar has multiple distinct menus; none identified as original More by its own testid/tooltip');};
 const directory=page.locator('[data-native-navigation-directory]'),trigger=page.locator('button[data-native-navigation-directory-trigger]');
 const openDirectory=async()=>{assert.equal(await trigger.count(),1);await trigger.click();await directory.waitFor();await wait(snapshot,value=>value.directory.open&&value.directory.status==='ready','Original directory ready');};
 const closeDirectory=async()=>{await page.keyboard.press('Escape');await directory.waitFor({state:'hidden'});};
 if(resumeMarker){
  stage='resume-known-cross';const check=page.getByRole('button',{name:'核对固定目标',exact:true});if(await check.count()===1){await check.click();await wait(snapshot,value=>!value.navigation.busy&&!value.navigation.pending,'Original GET-only pending verification');report.checks.push('Original pending check used GET only');}
  await more();const cancel=page.getByRole('menuitem',{name:'取消固定',exact:true});assert.equal(await cancel.count(),1);assert.equal(await cancel.isDisabled(),false);
  permit={kind:'marker-remove'};await cancel.click();await wait(currentMarkers,rows=>!rows.some(row=>row.id===resumeMarker.id),'Original More removes exact confirmed prior cross record');permit=undefined;
  await wait(snapshot,value=>!value.navigation.busy&&!value.navigation.pending,'Original cross removal readback complete');await shots('01-known-cross-original-cancelled');report.checks.push('Fresh original More cancels the single exact prior cross-surface receipt, with no new marker/Agent write or guessed cleanup');
  report.passed=true;
 }else if(concurrentOnly){
  stage='concurrent-user-create';permit={kind:'marker-add'};await more();await page.getByRole('menuitem',{name:'固定到导航',exact:true}).click();
  await wait(()=>Promise.resolve(report.interleaving?.held),Boolean,'One actual post-ACK marker GET held before forwarding');
  const live=await currentMarkers();assert.equal(targetMarkers(live).length,1);assert.ok(markerOwned.has(targetMarkers(live)[0].id));const original=await snapshot();
  stage='concurrent-agent-remove';await mcp('set_node_pinned',{nodeId:target,pinned:false});assert.equal(targetMarkers(await currentMarkers()).length,0);permit=undefined;
  releaseAckRead();const final=await wait(snapshot,value=>!value.navigation.busy&&!value.navigation.pending&&value.navigation.notice==='固定状态刚有变化，已显示最新结果。'&&value.navigation.markers?.length===0,'Valid ACK superseded adopts current facts and releases pending');
  assert.deepEqual(final.viewport,original.viewport);assert.equal(final.document,original.document);assert.equal(final.input,original.input);
  assert.equal(report.writes.filter(row=>row.path===base+'/spatial-markers'&&row.method==='POST'&&row.allowed).length,1);assert.equal(report.mcpCalls.length,1);
  assert.equal(report.interleaving.responseModified,false);await shots('01-real-ack-superseded-original-notice');report.checks.push('Real original CREATE1 valid ACK → delay only its original markers GET without modifying response → real MCP DELETE1 → original fresh GET sees supersession → one Changed notice, pending false, zero replay or camera/input change');
  report.passed=true;
 }else if(colorRefreshOnly||colorAckOnly){
  assert.equal(createdDefinition,false,'Narrow color regression must reuse the existing authorized 珊瑚红 definition');assert.equal(definition.label,'珊瑚红');
  await select();const pin=page.getByRole('button',{name:/^Pin$|^已 Pin：|^Pinned:/});assert.equal(await pin.count(),1);await pin.click();
  const palette=page.locator('[data-native-colorpin-popover]');await palette.waitFor();assert.equal(await palette.count(),1);
  const indexes=await palette.locator('button[aria-pressed]').evaluateAll((buttons,hex)=>{const rgb='rgb('+hex.slice(1).match(/../g).map(value=>parseInt(value,16)).join(', ')+')';return buttons.flatMap((button,index)=>[button,...button.querySelectorAll('*')].some(element=>getComputedStyle(element).backgroundColor===rgb)?[index]:[]);},definition.color);
  assert.equal(indexes.length,1);const dot=palette.locator('button[aria-pressed]').nth(indexes[0]);assert.equal(await dot.getAttribute('aria-pressed'),'false');
  const original=await snapshot();stage=colorAckOnly?'color-ack-user-add':'color-refresh-user-add';permit={kind:'color-add'};await dot.click();
  if(colorAckOnly){await wait(()=>Promise.resolve(report.interleaving?.held),Boolean,'One actual post-ACK color snapshot GET held before forwarding');assert.equal(targetMembers(await get(pinPath)).length,1);}
  else{await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='true','Original user dot pressed');await wait(()=>dot.isDisabled(),value=>!value,'Original user color controller readback done');
    report.colorTextBefore=await palette.innerText();assert.match(report.colorTextBefore,/已添加颜色标记/);await shots('01-original-user-success-before-external-update');}
  stage=colorAckOnly?'color-ack-agent-remove':'color-refresh-agent-remove';await mcp('set_node_color_pin',{nodeId:target,color:definition.color,present:false});assert.equal(targetMembers(await get(pinPath)).length,0);permit=undefined;if(colorAckOnly)releaseAckRead();
  await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='false','Same open palette reads exact external absence');await wait(()=>dot.isDisabled(),value=>!value,'No busy or unknown hold after exact external absence');
  if(colorAckOnly)await wait(()=>palette.innerText(),value=>value.includes('颜色标记刚有变化，已显示最新结果。'),'Actual color ACK supersession shows Changed instead of permanent pending');
  else await wait(()=>palette.innerText(),value=>!value.includes('已添加颜色标记'),'Obsolete known-success announcement disappears after a changed external snapshot');
  report.colorTextAfter=await palette.innerText();assert.doesNotMatch(report.colorTextAfter,/尚未确认|待确认|不会自动重复修改/);
  const final=await snapshot();assert.deepEqual(final.viewport,original.viewport);assert.equal(final.input,original.input);assert.equal(final.document,original.document);assert.deepEqual(final.windows,original.windows);assert.equal(await palette.count(),1);
  assert.equal(report.writes.filter(row=>row.path===pinPath+'/memberships'&&row.method==='POST'&&row.allowed).length,1);assert.equal(report.mcpCalls.length,1);
  if(colorAckOnly)assert.equal(report.interleaving.responseModified,false);await shots('02-same-palette-agent-removal-current-state');
  report.checks.push(colorAckOnly?'Real original palette CREATE1 valid ACK → only original color GET delayed, response unchanged → real MCP DELETE1 → original Changed status, pressed false, controls enabled, zero replay/new popup, camera/input/windows unchanged':'Original palette user ADD1 completes and announces success → real MCP DELETE1 → same open palette pressed false and obsolete success gone, no new popup/definition, camera/input/windows unchanged');
  await page.keyboard.press('Escape');await palette.waitFor({state:'hidden'});assert.equal(context.pages().length,1);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.routeErrors,[]);report.passed=true;
 }else{
 stage='user-pin';permit={kind:'marker-add'};await more();assert.equal(await page.getByRole('menuitem',{name:'固定到导航',exact:true}).count(),1);await page.getByRole('menuitem',{name:'固定到导航',exact:true}).click();
 const userMarker=(await wait(currentMarkers,rows=>targetMarkers(rows).length===1,'User exact marker saved')).find(row=>markerOwned.has(row.id));assert.ok(userMarker);permit=undefined;
 await wait(snapshot,value=>!value.navigation.busy&&!value.navigation.pending,'Original user create readback completed, not just its Core receipt');
 await openDirectory();const search=page.getByRole('searchbox',{name:'搜索固定目标',exact:true});await search.fill('');const beforeMarker=await snapshot();assert.equal(beforeMarker.focus,'搜索固定目标');await shots('01-user-pin-original-directory-open');
 stage='agent-remove-pin';await mcp('set_node_pinned',{nodeId:target,pinned:false});await wait(snapshot,value=>value.directory.rows.every(row=>row.id!==userMarker.id)&&value.navigation.markers?.every(row=>row.id!==userMarker.id),'Already-open directory receives Agent removal');
 const removed=await snapshot();assert.equal(removed.directory.open,true);assert.equal(removed.focus,'搜索固定目标');assert.deepEqual(removed.viewport,beforeMarker.viewport);assert.equal(removed.document,beforeMarker.document);
 stage='agent-add-pin';const addedPin=await mcp('set_node_pinned',{nodeId:target,pinned:true});assert.ok(addedPin.marker?.id);markerOwned.add(addedPin.marker.id);
 await wait(snapshot,value=>value.directory.rows.some(row=>row.id===addedPin.marker.id)&&value.navigation.markers?.some(row=>row.id===addedPin.marker.id),'Already-open directory receives Agent add');
 const added=await snapshot();assert.equal(added.directory.open,true);assert.equal(added.focus,'搜索固定目标');assert.deepEqual(added.viewport,beforeMarker.viewport);assert.equal(added.directory.query,beforeMarker.directory.query);assert.equal(added.directory.scroll,beforeMarker.directory.scroll);
 await shots('02-agent-pin-live-same-directory');stage='user-remove-pin';permit={kind:'marker-remove'};await directory.locator('[data-native-navigation-directory-remove="'+addedPin.marker.id+'"]').click();await wait(currentMarkers,rows=>targetMarkers(rows).length===0,'Original directory removes Agent marker');permit=undefined;
 await wait(snapshot,value=>value.directory.status==='ready'&&!value.directory.busy&&!value.directory.pending&&!value.navigation.pending,'Original directory remove and readback complete');await closeDirectory();
 report.checks.push('Original More one entry → user marker → open original directory observes Agent remove/add over shared SSE without reopen, focus/query/scroll/camera changes → original directory removes exact Agent record');
 console.log(JSON.stringify({stage:'directory-user-agent-pass',mcpCalls:report.mcpCalls.length}));

 stage='agent-cross-pin';const cross=await mcp('set_node_pinned',{nodeId:target,pinned:true,scope:'cross-surface'});assert.ok(cross.marker?.id);assert.equal(cross.marker.scope,'cross-surface');markerOwned.add(cross.marker.id);
 await wait(snapshot,value=>value.navigation.markers?.some(row=>row.id===cross.marker.id),'Cross-surface marker reaches original node state');
 await more();assert.equal(await page.getByRole('menuitem',{name:'取消固定',exact:true}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'固定到导航',exact:true}).count(),0);
 stage='user-cross-remove';permit={kind:'marker-remove'};await page.getByRole('menuitem',{name:'取消固定',exact:true}).click();await wait(currentMarkers,rows=>!rows.some(row=>row.id===cross.marker.id),'Original More cancels exact single cross-surface marker');permit=undefined;
 stage='agent-both-scopes';const local=await mcp('set_node_pinned',{nodeId:target,pinned:true}),bothCross=await mcp('set_node_pinned',{nodeId:target,pinned:true,scope:'cross-surface'});
 for(const result of [local,bothCross]){assert.ok(result.marker?.id);markerOwned.add(result.marker.id);}
 await wait(snapshot,value=>[local.marker.id,bothCross.marker.id].every(id=>value.navigation.markers?.some(row=>row.id===id)),'Both exact scopes read back');
 await more();assert.equal(await page.getByRole('menuitem',{name:'管理固定',exact:true}).count(),1);assert.equal(await page.getByRole('menuitem',{name:'取消固定',exact:true}).count(),0);assert.equal(await page.getByRole('menuitem',{name:'固定到导航',exact:true}).count(),0);
 await page.getByRole('menuitem',{name:'管理固定',exact:true}).click();await directory.waitFor();await wait(snapshot,value=>value.directory.status==='ready'&&[local.marker.id,bothCross.marker.id].every(id=>value.directory.rows.some(row=>row.id===id)),'One original directory manages two scopes');
 assert.equal(await directory.count(),1);await shots('02b-both-scopes-one-original-directory');
 for(const result of [local,bothCross]){stage='user-remove-owned-'+result.marker.scope;permit={kind:'marker-remove'};await directory.locator('[data-native-navigation-directory-remove="'+result.marker.id+'"]').click();await wait(currentMarkers,rows=>!rows.some(row=>row.id===result.marker.id),'Exact scope record removed through original directory');permit=undefined;await wait(snapshot,value=>value.directory.status==='ready'&&!value.directory.busy,'Original directory after exact removal');}
 await closeDirectory();report.checks.push('One cross-surface record shows one exact Cancel; simultaneous local/cross records show one Manage action opening the same directory; both removals use selected exact records, no guessed batch delete or new window');
 console.log(JSON.stringify({stage:'cross-scope-original-more-pass',mcpCalls:report.mcpCalls.length}));

 const openPalette=async()=>{await select();const button=page.getByRole('button',{name:/^Pin$|^已 Pin：|^Pinned:/});assert.equal(await button.count(),1,'One original color entry');await button.click();await page.locator('[data-native-colorpin-popover]').waitFor();};
 await openPalette();const palette=page.locator('[data-native-colorpin-popover]');assert.equal(await palette.count(),1);
 const dotIndex=await palette.locator('button[aria-pressed]').evaluateAll((buttons,hex)=>{const rgb='rgb('+hex.slice(1).match(/../g).map(value=>parseInt(value,16)).join(', ')+')';const matches=buttons.flatMap((button,index)=>[button,...button.querySelectorAll('*')].some(element=>getComputedStyle(element).backgroundColor===rgb)?[index]:[]);return matches;},definition.color);
 assert.equal(dotIndex.length,1,'The existing definition maps to exactly one real original palette dot');const dot=palette.locator('button[aria-pressed]').nth(dotIndex[0]);assert.equal(await dot.getAttribute('aria-pressed'),'false');
 stage='user-color-add';permit={kind:'color-add'};await dot.click();const userMember=(await wait(()=>get(pinPath),pins=>targetMembers(pins).length===1,'Original palette exact View membership saved')).memberships.find(row=>membershipOwned.has(row.id));assert.ok(userMember);permit=undefined;
 await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='true','Original dot pressed');await wait(()=>dot.isDisabled(),disabled=>!disabled,'Original user color write readback complete');const colorBefore=await snapshot();await shots('03-user-color-original-palette-open');
 stage='agent-color-remove';await mcp('set_node_color_pin',{nodeId:target,color:definition.color,present:false});await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='false','Same open original palette reads Agent removal');assert.equal(await palette.count(),1);
 const colorRemoved=await snapshot();assert.deepEqual(colorRemoved.viewport,colorBefore.viewport);assert.equal(colorRemoved.input,colorBefore.input);assert.equal(colorRemoved.document,colorBefore.document);
 stage='agent-color-add';const addedColor=await mcp('set_node_color_pin',{nodeId:target,color:definition.color,present:true});assert.ok(addedColor.membership?.id);membershipOwned.add(addedColor.membership.id);await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='true','Same open palette reads Agent addition');
 await shots('04-agent-color-live-same-palette');stage='user-color-remove';permit={kind:'color-remove'};await dot.click();await wait(()=>get(pinPath),pins=>targetMembers(pins).length===0,'Original palette removes exact Agent membership');permit=undefined;await wait(()=>dot.getAttribute('aria-pressed'),value=>value==='false','Original dot restored');await wait(()=>dot.isDisabled(),disabled=>!disabled,'Original user color removal readback complete');
 report.checks.push('One original palette remains open throughout user add → Agent remove/add → user remove; exact View membership readback and no camera/input change; first preset definition, if needed, is explicitly recorded');
 console.log(JSON.stringify({stage:'color-user-agent-pass',mcpCalls:report.mcpCalls.length}));
 if(createdDefinition){stage='agent-color-name';const current=(await get(pinPath)).definitions.find(row=>row.id===definition.id);assert.ok(current);await mcp('rename_color_pin',{definitionId:current.id,label:'珊瑚红',expectedLabel:current.label??null,expectedUpdatedAt:current.updatedAt});await wait(()=>dot.getAttribute('aria-label'),label=>label==='珊瑚红','Same open original palette receives shared definition name');report.checks.push('New original preset definition is retained as 珊瑚红; its real Agent CAS rename immediately updates the same open palette, without a new input/window');}
 await page.keyboard.press('Escape');await palette.waitFor({state:'hidden'});await shots('05-original-page-restored');
 stage='narrow-readonly';await page.setViewportSize({width:360,height:400});
 await wait(()=>trigger.boundingBox(),box=>box&&box.width>=44&&box.height>=44&&box.x>=0&&box.y>=0&&box.x+box.width<=360&&box.y+box.height<=400,'Original narrow directory trigger true 44px hit area');
 await openDirectory();const narrow=await directory.evaluate(element=>{const box=element.getBoundingClientRect();return{rect:box.toJSON(),hits:[.25,.5,.75].map(r=>{const x=box.x+box.width*r,y=box.y+Math.min(22,box.height/2);return{x,y,hit:element.contains(document.elementFromPoint(x,y))};})};});
 assert.ok(narrow.rect.left>=0&&narrow.rect.right<=360&&narrow.rect.top>=0&&narrow.rect.bottom<=400);assert.ok(narrow.hits.every(row=>row.hit));report.narrow=narrow;await shots('06-narrow-original-directory');await closeDirectory();await page.setViewportSize({width:1500,height:1000});
 report.checks.push('360×400 uses the same single original directory with real 44px trigger, on-screen bounds and genuine original header hit points; no mobile duplicate entry');
 assert.equal(context.pages().length,1);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.routeErrors,[]);report.passed=true;
 }
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.failureSnapshot=await snapshot().catch(()=>undefined);await shots('failure').catch(()=>{});await fs.writeFile(path.join(output,'failure.aria.txt'),await page.locator('body').ariaSnapshot()).catch(()=>{});}}
finally{
 releaseAckRead();
 report.stage=stage;report.noAutomaticCleanup=true;
 if(before){try{const after=await facts('facts-after'),pinsAfter=await get(pinPath),expected=structuredClone(before.data);if(resumeMarker)expected.markers=expected.markers.filter(row=>row.id!==resumeMarker.id);
  const different=[...new Set([...Object.keys(expected),...Object.keys(after.data)])].filter(key=>!same(expected[key],after.data[key]));report.factDifferences=different;
  if(different.includes('canvases'))report.canvasDifferences=Object.keys({...expected.canvases,...after.data.canvases}).flatMap(id=>{
    const a=expected.canvases[id],b=after.data.canvases[id];if(same(a,b))return[];return[{canvasId:id,versionBefore:a?.version,versionAfter:b?.version,updatedAtBefore:a?.updated_at,updatedAtAfter:b?.updated_at,
      nodes:[...new Set([...(a?.nodes??[]).map(row=>row.id),...(b?.nodes??[]).map(row=>row.id)])].flatMap(nodeId=>{const left=a?.nodes.find(row=>row.id===nodeId),right=b?.nodes.find(row=>row.id===nodeId);if(same(left,right))return[];
        return[{nodeId,presentBefore:!!left,presentAfter:!!right,geometry:Object.fromEntries(['position','measured','width','height','parent_id','parentId'].filter(key=>!same(left?.[key],right?.[key])).map(key=>[key,{before:left?.[key],after:right?.[key]}])),dataChanged:!same(left?.data,right?.data)}];})}];});
  const afterBytes=await bytes([...beforeBytes.keys()]);for(const[id,row]of beforeBytes){assert.equal(afterBytes.get(id).type,row.type);assert.ok(afterBytes.get(id).bytes.equals(row.bytes));}report.fileBytesUnchanged=true;report.fileCount=beforeBytes.size;
  assert.deepEqual(pinsAfter.memberships,pinsBefore.memberships,'Original memberships exactly restored');
  if(definitionCreated){assert.equal(pinsAfter.definitions.length,pinsBefore.definitions.length+1);const retained=pinsAfter.definitions.find(row=>row.id===definition.id);assert.ok(retained);assert.equal(retained.color.toUpperCase(),'#F0606B');if(report.passed)assert.equal(retained.label,'珊瑚红');assert.deepEqual(pinsAfter.definitions.filter(row=>row.id!==definition.id),pinsBefore.definitions);report.retainedDefinition=retained;}
  else assert.deepEqual(pinsAfter.definitions,pinsBefore.definitions,'Original definitions/labels exactly restored');
  let protectedDifferences=different;
  if(allowHumanMainPosition){const left=structuredClone(expected),right=structuredClone(after.data),a=left.canvases[canvasId],b=right.canvases[canvasId];assert.ok(a&&b);
    report.humanMainPositionChanges={authorization:'User explicitly confirmed ongoing manual layout; retain current positions. No product setter or Canvas POST.',versionBefore:a.version,versionAfter:b.version,updatedAtBefore:a.updated_at,updatedAtAfter:b.updated_at,
      nodes:a.nodes.flatMap(node=>{const next=b.nodes.find(value=>value.id===node.id);return next&&!same(node.position,next.position)?[{nodeId:node.id,before:node.position,after:next.position}]:[];})};
    for(const key of ['version','updated_at']){delete a[key];delete b[key];}
    for(const node of a.nodes){const next=b.nodes.find(value=>value.id===node.id);if(next){delete node.position;delete next.position;}}
    protectedDifferences=[...new Set([...Object.keys(left),...Object.keys(right)])].filter(key=>!same(left[key],right[key]));
    report.protectedFactDifferences=protectedDifferences;
  }
  assert.deepEqual(protectedDifferences,[],'Protected fact groups changed; only explicitly authorized existing Main node positions/counter/time may be separated, never other fields');
  report.originalFactsStrictlyUnchanged=different.length===0;report.factsRestored=different.length?'Protected facts strictly unchanged; current human Main position/counter/time changes retained and listed':true;
  report.colorPinsRestored=definitionCreated?'memberships restored; one explicitly authorized definition retained':true;report.fileBytesUnchanged=true;report.fileCount=beforeBytes.size;
 }catch(error){report.protectionError=String(error.stack??error);report.passed=false;process.exitCode=1;}}
 await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,stage,report:path.join(output,'report.json'),factsRestored:report.factsRestored,colorPinsRestored:report.colorPinsRestored,fileBytesUnchanged:report.fileBytesUnchanged,unknownWrite:report.unknownWrite,error:report.error,protectionError:report.protectionError,modelCalls:0},null,2));
}
