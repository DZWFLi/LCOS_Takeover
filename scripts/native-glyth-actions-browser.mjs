import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
assert.ok(process.argv.includes('--execute-readonly'),'Run only after root confirms unified UI build/runtime PID; no connect/send mode exists.');
const expectedPid=Number(option('expected-pid'));assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin=new URL(option('base-url')??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(origin).protocol,'http:');
const projectId='disposable-surface-core-facade',conversationId=option('conversation-id')??'connected-conversation-4244107f-aa59-4466-85e2-7ca53e230009';
const canvasId='surface-core-main',base='/api/lcos/core/projects/'+projectId;
const output=path.resolve(option('output-root')??'output/Glyth状态近场捷径_20261026/只读真实页面/'+new Date().toISOString().replace(/[:.]/g,'-'));
const report={passed:false,expectedPid,conversationId,checks:[],screenshots:[],blockedWrites:[],external:[],protocols:[],socketsBlocked:[],pageErrors:[],httpErrors:[],routeErrors:[],
 forwardedWrites:0,modelCalls:0,submittedPrompts:0,browserChoice:'Browser plugin not available; existing Playwright-core and Chrome used.',
 notClaimed:['Only the actual disconnected canonical conversation is verified in this live run; working/answer/review states remain controlled-source coverage.',
 'Reconnect shortcut only opens original continuation options; no connection/preparation/recovery/cancellation/send is clicked.',
 'All browser POSTs including existing telemetry/measurement writes are blocked, so write-path health is not tested.']};
await fs.mkdir(output,{recursive:true});
const safe=value=>String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED]').replace(/\bBearer\s+[^\s\"']+/gi,'Bearer [REDACTED]');
const get=async route=>{const response=await fetch(origin+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route);const body=await response.json();assert.ok(body.ok===true||body.code===0||route==='/health',route);return body.value??body.data??body;};
const messageRows=payload=>Array.isArray(payload)?payload:payload.messages??payload.items;
const facts=async()=>{const [graph,runs,markers,operations,connected,sessions,bindings]=await Promise.all([
 get(base+'/graph'),get(base+'/execution-projection'),get(base+'/spatial-markers'),get(base+'/conversation-continuations'),
 get(base+'/connected-conversations'),get(base+'/conversations'),get(base+'/spatial/bindings')]);
 const messages={},canvases={};
 for(const session of sessions){const payload=await get(base+'/conversations/'+encodeURIComponent(session.id)+'/messages?limit=1000');assert.equal(Boolean(payload.hasMore??payload.nextCursor),false);const rows=messageRows(payload);assert.ok(Array.isArray(rows));messages[session.id]=rows;}
 for(const id of ['surface-core-main','surface-core-context','surface-core-workflow'])canvases[id]=await get('/api/canvas/v1/canvases/'+id);
 return{graph,runs,markers,operations,connected,sessions,bindings,messages,canvases};};
