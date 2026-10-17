import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv.find(value => value.startsWith('--base-url='))?.slice(11) ?? 'http://127.0.0.1:56238';
const currentFlow = process.argv.includes('--current-flow');
const output = currentFlow ? path.join(root, 'output/原生文本整合_20261017e/原History整页', new Date().toISOString().replace(/[:.]/g, '-'))
  : path.join(root, 'output/原流程施工_20261017b');
await fs.mkdir(path.join(output, 'screenshots'), { recursive: true });
const report = { passed: false, kind: 'actual current original History UI; reads and existing-carrier idempotent Apply',
  at: new Date().toISOString(), base, screenshots: [], historyReads: [], errors: [], blocked: [], checks: [], modelRequests: [], downloads: [] };
const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const health = await (await fetch(base + '/health')).json(); report.health = health;
assert.equal(health.realCoreConnected, true);
assert.equal(health.runtimeLabel, currentFlow ? 'isolated-native-flow-20261017c' : 'isolated-native-integration-20261017a');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block',
  ...(currentFlow ? { timezoneId: 'Asia/Shanghai' } : {}) });
await context.route('**/*', route => {
  const request = route.request(), address = new URL(request.url());
  if (!['data:', 'blob:'].includes(address.protocol) && address.origin !== base) {
    report.blocked.push({ method: request.method(), path: address.origin + address.pathname }); return route.abort();
  }
  if (request.method() === 'POST' && /\/(runs|dispatch|sync|recover|generations|checkout|payment)(?:\/|$)/.test(address.pathname)) {
    report.modelRequests.push(address.pathname); return route.abort();
  }
  // This script only exercises a carrier already present in Context. Any
  // unexpected placement write is recorded and stopped before the service.
  if (request.method() === 'POST' && address.pathname.endsWith('/materials:place')) {
    report.blocked.push({ method: request.method(), path: address.pathname, reason: 'existing-carrier-test' }); return route.abort();
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('download', download => { report.downloads.push(download.suggestedFilename()); void download.cancel(); });
page.on('response', response => { if (response.url().includes('/v1/me/generation-history')) report.historyReads.push({ path: new URL(response.url()).pathname + new URL(response.url()).search, status: response.status() }); });
const screenshot = async name => {
  // Keep the original spring animation enabled; capture its settled state.
  await page.waitForTimeout(650);
  const file = path.join(output, 'screenshots', name + '.png');
  await page.screenshot({ path: file }); report.screenshots.push(file);
};
const stable = locator => locator.evaluate(element => new Promise(resolve => {
  const wait = () => { let node = element, ready = true;
    while (node) { const style = getComputedStyle(node); if (Number(style.opacity) < .99 || style.visibility === 'hidden') ready = false; node = node.parentElement; }
    if (ready) resolve(true); else requestAnimationFrame(wait);
  }; wait();
}));
const settledTabIndicator = async locator => {
  await locator.evaluate(element => new Promise(resolve => {
    const wait = () => {
      const active = element.querySelector('[role="tab"][aria-selected="true"]');
      const indicator = [...element.children].find(child => child.getAttribute('role') !== 'tab');
      const left = Number.parseFloat(indicator?.style.left ?? '');
      if (active && indicator && Math.abs(left - active.offsetLeft) < 1) resolve(true);
      else requestAnimationFrame(wait);
    }; wait();
  }));
};
try {
  await page.goto(base + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.getByTestId('canvas-dockbar-history-btn').click();
  const panel = page.locator('[data-history-panel]'); await panel.waitFor(); await stable(panel);
  await panel.locator('[aria-label="阅读这个版本"]').first().waitFor({ state: 'attached', timeout: 20_000 });
  assert.equal(await panel.locator('[role="alert"]').count(), 0);
  report.panel = await panel.evaluate(element => ({ text: element.textContent, background: getComputedStyle(element).background,
    color: getComputedStyle(element).color, buttons: [...element.querySelectorAll('button')].map(button => ({ text: button.textContent, label: button.getAttribute('aria-label') })) }));
  await screenshot('history-01-real-sidebar');
  report.checks.push('original sidebar reads real Core rows without history load error');
  const textTab = panel.getByRole('tab', { name: /^(文本|文字|Text)$/ }); await textTab.click();
  await panel.locator('[aria-label="阅读这个版本"]:visible').first().waitFor();
  await settledTabIndicator(panel.getByRole('tablist'));
  await screenshot('history-02-text-records');
  const read = panel.locator('[aria-label="阅读这个版本"]:visible').first();
  await read.hover(); await read.click();
  const reading = page.locator('[data-lcos-native-text-reading]'); await reading.waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await page.locator('[data-lcos-window-body="reader"]').count(), 0);
  await page.waitForTimeout(800); await stable(reading);
  await screenshot('history-03-original-text-viewer');
  await reading.locator('.native-material-text-scroll').focus(); await page.keyboard.press('Control+f');
  await reading.getByRole('textbox', { name: '在文档中查找' }).waitFor({ state: 'visible' });
  report.checks.push('text History read opens actual original unified viewer; reader Ctrl+F stays within reader');
  for (let i = 0; i < 3 && await page.locator('[data-media-viewer]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  assert.equal(await page.locator('[data-media-viewer]').count(), 0);
  await panel.waitFor();
  report.checks.push('Escape returns from original viewer to retained original History');
  const search = panel.locator('input').first(); await search.fill('zz-no-synthetic-history-match');
  await page.waitForResponse(response => response.url().includes('search=zz-no-synthetic-history-match') && response.status() === 200);
  await page.waitForTimeout(200);
  assert.equal(await panel.locator('[aria-label="阅读这个版本"]:visible').count(), 0);
  await search.fill(''); await panel.locator('[aria-label="阅读这个版本"]:visible').first().waitFor();
  const expand = panel.getByRole('button', { name: /^(展开|Expand)$/ }); await expand.click();
  const dialog = page.getByRole('dialog').filter({ hasText: /历史|History/ }).last(); await dialog.waitFor(); await stable(dialog);
  if (currentFlow) {
    const scope = dialog.getByRole('tablist', { name: '历史范围' });
    assert.deepEqual(await scope.getByRole('tab').allTextContents(), ['整个项目', '当前现场']);
    report.scope = await scope.evaluate(element => ({ text: element.textContent, rect: element.getBoundingClientRect().toJSON() }));
  }
  const scopeRead = page.waitForResponse(response => response.url().includes('/v1/me/generation-history')
    && new URL(response.url()).searchParams.get('canvas_id') === 'surface-core-main' && response.status() === 200);
  await dialog.getByRole('tab', { name: /^(当前项目|当前现场|This project)$/ }).click(); await scopeRead;
  await page.waitForTimeout(300);
  await screenshot('history-04-original-expanded');
  report.checks.push('original search, expanded History and scope control call the real Workspace-filtered journal with accurate labels');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await panel.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByTestId('canvas-dockbar-add-node-btn').click();
  const create = page.locator('[data-add-node-menu]'); await create.waitFor(); await stable(create);
  report.create = await create.evaluate(element => ({ background: getComputedStyle(element).background, color: getComputedStyle(element).color,
    firstText: element.querySelector('[data-testid="canvas-dockbar-add-text-node-btn"]')?.textContent }));
  await screenshot('history-05-create-stable-light');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.getByTestId('canvas-dockbar-history-btn').click(); await panel.waitFor(); await stable(panel);
  await screenshot('history-06-narrow');
  report.checks.push('stable create paint and narrow History captured from actual unified runtime');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/canvas/surface-core-context', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60_000 });
  const unwrap = value => value.code === 0 ? value.data : value.value;
  const before = unwrap(await (await fetch(base + '/api/canvas/v1/canvases/surface-core-context')).json());
  const source = before.nodes.find(row => row.id === 'surface-context-text').data.lcos_ref;
  const history = unwrap(await (await fetch(base + '/api/conversation/v1/me/generation-history?generation_type=text&limit=200')).json());
  const entry = history.items.find(row => row.lcos_history.artifactId === source.artifactId && row.id === source.revisionId);
  assert.ok(entry?.lcos_history.placeable);
  await page.getByTestId('canvas-dockbar-history-btn').click(); await panel.waitFor();
  await panel.getByRole('tab', { name: /^(文本|文字|Text)$/ }).click();
  await panel.getByRole('button', { name: '列表视图', exact: true }).click();
  // The retained journal now exceeds one viewport. Use the original search,
  // rather than assuming this older exact fixture is already virtualized in.
  const exactSearch = page.waitForResponse(response => response.url().includes('/v1/me/generation-history')
    && new URL(response.url()).searchParams.get('search') === entry.prompt && response.status() === 200);
  await panel.locator('input').first().fill(entry.prompt); await exactSearch;
  const row = panel.locator('[role="button"]').filter({ hasText: entry.prompt }); await row.waitFor();
  await panel.getByRole('button', { name: '选择', exact: true }).click(); await row.click();
  const placedRead = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/materials:place')
    && new URL(response.url()).searchParams.get('revisionId') === entry.id);
  await panel.getByRole('button', { name: '应用到画布', exact: true }).click();
  const receipt = await (await placedRead).json(); assert.equal(receipt.code, 0); assert.equal(receipt.data.state, 'present');
  await page.getByText('已在当前画布确认 1 个准确版本。', { exact: true }).waitFor();
  const repeated = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/materials:place')
    && new URL(response.url()).searchParams.get('revisionId') === entry.id);
  await row.click(); assert.equal((await (await repeated).json()).data.state, 'present');
  const after = unwrap(await (await fetch(base + '/api/canvas/v1/canvases/surface-core-context')).json());
  assert.equal(after.nodes.length, before.nodes.length);
  assert.equal(after.nodes.filter(row => row.data?.lcos_ref?.artifactId === source.artifactId
    && row.data.lcos_ref.revisionId === source.revisionId).length, before.nodes.filter(row => row.data?.lcos_ref?.artifactId === source.artifactId
      && row.data.lcos_ref.revisionId === source.revisionId).length);
  await screenshot('history-07-idempotent-apply');
  report.checks.push('original selection Apply and ordinary click reuse exact existing Context carrier; no placement POST or extra node');
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.downloads.length, 0); assert.equal(report.modelRequests.length, 0);
  assert.ok(report.historyReads.length > 0); assert.ok(report.historyReads.every(row => row.status === 200));
  report.passed = true;
} catch (error) {
  report.failure = error.message; await screenshot('history-failure').catch(() => {});
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'history-live-browser-result.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, `history-live-browser-${health.pid}-${report.at.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); await context.close(); await browser.close();
}
