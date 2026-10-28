import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const origin = 'http://127.0.0.1:56311', canvasId = 'surface-core-main';
const output = path.resolve('output/原Rail接续_20261023/实屏核查', new Date().toISOString().replaceAll(':', '-')); await fs.mkdir(output, { recursive: true });
const report = { output, errors: [], requests: [], controls: [], panels: [], writes: [] };
const get = async route => { const r = await fetch(origin + route); assert.ok(r.ok); const d = await r.json(); return d.value ?? d.data ?? d; };
const health = await get('/health'); assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020'); report.pid = health.pid;
const before = await get('/api/canvas/v1/canvases/' + canvasId);
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const r = route.request(), u = new URL(r.url()); if (u.origin !== origin) return route.abort();
    if (!['GET','HEAD','OPTIONS'].includes(r.method())) {
      const body = r.postDataJSON(); let permitted = u.pathname === '/api/events' || u.pathname.endsWith('/execution:reconcile');
      if (u.pathname.endsWith('/nodes:batchActions')) permitted = !body.lcos_operation && body.actions?.every(a => a.action === 'update'
        && a.updates?.every(n => { const old = before.nodes.find(x => x.id === n.id); return old && equal(n.position,old.position) && equal(n.data,old.data); }));
      report.writes.push({ path:u.pathname,method:r.method(),permitted }); if (!permitted) return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/') && !p.includes('events')) report.requests.push({ path:p,status:r.status() }); });
  const open = async () => { await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:90000});
    await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:90000});
    await page.getByTestId('canvas-dockbar-container').waitFor(); };
  const capture = async (name, start) => { await page.screenshot({path:path.join(output,name+'.png')});
    report.panels.push({name,body:await page.locator('body').innerText(),requests:report.requests.slice(start),dialogs:await page.getByRole('dialog').allTextContents()});
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)); };
  await open();
  report.controls = await page.getByTestId('canvas-dockbar-container').locator('button,[data-testid]').evaluateAll(rows=>rows.map(e=>({tag:e.tagName,testid:e.getAttribute('data-testid'),label:e.getAttribute('aria-label'),text:e.textContent,disabled:e.getAttribute('aria-disabled')})));
  await capture('00-original-rail',0);
  for (const [name,id] of [['library','canvas-dockbar-assets-btn'],['templates','canvas-dockbar-workflow-btn'],['comments','canvas-dockbar-comment-mode-btn'],['history','canvas-dockbar-history-btn']]) {
    await open(); const start=report.requests.length; const button=page.getByTestId(id);
    if(await button.count()){await button.click();await page.waitForTimeout(1000);await capture(name,start);}else report.panels.push({name,missingId:id});
  }
  await open();let start=report.requests.length;await page.locator('.react-flow__pane').click({position:{x:200,y:150}});await page.keyboard.press('Control+f');
  const dialog=page.getByRole('dialog');await dialog.waitFor();await capture('search-empty',start);
  for(const term of ['新对话','集合','Main']){start=report.requests.length;await dialog.locator('input').fill(term);await capture('search-'+term,start);}
  assert.deepEqual(await get('/api/canvas/v1/canvases/'+canvasId),before); report.canvasUnchanged=true;
} catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({output,controls:report.controls,panels:report.panels.map(p=>({name:p.name,dialogs:p.dialogs,requests:p.requests?.filter(r=>r.status>=400)})),errors:report.errors,error:report.error},null,2));
