import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const base=arg('base-url'),nodeId=arg('node-id'),scenario=arg('scenario','rapid');
const longBody=process.argv.includes('--long-body');
assert.ok(!longBody||scenario==='unknown-later','long text is an explicit later-C input intent within the targeted recovery scene');
assert.ok(base&&new URL(base).hostname==='127.0.0.1'&&nodeId,'explicit loopback candidate and existing synthetic node required');
assert.ok(['rapid','slow','unknown-close','unknown-later','close-flush','outline-paste'].includes(scenario));
const output=path.join(root,'output/原生文本整合_20261017e/Tiptap整页验证',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const get=async route=>{const response=await fetch(base+route,{cache:'no-store'});assert.equal(response.status,200,route);const body=await response.json();if('ok'in body){assert.equal(body.ok,true);return body.value}assert.equal(body.code,0);return body.data};
const healthResponse=await fetch(base+'/health',{cache:'no-store'});assert.equal(healthResponse.status,200);const health=await healthResponse.json();assert.equal(health.ok,true);assert.equal(health.realCoreConnected,true);assert.ok(health.runtimeLabel.startsWith('isolated-'));
const mapping=await get('/api/lcos/translation'),projectId=mapping.projectId,canvasId='surface-core-main',core='/api/lcos/core/projects/'+encodeURIComponent(projectId);
const beforeGraph=await get(core+'/graph'),beforeRuns=await get(core+'/runs'),canvas=await get('/api/canvas/v1/canvases/'+canvasId),source=canvas.nodes.find(node=>node.id===nodeId);
assert.ok(source?.data?.lcos_ref?.entityType==='artifact','only a specifically selected synthetic primary Text may be edited');
const report={passed:false,base,pid:health.pid,scenario,longBody,nodeId,before:{artifacts:beforeGraph.artifacts.length,runs:beforeRuns.length},batches:[],receiptGets:[],errors:[],models:[],screenshots:[],checks:[]};
const {chromium}=createRequire(path.join(installedRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block'});
let phase='load',withheld=false,releasePreflight,preflightHeld=false;
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['data:','blob:'].includes(url.protocol)&&url.origin!==base)return route.abort();
  if(request.method()==='POST'&&/\/(runs|dispatch|generations|checkout)(?:\/|$)/.test(url.pathname)){report.models.push(url.pathname);return route.abort()}
  if(request.method()==='GET'&&url.pathname.endsWith('/page-Da_DfwiK.js')){
    const response=await route.fetch(),body=await response.text(),marker='const __lcosInspectNativeHistory=';assert.equal(body.split(marker).length-1,1);
    return route.fulfill({response,body:body.replace(marker,'window.__LCOS_TEST_TIPTAP_HISTORY__=()=>({canvasId:__lcosHistoryCanvasId,index:p.current,history:structuredClone(x.current)});'+marker)});
  }
  if(phase==='edit'&&scenario==='slow'&&request.method()==='GET'&&url.pathname.endsWith('/curation/canvas-text')&&!preflightHeld){
    preflightHeld=true;const response=await route.fetch();report.preflight={status:response.status(),body:await response.json()};
    await new Promise(resolve=>{releasePreflight=resolve});return route.fulfill({response});
  }
  if(request.method()==='POST'&&url.pathname.endsWith('/nodes:batchActions')){
    const body=request.postDataJSON(),batch={phase,time:Date.now(),query:url.search,body};report.batches.push(batch);
    const response=await route.fetch();batch.response={status:response.status(),body:await response.json()};
    if(phase==='edit'&&scenario.startsWith('unknown')&&!withheld){withheld=true;report.withheld=batch.response;return route.abort('failed')}
    return route.fulfill({response});
  }
  return route.continue();
});
await context.routeWebSocket('**/*',socket=>socket.close());
const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
page.on('response',response=>{const url=new URL(response.url());if(response.request().method()==='GET'&&url.pathname.includes('/text-save-receipts/'))report.receiptGets.push({path:url.pathname,status:response.status()})});
const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file)};
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const readText=()=>get(core+'/curation/canvas-text?'+new URLSearchParams({canvasId,spatialId:nodeId}));
const pending=()=>page.evaluate(({canvasId,nodeId})=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId,nodeId}),{canvasId,nodeId});
const queueState=()=>page.evaluate(nodeId=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.readQueuedAutosave(nodeId),nodeId);
const editPosts=()=>report.batches.filter(batch=>batch.phase==='edit');
async function until(read,predicate,label,timeout=30_000){const start=Date.now();while(Date.now()-start<timeout){const value=await read();if(predicate(value))return value;await page.waitForTimeout(100)}throw Error(label)}
const nodeBody=()=>page.locator('[data-native-first-text-body="'+nodeId+'"]');
const editor=()=>page.locator('[data-media-viewer] .tiptap.ProseMirror.canvas-text-markdown[contenteditable="true"]');
async function menuItem(text){await page.getByTestId('lcos-native-text-view-menu').getByRole('button').click();await page.getByRole('menuitem',{name:text,exact:true}).click()}
async function openEditor(){await nodeBody().dblclick();await editor().waitFor({timeout:30_000});assert.equal(await editor().count(),1);assert.equal(await page.getByRole('dialog').count(),1);await page.locator('.media-viewer__text-actions').waitFor();}
async function closeEditor(){await page.locator('[data-media-viewer] header').getByRole('button',{name:/返回|Back/}).click();await page.locator('[data-media-viewer]').waitFor({state:'hidden',timeout:20_000})}
async function fillOriginal(text){await editor().fill(text);const blocks=await editor().evaluate(element=>[...element.children].map(block=>({tag:block.tagName,text:block.textContent,markup:block.innerHTML})));assert.equal(blocks.length,1,'this fixture expects one original G7 block after select-all replacement');assert.equal(blocks[0].text,text);assert.ok(/^(P|H[1-6])$/.test(blocks[0].tag),'keep the original paragraph/heading format instead of silently replacing the editor');const body=blocks[0].tag==='P'?text:'#'.repeat(Number(blocks[0].tag.slice(1)))+' '+text;report.inputSerialization??=[];report.inputSerialization.push({text,blocks,expectedMarkdown:body});return body}
async function pasteOriginal(html,plainText){await editor().focus();await editor().press('ControlOrMeta+a');const result=await editor().evaluate((element,{html,plainText})=>{const clipboardData=new DataTransfer();clipboardData.setData('text/html',html);clipboardData.setData('text/plain',plainText);const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData});return{accepted:!element.dispatchEvent(event),html:element.innerHTML,text:element.textContent}},{html,plainText});assert.equal(result.accepted,true,'the real original G7 paste parser must consume the ClipboardEvent');return result}
async function confirmed(body){const saved=await until(readText,value=>value.body===body,'Core did not return exact original G7 serialization');await until(pending,value=>value===null,'native pending did not naturally clear');await until(queueState,value=>!value||value.count===0,'original g still retains completed text');return saved}
async function exactHistory(snapshot,label){const raw=await page.evaluate(()=>window.__LCOS_TEST_TIPTAP_HISTORY__?.());assert.equal(raw?.canvasId,canvasId);const node=raw.history[raw.index].state.nodes.find(node=>node.id===nodeId);assert.equal(node.data.text,snapshot.body);assert.equal(node.data.lcos_ref.revisionId,snapshot.revisionId);report.rawHistory??={};report.rawHistory[label]=raw;}
async function toolbarGeometry(label){
  const bar=page.locator('.media-viewer__text-actions');
  assert.equal(await bar.count(),1,'feedback remains in one original UX/XO action bar');const currentControls=await originalFormatControls();assert.deepEqual(currentControls,report.originalFormatControls,'preserve each exact original tag/role/label and order across pending/wrap; do not guess Radix ToggleItem roles');
  const data=await bar.evaluate(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element),status=element.querySelector('[data-native-tiptap-save-status]'),statusText=status?.querySelector('[role=status]');return{viewport:{width:innerWidth,height:innerHeight},rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},overflowX:s.overflowX,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,status:status?{text:status.textContent,fontSize:statusText?getComputedStyle(statusText).fontSize:null,maxWidth:statusText?getComputedStyle(statusText).maxWidth:null,textWidth:statusText?.getBoundingClientRect().width,width:status.getBoundingClientRect().width,buttons:[...status.querySelectorAll('button')].map(button=>({width:button.getBoundingClientRect().width,label:button.getAttribute('aria-label')}))}:null,buttons:[...element.querySelectorAll('button')].map(button=>({label:button.getAttribute('aria-label')||button.textContent,disabled:button.disabled}))}});
  assert.ok(data.rect.x>=-1&&data.rect.right<=data.viewport.width+1,'original action bar must fit actual viewport');
  assert.ok(data.scrollWidth<=data.clientWidth+1,'the original action pill must contain its content, not let recovery controls escape the painted surface');
  if(data.status){assert.equal(data.status.fontSize,'12px');assert.equal(data.status.maxWidth,'120px');assert.ok(data.status.textWidth<=120.1,'feedback text must stay within original 10em/12px budget');assert.ok(data.status.buttons.length<=1,'only one original recovery control');for(const button of data.status.buttons)assert.ok(button.width<=48.1,'recovery uses the original 48px gm');}
  const buttons=bar.locator('button:not([disabled])'),reach=[];
  for(let index=0;index<await buttons.count();index++){
    const button=buttons.nth(index);await button.focus();const value=await button.evaluate(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:element.getAttribute('aria-label')||element.textContent,focused:document.activeElement===element,x:r.x,y:r.y,right:r.right,bottom:r.bottom,hit:hit===element||element.contains(hit),scrollX:window.scrollX}});assert.equal(value.focused,true);assert.ok(value.x>=-1&&value.right<=data.viewport.width+1,'focused original format control must remain reachable');assert.ok(value.x>=data.rect.x-1&&value.right<=data.rect.right+1&&value.y>=data.rect.y-1&&value.bottom<=data.rect.bottom+1,'all original format and recovery controls must remain inside the same original action pill');assert.equal(value.hit,true);assert.equal(value.scrollX,0);reach.push(value);
  }
  report.toolbar??={};report.toolbar[label]={...data,reach};
}
async function originalFormatControls(){return page.locator('.media-viewer__text-actions').evaluate(element=>[...element.querySelectorAll('button')].filter(button=>!button.closest('[data-native-tiptap-save-status]')).map(button=>({tag:button.tagName,role:button.getAttribute('role')||'button',label:button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent}))) }
const stamp=new Date().toISOString(),A='Tiptap A '+stamp,C='Tiptap latest C '+stamp;
const tailMarker='Tiptap original long-document tail '+stamp;
async function tailReachable(label){
  if(!longBody)return;await editor().focus();await editor().press('ControlOrMeta+End');await page.waitForTimeout(400);const tail=editor().locator('p').filter({hasText:tailMarker});assert.equal(await tail.count(),1);
  const measure=()=>tail.evaluate(element=>{const r=element.getBoundingClientRect(),action=document.querySelector('.media-viewer__text-actions'),bar=action.getBoundingClientRect(),edit=element.closest('[contenteditable=true]'),viewer=element.closest('[data-media-viewer]'),main=element.closest('.media-viewer__text-panel'),rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};let scroll=element.parentElement;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight&&/auto|scroll/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;return{tail:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},bar:{x:bar.x,y:bar.y,width:bar.width,height:bar.height,right:bar.right,bottom:bar.bottom},main:main?{rect:rect(main),computedHeight:getComputedStyle(main).height}:null,scroll:scroll?{rect:rect(scroll),classes:scroll.className,top:scroll.scrollTop,height:scroll.clientHeight,contentHeight:scroll.scrollHeight,paddingBottom:getComputedStyle(edit).paddingBottom,scrollPaddingBottom:getComputedStyle(scroll).scrollPaddingBottom}:null,paintScope:{editorClasses:edit.className,viewerHasStatus:!!viewer?.querySelector('[data-native-tiptap-save-status]'),actionInSameViewer:action.closest('[data-media-viewer]')===viewer,editorHeightVar:getComputedStyle(edit).getPropertyValue('--native-tiptap-action-height'),viewerHeightVar:viewer?getComputedStyle(viewer).getPropertyValue('--native-tiptap-action-height'):null},viewport:{width:innerWidth,height:innerHeight}}});
  const keyboardEnd=await measure();report.tailReachability??={};report.tailReachability[label]={keyboardEnd};
  if(!(keyboardEnd.tail.y>=0&&keyboardEnd.tail.bottom<=keyboardEnd.bar.y-1)){report.visualFailures??=[];report.visualFailures.push({label,code:'TEXT_TAIL_OBSCURED_AFTER_NATIVE_END',measurement:keyboardEnd});}
  // End is the donor ProseMirror caret policy; wheel verifies whether the
  // original scroll owner actually has enough reserved space for the tail.
  await page.mouse.move(Math.min(keyboardEnd.viewport.width-45,Math.max(45,keyboardEnd.tail.x+30)),150);await page.mouse.wheel(0,100000);await page.waitForTimeout(400);const wheelEnd=await measure();report.tailReachability[label].wheelEnd=wheelEnd;assert.ok(wheelEnd.scroll?.contentHeight>wheelEnd.scroll?.height,'the declared long input must truly overflow the original text scroll owner');if(!(wheelEnd.tail.y>=0&&wheelEnd.tail.bottom<=wheelEnd.bar.y-1)){report.visualFailures??=[];report.visualFailures.push({label,code:'TEXT_TAIL_OBSCURED_AT_SCROLL_END',measurement:wheelEnd});}
  // This is an actual overflowing document at its scroll limit, not a short
  // page whose natural blank area is intentional. One ordinary text inset
  // plus the donor panel/bar gap must not reserve the entire action bar again.
  const endGap=wheelEnd.bar.y-wheelEnd.tail.bottom;report.tailReachability[label].endGap=endGap;
  if(endGap>80){report.visualFailures??=[];report.visualFailures.push({label,code:'TEXT_TAIL_DOUBLE_RESERVED_BLANK_SPACE',endGap,measurement:wheelEnd});}
}
try{
  await page.goto(base+'/canvas/'+canvasId);await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60_000});
  await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.fitView({nodes:[{id}],padding:.45,maxZoom:1.1,duration:0}),nodeId);await nodeBody().click();
  assert.equal(await page.locator('.native-first-toolbar').count(),0,'second JT strip must be retired');assert.equal(await page.getByTestId('lcos-native-text-view-menu').count(),1,'one real original JT more-menu entry');
  if(await nodeBody().getAttribute('data-native-first-mode')!=='text')await menuItem('正文');
  await shot('00-single-original-node-toolbar');await openEditor();report.originalFormatControls=await originalFormatControls();assert.equal(report.originalFormatControls.length,10,'the original copy and formatting controls must be mounted before input');await shot('01-original-G7-and-format-bar');
  const before=await readText();phase='edit';
  if(scenario==='rapid'){
    await fillOriginal(A);await page.waitForTimeout(100);await fillOriginal('Tiptap intermediate B '+stamp);await page.waitForTimeout(100);const expectedC=await fillOriginal(C);
    const saved=await confirmed(expectedC);assert.equal(editPosts().length,1);await exactHistory(saved,'rapid');report.saved=saved;
  }else if(scenario==='slow'){
    await fillOriginal(A);await until(()=>Promise.resolve(typeof releasePreflight==='function'),Boolean,'real Core preflight was not captured');
    await fillOriginal('Tiptap B while preflight '+stamp);await page.waitForTimeout(100);const expectedC=await fillOriginal(C);await page.waitForTimeout(400);assert.equal(editPosts().length,0);
    await toolbarGeometry('normal-saving');assert.equal(await page.getByRole('button',{name:'核对保存',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'继续保存',exact:true}).count(),0);
    releasePreflight();const saved=await confirmed(expectedC);assert.equal(editPosts().length,2);const first=editPosts()[0];assert.equal(first.response.status,200);const firstRevision=first.response.body.data.lcos_expected_revisions[nodeId];assert.notEqual(firstRevision,before.revisionId);assert.deepEqual(editPosts().map(batch=>batch.body.lcos_expected_revisions[nodeId]),[before.revisionId,firstRevision]);await exactHistory(saved,'slow-latest');report.saved=saved;
  }else if(scenario==='close-flush'){
    const expectedC=await fillOriginal(C);await page.waitForTimeout(100);await closeEditor();const saved=await confirmed(expectedC);assert.equal(editPosts().length,1);await openEditor();assert.equal((await editor().textContent()).trim(),C);await exactHistory(saved,'close-flush');report.saved=saved;
  }else if(scenario==='outline-paste'){
    const html='<h1>Alpha</h1><ul><li>Child</li></ul><h1>Beta</h1><pre><code>opaque()</code></pre>';
    const pasted=await pasteOriginal(html,'Alpha\nChild\nBeta\nopaque()');assert.match(pasted.html,/<h1[^>]*>Alpha<\/h1>/);assert.match(pasted.html,/<h1[^>]*>Beta<\/h1>/);assert.match(pasted.html,/<li>/);assert.match(pasted.html,/<pre>/);
    const expected=await until(()=>page.evaluate(id=>window.__LCOS_NODE_LAB__.api.getNode(id)?.data?.text,nodeId),body=>typeof body==='string'&&/^# Alpha\n/.test(body)&&body.includes('# Beta')&&body.includes('opaque()'),'original G7/hl/dr did not publish parsed paste bytes');
    report.pasteIntent={html,pasted,originalSerializedMarkdown:expected};report.saved=await confirmed(expected);assert.equal(editPosts().length,1,'one deliberate rich-paste intent, not an unknown replay');await exactHistory(report.saved,'rich-paste-outline');
  }else{
    const expectedA=await fillOriginal(A);await until(pending,value=>value?.status==='response-lost','real original autosave loss did not remain pending');assert.equal(withheld,true);assert.equal(editPosts().length,1);
    let expectedC;if(scenario==='unknown-later'){await fillOriginal('Tiptap local B '+stamp);await page.waitForTimeout(100);if(longBody){const lines=[C,...Array.from({length:48},(_,i)=>'原 Tiptap 长文可达性 '+(i+1)+'：保留原格式与滚动容器，不用新窗口。'),tailMarker],html=lines.map(text=>'<p>'+text+'</p>').join('');report.longPasteIntent={html,result:await pasteOriginal(html,lines.join('\n'))};expectedC=await until(()=>page.evaluate(id=>window.__LCOS_NODE_LAB__.api.getNode(id)?.data?.text,nodeId),body=>typeof body==='string'&&body.includes(C)&&body.includes(tailMarker),'original G7 long-paste bytes were not published by the real hl/dr owner');}else expectedC=await fillOriginal(C);await page.waitForTimeout(1400)}
    const retained=(await editor().textContent()).trim();await closeEditor();await openEditor();assert.equal((await editor().textContent()).trim(),retained);
    const verify=page.getByRole('button',{name:'核对保存',exact:true});assert.equal(await verify.count(),1);await page.getByText('草稿已保留，保存待确认',{exact:true}).waitFor();
    await page.setViewportSize({width:680,height:900});await page.waitForTimeout(500);await toolbarGeometry('unknown-680');await tailReachable('unknown-680');await shot('02-original-UX-pending-narrow');await page.setViewportSize({width:320,height:800});await page.waitForTimeout(500);await toolbarGeometry('unknown-320');await tailReachable('unknown-320');await shot('02a-original-UX-pending-320');await page.setViewportSize({width:1440,height:1000});
    const observedAt=Date.now();await page.waitForTimeout(30_000);report.observationMs=Date.now()-observedAt;assert.equal(editPosts().length,1,'original autosave cannot replay unknown A');await persist();
    await verify.click();await until(pending,value=>value===null,'original GET receipt confirmation did not clear held A');assert.equal(editPosts().length,1,'GET verification cannot implicitly send later C');assert.ok(report.receiptGets.some(value=>value.status===200));assert.equal((await editor().textContent()).trim(),retained);
    if(scenario==='unknown-later'){
      await page.waitForTimeout(800);report.nodeFaceAfterVerification=await nodeBody().evaluate(element=>({text:element.textContent,state:element.getAttribute('data-native-first-state'),mode:element.getAttribute('data-native-first-mode')}));report.laterDraftAfterVerification={live:await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.getNode(id),nodeId),core:await readText(),queued:await queueState(),editor:(await editor().textContent()).trim()};await shot('02b-old-A-confirmed-later-C-nodeface');assert.ok(report.nodeFaceAfterVerification.text.includes(C),'the original node face must continue to show newer local C after the older A receipt');assert.ok(!report.nodeFaceAfterVerification.text.includes(A),'the older Core A reread cannot visually replace the newer C draft on the original node');assert.equal(report.laterDraftAfterVerification.live.data.text,expectedC,'the original live node must still own the exact later input bytes');assert.equal(report.laterDraftAfterVerification.core.body,expectedA,'GET verification only confirmed the older A, without writing C');assert.equal(report.laterDraftAfterVerification.editor,retained);
      const queued=report.laterDraftAfterVerification.queued;assert.ok(queued?.count>0&&queued.canResume);await page.getByRole('button',{name:'继续保存',exact:true}).click();report.saved=await confirmed(expectedC);assert.equal(editPosts().length,2);
      assert.equal(editPosts()[1].body.lcos_expected_revisions[nodeId],report.withheld.body.data.lcos_expected_revisions[nodeId]);
    }else report.saved=await confirmed(expectedA);
    assert.equal(await page.locator('[data-native-tiptap-save-status]').count(),0);await exactHistory(report.saved,'loss-recovered');
  }
  if(longBody){await page.setViewportSize({width:320,height:800});await page.waitForTimeout(500);await toolbarGeometry('confirmed-320');assert.equal(await page.locator('[data-native-tiptap-save-status]').count(),0);await tailReachable('confirmed-320');await shot('03a-normal-original-UX-confirmed-320');await page.setViewportSize({width:1440,height:1000});}
  await shot('03-original-Tiptap-confirmed');assert.notEqual(report.saved.revisionId,before.revisionId);
  const afterGraph=await get(core+'/graph'),afterRuns=await get(core+'/runs');report.after={artifacts:afterGraph.artifacts.length,runs:afterRuns.length};assert.deepEqual(report.after,report.before);assert.deepEqual(report.errors,[]);assert.deepEqual(report.models,[]);
  report.checks.push('original node JT menu only → same wa/c2/vZ/G7 editor → original hl/dr/Gb/r6 → exact real Core receipt and original raw O8 history; existing synthetic material only');report.functionalPassed=true;assert.deepEqual(report.visualFailures??=[],[],'known visual failures remain failures; successful save cannot erase a hidden text tail');report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack};report.dom=await page.locator('body').innerText().catch(()=>null);report.failureState={text:await readText().catch(error=>({error:error.message})),pending:await pending().catch(error=>({error:error.message})),queued:await queueState().catch(error=>({error:error.message})),formatControls:await originalFormatControls().catch(error=>({error:error.message})),actionBarHtml:await page.locator('.media-viewer__text-actions').evaluate(element=>element.outerHTML).catch(()=>null)};await shot('failure').catch(()=>{});process.exitCode=1;
}finally{releasePreflight?.();await persist();await context.close();await browser.close();console.log(JSON.stringify({passed:report.passed,scenario,pid:report.pid,batches:report.batches.length,failure:report.failure?.message,report:path.join(output,'report.json')}))}
