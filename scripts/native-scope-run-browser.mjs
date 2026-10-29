import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

const argument=process.argv.find(value=>value.startsWith('--base-url='));
assert.ok(argument,'Supply the coordinated isolated --base-url.');
const address=new URL(argument.slice(11));assert.equal(address.protocol,'http:');
assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');
assert.equal(address.username,'');assert.equal(address.password,'');
const origin=address.origin,fixture=JSON.parse(await fs.readFile('output/ScopeRun入口_20261022/fixture.json','utf8'));
const prefix='/api/lcos/core/projects/'+fixture.projectId;
const output=path.resolve('output/ScopeRun入口_20261022/真实页面/'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,at:new Date().toISOString(),origin,output,
  browser:'Existing Playwright Core / installed Chrome; loopback only',viewport:{width:1040,height:760},
  checks:[],writes:[],httpErrors:[],pageErrors:[],consoleErrors:[],screenshots:[],models:0,storeMutation:false,
  notTested:['No dispatch/cancel/retry/accept/reject/provider operation is exercised.','No synthetic next-Run route is injected; route-depth regression belongs to the independent routing test.']};
async function get(route){
  const response=await fetch(origin+route,{redirect:'error',cache:'no-store'}),body=await response.json();
  assert.ok(response.ok&&(body.ok===true||body.code===0),route+': '+JSON.stringify(body));
  return body.value??body.data;
}
const health=await(await fetch(origin+'/health',{redirect:'error'})).json();
assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);assert.equal(health.nativeRailPilot,true);
const expectedPid=process.argv.find(value=>value.startsWith('--expected-pid='));
if(expectedPid)assert.equal(health.pid,Number(expectedPid.slice(15)));
report.pid=health.pid;
const reviewRoute='/api/lcos/core/runs/'+encodeURIComponent(fixture.runId)+'/review';
const facts=async()=>({graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),
  workspaces:await get(prefix+'/workspaces'),projection:await get(prefix+'/execution-projection'),
  review:await get(reviewRoute),recipe:await get('/api/lcos/core/runs/'+encodeURIComponent(fixture.runId)+'/recipe'),
  members:await get(prefix+'/collections/'+fixture.inner.id+'/members'),
  canvases:await Promise.all(['main','context','workflow'].map(name=>get('/api/canvas/v1/canvases/surface-core-'+name)))});
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
let page,failNextTaskRead=false,failedTaskReads=0,failNextProjectionRead=false,failedProjectionReads=0,failInnerProjectionRead=false;
try{
  const context=await browser.newContext({viewport:report.viewport,locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(['http:','https:'].includes(url.protocol)&&url.origin!==origin)return route.abort();
    if(!['http:','https:','data:','blob:'].includes(url.protocol)){report.unexpectedProtocols??=[];report.unexpectedProtocols.push(url.protocol);return route.abort();}
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){
      report.writes.push({method:request.method(),path:url.pathname,body:request.postData()});
      if(url.pathname!=='/api/events')return route.abort();
    }
    if(failInnerProjectionRead&&request.method()==='GET'&&url.pathname===prefix+'/collections/'+fixture.inner.id+'/members'){failInnerProjectionRead=false;failNextProjectionRead=true;}
    if(failNextProjectionRead&&request.method()==='GET'&&url.pathname===prefix+'/execution-projection'){
      failNextProjectionRead=false;failedProjectionReads++;
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'SYNTHETIC_PROJECTION_FAILURE',message:'One controlled lightweight Run read failure'}})});
    }
    if(failNextTaskRead&&request.method()==='GET'&&url.pathname===reviewRoute){
      failNextTaskRead=false;failedTaskReads++;
      return route.fulfill({status:503,contentType:'application/json',
        body:JSON.stringify({ok:false,error:{code:'SYNTHETIC_READ_FAILURE',message:'One controlled task read failure'}})});
    }
    if(url.pathname==='/lcos/agent-ui.js'){
      const response=await route.fetch(),source=await response.text();
      assert.ok(source.includes('requestNativeTaskView'),'Read-only observation must extend the actual product bundle.');
      return route.fulfill({response,body:source+
        '\nwindow.__SCOPE_RUN_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return {projectId:s.projectId,canvasId:c.canvasId,prompt:s.composerPrompt,caret:s.composerCaret,target:s.composerTarget,inputKey:composerInputKey(s.composerTarget),windows:s.windows,viewport:c.rfInstance?.getViewport(),refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.pageErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().slice(0,1000));});
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({status:response.status(),path:new URL(response.url()).pathname});});
  await page.addInitScript(()=>{window.__SCOPE_RUN_MATERIAL_REQUESTS__=[];window.addEventListener('lcos-native-open-material',event=>window.__SCOPE_RUN_MATERIAL_REQUESTS__.push(event.detail));});
  const read=()=>page.evaluate(()=>window.__SCOPE_RUN_READ__());
  const shot=async name=>{
    await page.evaluate(async()=>{
      const animations=document.getAnimations().filter(animation=>{const effect=animation.effect,target=effect?.target;
        return animation.playState==='running'&&effect?.getTiming().iterations!==Infinity&&target instanceof Element
          &&!!target.closest('[data-radix-popper-content-wrapper],[data-lcos-native-chat-frame],[data-media-viewer]');});
      await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    report.visualStates??=[];report.visualStates.push({name,state:await page.locator('.native-library-content-preview,[data-media-viewer]').evaluateAll(elements=>elements.map(element=>({
      visible:element.getClientRects().length>0,opacity:getComputedStyle(element).opacity,hidden:element.closest('[data-radix-popper-content-wrapper]')?.hidden??false
    })))});
    const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);
  };
  const preview=page.locator('.native-library-content-preview'),library=page.locator('[data-library-view="library"]'),
    header=page.locator('[data-lcos-native-chat-header]'),task=page.locator('[data-native-task-detail]'),viewer=page.locator('[data-media-viewer]');
  const runKey=JSON.stringify(['run',fixture.runId]);
  const row=title=>preview.locator('[data-native-scope-member]').filter({hasText:title});
  const runRow=()=>preview.locator('[data-native-scope-member]').filter({hasText:fixture.instruction});
  const libraryBack=()=>header.getByRole('button',{name:'返回库内预览',exact:true});
  const waitTask=async()=>{await task.getByRole('heading',{name:fixture.instruction,exact:true}).waitFor();await libraryBack().waitFor();
    assert.equal(await page.locator('[data-lcos-window-body="run-review"],[data-lcos-window-body="conversation"]').count(),0);
    assert.equal(await page.locator('[data-lcos-native-chat-frame]').count(),1);};
  const waitMemberFocus=async()=>{await runRow().waitFor();await page.waitForFunction(key=>document.activeElement?.getAttribute('data-native-scope-member')===key,runKey);};
  await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});
  await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
  const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.waitFor();
  const draft='Scope Run 原任务栏往返，保留这份输入，不发送。';await input.fill(draft);
  await input.evaluate(element=>element.setSelectionRange(2,6));
  await page.getByTestId('canvas-dockbar-assets-btn').click();
  const search=library.getByRole('textbox',{name:'搜索',exact:true});await search.fill(fixture.scopeTitle);
  await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await runRow().waitFor();
  await runRow().scrollIntoViewIfNeeded();
  const before=await facts(),beforeUI=await read(),writeStart=report.writes.length;
  assert.equal(before.review.run.status,'created');assert.equal(before.review.dispatch.status,'planned');assert.equal(before.review.dispatch.attemptCount,0);
  report.beforeUI=beforeUI;
  function classifyBlockedNoOpCanvasWrite(write,index){
    if(write.method!=='POST'||write.path!=='/api/canvas/v1/canvases/surface-core-main/nodes:batchActions')return null;
    let body;try{body=JSON.parse(write.body);}catch{return null;}
    const canvas=before.canvases.find(value=>value.id==='surface-core-main'||value.canvas_id==='surface-core-main')??before.canvases[0];
    const node=canvas.nodes.find(value=>value.id==='surface-main-image');if(!node)return null;
    const expected={id:node.id,type:node.type,data:node.data,position:node.position,measured:node.measured};
    try{assert.deepEqual(Object.keys(body).sort(),['actions','canvas_id','created_by_role','lcos_expected_revisions']);
      assert.equal(body.canvas_id,'surface-core-main');assert.equal(body.created_by_role,'user');
      assert.deepEqual(body.actions,[{action:'update',updates:[expected]}]);
      assert.ok(body.lcos_expected_revisions&&Object.keys(body.lcos_expected_revisions).length>0);
      for(const [id,revisionId]of Object.entries(body.lcos_expected_revisions)){
        const owner=canvas.nodes.find(value=>value.id===id);assert.equal(owner?.data?.lcos_ref?.revisionId,revisionId);}
    }catch{return null;}
    return {phase:index<writeStart?'startup':'browse',request:write,decision:'Blocked; update payload is deepEqual to the before snapshot of this exact image node. Existing automatic image measurement POST remains in the ledger.',
      comparedFields:Object.keys(expected),beforeNode:node};
  }
  const classifyWrites=()=>{report.browseWrites=report.writes.slice(writeStart).filter(value=>value.path!=='/api/events');
    report.blockedNoOpCanvasWrites=report.writes.map((value,index)=>classifyBlockedNoOpCanvasWrite(value,index)).filter(Boolean);
    report.blockedNoOpCanvasWriteCounts={startup:report.blockedNoOpCanvasWrites.filter(value=>value.phase==='startup').length,browse:report.blockedNoOpCanvasWrites.filter(value=>value.phase==='browse').length};
    report.unexplainedBrowseWrites=report.writes.map((value,index)=>({value,index})).filter(({value,index})=>index>=writeStart&&value.path!=='/api/events'&&!classifyBlockedNoOpCanvasWrite(value,index)).map(({value})=>value);
    assert.deepEqual(report.unexplainedBrowseWrites,[]);
    assert.equal(report.writes.filter(value=>value.path.startsWith('/api/lcos/core/')).length,0,'No Core write is allowed, including during startup.');
  };
  const assertInput=async label=>{const value=await read();assert.equal(value.prompt,draft,label+' prompt');
    assert.equal(value.inputKey,beforeUI.inputKey,label+' input owner');
    assert.equal(value.target.messageId,beforeUI.target.messageId,label+' message owner');
    assert.equal(value.target.continuationOperationId,beforeUI.target.continuationOperationId,label+' continuation owner');
    assert.deepEqual([value.caret.start,value.caret.end],[2,6],label+' caret');
    assert.deepEqual(value.windows,beforeUI.windows,label+' Stage windows');assert.deepEqual(value.refs,beforeUI.refs,label+' references');
    for(const key of ['x','y','zoom'])assert.ok(Math.abs(value.viewport[key]-beforeUI.viewport[key])<.02,label+' camera '+key);
    assert.equal(await search.inputValue(),fixture.scopeTitle,label+' query');return value;};
  const scopeScroll=await preview.locator('.native-library-content-body').evaluate(element=>element.scrollTop);
  await shot('01-scope-run-member');await runRow().click();await waitTask();await shot('02-original-right-rail-task');
  await libraryBack().click();await waitMemberFocus();await assertInput('direct return');
  assert.equal(await preview.locator('.native-library-content-body').evaluate(element=>element.scrollTop),scopeScroll);
  report.checks.push('Scope Run → 同一原右栏任务详情 → 原 Header 返回库内预览；回同成员焦点、滚动、搜索与原输入');

  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});failNextProjectionRead=true;
  await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();
  await preview.getByText('任务列表暂时无法读取，请重新读取；原成员保留',{exact:true}).waitFor();
  await row(fixture.noteTitle).waitFor();await row(fixture.outer.title).waitFor();
  assert.ok(await preview.locator('[data-native-scope-member]').count()>=4);assert.equal(await runRow().count(),0);
  await shot('02b-scope-run-projection503-other-members-retained');
  await preview.getByRole('button',{name:'重新读取',exact:true}).click();await runRow().waitFor();
  assert.equal(failedProjectionReads,1);await assertInput('scope projection retry');
  report.checks.push('Scope 轻量 Run GET 503 只使该任务暂不可读，材料／附注／集合仍显示；原重新读取按钮恢复同一 Run');

  await row(fixture.outer.title).click();await row(fixture.inner.title).waitFor();failInnerProjectionRead=true;await row(fixture.inner.title).click();
  await preview.getByText('任务列表暂时无法读取，请重新读取；原成员保留',{exact:true}).waitFor();
  await row(fixture.noteTitle).waitFor();await row(fixture.artifactTitle).waitFor();assert.equal(await runRow().count(),0);
  await preview.getByRole('button',{name:'重新读取',exact:true}).click();await runRow().waitFor();
  assert.equal(failedProjectionReads,2);await assertInput('collection projection retry');await runRow().scrollIntoViewIfNeeded();
  report.checks.push('内层集合轻量 Run GET 503 保留真实材料、附注和 Run 失败行；原重新读取在原集合内恢复，不关开绕过');

  failNextProjectionRead=true;await runRow().click();
  await preview.getByText('任务列表暂时无法读取，请重新读取；原成员保留',{exact:true}).waitFor();
  assert.equal(await task.count(),0,'A failed fresh Run read must not enter a task or substitute another Run.');
  await row(fixture.noteTitle).waitFor();await row(fixture.artifactTitle).waitFor();
  await shot('03b-run-click-fresh-read503-original-message');
  await preview.getByRole('button',{name:'重新读取',exact:true}).click();
  await preview.getByText('任务列表暂时无法读取，请重新读取；原成员保留',{exact:true}).waitFor({state:'hidden'});
  await runRow().waitFor();assert.equal(failedProjectionReads,3);
  report.checks.push('已显示的Run成员点击前fresh GET503报告具体任务读取失败，不误报内容变化、不进入其他Run；原重新读取后可继续同一任务');
  const innerScroll=await preview.locator('.native-library-content-body').evaluate(element=>element.scrollTop);
  await runRow().click();await waitTask();await shot('03-nested-run-same-task-page');
  await libraryBack().click();await waitMemberFocus();
  await preview.getByRole('button',{name:'返回 '+fixture.outer.title,exact:true}).waitFor();
  assert.equal(await preview.locator('.native-library-content-body').evaluate(element=>element.scrollTop),innerScroll);
  await assertInput('nested return');await shot('04-nested-member-restored');
  report.checks.push('Scope → 外层集合 → 内层集合 → 同一 Run 任务详情 → 原 Header 回内层同成员；没有新窗口或第二任务组件');

  failNextTaskRead=true;await runRow().click();await task.getByRole('button',{name:'重试读取',exact:true}).waitFor();
  await libraryBack().waitFor();assert.equal(failedTaskReads,1);await shot('05-task-get503-original-retry');
  await task.getByRole('button',{name:'重试读取',exact:true}).click();await waitTask();assert.equal(failedTaskReads,1);
  await libraryBack().click();await waitMemberFocus();await assertInput('read retry return');
  report.checks.push('单次任务详情 GET 503 在原任务页显示原重试按钮；重试读取同一 Run 后仍能返回原集合成员');

  await runRow().click();await waitTask();
  const sources=task.locator('summary').filter({hasText:'使用的材料'});await sources.click();
  await task.getByRole('button',{name:fixture.source.title,exact:true}).click();
  await viewer.waitFor();await page.locator('[data-lcos-native-text-reading]').waitFor();
  report.viewerBeforeEscape=await page.evaluate(async()=>{
    const runtime=(await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime;
    let stable=0,frames=0,key,phase;while(stable<3&&frames++<180){await new Promise(resolve=>requestAnimationFrame(resolve));
      const state=runtime.getState(),nextKey=state.session?.lcosControlled?.requestKey;phase=state.phase;
      stable=phase==='open'&&nextKey!==undefined&&nextKey===key?stable+1:0;key=nextKey;}
    const active=document.activeElement;return {stable,frames,key,phase,active:{tag:active?.tagName,role:active?.getAttribute('role'),label:active?.getAttribute('aria-label'),html:active?.outerHTML.slice(0,600)}};});
  assert.equal(report.viewerBeforeEscape.stable,3,'Wait for the existing Viewer to finish its original queued open lifecycle.');
  const materialTarget=await page.evaluate(()=>window.__SCOPE_RUN_MATERIAL_REQUESTS__.at(-1));
  assert.equal(materialTarget.artifactId,fixture.source.artifactId);assert.equal(materialTarget.revisionId,fixture.source.revisionId);
  report.materialTarget=materialTarget;await shot('06-task-manifest-original-viewer');
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});await waitTask();
  await libraryBack().click();await waitMemberFocus();await assertInput('task material return');
  report.checks.push('任务真实 manifest → 原材料 Viewer 精确版本 → Escape 回同一任务 → 原 Header 回集合，未跳过任务层');

  const previewBox=await preview.boundingBox();assert.ok(previewBox&&previewBox.x>=0&&previewBox.y>=0&&previewBox.x+previewBox.width<=1041&&previewBox.y+previewBox.height<=761);
  await preview.getByRole('button',{name:'返回 '+fixture.outer.title,exact:true}).click();
  await preview.getByRole('button',{name:'返回 '+fixture.scopeTitle,exact:true}).click();await runRow().waitFor();
  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
  await header.getByRole('button',{name:'查看任务',exact:true}).click();
  await page.locator('[data-lcos-native-run-list]').waitFor();
  await page.locator('[data-lcos-native-run-list-item]').filter({hasText:fixture.instruction}).getByRole('button').click();
  await task.getByRole('heading',{name:fixture.instruction,exact:true}).waitFor();
  assert.equal(await libraryBack().count(),0);
  await header.getByRole('button',{name:'返回任务列表',exact:true}).click();await page.locator('[data-lcos-native-run-list]').waitFor();
  await header.getByRole('button',{name:'返回对话',exact:true}).click();await input.waitFor();
  assert.equal(await input.inputValue(),draft);const ordinary=await read();
  assert.deepEqual([ordinary.caret.start,ordinary.caret.end],[2,6]);assert.equal(ordinary.inputKey,beforeUI.inputKey);
  await shot('07-original-list-detail-list-conversation');
  report.checks.push('1040×760 原预览与返回可达；普通 Header 查看任务 → 原列表 → 任务 → 列表 → 对话仍按原路径工作');

  const after=await facts();assert.deepEqual(after,before);
  const afterUI=await read();assert.equal(afterUI.prompt,draft);assert.deepEqual(afterUI.windows,beforeUI.windows);assert.deepEqual(afterUI.refs,beforeUI.refs);
  classifyWrites();assert.deepEqual(report.pageErrors,[]);
  assert.equal(after.review.run.status,'created');assert.equal(after.review.dispatch.status,'planned');assert.equal(after.review.dispatch.attemptCount,0);
  report.failedTaskReads=failedTaskReads;report.failedProjectionReads=failedProjectionReads;
  report.checks.push('Core／Run事实未变，未派发，Run保持created/planned/attemptCount=0；原画布同值自动POST尝试单列未销账，非同值或其他写操作仍失败');

  if(!await library.isVisible())await page.getByTestId('canvas-dockbar-assets-btn').click();await search.waitFor();await search.fill(fixture.scopeTitle);
  await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await runRow().waitFor();
  await runRow().click();await waitTask();await header.getByRole('button',{name:'收起对话',exact:true}).click();
  await preview.waitFor({state:'hidden'});await library.waitFor({state:'visible'});
  assert.equal(await page.locator('[data-radix-popper-content-wrapper][hidden] .native-library-content-preview').count(),0);
  assert.equal((await read()).prompt,draft);await shot('08-close-task-closes-original-preview');
  await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await runRow().waitFor();
  await runRow().click();await waitTask();await header.getByRole('button',{name:'选择对话',exact:true}).click();
  const history=page.locator('[data-lcos-native-chat-history]:visible');await history.waitFor();
  await history.getByText(fixture.conversationTitle,{exact:true}).click();
  await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。',{exact:true}).waitFor();
  await preview.waitFor({state:'hidden'});await library.waitFor({state:'visible'});
  assert.equal(await page.locator('[data-radix-popper-content-wrapper][hidden] .native-library-content-preview').count(),0);
  assert.equal(await task.count(),0);await shot('09-switch-conversation-closes-old-preview');
  await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await runRow().waitFor();
  await runRow().click();await waitTask();await libraryBack().click();await waitMemberFocus();
  await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。',{exact:true}).waitFor();
  await shot('10-reenter-library-run-after-cancellation');
  assert.deepEqual(await facts(),before);
  classifyWrites();
  assert.deepEqual(report.pageErrors,[]);report.cancelledReadingUI=await read();
  report.checks.push('原收起／换既有对话均真正取消并收起旧TS，库列表仍在且无hidden残留；再从原库行进入Run并返回正常，Core事实未改');
  report.passed=true;
}catch(error){
  report.error=String(error.stack??error);process.exitCode=1;
  if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    report.dom=await page.locator('body').innerText().catch(()=>null);
    report.ui=await page.evaluate(()=>window.__SCOPE_RUN_READ__?.()).catch(()=>null);
    report.aria=await page.locator('body').ariaSnapshot().catch(()=>null);
    report.viewerFailure=await page.evaluate(async()=>{const state=(await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState();const active=document.activeElement;
      return {phase:state.phase,requestKey:state.session?.lcosControlled?.requestKey,focus:{tag:active?.tagName,label:active?.getAttribute('aria-label'),html:active?.outerHTML.slice(0,600)}};}).catch(()=>null);}
}finally{
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await page?.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});await browser.close();
  console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));
}

