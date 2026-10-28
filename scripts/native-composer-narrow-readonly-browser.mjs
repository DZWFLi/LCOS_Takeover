import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
assert.ok(process.argv.includes('--execute-readonly'),'Wait for root unified UI build/new Core PID; no connect/prepare/send mode exists.');
const scope='narrow-diagnostic';
const expectedPid=Number(option('expected-pid'));assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin=new URL(option('base-url')??'http://127.0.0.1:56311').origin;assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(origin).protocol,'http:');
const projectId='disposable-surface-core-facade',canvasId='surface-core-main',conversationId='connected-conversation-4244107f-aa59-4466-85e2-7ca53e230009',base='/api/lcos/core/projects/'+projectId;
const output=path.resolve(option('output-root')??'output/原输入材质与反馈接回_20261026/小屏可达性只读/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,scope:'fixed-original-slot-confirm-reachability-two-heights-readonly',fullFlowPassed:false,expectedPid,conversationId,checks:[],screenshots:[],blockedWrites:[],external:[],protocols:[],socketsBlocked:[],pageErrors:[],routeErrors:[],httpErrors:[],measurements:[],modes:[],
 forwardedWrites:0,modelCalls:0,submittedPrompts:0,browserChoice:'Browser plugin not available; existing Playwright-core and Chrome used.',
 notClaimed:['No connection, continuation confirmation, preparation, recovery, cancellation or model send is clicked.',
 'This run observes real disconnected 424/4-message input and original mode radios; supported submit/error/retry is covered by controlled-source tests.',
 'W1 hidden/unmount/state-change lifecycles are covered by the separate isolated actual-hook fixture, not fabricated on this real page.',
 'All browser POSTs including measurement/telemetry are blocked; this is not write-path success evidence.']};
const safe=value=>String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED]').replace(/\bBearer\s+[^\s\"']+/gi,'Bearer [REDACTED]');
const get=async route=>{const response=await fetch(origin+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route);const payload=await response.json();assert.ok(payload.ok===true||payload.code===0||route==='/health',route);return payload.value??payload.data??payload;};
const messageRows=payload=>Array.isArray(payload)?payload:payload.messages??payload.items;
async function facts(){const [graph,runs,markers,operations,connected,sessions,bindings]=await Promise.all([get(base+'/graph'),get(base+'/execution-projection'),get(base+'/spatial-markers'),get(base+'/conversation-continuations'),get(base+'/connected-conversations'),get(base+'/conversations'),get(base+'/spatial/bindings')]);
 const messages={},canvases={};for(const session of sessions){const payload=await get(base+'/conversations/'+encodeURIComponent(session.id)+'/messages?limit=1000');assert.equal(Boolean(payload.hasMore??payload.nextCursor),false);messages[session.id]=messageRows(payload);assert.ok(Array.isArray(messages[session.id]));}
 for(const id of ['surface-core-main','surface-core-context','surface-core-workflow'])canvases[id]=await get('/api/canvas/v1/canvases/'+id);return{graph,runs,markers,operations,connected,sessions,bindings,messages,canvases};}
