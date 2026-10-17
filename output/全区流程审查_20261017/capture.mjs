import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const out=path.dirname(fileURLToPath(import.meta.url)),origin='http://127.0.0.1:56238';
const health=await(await fetch(origin+'/health')).json();
if(!health.realCoreConnected||!health.runtimeLabel?.startsWith('isolated-'))throw Error('Expected existing isolated audit instance.');
const {chromium}=createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block'});
const report={time:new Date().toISOString(),health,steps:[],pageErrors:[],httpErrors:[],blocked:[],limits:['Existing built runtime; no rebuild/restart','No model, destructive Core action or real user data','Unverified states remain unverified']};
await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
 if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){report.blocked.push(url.origin+url.pathname);return route.abort();}
 if(!['GET','HEAD','OPTIONS'].includes(req.method())&&!['/api/events','/api/lcos/canvases/surface-core-main/execution:reconcile'].includes(url.pathname)){report.blocked.push(req.method()+' '+url.pathname);return route.abort();}
 return route.continue();});
await context.routeWebSocket(/.*/,socket=>socket.close());
const page=await context.newPage();page.setDefaultTimeout(12000);
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({status:r.status(),url:r.url()});});
await fs.mkdir(path.join(out,'screenshots'),{recursive:true});
async function snap(name){
 await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog]')].every(el=>{for(let e=el;e;e=e.parentElement){if(Number(getComputedStyle(e).opacity)<.99)return false;}return true;}));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const file=path.join(out,'screenshots',name+'.png');await page.screenshot({path:file});
 const aria=await page.locator('body').ariaSnapshot();await fs.writeFile(path.join(out,'screenshots',name+'.aria.txt'),aria);
 const state=await page.evaluate(()=>({url:location.href,viewport:{width:innerWidth,height:innerHeight},dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>({label:e.getAttribute('aria-label'),text:e.textContent.slice(0,100),rect:e.getBoundingClientRect().toJSON()})),stage:document.querySelector('[data-lcos-professional-stage]')?.getAttribute('data-empty'),oldBodies:[...document.querySelectorAll('[data-lcos-window-body]')].map(e=>e.getAttribute('data-lcos-window-body')),textareas:[...document.querySelectorAll('textarea')].map(e=>({label:e.getAttribute('aria-label'),placeholder:e.placeholder})),dock:[...document.querySelectorAll('[data-lcos-surface-dock],[data-lcos-native-chat-frame]')].map(e=>({tag:e.getAttributeNames().filter(n=>n.startsWith('data-')),rect:e.getBoundingClientRect().toJSON()}))}));
 report.steps.push({name,file,...state});console.log(name);
 return aria;
}
async function action(name,fn){try{await fn();}catch(e){report.steps.push({name,error:e.message});console.log('LIMIT '+name+': '+e.message.slice(0,180));await snap(name+'-unreached').catch(()=>{});}}
async function main(){await page.goto(origin+'/canvas/surface-core-main');await page.locator('[data-lcos-native-chat-frame] textarea').waitFor({state:'visible',timeout:60000});await page.getByRole('status',{name:'Loading canvas'}).waitFor({state:'hidden',timeout:45000});}
try{
 await main();await snap('01-main');
 await action('library',async()=>{await page.getByTestId('canvas-dockbar-assets-btn').click();await page.getByRole('textbox',{name:'搜索',exact:true}).waitFor();await snap('02-library');
 await page.getByRole('textbox',{name:'搜索',exact:true}).fill('本地合成图');await page.getByRole('button',{name:'本地合成图.png',exact:true}).first().click();await page.getByRole('button',{name:'加入本次引用',exact:true}).waitFor();await snap('03-light-preview');
 await page.keyboard.press('Escape');await snap('04-preview-escape');});
 await action('task',async()=>{await page.getByRole('button',{name:'查看任务',exact:true}).click();await page.getByRole('heading',{name:'任务',exact:true}).waitFor();await snap('05-task');await page.getByRole('button',{name:'返回对话',exact:true}).click();});
 await action('conversation-menu',async()=>{await page.locator('.native-chat-conversations summary').click();await snap('06-conversation-menu');await page.keyboard.press('Escape');});
 await main();
 await action('create',async()=>{await page.getByTestId('canvas-dockbar-add-node-btn').click();await snap('07-create');await page.keyboard.press('Escape');});
 await action('history',async()=>{await page.getByTestId('canvas-dockbar-history-btn').click();await snap('08-history');});
 await main();await page.setViewportSize({width:1000,height:800});await snap('09-narrow');
}catch(e){report.failure=e.stack;await snap('99-failure').catch(()=>{});}
finally{await fs.writeFile(path.join(out,'capture-report.json'),JSON.stringify(report,null,2));await browser.close();}
