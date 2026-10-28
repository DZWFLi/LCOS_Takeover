import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
assert.ok(process.argv.includes('--execute-readonly'),'Run only after the unified build/PID is confirmed; no send/connect mode exists.');
const expectedPid=Number(option('expected-pid'));assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin=new URL(option('base-url')??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(origin).protocol,'http:');
const projectId='disposable-surface-core-facade',canvasId='surface-core-main',base='/api/lcos/core/projects/'+projectId;
const conversationId='connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
const output=path.resolve(option('output-root')??'output/原节点用于当前输入_20261026/真实原页/'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const draftPrefix='原More仅引用验证：',normalText=draftPrefix+'普通输入保留原稿。',continueText=draftPrefix+'续聊输入保留原稿。';
const report={passed:false,expectedPid,checks:[],screenshots:[],blockedWrites:[],external:[],protocols:[],socketsBlocked:[],pageErrors:[],httpErrors:[],
  injectedReadFailures:[],
  modelCalls:0,submittedPrompts:0,forwardedWrites:0,hiddenSetters:0,
  observation:'One appended read-only original Shell/ReferenceStore/Canvas snapshot. Only original DOM/keyboard plus original camera fitView for node discovery; no store setter or fake ref.',
  notClaimed:['This is reference admission, not an object edit/modify command.','No send, connect, recover, new conversation or Run is requested.','Historical explicit View is claimed only if a real existing Main carrier supplies it; otherwise actual-source coverage remains separate.','No-input object-context opening remains actual-source coverage because the original page creates its Canvas input.']};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const safe=value=>String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED]').replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]');