const poll=async(read,match,label,timeout=30000)=>{const end=Date.now()+timeout;let value;do{value=await read();if(match(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<end);throw Error(label+' timed out; last='+JSON.stringify(value));};
const near=(a,b,label,tolerance=.6)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<=tolerance,label+' geometry '+key+': '+a[key]+' versus '+b[key]);};
let before,browser,page,stage='preflight',input,bubble,read,initialDraft,testReferenceEntityId;
try{
 const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);before=await facts();
 assert.equal(before.operations.length,34);assert.equal(before.markers.length,0);assert.equal(Object.values(before.messages).reduce((sum,rows)=>sum+rows.length,0),36);
 const canonical=before.connected.find(row=>row.id===conversationId);assert.ok(canonical?.conversationSessionId);assert.equal(before.messages[canonical.conversationSessionId].length,4);
 const long=before.connected.find(row=>row.id==='connected-conversation-b0b62164-091e-4656-b495-40da78541bf0');assert.equal(before.messages[long.conversationSessionId].length,28);
 const binding=before.bindings.filter(row=>row.projectId===projectId&&row.entityType==='conversation'&&row.entityId===conversationId&&row.canvasId===canvasId&&row.spatialKind==='node');assert.equal(binding.length,1);
 const node=before.canvases[canvasId].nodes.find(row=>row.id===binding[0].spatialId);assert.ok(node);report.nodeId=node.id;
 const projection=await get(base+'/connected-conversations/'+conversationId+'/collaboration-session');assert.equal(projection.capabilities.canSend,false);
 for(const capability of ['canResume','canSelectedContext','canBlankNew'])assert.equal(projection.capabilities[capability],true);assert.equal(projection.capabilities.canFork,false);
 report.actualCapabilities=projection.capabilities;
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1700,height:1100},locale:'zh-CN',serviceWorkers:'block',reducedMotion:'no-preference'});
 await context.route('**/*',async route=>{try{const request=route.request(),url=new URL(request.url()),method=request.method();
  if(['data:','blob:'].includes(url.protocol))return route.continue();if(!['http:','https:'].includes(url.protocol)){report.protocols.push({stage,protocol:url.protocol});return route.abort();}
  if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(base+'/')){report.external.push({stage,method,path:url.pathname});return route.abort();}
  if(!['GET','HEAD','OPTIONS'].includes(method)){report.blockedWrites.push({stage,method,path:url.pathname,forwarded:false});return route.abort();}
  if(method==='GET'&&url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:120000}),source=await response.text();const markers=['data-lcos-native-composer-material','nativeContinuationModeCopy','data-native-glyth-open'];
   assert.ok(markers.every(marker=>source.includes(marker)),'Unified bundle must contain the actual W1 material and continuation presentation bridges');
   return route.fulfill({response,body:source+'\nwindow.__COMPOSER_MATERIAL_READ__=()=>{const s=useLcosShellStore.getState(),selection=readNativeConversationSelection(),e=useCollaborationSessionStore.getState().entries.get(s.projectId+":"+selection?.connectedConversationId);return{projectId:s.projectId,selection:selection?.connectedConversationId,target:s.composerTarget,prompt:s.composerPrompt,caret:s.composerCaret,references:useLcosReferenceStore.getState().draft.orderedEntityRefs,referencePickOwner:useLcosReferenceStore.getState().referencePickOwner,bindingCanvasId:useLcosReferenceStore.getState().bindingCanvasId,nodeEntityRefs:[...useLcosReferenceStore.getState().nodeEntityRefs.entries()],currentCanvasId:useCanvasStore.getState().canvasId,windowCount:s.windows.length,composerOpen:s.composerOpen,status:e?.status,capabilities:e?.projection?.capabilities};};'});
  }return route.continue();
 }catch(error){report.routeErrors.push({stage,error:safe(error.stack??error)});await route.abort().catch(()=>{});}});
 await context.routeWebSocket('**/*',socket=>{report.socketsBlocked.push({stage,path:new URL(socket.url()).pathname});socket.close();});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(safe(error)));page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({stage,path:new URL(response.url()).pathname,status:response.status()});});
 read=()=>page.evaluate(()=>window.__COMPOSER_MATERIAL_READ__?.());const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const frame=page.locator('[data-lcos-native-chat-frame]');input=page.getByRole('textbox',{name:'Composer 输入',exact:true});bubble=page.locator('[data-lcos-native-composer-material="true"][data-lcos-composer-reference-surface]');
 const measure=async name=>{const value=await bubble.evaluate(element=>{const style=getComputedStyle(element),pseudo=getComputedStyle(element,'::before'),rect=element.getBoundingClientRect();return{active:element.getAttribute('data-lcos-native-composer-material-active'),hover:element.getAttribute('data-lcos-window-material-hover'),pointerX:element.style.getPropertyValue('--lcos-window-light-x'),pointerEvents:pseudo.pointerEvents,
  background:pseudo.backgroundImage,opacity:pseudo.opacity,display:pseudo.display,transitionDuration:pseudo.transitionDuration,transitionProperty:pseudo.transitionProperty,position:pseudo.position,
  isOriginalBubble:element.matches('[data-canvas-input-bubble]'),focusWithin:element.matches(':focus-within'),x:rect.x,y:rect.y,width:rect.width,height:rect.height,hostBorder:style.borderWidth};});report.measurements.push({name,...value});return value;};
 const editorState=()=>input.evaluate(element=>({text:element.value,start:element.selectionStart,end:element.selectionEnd}));
 const stableInput=async(expected,label)=>{const current=await read();assert.equal(current.selection,conversationId,label+' canonical');assert.equal(current.target.receiverConversationId,conversationId,label+' receiver');assert.equal(current.windowCount,0,label+' original window count');assert.deepEqual(current.capabilities,projection.capabilities,label+' true capabilities');if(expected){assert.equal(current.prompt,expected.prompt,label+' draft');assert.deepEqual(current.references,expected.references,label+' references');assert.deepEqual(current.target,expected.target,label+' input target');}return current;};
 const blankCanvas=async()=>{const point=await page.locator('.react-flow__pane').evaluate(element=>{const r=element.getBoundingClientRect();for(const [fx,fy]of[[.55,.12],[.6,.08],[.45,.2],[.7,.15]]){const x=r.left+r.width*fx,y=r.top+r.height*fy,hit=document.elementFromPoint(x,y);if(hit?.closest('.react-flow__pane')&&!hit.closest('.react-flow__node,button,[role="dialog"]'))return{x,y};}return null;});assert.ok(point,'A real blank original canvas point is required');return point;};
 stage='fresh-original-title';await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:90000});
 await page.locator('[data-native-glyth-open='+JSON.stringify(String(node.id))+']').click();await poll(read,value=>value?.selection===conversationId&&value.status==='ready'&&value.capabilities?.canSend===false,'same real 424 input');
 await poll(()=>frame.locator('[data-chat-message-id]').count(),count=>count===4,'four actual original messages');await input.waitFor();await bubble.waitFor();assert.equal(await bubble.count(),1);
 await poll(()=>bubble.getAttribute('data-lcos-native-composer-material-active'),value=>value==='true','visible enabled original bubble material');initialDraft=await stableInput(undefined,'fresh initial');assert.equal(initialDraft.prompt,'');assert.deepEqual(initialDraft.references,[]);report.initialInput={target:initialDraft.target,windowCount:initialDraft.windowCount};


 stage='reference-registration-readonly';
 const referenceSnapshot=async()=>{const value=await read();return{projectId:value.projectId,currentCanvasId:value.currentCanvasId,target:value.target,referencePickOwner:value.referencePickOwner,bindingCanvasId:value.bindingCanvasId,nodeEntityRefs:value.nodeEntityRefs,keys:value.nodeEntityRefs.map(([id])=>id),imageReference:value.nodeEntityRefs.find(([id])=>id==='surface-main-image')?.[1]??null,references:value.references,prompt:value.prompt,windowCount:value.windowCount};};
 report.referenceRegistration={before:await referenceSnapshot()};
 await frame.getByRole('button',{name:'从画布添加引用',exact:true}).click();
 await frame.getByRole('button',{name:'结束画布引用',exact:true}).waitFor();
 report.referenceRegistration.picking=await referenceSnapshot();
 await frame.getByRole('button',{name:'结束画布引用',exact:true}).click();
 report.referenceRegistration.after=await referenceSnapshot();
 assert.equal(report.referenceRegistration.after.referencePickOwner,null);assert.deepEqual(report.referenceRegistration.after.references,[]);
 report.checks.push('Reference registry and exact original reference-pick owner are observed through a read-only getter while the original pick control is toggled open/closed; no node is picked and no reference is fabricated.');

 stage='narrow-confirm-reachability';
 const options=page.locator('[data-lcos-conversation-continuation]'),header=frame.locator('[data-lcos-native-chat-header]');
 const draftText='W1 原输入材质验证稿：仅本地保留，不发送。';await input.fill(draftText);await input.press('Home');await input.press('ArrowRight');await input.press('ArrowRight');
 const edited=await stableInput(undefined,'diagnostic original local draft'),editorBefore=await editorState();assert.equal(editorBefore.start,2);assert.equal(editorBefore.end,2);
 const confirm=options.locator('[data-lcos-continuation-confirm]');
 const observation=()=>confirm.evaluate(element=>{
  const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
  const rect=box(element),ancestors=[];let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
  for(let parent=element.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent),r=box(parent),clipsX=/(hidden|clip|auto|scroll)/.test(style.overflowX),clipsY=/(hidden|clip|auto|scroll)/.test(style.overflowY);if(clipsX){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}if(clipsY){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}ancestors.push({tag:parent.tagName,className:typeof parent.className==='string'?parent.className:'',dataNativeFrame:parent.hasAttribute('data-lcos-native-chat-frame'),rect:r,overflowX:style.overflowX,overflowY:style.overflowY,clientHeight:parent.clientHeight,scrollHeight:parent.scrollHeight,scrollTop:parent.scrollTop,maxScrollTop:Math.max(0,parent.scrollHeight-parent.clientHeight),position:style.position,maxHeight:style.maxHeight,minHeight:style.minHeight});}
  const visible={left:Math.max(rect.left,clip.left),top:Math.max(rect.top,clip.top),right:Math.min(rect.right,clip.right),bottom:Math.min(rect.bottom,clip.bottom)};visible.width=Math.max(0,visible.right-visible.left);visible.height=Math.max(0,visible.bottom-visible.top);
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2,hit=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;const hitSamples=[[.1,.2],[.9,.2],[.1,.8],[.9,.8],[.5,.5]].map(([fx,fy])=>{const px=rect.x+rect.width*fx,py=rect.y+rect.height*fy,h=px>=0&&py>=0&&px<innerWidth&&py<innerHeight?document.elementFromPoint(px,py):null;return{fx,fy,owned:!!h&&(h===element||element.contains(h))};});
  return{viewport:{width:innerWidth,height:innerHeight},rect,clip,visible,fullyVisible:visible.width>=rect.width-.6&&visible.height>=rect.height-.6,actualOriginalHitHeight:rect.height,meets44pxHeight:rect.height>=44,centerHit:!!hit&&(hit===element||element.contains(hit)),hitTag:hit?.tagName??null,hitClass:typeof hit?.className==='string'?hit.className:null,disabled:element.disabled,hitSamples,allHitSamples:hitSamples.every(sample=>sample.owned),ancestors};
 });

 const elementHit=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=x>=0&&y>=0&&x<innerWidth&&y<innerHeight?document.elementFromPoint(x,y):null;let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let p=element.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/(hidden|clip|auto|scroll)/.test(s.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right);}if(/(hidden|clip|auto|scroll)/.test(s.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom);}}return{x:r.x,y:r.y,width:r.width,height:r.height,clip,fullyVisible:r.left>=clip.left-.6&&r.right<=clip.right+.6&&r.top>=clip.top-.6&&r.bottom<=clip.bottom+.6,centerHit:!!h&&(h===element||element.contains(h))};});
 report.viewports=[];
 for(const height of [820,400]){
  stage='narrow-360x'+height;await page.setViewportSize({width:360,height});await input.waitFor();
  const headerBefore=await elementHit(header);assert.equal(headerBefore.fullyVisible,true,'Original header must remain visible at '+height);
  const collapsedToggle=options.locator('button[aria-expanded="false"]');const slot=frame.locator(':scope > div > .relative.z-10');const slotBox=await slot.boundingBox();assert.ok(slotBox);if(!(await elementHit(collapsedToggle)).fullyVisible){await page.mouse.move(slotBox.x+slotBox.width*.7,slotBox.y+slotBox.height*.5);for(let count=0;count<6;count++){await page.mouse.wheel(0,80);await page.waitForTimeout(100);if((await elementHit(collapsedToggle)).fullyVisible)break;}}assert.equal((await elementHit(collapsedToggle)).fullyVisible,true,'Original expansion control is wheel-reachable at '+height);await collapsedToggle.click();await options.getByText('开始方式',{exact:true}).waitFor();await confirm.waitFor();
  const value={viewport:{width:360,height},before:await observation(),headerBefore,confirmClicked:false,wheelObservations:[]};report.viewports.push(value);
  const scroller=await confirm.evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),r=parent.getBoundingClientRect();if(/(auto|scroll)/.test(s.overflowY)&&parent.scrollHeight>parent.clientHeight+1&&r.width>0&&r.height>0){return{x:Math.max(1,Math.min(innerWidth-2,r.left+r.width*.7)),y:Math.max(1,Math.min(innerHeight-2,r.top+Math.min(r.height*.5,120))),className:parent.className,scrollHeight:parent.scrollHeight,clientHeight:parent.clientHeight,overflowY:s.overflowY,minHeight:s.minHeight,flexShrink:s.flexShrink};}}return null;});
  value.originalScroller=scroller;assert.ok(scroller,'The existing original Composer slot must be wheel-scrollable at '+height);assert.equal(scroller.className,'relative z-10');assert.equal(scroller.overflowY,'auto');assert.equal(scroller.minHeight,'0px');assert.equal(scroller.flexShrink,'1');
  await shot('01-'+height+'-original-confirm-before-wheel');await page.mouse.move(scroller.x,scroller.y);
  for(let count=0;count<6;count++){await page.mouse.wheel(0,400);await page.waitForTimeout(100);const after=await observation();value.wheelObservations.push(after);if(after.fullyVisible&&after.allHitSamples)break;}
  value.after=await observation();value.wheelReachable=value.after.fullyVisible&&value.after.allHitSamples;assert.equal(value.after.rect.height,44,'Original 44px confirmation hit area');assert.equal(value.wheelReachable,true,'Full original confirm must be wheel-reachable at '+height);await shot('02-'+height+'-original-confirm-after-wheel');
  value.headerAfterWheel=await elementHit(header);near(headerBefore,value.headerAfterWheel,'Header stays fixed through original Composer scroll');assert.equal(value.headerAfterWheel.fullyVisible,true);
  // Return by the original wheel before using the original expand/collapse
  // button, without asking Playwright to force-scroll a hidden control.
  await page.mouse.move(scroller.x,scroller.y);for(let count=0;count<6;count++){await page.mouse.wheel(0,-400);await page.waitForTimeout(100);if((await elementHit(input)).fullyVisible)break;}
  value.inputAfterWheelBack=await elementHit(input);assert.equal(value.inputAfterWheelBack.fullyVisible,true,'Original input remains reachable by wheel at '+height);assert.equal(value.inputAfterWheelBack.centerHit,true);
  value.toggleWheelSteps=[];for(let count=0;count<6;count++){const toggleHit=await elementHit(options.locator('button[aria-expanded="true"]'));value.toggleWheelSteps.push(toggleHit);if(toggleHit.fullyVisible&&toggleHit.centerHit)break;await page.mouse.wheel(0,80);await page.waitForTimeout(100);}value.toggleAfterWheelBack=await elementHit(options.locator('button[aria-expanded="true"]'));assert.equal(value.toggleAfterWheelBack.fullyVisible,true,'Original collapse control remains separately wheel-reachable at '+height);assert.equal(value.toggleAfterWheelBack.centerHit,true);
  await options.locator('button[aria-expanded="true"]').click();assert.equal(await options.locator('input[value="continue_existing"]').count(),0);await input.waitFor();
  const current=await stableInput(edited,'same draft after viewport '+height);assert.deepEqual(current.caret,edited.caret,'Original saved caret survives original wheel/expand/collapse at '+height);assert.deepEqual(await editorState(),editorBefore);
  value.sameInputCaret=true;value.windowCount=current.windowCount;await shot('03-'+height+'-original-options-collapsed-input');
 }
 await input.fill('');await poll(read,value=>value.prompt===''&&value.references.length===0,'original local draft cleanup');const final=await stableInput(initialDraft,'read-only diagnostic final');assert.equal(final.prompt,'');assert.deepEqual(final.references,[]);assert.equal(final.referencePickOwner,null);
 report.localDraftCleanup={prompt:final.prompt,referenceCount:final.references.length,pickOwner:final.referencePickOwner,throughOriginalControls:true};
 report.checks.push('At both 360x820 and 360x400, actual original-slot wheel reaches the entire 44px confirmation button with all five elementFromPoint samples owned, then returns to the original input and collapse control. Header geometry, exact draft/caret/canonical and zero windows are preserved; confirmation is never clicked.');
 assert.deepEqual(report.external,[]);assert.deepEqual(report.protocols,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.routeErrors,[]);report.passed=true;report.fullFlowPassed=false;
}catch(error){report.error=safe(error.stack??error);process.exitCode=1;if(page){report.finalUi=await read?.().catch(()=>null);report.dom=safe(await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{
 // Only clear the script's exact temporary local text through the original
 // textarea if the same canonical input still owns it; never touch another draft.
 if(page&&input&&read){try{const current=await read();if(current?.selection===conversationId){
  if(testReferenceEntityId&&current.references?.length===1&&current.references[0].entityId===testReferenceEntityId){
   const remove=page.locator('[data-lcos-native-chat-frame] [data-lcos-composer-ref]').getByRole('button',{name:/^移除引用 /});
   if(await remove.count()===1){await remove.click();report.failureReferenceCleanup={throughOriginalControl:true,entityId:testReferenceEntityId};}
  }
  if(current.prompt==='W1 原输入材质验证稿：仅本地保留，不发送。'){await input.fill('');report.failureTextCleanup={throughOriginalControl:true};}
 }}catch(error){report.cleanupObservation=safe(error.message);}}
 if(before){try{const after=await facts();report.factGroupMatches=Object.fromEntries(Object.keys(before).map(key=>[key,isDeepStrictEqual(after[key],before[key])]));
  const changed=Object.keys(report.factGroupMatches).filter(key=>!report.factGroupMatches[key]);assert.deepEqual(changed,[],'Read-only Composer fact groups changed (full equality evaluated in memory; message bodies omitted from errors)');
  report.factsUnchanged=true;report.journalCount=after.operations.length;report.markerCount=after.markers.length;report.messagesBySession=Object.fromEntries(Object.entries(after.messages).map(([id,rows])=>[id,rows.length]));report.totalMessages=Object.values(after.messages).reduce((sum,rows)=>sum+rows.length,0);
 }catch(error){report.protectionError=safe(error.stack??error);report.passed=false;process.exitCode=1;}}
 await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,scope:report.scope,fullFlowPassed:report.fullFlowPassed,stage,factsUnchanged:report.factsUnchanged,blockedWrites:report.blockedWrites.length,external:report.external.length,protocols:report.protocols.length,pageErrors:report.pageErrors.length,modelCalls:0,report:path.join(output,'report.json'),error:report.error,protectionError:report.protectionError},null,2));
}




