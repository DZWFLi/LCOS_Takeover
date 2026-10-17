import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:17881';
const canvasId = 'surface-core-workflow';
const label = '合成会话历史 · 未运行模型';
const conversationRef = 'synthetic-native-agent-ui-20261014-workflow';
const userHistory = '人工合成历史浏览器验证：用户提供的合成历史条目。';
const assistantHistory = '人工合成历史浏览器验证：此内容为预先导入，未运行模型也未触发 Provider。';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');

const report = {
  at: new Date().toISOString(),
  target: origin + '/canvas/' + canvasId,
  flow: 'original Agent toggle → Core registered conversations → exact reconcile receipt → reload → Glyth Work View → drag → Huabu/Core readback → reload persistence',
  canvasScope: { onlyCanvasId: canvasId, touchedMain: false },
  browser: 'installed playwright-core; Chrome headless; fresh context; 1440x1000; service workers blocked',
  browserPlugin: 'not available in this session; regular Playwright is authorized for this task',
  cases: [],
  coreSetup: [],
  pageErrors: [],
  consoleErrors: [],
  consoleWarnings: [],
  apiFailures: [],
  localRequests: [],
  remoteBlocked: [],
  remoteWebSocketsBlocked: [],
  forbiddenProviderMutationsBlocked: [],
  blockedAgentGatewayPosts: [],
  scopeViolations: [],
  screenshots: [],
  passed: false,
};

const safeAddress = raw => {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}${url.search ? '?[redacted-query]' : ''}`;
  } catch { return '[unparseable address]'; }
};

const cleanText = value => String(value)
  .replace(/https?:\/\/[^\s"'<>]+/g, raw => {
    try {
      const url = new URL(raw);
      const keys = [...new Set(url.searchParams.keys())];
      url.search = keys.length === 0 ? '' : `?${keys.map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')}`;
      url.username = '';
      url.password = '';
      return url.toString();
    } catch { return '[url]'; }
  })
  .slice(0, 1200);

const projectRoute = projectId => `/projects/${encodeURIComponent(projectId)}`;
const nodeSelector = id => `.react-flow__node[data-id="${String(id).replaceAll('"', '\\"')}"]`;

async function coreCall(method, route, body) {
  const response = await fetch(origin + '/api/lcos/core' + route, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Core returned non-JSON for ${method} ${route} (HTTP ${response.status}).`); }
  report.coreSetup.push({ method, path: route, status: response.status, ok: payload?.ok, code: payload?.error?.code,
    label: body?.label, conversationRef: body?.conversationRef, scopeId: body?.scopeId,
    sessionId: body?.conversationSessionId ?? payload?.value?.session?.id });
  return { response, payload };
}

async function requireCoreValue(method, route, body) {
  const result = await coreCall(method, route, body);
  assert.ok(result.response.ok && result.payload?.ok === true && 'value' in result.payload,
    `${method} ${route} did not return the original Core {ok,value} envelope: ${JSON.stringify(result.payload)}`);
  return result.payload.value;
}

async function tapNowJson(route) {
  const response = await fetch(origin + route, { headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Local app returned non-JSON for GET ${route} (HTTP ${response.status}).`); }
  return { response, payload };
}

async function caseRun(name, run) {
  const detail = await run();
  report.cases.push({ name, passed: true, detail });
  console.log('PASS ' + name);
  return detail;
}

async function screenshot(page, name) {
  const file = path.join(visualRoot, `tapnow-native-agent-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
  return file;
}

async function readCanvas() {
  const { response, payload } = await tapNowJson(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`);
  assert.equal(response.status, 200, `Workflow Huabu read failed: HTTP ${response.status}`);
  assert.equal(payload?.code, 0, `Workflow Huabu read returned a non-success TapNow envelope: ${JSON.stringify(payload)}`);
  assert.ok(Array.isArray(payload.data?.nodes), 'Workflow Huabu read did not contain the real node list.');
  return payload.data;
}

