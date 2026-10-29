import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), origin = 'http://127.0.0.1:56239';
const canvasId = 'surface-core-main', nodeId = 'text-a34ae67c-c735-4b2f-9d1a-e6b5caff5cb9';
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.pid, 44908); assert.equal(health.runtimeLabel, 'isolated-native-flow-20261017c');
const output = path.join(root, 'output/原生文本整合_20261017e/整页只读原菜单', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, at: new Date().toISOString(), pid: health.pid, runtimeLabel: health.runtimeLabel, canvasId, nodeId,
  scope: 'existing synthetic Text; real original selection/menu/viewport only; no mode/body/geometry/Core write', blockedWrites: [], externalBlocked: [], errors: [], measurements: [], screenshots: [] };
const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { report.blockedWrites.push({ method: request.method(), path: url.pathname }); return route.abort(); }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
const shot = async name => { const file = path.join(output, name); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
const snapshot = () => page.evaluate(id => {
  const owner = window.__LCOS_NODE_LAB__, node = owner.api.getNodes().find(row => row.id === id);
  return { canvasId: owner.currentCanvasId ?? owner.canvasId, node: { id: node.id, type: node.type, position: node.position, width: node.width, height: node.height,
    data: node.data }, viewport: owner.api.getViewport() };
}, nodeId);
try {
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__?.api?.getNodes().some(node => node.id === nodeId)
    && (window.__LCOS_NODE_LAB__.currentCanvasId ?? window.__LCOS_NODE_LAB__.canvasId) === canvasId, { canvasId, nodeId });
  report.before = await snapshot();
  const node = page.locator('.react-flow__node[data-id="' + nodeId + '"]');
  await node.waitFor({ state: 'visible' });
  await node.locator('[data-native-first-state="ready"]').waitFor({ state: 'visible' });
  await shot('00-进入原节点.png');
  await node.click({ position: { x: 70, y: 12 } });
  const more = page.getByTestId('lcos-native-text-view-menu').getByRole('button');
  await more.waitFor({ state: 'visible' });
  await more.click();
  await page.getByRole('menuitem', { name: '正文', exact: true }).waitFor();
  const initialMode = await node.locator('[data-native-first-mode]').getAttribute('data-native-first-mode');
  assert.equal(await page.getByRole('menuitem', { name: initialMode === 'mindmap' ? '导图' : '正文', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('menuitem', { name: '编辑导图', exact: true }).count(), initialMode === 'mindmap' ? 1 : 0);
  await page.waitForTimeout(300);
  await shot('01-原选区唯一动作带与more.png');
  report.menu = await page.getByRole('menuitem').allTextContents();
  report.menuStyle = await page.getByRole('menuitem').evaluateAll(items => items.map(item => ({ text: item.textContent, color: getComputedStyle(item).color,
    opacity: getComputedStyle(item).opacity, disabled: item.getAttribute('data-disabled'), rect: item.getBoundingClientRect().toJSON() })));
  await page.keyboard.press('Escape');
  report.focusAfterEscape = await page.evaluate(() => ({ tag: document.activeElement?.tagName, testid: document.activeElement?.getAttribute('data-testid'),
    withinTrigger: !!document.activeElement?.closest('[data-testid="lcos-native-text-view-menu"]') }));
  report.escapeSelection = await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getSelection?.());
  await node.click({ position: { x: 70, y: 12 } });
  const collapseChat = page.getByRole('button', { name: '收起对话', exact: true });
  await collapseChat.click(); await page.waitForTimeout(300);
  report.narrowPreparation = 'User clicked the existing original 收起对话 button, then original Control+wheel and middle-button pan; no hidden/forced click or API camera/layout mutation.';
  for (const width of [1440, 680, 360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    // Explicit original user camera preparation only; never call setViewport,
    // updateNode, resize or fitView from a fixture API.
    if (width === 680) {
      await page.mouse.move(width / 2, 700); await page.keyboard.down('Control'); await page.mouse.wheel(0, 350); await page.keyboard.up('Control');
      await page.waitForTimeout(200);
    }
    const bounds = await node.boundingBox();
    const delta = { x: width / 2 - (bounds.x + bounds.width / 2), y: 450 - (bounds.y + bounds.height / 2) };
    await page.mouse.move(width / 2, 750); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(width / 2 + delta.x, 750 + delta.y, { steps: 10 }); await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(100);
    await node.click({ position: { x: 30, y: 12 } });
    const measurement = await page.evaluate(id => {
      const node = document.querySelector('.react-flow__node[data-id="' + id + '"]'), toolbar = node?.querySelector('[data-testid="canvas-node-toolbar"]')
        ?? [...document.querySelectorAll('[data-testid="canvas-node-toolbar"]')].find(e => e.querySelector('[data-testid="lcos-native-text-view-menu"]'));
      const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { viewportWidth: innerWidth, node: rect(node), toolbar: rect(toolbar), toolbarCount: document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length,
        secondToolbar: document.querySelectorAll('.native-first-toolbar').length, moreCount: document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length,
        groups: toolbar?.querySelectorAll(':scope > ul').length, buttons: toolbar ? [...toolbar.querySelectorAll('button')].map(e => ({ text: e.textContent, aria: e.getAttribute('aria-label'), testid: e.getAttribute('data-testid'), disabled: e.disabled })) : [],
        top: toolbar?.style.top, transform: toolbar && getComputedStyle(toolbar).transform,
        floatScale: toolbar && getComputedStyle(toolbar).getPropertyValue('--float-scale'), zoom: window.__LCOS_NODE_LAB__.api.getViewport().zoom };
    }, nodeId);
    report.measurements.push(measurement); await shot('宽' + width + '-原动作带.png');
    assert.equal(measurement.toolbarCount, 1); assert.equal(measurement.secondToolbar, 0); assert.equal(measurement.moreCount, 1);
    await more.click(); await page.getByRole('menuitem', { name: '正文', exact: true }).waitFor(); await page.waitForTimeout(180);
    measurement.menu = await page.getByRole('menu').evaluate(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width,
      right: element.getBoundingClientRect().right, items: [...element.querySelectorAll('[role="menuitem"]')].map(item => item.textContent) }));
    assert.ok(measurement.menu.x >= 0 && measurement.menu.right <= width + 1, 'original Radix menu remains reachable in viewport ' + width);
    await shot('宽' + width + '-原更多菜单.png'); await more.click();
  }
  report.after = await snapshot();
  report.sameNodeBeforeAfter = JSON.stringify(report.after.node) === JSON.stringify(report.before.node);
  report.concurrentWriterBoundary = 'Parent-authorized sibling Tiptap test may edit the same synthetic node; this browser aborts every non-GET, so no immutable-body claim while sibling owns writing.';
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = String(error.stack ?? error); try { await shot('失败现场.png'); } catch {} }
finally { await context.close(); await browser.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, failure: report.failure, output, measurements: report.measurements, blockedWrites: report.blockedWrites, errors: report.errors }, null, 2));
if (!report.passed) process.exitCode = 1;
