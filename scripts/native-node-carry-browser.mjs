import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const base = 'http://127.0.0.1:56241';
const health = await (await fetch(base + '/health')).json();
assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020', 'Only this disposable runtime may be exercised');
const out = path.join(os.tmpdir(), 'lcos-node-drop-20261020');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
const report = { checks: [], errors: [], mutations: [], screenshots: [], passed: false };
await context.route('**/*', route => {
  const req = route.request(), url = new URL(req.url());
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) return route.abort();
  if (!['GET','HEAD','OPTIONS'].includes(req.method())) {
    report.mutations.push({ path: url.pathname, method: req.method() });
    if (/\/runs|\/continuation|gateway/.test(url.pathname)) return route.abort();
  }
  return route.continue();
});
await context.routeWebSocket(/.*/, s => { if (['127.0.0.1','localhost','[::1]'].includes(new URL(s.url()).hostname)) s.connectToServer(); else s.close(); });
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
const positions = () => page.evaluate(() => window.__LCOS_NODE_LAB__.api.getNodes().map(n => ({ id:n.id, position:n.position })));
const shot = async name => { const p = path.join(out, name+'.png'); await page.screenshot({path:p}); report.screenshots.push(p); };
const sourcePoint = async id => { const r = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox(); assert.ok(r); return {x:r.x+r.width*.4,y:r.y+r.height*.4}; };
try {
  await page.goto(base + '/canvas/surface-core-workflow');
  await page.waitForSelector('.react-flow__node');
  await page.locator('.common-loading-overlay').waitFor({state:'hidden',timeout:60000});
  if (!await page.locator('[data-lcos-composer-reference-surface]').isVisible()) {
    await page.locator('[data-pile-gallery-chrome="bottom-right"] button').click();
  }
  await page.waitForSelector('[data-lcos-composer-reference-surface]');
  await page.waitForTimeout(2500);
  assert.equal(report.errors.length, 0);
  const initial = await positions();
  const drag = async (id, {alt=false, cancel=false}={}) => {
    const a = await sourcePoint(id), r = await page.locator('[data-lcos-composer-reference-surface]').boundingBox(); assert.ok(r);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(a.x,a.y);
    await page.mouse.down({button:alt?'left':'right'});
    await page.mouse.move(a.x+12,a.y+12,{steps:3});
    await page.mouse.move(r.x+r.width*.45,r.y+28,{steps:20});
    await page.waitForTimeout(900);
    await shot(cancel?'escape-preview':alt?'alt-preview':'right-preview');
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up({button:alt?'left':'right'});
    if (alt) await page.keyboard.up('Alt');
    await page.waitForTimeout(1200);
  };
  await drag('surface-workflow-image');
  report.afterRight = await page.locator('body').innerText();
  assert.equal(await page.locator('[data-lcos-composer-ref]').count(),1,'right carry adds one real draft reference');
  assert.deepEqual(await positions(),initial,'semantic carry leaves source geometry alone');
  report.checks.push('image right-carry adds exact draft reference and does not move source');
  await drag('surface-workflow-text',{cancel:true});
  assert.equal(await page.locator('[data-lcos-composer-ref]').count(),1,'Escape adds no reference');
  report.checks.push('Escape cancels without modifying references');
  await drag('surface-workflow-text',{alt:true});
  assert.equal(await page.locator('[data-lcos-composer-ref]').count(),2,'Alt carry shares the same reference path');
  assert.deepEqual(await positions(),initial);
  report.checks.push('text Alt-left carry adds second reference without moving source');
  await drag('surface-workflow-image');
  assert.equal(await page.locator('[data-lcos-composer-ref]').count(),2,'duplicate reference is deduplicated');
  report.checks.push('repeated drop does not duplicate reference');
  const a = await sourcePoint('surface-workflow-image');
  await page.mouse.click(a.x,a.y,{button:'right'});
  await page.waitForTimeout(300);
  report.menuText = await page.locator('body').innerText();
  assert.ok(await page.getByText('复制到剪贴板', {exact:true}).isVisible(),'short right click preserves native context menu');
  report.checks.push('short right click retains native menu');
  await page.keyboard.press('Escape');
  const b=await sourcePoint('surface-workflow-image');
  await page.mouse.move(b.x,b.y); await page.mouse.down(); await page.mouse.move(b.x+40,b.y+30,{steps:10}); await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.notDeepEqual(await positions(),initial,'ordinary left drag still moves a node');
  assert.equal(await page.locator('[data-lcos-composer-ref]').count(),2);
  report.checks.push('ordinary left drag moves the node without changing references');
  await shot('completed');
  assert.equal(report.errors.length,0);
  report.passed=true;
} catch(e) { report.failure=e.stack; report.body=await page.locator('body').innerText().catch(()=> ''); await shot('failure'); process.exitCode=1; }
finally { await fs.writeFile(path.join(out,'journey.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report)); await browser.close(); }
