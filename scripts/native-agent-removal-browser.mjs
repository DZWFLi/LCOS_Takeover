import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(process.argv.includes('--execute-real-ui'));
const origin = 'http://127.0.0.1:56311', canvasId = 'surface-core-main', projectId = 'disposable-surface-core-facade', prefix = '/api/lcos/core/projects/' + projectId;
const source = JSON.parse(await fs.readFile(option('created-report'), 'utf8')); assert.equal(source.passed, true);
const conversationId = source.conversationId, nodeId = source.node.id;
const get = async route => { const response = await fetch(origin + route, { signal: AbortSignal.timeout(20000) }); assert.ok(response.ok); const body = await response.json(); return body.value ?? body.data ?? body; };
const output = path.resolve('output/智能体创建历史_20261023/已有消息原页面', new Date().toISOString().replaceAll(':', '-')); await fs.mkdir(output, { recursive: true });
const report = { passed: false, output, conversationId, nodeId, stages: [], writes: [], errors: [], screenshots: [], modelSends: 0 };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); report.pid = health.pid;
const beforeCanvas = await get('/api/canvas/v1/canvases/' + canvasId), beforeNode = beforeCanvas.nodes.find(node => node.id === nodeId);
assert.equal(beforeNode.data.lcos_conversation_ref.connectedConversationId, conversationId);
const beforeConnected = await get(prefix + '/connected-conversations'), beforeSessions = await get(prefix + '/conversations');
const conversation = beforeConnected.find(row => row.id === conversationId), session = beforeSessions.find(row => row.id === conversation.conversationSessionId);
const allMessages = new Map(await Promise.all(beforeConnected.filter(row => row.conversationSessionId).map(async row => [row.conversationSessionId, await get(prefix + '/conversations/' + row.conversationSessionId + '/messages?limit=1000')])));
assert.equal(allMessages.get(session.id).length, Number(option('expected-messages'))); assert.ok(allMessages.get(session.id).length > 0);
report.nativeId = session.originMeta.continuationExternalSessionId; report.beforeMessageCount = allMessages.get(session.id).length;
let browser, page, stage = 'opening';
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); if (url.origin !== origin) return route.abort();
    if (!['GET','HEAD','OPTIONS'].includes(request.method())) {
      const body = request.postDataJSON(), row = { path: url.pathname, stage, body, permitted: false }; report.writes.push(row);
      if (url.pathname === '/api/events' || url.pathname.endsWith('/execution:reconcile')) row.permitted = true;
      if (url.pathname.endsWith('/nodes:batchActions')) {
        const canvas = await get('/api/canvas/v1/canvases/' + canvasId);
        if (!body.lcos_operation) row.permitted = body.canvas_id === canvasId && body.actions?.every(action => action.action === 'update'
          && action.updates?.every(update => { const original = canvas.nodes.find(node => node.id === update.id); return original && equal(original.position, update.position) && equal(original.data, update.data); }));
        else {
          assert.ok(['apply','undo','redo'].includes(stage)); assert.equal(body.lcos_operation.kind, 'delete'); assert.equal(body.lcos_operation.phase, stage);
          assert.equal(body.canvas_id, canvasId); assert.equal(body.actions.length, 1);
          if (stage === 'undo') { const node = body.actions[0].creates[0]; assert.equal(body.actions[0].creates.length, 1); assert.equal(node.id, nodeId);
            assert.deepEqual(node.position, beforeNode.position); assert.deepEqual(node.data.lcos_conversation_ref, beforeNode.data.lcos_conversation_ref); }
          else assert.deepEqual(body.actions[0].delete_ids, [nodeId]); row.permitted = true;
        }
      }
      if (url.pathname.endsWith('/collaboration-send')) report.modelSends++;
      await save(); if (!row.permitted) return route.abort();
    }
    if (url.pathname === '/lcos/agent-ui.js') { const response = await route.fetch({ timeout: 90000 }); return route.fulfill({ response,
      body: await response.text() + '\nwindow.__REMOVAL_READ__=()=>{const s=useLcosShellStore.getState();return{target:s.composerTarget,windows:s.windows}};' }); }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.errors.push(String(error)));
  const shot = async name => { const filename = path.join(output, name + '.png'); await page.screenshot({ path: filename }); report.screenshots.push(filename); await save(); };
  const ready = () => page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 });
  const settle = () => page.waitForFunction(() => { const s = window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync?.(); return s?.active && !s.working && s.appliedVersion >= s.desiredVersion; }, undefined, { timeout: 60000 });
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 90000 }); await ready(); await settle();
  await page.locator('.react-flow__node[data-id="' + nodeId + '"]').click({ position: { x: 5, y: 5 } });
  await page.waitForFunction(id => { const nodes = window.__LCOS_NODE_LAB__.api.getNodes().filter(node => node.selected); return nodes.length === 1 && nodes[0].id === id; }, nodeId);
  assert.equal(await page.evaluate(() => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || document.activeElement?.isContentEditable), false);
  for (const phase of ['apply','undo','redo','undo']) {
    await settle(); stage = phase;
    const saved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/nodes:batchActions'), { timeout: 60000 });
    await page.keyboard.press(phase === 'apply' ? 'Delete' : phase === 'undo' ? 'Control+z' : 'Control+Shift+z');
    const response = await saved; assert.equal(response.status(), 200, await response.text()); const present = phase === 'undo';
    await page.waitForFunction(({ id, present }) => window.__LCOS_NODE_LAB__.api.getNodes().some(node => node.id === id) === present, { id: nodeId, present });
    const canvas = await get('/api/canvas/v1/canvases/' + canvasId); assert.equal(canvas.nodes.some(node => node.id === nodeId), present);
    if (present) assert.deepEqual(canvas.nodes.find(node => node.id === nodeId), beforeNode);
    assert.deepEqual(canvas.nodes.filter(node => node.id !== nodeId), beforeCanvas.nodes.filter(node => node.id !== nodeId));
    assert.deepEqual(await get(prefix + '/connected-conversations'), beforeConnected); assert.deepEqual(await get(prefix + '/conversations'), beforeSessions);
    for (const [id, messages] of allMessages) assert.deepEqual(await get(prefix + '/conversations/' + id + '/messages?limit=1000'), messages);
    report.stages.push({ phase, present, version: canvas.version, sameNativeId: report.nativeId, preservedMessages: report.beforeMessageCount }); stage = 'settled'; await settle(); await shot('history-' + report.stages.length + '-' + phase);
  }
  stage = 'refresh'; await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await ready(); await settle();
  await page.locator('[data-lcos-node-id="' + nodeId + '"] [data-lcos-glyth-vector]').click({ position: { x: 34, y: 35 } });
  await page.waitForFunction(id => window.__REMOVAL_READ__().target?.receiverConversationId === id, conversationId);
  await page.getByText('恢复后智能体工具读取验证', { exact: true }).last().waitFor();
  assert.deepEqual(await page.evaluate(() => window.__REMOVAL_READ__().windows), []); await shot('refresh-original-four-message-conversation');
  assert.deepEqual(report.errors, []); assert.equal(report.modelSends, 0); assert.ok(report.writes.every(row => row.permitted)); report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; if (page) { try { report.visible = await page.locator('body').innerText(); await page.screenshot({ path: path.join(output, 'failure.png') }); } catch {} } }
finally { await save(); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, output, stages: report.stages, preservedMessages: report.beforeMessageCount, error: report.error }, null, 2));
