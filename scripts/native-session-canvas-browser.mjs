import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const phase = option('phase'); assert.ok(['read-main', 'read-context', 'move-main', 'read-created', 'read-method'].includes(phase));
assert.ok(process.argv.includes('--execute-real-ui'));
const root = process.cwd(), origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade';
const created = phase === 'read-created' ? JSON.parse(await fs.readFile(option('created-report'), 'utf8')) : undefined;
if (created) { assert.equal(created.passed, true); assert.ok(['create', 'keyboard'].includes(created.phase)); }
const previousTurn = option('previous-turn-report') ? JSON.parse(await fs.readFile(option('previous-turn-report'), 'utf8')) : undefined;
if (previousTurn) { assert.ok(created); assert.equal(previousTurn.passed, true); assert.equal(previousTurn.phase, 'read-created'); }
const conversationId = created?.conversationId ?? 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
const prefix = '/api/lcos/core/projects/' + projectId;
const output = path.join(root, 'output/原会话画布工具_20261023/真实页面', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const fixture = JSON.parse(await fs.readFile('output/健康恢复卡与断线续聊_20261023/fixture.json', 'utf8'));
const report = { passed: false, output, phase, sends: [], permissions: [], writes: [], pageErrors: [], httpErrors: [], checks: [], screenshots: [], modelMessagesSubmitted: 0 };
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const body = await response.json(); assert.ok(response.ok, route); return body.value ?? body.data ?? body; };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); assert.equal(health.realCoreConnected, true); report.pid = health.pid;
const connected = (await get(prefix + '/connected-conversations')).find(row => row.id === conversationId); assert.ok(connected);
const session = (await get(prefix + '/conversations')).find(row => row.id === connected.conversationSessionId); assert.ok(session);
const messagePath = prefix + '/conversations/' + session.id + '/messages?limit=1000';
report.beforeMessages = await get(messagePath); const beforeExecution = await get(prefix + '/execution-projection');
if (option('prior-rejected-report')) {
  const prior = JSON.parse(await fs.readFile(option('prior-rejected-report'), 'utf8'));
  assert.equal(prior.response?.status, 400); assert.equal(prior.response?.body?.error?.code, 'canvas_preparation_invalid');
  assert.deepEqual(report.beforeMessages, prior.beforeMessages, 'The Host-rejected request must not have appended a model turn; never replay an uncertain request.');
  report.priorRejectedBeforeCore = path.resolve(option('prior-rejected-report'));
}
if (previousTurn) {
  assert.equal(previousTurn.sends[0].input.conversationId, conversationId);
  assert.deepEqual(report.beforeMessages, previousTurn.afterMessages, 'A follow-up requires the exact prior confirmed turn; never replay an unconfirmed send.');
  report.previousTurnReport = path.resolve(option('previous-turn-report'));
} else if (created) assert.equal(report.beforeMessages.length, 0, 'Only the still-empty created conversation gets one first send; never replay.');
report.nativeIdentity = session.originMeta;
const providerArchive = path.join(root, '.runtime/isolated-node-carry-20261020/live-provider-profile/.qwen/projects/e--codex----lcos-----20261013--runtime-isolated-node-carry-20261020-agent-verification-project/chats', session.originMeta.continuationExternalSessionId + '.jsonl');
const archiveBefore = (await fs.stat(providerArchive).catch(error => {
  if (created && error.code === 'ENOENT') return { size: 0 }; // The original provider creates its log on the first turn.
  throw error;
})).size; report.providerArchive = { path: providerArchive, fromByte: archiveBefore };
const canvases = new Map();
for (const id of ['surface-core-main', 'surface-core-context']) canvases.set(id, await get('/api/canvas/v1/canvases/' + id));
const methodId = 'scope-workflow-c96e51c3-c0bb-4d92-86e2-7bfbf164e459';
const methodGraph = phase === 'read-method' ? await get(prefix + '/graph') : undefined;
const methodWorkspace = methodGraph?.workspaces.find(row => row.id === 'workspace:' + methodId);
if (phase === 'read-method') {
  assert.ok(methodWorkspace?.canvasId, 'Reuse the already-bound method worksite.');
  canvases.set(methodWorkspace.canvasId, await get('/api/canvas/v1/canvases/' + methodWorkspace.canvasId));
}
const targetCanvas = methodWorkspace?.canvasId ?? (phase === 'read-context' ? 'surface-core-context' : 'surface-core-main');
const targetNode = canvases.get(targetCanvas).nodes.find(node => created ? node.id === created.node.id : node.type === 'text' && node.data?.lcos_ref && !node.parentId); assert.ok(targetNode);
report.target = { canvasId: targetCanvas, nodeId: targetNode.id, before: targetNode.position,
  ...(phase === 'move-main' ? { after: { x: targetNode.position.x + 10, y: targetNode.position.y + 8 } } : {}) };
