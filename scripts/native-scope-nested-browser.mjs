import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const origin=new URL(process.argv.find(v=>v.startsWith('--base-url='))?.slice(11)??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');
const fixture=JSON.parse(await fs.readFile('output/Scope嵌套与跨现场_20261022/fixture.json','utf8'));
const prefix='/api/lcos/core/projects/'+fixture.projectId;
const output=path.resolve('output/Scope嵌套与跨现场_20261022/嵌套真实页面/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,origin,output,browser:'Browser plugin not available; existing Playwright Core / Chrome',checks:[],writes:[],httpErrors:[],pageErrors:[],screenshots:[],models:0,storeMutation:false};
const get=async address=>{const r=await fetch(origin+address,{redirect:'error',cache:'no-store'}),body=await r.json();assert.ok(r.ok&&(body.ok===true||body.code===0),address);return body.value??body.data;};
const facts=async()=>({graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),workspaces:await get(prefix+'/workspaces'),runs:await get(prefix+'/runs'),
  conversation:await get(prefix+'/connected-conversations/'+fixture.conversationId+'/collaboration-timeline?limit=100'),
  main:await get('/api/canvas/v1/canvases/surface-core-main')});
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run']});let page;
let changeNoteRead=0;
try{
 const context=await browser.newContext({viewport:{width:1880,height:1120},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(q.method())){report.writes.push({method:q.method(),path:u.pathname,body:q.postData()});if(/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway|link-session|import-manual/.test(u.pathname))return route.abort();}
  if(changeNoteRead&&q.method()==='GET'&&u.pathname===prefix+'/graph'&&--changeNoteRead===0){const response=await route.fetch(),body=await response.json();
    body.value.notes=body.value.notes.map(note=>note.id===fixture.noteId?{...note,updatedAt:'2026-10-22T00:00:00.000Z',body:'Do not silently substitute this changed Note'}:note);return route.fulfill({response,json:body});}
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch(),source=await response.text();assert.ok(source.includes('nativeLibraryMember'));
   return route.fulfill({response,body:source+`\nwindow.__NESTED_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return{projectId:s.projectId,canvasId:c.canvasId,prompt:s.composerPrompt,caret:s.composerCaret,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};`});}
  return route.continue();});await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(22000);page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({status:r.status(),path:new URL(r.url()).pathname});});
 const read=()=>page.evaluate(()=>window.__NESTED_READ__());
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const preview=page.locator('.native-library-content-preview'),viewer=page.locator('[data-media-viewer]');
 const row=(title,action='进入')=>preview.getByRole('button',{name:action+' '+title,exact:true});
 const back=title=>preview.getByRole('button',{name:'返回 '+title,exact:true});
 const waitViewer=async()=>{await viewer.waitFor();await viewer.getByRole('button',{name:'返回库内预览',exact:true}).waitFor();await page.waitForFunction(async()=>{const s=(await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState();return s.phase==='open'&&!!s.session?.lcosControlled?.requestKey;});};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});
 await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.waitFor();const draft='嵌套查看保持这份原输入，不发送。';await input.fill(draft);await input.evaluate(e=>e.setSelectionRange(2,6));
 report.identity={url:page.url(),title:await page.title(),nonBlank:(await page.locator('body').innerText()).length>100};assert.ok(report.identity.nonBlank);
 await page.getByTestId('canvas-dockbar-assets-btn').click();const library=page.locator('[data-library-view="library"]'),search=library.getByRole('textbox',{name:'搜索',exact:true});await search.fill(fixture.scopeTitle);
 await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await row(fixture.outer.title).waitFor();await row(fixture.noteTitle,'查看').waitFor();await row(fixture.conversationTitle).waitFor();await shot('01-scope-nested-entries');
 const before=await facts(),beforeUI=await read(),writeStart=report.writes.length;
 await row(fixture.outer.title).click();await page.locator('[data-native-library-collection-preview]').waitFor();await row(fixture.inner.title).click();await row(fixture.artifactTitle,'查看').waitFor();
 await row(fixture.artifactTitle,'查看').click();await waitViewer();await page.locator('[data-lcos-native-text-reading]').waitFor();await viewer.getByRole('button',{name:'返回库内预览',exact:true}).click();await viewer.waitFor({state:'hidden'});await row(fixture.artifactTitle,'查看').waitFor();
 await row(fixture.noteTitle,'查看').click();await waitViewer();await viewer.getByText(fixture.noteBody,{exact:true}).waitFor();assert.equal(await page.locator('[data-lcos-window-body="reader"]').count(),0);await shot('02-note-original-text-page');
 await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});await row(fixture.noteTitle,'查看').waitFor();await back(fixture.outer.title).click();await row(fixture.inner.title).waitFor();await back(fixture.scopeTitle).click();await row(fixture.outer.title).waitFor();
 report.checks.push('Scope → 原集合预览 → 内层集合 → 原确版材料／附注文本 Viewer → 逐层返回；一个原 TS 与一个原 Viewer');
 await row(fixture.noteTitle,'查看').click();await waitViewer();await viewer.getByText(fixture.noteBody,{exact:true}).waitFor();await viewer.getByRole('button',{name:'返回库内预览',exact:true}).click();await viewer.waitFor({state:'hidden'});await row(fixture.noteTitle,'查看').waitFor();
 report.checks.push('Scope 直接附注入口沿原文本页读取同一 Note，不伪造 Artifact、Revision 或新阅读窗口');
 changeNoteRead=2;await row(fixture.noteTitle,'查看').click();await viewer.waitFor();await viewer.locator('[data-native-note-error]').getByText(/附注已更新/).waitFor();await shot('02b-note-updated-read-refused');
 await viewer.getByRole('button',{name:'重新读取同一附注',exact:true}).click();await waitViewer();await viewer.getByText(fixture.noteBody,{exact:true}).waitFor();
 await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});await row(fixture.noteTitle,'查看').waitFor();assert.equal(changeNoteRead,0);
 report.checks.push('受控 Note 读取期间更新：原 Viewer 明确拒绝替换；原重读按钮能读回同一附注并返回，Core 内容未改写');
 await row(fixture.outer.title).click();await row(fixture.conversationTitle).click();await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'返回库内预览',exact:true}).waitFor();await shot('03-conversation-original-right-panel');await page.getByRole('button',{name:'返回库内预览',exact:true}).click();await row(fixture.conversationTitle).waitFor();
 assert.equal(await search.inputValue(),fixture.scopeTitle);assert.equal((await read()).prompt,draft);await back(fixture.scopeTitle).click();await row(fixture.outer.title).waitFor();
 await row(fixture.conversationTitle).click();await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。',{exact:true}).waitFor();await page.getByRole('button',{name:'返回库内预览',exact:true}).click();await row(fixture.conversationTitle).waitFor();
 report.checks.push('集合和 Scope 的对话入口均进入原右侧栏，显示真实人工导入历史；原栏返回键回原成员，输入／搜索保留');
 await row(fixture.outer.title).click();await row(fixture.scopeTitle).click();await row(fixture.outer.title).waitFor();assert.equal(await page.locator('[data-native-scope-back]').count(),0);
 report.checks.push('集合反向包含父 Scope：复用已有浏览路径回父项，不无限追加层级或写回成员');
 await page.setViewportSize({width:1040,height:760});await row(fixture.outer.title).click();await row(fixture.inner.title).waitFor();const box=await preview.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1041&&box.y+box.height<=761);await shot('04-narrow-original-collection');
 await back(fixture.scopeTitle).click();await row(fixture.outer.title).waitFor();await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await row(fixture.outer.title).waitFor();
 report.checks.push('窄窗原预览可达，普通 Esc 关闭与原搜索行再次进入正常');
 const after=await facts(),afterUI=await read();assert.deepEqual(after,before);assert.deepEqual(afterUI.windows,beforeUI.windows);assert.deepEqual(afterUI.refs,beforeUI.refs);assert.equal(afterUI.prompt,draft);assert.deepEqual([afterUI.caret.start,afterUI.caret.end],[2,6]);
 report.browseWrites=report.writes.slice(writeStart).filter(row=>row.path!=='/api/events');assert.deepEqual(report.browseWrites,[]);assert.deepEqual(report.pageErrors,[]);
 report.checks.push('真实浏览零领域写入：集合／附注／会话历史／Scope／三个空间真值与 Stage 地址未变，无模型发送');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.ui=await page.evaluate(()=>window.__NESTED_READ__?.()).catch(()=>null);}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));}
