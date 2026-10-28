import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile as runFile } from 'node:child_process';
import { promisify } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
assert.ok(process.argv.includes('--execute-readonly'),'Run only after the unified bundle and exact Core PID are authorized.');
const expectedPid=Number(option('expected-pid'));assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin='http://127.0.0.1:56311',projectId='disposable-surface-core-facade';
const projectBase='/api/lcos/core/projects/'+projectId,root=process.cwd();
const output=path.resolve(option('output-root')??'output/原任务同步通知_20261026/真实原页/'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const execFile=promisify(runFile),factsScript=path.resolve('scripts/native-gui-facts-read.mjs');
const report={passed:false,expectedPid,checks:[],screenshots:[],scenes:[],retryAttempts:[],blockedWrites:[],external:[],protocols:[],streamsBlocked:[],socketsBlocked:[],pageErrors:[],httpErrors:[],
  forwardedWrites:0,modelCalls:0,submittedPrompts:0,hiddenSetters:0,
  observation:'Only one appended read-only original Shell/ReferenceStore/Canvas snapshot; original DOM clicks and native Surface navigation. Actual reconcile POST attempts are held only to observe busy, then aborted without forwarding.',
  notClaimed:['A blocked reconcile attempt verifies truthful feedback and original manual retry, not backend synchronization success.','Retained JavaScript action callback invocation after owner change is actual-source coverage; the browser verifies old physical action detachment, not an invented callback.','This script creates no node, conversation, Run, message or draft and never connects or sends.']};
let browser,page,stage='preflight',retryPlan;
const held=[];
const safe=value=>String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED]').replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]');
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const health=async()=>{const response=await fetch(origin+'/health',{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.pid,expectedPid);assert.equal(payload.realCoreConnected,true);return payload;};
const facts=async(name,compare)=>{await health();const file=path.join(output,name+'.json');const args=[factsScript,'--output='+file,...(compare?['--compare='+compare]:[])];
 const result=await execFile(process.execPath,args,{cwd:root,timeout:90000,maxBuffer:1024*1024});
 const value=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(value.summary.pid,expectedPid);return{file,summary:value.summary,stdout:result.stdout};};
const poll=async(read,match,label,timeout=30000)=>{const end=Date.now()+timeout;let value;do{value=await read();if(match(value))return value;await new Promise(resolve=>setTimeout(resolve,75));}while(Date.now()<end);throw Error(label+' timed out; last='+JSON.stringify(value));};
const reconcilePath=pathname=>/^\/api\/lcos\/canvases\/[^/]+\/execution:reconcile$/.test(pathname);
const factsBefore=await facts('facts-before');report.factsBefore=factsBefore.summary;
try{
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 for(const viewport of [{width:1500,height:1000},{width:360,height:800}]){
  const label=viewport.width===360?'narrow360':'desktop';
  const context=await browser.newContext({viewport,locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   if(['data:','blob:'].includes(url.protocol))return route.continue();
   if(!['http:','https:'].includes(url.protocol)){report.protocols.push({stage,protocol:url.protocol});return route.abort();}
   if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(projectBase+'/')){
    report.external.push({stage,method,path:url.pathname});return route.abort();}
   if(method!=='GET'){
    const row={stage,method,path:url.pathname,forwarded:false,held:false};report.blockedWrites.push(row);
    if(method==='POST'&&reconcilePath(url.pathname)&&retryPlan?.canvasId&&url.pathname.includes('/'+retryPlan.canvasId+'/')&&retryPlan.armed){
     const plan=retryPlan;plan.armed=false;plan.hit=true;row.held=true;plan.row=row;
     await new Promise(resolve=>{plan.release=resolve;held.push(plan);});row.released=true;
    }
    return route.abort('blockedbyclient');
   }
   if(request.resourceType()==='eventsource'||(request.headers().accept??'').includes('text/event-stream')){
    report.streamsBlocked.push({stage,path:url.pathname});return route.abort();}
   if(url.pathname==='/lcos/agent-ui.js'){
    const response=await route.fetch({timeout:120000,maxRedirects:0}),source=await response.text();
    assert.ok(source.includes('createNativeExecutionSyncFeedbackController')&&source.includes('useNativeDropNotice'),'Unified source has the actual execution-sync original-notice adapter.');
    return route.fulfill({response,body:source+'\nwindow.__SYNC_NOTICE_READ__=()=>{const s=useLcosShellStore.getState(),r=useLcosReferenceStore.getState(),c=useCanvasStore.getState();return{project:s.projectId,canvas:c.canvasId,workspace:s.activeWorkspaceId,surface:s.activeSurface,status:c.status,prompt:s.composerPrompt,refs:r.draft.orderedEntityRefs,target:s.composerTarget,windows:s.windows,timeOrigin:performance.timeOrigin}};'});
   }
   return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{report.socketsBlocked.push({stage,path:new URL(socket.url()).pathname});socket.close();});
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.pageErrors.push({stage,message:safe(error.stack??error)}));
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({stage,path:new URL(response.url()).pathname,status:response.status()});});
  const read=()=>page.evaluate(()=>window.__SYNC_NOTICE_READ__?.());
  const hidden=()=>page.locator('[data-lcos-native-execution-sync-state]');
  const failedToast=()=>page.locator('[data-sonner-toast]').filter({has:page.getByRole('button',{name:'重试更新',exact:true})});
  const ready=async canvasId=>{
   await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});
   await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
   return poll(read,value=>value?.canvas===canvasId&&value.status==='ready','Actual current original Canvas/API');
  };
  const settle=async()=>page.evaluate(async()=>{
   const targets=[...document.querySelectorAll('[data-sonner-toast],[data-sonner-toaster]')];
   const animations=[...new Set(targets.flatMap(element=>element.getAnimations({subtree:true})))].filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity);
   await Promise.all(animations.map(animation=>animation.finished.catch(()=>undefined)));return{awaitedFiniteAnimations:animations.length};
  });
  const geometry=async()=>page.evaluate(()=>{
   const box=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   const visible=element=>element.getClientRects().length>0&&Number(getComputedStyle(element).opacity)>0;
   const hit=element=>{const r=element.getBoundingClientRect();return[[.2,.2],[.8,.2],[.5,.5],[.2,.8],[.8,.8]].map(([x,y])=>{const p={x:r.x+r.width*x,y:r.y+r.height*y},at=document.elementFromPoint(p.x,p.y);return{...p,hit:at===element||element.contains(at),target:at?.tagName,nearestToast:at?.closest('[data-sonner-toast]')?.getAttribute('data-sonner-toast')};});};
   const toasts=[...document.querySelectorAll('[data-sonner-toast]')].filter(visible).map(element=>({text:element.textContent,rect:box(element),removed:element.getAttribute('data-removed'),
    buttons:[...element.querySelectorAll('button')].filter(visible).map(button=>({label:button.textContent,rect:box(button),hits:hit(button)}))}));
   const chrome=[...document.querySelectorAll('[data-lcos-surface-dock] button[data-lcos-surface],.canvas-header-chrome button,[data-testid="canvas-dockbar-assets-btn"],[data-lcos-native-chat-frame] textarea')]
    .filter(visible).map(element=>({label:element.getAttribute('aria-label')??element.getAttribute('data-lcos-surface')??element.textContent?.slice(0,50),rect:box(element),hits:hit(element)}));
   return{viewport:{width:innerWidth,height:innerHeight},toasterRoots:[...document.querySelectorAll('[data-sonner-toaster]')].map(element=>({rect:box(element),position:element.getAttribute('data-position'),cssPosition:getComputedStyle(element).position})),
    toasts,chrome,legacyFeedback:document.querySelectorAll('[data-lcos-native-execution-sync-feedback]').length,state:[...document.querySelectorAll('[data-lcos-native-execution-sync-state]')].map(element=>element.getAttribute('data-lcos-native-execution-sync-state'))};
  });
  const shot=async name=>{const animations=await settle(),snapshot=await geometry();const file=path.join(output,label+'-'+name+'.png');await page.screenshot({path:file});
   report.screenshots.push(file);report.scenes.push({label:label+'-'+name,stage,animations,...snapshot});await save();return snapshot;};
  const fullHit=async(locator,name)=>{
   assert.equal(await locator.count(),1,name+' is unique');await locator.waitFor();const result=await locator.evaluate(element=>{const r=element.getBoundingClientRect();return{rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},width:innerWidth,height:innerHeight,
    hits:[[.15,.2],[.85,.2],[.5,.5],[.15,.8],[.85,.8]].map(([x,y])=>{const p={x:r.x+r.width*x,y:r.y+r.height*y},target=document.elementFromPoint(p.x,p.y);return{...p,hit:target===element||element.contains(target),target:target?.tagName};})};});
   assert.ok(result.rect.width>0&&result.rect.height>0&&result.rect.x>=0&&result.rect.y>=0&&result.rect.right<=result.width&&result.rect.bottom<=result.height,name+' fits viewport');
   assert.ok(result.hits.every(item=>item.hit),name+' is unobstructed across original button');return result;
  };
  stage=label+'-initial-main';await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:120000});const initial=await ready('surface-core-main');
  assert.equal(initial.prompt,'');assert.deepEqual(initial.refs,[]);
  await failedToast().waitFor();await poll(()=>hidden().getAttribute('data-lcos-native-execution-sync-state'),value=>value==='blocked','Blocked real controller state after intercepted reconcile');
  assert.equal(await page.locator('[data-lcos-native-execution-sync-feedback]').count(),0,'No independent positioned legacy banner when original notice exists');
  assert.ok(report.blockedWrites.some(row=>row.stage===stage&&row.method==='POST'&&reconcilePath(row.path)),'Initial failure comes from a real intercepted sync request, not forged projection state');
  const originalToast=await failedToast().elementHandle();assert.ok(originalToast);const action=failedToast().getByRole('button',{name:'重试更新',exact:true});
  const actionHit=await fullHit(action,'Original retry action');const first=await shot('01-blocked-original-notice');
  const matching=first.toasts.filter(toast=>toast.text.includes('画布中的任务暂时无法更新'));assert.equal(matching.length,1,'One active sync feedback toast, no stacked duplicate controller notices');
  assert.doesNotMatch(matching[0].text,/Failed to fetch|Projection|RawException|Core|API/i);
  stage=label+'-manual-retry-busy';const beforeRetry=report.blockedWrites.filter(row=>row.method==='POST'&&reconcilePath(row.path)).length;
  retryPlan={armed:true,canvasId:'surface-core-main',hit:false};
  // Two real pointer clicks use the original action. The first replaces the
  // action with busy; the second must not enqueue a second original retry.
  await page.mouse.dblclick(actionHit.rect.x+actionHit.rect.width/2,actionHit.rect.y+actionHit.rect.height/2,{delay:25});
  await poll(()=>Promise.resolve(retryPlan),value=>value?.hit&&typeof value.release==='function','One original retry reconcile request held before abort');
  await poll(()=>hidden().getAttribute('data-lcos-native-execution-sync-state'),value=>value==='syncing','Actual controller entered syncing');
  const busy=page.locator('[data-sonner-toast]').filter({hasText:'正在更新画布中的任务…'});await busy.waitFor();
  assert.equal(await busy.getByRole('button',{name:'重试更新',exact:true}).count(),0,'Busy has no duplicate retry action');
  const busyElement=await busy.elementHandle();assert.equal(await originalToast.evaluate((element,current)=>element===current,busyElement),true,'Same physical toast becomes busy');
  await shot('02-original-retry-busy');retryPlan.release();retryPlan=undefined;
  stage=label+'-retry-remains-truthfully-blocked';await failedToast().waitFor();await poll(()=>hidden().getAttribute('data-lcos-native-execution-sync-state'),value=>value==='blocked','Aborted original retry remains blocked');
  const blockedElement=await failedToast().elementHandle();assert.equal(await originalToast.evaluate((element,current)=>element===current,blockedElement),true,'Original id/element persists across blocked/busy/blocked');
  await fullHit(failedToast().getByRole('button',{name:'重试更新',exact:true}),'Original retry after failed attempt');
  await page.waitForTimeout(700);const afterRetry=report.blockedWrites.filter(row=>row.method==='POST'&&reconcilePath(row.path)).length;
  assert.equal(afterRetry-beforeRetry,1,'Double click creates exactly one actual request; failure does not auto-retry');
  report.retryAttempts.push({label,attempts:afterRetry-beforeRetry,doubleClick:true,forwarded:false,blockedAfter:true,samePhysicalToast:true});await shot('03-original-retry-blocked-no-fake-ready');
  stage=label+'-original-surface-context';const beforeSwitch=await read();const started=Date.now();
  const contextButton=page.locator('[data-lcos-surface-dock] button[data-lcos-surface="context"]');
  const contextHit=await fullHit(contextButton,'Original Context navigation while feedback is present');
  await page.mouse.click(contextHit.rect.x+contextHit.rect.width/2,contextHit.rect.y+contextHit.rect.height/2);
  await page.waitForURL('**/canvas/surface-core-context');await ready('surface-core-context');await failedToast().waitFor();
  const afterSwitch=await read();let detached;
  if(afterSwitch.timeOrigin===beforeSwitch.timeOrigin){await poll(()=>originalToast.evaluate(element=>element.isConnected),value=>!value,'Old exact scene toast is removed on original Surface switch');detached=true;}
  else detached='original navigation changed document; old-document cleanup is not claimed as an in-document observation';
  report.checks.push({label,originalSurfaceSwitch:true,sameDocument:afterSwitch.timeOrigin===beforeSwitch.timeOrigin,oldToastDetached:detached,elapsedMs:Date.now()-started});await shot('04-context-new-owner-notice');
  stage=label+'-original-surface-return-main';const mainButton=page.locator('[data-lcos-surface-dock] button[data-lcos-surface="main"]');const mainHit=await fullHit(mainButton,'Original Main navigation while feedback is present');
  await page.mouse.click(mainHit.rect.x+mainHit.rect.width/2,mainHit.rect.y+mainHit.rect.height/2);await page.waitForURL('**/canvas/surface-core-main');await ready('surface-core-main');await failedToast().waitFor();
  const back=await read();assert.equal(back.prompt,'');assert.deepEqual(back.refs,[]);await shot('05-main-new-current-owner-notice');
  stage=label+'-leave-original-page';await page.goto(origin+'/health',{waitUntil:'domcontentloaded'});assert.equal(await page.locator('[data-sonner-toast]').count(),0);
  stage=label+'-return-original-page';await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:120000});await ready('surface-core-main');await failedToast().waitFor();
  const final=await read();assert.equal(final.prompt,'');assert.deepEqual(final.refs,[]);await fullHit(failedToast().getByRole('button',{name:'重试更新',exact:true}),'Fresh owner retry after page return');
  await shot('06-return-page-fresh-current-owner');report.checks.push({label,originalBannerAbsent:true,blockedToastVisible:true,fullHitAction:true,leaveAndReturn:true,noDraftOrReferenceEdits:true});
  await context.close();page=undefined;
 }
 const after=await facts('facts-after',factsBefore.file);report.factsAfter=after.summary;report.factsUnchanged=true;
 assert.equal(report.forwardedWrites,0);assert.equal(report.modelCalls,0);assert.deepEqual(report.external,[]);assert.deepEqual(report.protocols,[]);assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.error=safe(error.stack??error);process.exitCode=1;if(page){report.failureUi=await page.evaluate(()=>window.__SYNC_NOTICE_READ__?.()).catch(()=>null);
 report.failureBody=safe(await page.locator('body').innerText().catch(()=>'<unavailable>'));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{
 for(const plan of held)plan.release?.();retryPlan=undefined;
 await browser?.close();
 try{const after=await facts('facts-final',factsBefore.file);report.finalFactsUnchanged=true;report.factsFinal=after.summary;}catch(error){report.factsError=safe(error.stack??error);report.passed=false;process.exitCode=1;}
 await save();
}
console.log(JSON.stringify({passed:report.passed,expectedPid,output,error:report.error,finalFactsUnchanged:report.finalFactsUnchanged,blockedWrites:report.blockedWrites.length,external:report.external,protocols:report.protocols,socketsBlocked:report.socketsBlocked,streamsBlocked:report.streamsBlocked},null,2));