const marker = phase === 'read-method' ? '方法子现场工具读取验证' : phase === 'move-main' ? '画布工具移动验证' : phase === 'read-context' ? 'Context工具读取验证' : previousTurn ? '恢复后智能体工具读取验证' : created ? '新智能体工具读取验证' : 'Main工具读取验证';
const prompt = phase === 'move-main'
  ? `这是一次新的小幅移动验证，不是重发上一条操作。请实际调用当前会话的 set_node_geometry 画布工具，仅调用一次，把节点 ${targetNode.id} 从 x=${report.target.before.x}、y=${report.target.before.y} 移动到 x=${report.target.after.x}、y=${report.target.after.y}。可以先用 inspect_nodes 核对；如果工具是延迟加载，请先通过 tool_search 查找。不要改正文，不要运行终端或其他工具，不要创建任务。完成后回复“${marker}”、节点名称和移动结果即可，不要列协议字段或内部文件名。`
  : `这轮画布工具已重新接好，请核对当前工具列表，直接调用名称以 inspect_nodes 结尾的画布工具，查询节点 ${targetNode.id} 的当前位置和标题。保持画布不变，不要运行终端或其他工具，不要创建任务。之前几轮工具不可用的回复是历史情况，不能用它替代当前工具列表。按本次实际工具结果回复“${marker}”、标题、x和y。`;
