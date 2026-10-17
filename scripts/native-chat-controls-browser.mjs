import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const address = new URL(process.argv.find(value => value.startsWith('--base-url='))?.slice(11));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.pathname, '/');
const origin = address.origin, health = await (await fetch(origin + '/health')).json();
assert.ok(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected && health.nativeRailPilot);
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output/原流程融合_20261017c/原会话菜单实测');
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), origin, pid: health.pid, runtimeLabel: health.runtimeLabel,
  fixtureWrites: [], fixtureIntents: [], requests: [], blockedWrites: [], externalBlocked: [], pageErrors: [], checks: [], screenshots: [],
  modelExecuted: false, passed: false };
let browser, page;
const get = async route => {
  const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store' }); assert.equal(response.status, 200, route);
  const body = await response.json(); if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const post = async (route, body, expectedStatus) => {
  report.fixtureIntents.push({ at: new Date().toISOString(), route, body, responseConfirmed: false });
  await writeFile(path.join(output, 'fixture-intents.json'), JSON.stringify(report.fixtureIntents, null, 2));
  const response = await fetch(origin + route, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json(); assert.equal(response.status, expectedStatus, JSON.stringify(value)); assert.equal(value.ok, true);
  report.fixtureIntents.at(-1).responseConfirmed = true;
  await writeFile(path.join(output, 'fixture-intents.json'), JSON.stringify(report.fixtureIntents, null, 2));
  report.fixtureWrites.push({ route, result: value.value });
  await writeFile(path.join(output, 'fixture-receipts.json'), JSON.stringify(report.fixtureWrites, null, 2));
  return value.value;
};
try {
  const mapping = await get('/api/lcos/translation'), projectId = mapping.projectId;
  const prefix = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`;
  const workspaces = await get(prefix + '/workspaces');
  const sites = workspaces.filter(site => site.projectId === projectId && site.preferredSurface === 'main' && site.canvasId);
  assert.equal(sites.length, 1); const workspace = sites[0];
  const marker = 'synthetic-native-chat-controls-20261017c', label = '人工原生菜单验证 · 未执行模型';
  const [connected, sessions] = await Promise.all([get(prefix + '/connected-conversations'), get(prefix + '/conversations')]);
  const matches = connected.filter(row => row.conversationRef === marker), imported = sessions.filter(row => row.title === label);
  let conversation;
  if (matches.length === 1 && imported.length === 1 && matches[0].conversationSessionId === imported[0].id) conversation = matches[0];
  else if (matches.length || imported.length) throw new Error('Synthetic conversation has a partial receipt; no producer is replayed.');
  else {
    assert.ok(process.argv.includes('--prepare-synthetic-history'), 'Missing fixture; explicitly prepare official manual import/link with --prepare-synthetic-history.');
    conversation = await post(prefix + '/connected-conversations', { action: 'connect', provider: 'codex', executorId: 'synthetic-native-menu-fixture', conversationRef: marker, label }, 201);
    const manual = await post(prefix + '/conversations/import-manual', { title: label, scopeId: workspace.scopeId,
      entries: [{ role: 'user', contentText: '人工手工历史：检查原标题、原菜单和真实返回；没有发送模型。' },
        { role: 'assistant', contentText: '## 原菜单回程验证\n这是人工导入的完整回复，不是模型刚刚生成的内容。' }] }, 201);
    const linked = await post(prefix + '/connected-conversations/' + encodeURIComponent(conversation.id) + '/link-session', { conversationSessionId: manual.session.id }, 200);
    conversation = linked.connectedConversation;
  }
  assert.equal(conversation.isRunning, false); assert.equal(conversation.label, label);
  const timelineBefore = await get(prefix + '/connected-conversations/' + encodeURIComponent(conversation.id) + '/collaboration-timeline?limit=100');
  assert.ok(JSON.stringify(timelineBefore).includes('这是人工导入的完整回复'));
  report.conversationId = conversation.id;
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.startsWith('/api/')) report.requests.push({ method: request.method(), path: url.pathname });
    if (request.method() !== 'GET' && /collaboration-send|conversation-continuations|recovery-actions|\/runs(?:\/|$)|agent\/gateway|link-session|conversations\/import-manual/.test(url.pathname)) {
      report.blockedWrites.push(url.pathname); return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', error => report.pageErrors.push(error.message));
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  const stableMenu = async () => {
    await page.waitForFunction(() => {
      const menu = [...document.querySelectorAll('[data-lcos-native-chat-history]')].find(element => element.getClientRects().length > 0);
      return menu && Number(getComputedStyle(menu).opacity) >= .99 && menu.getAnimations({ subtree: true })
        .every(animation => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity);
    });
  };
  await page.goto(origin + '/canvas/' + encodeURIComponent(workspace.canvasId), { waitUntil: 'domcontentloaded' });
  const editor = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await editor.waitFor({ state: 'visible' });
  const draft = '原菜单与任务切换验证草稿，未发送。'; await editor.fill(draft);
  const header = page.locator('[data-lcos-native-chat-header]'); await header.waitFor();
  assert.equal(await page.locator('.native-chat-header, .native-chat-conversations, .native-chat-more').count(), 0);
  const api = await page.evaluateHandle(() => window.__LCOS_NODE_LAB__.api);
  const before = await page.evaluate(() => ({ document: performance.timeOrigin, viewport: window.__LCOS_NODE_LAB__.api.getViewport() }));
  const title = header.getByRole('button', { name: '选择对话', exact: true }); await title.click();
  const menu = page.locator('[data-lcos-native-chat-history]:visible'); await menu.waitFor();
  await menu.getByText(label, { exact: true }).click();
  await page.getByRole('heading', { name: '原菜单回程验证', exact: true }).waitFor();
  assert.equal(await editor.inputValue(), draft);
  assert.equal(await page.getByRole('button', { name: /^(rename|delete) conversation$/ }).count(), 0);
  report.checks.push('original wM title → original Rp native menu → exact Core manual timeline in one U5, input draft retained');
  await shot('01-native-title-history');
  await title.click(); await menu.waitFor(); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
  assert.equal(await title.evaluate(element => element === document.activeElement), true, 'Original menu restores focus to its original title trigger.');
  assert.equal(await editor.inputValue(), draft); assert.equal(await page.locator('[data-lcos-native-chat-frame]').count(), 1);
  const labels = await header.locator('button[aria-label]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  const historyLabels = labels.filter(label => !['选择对话', '查看任务', '收起对话'].includes(label)); assert.equal(historyLabels.length, 1);
  await header.getByRole('button', { name: historyLabels[0], exact: true }).click(); await menu.waitFor();
  await stableMenu();
  report.menuStyle = await menu.evaluate(element => ({ opacity: getComputedStyle(element).opacity, color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor, firstItemColor: getComputedStyle(element.querySelector('[role="menuitem"]')).color }));
  await shot('02-original-history-menu');
  const reads = report.requests.filter(row => row.path.endsWith('/connected-conversations')).length;
  await menu.getByRole('menuitem', { name: '重新读取对话', exact: true }).click(); await menu.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('[data-lcos-native-chat-title]')?.textContent.includes('人工原生菜单验证'));
  assert.ok(report.requests.filter(row => row.path.endsWith('/connected-conversations')).length > reads);
  report.checks.push('both original title/history triggers and native Escape/focus work; refresh actually rereads Core');
  await title.click(); await menu.waitFor(); await menu.getByText('新建对话…', { exact: true }).click();
  const options = page.locator('[data-lcos-conversation-continuation]'); await options.waitFor();
  await options.locator('[aria-expanded="true"]').waitFor();
  assert.equal(report.blockedWrites.length, 0, 'Opening the existing new-session options is navigation only, not a fake completed session.');
  await shot('03-existing-new-session-flow');
  report.checks.push('native new-chat action navigates to existing real continuation choices without submitting or claiming a new session');
  await page.getByRole('button', { name: '查看任务', exact: true }).click();
  const list = page.locator('[data-lcos-native-task-list-view]'); await list.waitFor();
  await list.locator('[data-lcos-native-run-list-item]').first().waitFor();
  assert.equal(await list.locator('button[data-lcos-button-appearance="oreo"]').count(), 0);
  assert.equal(await list.evaluate(element => /已绑定执行端|正在派发|派发失败/.test(element.textContent)), false);
  report.taskListStyle = await list.locator('h3').evaluate(element => {
    const color = getComputedStyle(element).color, canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1);
    context.fillStyle = color; context.fillRect(0, 0, 1, 1);
    return { color, composedOnWhite: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3), title: element.textContent };
  });
  assert.ok(report.taskListStyle.composedOnWhite.some(channel => channel < 180), 'Native task heading must not retain donor white-on-light template paint.');
  await shot('04-native-task-list');
  await list.getByRole('button', { name: '任务操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '重新读取任务', exact: true }).click();
  await page.getByRole('button', { name: '返回对话', exact: true }).click(); await editor.waitFor(); assert.equal(await editor.inputValue(), draft);
  await shot('05-native-task-list-return');
  report.checks.push('original Ep controlled task rows and UT menu retain real Core list/reload; original xM returns to same conversation/input');
  assert.equal(await page.evaluate(handle => handle === window.__LCOS_NODE_LAB__.api, api), true);
  assert.deepEqual(await page.evaluate(() => ({ document: performance.timeOrigin, viewport: window.__LCOS_NODE_LAB__.api.getViewport() })), before);
  assert.deepEqual(await get(prefix + '/connected-conversations/' + encodeURIComponent(conversation.id) + '/collaboration-timeline?limit=100'), timelineBefore);
  assert.deepEqual(report.blockedWrites, []); assert.deepEqual(report.pageErrors, []);
  assert.ok(!report.requests.some(row => row.path.includes('conversations') && !row.path.startsWith('/api/lcos/core/')), 'No donor cloud conversation listing is reactivated.');
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  try { await page?.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
} finally {
  await browser?.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, output, checks: report.checks, failure: report.failure }, null, 2));
}
