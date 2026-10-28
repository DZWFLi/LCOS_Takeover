import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify,isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Prepared only unless the root explicitly runs this after its unified build.
const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const root=path.resolve(import.meta.dirname,'..'),exec=promisify(execFile),origin='http://127.0.0.1:56311';
const pid=Number(option('expected-pid')),execute=process.argv.includes('--execute-real-ui');
const output=path.resolve(option('output-root')??path.join(root,'output/Agent纯GUI强调_20261027/真实原页',new Date().toISOString().replace(/[:.]/g,'-')));
await fs.mkdir(output,{recursive:true});
const report={passed:false,preparedOnly:!execute,expectedPid:pid,output,checks:[],mcpCalls:[],writes:[],blocked:[],screenshots:[],pageErrors:[],modelCalls:0,
 responseRewrites:0,productSetters:0,initialCameraPublicFitView:0,allowedFinalDifferences:['canvases.surface-core-main.version','canvases.surface-core-main.updated_at']};
if(!execute){await fs.writeFile(path.join(output,'prepared-plan.json'),JSON.stringify({...report,flow:['Read complete facts/bytes','Original fit-all control only if target is outside initial viewport','Real MCP set_node_emphasis true -> saved bool + same-document actual halo','Real MCP false -> saved false + halo gone','Exact facts/bytes restored except declared Main counter/timestamp']},null,2));console.log(JSON.stringify({preparedOnly:true,output,modelCalls:0}));process.exit(0);}
assert.ok(Number.isSafeInteger(pid)&&pid>0,'--expected-pid is required');
const runtime='isolated-node-carry-20261020',project='disposable-surface-core-facade',base='/api/lcos/core/projects/'+project;
const canvasId='surface-core-main',target=option('node-id')??'text-9172952a-6fc5-4a71-acd4-f4004fed3af5',canvasPath='/api/canvas/v1/canvases/'+canvasId;
const get=async route=>{assert.ok(route.startsWith('/')&&!route.startsWith('//'));const response=await fetch(origin+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route);const value=await response.json();return value.value??value.data??value;};
const health=async()=>{const value=await get('/health');assert.equal(value.pid,pid);assert.equal(value.realCoreConnected,true);assert.equal(value.runtimeLabel,runtime);return value;};
const facts=async name=>{await health();const file=path.join(output,name+'.json');await exec(process.execPath,['scripts/native-gui-facts-read.mjs','--output='+file],{cwd:root,windowsHide:true,timeout:120000,maxBuffer:1000000});const value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.summary.pid,pid);assert.equal(value.summary.totalMessages,36);assert.equal(value.summary.longConversationMessages,28);return{file,...value};};
const bytes=async ids=>{const result=new Map();for(const id of ids){const response=await fetch(origin+base+'/file-records/'+encodeURIComponent(id)+'/content',{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);result.set(id,{type:response.headers.get('content-type'),bytes:Buffer.from(await response.arrayBuffer())});}return result;};
const wait=async(read,test,label,timeout=30000)=>{let last;const end=Date.now()+timeout;do{last=await read();if(test(last))return last;await new Promise(resolve=>setTimeout(resolve,70));}while(Date.now()<end);report.lastPoll={label,last};throw Error(label+' did not become ready');};
let browser,page,before,beforeBytes,stage='preflight',confirmedValue=false,unknownWrite=false;
async function mcp(value){assert.equal(typeof value,'boolean');const call={value,tool:'set_node_emphasis',submitted:false,confirmed:false};report.mcpCalls.push(call);const index=report.mcpCalls.length,file=path.join(output,index+'-arguments.json'),receipt=path.join(output,index+'-receipt.json');
 await fs.writeFile(file,JSON.stringify({patches:[{nodeId:target,patch:{lcos_gui_emphasis:value}}]}));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));call.submitted=true;unknownWrite=true;
 await exec(option('python')??'C:/Users/1/AppData/Local/Programs/Python/Python312/python.exe',['-X','utf8','scripts/native-space-kernel-mcp-client.py','--runtime-label='+runtime,'--canvas='+canvasId,'--tool=set_node_emphasis','--arguments-file='+file,'--output='+receipt],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:1000000});
 const result=JSON.parse(await fs.readFile(receipt,'utf8'));assert.equal(result.calls,1);assert.equal(result.result.isError,false,'Unknown/failed MCP write must not be replayed');assert.equal(result.result.structuredContent.spatialSaved,true);assert.equal(result.result.structuredContent.coreSaved,false);assert.deepEqual(result.result.structuredContent.changedNodeIds,[target]);
 call.fromVersion=result.result.structuredContent.fromVersion;call.toVersion=result.result.structuredContent.toVersion;assert.equal(call.toVersion,call.fromVersion+1);call.confirmed=true;call.receiptFile=receipt;confirmedValue=value;unknownWrite=false;
}
const read=()=>page.evaluate(id=>{const host=window.__LCOS_NODE_LAB__,node=host?.api?.getNode?.(id),halo=document.querySelector('[data-native-node-emphasis="'+id+'"]'),element=document.querySelector('.react-flow__node[data-id="'+id+'"]');
 const input=document.querySelector('[data-lcos-native-chat-frame] textarea'),box=element?.getBoundingClientRect(),pane=document.querySelector('.react-flow')?.getBoundingClientRect();
 const bounds=box&&pane?{left:Math.max(box.left,pane.left,0),top:Math.max(box.top,pane.top,60),right:Math.min(box.right,pane.right,innerWidth),bottom:Math.min(box.bottom,pane.bottom,innerHeight)}:null;
 const hits=[];if(bounds&&bounds.right>bounds.left&&bounds.bottom>bounds.top)for(const x of [.2,.5,.8])for(const y of [.2,.5,.8]){const point={x:bounds.left+(bounds.right-bounds.left)*x,y:bounds.top+(bounds.bottom-bounds.top)*y},hit=document.elementFromPoint(point.x,point.y);hits.push({...point,nodeHit:hit?.closest('.react-flow__node')?.getAttribute('data-id')===id});}
 return{canvasId:host?.currentCanvasId||host?.canvasId,emphasis:node?.data?.lcos_gui_emphasis,nodePresent:!!node,nodeVisibleIntersection:bounds,nodeHits:hits,
  halo:halo?{rect:halo.getBoundingClientRect().toJSON(),display:getComputedStyle(halo).display,visibility:getComputedStyle(halo).visibility,opacity:getComputedStyle(halo).opacity,arrival:halo.getAttribute('data-arrival')}:null,
  nodeBox:element?.getBoundingClientRect().toJSON(),sync:host?.api?.inspectExternalGeometrySync?.(),viewport:host?.api?.getViewport?.(),document:performance.timeOrigin,
  input:input?{value:input.value,start:input.selectionStart,end:input.selectionEnd}:null};},target);
