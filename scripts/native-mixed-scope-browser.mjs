import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const arg=process.argv.find(value=>value.startsWith('--base-url='));assert.ok(arg,'Supply the coordinated isolated URL.');
const address=new URL(arg.slice(11));assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');
const origin=address.origin,fixture=JSON.parse(await fs.readFile('output/混合Scope取用_20261022/fixture.json','utf8')),prefix='/api/lcos/core/projects/'+fixture.projectId;
const output=path.resolve('output/混合Scope取用_20261022/真实页面/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,origin,output,browser:'Browser plugin not available; existing Playwright Core / installed Chrome',checks:[],writes:[],httpErrors:[],pageErrors:[],consoleErrors:[],screenshots:[],models:0,storeMutation:false,limitations:[]};
const get=async route=>{const response=await fetch(origin+route,{redirect:'error',cache:'no-store'}),body=await response.json();assert.ok(response.ok&&(body.ok===true||body.code===0),route+': '+JSON.stringify(body));return body.value??body.data;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');assert.equal(health.realCoreConnected,true);assert.equal(health.nativeRailPilot,true);
const expectedPid=process.argv.find(value=>value.startsWith('--expected-pid='));if(expectedPid)assert.equal(health.pid,Number(expectedPid.slice(15)));report.pid=health.pid;
const canvasListing=await get('/api/canvas/v1/canvases?limit=100&offset=0');assert.equal(canvasListing.total,3);assert.deepEqual(canvasListing.canvases.map(row=>row.id).sort(),['surface-core-context','surface-core-main','surface-core-workflow']);report.canvasListing={total:canvasListing.total,ids:canvasListing.canvases.map(row=>row.id),unopenedWorkspaceRetained:fixture.workspace.id};
const before={graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),collections:await get(prefix+'/collections'),workspaces:await get(prefix+'/workspaces'),
 timeline:await get(prefix+'/connected-conversations/'+fixture.conversationId+'/collaboration-timeline?limit=100'),run:await get('/api/lcos/core/runs/'+fixture.runId+'/review'),canvas:await get('/api/canvas/v1/canvases/surface-core-main')};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
let page,allowPlannedCreate=false,allowRejectedCreate=false,createdRunId,ordinaryDraft,allowedCreates=0,rejectedCreates=0;
try{
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(['http:','https:'].includes(url.protocol)&&url.origin!==origin)return route.abort();
  if(!['http:','https:','data:','blob:'].includes(url.protocol)){report.unexpectedProtocols??=[];report.unexpectedProtocols.push(url.protocol);return route.abort();}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
   const write={method:request.method(),path:url.pathname,body:request.postData(),permitted:false};report.writes.push(write);
   if(url.pathname==='/api/events')return route.continue();
   if((allowPlannedCreate&&allowedCreates===0||allowRejectedCreate&&rejectedCreates===0)&&request.method()==='POST'&&url.pathname===prefix+'/runs'){
    const body=JSON.parse(request.postData());assert.deepEqual(body.orderedReferences.map(item=>({...item,mode:item.mode??'full'})),[{ref:{type:'scope',scopeId:allowRejectedCreate?fixture.unsupportedScope.id:fixture.scopeId},order:0,mode:'full'}]);
    assert.deepEqual(body.contextArtifactIds,[]);assert.equal(body.receiverRef,undefined);assert.equal(body.instruction,ordinaryDraft);
    write.permitted=true;write.purpose=allowRejectedCreate?'whole-PNG-scope-expected-failure':'whole-text-Scope-planned-only';if(allowRejectedCreate)rejectedCreates++;else allowedCreates++;await fs.writeFile(path.join(output,allowRejectedCreate?'PNG整份失败提交意图.json':'普通任务提交意图.json'),JSON.stringify(write,null,2));return route.continue();
   }
   return route.abort();
  }
  if(url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch(),source=await response.text();assert.ok(source.includes('requestNativeScopeReferenceView'));
   return route.fulfill({response,body:source+'\nwindow.__MIXED_SCOPE_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return {projectId:s.projectId,canvasId:c.canvasId,prompt:s.composerPrompt,caret:s.composerCaret,target:s.composerTarget,inputKey:composerInputKey(s.composerTarget),windows:s.windows,viewport:c.rfInstance?.getViewport(),refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});
  }
  return route.continue();
 });await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().slice(0,1000));});
 page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({status:response.status(),path:new URL(response.url()).pathname});});
 const read=()=>page.evaluate(()=>window.__MIXED_SCOPE_READ__());
 const shot=async name=>{await page.evaluate(async()=>{const finite=document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity);await Promise.all(finite.map(a=>a.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true}),preview=page.locator('.native-library-content-preview'),library=page.locator('[data-library-view="library"]'),
  chips=page.locator('[data-lcos-composer-ref]'),submit=page.getByRole('button',{name:'提交',exact:true}),header=page.locator('[data-lcos-native-chat-header]');
 const scopeRow=title=>library.getByRole('button',{name:title,exact:true});
 const member=(title,action='进入')=>preview.getByRole('button',{name:action+' '+title,exact:true});
 const openScope=async title=>{if(!await library.isVisible())await page.getByTestId('canvas-dockbar-assets-btn').click();await library.getByRole('textbox',{name:'搜索',exact:true}).fill(title);await scopeRow(title).click();await preview.getByRole('button',{name:'用于当前对话',exact:true}).waitFor();};
 const returnToInput=async()=>{await preview.getByRole('button',{name:'返回 当前输入',exact:true}).click();await preview.waitFor({state:'hidden'});await library.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Composer 输入');};
 const useScope=async()=>{await preview.getByRole('button',{name:'用于当前对话',exact:true}).click();await preview.waitFor({state:'hidden'});await chips.waitFor();};
 const assertScope=async()=>{const ui=await read();assert.equal(ui.refs.length,1);assert.equal(ui.refs[0].entityType,'scope');assert.equal(ui.refs[0].entityId,fixture.scopeId);assert.equal(ui.refs[0].mode??'full','full');assert.equal(ui.refs[0].artifactId,undefined);assert.equal(ui.refs[0].revisionId,undefined);assert.equal(ui.refs[0].artifactViewId,undefined);return ui;};
 const assertInput=(ui,owner,draft,label)=>{assert.equal(ui.prompt,draft,label+' draft');assert.equal(ui.inputKey,owner.inputKey,label+' input');assert.equal(ui.target.receiverConversationId,owner.target.receiverConversationId,label+' receiver');assert.equal(ui.target.messageId,owner.target.messageId,label+' message');assert.equal(ui.target.continuationOperationId,owner.target.continuationOperationId,label+' operation');assert.deepEqual([ui.caret.start,ui.caret.end],[2,6],label+' caret');assert.deepEqual(ui.windows,owner.windows,label+' Stage');};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:90000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:90000});await input.waitFor();
 report.identity={url:page.url(),title:await page.title(),nonBlank:(await page.locator('body').innerText()).length>100};assert.ok(report.identity.nonBlank);
 ordinaryDraft='混合 Scope GUI 普通任务 · '+new Date().toISOString();await input.fill(ordinaryDraft);await input.evaluate(element=>element.setSelectionRange(2,6));const ordinaryOwner=await read();assert.equal(ordinaryOwner.target.intent,'delegate');
 await openScope(fixture.scopeTitle);await member(fixture.outer.title).waitFor();await member(fixture.noteTitle,'查看').waitFor();await member(fixture.conversationTitle).waitFor();await member(fixture.runTitle).waitFor();await shot('01-whole-mixed-scope-members');
 await useScope();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Composer 输入');assertInput(await assertScope(),ordinaryOwner,ordinaryDraft,'ordinary attach');await shot('02-one-scope-original-composer');
 report.checks.push('原 Library 的用于当前对话加入单个 Scope 原地址；集合、附注、已链接对话、Run 与 Workspace 未展平或遗漏，原输入/光标保留');
 await page.getByRole('button',{name:'查看引用 '+fixture.scopeTitle,exact:true}).click();await member(fixture.outer.title).waitFor();
 await member(fixture.outer.title).click();await member(fixture.inner.title).click();await member(fixture.artifactTitle,'查看').waitFor();
 await preview.getByRole('button',{name:'返回 '+fixture.outer.title,exact:true}).click();await member(fixture.inner.title).waitFor();await preview.getByRole('button',{name:'返回 '+fixture.scopeTitle,exact:true}).click();await member(fixture.outer.title).waitFor();await shot('03-chip-original-library-nested-return');
 await returnToInput();assertInput(await assertScope(),ordinaryOwner,ordinaryDraft,'chip return');
 report.checks.push('Scope 芯片查看进入原库行与原集合两层页面，逐层返回及关闭后回同一原 Composer，未新建窗口');
 await openScope(fixture.scopeTitle);await useScope();assert.equal((await read()).refs.length,1);await page.getByRole('button',{name:'移除引用 '+fixture.scopeTitle,exact:true}).click();assert.equal((await read()).refs.length,0);assertInput(await read(),ordinaryOwner,ordinaryDraft,'remove');
 report.checks.push('再次取用同一 Scope 幂等去重；原引用移除按钮仅移除当前引用，输入和其他状态保留');
 await openScope(fixture.unsupportedScope.title);await useScope();
 const pngRefs=(await read()).refs;assert.equal(pngRefs.length,1);assert.equal(pngRefs[0].entityType,'scope');assert.equal(pngRefs[0].entityId,fixture.unsupportedScope.id);
 const beforePngProjection=await get(prefix+'/execution-projection');assert.equal(await submit.isEnabled(),true);
 allowRejectedCreate=true;const pngResponsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===prefix+'/runs');await submit.click();
 const pngResponse=await pngResponsePromise,pngBody=await pngResponse.json();allowRejectedCreate=false;assert.equal(pngResponse.status(),409);assert.equal(pngBody.ok,false);assert.equal(pngBody.error.code,'MIXED_SCOPE_CONTENT_UNSUPPORTED');
 await page.locator('[data-lcos-composer][data-ui-state="error"]').waitFor();assert.deepEqual((await read()).refs,pngRefs);assertInput(await read(),ordinaryOwner,ordinaryDraft,'PNG whole rejection');
 assert.deepEqual(await get(prefix+'/execution-projection'),beforePngProjection);assert.equal(rejectedCreates,1);
 report.pngWholeFailure={status:pngResponse.status(),body:pngBody,refs:pngRefs,feedback:await page.locator('.native-composer-feedback').innerText(),runProjectionUnchanged:true};
 assert.ok(report.pngWholeFailure.feedback.includes('这份内容包含暂不能完整加入对话的图片、PDF 或其他文件；输入和引用已保留。'));assert.ok(!report.pngWholeFailure.feedback.includes('状态已变化'));
 await fs.writeFile(path.join(output,'PNG整份失败提交回执.json'),JSON.stringify(report.pngWholeFailure,null,2));await shot('04-png-whole-scope-rejected-draft-retained');
 await page.getByRole('button',{name:'移除引用 '+fixture.unsupportedScope.title,exact:true}).click();assert.equal((await read()).refs.length,0);
 report.checks.push('原 PNG Scope 沿原提交整体409拒绝，原草稿和完整Scope引用保留、执行投影不变；未加入可读子集或执行任务');
 await openScope(fixture.scopeTitle);await useScope();await assertScope();assert.equal(await submit.isEnabled(),true,'Ordinary complete Scope should reach the real create path.');
 const reusePlanned=process.argv.find(value=>value.startsWith('--reuse-planned='))?.slice(16);
 if(reusePlanned){
  const review=await get('/api/lcos/core/runs/'+encodeURIComponent(reusePlanned)+'/review');
  assert.equal(review.run.projectId,fixture.projectId);assert.ok(review.run.instruction.startsWith('混合 Scope GUI 普通任务 · '));
  assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);assert.ok(!review.binding);
  const recipe=await get('/api/lcos/core/runs/'+reusePlanned+'/recipe'),manifest=await get(prefix+'/context-manifests/v0/'+recipe.contextManifestId),canonical=JSON.parse(manifest.canonicalJson);
  const complete=JSON.stringify(canonical);for(const id of [fixture.scopeId,fixture.outer.id,fixture.inner.id,fixture.noteId,fixture.conversationId,fixture.runId,fixture.workspace.id])assert.ok(complete.includes(id),'Prior original GUI manifest retains '+id);
  report.ordinarySubmission={runId:reusePlanned,reused:true,currentCreateClicked:false,review,recipe,canonical};
  await fs.writeFile(path.join(output,'普通任务原回执只读复验.json'),JSON.stringify(report.ordinarySubmission,null,2));assert.equal(allowedCreates,0);
  report.checks.push('前轮原GUI实际提交的planned Run与完整Manifest只读复验通过；本轮未重复创建任务');
 }else if(process.argv.includes('--create-planned')){
  allowPlannedCreate=true;const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===prefix+'/runs');await submit.click();const response=await responsePromise,body=await response.json();allowPlannedCreate=false;
  assert.ok(response.ok()&&body.ok,JSON.stringify(body));const review=body.value.review;createdRunId=review.run.id;assert.equal(review.run.projectId,fixture.projectId);assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);assert.ok(!review.binding);
  await page.getByText('任务已创建 · 等待执行',{exact:true}).waitFor();
  const recipe=await get('/api/lcos/core/runs/'+createdRunId+'/recipe'),manifest=await get(prefix+'/context-manifests/v0/'+recipe.contextManifestId),canonical=JSON.parse(manifest.canonicalJson);
  report.ordinarySubmission={runId:createdRunId,review,recipe,canonical};await fs.writeFile(path.join(output,'普通任务提交回执.json'),JSON.stringify(report.ordinarySubmission,null,2));
  const complete=JSON.stringify(canonical);for(const id of [fixture.scopeId,fixture.outer.id,fixture.inner.id,fixture.noteId,fixture.conversationId,fixture.runId,fixture.workspace.id])assert.ok(complete.includes(id),'Manifest retains '+id);
  assert.equal(allowedCreates,1);report.checks.push('普通任务沿原提交真实创建一次 created/planned Run，原 Manifest 保留全部异构成员来源，没有 dispatch 或模型执行');
 }else{report.limitations.push('Run create intentionally not exercised: rerun once with --create-planned to permit one original planned create.');}
 const title=header.getByRole('button',{name:'选择对话',exact:true});await title.click();const history=page.locator('[data-lcos-native-chat-history]:visible');await history.getByText(fixture.conversationTitle,{exact:true}).click();await input.waitFor();
 await page.waitForFunction(id=>window.__MIXED_SCOPE_READ__().target?.intent==='continue'&&window.__MIXED_SCOPE_READ__().target?.receiverConversationId===id,fixture.conversationId);
 const continueDraft='混合 Scope GUI 原续聊草稿，离线 owner 不发送。';await input.fill(continueDraft);await input.evaluate(element=>element.setSelectionRange(2,6));const continueOwner=await read();
 if(await chips.count()){await page.getByRole('button',{name:'移除引用 '+fixture.scopeTitle,exact:true}).click();}
 await openScope(fixture.scopeTitle);await useScope();assertInput(await assertScope(),continueOwner,continueDraft,'continuation attach');
 await page.getByRole('button',{name:'查看引用 '+fixture.scopeTitle,exact:true}).click();await member(fixture.outer.title).waitFor();await returnToInput();assertInput(await assertScope(),continueOwner,continueDraft,'continuation chip return');
 const capability=await get(prefix+'/connected-conversations/'+fixture.conversationId+'/collaboration-session');assert.equal(capability.capabilities.canSend,false);assert.equal(await submit.isDisabled(),true);await shot('05-continuation-scope-real-offline-owner');
 report.continuation={input:await read(),capability,submitted:false};report.limitations.push('Live GUI continuation send is blocked by actual offline/unbound owner; Scope take-use, exact continue receiver and return verified. End-to-end continuation attach is covered separately using original service with local test transport.');
 report.checks.push('原历史菜单进入 continue 输入后完整 Scope 仍可取用、查看并返回同一 receiver/message/operation；离线真实 canSend=false 时不强点提交、不伪造成功');
 await page.setViewportSize({width:1040,height:760});await page.getByRole('button',{name:'查看引用 '+fixture.scopeTitle,exact:true}).click();await member(fixture.outer.title).waitFor();const bounds=await preview.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=1041&&bounds.y+bounds.height<=761);await shot('06-narrow-original-mixed-scope');
 await returnToInput();assertInput(await assertScope(),continueOwner,continueDraft,'narrow return');
 report.checks.push('窄窗原页面与单个 Scope 芯片可达，返回继续保留原续聊输入与光标');
 const after={graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),collections:await get(prefix+'/collections'),workspaces:await get(prefix+'/workspaces'),timeline:await get(prefix+'/connected-conversations/'+fixture.conversationId+'/collaboration-timeline?limit=100'),run:await get('/api/lcos/core/runs/'+fixture.runId+'/review'),canvas:await get('/api/canvas/v1/canvases/surface-core-main')};
 assert.deepEqual(after,before);assert.deepEqual(report.pageErrors,[]);assert.equal(await page.getByText('现场列表暂不可用',{exact:true}).count(),0);assert.ok(!report.httpErrors.some(row=>row.path==='/api/canvas/v1/canvases'));report.checks.push('原画布列表仍是三个真实已打开Canvas；新增未打开工作集保留在Core，原现场列表不再报错');
 report.unexpectedWrites=report.writes.filter(write=>write.path!=='/api/events'&&!write.permitted);report.blockedCanvasWrites=report.unexpectedWrites.filter(write=>write.path.includes('/api/canvas/'));
 report.blockedAutomaticReconciliation=report.unexpectedWrites.filter(write=>write.path==='/api/lcos/canvases/surface-core-main/execution:reconcile');const unexplained=report.unexpectedWrites.filter(write=>!write.path.includes('/api/canvas/')&&write.path!=='/api/lcos/canvases/surface-core-main/execution:reconcile');assert.deepEqual(unexplained,[],'No silent Core mutation besides the original planned create and explicit PNG failure attempt.');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.ui=await page.evaluate(()=>window.__MIXED_SCOPE_READ__?.()).catch(()=>null);}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output,limitations:report.limitations},null,2));}







