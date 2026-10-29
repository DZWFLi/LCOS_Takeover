/** Run from repo root: node scripts/e2e/gui-stage7/run.mjs [evidence-directory]
 * Requires existing web workspace dependencies. Does not install/upgrade/mock Motion.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..'), web=path.join(repo,'huabu/apps/web');
const out=path.resolve(process.argv[2] || path.join(repo,'.tmp/gui-stage7'));
await fs.mkdir(out,{recursive:true});
const requireWeb=createRequire(path.join(web,'package.json'));
const results=[],errors=[];let server,browser;
const report={status:'RUNNING',scope:'real Motion + shipped React Views; fixture data; no Core/ReactFlow',results,errors};
async function save(){await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));}
const check=(name,ok,detail)=>{results.push({name,ok,detail});if(!ok)throw new Error(name);};
try {
  const motionEntry=requireWeb.resolve('motion/react');
  const react=requireWeb('react');
  const {createServer}=await import(pathToFileURL(requireWeb.resolve('vite')).href);
  const {chromium}=requireWeb('@playwright/test');
  report.environment={react:react.version,motionEntry,browser:'installed Playwright Chromium; no Motion mock'};
  const style=`*{box-sizing:border-box}body{margin:0;background:#f4f6f5;font-family:Arial,'Noto Sans SC',sans-serif;--gen2-text:#242625;--gen2-muted:#69716b;--gen2-surface:#fff;--gen2-raised:#eff2f0;--gen2-canvas:#f5f6f5;--gen2-accent:#107d98;--lcos-color-border-default:rgba(0,0,0,.12);--lcos-color-border-subtle:rgba(0,0,0,.09)}button{cursor:pointer}.test-controls{position:fixed;left:8px;top:4px;z-index:300;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 16px);font-size:11px}.test-controls button{min-height:28px}.test-portal{position:fixed;left:20px;top:120px;width:440px;max-width:calc(100vw - 40px)}`;
  const scriptUrl='/@fs/'+path.join(here,'scene.tsx').replaceAll('\\','/');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stage7 真实 Motion 验证</title><style>${style}</style></head><body><div id="root"></div><script type="module" src="${scriptUrl}"></script></body></html>`;
  server=await createServer({root:web,configFile:false,esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.join(web,'src')}},server:{host:'127.0.0.1',port:4177,strictPort:true,fs:{allow:[repo]}},plugins:[{name:'stage7-scene',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url==='/__gui-stage7__/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html)}else next()})}}]});
  await server.listen();browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:path.join(out,'video'),size:{width:1440,height:900}}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('console',m=>{if(m.type()==='error')errors.push({type:'console',message:m.text()})});
  page.on('requestfailed',r=>errors.push({type:'requestfailed',url:r.url(),message:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)errors.push({type:'http',status:r.status(),url:r.url()})});
  await page.goto('http://127.0.0.1:4177/__gui-stage7__/');
  await page.waitForSelector('#atlas-toggle');
  check('page identity',(await page.title()).includes('真实 Motion'));
  const engine=await page.locator('#engine-probe').evaluate(async el=>{const x=()=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;const a=x();await new Promise(r=>setTimeout(r,120));return[a,x()]});
  check('actual animation changes over time',engine[1]>engine[0],engine);
  await page.click('#atlas-toggle');await page.waitForTimeout(85);
  await page.evaluate(()=>{window.__atlasNode=document.querySelector('[data-lcos-context-atlas]')});
  await page.click('#atlas-toggle');await page.waitForTimeout(30);
  check('exiting Atlas remains briefly mounted',await page.locator('[data-lcos-context-atlas]').count()===1);
  check('exiting Atlas is inert',await page.locator('[data-lcos-context-atlas]').getAttribute('inert')!==null);
  await page.click('#atlas-toggle');await page.waitForTimeout(600);
  check('reversal retains keyed element',await page.evaluate(()=>window.__atlasNode===document.querySelector('[data-lcos-context-atlas]')));
  check('no duplicate Atlas',await page.locator('[data-lcos-context-atlas]').count()===1);
  check('re-entered element interactive',(await page.locator('[data-lcos-context-atlas]').getAttribute('inert'))===null);
  const a=page.getByRole('button',{name:'进入品牌原点'});await a.focus();await page.waitForTimeout(500);
  check('keyboard focus lifts collection',await a.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el.closest('[data-lcos-context-collection]')).transform).m42< -7));
  await page.keyboard.press('Enter');check('native Enter exactly once',(await page.textContent('#enters'))==='1');
  await page.screenshot({path:path.join(out,'atlas-focus-1440.png')});
  await page.getByRole('button',{name:'进入集合 · 品牌原点'}).click();check('whole collection uses existing activation',(await page.textContent('#enters'))==='2');
  await page.mouse.click(80,250);await page.waitForTimeout(450);
  check('blank click retracts Atlas',await page.locator('[data-lcos-context-atlas]').count()===0);
  await page.click('#hand-toggle');await page.waitForTimeout(700);
  await page.click('#many-cards');await page.waitForTimeout(150);
  check('many cards use pool instead of repeated fan',await page.locator('.lcos-workflow-hand-cards').evaluate(el=>getComputedStyle(el).display==='grid'));
  await page.locator('.lcos-workflow-task-slot').last().scrollIntoViewIfNeeded();
  check('last pool card reachable',await page.locator('.lcos-workflow-task-slot').last().isVisible());
  await page.click('#hand-toggle');await page.waitForTimeout(30);
  check('Hand exit retained',await page.locator('[data-lcos-workflow-hand]').count()===1);
  await page.click('#hand-toggle');await page.waitForTimeout(500);
  check('Hand rapid reopen unique',await page.locator('[data-lcos-workflow-hand]').count()===1);
  await page.screenshot({path:path.join(out,'hand-24.png')});
  await page.click('#hand-toggle');await page.waitForTimeout(450);await page.click('#temporal-show');
  const first=page.locator('[data-temporal-item="one"]');await first.focus();await page.keyboard.press('ArrowDown');
  check('Temporal skips disabled',await page.locator('[data-temporal-item="three"]').evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Escape');check('Temporal clears local preview',await page.locator('[data-temporal-item][data-preview="true"]').count()===0);
  await page.locator('[data-lcos-temporal-rail]').hover();await page.mouse.wheel(0,80);await page.waitForTimeout(80);check('wheel callback delivered',Number(await page.textContent('#shifts'))>0);
  const railBox=await page.locator('[data-lcos-temporal-rail]').boundingBox();
  if(!railBox)throw new Error('missing Temporal rail');
  await page.mouse.move(railBox.x+40,railBox.y+277);await page.waitForTimeout(650);
  const focusTick=await page.locator('[data-temporal-tick="24"]').evaluate(el=>({top:el.offsetTop,width:parseFloat(getComputedStyle(el).width),height:parseFloat(getComputedStyle(el).height),color:getComputedStyle(el).backgroundColor}));
  check('Figma inward lens keeps cadence and has 44x3 center',focusTick.top===277&&Math.abs(focusTick.width-44)<.1&&Math.abs(focusTick.height-3)<.1,focusTick);
  const ys=await page.locator('[data-temporal-tick]').evaluateAll(es=>es.map(el=>el.offsetTop));check('hover does not warp y positions',ys.every((y,i)=>y===13+11*i),ys);
  await page.mouse.move(200,100);await page.waitForTimeout(650);
  check('temporary inward focus restores on leave',await page.locator('[data-temporal-tick="24"]').evaluate(el=>Math.abs(parseFloat(getComputedStyle(el).width)-14)<.1));
  await page.click('#portal-show');await page.evaluate(()=>window.__sceneNode=document.querySelector('[data-lcos-real-portal-preview]'));await page.click('#portal-next');
  check('Portal scene survives state change',await page.evaluate(()=>window.__sceneNode===document.querySelector('[data-lcos-real-portal-preview]')));
  check('partial has no retry',await page.locator('.lcos-portal-retry').count()===0);
  for(const [w,h] of [[1440,900],[1280,800],[1152,768],[1024,768],[390,844]]){
    await page.setViewportSize({width:w,height:h});await page.click('#atlas-toggle');await page.waitForTimeout(650);
    const sizes=await page.locator('.lcos-context-collection-slot').evaluateAll(es=>es.map(el=>({w:el.offsetWidth,h:el.offsetHeight})));check(`fixed body ${w}`,sizes.length===6&&sizes.every(s=>s.w===248&&s.h===244));
    await page.screenshot({path:path.join(out,`atlas-${w}.png`)});await page.click('#atlas-toggle');await page.waitForTimeout(450);
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.click('#hand-toggle');await page.waitForTimeout(150);
  check('reduced motion stable grid',await page.locator('.lcos-workflow-hand-cards').evaluate(el=>getComputedStyle(el).display==='grid'));
  check('reduced motion no fan',await page.locator('.lcos-workflow-task-slot').evaluateAll(es=>es.every(el=>getComputedStyle(el).transform==='none')));
  await page.screenshot({path:path.join(out,'reduced-mobile.png')});
  check('no page/console/http errors',errors.length===0,errors);
  await context.close();report.status='PASS';
} catch(error) {
  report.status=results.length===0?'BLOCKED_DEPENDENCIES':'FAIL';report.error=String(error.stack||error);process.exitCode=1;
} finally {if(browser)await browser.close();if(server)await server.close();await save();console.log(JSON.stringify({status:report.status,checks:results.length,out}));}
