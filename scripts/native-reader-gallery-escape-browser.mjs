import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const origin=new URL(arg('base-url')??'http://127.0.0.1:56253').origin,expectedPid=Number(arg('expected-pid'));
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const health=await(await fetch(origin+'/health')).json();assert.equal(health.pid,expectedPid);assert.equal(health.runtimeLabel,'isolated-reader-restore-20261020');
const fixture=JSON.parse(await fs.readFile(path.join(root,'.runtime/isolated-reader-restore-20261020/gallery-fixture.json'),'utf8'));
const output=path.join(root,'output/playwright/reader-gallery-escape-20261020',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,origin,expectedPid,scope:'Actual original Gallery and c2 DOM keyboard handler with real Core file bytes. Only the exact content response is held until the original loading session opens; no runtime/setter/phase/camera injection.',keys:[],observations:{},errors:[],writes:[],screenshots:[]};
const {chromium}=createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let page,release;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block',reducedMotion:'no-preference'});
 let held=false;
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
  if(['blob:','data:'].includes(url.protocol))return route.continue();if(url.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.writes.push({method:request.method(),path:url.pathname});return route.abort()}
  if(url.pathname.endsWith('/course-api-base-url-CifxI1ia.js')){const response=await route.fetch({timeout:60000}),body=await response.text();return route.fulfill({response,body:body+';window.__LCOS_ESCAPE_READ__=()=>({phase:LCOSNativeMaterialViewerRuntime.getState().phase,session:LCOSNativeMaterialViewerRuntime.getState().session?.id});'})}
  if(!held&&url.pathname.includes('/'+fixture.text.fileRecordId+'/content')){held=true;const response=await route.fetch({timeout:60000});await new Promise(resolve=>{release=resolve});return route.fulfill({response})}
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__LCOS_ESCAPE_KEYS__=[];document.addEventListener('keydown',event=>{if(event.key==='Escape')window.__LCOS_ESCAPE_KEYS__.push({state:window.__LCOS_ESCAPE_READ__?.(),insideViewer:!!(event.target instanceof Element&&event.target.closest('[data-media-viewer]')),prevented:event.defaultPrevented})},true)});
 await page.goto(origin+'/canvas/surface-core-main');await page.getByTestId('common-loading-overlay').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'重置',exact:true}).click();await page.locator('[data-pile-node="'+fixture.projection.node.id+'"]').click();
 const gallery=page.locator('[role=dialog][data-pile-gallery-phase=open]');await gallery.waitFor();
 await gallery.locator('[data-native-collection-gallery-member="artifact:'+fixture.text.artifactId+'"]').getByRole('button',{name:'查看',exact:true}).click();
 await page.waitForFunction(()=>window.__LCOS_ESCAPE_READ__?.().phase==='open');
 assert.equal(typeof release,'function');report.observations.loading=await page.evaluate(()=>window.__LCOS_ESCAPE_READ__());
 release();release=undefined;
 await page.waitForFunction(()=>window.__LCOS_ESCAPE_READ__?.().phase==='opening'&&document.querySelector('[data-lcos-native-text-reading]'),undefined,{polling:'raf'});
 await page.keyboard.press('Escape');
 await page.locator('[data-media-viewer]').waitFor({state:'hidden'});await gallery.waitFor({state:'visible'});
 report.keys=await page.evaluate(()=>window.__LCOS_ESCAPE_KEYS__);
 assert.ok(report.keys.some(key=>key.state?.phase==='opening'&&key.insideViewer),'Escape must actually land during the second original opening, not pass after waiting for open');
 report.observations.closed=await page.evaluate(()=>window.__LCOS_ESCAPE_READ__());assert.equal(report.observations.closed.session,undefined);
 const image=path.join(output,'01-gallery-restored-after-early-escape.png');await page.screenshot({path:image});report.screenshots.push(image);
 await page.keyboard.press('Escape');await page.locator('[role=dialog][data-pile-gallery-phase]').waitFor({state:'hidden'});
 assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.failure=error.stack;if(page){report.keys=await page.evaluate(()=>window.__LCOS_ESCAPE_KEYS__);report.observations.failure=await page.evaluate(()=>({state:window.__LCOS_ESCAPE_READ__?.(),active:document.activeElement?.outerHTML.slice(0,500)}));await page.screenshot({path:path.join(output,'failure.png')})}}
finally{release?.();await browser.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,keys:report.keys,output,failure:report.failure}));if(!report.passed)process.exitCode=1}