const get=async route=>{
  assert.ok(route.startsWith('/')&&!route.startsWith('//'));
  const response=await fetch(origin+route,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,route);
  const value=await response.json();assert.ok(value.ok===true||value.code===0||route==='/health',route);return value.value??value.data??value;
};
const facts=async()=>{
  const [graph,presentations,bindings,runs,markers,operations,connected,sessions]=await Promise.all([
    get(base+'/graph'),get(base+'/presentations'),get(base+'/spatial/bindings'),get(base+'/execution-projection'),get(base+'/spatial-markers'),
    get(base+'/conversation-continuations'),get(base+'/connected-conversations'),get(base+'/conversations')]);
  const messages={},canvases={};
  for(const session of sessions){const value=await get(base+'/conversations/'+encodeURIComponent(session.id)+'/messages?limit=1000');const rows=Array.isArray(value)?value:value.messages??value.items;
    assert.ok(Array.isArray(rows));assert.equal(Boolean(value.hasMore??value.nextCursor),false);messages[session.id]=rows;}
  for(const id of ['surface-core-main','surface-core-context','surface-core-workflow'])canvases[id]=await get('/api/canvas/v1/canvases/'+id);
  return{graph,presentations,bindings,runs,markers,operations,connected,sessions,messages,canvases};
};
const poll=async(read,matches,label,timeout=30000)=>{const end=Date.now()+timeout;let value;do{value=await read();if(matches(value))return value;await new Promise(resolve=>setTimeout(resolve,120));}while(Date.now()<end);throw Error(label+' timed out; last='+JSON.stringify(value));};
const inputIdentity=target=>target?Object.fromEntries(Object.entries(target).filter(([key])=>key!=='focusInput')):null;
let before,browser,page,stage='preflight',cleanupUi,faultPlan;
const heldFaultReads=[];
try{
  const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);
  before=await facts();const connected=before.connected.find(row=>row.id===conversationId);assert.ok(connected?.conversationSessionId);
  assert.equal(before.messages[connected.conversationSessionId].length,28);assert.equal(Object.values(before.messages).reduce((sum,rows)=>sum+rows.length,0),36);
  const textNode=before.canvases[canvasId].nodes.find(row=>row.id==='surface-main-text'),imageNode=before.canvases[canvasId].nodes.find(row=>row.id==='surface-main-image');
  assert.ok(textNode?.data?.lcos_ref&&imageNode?.data?.lcos_ref);report.targets={text:textNode.data.lcos_ref,image:imageNode.data.lcos_ref};
  const mainMaterial=before.canvases[canvasId].nodes.filter(row=>row.data?.lcos_ref&&['text','image'].includes(row.type));
  report.historicalMainCarriers=mainMaterial.filter(row=>{const artifact=before.graph.artifacts.find(value=>value.id===row.data.lcos_ref.artifactId);return artifact&&artifact.currentRevisionId!==row.data.lcos_ref.revisionId;}).map(row=>({nodeId:row.id,ref:row.data.lcos_ref}));
  const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
  const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(['data:','blob:'].includes(url.protocol))return route.continue();
    if(!['http:','https:'].includes(url.protocol)){report.protocols.push({stage,protocol:url.protocol});return route.abort();}
    if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(base+'/')){report.external.push({stage,method,path:url.pathname});return route.abort();}
    if(!['GET','HEAD','OPTIONS'].includes(method)){report.blockedWrites.push({stage,method,path:url.pathname,forwarded:false});return route.abort();}
    if(method==='GET'&&url.pathname===base+'/graph'&&faultPlan?.armed){
      const plan=faultPlan;plan.armed=false;plan.hit=true;
      const row={stage,path:url.pathname,kind:plan.hold?'explicitly held then failed original GET':'one original GET transport failure',status:503};report.injectedReadFailures.push(row);
      if(plan.hold){let release;const waiting=new Promise(resolve=>{release=resolve;});plan.release=()=>release();heldFaultReads.push(plan);await waiting;}
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{message:'Simulated read-only graph transport failure'}})});
    }
    if(method==='GET'&&url.pathname==='/lcos/agent-ui.js'){
      const response=await route.fetch({timeout:120000}),source=await response.text();assert.ok(source.includes('LCOSUseNativeNodeComposer')&&source.includes('lcos-native-show-current-input'),'Unified bundle contains the actual original-More action and current-input route bridge.');
      return route.fulfill({response,body:source+'\nwindow.__NODE_INPUT_READ__=()=>{const s=useLcosShellStore.getState(),r=useLcosReferenceStore.getState(),c=useCanvasStore.getState();return{project:s.projectId,canvas:c.canvasId,status:c.status,target:s.composerTarget,prompt:s.composerPrompt,caret:s.composerCaret,refs:r.draft.orderedEntityRefs,windows:s.windows,operations:[...r.referenceInputOperations.values()]}};'});
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{report.socketsBlocked.push({stage,path:new URL(socket.url()).pathname});socket.close();});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(safe(error)));
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({stage,path:new URL(response.url()).pathname,status:response.status()});});
  const read=()=>page.evaluate(()=>window.__NODE_INPUT_READ__?.());
  const input=page.getByRole('textbox',{name:'Composer 输入',exact:true}),header=page.locator('[data-lcos-native-chat-header]');
  const settleNativeMenus=async()=>{
    // Await the actual finite original toolbar/Menu animations. Ambient agent
    // loops are outside this DOM scope and are never frozen or hidden.
    const result=await page.evaluate(async()=>{
      const elements=[...document.querySelectorAll('[data-testid="canvas-node-toolbar"],[role="menu"]')];
      const animations=[...new Set(elements.flatMap(element=>element.getAnimations({subtree:true})))].filter(animation=>animation.playState==='running'
        &&animation.effect?.getComputedTiming().iterations!==Infinity);
      await Promise.all(animations.map(animation=>animation.finished.catch(()=>undefined)));
      return{awaitedOriginalAnimations:animations.length,visibleMenus:[...document.querySelectorAll('[role="menu"]')].filter(element=>element.getClientRects().length>0)
        .map(element=>({state:element.getAttribute('data-state'),opacity:getComputedStyle(element).opacity}))};
    });
    await page.waitForFunction(()=>[...document.querySelectorAll('[role="menu"][data-state="closed"]')].every(element=>element.getClientRects().length===0||Number(getComputedStyle(element).opacity)===0));
    return result;
  };
  const shot=async name=>{const originalAnimation=await settleNativeMenus();const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);(report.screenshotReadiness??=[]).push({name,...originalAnimation});await save();};
  const choose=async(id)=>{
    await header.getByRole('button',{name:'选择对话',exact:true}).click();const menu=page.locator('[data-lcos-native-chat-history]:visible');await menu.waitFor();
    if(id===null)await menu.getByText('画布助手',{exact:true}).click();
    else{const canonical=before.connected.find(row=>row.id===id);assert.ok(canonical);const sameLabel=before.connected.filter(row=>!String(row.conversationRef).startsWith('pending-')&&row.label===canonical.label);
      const labels=menu.getByText(canonical.label,{exact:true});assert.equal(await labels.count(),sameLabel.length,'Original archive order equals the actual connected list');
      const index=sameLabel.findIndex(row=>row.id===id);assert.ok(index>=0);await labels.nth(index).click();}
    await menu.waitFor({state:'hidden'});
    await poll(read,value=>id===null?value?.target?.nodeId==='canvas:'+canvasId&&value.target.intent==='delegate':value?.target?.receiverConversationId===id&&value.target.intent==='continue','Original exact input receiver');await input.waitFor();
    if(id!==null)await poll(()=>page.locator('[data-lcos-native-chat-frame] [data-chat-message-id]').count(),count=>count===28,'Actual existing continuation messages finish loading');
  };
  const focusCaret=async text=>{await input.fill(text);await input.focus();await input.press('Home');await input.press('ArrowRight');await input.press('ArrowRight');await input.press('ArrowRight');await input.press('Shift+ArrowRight');await input.press('Shift+ArrowRight');
    return poll(read,value=>value.prompt===text&&value.caret?.start===3&&value.caret?.end===5,'Original textarea selection owner');};
  const more=async node=>{
    await page.keyboard.press('Escape');
    await page.evaluate(async id=>{const api=window.__LCOS_NODE_LAB__?.api;if(!api?.fitView)throw Error('Original camera missing');await api.fitView({nodes:[{id}],padding:.8,minZoom:.6,maxZoom:.8,duration:0});},node.id);
    const element=page.locator('.react-flow__node[data-id="'+node.id+'"]');await element.waitFor();
    const hit=await element.evaluate((element,id)=>{const box=element.getBoundingClientRect();for(const y of [.35,.5,.65])for(const x of [.3,.5,.7]){const point={x:box.x+box.width*x,y:box.y+box.height*y},target=document.elementFromPoint(point.x,point.y);
      if(target?.closest('.react-flow__node')?.getAttribute('data-id')===id&&!target.closest('button,input,textarea,a,[contenteditable=true]'))return{...point,hit:target.tagName,rect:box.toJSON()};}return null;},node.id);
    assert.ok(hit,'Unobstructed original node face');(report.nodeHits??=[]).push({stage,nodeId:node.id,...hit});await page.mouse.click(hit.x,hit.y);
    const toolbar=element.locator('[data-testid="canvas-node-toolbar"]:visible');await toolbar.waitFor();const triggers=toolbar.locator('[aria-haspopup="menu"]');
    const choices=await triggers.evaluateAll(elements=>elements.map((element,index)=>({index,testId:element.getAttribute('data-testid'),
      viewMenu:!!element.closest('[data-testid="lcos-native-text-view-menu"]'),html:element.outerHTML.slice(0,800)})));
    (report.toolbarMenus??=[]).push({stage,nodeId:node.id,choices});const originalMore=choices.filter(row=>!row.viewMenu&&row.testId!=='lcos-native-text-view-menu');
    assert.equal(originalMore.length,1,'One node More, distinct from the original text reading-mode menu');await triggers.nth(originalMore[0].index).click();
    const action=page.getByRole('menuitem',{name:/^用于当前输入/});assert.equal(await action.count(),1,'One object-reference action in original More');return action;
  };
  const use=async(node,expected)=>{const action=await more(node);assert.notEqual(await action.getAttribute('aria-disabled'),'true');assert.equal(await action.isDisabled(),false);await action.click();
    const value=await poll(read,value=>value.refs.some(ref=>ref.entityId===expected.artifactId&&ref.artifactViewId===expected.artifactViewId&&ref.revisionId===expected.revisionId),'Exact original reference admission');await input.waitFor();
    if(value.target.intent==='continue')await poll(()=>page.locator('[data-lcos-native-chat-frame] [data-chat-message-id]').count(),count=>count===28,'Original task return restores the actual28-message conversation view');return read();};
  const sameInput=(actual,original)=>{assert.deepEqual(inputIdentity(actual.target),inputIdentity(original.target));assert.equal(actual.prompt,original.prompt);assert.deepEqual(actual.caret,original.caret);assert.deepEqual(actual.windows,original.windows);};
  const clearOwned=async()=>{
    if(await page.getByRole('menuitem',{name:/^用于当前输入/}).isVisible())await page.keyboard.press('Escape');
    const value=await read();assert.equal(value.project,projectId);assert.equal(value.canvas,canvasId);
    assert.ok(value.prompt===''||value.prompt.startsWith(draftPrefix),'Do not clear another input text');
    for(const ref of value.refs)assert.ok([textNode.data.lcos_ref,imageNode.data.lcos_ref].some(exact=>ref.entityId===exact.artifactId&&ref.revisionId===exact.revisionId),'Only this script added these material references');
    await input.waitFor();await input.fill('');
    while(await page.locator('[data-lcos-composer-ref] .native-composer-reference-remove').count())await page.locator('[data-lcos-composer-ref] .native-composer-reference-remove').first().click();
    await poll(read,value=>value.prompt===''&&value.refs.length===0,'Original UI draft/reference cleanup');
  };
  cleanupUi=async()=>{if(!page||page.isClosed())return;const value=await read();if(!value||value.project!==projectId||value.canvas!==canvasId)return;
    await choose(conversationId);await clearOwned();await choose(null);await clearOwned();report.uiCleanup={normalDraft:'',continuationDraft:'',references:0,originalControls:true};};
  stage='load';await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});await input.waitFor();
  const initial=await read();assert.equal(initial.prompt,'');assert.deepEqual(initial.refs,[]);report.initial=initial;
  stage='ordinary-text';const normal=await focusCaret(normalText);let used=await use(textNode,textNode.data.lcos_ref);sameInput(used,normal);assert.equal(used.refs.length,1);await shot('01-ordinary-original-more-exact-text');
  stage='ordinary-deduplicate';used=await use(textNode,textNode.data.lcos_ref);sameInput(used,normal);assert.equal(used.refs.length,1);
  stage='ordinary-image-reason';const disabled=await more(imageNode);assert.equal(await disabled.getAttribute('aria-disabled'),'true');assert.match(await disabled.innerText(),/图片|PDF|暂不能/);await shot('02-original-image-honest-reason');await page.keyboard.press('Escape');
  report.checks.push('Ordinary original More appends exact saved text once, preserves target/message/operation/draft/caret and existing window count; PNG remains disabled with the actual ordinary-channel reason.');
  stage='ordinary-task-list-return';await header.getByRole('button',{name:'查看任务',exact:true}).click();await input.waitFor({state:'hidden'});assert.match(await header.innerText(),/任务列表/);
  used=await use(textNode,textNode.data.lcos_ref);sameInput(used,normal);assert.equal(used.refs.length,1);await shot('03-original-task-list-back-to-same-input');
  report.checks.push('From the original task list, the same More action returns to the existing ordinary input through the named original route bridge; it does not choose a receiver or create another input.');
  stage='continuation-select';await choose(conversationId);const continuation=await focusCaret(continueText);assert.equal(continuation.target.receiverConversationId,conversationId);assert.equal(continuation.target.intent,'continue');
  stage='continuation-text';used=await use(textNode,textNode.data.lcos_ref);sameInput(used,continuation);assert.equal(used.refs.length,1);
  stage='continuation-image';used=await use(imageNode,imageNode.data.lcos_ref);sameInput(used,continuation);assert.equal(used.refs.length,2);await shot('04-existing-continuation-exact-text-and-image');
  stage='continuation-deduplicate';used=await use(imageNode,imageNode.data.lcos_ref);sameInput(used,continuation);assert.equal(used.refs.length,2);
  stage='continuation-task-list-return';await header.getByRole('button',{name:'查看任务',exact:true}).click();await input.waitFor({state:'hidden'});used=await use(textNode,textNode.data.lcos_ref);sameInput(used,continuation);assert.equal(used.refs.length,2);await shot('05-existing-continuation-returned-from-task-list');
  report.checks.push('Original history selects the existing canonical continuation. Text and PNG are admitted through the same current input, retain exact receiver/message/operation/draft/caret, deduplicate, and return from the original task list without connecting or sending.');
  if(!report.historicalMainCarriers.length)report.notClaimed.push('Current Main has no real historical-version carrier; historical no-latest fallback is covered by the executed actual-source test, not fabricated live data.');
  stage='notice-prepare-original-input';await choose(conversationId);await clearOwned();await choose(null);await clearOwned();
  const noticeInput=await focusCaret(normalText),noticeAction=await more(textNode);
  stage='notice-pending-after-original-more-exit';faultPlan={armed:true,hold:true};await noticeAction.click();
  await poll(()=>Promise.resolve(faultPlan),value=>value.hit&&typeof value.release==='function','One actual graph read held');
  const pendingToast=page.locator('[data-sonner-toast]').filter({hasText:'正在核对材料，原输入保留…'});await pendingToast.waitFor();
  await page.getByRole('menuitem',{name:/^用于当前输入/}).waitFor({state:'hidden'});assert.deepEqual((await read()).refs,[]);await shot('07-original-more-exited-pending-toast-visible');
  stage='notice-failed-visible';faultPlan.release();faultPlan=undefined;
  const failedToast=page.locator('[data-sonner-toast]').filter({has:page.getByRole('button',{name:'重试',exact:true})});await failedToast.waitFor();
  const failedElement=await failedToast.elementHandle();assert.ok(failedElement);assert.match(await failedToast.innerText(),/材料事实暂不可读取|材料暂时无法核对|暂时无法读取/);
  sameInput(await read(),noticeInput);assert.deepEqual((await read()).refs,[]);await shot('08-original-failure-toast-after-menu-exit');
  stage='notice-original-retry-succeeds';await failedToast.getByRole('button',{name:'重试',exact:true}).click();
  used=await poll(read,value=>value.refs.length===1&&value.refs[0].entityId===textNode.data.lcos_ref.artifactId,'Original toast retry admits the exact same material');sameInput(used,noticeInput);
  await poll(()=>failedElement.evaluate(element=>({connected:element.isConnected,text:element.textContent})),value=>value.connected&&/已用于当前输入/.test(value.text),'Same physical original toast becomes success');
  await shot('09-original-toast-retry-preserves-same-draft');
  stage='notice-dedupe-result';used=await use(textNode,textNode.data.lcos_ref);sameInput(used,noticeInput);assert.equal(used.refs.length,1);
  await page.locator('[data-sonner-toast]').filter({hasText:'这份版本已在当前输入中。'}).waitFor();
  report.checks.push('A held graph GET shows a visible pending toast after original More exits; one explicitly simulated GET503 leaves the exact draft intact and shows original Rt retry. Clicking that original action reloads exact facts, admits once and updates the same physical toast to success; repeat action reports deduplication.');
  stage='notice-stale-prepare';await clearOwned();const staleInput=await focusCaret(normalText),staleAction=await more(textNode);faultPlan={armed:true,hold:false};await staleAction.click();
  const staleToast=page.locator('[data-sonner-toast]').filter({has:page.getByRole('button',{name:'重试',exact:true})});await staleToast.waitFor();sameInput(await read(),staleInput);assert.deepEqual((await read()).refs,[]);assert.equal(faultPlan.hit,true);faultPlan=undefined;
  stage='notice-old-retry-invalidated-by-original-input-switch';await choose(conversationId);const newInput=await focusCaret(continueText);await staleToast.waitFor({state:'hidden'});
  assert.deepEqual((await read()).refs,[]);sameInput(await read(),newInput);await shot('10-old-toast-dismissed-after-original-history-switch');
  report.checks.push('A second actual GET failure produces a retry toast. Original history switching to the existing continuation dismisses that old toast; no old material is admitted, and the new input text/caret/receiver/message/operation remain intact. Retained-callback invocation after owner change is covered by actual-source tests, not a fabricated browser callback.');
  stage='ui-cleanup';await cleanupUi();await shot('06-original-controls-cleared-only-owned-drafts');
  const after=await facts();assert.deepEqual(after,before);assert.equal((await get('/health')).pid,expectedPid);report.factsUnchanged=true;
  report.messagesBySession=Object.fromEntries(Object.entries(after.messages).map(([id,rows])=>[id,rows.length]));report.totalMessages=Object.values(after.messages).reduce((sum,rows)=>sum+rows.length,0);report.journalCount=after.operations.length;
  assert.equal(report.modelCalls,0);assert.equal(report.forwardedWrites,0);assert.deepEqual(report.pageErrors,[]);report.passed=true;
  report.checks.push('Complete graph/presentations/bindings/Run truth/continuation journal/markers/connected sessions/messages and all three full Canvas DTOs remain byte-structure equal; original main 28 and total36 messages retained. All POSTs, external, unknown protocols and WebSockets are blocked.');
}catch(error){report.error=safe(error.stack??error);process.exitCode=1;if(page){report.body=safe(await page.locator('body').innerText().catch(()=>'<unavailable>'));report.failedUi=await page.evaluate(()=>window.__NODE_INPUT_READ__?.()).catch(()=>null);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{
  for(const held of heldFaultReads)held.release?.();faultPlan=undefined;
  try{if(cleanupUi)await cleanupUi();}catch(error){report.cleanupError=safe(error.stack??error);report.passed=false;process.exitCode=1;}
  if(before){try{const after=await facts();report.finalFactsUnchanged=same(before,after);assert.ok(report.finalFactsUnchanged);}catch(error){report.factsError=safe(error.stack??error);report.passed=false;process.exitCode=1;}}
  await save();await browser?.close();
}
console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,error:report.error,cleanupError:report.cleanupError,finalFactsUnchanged:report.finalFactsUnchanged,blockedWrites:report.blockedWrites.length,external:report.external,protocols:report.protocols,socketsBlocked:report.socketsBlocked},null,2));