let browser;
let page;
let failed = false;
let projectedNodeId;
let reconcileReceiptCapture;
let resolveReconcileReceiptCapture;

try {
  await mkdir(visualRoot, { recursive: true });

  await caseRun('existing live host and isolated Core project are in scope', async () => {
    const health = await (await fetch(origin + '/health')).json();
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress');
    const { response, payload } = await tapNowJson('/api/surface-core/status');
    assert.equal(response.status, 200);
    assert.equal(payload?.code, 0);
    const projectId = payload.data.projectId;
    assert.ok(projectId);
    const workflow = payload.data.surfaces.find(surface => surface.preferredSurface === 'workflow');
    assert.ok(workflow, 'Core did not report a Workflow surface.');
    assert.equal(workflow.canvasId, canvasId);
    report.runtimeProfile = health.profile;
    report.projectId = projectId;
    report.workflow = { workspaceId: workflow.workspaceId, scopeId: workflow.scopeId, canvasId: workflow.canvasId, name: workflow.name };
    return { profile: health.profile, projectId, workflow: report.workflow };
  });

  await caseRun('registered a clearly synthetic, non-running Core conversation with manual history', async () => {
    const projectPath = projectRoute(report.projectId);
    const listRoute = `${projectPath}/connected-conversations`;
    let conversations = await requireCoreValue('GET', listRoute);
    assert.ok(Array.isArray(conversations));
    let conversation = conversations.find(item => item.conversationRef === conversationRef);
    if (!conversation) {
      conversation = await requireCoreValue('POST', listRoute, {
        action: 'connect', provider: 'codex', executorId: 'synthetic-test-executor', conversationRef, label,
      });
    } else {
      assert.equal(conversation.label, label, 'Existing stable synthetic ref belongs to a different test label; preserving it.');
      assert.equal(conversation.isRunning, false, 'Existing stable synthetic ref unexpectedly reports running.');
    }
    assert.ok(conversation.id);
    assert.equal(conversation.label, label);
    assert.equal(conversation.isRunning, false, 'A synthetic registered conversation must not claim execution.');

    let sessionId = conversation.conversationSessionId;
    if (!sessionId) {
      const imported = await requireCoreValue('POST', `${projectPath}/conversations/import-manual`, {
        title: '人工合成历史 · 未运行模型（Workflow 浏览器验证）',
        scopeId: report.workflow.scopeId,
        entries: [
          { role: 'user', contentText: userHistory },
          { role: 'assistant', contentText: assistantHistory },
        ],
      });
      sessionId = imported?.session?.id;
      assert.ok(sessionId, 'Core manual import did not return a canonical ConversationSession id.');
      await requireCoreValue('POST', `${projectPath}/connected-conversations/${encodeURIComponent(conversation.id)}/link-session`, {
        conversationSessionId: sessionId,
      });
    }

    conversations = await requireCoreValue('GET', listRoute);
    const linked = conversations.find(item => item.id === conversation.id);
    assert.ok(linked);
    assert.equal(linked.isRunning, false);
    assert.equal(linked.label, label);
    assert.equal(linked.conversationSessionId, sessionId, 'Core list must report the explicit session link.');
    const timeline = await requireCoreValue('GET', `${projectPath}/connected-conversations/${encodeURIComponent(conversation.id)}/collaboration-timeline?limit=100`);
    const timelineText = JSON.stringify(timeline);
    assert.ok(timelineText.includes(userHistory) && timelineText.includes(assistantHistory), 'Core did not read back both imported manual history entries.');
    report.conversation = { id: linked.id, label: linked.label, provider: linked.provider, isRunning: linked.isRunning,
      conversationRef: linked.conversationRef, conversationSessionId: linked.conversationSessionId,
      manualHistoryEntries: timeline.length, allEntriesReadBack: true, source: 'Core import-manual + explicit link-session' };
    report.externalProviderExecution = false;
    return { conversationId: linked.id, conversationSessionId: linked.conversationSessionId, isRunning: linked.isRunning,
      timelineItems: timeline.length, twoManualEntriesReadBack: true, providerExecution: false };
  });

  await caseRun('Core provider state is read as unavailable, not fabricated as offline/ready', async () => {
    const value = await coreCall('GET', '/runtime/providers');
    assert.equal(value.response.status, 503);
    assert.equal(value.payload?.ok, false);
    assert.equal(value.payload?.error?.code, 'UNAVAILABLE');
    assert.match(value.payload?.error?.message ?? '', /not configured/i);
    report.providerState = { status: value.response.status, code: value.payload.error.code, message: value.payload.error.message, source: 'actual Core response' };
    return report.providerState;
  });

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin !== origin) {
        report.remoteBlocked.push({ method, address: safeAddress(url.href) });
        await route.abort('blockedbyclient');
        return;
      }
      const forbiddenProviderMutation = method === 'POST' && (
        /\/collaboration-send$/.test(url.pathname)
        || /\/conversation-continuations(?:\/|$)/.test(url.pathname)
        || /\/recovery-actions$/.test(url.pathname)
      );
      if (forbiddenProviderMutation) {
        report.forbiddenProviderMutationsBlocked.push({ method, path: url.pathname });
        await route.abort('blockedbyclient');
        return;
      }
      if (method === 'POST' && url.pathname.startsWith('/api/agent-gateway/')) {
        report.blockedAgentGatewayPosts.push({ method, path: url.pathname,
          reason: 'Agent gateway actions are out of scope for this read-only UI flow.' });
        await route.abort('blockedbyclient');
        return;
      }
      if (method === 'POST' && /\/api\/lcos\/canvases\/surface-core-(?!workflow(?:\/|$))/.test(url.pathname)) {
        report.scopeViolations.push({ method, path: url.pathname });
        await route.abort('blockedbyclient');
        return;
      }
      report.localRequests.push({ method, path: url.pathname, status: 'requested' });
      await route.continue();
      return;
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      await route.continue();
      return;
    }
    report.remoteBlocked.push({ method, address: safeAddress(url.href), protocol: url.protocol, reason: 'unknown protocol' });
    await route.abort('blockedbyclient');
  });
  const reconcileCapturePromise = new Promise(resolve => { resolveReconcileReceiptCapture = resolve; });
  await context.route(`**/api/lcos/canvases/${canvasId}/conversations:reconcile`, async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin || route.request().method() !== 'POST') {
      report.scopeViolations.push({ method: route.request().method(), path: requestUrl.pathname });
      await route.abort('blockedbyclient');
      resolveReconcileReceiptCapture({ status: 0, body: null, error: 'reconcile interception rejected wrong origin/method' });
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    reconcileReceiptCapture = { status: response.status(), body };
    report.localRequests.push({ method: 'POST', path: requestUrl.pathname, status: response.status(),
      observedBy: 'transparent Playwright route.fetch/fulfill' });
    resolveReconcileReceiptCapture(reconcileReceiptCapture);
    await route.fulfill({ response });
  });
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async socketRoute => {
      const url = new URL(socketRoute.url());
      if (url.protocol === 'ws:' && url.host === '127.0.0.1:17881') {
        await socketRoute.connect();
        return;
      }
      report.remoteWebSocketsBlocked.push(safeAddress(url.href));
      await socketRoute.close({ code: 1008, reason: 'off-origin websocket blocked for this local experiment' });
    });
  } else {
    report.websocketInterception = 'Playwright context.routeWebSocket is unavailable in installed runtime';
  }
  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(cleanText(error.stack ?? error.message)));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text()));
    else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(cleanText(message.text()));
  });
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const matching = report.localRequests.findLast(row => row.path === url.pathname && row.status === 'requested');
    if (matching) matching.status = response.status();
    if (response.status() >= 400) {
      report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status(),
        expected: url.pathname === '/api/lcos/core/runtime/providers' && response.status() === 503
          || url.pathname === '/api/bff/platform/config' && response.status() === 501
          || /^\/api\/v1\/canvas\/plugins\//.test(url.pathname) && response.status() === 501 });
    }
  });

  await caseRun('Workflow UI loads on the original route with one original ReactFlow root', async () => {
    await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__node', { timeout: 30000 });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const identity = await page.evaluate(() => ({ title: document.title, path: location.pathname,
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
      visibleNodeTypes: [...document.querySelectorAll('.react-flow__node')].map(node => node.className),
      activeSurface: document.querySelector('[data-lcos-surface-active="true"]')?.getAttribute('data-lcos-surface') }));
    assert.equal(identity.path, `/canvas/${canvasId}`);
    assert.match(identity.title, /Workflow/);
    assert.equal(identity.reactFlowRoots, 1);
    assert.equal(identity.activeSurface, 'workflow');
    assert.equal(await page.locator('[data-lcos-surface="main"][data-lcos-surface-active="true"]').count(), 0);
    assert.equal(await page.locator('[data-lcos-surface="context"][data-lcos-surface-active="true"]').count(), 0);
    report.pageIdentity = identity;
    return identity;
  });

  await caseRun('original Agent policy/store path opens the controlled local panel', async () => {
    const close = page.getByRole('button', { name: '关闭 Agent 面板' });
    if (await close.count()) {
      await close.click();
      await page.getByRole('dialog', { name: '本地 Agent 会话入口' }).waitFor({ state: 'hidden', timeout: 10000 });
    }
    const floatingAgentButtons = page.locator('[data-pile-gallery-chrome="bottom-right"] button');
    await floatingAgentButtons.last().waitFor({ state: 'visible', timeout: 10000 });
    const agentTrigger = floatingAgentButtons.last();
    const triggerMarkup = await agentTrigger.evaluate(element => element.outerHTML);
    assert.match(triggerMarkup, /\/agent-motion\//, 'Expected the original Qj Agent floating button, not the external connector.');
    report.originalAgentTrigger = {
      selector: 'original [data-pile-gallery-chrome="bottom-right"] final button with /agent-motion/ Glyth asset',
      sourceOwner: 'canonical MF/Qj; Qj onClick calls the existing setIsOpen(true) action',
      headerPlugExplicitlyAvoided: true,
    };
    await agentTrigger.hover();
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole('button', { name: '关闭 Agent 面板' }).count(), 0,
      'Hovering the original launcher must not open another surface.');
    await agentTrigger.click();
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口' });
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.getByText(label, { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText(/Runtime execution service is not configured\./).waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.react-flow').count(), 1, 'Opening the panel must not create a second canvas/root.');
    const panelBox = await panel.boundingBox();
    report.panelLayout = { box: panelBox, viewport: { width: 1440, height: 1000 }, fitInsideViewport: !!panelBox
      && panelBox.x >= 0 && panelBox.y >= 0 && panelBox.x + panelBox.width <= 1440 && panelBox.y + panelBox.height <= 1000 };
    assert.equal(report.panelLayout.fitInsideViewport, true, 'Original panel shell clipped outside the desktop viewport.');
    await screenshot(page, 'panel');
    const panelText = await panel.innerText();
    assert.ok(panelText.includes(label));
    assert.ok(panelText.includes('Provider 状态未完整'));
    assert.ok(!panelText.includes('正在执行') && !panelText.includes('模型已启动'));
    report.panel = { visibleConversationLabels: [label], providerWarning: 'Runtime execution service is not configured.',
      noPendingFixtureSeeded: true, noRunningClaim: true, sidebarText: panelText.slice(0, 900) };
    return { trigger: report.originalAgentTrigger, panelVisible: true, providerUnavailableShown: true, conversationVisible: true,
      panelBox: report.panelLayout.box, screenshot: report.screenshots.at(-1) };
  });

  const placeButton = page.getByRole('button', { name: `摆放 ${label} 到当前画布` });
  await caseRun('selected conversation projects through the original Core/Huabu reconcile endpoint', async () => {
    assert.equal(await placeButton.count(), 1);
    assert.equal(await placeButton.isDisabled(), false);
    const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(error => ({ navigationError: cleanText(error?.message ?? error) }));
    await placeButton.click();
    let receiptTimeout;
    const captured = await Promise.race([
      reconcileCapturePromise,
      new Promise(resolve => { receiptTimeout = setTimeout(() => resolve({ status: 0, body: null,
        error: 'timed out waiting for reconcile receipt capture' }), 30000); }),
    ]);
    clearTimeout(receiptTimeout);
    assert.ok(captured && !captured.error, captured?.error ?? 'No reconcile receipt was captured.');
    const responseStatus = captured.status;
    const receipt = captured.body;
    const navigation = await navigationPromise;
    assert.ok(!navigation?.navigationError, `Reconcile succeeded but the original route did not reload: ${navigation?.navigationError ?? ''}`);
    assert.equal(responseStatus, 200, JSON.stringify(receipt));
    assert.equal(receipt?.code, 0, JSON.stringify(receipt));
    assert.equal(receipt?.data?.canvas_id, canvasId);
    assert.equal(receipt?.data?.provider_execution_started, false);
    assert.ok(Array.isArray(receipt?.data?.bindings));
    const binding = receipt.data.bindings.find(item => item.entityType === 'conversation' && item.entityId === report.conversation.id);
    assert.ok(binding?.spatialId, `Exact selected Core conversation is missing from reconcile receipt: ${JSON.stringify(receipt.data.bindings)}`);
    projectedNodeId = binding.spatialId;
    report.reconcileReceipt = { status: responseStatus, code: receipt.code, canvasId: receipt.data.canvas_id,
      selectedConnectedConversationId: report.conversation.id, binding: { spatialId: binding.spatialId, entityType: binding.entityType,
        entityId: binding.entityId, workspaceId: binding.workspaceId }, providerExecutionStarted: receipt.data.provider_execution_started,
      reloadObserved: navigation !== null };
    await page.waitForSelector(nodeSelector(projectedNodeId), { timeout: 30000 });
    const close = page.getByRole('button', { name: '关闭 Agent 面板' });
    if (await close.count()) await close.click();
    await page.getByRole('dialog', { name: '本地 Agent 会话入口' }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    const state = await readCanvas();
    const node = state.nodes.find(item => item.id === projectedNodeId);
    assert.ok(node, 'Huabu canvas readback omitted the reconciled node.');
    assert.equal(node.type, 'lcos-conversation');
    assert.equal(node.data?.lcos_conversation_ref?.projectId, report.projectId);
    assert.equal(node.data?.lcos_conversation_ref?.connectedConversationId, report.conversation.id);
    assert.equal(node.data?.lcos_conversation_ref?.canvasId, canvasId);
    report.projectedNode = { id: node.id, type: node.type, position: node.position,
      reference: node.data.lcos_conversation_ref, huabuReadback: true, selectedNodeFromReceipt: true };
    const coreWorkspaces = await requireCoreValue('GET', `${projectRoute(report.projectId)}/workspaces`);
    assert.ok(coreWorkspaces.some(workspace => workspace.id === report.workflow.workspaceId && workspace.scopeId === report.workflow.scopeId));
    const coreConversations = await requireCoreValue('GET', `${projectRoute(report.projectId)}/connected-conversations`);
    const coreConversation = coreConversations.find(item => item.id === report.conversation.id);
    assert.ok(coreConversation);
    assert.equal(coreConversation.isRunning, false);
    return { receipt: report.reconcileReceipt, huabuNode: report.projectedNode, coreConversationStillNotRunning: true };
  });

  await caseRun('original Glyth leaf opens Work View and reads Core capabilities plus imported event history', async () => {
    const node = page.locator(nodeSelector(projectedNodeId));
    await node.waitFor({ state: 'visible' });
    const shell = node.locator('.lcos-conversation-node-shell');
    assert.equal(await shell.count(), 1);
    const glyph = shell.locator('svg[data-lcos-glyth-vector][data-figma-node-id="5388:119"]');
    await glyph.waitFor({ state: 'visible', timeout: 15000 });
    await screenshot(page, 'projected-node');
    const title = node.getByRole('button', { name: label, exact: true });
    await title.click();
    const workView = node.locator('[data-lcos-workview="conversation"]');
    await workView.waitFor({ state: 'visible', timeout: 20000 });
    await workView.getByText(userHistory, { exact: true }).waitFor({ timeout: 20000 });
    await workView.getByText(assistantHistory, { exact: true }).waitFor({ timeout: 20000 });
    await workView.getByText(/Provider 会话能力未配置或未获 Core 确认/).waitFor({ timeout: 10000 });
    const observed = await workView.innerText();
    assert.ok(observed.includes(userHistory) && observed.includes(assistantHistory));
    assert.ok(observed.includes('不可用 · 续聊发送'));
    report.workView = { status: await shell.getAttribute('data-lcos-workview-state'),
      donorEventViews: await workView.locator('[data-lcos-timeline-item]').count(),
      userHistoryVisible: observed.includes(userHistory), assistantHistoryVisible: observed.includes(assistantHistory),
      providerCapabilitiesExplicitlyUnavailable: observed.includes('Provider 会话能力未配置或未获 Core 确认'),
      noProviderAction: true };
    await screenshot(page, 'workview');
    return report.workView;
  });

  await caseRun('real pointer drag changes Workflow Huabu geometry and survives refresh', async () => {
    const nodeLocator = page.locator(nodeSelector(projectedNodeId));
    const closeWorkView = page.getByRole('button', { name: '关闭协作会话工作视图' });
    if (await closeWorkView.count()) await closeWorkView.click();
    const agentPanelClose = page.getByRole('button', { name: '关闭 Agent 面板' });
    if (await agentPanelClose.count()) await agentPanelClose.click();
    await page.getByRole('dialog', { name: '本地 Agent 会话入口' }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    const beforeCanvas = await readCanvas();
    const before = beforeCanvas.nodes.find(item => item.id === projectedNodeId);
    assert.ok(before);
    const shell = nodeLocator.locator('.lcos-conversation-node-shell');
    await shell.scrollIntoViewIfNeeded();
    const box = await shell.boundingBox();
    assert.ok(box && box.width > 20 && box.height > 8, `Conversation node shell has no usable hit area at current canvas zoom: ${JSON.stringify(box)}`);
    const from = { x: box.x + Math.min(8, box.width / 8), y: box.y + box.height / 2 };
    const to = { x: from.x + 120, y: from.y + 70 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.mouse.up();
    let afterCanvas;
    let after;
    const readbackDeadline = Date.now() + 8000;
    do {
      await page.waitForTimeout(350);
      afterCanvas = await readCanvas();
      after = afterCanvas.nodes.find(item => item.id === projectedNodeId);
    } while (after && after.position.x === before.position.x && after.position.y === before.position.y && Date.now() < readbackDeadline);
    assert.ok(after);
    assert.ok(after.position.x !== before.position.x || after.position.y !== before.position.y,
      `Node position did not change after pointer drag: before=${JSON.stringify(before.position)}, after=${JSON.stringify(after.position)}`);
    assert.equal(after.type, 'lcos-conversation');
    assert.equal(after.data?.lcos_conversation_ref?.connectedConversationId, report.conversation.id);
    report.drag = { from, to, beforePosition: before.position, afterPosition: after.position,
      changedInHuabuReadback: true, sameCoreConversationBinding: true };
    await screenshot(page, 'dragged');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
    await page.waitForSelector(nodeSelector(projectedNodeId), { timeout: 30000 });
    const close = page.getByRole('button', { name: '关闭 Agent 面板' });
    if (await close.count()) await close.click();
    const reloadedCanvas = await readCanvas();
    const reloaded = reloadedCanvas.nodes.find(item => item.id === projectedNodeId);
    assert.ok(reloaded);
    assert.equal(reloaded.position.x, after.position.x);
    assert.equal(reloaded.position.y, after.position.y);
    assert.equal(reloaded.data?.lcos_conversation_ref?.connectedConversationId, report.conversation.id);
    assert.equal(await page.locator('.react-flow').count(), 1);
    assert.equal(await page.locator('.react-flow__node-lcos-conversation').count(), 1);
    assert.equal(new URL(page.url()).pathname, `/canvas/${canvasId}`);
    report.reloadPersistence = { sameNodeId: reloaded.id, position: reloaded.position,
      sameCoreReference: true, oneOriginalReactFlowRoot: true, remainsOnWorkflowRoute: true };
    await screenshot(page, 'reloaded');
    return { drag: report.drag, reloadPersistence: report.reloadPersistence };
  });

  assert.deepEqual(report.forbiddenProviderMutationsBlocked, [], 'Browser attempted a forbidden provider mutation; it was blocked.');
  assert.deepEqual(report.scopeViolations, [], 'Browser attempted to mutate a non-Workflow surface.');
  assert.deepEqual(report.pageErrors, [], `Browser page errors: ${JSON.stringify(report.pageErrors)}`);
  const unexpectedApiFailures = report.apiFailures.filter(row => !row.expected);
  assert.deepEqual(unexpectedApiFailures, [], `Unexpected API failures: ${JSON.stringify(unexpectedApiFailures)}`);
  const expectedOfflineConsole = report.consoleErrors.filter(message => message.includes('[Statsig]')
    || /status of 501|status of 503|ERR_BLOCKED_BY_CLIENT/i.test(message));
  const unexpectedConsoleErrors = report.consoleErrors.filter(message => !expectedOfflineConsole.includes(message));
  report.consoleHealth = {
    unexpectedErrors: unexpectedConsoleErrors,
    expectedOfflineOrUnconfiguredNoise: expectedOfflineConsole,
    disconnectedVendorHttpFailures: report.apiFailures.filter(row => row.status === 501),
    blockedAgentGatewayPosts: report.blockedAgentGatewayPosts,
  };
  assert.deepEqual(unexpectedConsoleErrors, [], `Unexpected browser console errors: ${JSON.stringify(unexpectedConsoleErrors)}`);
  report.passed = true;
} catch (error) {
  failed = true;
  report.passed = false;
  report.failure = cleanText(error?.stack ?? error?.message ?? error);
  if (page) {
    try { await screenshot(page, `failure-${Date.now()}`); } catch { /* Preserve primary test failure. */ }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  const evidencePath = path.join(root, 'evidence', 'native-agent-browser.json');
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length,
  providerState: report.providerState, conversation: report.conversation, reconcileReceipt: report.reconcileReceipt,
  workView: report.workView, drag: report.drag, reloadPersistence: report.reloadPersistence,
  pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length,
  expectedProviderFailures: report.apiFailures.filter(row => row.expected), remoteBlocked: report.remoteBlocked,
  forbiddenProviderMutationsBlocked: report.forbiddenProviderMutationsBlocked, blockedAgentGatewayPosts: report.blockedAgentGatewayPosts,
  scopeViolations: report.scopeViolations, screenshots: report.screenshots, failure: report.failure }, null, 2));
if (failed) process.exitCode = 1;