const poll=async(read,matches,label,timeout=30000)=>{const end=Date.now()+timeout;let value;do{value=await read();if(matches(value))return value;await new Promise(resolve=>setTimeout(resolve,120));}while(Date.now()<end);throw Error(label+' timed out; last='+JSON.stringify(value));};
let before,browser,page,stage='preflight',delayDiagnostics=true;
const delayedReads=[];const releaseDiagnostics=()=>{delayDiagnostics=false;for(const ticket of delayedReads)ticket.release();};
try{
 const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);
 before=await facts();const canonical=before.connected.find(row=>row.id===conversationId);assert.ok(canonical?.conversationSessionId);
 const expectedMessageCount=before.messages[canonical.conversationSessionId].length;assert.ok(expectedMessageCount>0,'The existing real Glyth must have nonempty original history.');report.expectedMessageCount=expectedMessageCount;
 const protectedLong=before.connected.find(row=>row.id==='connected-conversation-b0b62164-091e-4656-b495-40da78541bf0');assert.equal(before.messages[protectedLong.conversationSessionId].length,28);
 const projection=await get(base+'/connected-conversations/'+conversationId+'/collaboration-session');
 assert.equal(projection.userState,'ready');assert.equal(projection.capabilities.canSend,false);assert.equal(projection.capabilities.canResume,true);
 assert.equal(projection.recovery??null,null);assert.equal(projection.activity.activeRunId,undefined);
 report.observedProjection=projection;
 const targetBindings=before.bindings.filter(row=>row.projectId===projectId&&row.entityType==='conversation'&&row.entityId===conversationId&&row.canvasId===canvasId&&row.spatialKind==='node');
 assert.equal(targetBindings.length,1,'Exactly one actual Main conversation binding is required; no occurrence is created by this test.');
 const targetBinding=targetBindings[0],nodes=before.canvases[canvasId].nodes.filter(node=>node.id===targetBinding.spatialId);
 assert.equal(nodes.length,1,'Actual Core spatialId must join one original Main DTO node, even if storage DTO does not carry facade reference data.');
 const target=nodes[0];report.nodeId=target.id;report.targetBinding=targetBinding;
 report.protectedUnplacedLongConversation={conversationId:protectedLong.id,messageCount:28,existingBindingCount:before.bindings.filter(row=>row.entityType==='conversation'&&row.entityId===protectedLong.id).length};
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1700,height:1100},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{try{const request=route.request(),url=new URL(request.url()),method=request.method();
  if(['data:','blob:'].includes(url.protocol))return route.continue();
  if(!['http:','https:'].includes(url.protocol)){report.protocols.push({stage,protocol:url.protocol});return route.abort();}
  if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(base+'/')){report.external.push({stage,method,path:url.pathname});return route.abort();}
  if(!['GET','HEAD','OPTIONS'].includes(method)){report.blockedWrites.push({stage,method,path:url.pathname,forwarded:false});return route.abort();}
  if(method==='GET'&&url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:120000}),source=await response.text();report.bundleMarkers={helper:source.includes('resolveNativeGlythActions'),primary:source.includes('data-native-glyth-primary'),genericOpen:source.includes('data-native-glyth-open')};assert.ok(Object.values(report.bundleMarkers).every(Boolean),'Unified bundle must include the actual Glyth primary adapter and original UI entry markers; visible label is asserted against real DOM, not escaped bundle strings.');
   return route.fulfill({response,body:source+'\nwindow.__GLYTH_ACTIONS_READ__=()=>{const s=useLcosShellStore.getState(),selection=readNativeConversationSelection(),entry=useCollaborationSessionStore.getState().entries.get(s.projectId+":"+selection?.connectedConversationId);return{projectId:s.projectId,selection:selection?.connectedConversationId,receiver:s.composerTarget?.receiverConversationId,composerOpen:s.composerOpen,promptLength:s.composerPrompt.length,windowCount:s.windows.length,status:entry?.status,canSend:entry?.projection?.capabilities.canSend};};'});
  }
  if(method==='GET'&&delayDiagnostics&&url.pathname===base+'/connected-conversations/'+conversationId+'/work-view'){
   let release,settled;const gate=new Promise(resolve=>{release=resolve;});
   const ticket={stage,path:url.pathname,released:false,settled:false,responseStatus:null,failure:null,done:new Promise(resolve=>{settled=resolve;}),release(){if(!this.released){this.released=true;release();}}};
   delayedReads.push(ticket);await gate;
   try{await route.continue();const response=await request.response();if(response){await response.finished();ticket.responseStatus=response.status();}else ticket.failure=request.failure()?.errorText??'no response';}
   catch(error){ticket.failure=request.failure()?.errorText??safe(error.message);if(!request.failure())throw error;}
   finally{ticket.settled=true;settled();}return;
  }
  return route.continue();
 }catch(error){report.routeErrors.push({stage,error:safe(error.stack??error)});await route.abort().catch(()=>{});}});
 await context.routeWebSocket('**/*',socket=>{report.socketsBlocked.push({stage,path:new URL(socket.url()).pathname});socket.close();});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(safe(error)));
 page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({stage,path:new URL(response.url()).pathname,status:response.status()});});
 const read=()=>page.evaluate(()=>window.__GLYTH_ACTIONS_READ__?.());
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 stage='original-title-generic-open';await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:90000});
 const node=page.locator('.lcos-conversation-node-shell[data-lcos-node-id='+JSON.stringify(String(target.id))+']');await node.waitFor();
 await poll(()=>node.getAttribute('data-lcos-conversation-reference-status'),status=>status==='ready','actual Glyth projection ready');
 const renderedReference=await page.evaluate(id=>window.__LCOS_NODE_LAB__?.api?.getNodes?.().find(node=>node.id===id)?.data?.lcos_conversation_ref,target.id);
 assert.equal(renderedReference?.projectId,projectId);assert.equal(renderedReference?.connectedConversationId,conversationId);assert.equal(renderedReference?.canvasId,canvasId);report.renderedReference=renderedReference;
 stage='original-quiet-material-hover';await node.hover();
 const material=node.locator('[data-native-glyth-thought-material]');
 await material.locator('[data-ripple-renderer="siriwave-canvas"]').waitFor();
 await poll(()=>material.getAttribute('data-ripple-active'),active=>active==='true','passive GUI hover activates quiet M2 surface');
 const materialState=await material.evaluate(element=>{const field=element.querySelector('.lcos-soft-underlight-field'),canvas=field?.querySelector('canvas.lcos-spectral-ripple-canvas');return{
  phase:element.dataset.ripplePhase,active:element.dataset.rippleActive,source:element.dataset.source,renderer:field?.dataset.rippleRenderer,
  fieldHeight:field?getComputedStyle(field).height:null,pointerEvents:getComputedStyle(element).pointerEvents,canvasPointerEvents:canvas?getComputedStyle(canvas).pointerEvents:null,
  canvasPresent:!!canvas,ariaHidden:element.getAttribute('aria-hidden')};});
 assert.equal(materialState.phase,'quiet');assert.equal(materialState.active,'true');assert.equal(materialState.renderer,'siriwave-canvas');
 assert.equal(materialState.fieldHeight,'64px');assert.equal(materialState.pointerEvents,'none');assert.equal(materialState.canvasPointerEvents,'none');
 assert.equal(materialState.canvasPresent,true);assert.equal(materialState.ariaHidden,'true');report.quietMaterial=materialState;
 await shot('00-quiet-original-M2-material-hover');
 report.checks.push('Real Glyth hover shows the inert 64px original SiriWave M2 surface with pointer-events none; phase stays quiet and does not manufacture thinking or working.');
 stage='original-title-generic-open';
 const title=node.locator('[data-native-glyth-open]');
 if(await title.count()===0)throw Error('Root title DOM marker data-native-glyth-open is not present; exact original owner must be confirmed, no guessed button fallback.');
 await title.click();
 await poll(read,value=>value?.selection===conversationId&&value.status==='ready'&&value.canSend===false&&value.windowCount===0,'original title opens exact canonical read-only right rail');
 const frame=page.locator('[data-lcos-native-chat-frame]');assert.equal(await frame.count(),1);
 await poll(()=>frame.locator('[data-chat-message-id]').count(),count=>count===expectedMessageCount,'real canonical exact original messages');
 const options=page.locator('[data-lcos-conversation-continuation]');await options.waitFor();
 assert.equal(await options.locator('[aria-expanded="false"]').count(),1,'Generic title must not implicitly expand options.');
 const originalFrame=await frame.getAttribute('data-lcos-native-chat-frame');report.genericTitle={sameCanonical:true,optionsExpanded:false,windowCount:(await read()).windowCount,frame:originalFrame};
 await poll(()=>delayedReads.length,count=>count>0,'explicitly held original diagnostic GET');
 assert.ok(delayedReads.every(ticket=>!ticket.released&&!ticket.settled));
 assert.ok(projection.capabilityReasons?.canSend);await frame.getByText(projection.capabilityReasons.canSend,{exact:true}).waitFor();
 assert.equal(await frame.getByText('正在准备当前会话…',{exact:true}).count(),0);
 assert.equal(await frame.getByText('正在读取会话状态…',{exact:true}).count(),0,'Known disconnected product reason must not be replaced by a diagnostic-loading claim');
 report.reasonDuringExplicitGetDelay={blockedReason:projection.capabilityReasons.canSend,canSend:(await read()).canSend,heldReads:delayedReads.length};
 assert.equal(report.reasonDuringExplicitGetDelay.canSend,false);
 await shot('01-original-title-generic-history-diagnostic-read-held');
 report.checks.push('Real existing Glyth title retains generic same-canonical history opening; while original diagnostic WorkView GETs are explicitly delayed, the already-read disconnected reason is shown immediately without a preparing/reading replacement.');
 releaseDiagnostics();await Promise.all(delayedReads.map(ticket=>ticket.done));
 assert.ok(delayedReads.every(ticket=>ticket.settled));assert.ok(delayedReads.some(ticket=>ticket.responseStatus===200),'At least one held original server read must actually finish successfully after release');

 stage='state-primary-original-options';
 const primary=node.locator('[data-native-glyth-primary="session-options"]');await primary.waitFor();assert.equal((await primary.locator('span').first().innerText()).trim(),'重新连接…');assert.match(await primary.getAttribute('aria-label'),/^重新连接… · /);
 assert.equal(await primary.isEnabled(),true);await primary.click();
 await options.locator('[aria-expanded="true"]').waitFor();
 await poll(read,value=>value?.selection===conversationId&&value.receiver===conversationId&&value.canSend===false&&value.windowCount===0,'state shortcut remains on same canonical and disconnected read-only owner');
 assert.equal(await frame.count(),1);assert.equal(await frame.locator('[data-chat-message-id]').count(),expectedMessageCount);
 const realModes=options.locator('.lcos-continuation-modes');await realModes.waitFor();
 assert.ok(await realModes.getByRole('radio').count()>0,'Actual original continuation actions are visible, not a substitute recovery panel.');
 assert.equal(await page.locator('[data-native-chat-requests]').count(),0,'Reconnect shortcut must not open journal requests instead of continuation options.');
 assert.equal(await page.locator('[data-lcos-workview="conversation"]').count(),0);
 // Explicitly wait for the original diagnostic hook to finish its read. A
 // transient "preparing" label is not evidence that the disconnected view settled.
 assert.ok(projection.capabilityReasons?.canSend);await frame.getByText(projection.capabilityReasons.canSend,{exact:true}).waitFor();
 assert.equal(await frame.getByText('正在准备当前会话…',{exact:true}).count(),0);
 report.readSettled={blockedReason:projection.capabilityReasons.canSend,canSend:(await read()).canSend};assert.equal(report.readSettled.canSend,false);
 report.finalUi=await read();report.originalOptions={expanded:true,radioCount:await realModes.getByRole('radio').count(),text:safe(await options.innerText())};
 const banner=page.locator('[data-lcos-native-execution-sync-feedback]');
 if(await banner.count()){
  assert.equal(await banner.count(),1);const text=await banner.innerText(),retry=banner.locator('[data-lcos-native-execution-sync-retry]');
  assert.doesNotMatch(text,/Failed to fetch|\bCore\b|\bAPI\b|执行投影/i);
  if(await banner.getAttribute('data-lcos-native-execution-sync-feedback')==='blocked'){
   assert.equal(await retry.count(),1,'Original retry control is retained');assert.equal(await retry.isEnabled(),true);
   assert.doesNotMatch(await retry.getAttribute('aria-label')??'',/Failed to fetch|\bCore\b|\bAPI\b|执行投影/i);
  }
  report.originalSyncBanner={state:await banner.getAttribute('data-lcos-native-execution-sync-feedback'),text:safe(text),retryPresent:await retry.count()===1,retryClicked:false};
 }else report.originalSyncBanner={present:false,scope:'No banner rendered in this run; absence is not evidence of its failure-state copy.'};
 await shot('02-state-shortcut-original-options');
 report.checks.push('Actual disconnected Glyth primary opens original continuation options for the same conversation; the original sync failure banner, when present from intentionally blocked POSTs, keeps its unclicked retry and exposes no transport/internal-owner wording.');
 assert.deepEqual(report.external,[]);assert.deepEqual(report.protocols,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.routeErrors,[]);
 report.passed=true;
}catch(error){report.error=safe(error.stack??error);process.exitCode=1;if(page){report.dom=safe(await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{
 releaseDiagnostics();
 if(before){try{const after=await facts();for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],key+' unchanged by read-only Glyth navigation');report.factsUnchanged=true;
  report.journalCount=after.operations.length;report.markerCount=after.markers.length;report.messagesBySession=Object.fromEntries(Object.entries(after.messages).map(([id,rows])=>[id,rows.length]));
 }catch(error){report.protectionError=safe(error.stack??error);report.passed=false;process.exitCode=1;}}
 await browser?.close();report.delayedOriginalGets=delayedReads.map(({done,release,...observation})=>observation);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,stage,factsUnchanged:report.factsUnchanged,blockedWrites:report.blockedWrites.length,external:report.external.length,protocols:report.protocols.length,pageErrors:report.pageErrors.length,modelCalls:0,report:path.join(output,'report.json'),error:report.error,protectionError:report.protectionError},null,2));
}






