import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const origin = new URL(process.argv.find(value => value.startsWith('--base-url='))?.slice(11) || 'http://127.0.0.1:56238').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', '原流程施工_20261017b', '原生聊天验证');
await fs.mkdir(output, { recursive: true });
const health = await (await fetch(origin + '/health')).json();
assert(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected, 'Only a confirmed disposable runtime may be changed by this test.');
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const report = { origin, runtimeLabel: health.runtimeLabel, pid: health.pid, browserPlugin: 'not available; existing Playwright used',
  viewport: { width: 1440, height: 1000 }, cases: [], pageErrors: [], consoleErrors: [], writes: [], screenshots: [], passed: false,
  providerExecution: false };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: report.viewport, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
  if (request.method() === 'POST') {
    report.writes.push(url.pathname);
    if (/collaboration-send|conversation-continuations|recovery-actions|agent\/gateway/.test(url.pathname)) return route.abort();
  }
  return route.continue();
});
await context.routeWebSocket(/.*/, socket => socket.close());
const page = await context.newPage(); page.setDefaultTimeout(12000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/Statsig|Failed to load resource/.test(message.text())) report.consoleErrors.push(message.text().slice(0, 1200)); });
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
const check = async (name, action) => { await action(); report.cases.push(name); console.log('PASS ' + name); };
try {
  await page.goto(origin + '/canvas/surface-core-main');
  await page.locator('[data-lcos-native-chat-frame] textarea').waitFor({ state: 'visible', timeout: 60000 });
  await check('one native right rail and one Composer; no old Agent management panel', async () => {
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).count(), 1);
    assert.equal(await page.locator('[data-lcos-native-chat-frame]').count(), 1);
    assert.equal(await page.locator('[data-lcos-connected-agent-panel]').count(), 0);
    assert.equal(await page.locator('#lcos-offline-fixture-badge').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-lcos-theme'), 'light');
    await shot('01-native-empty');
  });
  const draft = '原生联调草稿：保留想法与引用，尚未发送。';
  await check('native Composer attachment opens original Library and keeps draft', async () => {
    await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).fill(draft);
    await page.getByRole('button', { name: '从材料库添加', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue(), draft);
    assert.equal(await page.locator('[data-native-assembly-state]').count(), 0, 'No extra inspector displaces the native list.');
    assert.equal(await page.locator('[data-lcos-window-body="assembly"]').count(), 0);
    await shot('02-original-library');
  });
  await check('unsupported task image is refused; a supported exact text reference keeps the same input', async () => {
    await page.getByRole('textbox', { name: '搜索', exact: true }).fill('本地合成图');
    await page.getByRole('button', { name: '本地合成图.png', exact: true }).first().click();
    const reference = page.getByRole('button', { name: '加入本次引用', exact: true });
    await reference.waitFor();
    await reference.click();
    await page.getByRole('status').filter({ hasText: '当前任务暂不能读取图片' }).waitFor();
    assert.equal(await page.locator('[data-lcos-composer-ref]').count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue(), draft);
    await page.getByRole('textbox', { name: '搜索', exact: true }).fill('Brief');
    await page.getByRole('button', { name: 'Brief', exact: true }).first().click();
    await page.getByRole('button', { name: '加入本次引用', exact: true }).click();
    await page.locator('[data-lcos-composer-ref]').first().waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue(), draft);
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).count(), 1);
    assert.equal(await page.locator('[data-lcos-composer-ref]').count(), 1);
    await shot('03-reference-native');
  });
  await check('original native side rail resize retains one input and draft', async () => {
    const frame = page.locator('[data-lcos-native-chat-frame]'); const before = await frame.boundingBox();
    const handle = frame.locator('.cursor-col-resize').first(); const rect = await handle.boundingBox(); assert(rect && before);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 120); await page.mouse.down();
    await page.mouse.move(rect.x - 100, rect.y + 120, { steps: 10 }); await page.mouse.up();
    const after = await frame.boundingBox(); assert(after.width > before.width + 50);
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue(), draft);
    await shot('04-native-resize');
  });
  await check('canonical manual conversation renders in original U5, no fake feedback actions', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.native-chat-conversations summary').click();
    await page.getByRole('menuitem', { name: '原生右栏验证 · 人工历史', exact: true }).click();
    await page.getByRole('heading', { name: '提纲', exact: true }).waitFor();
    assert(await page.getByRole('log').innerText().then(value => value.includes('未运行模型')));
    assert.equal(await page.getByRole('button', { name: '好评', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '差评', exact: true }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).count(), 1);
    await shot('05-original-messages');
  });
  await check('exact image may be attached to an existing conversation without a model send', async () => {
    await page.getByRole('textbox', { name: '搜索', exact: true }).fill('本地合成图');
    await page.getByRole('button', { name: '本地合成图.png', exact: true }).first().click();
    await page.getByRole('button', { name: '加入本次引用', exact: true }).click();
    await page.locator('[data-lcos-composer-ref]').filter({ hasText: '本地合成图' }).waitFor();
    await shot('05b-image-reference');
  });
  await check('900px desktop viewport keeps native rail, input and actions in bounds', async () => {
    await page.setViewportSize({ width: 900, height: 760 });
    const editor = await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).boundingBox();
    assert(editor && editor.x >= 0 && editor.x + editor.width <= 901 && editor.y + editor.height <= 760);
    await shot('06-compact');
  });
  assert.equal(report.pageErrors.length, 0); assert.equal(report.consoleErrors.length, 0);
  assert(!report.writes.some(value => /collaboration-send|conversation-continuations|recovery-actions|agent\/gateway/.test(value)));
  report.passed = true;
} catch (error) {
  report.failure = error.stack; console.error(error.message);
  try { await shot('failure'); await fs.writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify({ passed: report.passed, cases: report.cases, failure: report.failure?.split('\n')[0], report: path.join(output, 'report.json') }));
}
