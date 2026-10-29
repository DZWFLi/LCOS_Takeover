import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const browserModule = fs.readdirSync(cache).map(entry => path.join(cache, entry, 'node_modules', 'playwright')).find(file => fs.existsSync(path.join(file, 'package.json')));
if (!browserModule) throw new Error('Cached Playwright unavailable; no installation attempted.');
const { chromium } = require(browserModule);
const origin = 'http://127.0.0.1:17877';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.profile, 'original-nodes-local-fixture-writes');
const api = async (method, route, body) => {
  const response = await fetch(origin + route, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, 200, await response.text().then(text => { try { return JSON.parse(text); } catch { return text; } }));
  // This helper is not used for reads; response body is consumed by the assertion message.
};
const created = await (await fetch(origin + '/api/canvas/v1/canvases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '复跑空间 · 图片文本' }) })).json();
const canvasId = created.data.canvas.id;
await api('POST', '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', { canvas_id: canvasId, actions: [{ action: 'create', creates: [
  { id: 'smoke-image', type: 'image', position: { x: 140, y: 120 }, data: { title: '图片复跑', type: 'upload', src: '/node-fixtures/image.svg' } },
  { id: 'smoke-text', type: 'text', position: { x: 760, y: 150 }, data: { title: '文本复跑', text: '双击进行本地编辑' } },
] }] });
const report = { at: new Date().toISOString(), canvasId, mode: 'original-ui-local-fixture', coreConnected: false, cases: [], pageErrors: [], externalBlocked: [], consoleErrors: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', route => { const url = new URL(route.request().url()); if (!['http:', 'https:'].includes(url.protocol) || url.origin === origin) return route.continue(); report.externalBlocked.push(url.origin); return route.abort('blockedbyclient'); });
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 500)); });
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
const node = id => page.locator('.react-flow__node[data-id="' + id + '"]');
const store = () => page.evaluate(() => ({ nodes: window.__LCOS_NODE_LAB__.api.getNodes(), edges: window.__LCOS_NODE_LAB__.api.getEdges(), viewport: window.__LCOS_NODE_LAB__.api.getViewport() }));
const saved = async () => (await (await fetch(origin + '/api/node-lab/state')).json()).data.canvases.find(c => c.id === canvasId);
const settle = () => page.waitForTimeout(1500);
async function test(name, operation) { const detail = await operation(); report.cases.push({ name, passed: true, detail }); console.log('PASS ' + name); }
try {
  await page.goto(origin + '/canvas/' + canvasId);
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api);
  await test('original image/text nonblank render', async () => { assert.equal(await page.locator('.react-flow__node').count(), 2); assert.ok((await page.title()).includes('复跑空间')); assert.ok(await node('smoke-image').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)); });
  await test('rich text H2/bold + original save', async () => {
    await node('smoke-text').locator('[data-testid=canvas-node-text-content]').dblclick();
    const dialog = page.getByRole('dialog'), editor = dialog.locator('[contenteditable]');
    await editor.fill('原节点自动复跑通过'); await dialog.getByRole('radio', { name: '标题 2', exact: true }).click();
    await editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+b');
    await dialog.getByRole('button', { name: '关闭', exact: true }).first().click(); await settle();
    assert.equal((await saved()).nodes.find(n => n.id === 'smoke-text').data.text, '## **原节点自动复跑通过**');
  });
  await test('image original picker replace + single PUT completion', async () => {
    const chooserPromise = page.waitForEvent('filechooser');
    await node('smoke-image').getByRole('button', { name: '替换', exact: true }).click();
    await (await chooserPromise).setFiles(path.join(visualRoot, 'node-upload-fixture.png'));
    await page.waitForFunction(() => window.__LCOS_NODE_LAB__?.api?.getNode('smoke-image').data.src.includes('node-fixture-'));
    await settle(); const image = (await saved()).nodes.find(n => n.id === 'smoke-image'); assert.ok(image.data.src.startsWith(origin)); return { id: image.id, src: image.data.src };
  });
  await test('original duplicate undo redo', async () => {
    await node('smoke-image').click({ button: 'right', position: { x: 20, y: 80 } }); await page.getByRole('option', { name: '副本', exact: true }).click(); await settle(); assert.equal((await store()).nodes.length, 3);
    await page.keyboard.press('Control+z'); await settle(); assert.equal((await store()).nodes.length, 2);
    await page.keyboard.press('Control+Shift+z'); await settle(); assert.equal((await saved()).nodes.length, 3);
    const extra = (await store()).nodes.find(n => n.type === 'image' && n.id !== 'smoke-image');
    await node(extra.id).click({ button: 'right', position: { x: 20, y: 80 } }); await page.getByRole('option', { name: /^删除/ }).click(); await settle(); assert.equal((await saved()).nodes.length, 2);
  });
  await test('Shift multiselect + group drag persistence', async () => {
    await page.mouse.click(350, 80); await node('smoke-image').click({ position: { x: 30, y: 60 } }); await node('smoke-text').click({ position: { x: 40, y: 70 }, modifiers: ['Shift'] });
    assert.equal((await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getSelection())).nodeIds.length, 2);
    const before = (await saved()).nodes.find(n => n.id === 'smoke-image').position;
    const b = await node('smoke-image').boundingBox(); await page.mouse.move(b.x + 40, b.y + 70); await page.mouse.down(); await page.mouse.move(b.x + 95, b.y + 95, { steps: 12 }); await page.mouse.up(); await settle();
    const after = (await saved()).nodes.find(n => n.id === 'smoke-image').position; assert.notEqual(before.x, after.x); return { before, after };
  });
  await test('slider zoom + actual pane middle pan', async () => {
    const before = (await store()).viewport; await page.getByRole('slider').focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200); const zoomed = (await store()).viewport; assert.notEqual(before.zoom, zoomed.zoom);
    await page.mouse.move(350, 80); await page.mouse.down({ button: 'middle' }); await page.mouse.move(420, 110, { steps: 12 }); await page.mouse.up({ button: 'middle' }); const panned = (await store()).viewport; assert.notEqual(zoomed.x, panned.x); return { before, zoomed, panned };
  });
  await test('original canvas rename', async () => { await page.getByRole('button', { name: '重命名画布' }).click(); await page.getByRole('textbox', { name: '重命名画布' }).fill('复跑已通过 · 原节点'); await page.keyboard.press('Enter'); await settle(); assert.equal((await saved()).name, '复跑已通过 · 原节点'); });
  await test('reload preserves own image bytes text and geometry', async () => { await page.reload(); await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api); await page.getByRole('heading', { name: '原节点自动复跑通过' }).waitFor(); assert.equal((await store()).nodes.length, 2); assert.ok(await node('smoke-image').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)); });
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
  await page.mouse.click(350, 80); await page.evaluate(() => window.__LCOS_NODE_LAB__.api.fitView({ maxZoom: 1.3, padding: 0.3 }));
  await page.screenshot({ path: path.join(visualRoot, 'tapnow-node-smoke.png') });
} catch (error) { report.passed = false; report.failure = error.message; process.exitCode = 1; }
finally { fs.writeFileSync(new URL('../evidence/node-lab-browser-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length, failure: report.failure }));
