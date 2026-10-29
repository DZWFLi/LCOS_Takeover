import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:17881';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const report = { at: new Date().toISOString(), browserPlugin: 'Browser plugin not available',
  flow: 'existing Workflow Glyth → existing Conversation Work View → existing Assembly material bay',
  viewport: { width: 1440, height: 1000 }, providerExecutionAllowed: false, writesAllowed: false,
  cases: [], pageErrors: [], consoleErrors: [], apiFailures: [], blocked: [], screenshots: [], passed: false };
let browser;
let page;
let failed;
try {
  const health = await (await fetch(origin + '/health')).json();
  assert.equal(health.realCoreConnected, true);
  assert.equal(health.profile, 'original-tapnow-full-integration-in-progress');
  report.runtime = { pid: health.pid, profile: health.profile };
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
  const context = await browser.newContext({ viewport: report.viewport, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.origin !== origin || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      report.blocked.push({ origin: url.origin, path: url.pathname, method: request.method() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => socket.close({ code: 1008, reason: 'offline proof' }));
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().replace(/https?:\/\/[^\s"'<>]+/g, raw => {
    try { const url = new URL(raw); url.search = url.search ? '?[redacted]' : ''; return url.href; } catch { return '[address]'; }
  }).slice(0, 1600)); });
  page.on('response', response => { if (response.status() >= 400) report.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  await page.goto(origin + '/canvas/surface-core-workflow', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 30000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached' });
  const panelClose = page.getByRole('button', { name: '关闭 Agent 面板', exact: true });
  if (await panelClose.isVisible()) await panelClose.click();
  const glyth = page.locator('[data-lcos-node-kind="conversation"] button[aria-haspopup="dialog"]').first();
  await glyth.waitFor({ state: 'visible' });
  await glyth.click();
  await page.locator('[data-lcos-conversation-work-view]').waitFor({ state: 'visible' });
  report.cases.push('original Glyth opens existing full Conversation Work View');
  await page.getByRole('button', { name: '打开 Assembly', exact: true }).click();
  await page.locator('[data-lcos-assembly]').waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await page.locator('.react-flow').count(), 1);
  report.identity = { url: page.url(), title: await page.title(), singleCanvas: true };
  await page.locator('[data-lcos-assembly-item-kind="artifact"]').first().waitFor({ state: 'visible' });
  report.dom = (await page.locator('[data-lcos-assembly]').innerText()).slice(0, 8000);
  assert.doesNotMatch(report.dom, /材料读取失败/);
  report.cases.push('existing Assembly renders meaningful material bay without a second Canvas');
  const imageCard = page.locator('[data-lcos-assembly-item-kind="artifact"][data-lcos-assembly-visual-family="image"]').first();
  await imageCard.waitFor({ state: 'visible' });
  await imageCard.hover();
  await imageCard.getByRole('button', { name: /^预览 / }).click();
  const preview = page.locator('[data-lcos-assembly-preview]');
  await preview.waitFor({ state: 'visible' });
  await preview.locator('img').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-lcos-assembly-preview] img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  report.preview = await preview.evaluate(element => ({ text: element.innerText,
    images: [...element.querySelectorAll('img')].map(image => ({ width: image.naturalWidth, height: image.naturalHeight, blobUrl: image.src.startsWith('blob:') })) }));
  assert.ok(report.preview.images.some(image => image.width > 0 && image.blobUrl));
  report.cases.push('original Assembly explicit image preview renders actual Core FileRecord bytes');
  await mkdir(visualRoot, { recursive: true });
  const screenshot = path.join(visualRoot, 'tapnow-native-assembly-material-bay.png');
  await page.screenshot({ path: screenshot, fullPage: false }); report.screenshots.push(screenshot);
  assert.equal(report.pageErrors.length, 0);
  assert.ok(!report.consoleErrors.some(message => /useNavigate\(\)|React Router caught/.test(message)), 'Router render errors must not be mistaken for zero page errors');
  assert.ok(!report.apiFailures.some(failure => /\/(?:assets|canvas\/assets)\//.test(failure.path)), 'mature UI assets must load without native asset URL failures');
  report.passed = true;
} catch (error) {
  failed = error;
  report.failure = error.stack;
  if (page) {
    report.failureDom = (await page.locator('body').innerText().catch(() => '')).slice(0, 8000);
    await mkdir(visualRoot, { recursive: true });
    const screenshot = path.join(visualRoot, 'tapnow-native-assembly-failure.png');
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {}); report.screenshots.push(screenshot);
  }
} finally {
  await browser?.close();
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  await writeFile(path.join(root, 'evidence/native-assembly-browser.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, failure: report.failure?.split('\n')[0] }));
if (failed) process.exitCode = 1;
