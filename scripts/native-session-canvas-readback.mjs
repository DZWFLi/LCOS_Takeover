import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const prior = JSON.parse(await fs.readFile(option('prior-report'), 'utf8'));
assert.equal(prior.passed, true); assert.equal(prior.phase, 'move-main');
const origin = 'http://127.0.0.1:56311', projectId = prior.nativeIdentity.continuationRuntimeScope;
const prefix = '/api/lcos/core/projects/' + projectId, conversationId = prior.sends[0].input.conversationId;
const output = path.resolve('output/原会话画布工具_20261023/最终只读复核', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, output, modelMessagesSubmitted: 0, writes: [], pageErrors: [] };
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  const body = await response.json(); assert.ok(response.ok); return body.value ?? body.data ?? body; };
const connected = (await get(prefix + '/connected-conversations')).find(row => row.id === conversationId); assert.ok(connected);
const messagePath = prefix + '/conversations/' + connected.conversationSessionId + '/messages?limit=1000';
const canvasPath = '/api/canvas/v1/canvases/' + prior.target.canvasId, canvas = await get(canvasPath);
const node = canvas.nodes.find(row => row.id === prior.target.nodeId); assert.deepEqual(node.position, prior.target.after);
assert.deepEqual(node.data, prior.afterCanvas.nodes.find(row => row.id === node.id).data);
assert.deepEqual(await get(messagePath), prior.afterMessages);
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); assert.equal(health.realCoreConnected, true);
let browser, page;
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const body = request.postDataJSON(), row = { path: url.pathname, permitted: false }; report.writes.push(row);
      if (url.pathname === '/api/events') row.permitted = true;
      if (url.pathname.endsWith('/execution:reconcile') && isDeepStrictEqual(body, {})) row.permitted = true;
      if (url.pathname === canvasPath + '/nodes:batchActions' && body.canvas_id === canvas.id
        && body.created_by_role === 'user' && body.lcos_operation === undefined && body.actions?.length === 1
        && body.actions[0].action === 'update' && Array.isArray(body.actions[0].updates))
        row.permitted = body.actions[0].updates.every(update => { const source = canvas.nodes.find(item => item.id === update.id);
          return source && Object.entries(update).every(([key, value]) => ['id', 'type', 'data', 'position', 'measured'].includes(key) && isDeepStrictEqual(value, source[key])); });
      if (!row.permitted) return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(String(error)));
  await page.goto(origin + '/canvas/' + canvas.id, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 });
  const element = page.locator('.react-flow__node[data-id="' + node.id + '"]');
  // Trial waits for the original transition layer; it does not dismiss it or mutate the canvas.
  await element.click({ trial: true, position: { x: 30, y: 12 }, timeout: 60000 });
  report.phase = 'saved-position';
  await page.waitForFunction(({ id, position }) => { const host = window.__LCOS_NODE_LAB__, item = host?.api?.getNode(id), sync = host?.api?.inspectExternalGeometrySync?.();
    return item?.position.x === position.x && item?.position.y === position.y && sync?.active && !sync.working && sync.appliedVersion >= sync.desiredVersion;
  }, { id: node.id, position: node.position });
  report.phase = 'loaded-images';
  // Require decoded, drawable pixels. Some original image instances retain a
  // decoded current image while a replacement request is still in progress.
  // Preserve their complete flags below; do not mistake this screenshot check
  // for verification that all image loading activity has settled.
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node img')].every(image => image.naturalWidth > 0));
  report.images = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node img')].map(image => ({
    nodeId: image.closest('.react-flow__node')?.dataset.id, complete: image.complete, width: image.naturalWidth })));
  report.phase = 'same-conversation';
  await page.locator('[data-lcos-native-chat-header]').getByRole('button', { name: '选择对话', exact: true }).click();
  const cohort = (await get(prefix + '/connected-conversations')).filter(row => !row.conversationRef.startsWith('pending-') && row.label === connected.label);
  const choices = page.locator('[data-lcos-native-chat-history]:visible').getByText(connected.label, { exact: true });
  assert.equal(await choices.count(), cohort.length); await choices.nth(cohort.findIndex(row => row.id === conversationId)).click();
  await page.getByText('画布工具移动验证', { exact: true }).last().waitFor();
  report.screenshot = path.join(output, 'original-canvas-and-same-conversation.png'); await page.screenshot({ path: report.screenshot });
  assert.deepEqual(await get(messagePath), prior.afterMessages);
  const after = (await get(canvasPath)).nodes.find(row => row.id === node.id); assert.deepEqual(after.position, node.position); assert.deepEqual(after.data, node.data);
  assert.ok(report.writes.every(row => row.permitted)); assert.deepEqual(report.pageErrors, []);
  Object.assign(report, { passed: true, pid: health.pid, messages: prior.afterMessages.length, position: after.position,
    originalMessagesExact: true, bodyUnchanged: true, originalOpeningEchoesOnly: true });
} catch (error) { report.error = error.message; process.exitCode = 1;
  if (page) { report.diagnostic = await page.evaluate(() => ({ sync: window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync?.(),
    images: [...document.querySelectorAll('.react-flow__node img')].map(image => ({ nodeId: image.closest('.react-flow__node')?.dataset.id, complete: image.complete, width: image.naturalWidth, visible: image.getBoundingClientRect().width > 0 })) })).catch(() => null);
    report.screenshot = path.join(output, 'failure.png'); await page.screenshot({ path: report.screenshot }).catch(() => {}); }
}
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, output, messages: report.messages, position: report.position, error: report.error }, null, 2));
