import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin=new URL(process.argv.find(x=>x.startsWith('--base-url='))?.slice(11)||'http://127.0.0.1:56238').origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');const health=await(await fetch(origin+'/health')).json();assert(health.runtimeLabel?.startsWith('isolated-')&&health.realCoreConnected);
const out=path.resolve(process.argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||path.join(root,'output/原流程施工_20261017b/viewer-qa'));await fs.mkdir(out,{recursive:true});
const{chromium}=createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block'});
const report={at:new Date().toISOString(),health,browser:'Browser plugin not available; existing Playwright Core',checks:[],pageErrors:[],httpErrors:[],blocked:[],screenshots:[],passed:false};
await context.route('**/*',r=>{const q=r.request(),u=new URL(q.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){report.blocked.push(u.origin+u.pathname);return r.abort();}if(q.method()!=='GET'&&/collaboration-send|conversation-continuations|recovery-actions|agent-gateway|\/runs(?:\/|$)|\/generations(?:\/|$)/.test(u.pathname)){report.blocked.push(q.method()+' '+u.pathname);return r.abort();}return r.continue();});await context.routeWebSocket(/.*/,s=>s.close());
const page=await context.newPage();page.setDefaultTimeout(14000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({status:r.status(),path:new URL(r.url()).pathname});});
const shot=async name=>{if(await page.locator('[data-media-viewer]').count())await page.waitForFunction(async()=>(await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState().phase==='open',{},{timeout:15000});await page.evaluate(()=>new Promise(resolve=>{let n=0;const f=()=>++n>=15?resolve():requestAnimationFrame(f);f();}));const file=path.join(out,name+'.png');await page.screenshot({path:file});await fs.writeFile(path.join(out,name+'.aria.txt'),await page.locator('body').ariaSnapshot());report.screenshots.push(file);};
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
 await page.goto(origin+'/canvas/surface-core-main');await page.getByRole('textbox',{name:'Composer 输入',exact:true}).waitFor({timeout:60000});await page.getByRole('status',{name:'Loading canvas'}).waitFor({state:'hidden',timeout:45000});
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true}),draft='查看器闭环检查 · 保留这份未发送想法。';await input.fill(draft);
 await check('native Library uses ordinary placement and exact full Viewer',async()=>{await page.getByTestId('canvas-dockbar-assets-btn').click();await page.getByRole('textbox',{name:'搜索',exact:true}).fill('本地合成图');await page.getByRole('button',{name:'本地合成图.png',exact:true}).first().click();await page.getByRole('button',{name:'放到画布',exact:true}).waitFor();await page.getByRole('button',{name:'查看准确版本',exact:true}).click();await page.locator('[data-media-viewer]').waitFor({state:'visible'});await page.locator('[data-media-viewer] img').first().waitFor();await shot('01-original-full-image');assert.equal(await page.locator('[data-lcos-window-body="reader"]').count(),0);});
 await check('original image inspect and two-step Escape return to same draft',async()=>{const images=page.locator('[data-media-viewer] img');const candidates=await images.evaluateAll(es=>es.map((e,index)=>({index,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));const largest=candidates.sort((a,b)=>b.w*b.h-a.w*a.h)[0];assert(largest&&largest.w>300&&largest.h>200);await images.nth(largest.index).click();await page.locator('[data-media-viewer-inspecting-image="true"]').waitFor();await shot('02-original-image-inspect');await page.keyboard.press('Escape');await page.locator('[data-media-viewer]').waitFor();assert.equal(await page.locator('[data-media-viewer-inspecting-image="true"]').count(),0);await page.keyboard.press('Escape');await page.locator('[data-media-viewer]').waitFor({state:'hidden'});assert.equal(await input.inputValue(),draft);assert.equal(await input.count(),1);});
 await check('Composer material viewing renders original CT and exact positive document search',async()=>{
  await page.getByRole('button',{name:'从材料库添加',exact:true}).click();await page.getByRole('textbox',{name:'搜索',exact:true}).fill('Brief');
  await page.getByRole('button',{name:'Brief',exact:true}).first().click();await page.getByRole('button',{name:'查看准确版本',exact:true}).click();
  await page.locator('[data-lcos-native-text-reading] .lcos-reader-measure').waitFor();await shot('03-original-text-reading');
  await page.locator('.native-material-text-scroll').focus();await page.keyboard.press('Control+f');
  const search=page.getByRole('textbox',{name:'在文档中查找',exact:true});await search.waitFor();await search.fill('Canvas');
  await page.waitForFunction(()=>document.querySelector('[data-lcos-reader-match-count]')?.textContent==='1/2');
  await page.getByRole('button',{name:'下一个匹配',exact:true}).click();assert.equal(await page.locator('[data-lcos-reader-match-count]').innerText(),'2/2');
  await page.getByRole('button',{name:'放大阅读字号',exact:true}).click();await shot('04-reading-search');
  await search.focus();await page.keyboard.press('Escape');assert.equal(await search.inputValue(),'');assert(await page.locator('[data-media-viewer]').isVisible());
 });
 await check('real text selection excerpt returns to same draft and exact reference without sending',async()=>{
  const paragraph=page.locator('[data-lcos-native-text-reading] .lcos-reader-measure p').first();await paragraph.click({clickCount:3});
  await page.getByRole('button',{name:'摘录到输入',exact:true}).waitFor();await page.getByRole('button',{name:'摘录到输入',exact:true}).click();
  await page.locator('[data-media-viewer]').waitFor({state:'hidden'});await input.waitFor({state:'visible'});
  const next=await input.inputValue();assert(next.startsWith(draft));assert(next.includes('Goal: show a local creative project'));assert(next.includes('Brief'));
  assert.equal(await input.count(),1);assert.equal(await page.locator('[data-lcos-composer-ref]').count(),1);await shot('05-excerpt-return');
 });
 assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(e){report.failure=e.stack;report.viewerDebug=await page.evaluate(async()=>{const entries=performance.getEntriesByType('resource').map(x=>x.name);const course=entries.find(x=>/course-api-base-url-CifxI1ia\.js/.test(x));const module=course?await import(course):null;const state=module?.LCOSNativeMaterialViewerRuntime?.getState();return{course,phase:state?.phase,session:state?.session?{id:state.session.id,media:state.session.media,resources:state.session.resources,slots:Object.keys(state.session.lcosControlled??{})}:null,dom:[...document.querySelectorAll('[data-media-viewer] main,[data-media-viewer] img,[data-media-viewer] video,[data-lcos-native-material-state]')].map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,120),rect:x.getBoundingClientRect().toJSON()}))};}).catch(error=>({error:String(error)}));await shot('99-failure').catch(()=>{});console.error(e.stack);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
