import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const argument = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const priorFile = argument('prior-report'); assert.ok(priorFile);
const prior = JSON.parse(await fs.readFile(priorFile, 'utf8')); assert.equal(prior.sends.length, 1);
const input = prior.sends[0].input, origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', conversationId = input.conversationId;
const prefix = '/api/lcos/core/projects/' + projectId, permissionPath = prefix + '/connected-conversations/' + conversationId + '/canvas-permissions';
const output = path.resolve('output/原会话画布工具_20261023/原权限接续/' + new Date().toISOString().replaceAll(':', '-')); await fs.mkdir(output, { recursive: true });
const report = { passed: false, priorFile, output, newPrompts: 0, writes: [], screenshots: [], pageErrors: [], checks: [] };
const get = async route => { const response = await fetch(origin + route, { signal: AbortSignal.timeout(15000) }); const body = await response.json(); assert.ok(response.ok); return body.value ?? body.data ?? body; };
const waiting = await get(permissionPath); assert.equal(waiting.messageId, input.messageId); assert.equal(waiting.requests.length, 1);
const request = waiting.requests[0]; assert.equal(request.toolCall.kind, 'read'); assert.deepEqual(request.toolCall.rawInput, { ids: [prior.target.nodeId] });
assert.ok(request.options.some(option => option.name.includes('inspect_nodes')));
const allow = request.options.find(option => option.kind === 'allow_once'); assert.ok(allow); report.request = request;
const connected = (await get(prefix + '/connected-conversations')).find(row => row.id === conversationId); assert.ok(connected);
let browser, page;
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      const row = { path: url.pathname, permitted: url.pathname === '/api/events' }; report.writes.push(row);
      if (url.pathname === permissionPath && req.method() === 'POST') {
        const body = JSON.parse(req.postData()); assert.deepEqual(body, { messageId: input.messageId, requestId: request.requestId, decision: { optionId: allow.optionId } });
        assert.equal(report.writes.filter(row => row.path === permissionPath).length, 1); row.permitted = true; row.body = body;
      }
      if (!row.permitted) return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(25000); page.on('pageerror', error => report.pageErrors.push(String(error)));
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 60000 });
  await page.locator('[data-lcos-native-chat-header]').getByRole('button', { name: '选择对话', exact: true }).click();
  const cohort = (await get(prefix + '/connected-conversations')).filter(row => !row.conversationRef.startsWith('pending-') && row.label === connected.label);
  const choices = page.locator('[data-lcos-native-chat-history]:visible').getByText(connected.label, { exact: true }); assert.equal(await choices.count(), cohort.length);
  await choices.nth(cohort.findIndex(row => row.id === conversationId)).click();
  const tray = page.locator('[data-native-session-request="' + request.requestId + '"]'); await tray.waitFor(); await shot('01-original-pending-permission');
  const eventStart = (await get('/api/events')).lastSequence;
  const receipt = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === permissionPath);
  await tray.getByRole('button', { name: allow.name, exact: true }).click();
  const response = await receipt; report.answer = await response.json(); assert.ok(response.ok() && report.answer.ok && report.answer.value.handled);
  const messagePath = prefix + '/conversations/' + connected.conversationSessionId + '/messages?limit=1000';
  const deadline = Date.now() + 100000; let messages;
  while (Date.now() < deadline) { messages = await get(messagePath); if (messages.length === prior.beforeMessages.length + 2 && messages.at(-1).eventKind === 'agent_message') break; await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.equal(messages.length, prior.beforeMessages.length + 2); assert.deepEqual(messages.slice(0, prior.beforeMessages.length), prior.beforeMessages);
  assert.equal(messages.at(-2).contentText, input.text); report.afterMessages = messages;
  const operation = await get(prefix + '/conversation-continuations/' + input.continuationOperationId);
  report.receipt = operation.promptReceipts.find(row => row.messageId === input.messageId);
  assert.equal(report.receipt.sendReceipt?.outcome, 'sent'); assert.equal(report.receipt.attachReceipt?.outcome, 'attached');
  const events = await get('/api/events?after=' + eventStart); report.kernelRequests = events.events.filter(row => row.detail?.path?.startsWith('/api/rfs/')).map(row => row.detail);
  assert.ok(report.kernelRequests.some(row => row.method === 'POST' && row.path === '/api/rfs/surface-core-main/query' && row.status === 200));
  const scope = report.receipt.contextResolution.find(row => row.kind === 'scope'); assert.ok(scope); report.scopeMemberCount = scope.members.length;
  for (const type of ['collection', 'note', 'conversation', 'run', 'workspace']) assert.ok(scope.members.some(row => row.ref.type === type));
  assert.ok(messages.at(-1).contentText.includes(String(prior.target.before.x)) && messages.at(-1).contentText.includes(String(prior.target.before.y)));
  await tray.waitFor({ state: 'hidden' }); await page.getByText(/Main工具读取验证/).last().waitFor(); await shot('02-original-message-completed');
  assert.equal(report.writes.filter(row => row.path.endsWith('/collaboration-send')).length, 0); assert.deepEqual(report.pageErrors, []);
  report.checks.push('The existing original pending permission is answered once in the original tray; its same message then performs a real kernel query and archives the reply, with all prior messages/Scope member types preserved and no new prompt.'); report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; if (page) { try { const file = path.join(output, 'failure.png'); await page.screenshot({ path: file }); report.screenshots.push(file); } catch {} } }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, output, newPrompts: 0, checks: report.checks, error: report.error?.message }, null, 2));