const stable=async()=>wait(read,value=>value.canvasId===canvasId&&value.sync?.active&&value.sync.appliedVersion!==undefined&&value.sync.appliedVersion>=value.sync.desiredVersion&&!value.sync.working,'Original same-owner sync idle',90000);
const visible=value=>value.nodeHits?.some(hit=>hit.nodeHit===true);
const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
function echo(body,persisted){if(body?.canvas_id!==canvasId||body.created_by_role!=='user'||body.lcos_operation!==undefined||!Array.isArray(body.actions)||body.actions.length!==1)return false;
 const action=body.actions[0];if(action.action!=='update'||!Array.isArray(action.updates)||!action.updates.length)return false;
 if(Object.keys(body).some(key=>!['canvas_id','created_by_role','actions','lcos_expected_revisions','lcos_refs'].includes(key))||Object.keys(action).some(key=>!['action','updates'].includes(key)))return false;
 if(body.lcos_refs!==undefined&&!same(body.lcos_refs,persisted.lcos_refs))return false;
 if(Object.entries(body.lcos_expected_revisions??{}).some(([id,revision])=>{const prior=persisted.nodes.find(row=>row.id===id);return !prior||String(revision)!==String(persisted.lcos_expected_revisions?.[id]??prior.lcos_revision_id??prior.data?.lcos_ref?.revisionId??'');}))return false;
 return action.updates.every(patch=>{const prior=persisted.nodes.find(row=>row.id===patch.id);if(!prior)return false;return Object.entries(patch).every(([key,value])=>{
  if(key==='canvas_id')return value===canvasId;if(key==='parent_id'||key==='parentId')return(value??'')===(prior.parent_id??prior.parentId??'');
  if(key==='data')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([field,next])=>same(next,prior.data?.[field]));
  return ['id','type','position','measured','width','height'].includes(key)&&same(value,prior[key]);});});}
