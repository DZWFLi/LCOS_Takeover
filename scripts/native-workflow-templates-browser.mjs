import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56311',canvasId='surface-core-main',project='disposable-surface-core-facade';
const output=path.resolve('output/原方法模板接续_20261023/实屏',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const get=async route=>{const r=await fetch(origin+route);assert.ok(r.ok);const d=await r.json();return d.value??d.data??d};
const before=await get('/api/canvas/v1/canvases/'+canvasId),conversations=await get('/api/lcos/core/projects/'+project+'/connected-conversations');
const warehouseEnvelope=await fetch(origin+'/api/lcos/core/projects/'+project+'/warehouse?kinds=workflow&limit=100').then(r=>r.json());
const report={passed:false,output,checks:[],writes:[],errors:[],screenshots:[],requests:[]};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');let browser,page;
let failRead=false, holdRead=false, releaseRead, markRead, paginationFixture=false, failedPages=0;
try {
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(r.method())){let permitted=u.pathname==='/api/events'||u.pathname.endsWith('/execution:reconcile');
   if(u.pathname.endsWith('/nodes:batchActions')){const body=r.postDataJSON();permitted=!body.lcos_operation&&body.actions?.every(a=>a.action==='update'&&a.updates?.every(n=>{const old=before.nodes.find(x=>x.id===n.id);return old&&equal(n.position,old.position)&&equal(n.data,old.data)}));}
   report.writes.push({path:u.pathname,permitted});if(!permitted)return route.abort();
  }
  if(failRead&&u.pathname.endsWith('/warehouse'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"injected read failure"}'});
  if(paginationFixture&&u.pathname.endsWith('/warehouse')){
   if(u.searchParams.has('cursor')){failedPages++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"injected next-page failure"}'})}
   const envelope=structuredClone(warehouseEnvelope),value=envelope.value??envelope.data??envelope;value.nextCursor='synthetic-next-page-for-ui-test';
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(envelope)});
  }
  if(holdRead&&u.pathname.endsWith('/presentations')){holdRead=false;markRead?.();await new Promise(resolve=>{releaseRead=resolve});}
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch({timeout:90000});return route.fulfill({response,body:await response.text()+'\nwindow.__METHOD_READ__=()=>{const s=useLcosShellStore.getState();return {target:s.composerTarget,prompt:s.composerPrompt,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});}
  return route.continue();
 }); await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('template')||u.pathname.endsWith('/warehouse'))report.requests.push({path:u.pathname,query:u.search,status:r.status()})});
 const shot=async name=>{await page.waitForTimeout(400);const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:90000});
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.fill('保留原稿，并参考这个方法。');
 const original=await page.evaluate(()=>window.__METHOD_READ__());
 await page.getByTestId('canvas-dockbar-workflow-btn').click();
 await page.getByText('合成 Workflow',{exact:true}).first().waitFor();
 await shot('01-original-method-popover');
 report.popover=await page.locator('[data-testid="canvas-dockbar-workflow-panel"]').innerText();
 report.controls=await page.getByRole('dialog').locator('button,[role=button],input').evaluateAll(rows=>rows.map(e=>({tag:e.tagName,text:e.textContent,label:e.getAttribute('aria-label'),title:e.getAttribute('title'),placeholder:e.getAttribute('placeholder')})));
 if(process.argv.includes('--inspect')) {
  report.images=await page.getByTestId('canvas-dockbar-workflow-panel').locator('img').evaluateAll(rows=>rows.map(e=>({src:e.src,current:e.currentSrc,complete:e.complete,w:e.naturalWidth})));
  const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();
  await page.getByRole('button',{name:'浏览全部',exact:true}).click();
  await page.locator('[data-native-workflow-gallery]').waitFor();
  await page.locator('[data-native-workflow-gallery]').getByText('合成 Workflow',{exact:true}).first().click();
  await page.locator('[data-native-workflow-preview]').waitFor();
  await shot('02-original-method-detail');report.body=await page.locator('[data-native-workflow-gallery]').innerText();
 }
 else {
  const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();
  const popover=page.getByTestId('canvas-dockbar-workflow-panel');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="canvas-dockbar-workflow-panel"] img')].every(e=>e.complete&&e.naturalWidth>0));
  assert.ok((await popover.innerText()).includes('项目方法'));
  report.checks.push('Original template card loads the real Core method and a decoded local thumbnail; no vendor template request.');
  const query=popover.locator('input');
  failRead=true;await query.fill('读取失败');await popover.getByRole('button',{name:'重新读取',exact:true}).waitFor();
  assert.ok(!(await popover.innerText()).includes('还没有保存的方法'));await shot('03-read-failure-visible');
  failRead=false;await popover.getByRole('button',{name:'重新读取',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-native-workflow-status]'));
  const emptyRead=page.waitForResponse(response=>response.url().includes('/warehouse')&&decodeURIComponent(response.url()).includes('完全不存在的方法'));
  await query.fill('完全不存在的方法');await emptyRead;
  await popover.getByText('合成 Workflow',{exact:true}).waitFor({state:'hidden'});
  report.emptyState=await popover.innerText();assert.ok(!report.emptyState.includes('重新读取'));
  await query.fill('合成');await popover.getByText('合成 Workflow',{exact:true}).waitFor();
  assert.ok(report.requests.some(r=>r.query.includes('search=')));
  await page.getByRole('button',{name:'浏览全部',exact:true}).click();
  const gallery=page.locator('[data-native-workflow-gallery]');await gallery.waitFor();
  await gallery.getByText('合成 Workflow',{exact:true}).first().click();
  const preview=page.locator('[data-native-workflow-preview]');await preview.waitFor();
  assert.ok((await preview.innerText()).includes('核对拖放方法'));
  assert.ok((await preview.innerText()).includes('Main · 项目总览'));
  assert.ok((await preview.innerText()).includes('Workflow · 交付现场'));
  await shot('04-original-detail');
  await gallery.getByRole('button',{name:'返回方法列表',exact:true}).click();
  await preview.waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.__METHOD_READ__()),original);
  report.checks.push('Read failure is explicit and retry works. Search reaches Core. Original detail shows actual steps and both materials; Back keeps original draft, target, references and windows.');
  await gallery.getByText('合成 Workflow',{exact:true}).first().click();await preview.waitFor();
  const beganRead=new Promise(resolve=>{markRead=resolve});holdRead=true;
  await gallery.getByRole('button',{name:'加入当前输入',exact:true}).click();await beganRead;
  await gallery.getByRole('button',{name:'返回方法列表',exact:true}).click();releaseRead();
  await preview.waitFor({state:'hidden'});await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(()=>window.__METHOD_READ__()),original);
  report.checks.push('Real original Back during delayed method read cancels Apply; no late append or unwanted Composer reopening.');
  await gallery.getByText('合成 Workflow',{exact:true}).first().click();await preview.waitFor();
  await gallery.getByRole('button',{name:'加入当前输入',exact:true}).click();
  await gallery.waitFor({state:'hidden'});await popover.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.matches('textarea[data-lcos-composer-input]'));
  const taken=await page.evaluate(()=>window.__METHOD_READ__());
  assert.deepEqual({...taken.target,focusInput:false},{...original.target,focusInput:false});assert.deepEqual(taken.windows,original.windows);
  assert.ok(taken.prompt.startsWith(original.prompt+'\n\n工作流方法：合成 Workflow'));
  assert.ok(taken.prompt.includes('人工合成方法，只加入草稿，不运行模型。'));assert.equal(taken.refs.length,original.refs.length+2);
  await shot('05-method-in-original-input');
  await page.getByTestId('canvas-dockbar-workflow-btn').click();await popover.getByText('合成 Workflow',{exact:true}).click();
  await popover.waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.__METHOD_READ__()),taken);
  report.checks.push('Original Apply closes original gallery and popover, returns caret to same Composer, appends real method + both material references. Repeated Apply does not duplicate prompt/references and sends no message.');
  await page.setViewportSize({width:360,height:800});
  await page.getByTestId('canvas-dockbar-workflow-btn').click();await popover.getByText('合成 Workflow',{exact:true}).waitFor();
  const pbox=await popover.boundingBox();assert.ok(pbox.x>=0&&pbox.x+pbox.width<=361);
  await page.getByRole('button',{name:'浏览全部',exact:true}).click();await gallery.waitFor();
  await gallery.getByText('合成 Workflow',{exact:true}).first().click();await preview.waitFor();
  await gallery.getByRole('button',{name:'加入当前输入',exact:true}).scrollIntoViewIfNeeded();
  await gallery.getByRole('button',{name:'加入当前输入',exact:true}).click({trial:true});
  const gbox=await gallery.boundingBox();assert.ok(gbox.x>=0&&gbox.x+gbox.width<=361);
  const overflow=await gallery.evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(overflow,false);
  await shot('06-narrow-original-detail');
  await gallery.getByRole('button',{name:'返回方法列表',exact:true}).click();await preview.waitFor({state:'hidden'});
  await page.keyboard.press('Escape');await gallery.waitFor({state:'hidden'});
  await page.keyboard.press('Escape');await popover.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__METHOD_READ__()),taken);
  report.checks.push('360px original popover/gallery fit the viewport; detail Apply is hit-testable, Back and Escape return without losing input.');
  await page.setViewportSize({width:1500,height:1000});
  const agentNode='node-fdb2f222-ad06-45be-b2f0-465d5b587692',agentConversation='connected-conversation-4244107f-aa59-4466-85e2-7ca53e230009';
  await page.locator('[data-lcos-node-id="'+agentNode+'"] [data-lcos-glyth-vector]').click({position:{x:34,y:35}});
  await page.waitForFunction(id=>window.__METHOD_READ__().target?.receiverConversationId===id,agentConversation);
  await input.fill('续聊保留原稿，再加入方法。');
  const continuation=await page.evaluate(()=>window.__METHOD_READ__());assert.equal(continuation.target.intent,'continue');
  await page.getByTestId('canvas-dockbar-workflow-btn').click();await popover.getByText('合成 Workflow',{exact:true}).click();
  await popover.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.matches('textarea[data-lcos-composer-input]'));
  const continued=await page.evaluate(()=>window.__METHOD_READ__());
  assert.deepEqual({...continued.target,focusInput:false},{...continuation.target,focusInput:false});
  assert.deepEqual(continued.windows,continuation.windows);assert.ok(continued.prompt.startsWith(continuation.prompt+'\n\n工作流方法：合成 Workflow'));
  for(const ref of taken.refs)assert.ok(continued.refs.some(item=>equal(item,ref)));
  await shot('07-same-original-continuation-input');
  report.checks.push('Real original agent click selects its existing continuation; Apply keeps same receiver, message/operation and original Composer with exact method references, no send.');
  paginationFixture=true;
  await page.getByTestId('canvas-dockbar-workflow-btn').click();await popover.getByRole('button',{name:'重新读取',exact:true}).waitFor();
  assert.ok(await popover.getByText('合成 Workflow',{exact:true}).isVisible());
  await page.waitForTimeout(600);assert.equal(failedPages,1);
  await shot('08-original-pagination-failure');
  paginationFixture=false;await popover.getByRole('button',{name:'重新读取',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-native-workflow-status]'));
  await popover.getByText('合成 Workflow',{exact:true}).waitFor();await page.keyboard.press('Escape');await popover.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__METHOD_READ__()),continued);
  report.checks.push('Controlled next-page failure preserves real loaded cards, shows retry, stops infinite automatic retries, and retry returns to real Core data without touching the draft.');
  assert.ok(!report.requests.some(r=>r.path.includes('/official-templates')||r.path.includes('/canvas-templates')));
 }
 assert.deepEqual(await get('/api/canvas/v1/canvases/'+canvasId),before);
 assert.deepEqual(await get('/api/lcos/core/projects/'+project+'/connected-conversations'),conversations);
 assert.ok(report.writes.every(row=>row.permitted));assert.deepEqual(report.errors,[]);
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();}
console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,error:report.error,errors:report.errors},null,2));
