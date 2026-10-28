import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(process.argv.includes('--execute-readonly'), 'Use --execute-readonly after the unified UI build; no connection/send mode exists in this script.');
const expectedPid = Number(option('expected-pid')); assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0);
const origin = new URL(option('base-url') ?? 'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1'); assert.equal(new URL(origin).protocol, 'http:');
const projectId = 'disposable-surface-core-facade', conversationId = 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
const base = '/api/lcos/core/projects/' + projectId, operationId = 'conversation-continue_existing-2409a6ad-ddd2-4766-a9ec-fbcb084d3981';
const output = path.resolve(option('output-root') ?? 'output/健康恢复卡与断线续聊_20261023/请求读态真实页面/' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, origin, expectedPid, conversationId, operationId, checks: [], screenshots: [], blockedWrites: [], external: [], protocols: [], socketsBlocked: [], injected: [], pageErrors: [], httpErrors: [],
  submittedPrompts: 0, modelCalls: 0, coreWrites: 0, responseObservation: 'Only an appended read-only Shell/selection/projection snapshot; no setters, hook calls, owner replacement or fabricated journal data.',
  notClaimed: ['Disconnected transport is not healthy or restored.', 'Delayed and failed GETs are explicitly simulated transport faults; successful records/actions remain original server/UI data.', 'No recovery/cancel/connect/send action is clicked.'] };