let browser, page, stage = 'opening';
function originalEcho(body, canvas) {
  if (body?.canvas_id !== canvas?.id || body.created_by_role !== 'user' || body.lcos_operation !== undefined || body.actions?.length !== 1) return false;
  const action = body.actions[0]; if (action.action !== 'update' || !Array.isArray(action.updates)) return false;
  return action.updates.every(update => { const source = canvas.nodes.find(row => row.id === update.id); return source
    && Object.entries(update).every(([key, value]) => ['id', 'type', 'data', 'position', 'measured'].includes(key) && isDeepStrictEqual(value, source[key])); });
}
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const row = { method: request.method(), path: url.pathname, stage, permitted: false }; report.writes.push(row);
      try {
        if (url.pathname === '/api/events') row.permitted = true;
        else if ([...canvases.keys()].some(id => url.pathname === '/api/lcos/canvases/' + id + '/execution:reconcile')) {
          assert.deepEqual(JSON.parse(request.postData()), {}); row.permitted = true; row.originalProjection = true;
        } else if (methodWorkspace && url.pathname === '/api/lcos/workflow/' + methodId + '/workspace:open') {
          assert.deepEqual(JSON.parse(request.postData()), { workspaceId: methodWorkspace.id }); row.permitted = true;
        } else if (/nodes:batchActions$/.test(url.pathname)) {
          const body = JSON.parse(request.postData()); row.originalOpeningEcho = originalEcho(body, canvases.get(body.canvas_id));
          if (['undo', 'redo'].includes(stage)) {
            assert.equal(body.canvas_id, targetCanvas); const updates = body.actions.flatMap(action => action.updates ?? []);
            assert.equal(updates.length, 1); assert.equal(updates[0].id, targetNode.id);
            assert.deepEqual(updates[0].position, stage === 'undo' ? report.target.before : report.target.after); row.permitted = true;
          } else row.permitted = stage !== 'model-send' && row.originalOpeningEcho;
        } else if (url.pathname === prefix + '/connected-conversations/' + conversationId + '/collaboration-send') {
          const body = JSON.parse(request.postData());
          assert.equal(report.sends.length, 0, 'A phase submits exactly one original message; it never retries.');
          assert.equal(body.text, prompt); assert.equal(body.conversationId, conversationId); assert.ok(body.messageId && body.continuationOperationId);
          assert.ok(body.orderedReferences?.some(row => row.ref.type === 'scope' && row.ref.scopeId === fixture.scopeId));
          const headers = request.headers(); assert.equal(headers['x-lcos-canvas-id'], targetCanvas); assert.ok(headers['x-lcos-workspace-id']);
          report.sends.push({ input: body, canvasId: headers['x-lcos-canvas-id'], workspaceId: headers['x-lcos-workspace-id'] });
          report.modelMessagesSubmitted = 1; row.permitted = true; await save();
        } else if (url.pathname === prefix + '/connected-conversations/' + conversationId + '/canvas-permissions') {
          const body = JSON.parse(request.postData());
          assert.equal(body.decision?.optionId, report.permissions.at(-1)?.optionId); assert.equal(body.requestId, report.permissions.at(-1)?.requestId);
          row.permitted = true;
        }
      } catch (error) { row.reason = error.message; report.routeError = error.message; }
      if (!row.permitted) return route.abort();
    }
    if (url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 90000 });
      return route.fulfill({ response, body: await response.text() + '\nwindow.__SESSION_CANVAS_READ__=()=>{const s=useLcosShellStore.getState();return{projectId:s.projectId,prompt:s.composerPrompt,target:s.composerTarget,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,document:performance.timeOrigin}};' });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  const read = () => page.evaluate(() => window.__SESSION_CANVAS_READ__());
  const waitCanvasIdle = () => page.waitForFunction(() => {
    const host = window.__LCOS_NODE_LAB__, state = host?.api?.inspectExternalGeometrySync?.();
    return state?.active && state.canvasId === (host.currentCanvasId || host.canvasId)
      && state.appliedVersion !== undefined && state.appliedVersion >= state.desiredVersion && !state.working;
  }, undefined, { timeout: 90000 });
  const shot = async name => { const filename = path.join(output, name + '.png'); await page.screenshot({ path: filename, mask: [page.locator('input[type=password],input[name*=token i],input[name*=secret i]')] }); report.screenshots.push(filename); };
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 });
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.waitFor();
  if (phase === 'read-context' || phase === 'move-main') {
    stage = 'scene'; await page.getByRole('button', { name: 'Context', exact: true }).click();
    await page.waitForFunction(() => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === 'surface-core-context');
    if (phase === 'move-main') { await page.getByRole('button', { name: 'Main', exact: true }).click();
      await page.waitForFunction(() => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === 'surface-core-main'); }
  }
  const header = page.locator('[data-lcos-native-chat-header]'); await header.getByRole('button', { name: '选择对话', exact: true }).click();
  const menu = page.locator('[data-lcos-native-chat-history]:visible');
  const cohort = (await get(prefix + '/connected-conversations')).filter(row => !row.conversationRef.startsWith('pending-') && row.label === connected.label);
  const index = cohort.findIndex(row => row.id === conversationId); assert.ok(index >= 0);
  const choices = menu.getByText(connected.label, { exact: true }); assert.equal(await choices.count(), cohort.length); await choices.nth(index).click();
  await page.waitForFunction(id => window.__SESSION_CANVAS_READ__().target?.receiverConversationId === id, conversationId);
  const library = page.locator('[data-library-view=library]'), preview = page.locator('.native-library-content-preview');
  const closeLibrary = async () => {
    if (!await library.isVisible()) return;
    const back = library.locator('button').filter({ has: page.locator('svg.tabler-icon-chevron-left') });
    assert.equal(await back.count(), 1, 'Close through the original Library back arrow.');
    await back.click(); await library.waitFor({ state: 'hidden' });
  };
  await page.getByTestId('canvas-dockbar-assets-btn').click(); await library.getByRole('textbox', { name: '搜索', exact: true }).fill(fixture.scopeTitle);
  await library.getByRole('button', { name: fixture.scopeTitle, exact: true }).click();
  await preview.getByRole('button', { name: '用于当前对话', exact: true }).click(); await preview.waitFor({ state: 'hidden' });
  await page.locator('[data-lcos-composer-ref]').first().waitFor();
  await closeLibrary();
  if (methodWorkspace) {
    stage = 'method-scene';
    await page.getByTestId('canvas-dockbar-workflow-btn').click();
    const guide = page.getByRole('button', { name: '知道了', exact: true }); if (await guide.isVisible()) await guide.click();
    await page.getByRole('button', { name: '浏览全部', exact: true }).click();
    const gallery = page.locator('[data-native-workflow-gallery]');
    await gallery.getByText(methodGraph.scopes.find(row => row.id === methodId).name, { exact: true }).first().click();
    await gallery.locator('[data-native-workflow-preview]').getByRole('button', { name: '进入工作现场', exact: true }).click();
    await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === id, targetCanvas);
    await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached' });
    await page.waitForFunction(id => window.__SESSION_CANVAS_READ__().target?.workspaceId === id, methodWorkspace.id);
    report.checks.push('The original method gallery enters its existing child scene, retaining the exact real conversation and full mixed Scope reference.');
  }
  await input.fill(prompt); const uiBefore = await read(); assert.equal(uiBefore.target.receiverConversationId, conversationId); assert.deepEqual(uiBefore.windows, []);
  report.uiBefore = uiBefore; await shot('01-original-composer-before-send');
  const eventStart = (await get('/api/events')).lastSequence;
  stage = 'model-send'; let completed = false, responseError, response;
  const observed = page.waitForResponse(row => row.request().method() === 'POST' && new URL(row.url()).pathname.endsWith('/collaboration-send'), { timeout: 360000 })
    .then(async row => { response = { status: row.status(), body: await row.json() }; completed = true; }, error => { responseError = error; completed = true; });
  await page.getByRole('button', { name: '提交', exact: true }).click();
  const approved = new Set(); const end = Date.now() + 350000;
  while (!completed && Date.now() < end) {
    if (report.routeError) throw new Error(report.routeError);
    const waiting = await get(prefix + '/connected-conversations/' + conversationId + '/canvas-permissions');
    for (const request of waiting.requests) {
      if (approved.has(request.requestId)) continue;
      const description = JSON.stringify({ toolCall: request.toolCall, options: request.options });
      assert.ok(/inspect_nodes|get_space_outline|set_node_geometry/.test(description), 'Only explicitly requested own canvas tools may be approved.');
      if (/set_node_geometry/.test(description)) { assert.equal(phase, 'move-main'); assert.deepEqual(request.toolCall.rawInput.items, [{ nodeId: targetNode.id, position: report.target.after }]); }
      else if (/inspect_nodes/.test(description)) assert.deepEqual(request.toolCall.rawInput, { ids: [targetNode.id] });
      const option = request.options.find(row => row.kind === 'allow_once'); assert.ok(option, 'Use one-time permission only.');
      const tray = page.locator('[data-native-session-request="' + request.requestId + '"]'); await tray.waitFor(); await tray.scrollIntoViewIfNeeded(); await shot('02-original-permission-' + report.permissions.length);
      report.permissions.push({ requestId: request.requestId, messageId: waiting.messageId, toolCall: request.toolCall, optionId: option.optionId, optionKind: option.kind });
      approved.add(request.requestId); await save(); await tray.locator('[data-native-permission-option="' + option.optionId + '"]').click();
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (!completed) throw new Error('Original send has not completed; do not replay it.');
  await observed; if (responseError) throw responseError;
  report.response = response; await save(); assert.equal(response.status, 200); assert.equal(response.body.ok, true);
  await page.waitForFunction(() => window.__SESSION_CANVAS_READ__().prompt === '');
  await page.getByText(new RegExp(marker)).last().waitFor({ timeout: 30000 });
  report.afterMessages = await get(messagePath); assert.equal(report.afterMessages.length, report.beforeMessages.length + 2);
  assert.deepEqual(report.afterMessages.slice(0, report.beforeMessages.length), report.beforeMessages);
  assert.equal(report.afterMessages.at(-2).contentText, prompt); assert.ok(report.afterMessages.at(-1).contentText.includes(marker));
  const send = report.sends[0].input, operation = await get(prefix + '/conversation-continuations/' + send.continuationOperationId);
  const receipt = operation.promptReceipts.find(row => row.messageId === send.messageId); assert.equal(receipt.sendReceipt?.outcome, 'sent'); assert.equal(receipt.attachReceipt?.outcome, 'attached');
  report.receipt = receipt;
  const scope = receipt.contextResolution.find(row => row.kind === 'scope' && row.scopeId === fixture.scopeId); assert.ok(scope);
  for (const [type, id] of [['collection', fixture.outer.id], ['collection', fixture.inner.id], ['note', fixture.noteId], ['conversation', fixture.conversationId], ['run', fixture.runId], ['workspace', fixture.workspace.id], ['conversation', created ? 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0' : conversationId]])
    assert.ok(scope.members.some(row => row.ref.type === type && row.ref.id === id), 'Full scope keeps ' + type + ':' + id);
  const self = scope.members.find(row => row.ref.type === 'conversation' && row.ref.id === conversationId);
  if (!created) assert.equal(self.source.messages.length, report.beforeMessages.length + 1);
  else { assert.equal(self, undefined, 'This new conversation was not silently inserted into the existing Scope.'); assert.equal(scope.members.length, 19); }
  report.scopeMemberCount = scope.members.length;
  const events = await get('/api/events?after=' + eventStart);
  report.kernelRequests = events.events.filter(row => row.detail?.path?.startsWith('/api/rfs/')).map(row => row.detail);
  assert.ok(report.kernelRequests.some(row => row.method === 'POST' && row.path === '/api/rfs/' + targetCanvas + '/query' && row.status === 200)
    || phase === 'move-main' && report.kernelRequests.some(row => row.method === 'POST' && row.path === '/api/rfs/' + targetCanvas + '/execute' && row.status === 200), 'A real kernel tool call must occur during this model turn.');
  const executions = report.kernelRequests.filter(row => row.method === 'POST' && row.path.endsWith('/execute')); assert.equal(executions.length, phase === 'move-main' ? 1 : 0);
  report.afterCanvas = await get('/api/canvas/v1/canvases/' + targetCanvas);
  const afterNode = report.afterCanvas.nodes.find(row => row.id === targetNode.id); assert.deepEqual(afterNode.data, targetNode.data);
  assert.deepEqual(afterNode.position, report.target.after ?? report.target.before);
  if (phase === 'move-main') await page.waitForFunction(({ id, point }) => {
    const node = window.__LCOS_NODE_LAB__?.api?.getNode(id); return node?.position.x === point.x && node.position.y === point.y;
  }, { id: targetNode.id, point: report.target.after });
  else assert.deepEqual(report.afterCanvas, canvases.get(targetCanvas));
  assert.deepEqual(await get(prefix + '/execution-projection'), beforeExecution);
  assert.deepEqual((await read()).windows, []); assert.equal((await read()).document, uiBefore.document);
  await shot('03-original-reply-and-canvas');
  if (phase === 'move-main') {
    report.history = [];
    await waitCanvasIdle(); await page.keyboard.press('Escape'); await closeLibrary();
    // Focus the original canvas once. Repeated clicks at the same point can
    // become its native double-click add menu and consume the redo shortcut.
    await page.locator('.react-flow__pane').click({ position: { x: 80, y: 120 } });
    for (const action of ['undo', 'redo']) {
      stage = action; const expected = action === 'undo' ? report.target.before : report.target.after;
      await page.keyboard.press('Escape');
      await waitCanvasIdle();
      const saved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/canvas/v1/canvases/' + targetCanvas + '/nodes:batchActions', { timeout: 60000 });
      await page.keyboard.press(action === 'undo' ? 'Control+z' : 'Control+Shift+z'); const result = await saved; assert.equal(result.status(), 200);
      await page.waitForFunction(({ id, point }) => { const node = window.__LCOS_NODE_LAB__?.api?.getNode(id); return node?.position.x === point.x && node.position.y === point.y; }, { id: targetNode.id, point: expected });
      const canvas = await get('/api/canvas/v1/canvases/' + targetCanvas), node = canvas.nodes.find(row => row.id === targetNode.id);
      assert.deepEqual(node.position, expected); assert.deepEqual(node.data, targetNode.data);
      assert.equal(report.writes.filter(row => row.stage === action && row.path.endsWith('/nodes:batchActions')).length, 1);
      report.history.push({ action, position: node.position, canvasVersion: canvas.version });
      await waitCanvasIdle(); await save();
      await shot(action === 'undo' ? '04-original-undo-saved' : '05-original-redo-saved'); canvases.set(targetCanvas, canvas);
    }
    stage = 'refresh'; await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 60000 });
    await waitCanvasIdle();
    await page.waitForFunction(({ id, point }) => { const node = window.__LCOS_NODE_LAB__?.api?.getNode(id); return node?.position.x === point.x && node.position.y === point.y; }, { id: targetNode.id, point: report.target.after });
    await shot('06-original-refresh-keeps-move');
    report.checks.push('The one real model move enters original Undo/Redo; each saves once, the original body survives, and refresh keeps the final actual position.');
  }
  const archiveAfter = await fs.readFile(providerArchive); report.providerArchive.toByte = archiveAfter.length;
  const rows = archiveAfter.subarray(archiveBefore).toString('utf8').split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  report.providerNewRecordTypes = rows.map(row => ({ type: row.type, keys: Object.keys(row) }));
  const calls = []; const walk = value => { if (!value || typeof value !== 'object') return;
    if (value.functionCall?.name) calls.push(value.functionCall);
    if (value.type === 'tool_use' && value.name) calls.push({ name: value.name, args: value.input });
    for (const item of Object.values(value)) if (typeof item === 'object') walk(item); };
  rows.forEach(walk); report.providerToolCalls = calls;
  assert.deepEqual(report.pageErrors, []); report.checks.push('One actual original-Composer send preserves native owner, all mixed Scope member types and prior complete messages; own kernel HTTP proves real tool invocation; permission uses original tray when requested, with no new window or Run.');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (page) { try { const filename = path.join(output, 'failure.png'); await page.screenshot({ path: filename }); report.screenshots.push(filename); report.visible = await page.locator('body').innerText(); } catch {} }
} finally { await save(); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, output, phase, modelMessagesSubmitted: report.modelMessagesSubmitted, checks: report.checks, error: report.error?.message }, null, 2));
