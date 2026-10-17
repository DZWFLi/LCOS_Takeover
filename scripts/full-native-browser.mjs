import assert from 'node:assert/strict';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:17881';
const inspect = process.argv.includes('--inspect') || process.argv.includes('--menu-inspect') || process.argv.includes('--upload') || process.argv.includes('--text-create');
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const report = { at: new Date().toISOString(), target: origin, nativeCanvas: true, realCore: true, fullScopeComplete: false,
  browser: 'installed playwright-core fallback; fresh Chrome context, no dependency install',
  cases: [], pageErrors: [], consoleErrors: [], remoteBlocked: [], apiFailures: [], uploadRequests: [], lifecycleRequests: [], lifecycleResponses: [], screenshots: [] };
const cleanText = value => String(value).replace(/https?:\/\/[^\s"'<>]+/g, value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return '[url]'; } }).slice(0, 700);
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.profile, 'original-tapnow-full-integration-in-progress');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  report.remoteBlocked.push(url.protocol + '//' + url.host + url.pathname); return route.abort('blockedbyclient');
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(cleanText(msg.text())); });
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
page.on('request', request => {
  const url = new URL(request.url());
  if (url.origin === origin && url.pathname.startsWith('/api/files/upload-urls')) report.uploadRequests.push({ method: request.method(), path: url.pathname,
    body: request.method() === 'POST' ? request.postDataJSON() : undefined });
  if (url.origin === origin && url.pathname.endsWith('/nodes:batchActions') && request.method() === 'POST') {
    const body = request.postDataJSON();
    report.lifecycleRequests.push({ canvasId: body.canvas_id, actions: body.actions, operation: body.lcos_operation, refs: body.lcos_refs });
  }
});
page.on('response', async response => {
  const url = new URL(response.url());
  if (url.origin !== origin) return;
  if (response.status() >= 400 && url.pathname.startsWith('/api/')) report.apiFailures.push({ path: url.pathname, status: response.status() });
  if (url.pathname.endsWith('/nodes:batchActions')) {
    let body; try { body = await response.json(); } catch { body = null; }
    report.lifecycleResponses.push({ status: response.status(), code: body?.error?.code, data: body?.data, error: body?.error });
  }
});
const read = async () => (await (await fetch(origin + '/api/canvas/v1/canvases/surface-core-main')).json()).data;
const node = id => page.locator('.react-flow__node[data-id="' + id + '"]');
let beforeDuplicate, duplicatedNode;
async function test(name, run) { const detail = await run(); report.cases.push({ name, passed: true, detail }); console.log('PASS ' + name); }
try {
  await page.goto(origin + '/canvas/surface-core-main');
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await test('actual page identity and original nonblank image/text nodes', async () => {
    const state = await read(); assert.ok(state.nodes.length >= 2); assert.equal(await page.locator('[data-lcos-surface-dock]').count(), 1);
    assert.equal(await page.locator('.react-flow').count(), 1);
    assert.ok(await node('surface-main-image').locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0));
    assert.ok((await node('surface-main-text').innerText()).includes('Main'));
    assert.deepEqual(report.pageErrors, []);
    return { title: await page.title(), url: page.url(), nativeNodes: await page.locator('.react-flow__node').count() };
  });
  report.visibleButtons = await page.getByRole('button').evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().width > 0).map(button => ({ label: button.getAttribute('aria-label'), title: button.getAttribute('title'), text: button.textContent?.trim().slice(0, 100) })));
  if (process.argv.includes('--menu-inspect')) {
    await page.mouse.click(1280, 720, { button: 'right' });
    report.canvasMenu = await page.getByRole('option').allTextContents();
    report.fileInputs = await page.locator('input[type=file]').evaluateAll(inputs => inputs.map(input => ({ accept: input.accept, multiple: input.multiple, className: input.className })));
    console.log(JSON.stringify({ canvasMenu: report.canvasMenu, fileInputs: report.fileInputs }, null, 2));
  }
  if (process.argv.includes('--upload')) {
    await test('original multi-file input uploads an image through actual Core and keeps its native carrier', async () => {
      const before = await read();
      await page.locator('input[type=file]').first().setInputFiles(path.join(visualRoot, 'node-upload-fixture.png'));
      const deadline = Date.now() + 20000;
      let after;
      do {
        after = await read();
        if (after.nodes.some(row => row.type === 'image' && !before.nodes.some(previous => previous.id === row.id))) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      const created = after.nodes.find(row => !before.nodes.some(previous => previous.id === row.id));
      assert.ok(created?.data.lcos_ref?.artifactId);
      assert.ok(created.data.src.includes('/api/surface-core/file-records/'));
      await node(created.id).locator('img').first().waitFor();
      assert.ok(await node(created.id).locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0));
      const fileContent = await fetch(created.data.src); assert.equal(fileContent.status, 200);
      await page.reload(); await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api);
      assert.equal((await read()).nodes.find(row => row.id === created.id).data.lcos_ref.artifactId, created.data.lcos_ref.artifactId);
      return { nativeId: created.id, artifactId: created.data.lcos_ref.artifactId, persistedAfterReload: true, providerExecuted: false };
    });
  }
  if (process.argv.includes('--text-create')) {
    await test('original Add menu creates a Core-bound editable text node', async () => {
      const before = await read();
      await page.getByTestId('canvas-dockbar-add-node-btn').click();
      report.addMenuOptions = await page.getByRole('option').allTextContents();
      await page.getByRole('option').filter({ hasText: '脚本、广告词、品牌文案' }).click({ timeout: 5000 });
      await page.waitForTimeout(1800);
      const after = await read();
      const created = after.nodes.find(row => row.type === 'text' && !before.nodes.some(previous => previous.id === row.id));
      assert.ok(created?.data.lcos_ref?.artifactId, JSON.stringify(report.lifecycleResponses.at(-1)));
      return { nativeId: created.id, ref: created.data.lcos_ref, body: created.data.text, providerExecuted: false };
    });
  }
  if (!inspect) {
    await test('original image duplicate commits an additional Core view', async () => {
      const before = await read();
      beforeDuplicate = before;
      await node('surface-main-image').click({ button: 'right', position: { x: 160, y: 100 }, timeout: 5000 });
      await page.getByRole('option', { name: '副本', exact: true }).click();
      await page.waitForFunction(count => window.__LCOS_NODE_LAB__.api.getNodes().length > count, before.nodes.length);
      await page.waitForTimeout(1800);
      const after = await read(); assert.equal(after.nodes.length, before.nodes.length + 1, JSON.stringify(report.lifecycleResponses.at(-1)));
      const created = after.nodes.find(row => !before.nodes.some(previous => previous.id === row.id));
      duplicatedNode = created;
      assert.equal(created.data.lcos_ref.artifactId, before.nodes.find(row => row.id === 'surface-main-image').data.lcos_ref.artifactId);
      assert.equal(created.data.lcos_ref.entityType, 'view');
      return { id: created.id, sameArtifact: created.data.lcos_ref.artifactId, viewId: created.data.lcos_ref.artifactViewId };
    });
    await test('original keyboard undo then redo reaches both real stores', async () => {
      await page.keyboard.press('Control+z'); await page.waitForTimeout(1800); assert.equal((await read()).nodes.length, beforeDuplicate.nodes.length);
      await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(1800);
      const after = await read(); assert.equal(after.nodes.length, beforeDuplicate.nodes.length + 1);
      const restored = after.nodes.find(row => row.data.lcos_ref?.artifactViewId === duplicatedNode.data.lcos_ref.artifactViewId);
      assert.ok(restored, 'Redo must restore the exact confirmed additional View, not the source Artifact or another View.');
      assert.ok(report.lifecycleRequests.some(request => request.operation?.phase === 'undo'));
      assert.ok(report.lifecycleRequests.some(request => request.operation?.phase === 'redo'));
      return { beforeNodes: beforeDuplicate.nodes.length, exactViewId: restored.data.lcos_ref.artifactViewId, restoredNativeId: restored.id };
    });
  }
  report.passed = report.pageErrors.length === 0 && report.lifecycleResponses.every(result => result.status < 400);
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  const mode = process.argv.includes('--text-create') ? 'text-create' : process.argv.includes('--upload') ? 'upload' : inspect ? 'inspect' : 'lifecycle';
  const screenshot = path.join(visualRoot, 'tapnow-full-native-' + mode + '.png');
  await page.screenshot({ path: screenshot }).then(() => report.screenshots.push(screenshot)).catch(() => {});
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  if (mode === 'lifecycle') {
    const prior = path.join(root, 'evidence/full-native-browser.json');
    const firstFailure = path.join(root, 'evidence/full-native-browser-first-receipt-failure.json');
    try {
      const previous = JSON.parse(await readFile(prior, 'utf8'));
      if (previous.passed === false) {
        try { await access(firstFailure); } catch { await copyFile(prior, firstFailure); }
      }
    } catch { /* First run has no prior evidence. */ }
  }
  await writeFile(path.join(root, 'evidence', mode === 'lifecycle' ? 'full-native-browser.json' : 'full-native-browser-' + mode + '.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, pageErrors: report.pageErrors.length,
  apiFailures: report.apiFailures, lastLifecycleResponse: report.lifecycleResponses.at(-1), failure: report.failure }, null, 2));