const safe = value => String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]').replace(/\bBearer\s+[^\s\"']+/gi, 'Bearer [REDACTED]');
const get = async route => {
  const response = await fetch(origin + route, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route); const payload = await response.json(); assert.ok(payload.ok === true || payload.code === 0 || route === '/health', route);
  return payload.value ?? payload.data ?? payload;
};
const readOperations = () => get(base + '/conversation-continuations');
const targetPath = id => base + '/connected-conversations/' + encodeURIComponent(id);
const messageRows = payload => Array.isArray(payload) ? payload : payload.messages ?? payload.items;
let before, browser, page, stage = 'preflight', fault = { mode: 'normal', conversationId }, gateId = 0;
const held = [], pendingReads = new Map();
const releaseGates = () => { for (const ticket of held) ticket.release(); };
async function facts() {
  const [graph, runs, markers, operations, connected, sessions, bindings] = await Promise.all([
    get(base + '/graph'), get(base + '/execution-projection'), get(base + '/spatial-markers'), readOperations(), get(base + '/connected-conversations'), get(base + '/conversations'), get(base + '/spatial/bindings'),
  ]);
  const messages = {};
  for (const session of sessions) { const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000'); const rows = messageRows(payload); assert.ok(Array.isArray(rows)); assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false); messages[session.id] = rows; }
  return { graph, runs, markers, operations, connected, sessions, bindings, messages };
}
const poll = async (read, matches, label, timeoutMs = 30000) => { const end = Date.now() + timeoutMs; let last; do { last = await read(); if (matches(last)) return last; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < end); throw Error(label + ' timed out; last=' + JSON.stringify(last)); };
try {
  const health = await get('/health'); assert.equal(health.realCoreConnected, true); assert.equal(health.pid, expectedPid);
  before = await facts(); const current = before.connected.find(row => row.id === conversationId); assert.ok(current?.conversationSessionId);
  assert.equal(before.messages[current.conversationSessionId].length, 28); const protectedOperation = before.operations.find(row => row.operationId === operationId); assert.ok(protectedOperation);
  const state = await get(targetPath(conversationId) + '/collaboration-session'); assert.equal(state.capabilities.canSend, false); report.disconnected = { canSend: false, canResume: state.capabilities.canResume, reason: state.capabilityReasons?.canSend };
  const require = createRequire(path.join(currentGen2Root, 'package.json')), ts = require('typescript');
  const exports = {}; new Function('exports', ts.transpileModule(await fs.readFile('lab/pilot/native-conversation-recovery-visibility.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(exports);
  const explicitFor = id => exports.nativeConversationRecoveryOperations(before.operations, { projectId, conversationId: id, showAllRequests: true });
  const expected = explicitFor(conversationId); assert.equal(expected.length, 22); report.expectedRequests = expected.map(row => row.operationId);
  const alternate = before.connected.find(row => row.id !== conversationId && !String(row.conversationRef ?? '').startsWith('pending-') && before.sessions.some(session => session.id === row.conversationSessionId)); assert.ok(alternate); report.alternateConversationId = alternate.id;
  const { chromium } = require('playwright-core'); browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (!['http:', 'https:'].includes(url.protocol)) { report.protocols.push({ stage, protocol: url.protocol }); return route.abort(); }
    if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) { report.external.push({ stage, method, path: url.pathname }); return route.abort(); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { report.blockedWrites.push({ stage, method, path: url.pathname, forwarded: false }); return route.abort(); }
    if (method === 'GET' && url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 120000 }), source = await response.text(); assert.ok(source.includes('diagnosticsConversationId') && source.includes('data-native-chat-requests-state'), 'Unified bundle must contain the actual read-state source bridge and original request UI');
      return route.fulfill({ response, body: source + '\nwindow.__CONVERSATION_DIAGNOSTICS_READ__=()=>{const s=useLcosShellStore.getState(),selection=readNativeConversationSelection(),e=useCollaborationSessionStore.getState().entries.get(s.projectId+":"+selection?.connectedConversationId);return{project:s.projectId,receiver:s.composerTarget?.receiverConversationId,operation:s.composerTarget?.continuationOperationId,message:s.composerTarget?.messageId,composerOpen:s.composerOpen,promptLength:s.composerPrompt.length,selection:selection?.connectedConversationId,status:e?.status,canSend:e?.projection?.capabilities.canSend};};' });
    }
    const isWork = method === 'GET' && url.pathname === targetPath(fault.conversationId) + '/work-view';
    const isProjection = method === 'GET' && [targetPath(fault.conversationId) + '/collaboration-session', targetPath(fault.conversationId) + '/collaboration-timeline'].includes(url.pathname);
    const hold = isWork && fault.mode === 'delay' || isProjection && fault.mode === 'fail-one';
    if (isWork) pendingReads.set(request, url.pathname);
    const clear = () => pendingReads.delete(request);
    request.response().then(clear, clear);
    if (isWork && fault.mode === 'fail-one' && !fault.failed) {
      fault.failed = true; report.injected.push({ stage, type: 'single simulated GET transport failure', path: url.pathname, status: 503 });
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Simulated read-only transport failure' } }) });
    }
    let heldTicket;
    if (hold) {
      let release, settled; const wait = new Promise(resolve => { release = resolve; }); const ticket = { id: ++gateId, stage, path: url.pathname, released: false, done: new Promise(resolve => { settled = resolve; }), settle: () => settled(), release() { if (!this.released) { this.released = true; release(); } } }; heldTicket = ticket;
      held.push(ticket); report.injected.push({ stage, type: 'simulated GET delay; original response retained', path: url.pathname }); await wait;
    }
    try { return await route.continue(); } catch (error) { if (!request.failure()) throw error; }
    finally { if (heldTicket) { heldTicket.failure = request.failure()?.errorText ?? null; heldTicket.settle(); } }
  });
  await context.routeWebSocket('**/*', socket => { report.socketsBlocked.push({ stage, path: new URL(socket.url()).pathname }); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.pageErrors.push(safe(error)));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ stage, path: new URL(response.url()).pathname, status: response.status() }); });
  const read = () => page.evaluate(() => window.__CONVERSATION_DIAGNOSTICS_READ__?.());
  const header = page.locator('[data-lcos-native-chat-header]'), pane = page.locator('[data-native-chat-requests]');
  const cards = page.locator('[data-lcos-native-chat-frame] [data-native-chat-operation]');
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  const choose = async id => {
    const rows = (await get(base + '/connected-conversations')).filter(row => !String(row.conversationRef ?? '').startsWith('pending-'));
    const row = rows.find(row => row.id === id); assert.ok(row); const cohort = rows.filter(item => item.label === row.label), index = cohort.findIndex(item => item.id === id);
    await header.getByRole('button', { name: '选择对话', exact: true }).click(); const menu = page.locator('[data-lcos-native-chat-history]:visible');
    const matches = menu.getByText(row.label, { exact: true }); assert.equal(await matches.count(), cohort.length); await matches.nth(index).click();
    await poll(read, value => value?.receiver === id && value.selection === id && value.status === 'ready', 'canonical original history selection');
  };
  const openRequests = async () => { const collapsed = page.locator('[data-lcos-conversation-continuation] [aria-expanded="false"]'); if (await collapsed.count()) await collapsed.click();
    await page.locator('[data-native-open-conversation-requests]').click(); await pane.waitFor(); };
  const readyRequests = async id => { await page.locator('[data-native-chat-requests][data-native-chat-requests-state="ready"][data-native-chat-requests-conversation="' + id + '"]').waitFor();
    const expectedIds = explicitFor(id).map(row => row.operationId).sort(); await poll(() => cards.evaluateAll(rows => rows.map(row => row.getAttribute('data-native-chat-operation')).sort()), value => same(value, expectedIds), 'exact original request rows');
  };
  stage = 'delayed-original-diagnostics'; fault = { mode: 'delay', conversationId }; console.log(stage);
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 90000 }); await header.waitFor(); await choose(conversationId);
  await poll(() => page.locator('[data-lcos-native-chat-frame] [data-chat-message-id]').count(), count => count === 28, 'canonical 28 original messages');
  await openRequests(); await page.locator('[data-native-chat-requests-state="loading"]').waitFor();
  assert.match(await pane.innerText(), /正在读取会话请求/); assert.ok(!(await pane.innerText()).includes('没有请求记录')); await shot('01-real-history-simulated-read-delay');
  assert.ok(held.some(ticket => ticket.stage === stage && ticket.path.endsWith('/work-view'))); fault = { mode: 'normal', conversationId }; releaseGates(); await readyRequests(conversationId);
  for (const operation of expected) { const card = page.locator('[data-native-chat-operation="' + operation.operationId + '"]'); for (const action of operation.allowedActions ?? []) {
    const button = card.locator('[data-lcos-recovery-action="' + action.action + '"]'); await button.waitFor(); assert.equal(await button.isEnabled(), true, 'Original advertised request action is still available without clicking'); } }
  assert.equal((await read()).canSend, false); await shot('02-real-22-original-requests-while-disconnected');
  report.checks.push('Fresh original history chooses exact canonical b0b and renders 28 real messages without requiring sending operation/message addresses; simulated diagnostic GET delay shows loading, then the original 22 records/actions appear while canSend remains false.');
  await pane.getByRole('button', { name: '返回对话', exact: true }).click(); await pane.waitFor({ state: 'hidden' });
  const defaultExpected = exports.nativeConversationRecoveryOperations(before.operations, { projectId, conversationId }).map(row => row.operationId).sort();
  await poll(() => cards.evaluateAll(rows => rows.map(row => row.getAttribute('data-native-chat-operation')).sort()), value => same(value, defaultExpected), 'confirmed default business attention view');
  report.defaultAttentionCount = defaultExpected.length; await openRequests(); await readyRequests(conversationId);

  stage = 'single-get-failure-and-local-retry'; console.log(stage); await poll(async () => pendingReads.size, count => count === 0, 'prior diagnostic GETs settled');
  fault = { mode: 'fail-one', conversationId, failed: false }; await pane.getByRole('button', { name: '更新会话状态', exact: true }).click();
  await page.locator('[data-native-chat-requests-state="error"]').waitFor(); assert.match(await pane.innerText(), /暂时无法读取会话请求/); assert.ok(!(await pane.innerText()).includes('没有请求记录'));
  assert.equal(report.injected.filter(row => row.type === 'single simulated GET transport failure').length, 1); await shot('03-single-simulated-get-failure');
  fault = { mode: 'normal', conversationId }; releaseGates(); await pane.getByRole('button', { name: '重新读取请求', exact: true }).click(); await readyRequests(conversationId); await shot('04-original-local-retry-real-records');
  report.checks.push('One explicitly simulated WorkView GET 503 produces the original request error state and local retry; actual successful GETs restore all 22 unchanged request cards without invoking recovery.');

  stage = 'late-canonical-read-after-original-history-switch'; console.log(stage); fault = { mode: 'delay', conversationId };
  await pane.getByRole('button', { name: '更新会话状态', exact: true }).click(); await page.locator('[data-native-chat-requests-state="loading"]').waitFor();
  await poll(async () => held.filter(ticket => !ticket.released && ticket.path === targetPath(conversationId) + '/work-view').length, value => value > 0, 'held old canonical diagnostic GET');
  const oldReadTickets = held.filter(ticket => !ticket.released && ticket.path === targetPath(conversationId) + '/work-view');
  await choose(alternate.id); await openRequests(); await readyRequests(alternate.id);
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.click();
  assert.equal(await input.evaluate(element => document.activeElement === element), true); fault = { mode: 'normal', conversationId: alternate.id }; releaseGates();
  await Promise.all(oldReadTickets.map(ticket => ticket.done)); report.oldReadCompletions = oldReadTickets.map(ticket => ({ path: ticket.path, failure: ticket.failure, settled: true }));
  await poll(async () => ({ ui: await read(), ids: await cards.evaluateAll(rows => rows.map(row => row.getAttribute('data-native-chat-operation')).sort()), focused: await input.evaluate(element => document.activeElement === element) }),
    value => value.ui?.receiver === alternate.id && same(value.ids, explicitFor(alternate.id).map(row => row.operationId).sort()) && value.focused, 'late old read cannot change new canonical rows or focus');
  await shot('05-original-history-switch-late-old-read'); report.checks.push('Original history switches to a different existing canonical conversation during a held b0b read; its exact own requests and user input focus survive the late old completion, with no truth mutation.');

  stage = 'close-original-panel-during-read'; console.log(stage); fault = { mode: 'delay', conversationId: alternate.id };
  await pane.getByRole('button', { name: '更新会话状态', exact: true }).click(); await page.locator('[data-native-chat-requests-state="loading"]').waitFor();
  await poll(async () => held.filter(ticket => !ticket.released && ticket.path === targetPath(alternate.id) + '/work-view').length, value => value > 0, 'held current diagnostic GET before original close');
  const closingTickets = held.filter(ticket => !ticket.released && ticket.path === targetPath(alternate.id) + '/work-view');
  await header.getByRole('button', { name: '收起对话', exact: true }).click(); await pane.waitFor({ state: 'hidden' });
  fault = { mode: 'normal', conversationId: alternate.id }; releaseGates();
  await Promise.all(closingTickets.map(ticket => ticket.done)); report.closedReadCompletions = closingTickets.map(ticket => ({ path: ticket.path, failure: ticket.failure, settled: true }));
  await poll(read, value => value?.composerOpen === false, 'original closed Composer owner'); assert.equal(await pane.count(), 0); await shot('06-original-panel-remains-closed');
  report.checks.push('Closing the original Chatbox during a delayed GET leaves the original owner closed; late diagnostics cannot reopen or focus a different page.');
  assert.equal(report.external.length, 0); assert.equal(report.protocols.length, 0); assert.deepEqual(report.pageErrors, []); report.passed = true;
} catch (error) { report.error = safe(error.stack ?? error); process.exitCode = 1; if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally {
  fault = { mode: 'normal', conversationId }; releaseGates();
  if (before) { try { const after = await facts(); for (const key of Object.keys(before)) {
        if (key !== 'markers') { assert.deepEqual(after[key], before[key], key + ' unchanged by read-only GUI checks'); continue; }
        // Root authorized only the parallel navigation test's exact two pre-existing receipt removals.
        const parallelIds = new Set(['marker-55c38c21-4aa2-4f93-8a50-74942118f65c', 'marker-1c1ddbf0-0195-4f92-8c67-07962b2dfb1b']);
        assert.deepEqual(after.markers.filter(row => !parallelIds.has(row.id)), before.markers.filter(row => !parallelIds.has(row.id)), 'all unrelated navigation markers unchanged');
        for (const marker of after.markers.filter(row => parallelIds.has(row.id))) assert.deepEqual(marker, before.markers.find(row => row.id === marker.id), 'parallel receipt cannot be added or altered');
        report.authorizedParallelMarkerRemovals = before.markers.filter(row => parallelIds.has(row.id) && !after.markers.some(next => next.id === row.id)).map(row => row.id);
      } report.factsUnchanged = true;
      report.messagesBySession = Object.fromEntries(Object.entries(after.messages).map(([id, rows]) => [id, rows.length])); report.journalCount = after.operations.length; report.markerCount = after.markers.length;
    } catch (error) { report.protectionError = safe(error.stack ?? error); report.passed = false; process.exitCode = 1; } }
  if (page) report.finalUi = await page.evaluate(() => window.__CONVERSATION_DIAGNOSTICS_READ__?.()).catch(() => null);
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, stage, factsUnchanged: report.factsUnchanged, blockedWrites: report.blockedWrites.length, injectedGetFailures: report.injected.filter(row => row.type === 'single simulated GET transport failure').length, modelCalls: 0, report: path.join(output, 'report.json'), error: report.error, protectionError: report.protectionError }, null, 2));
}