try{
 before=await facts('facts-before');beforeBytes=await bytes(before.data.graph.fileRecords.map(row=>row.id));assert.ok(beforeBytes.size>=22);report.fileCount=beforeBytes.size;
 const node=before.data.canvases[canvasId].nodes.find(row=>row.id===target);assert.equal(node?.type,'text');assert.equal(node.data.lcos_gui_emphasis,false,'Only restore an initially false, explicitly saved GUI bool');report.target={nodeId:target,ref:node.data.lcos_ref};
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();if(['data:','blob:'].includes(url.protocol))return route.continue();
  if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&url.pathname!==base&&!url.pathname.startsWith(base+'/')){report.blocked.push({stage,path:url.pathname,method,reason:'foreign owner/network'});return route.abort();}
  const stream=/\/sync\/stream$|\/events(?:\/|$)|event-stream/i.test(url.pathname+' '+(request.headers().accept??''));if(stream&&url.pathname!=='/api/canvas/'+canvasId+'/sync/stream'){report.blocked.push({stage,path:url.pathname,method,reason:'other stream'});return route.abort();}
  if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();
  const row={stage,path:url.pathname,method,permitted:false};report.writes.push(row);let body;try{body=JSON.parse(request.postData()??'null');}catch{return route.abort();}
  if(method==='POST'&&/^\/api\/lcos\/canvases\/surface-core-main\/execution:reconcile$/.test(url.pathname)&&same(body,{})){row.permitted=true;row.lifecycle='exact empty execution reconcile';return route.continue();}
  if(method==='POST'&&url.pathname===base+'/conversations:reconcile'&&same(body,{})){row.permitted=true;row.lifecycle='exact empty conversations reconcile';return route.continue();}
  if(method==='POST'&&url.pathname===canvasPath+'/nodes:batchActions'&&stage==='opening'&&echo(body,await get(canvasPath))){row.permitted=true;row.lifecycle='exact canonical original opening echo';return route.continue();}
  return route.abort();});
 await context.routeWebSocket('**/*',socket=>{report.blocked.push({stage,reason:'WebSocket'});socket.close();});page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
 stage='opening';await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:120000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:90000});await stable();
 let initial=await read();
 if(!visible(initial)){
  const fit=page.getByRole('button',{name:/^(适应画布|适应全部|聚焦全部|Fit view|Fit all|Zoom to fit)$/i});
  const fitTest=page.getByTestId('canvas-editor-fit-view-btn');
  if(await fit.count()===1){await fit.click();report.initialCameraControl='Original accessible fit-all button';}
  else if(await fitTest.count()===1){await fitTest.click();report.initialCameraControl='Original testid fit-all button';}
  else{assert.ok(process.argv.includes('--allow-initial-public-fit-view'),'Target not visible; no original fit button found. Pass explicit initial-public-fit-view allowance only after source inspection.');await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.fitView({nodes:[{id}],padding:1.2,minZoom:.4,maxZoom:1,duration:0}),target);report.initialCameraPublicFitView++;}
  let previous,count=0;await wait(read,value=>{const key=JSON.stringify([value.viewport,value.nodeBox]);count=key===previous?count+1:0;previous=key;return visible(value)&&count>=3;},'Original fit-all settled visible target');
 }
 initial=await stable();assert.ok(visible(initial),'The original target must actually be hittable, not behind another panel');assert.equal(initial.emphasis,false);assert.equal(initial.halo,null);report.initialObservation={canvasId:initial.canvasId,nodeBox:initial.nodeBox,nodeVisibleIntersection:initial.nodeVisibleIntersection,nodeHits:initial.nodeHits,viewport:initial.viewport,sync:initial.sync};await shot('01-before');
 stage='emphasize';await mcp(true);const shown=await wait(read,value=>value.emphasis===true&&!!value.halo&&value.halo.display!=='none'&&value.halo.visibility!=='hidden'&&Number(value.halo.opacity)>0&&value.halo.rect.width>0,'MCP true and actual original halo');await stable();
 assert.ok(visible(shown),'The emphasized original node remains genuinely visible/hittable');assert.equal(shown.document,initial.document);assert.deepEqual(shown.viewport,initial.viewport);assert.deepEqual(shown.input,initial.input);assert.equal((await get(canvasPath)).nodes.find(row=>row.id===target).data.lcos_gui_emphasis,true);report.shown={...shown,input:undefined};await shot('02-agent-emphasis-live');
 report.checks.push('One real MCP true saves GUI-only bool; original sync displays actual halo in the same document with unchanged camera/input and no receiving node save');
 stage='clear';await mcp(false);const cleared=await wait(read,value=>value.emphasis===false&&!value.halo,'MCP false and actual halo removal');await stable();assert.equal(cleared.document,initial.document);assert.deepEqual(cleared.viewport,initial.viewport);assert.deepEqual(cleared.input,initial.input);await shot('03-agent-clear-live');
 report.checks.push('One real MCP false restores the initial field and removes halo without reload or a provider message');assert.equal(report.writes.filter(row=>row.path===canvasPath+'/nodes:batchActions'&&row.stage!=='opening').length,0);assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{
 // Unknown outcome is never replayed. Root decides cleanup after reading this receipt.
 report.finalKnownEmphasis=confirmedValue;report.unknownWrite=unknownWrite;report.stage=stage;
 if(before){try{const after=await facts('facts-after'),normalize=data=>{const value=structuredClone(data);delete value.canvases[canvasId].version;delete value.canvases[canvasId].updated_at;return value;};
  assert.deepEqual(normalize(after.data),normalize(before.data),'Only declared Main version/updated_at may differ');
  if(report.passed){assert.equal(report.mcpCalls.length,2);assert.equal(report.mcpCalls[0].fromVersion,before.data.canvases[canvasId].version);assert.equal(report.mcpCalls[1].fromVersion,report.mcpCalls[0].toVersion);assert.equal(after.data.canvases[canvasId].version,report.mcpCalls[1].toVersion);
    assert.ok(Date.parse(after.data.canvases[canvasId].updated_at)>=Date.parse(before.data.canvases[canvasId].updated_at),'Only forward timestamp growth');}
  const nextBytes=await bytes([...beforeBytes.keys()]);for(const[id,row]of beforeBytes){assert.equal(nextBytes.get(id).type,row.type);assert.ok(nextBytes.get(id).bytes.equals(row.bytes));}
  report.factsRestored=true;report.fileBytesUnchanged=true;report.finalCounters={before:{version:before.data.canvases[canvasId].version,updated_at:before.data.canvases[canvasId].updated_at},after:{version:after.data.canvases[canvasId].version,updated_at:after.data.canvases[canvasId].updated_at}};
 }catch(error){report.protectionError=String(error.stack??error);report.passed=false;process.exitCode=1;}}
 await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,stage,report:path.join(output,'report.json'),factsRestored:report.factsRestored,fileBytesUnchanged:report.fileBytesUnchanged,modelCalls:0,error:report.error,protectionError:report.protectionError},null,2));
}
