import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const origin = new URL(process.argv.find(arg => arg.startsWith('--base-url='))?.slice(11) ?? 'http://127.0.0.1:56251').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, process.argv.find(arg => arg.startsWith('--output-root='))?.slice(14) ?? 'output/playwright/shell-narrow-20261020'); await fs.mkdir(output, { recursive: true });
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const report = { origin, runtimeLabel: health.runtimeLabel, pid: health.pid, passed: false, checks: [], geometry: [], pageErrors: [], businessWrites: [], suggestions: [], screenshots: [] };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (/dynamic.*suggest|suggest.*dynamic/i.test(url.pathname)) report.suggestions.push(url.pathname);
    if (request.method() !== 'GET' && /collaboration-send|conversation-continuations|recovery-actions|runs(?:\/|$)|agent\/gateway/.test(url.pathname)) {
      report.businessWrites.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', error => report.pageErrors.push(error.message));
  const frame = page.locator('[data-lcos-native-chat-frame]'), editor = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  const geometry = async label => {
    const value = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, bodyWidth: document.documentElement.scrollWidth,
      canvas: document.querySelector('.react-flow').getBoundingClientRect().toJSON(), chat: document.querySelector('[data-lcos-native-chat-frame]').getBoundingClientRect().toJSON() }));
    report.geometry.push({ label, ...value }); return value;
  };
  const settled = async () => page.waitForFunction(() => {
    const e = document.querySelector('[data-lcos-native-chat-frame]');
    return e && Math.abs(e.getBoundingClientRect().right - innerWidth) < .5 && Number(getComputedStyle(e).opacity) > .99;
  });
  await page.goto(origin + '/canvas/surface-core-main');
  await page.locator('[data-pile-gallery-chrome="bottom-right"] button').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__LCOS_NODE_LAB__?.api?.getNodes().length > 0);
  assert.equal(await frame.getAttribute('aria-hidden'), 'true');
  let measured = await geometry('360-default'); assert.equal(measured.canvas.width, 360); assert.ok(measured.bodyWidth <= 360);
  assert.equal(await page.getByText('社区', { exact: true }).count(), 0);
  assert.equal(await page.locator('[data-pile-gallery-chrome="bottom-right"] button').count(), 1);
  report.checks.push('360px fresh page defaults to a full-width canvas with one original assistant opener'); await shot('01-360-default');
  await page.locator('[data-pile-gallery-chrome="bottom-right"] button').click(); await editor.waitFor({ state: 'visible' }); await settled();
  measured = await geometry('360-assistant-open'); assert.equal(measured.canvas.width, 360); assert.equal(measured.chat.width, 360); assert.equal(measured.chat.y, 400); assert.equal(measured.chat.height, 400);
  assert.equal(await editor.count(), 1); assert.equal(await page.getByText('想一起完成什么？', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '聊天记录', exact: true }).count(), 0);
  await editor.fill('半屏草稿，未发送。'); await shot('02-360-assistant');
  await page.getByRole('button', { name: '选择对话', exact: true }).click();
  await page.locator('[data-lcos-native-chat-history]:visible').waitFor();
  assert.equal(await page.locator('[data-lcos-native-chat-history]:visible').count(), 1);
  await page.keyboard.press('Escape'); await page.locator('[data-lcos-native-chat-history]:visible').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '查看任务', exact: true }).click(); await page.locator('[data-lcos-native-task-list-view]').waitFor();
  await page.getByRole('button', { name: '返回对话', exact: true }).click(); await editor.waitFor();
  assert.equal(await editor.inputValue(), '半屏草稿，未发送。');
  report.checks.push('360px original title history and task/back actions work with one Composer and retained draft');
  const previousZoom = await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getViewport().zoom);
  await page.mouse.move(290, 180); await page.keyboard.down('Control');
  try { await page.mouse.wheel(0, -120); } finally { await page.keyboard.up('Control'); }
  await page.waitForFunction(zoom => window.__LCOS_NODE_LAB__.api.getViewport().zoom !== zoom, previousZoom);
  report.checks.push('original Control+wheel zoom works on the visible upper canvas while assistant is open');
  await page.getByRole('button', { name: '收起对话', exact: true }).click();
  await page.locator('[data-pile-gallery-chrome="bottom-right"] button').waitFor();
  assert.equal(await frame.getAttribute('aria-hidden'), 'true'); await shot('03-360-collapsed');
  await page.locator('[data-pile-gallery-chrome="bottom-right"] button').click(); await editor.waitFor(); await settled();
  assert.equal(await editor.inputValue(), '半屏草稿，未发送。'); report.checks.push('original collapse/reopen keeps the same input draft');
  await page.setViewportSize({ width: 1440, height: 900 }); await settled();
  measured = await geometry('1440-open'); assert.ok(measured.chat.width >= 300 && measured.chat.width < 800); assert.ok(measured.canvas.width >= 640);
  const handle = frame.locator('.cursor-col-resize').first(), box = await handle.boundingBox(); assert.ok(box);
  const beforeWidth = measured.chat.width; await page.mouse.move(box.x + 1, box.y + 160); await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + 160, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(before => document.querySelector('[data-lcos-native-chat-frame]').getBoundingClientRect().width > before + 50, beforeWidth);
  assert.equal(await editor.inputValue(), '半屏草稿，未发送。'); await shot('04-1440-original-resize');
  report.checks.push('desktop retains original side resize and one input');
  await page.setViewportSize({ width: 360, height: 800 }); await settled(); measured = await geometry('360-after-desktop-resize');
  assert.equal(measured.canvas.width, 360); assert.equal(measured.chat.height, 400); await shot('05-360-return');
  await page.reload(); await page.locator('[data-pile-gallery-chrome="bottom-right"] button').waitFor();
  assert.equal(await frame.getAttribute('aria-hidden'), 'true'); measured = await geometry('360-reload'); assert.equal(measured.canvas.width, 360);
  report.checks.push('360px reload defaults to canvas even after a wide sidebar was saved');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.businessWrites, []); assert.deepEqual(report.suggestions, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify(report)); }
