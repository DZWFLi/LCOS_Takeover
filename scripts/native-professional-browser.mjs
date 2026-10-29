import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canvasId = 'surface-core-workflow';
const conversationRef = 'synthetic-native-agent-ui-20261014-workflow';
const conversationLabel = '合成会话历史 · 未运行模型';
const userHistory = '人工合成历史浏览器验证：用户提供的合成历史条目。';
const assistantHistory = '人工合成历史浏览器验证：此内容为预先导入，未运行模型也未触发 Provider。';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const evidencePath = path.join(root, 'evidence', 'native-professional-browser.json');
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function localOriginFromInput(value) {
  assert.ok(value, 'Pass --base-url http://127.0.0.1:<deployed-port> or set NATIVE_PROFESSIONAL_BASE_URL.');
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), 'The deployed local app must use HTTP(S).');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'This browser proof is restricted to a loopback host.');
  assert.equal(url.pathname, '/', 'Pass only the local origin, not a nested route.');
  assert.equal(url.search, '', 'The local base URL must not contain query parameters.');
  assert.equal(url.hash, '', 'The local base URL must not contain a fragment.');
  assert.equal(url.username, '', 'Credentials are not accepted in the local base URL.');
  assert.equal(url.password, '', 'Credentials are not accepted in the local base URL.');
  return url.origin;
}

if (!process.argv.includes('--deployed')) {
  console.error('Not run: wait for Root final deployment, then pass --deployed and --base-url.');
  process.exit(2);
}

const origin = localOriginFromInput(cliValue('--base-url') ?? process.env.NATIVE_PROFESSIONAL_BASE_URL);
const workflowUrl = `${origin}/canvas/${canvasId}`;
const report = {
  schema: 'native-professional-browser-v1',
  at: new Date().toISOString(),
  run: true,
  target: workflowUrl,
  flow: 'existing Workflow Glyth node button → original ProfessionalWindowStage conversation window → actual Core userState/manual event views → canvas zoom diagnostic → close/reopen dedupe',
  scope: {
    surface: 'workflow',
    canvasId,
    onlyWorkflowMutationAllowed: true,
    mainOrContextMutationAttempted: false,
    syntheticConversationRef: conversationRef,
    externalProviderExecutionAllowed: false,
    modelPostsAllowed: false,
  },
  browser: 'installed playwright-core; fresh Chrome context; headless; 1440x1000; service workers blocked; same-origin HTTP/WebSocket only',
  browserPlugin: 'Browser runtime is not part of this standalone local script; explicit Playwright browser verification requested.',
  setupCalls: [],
  pageIdentity: null,
  conversation: null,
  projection: null,
  reconcile: null,
  professionalWindow: null,
  zoomDiagnostic: null,
  reopen: null,
  cases: [],
  pageErrors: [],
  consoleErrors: [],
  consoleWarnings: [],
  requestFailures: [],
  apiFailures: [],
  sseResponses: [],
  localRequests: [],
  remoteBlocked: [],
  remoteWebSocketsBlocked: [],
  forbiddenProviderMutationsBlocked: [],
  blockedAgentGatewayPosts: [],
  blockedOtherWrites: [],
  scopeViolations: [],
  screenshots: [],
  failure: null,
  passed: false,
  notes: [
    'HTTP errors, remote blocks, and blocked Agent Gateway requests are retained individually; passing this target flow does not claim zero global application errors.',
    'Only the Workflow canvas is eligible for an optional UI reconcile. Main and Context mutations are blocked.',
    'Provider execution, continuation send, recovery mutations, and model requests are forbidden.',
  ],
};

const safeAddress = raw => {
  try {
    const url = new URL(raw);
    const keys = [...new Set(url.searchParams.keys())];
    url.search = keys.length === 0 ? '' : `?${keys.map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')}`;
    url.username = '';
    url.password = '';
    return url.toString();
  } catch { return '[unparseable address]'; }
};

const cleanText = value => String(value)
  .replace(/https?:\/\/[^\s"'<>]+/g, raw => safeAddress(raw))
  .replace(/(authorization|token|secret|api.?key)=([^&\s]+)/gi, '$1=[redacted]')
  .slice(0, 1400);

const projectPath = projectId => `/projects/${encodeURIComponent(projectId)}`;
const nodeSelector = id => `.react-flow__node[data-id="${String(id).replaceAll('"', '\\"')}"]`;
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

async function readJson(url, init, label) {
  const response = await fetch(url, init);
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${label} returned non-JSON (HTTP ${response.status}).`); }
  return { response, payload };
}

async function coreCall(method, route, body) {
  const response = await fetch(`${origin}/api/lcos/core${route}`, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`Core ${method} ${route} returned non-JSON (HTTP ${response.status}).`); }
  report.setupCalls.push({ method, path: route, status: response.status,
    ok: payload?.ok, errorCode: payload?.error?.code,
    writePurpose: body === undefined ? undefined : method === 'POST' ? 'explicit synthetic manual-history setup only' : undefined });
  if (response.status >= 400) report.apiFailures.push({ source: 'direct Core setup', method, path: route,
    status: response.status, classification: 'Core setup API failure' });
  return { response, payload };
}

async function coreValue(method, route, body) {
  const result = await coreCall(method, route, body);
  assert.ok(result.response.ok && result.payload?.ok === true && 'value' in result.payload,
    `Core ${method} ${route} did not return a successful Core {ok,value} envelope: ${JSON.stringify({ status: result.response.status, error: result.payload?.error })}`);
  return result.payload.value;
}

async function readWorkflowCanvas() {
  const { response, payload } = await readJson(
    `${origin}/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`,
    { headers: { Accept: 'application/json' } },
    'Workflow Canvas read',
  );
  report.setupCalls.push({ method: 'GET', path: `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`,
    status: response.status, code: payload?.code, source: 'direct Workflow readback' });
  if (response.status >= 400) report.apiFailures.push({ source: 'direct Workflow readback', method: 'GET',
    path: `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`, status: response.status,
    classification: 'Workflow Canvas API failure' });
  assert.equal(response.status, 200, `Workflow Canvas read failed (HTTP ${response.status}).`);
  assert.equal(payload?.code, 0, 'Workflow Canvas read returned a non-success TapNow envelope.');
  assert.ok(Array.isArray(payload.data?.nodes), 'Workflow Canvas response omitted nodes.');
  return payload.data;
}

async function ensureSyntheticConversation(projectId, workflow) {
  const base = projectPath(projectId);
  const listRoute = `${base}/connected-conversations`;
  let list = await coreValue('GET', listRoute);
  assert.ok(Array.isArray(list), 'Core ConnectedConversation response is not a list.');
  let conversation = list.find(item => item?.conversationRef === conversationRef);
  let createdHere = false;
  if (conversation === undefined) {
    conversation = await coreValue('POST', listRoute, {
      action: 'connect',
      provider: 'codex',
      executorId: 'synthetic-test-executor',
      conversationRef,
      label: conversationLabel,
    });
    createdHere = true;
  } else {
    assert.equal(conversation.label, conversationLabel, 'Stable synthetic ref already exists with another label; preserve it and stop.');
    assert.equal(conversation.isRunning, false, 'Stable synthetic ref unexpectedly reports running; preserve it and stop.');
  }
  assert.ok(isRecord(conversation) && typeof conversation.id === 'string' && conversation.id.length > 0);
  assert.equal(conversation.conversationRef, conversationRef);
  assert.equal(conversation.label, conversationLabel);
  assert.equal(conversation.isRunning, false, 'This test must never represent provider execution.');
  assert.ok(!conversation.conversationRef.startsWith('pending-'), 'Pending references cannot be projected as connected agents.');

  let conversationSessionId = conversation.conversationSessionId;
  if (!conversationSessionId) {
    assert.ok(createdHere, 'Existing Core identity has no linked manual session; refusing to mutate an existing registration implicitly.');
    const imported = await coreValue('POST', `${base}/conversations/import-manual`, {
      title: '人工合成历史 · 未运行模型（Professional Work View 验证）',
      scopeId: workflow.scopeId,
      workspaceId: workflow.workspaceId,
      entries: [
        { role: 'user', contentText: userHistory },
        { role: 'assistant', contentText: assistantHistory },
      ],
    });
    conversationSessionId = imported?.session?.id;
    assert.ok(typeof conversationSessionId === 'string' && conversationSessionId.length > 0,
      'Core manual import did not return a canonical ConversationSession id.');
    await coreValue('POST', `${base}/connected-conversations/${encodeURIComponent(conversation.id)}/link-session`, {
      conversationSessionId,
    });
  }

  list = await coreValue('GET', listRoute);
  const linked = list.find(item => item?.id === conversation.id);
  assert.ok(linked, 'Core list omitted the exact synthetic conversation.');
  assert.equal(linked.isRunning, false);
  assert.equal(linked.conversationSessionId, conversationSessionId, 'Core list did not confirm the linked manual session.');

  const identity = await coreValue('GET', `${base}/connected-conversations/${encodeURIComponent(linked.id)}/collaboration-session`);
  assert.ok(isRecord(identity) && identity.projectId === projectId && identity.conversationId === linked.id,
    'Core collaboration-session returned the wrong identity.');
  assert.ok(['ready', 'thinking', 'working', 'needs_user', 'done', 'unavailable'].includes(identity.userState),
    'Core collaboration-session did not report an actual userState.');
  assert.ok(isRecord(identity.capabilities), 'Core collaboration-session did not include capabilities.');

  const timeline = await coreValue('GET', `${base}/connected-conversations/${encodeURIComponent(linked.id)}/collaboration-timeline?limit=100`);
  assert.ok(Array.isArray(timeline), 'Core collaboration-timeline is not a list.');
  const timelineText = JSON.stringify(timeline);
  assert.ok(timelineText.includes(userHistory) && timelineText.includes(assistantHistory),
    'The existing linked session does not read back the two explicit synthetic manual entries.');
  report.conversation = {
    id: linked.id,
    label: linked.label,
    provider: linked.provider,
    isRunning: linked.isRunning,
    conversationRef: linked.conversationRef,
    conversationSessionId,
    createdDuringThisRun: createdHere,
    historySource: createdHere ? 'Core connect + import-manual + link-session' : 'existing Core registration/session; read only',
    timelineCount: timeline.length,
    bothManualEntriesReadBack: true,
    providerExecutionStarted: false,
  };
  report.projection = {
    userState: identity.userState,
    capabilities: identity.capabilities,
    projectId: identity.projectId,
    conversationId: identity.conversationId,
    timelineItems: timeline.length,
    historyContentReadBack: [userHistory, assistantHistory],
    sseObservedInBrowser: false,
  };
  return { conversation: linked, identity, timeline };
}

function stateLabelForProjection(projection) {
  if (projection.activity?.pendingInputId) return '等你回答';
  if (projection.recentReturns?.some(item => item.status === 'pending_review')) return '需要复核';
  if (projection.recovery?.state === 'recovering') return '正在恢复';
  if (projection.recovery?.state === 'recoverable' || projection.recovery?.state === 'blocked') return '需要恢复';
  return ({ ready: '可以继续', thinking: '正在理解', working: '正在执行', needs_user: '需要你处理',
    done: '本轮已完成', unavailable: '暂时不可用' })[projection.userState];
}

async function caseRun(name, run) {
  const detail = await run();
  report.cases.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
  return detail;
}

async function screenshot(page, name) {
  await mkdir(visualRoot, { recursive: true });
  const filename = path.join(visualRoot, `tapnow-native-professional-${name}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  report.screenshots.push(filename);
  return filename;
}

let browser;
let context;
let page;
let failure;
let conversationId;
let reconcileReceipt;
let projectId;
let workflow;

try {
  const healthResult = await readJson(`${origin}/health`, { headers: { Accept: 'application/json' } }, 'Local health');
  report.setupCalls.push({ method: 'GET', path: '/health', status: healthResult.response.status, profile: healthResult.payload?.profile });
  if (healthResult.response.status >= 400) report.apiFailures.push({ source: 'direct preflight', method: 'GET',
    path: '/health', status: healthResult.response.status, classification: 'local health preflight failure' });
  assert.equal(healthResult.response.status, 200, 'Final deployed local service did not pass /health.');
  report.runtimeProfile = healthResult.payload?.profile ?? 'profile-not-reported';
  const surfaceResult = await readJson(`${origin}/api/surface-core/status`, { headers: { Accept: 'application/json' } }, 'Surface Core status');
  report.setupCalls.push({ method: 'GET', path: '/api/surface-core/status', status: surfaceResult.response.status,
    code: surfaceResult.payload?.code, projectId: surfaceResult.payload?.data?.projectId });
  if (surfaceResult.response.status >= 400) report.apiFailures.push({ source: 'direct preflight', method: 'GET',
    path: '/api/surface-core/status', status: surfaceResult.response.status, classification: 'Core surface status failure' });
  assert.equal(surfaceResult.response.status, 200);
  assert.equal(surfaceResult.payload?.code, 0, 'Surface Core status returned a non-success TapNow envelope.');
  projectId = surfaceResult.payload?.data?.projectId;
  workflow = surfaceResult.payload?.data?.surfaces?.find(surface => surface?.preferredSurface === 'workflow');
  assert.ok(typeof projectId === 'string' && projectId.length > 0, 'No current Core project id was provided.');
  assert.ok(workflow && workflow.canvasId === canvasId && typeof workflow.workspaceId === 'string' && typeof workflow.scopeId === 'string',
    'The current Core status does not map the Workflow canvas/workspace/scope exactly.');
  report.projectId = projectId;
  report.workflow = { canvasId: workflow.canvasId, workspaceId: workflow.workspaceId, scopeId: workflow.scopeId, name: workflow.name };

  const setup = await ensureSyntheticConversation(projectId, workflow);
  conversationId = setup.conversation.id;
  let workflowCanvas = await readWorkflowCanvas();
  let matchingNodes = workflowCanvas.nodes.filter(node => node?.type === 'lcos-conversation'
    && node?.data?.lcos_conversation_ref?.projectId === projectId
    && node?.data?.lcos_conversation_ref?.connectedConversationId === conversationId
    && node?.data?.lcos_conversation_ref?.canvasId === canvasId);

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin !== origin) {
        report.remoteBlocked.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' });
        await route.abort('blockedbyclient');
        return;
      }
      if (method === 'POST' && url.pathname.startsWith('/api/agent-gateway/')) {
        report.blockedAgentGatewayPosts.push({ method, path: url.pathname, reason: 'Agent Gateway is outside this read-only Work View test.' });
        await route.abort('blockedbyclient');
        return;
      }
      if (method === 'POST' && (/\/collaboration-send$/.test(url.pathname)
        || /\/conversation-continuations(?:\/|$)/.test(url.pathname)
        || /\/recovery-actions$/.test(url.pathname)
        || /\/runtime\/(?:runs|dispatch|execute)(?:\/|$)/.test(url.pathname))) {
        report.forbiddenProviderMutationsBlocked.push({ method, path: url.pathname });
        await route.abort('blockedbyclient');
        return;
      }
      const workflowReconcilePath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/conversations:reconcile`;
      const isWorkflowReconcile = method === 'POST' && url.pathname === workflowReconcilePath;
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !isWorkflowReconcile) {
        report.blockedOtherWrites.push({ method, path: url.pathname, reason: 'only the explicit Workflow conversation reconcile may mutate during the browser flow' });
        if (/surface-core-(?:main|context)/.test(url.pathname)) report.scopeViolations.push({ method, path: url.pathname });
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
    report.remoteBlocked.push({ method, address: safeAddress(url.href), protocol: url.protocol, reason: 'unknown protocol blocked' });
    await route.abort('blockedbyclient');
  });

  await context.route(`**/api/lcos/canvases/${encodeURIComponent(canvasId)}/conversations:reconcile`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    let body;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    if (url.origin !== origin || request.method() !== 'POST' || body?.connectedConversationId !== conversationId) {
      report.scopeViolations.push({ method: request.method(), path: url.pathname, body: body ?? '[unreadable]' });
      await route.abort('blockedbyclient');
      return;
    }
    const response = await route.fetch();
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    reconcileReceipt = { status: response.status(), payload };
    report.reconcile = { status: response.status(), code: payload?.code, canvasId: payload?.data?.canvas_id,
      selectedConnectedConversationId: body.connectedConversationId,
      providerExecutionStarted: payload?.data?.provider_execution_started,
      bindingCount: Array.isArray(payload?.data?.bindings) ? payload.data.bindings.length : null };
    await route.fulfill({ response });
  });

  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async socketRoute => {
      const address = new URL(socketRoute.url());
      const current = new URL(origin);
      const expectedProtocol = current.protocol === 'https:' ? 'wss:' : 'ws:';
      if (address.protocol === expectedProtocol && address.host === current.host) {
        await socketRoute.connect();
        return;
      }
      report.remoteWebSocketsBlocked.push(safeAddress(address.href));
      await socketRoute.close({ code: 1008, reason: 'off-origin websocket blocked for this local test' });
    });
  } else {
    report.websocketInterception = 'routeWebSocket unavailable in the installed Playwright runtime';
  }

  page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(cleanText(error.stack ?? error.message)));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text()));
    else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(cleanText(message.text()));
  });
  page.on('requestfailed', request => report.requestFailures.push({ method: request.method(), address: safeAddress(request.url()),
    error: cleanText(request.failure()?.errorText ?? 'request failed') }));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const matching = report.localRequests.findLast(row => row.path === url.pathname && row.status === 'requested');
    if (matching) matching.status = response.status();
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('text/event-stream')) report.sseResponses.push({ method: response.request().method(), path: url.pathname,
      status: response.status(), contentType, actualHttpSseResponse: true });
    if (response.status() >= 400) {
      report.apiFailures.push({ method: response.request().method(), path: url.pathname, status: response.status(),
        classification: url.pathname === '/api/lcos/core/runtime/providers' && response.status() >= 400
          ? 'actual-provider-status-read-failure-or-unconfigured'
          : url.pathname === '/api/bff/platform/config' && response.status() === 501
            || /^\/api\/v1\/canvas\/plugins\//.test(url.pathname) && response.status() === 501
            ? 'known-disconnected-vendor-background-route'
            : 'unclassified-local-api-failure' });
    }
  });
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());

  await caseRun('fresh Workflow route and single original Canvas root', async () => {
    await page.goto(workflowUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
    await page.waitForTimeout(900);
    const existingAgentPanelClose = page.getByRole('button', { name: '关闭 Agent 面板', exact: true });
    if (await existingAgentPanelClose.count() && await existingAgentPanelClose.isVisible()) {
      await existingAgentPanelClose.click();
      await page.getByRole('dialog', { name: '本地 Agent 会话入口' }).waitFor({ state: 'hidden', timeout: 10000 });
    }
    const identity = await page.evaluate(() => ({ title: document.title, pathname: location.pathname,
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      surfaceState: document.querySelector('[data-lcos-professional-surface-state]')?.getAttribute('data-lcos-professional-surface-state') ?? null }));
    assert.equal(identity.pathname, `/canvas/${canvasId}`);
    assert.equal(identity.reactFlowRoots, 1, 'The native host must retain one original ReactFlow root.');
    assert.equal(identity.canvasId, canvasId, 'NodeBridge did not identify the Workflow Canvas.');
    report.pageIdentity = identity;
    await screenshot(page, 'workflow-canvas');
    return identity;
  });

  if (matchingNodes.length === 0) {
    await caseRun('missing projected node is created only through the original controlled Agent panel', async () => {
      const launchers = page.locator('[data-pile-gallery-chrome="bottom-right"] button');
      await launchers.last().waitFor({ state: 'visible', timeout: 12000 });
      const originalTriggerMarkup = await launchers.last().evaluate(element => element.outerHTML);
      assert.match(originalTriggerMarkup, /\/agent-motion\//, 'Expected the existing local Agent launcher; external connector is out of scope.');
      await launchers.last().click();
      const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口' });
      await panel.waitFor({ state: 'visible', timeout: 10000 });
      const projectButton = page.getByRole('button', { name: `摆放 ${conversationLabel} 到当前画布`, exact: true });
      await projectButton.waitFor({ state: 'visible', timeout: 15000 });
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(error => ({ error: cleanText(error.message) }));
      await projectButton.click();
      await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
      const navigation = await nav;
      assert.ok(!navigation?.error, `Workflow projection did not return through its original route reload: ${navigation?.error ?? ''}`);
      assert.equal(reconcileReceipt?.status, 200, 'Original panel reconcile did not return HTTP 200.');
      assert.equal(reconcileReceipt?.payload?.code, 0, 'Original panel reconcile returned a non-success envelope.');
      assert.equal(reconcileReceipt?.payload?.data?.canvas_id, canvasId);
      assert.equal(reconcileReceipt?.payload?.data?.provider_execution_started, false);
      matchingNodes = (await readWorkflowCanvas()).nodes.filter(node => node?.type === 'lcos-conversation'
        && node?.data?.lcos_conversation_ref?.projectId === projectId
        && node?.data?.lcos_conversation_ref?.connectedConversationId === conversationId
        && node?.data?.lcos_conversation_ref?.canvasId === canvasId);
      assert.equal(matchingNodes.length, 1, 'Workflow projection did not produce exactly one real bound Glyth node.');
      const closePanel = page.getByRole('button', { name: '关闭 Agent 面板' });
      if (await closePanel.count()) await closePanel.click();
      return { launcher: 'original bottom-right Agent glyph; external connector not used',
        reconcileReceipt: report.reconcile, oneCoreBoundWorkflowNode: true, providerExecutionStarted: false };
    });
  } else {
    await caseRun('existing Core-bound Workflow Glyth node readback', async () => {
      assert.equal(matchingNodes.length, 1, 'Expected one existing Core-bound Glyth node on Workflow.');
      report.projectedNode = { id: matchingNodes[0].id, type: matchingNodes[0].type,
        position: matchingNodes[0].position, reference: matchingNodes[0].data.lcos_conversation_ref,
        source: 'read-only current Workflow Huabu/Core projection' };
      return report.projectedNode;
    });
  }

  assert.equal(matchingNodes.length, 1, 'The Workflow canvas must contain exactly one node for this connected conversation.');
  const projectedNodeId = matchingNodes[0].id;
  const node = page.locator(nodeSelector(projectedNodeId));
  await node.waitFor({ state: 'visible', timeout: 30000 });
  const glyth = node.locator('svg[data-lcos-glyth-vector][data-figma-node-id="5388:119"]');
  await glyth.waitFor({ state: 'visible', timeout: 15000 });

  await caseRun('original Glyth node button opens the complete Professional conversation window', async () => {
    const opener = node.getByRole('button', { name: conversationLabel, exact: true });
    await opener.click();
    const stage = page.locator('[data-lcos-professional-stage]');
    await stage.waitFor({ state: 'visible', timeout: 20000 });
    const body = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${conversationId}"]`);
    await body.waitFor({ state: 'visible', timeout: 20000 });
    const view = body.locator('[data-lcos-conversation-work-view]');
    await view.waitFor({ state: 'visible', timeout: 20000 });
    await view.getByText(userHistory, { exact: true }).waitFor({ timeout: 20000 });
    await view.getByText(assistantHistory, { exact: true }).waitFor({ timeout: 20000 });
    const eventViews = view.locator('[data-lcos-timeline-item]');
    await eventViews.first().waitFor({ state: 'visible', timeout: 15000 });
    const actualUserEvents = await view.locator('[data-lcos-timeline-item="user_message"]').count();
    const actualAssistantEvents = await view.locator('[data-lcos-timeline-item="agent_message"]').count();
    assert.ok(actualUserEvents > 0 && actualAssistantEvents > 0, 'The original event renderer did not expose both Core message kinds.');
    const collaborationBase = `${origin}/api/lcos/core${projectPath(projectId)}/connected-conversations/${encodeURIComponent(conversationId)}`;
    const browserSessionReads = report.localRequests.filter(row => row.method === 'GET'
      && row.path === new URL(`${collaborationBase}/collaboration-session`).pathname);
    const browserTimelineReads = report.localRequests.filter(row => row.method === 'GET'
      && row.path === new URL(`${collaborationBase}/collaboration-timeline`).pathname);
    assert.ok(browserSessionReads.length > 0, 'The mounted original Work View did not read the Core session projection from the browser.');
    assert.ok(browserTimelineReads.length > 0, 'The mounted original Work View did not read the Core timeline from the browser.');

    const original = await page.evaluate(({ conversationId: targetId }) => {
      const stageElement = document.querySelector('[data-lcos-professional-stage]');
      const pane = [...document.querySelectorAll('[data-lcos-window-pane]')]
        .find(element => element.querySelector(`[data-lcos-window-body="conversation"][data-lcos-window-target="${CSS.escape(targetId)}"]`));
      const region = pane?.closest('[data-lcos-window-region-id]');
      const bodyElement = pane?.querySelector(`[data-lcos-window-body="conversation"][data-lcos-window-target="${CSS.escape(targetId)}"]`);
      const title = pane?.querySelector('[data-lcos-window-title]');
      const close = pane?.querySelector('button[aria-label="关闭窗口"]');
      const userState = bodyElement?.querySelector('[data-lcos-conversation-user-state]');
      const message = bodyElement?.querySelector('[data-lcos-timeline-item="user_message"] .lcos-conversation-event-body');
      const rect = element => {
        const box = element?.getBoundingClientRect();
        return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
      };
      return {
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
        stageVisible: !!stageElement && getComputedStyle(stageElement).display !== 'none',
        stageOutsideCanvas: !!stageElement && !stageElement.closest('.react-flow'),
        stagePortalParentIsBody: stageElement?.parentElement === document.body,
        bodyCountForConversation: document.querySelectorAll(`[data-lcos-window-body="conversation"][data-lcos-window-target="${CSS.escape(targetId)}"]`).length,
        region: rect(region),
        titleText: title?.textContent?.trim() ?? null,
        titleFontSize: title ? getComputedStyle(title).fontSize : null,
        closeButtonAccessibleName: close?.getAttribute('aria-label') ?? null,
        userStateText: userState?.textContent?.trim() ?? null,
        eventTextRect: rect(message),
        eventTextFontSize: message ? getComputedStyle(message).fontSize : null,
      };
    }, { conversationId });

    assert.equal(original.reactFlowRoots, 1, 'Opening a Professional window must not mount a second Canvas.');
    assert.equal(original.stageOutsideCanvas, true, 'ProfessionalStage must remain screen-space, not nested under the zoomed Canvas.');
    assert.equal(original.stagePortalParentIsBody, true, 'ProfessionalStage must use the same React root portal into body.');
    assert.equal(original.bodyCountForConversation, 1, 'Original shell store should materialize one target window.');
    assert.ok(original.titleText?.includes(conversationLabel), 'Original WindowChrome title did not identify the connected conversation.');
    assert.equal(original.closeButtonAccessibleName, '关闭窗口', 'Original WindowChrome close control is missing.');
    assert.equal(original.userStateText, stateLabelForProjection(setup.identity), 'Window user state does not match the Core projection.');
    assert.ok(original.eventTextRect && original.eventTextFontSize, 'Original ConversationEventView text geometry is unavailable.');
    const sseObservedInBrowser = report.sseResponses.some(item => item.path.includes(`${projectPath(projectId)}/events`));
    report.projection.sseObservedInBrowser = sseObservedInBrowser;
    report.professionalWindow = {
      renderedBy: 'original ProfessionalWindowStage + ConversationWorkViewBody + ConversationEventView',
      stageIsScreenSpacePortal: original.stageOutsideCanvas && original.stagePortalParentIsBody,
      windowChrome: { title: original.titleText, titleFontSize: original.titleFontSize, closeButtonAccessibleName: original.closeButtonAccessibleName },
      oneOriginalReactFlowRoot: original.reactFlowRoots === 1,
      oneWindowForConnectedConversation: original.bodyCountForConversation === 1,
      coreUserState: setup.identity.userState,
      visibleUserStateLabel: original.userStateText,
      actualCoreEventViews: { total: await eventViews.count(), userMessageViews: actualUserEvents, agentMessageViews: actualAssistantEvents },
      manualHistoryVisible: true,
      browserCoreReads: { collaborationSession: browserSessionReads.length, collaborationTimeline: browserTimelineReads.length },
      sseObservedInBrowser,
      baselineGeometry: { region: original.region, eventTextRect: original.eventTextRect,
        titleFontSize: original.titleFontSize, eventTextFontSize: original.eventTextFontSize },
    };
    await screenshot(page, 'professional-window');
    return report.professionalWindow;
  });

  await caseRun('original NodeBridge zoomTo changes Canvas zoom, not Professional window screen geometry', async () => {
    const baseline = report.professionalWindow.baselineGeometry;
    const captureAtZoom = async requestedZoom => page.evaluate(async (requested) => {
      const api = window.__LCOS_NODE_LAB__?.api;
      if (typeof api?.zoomTo !== 'function' || typeof api?.getViewport !== 'function') throw new Error('Original NodeBridge zoomTo/getViewport is unavailable.');
      const method = 'window.__LCOS_NODE_LAB__.api.zoomTo';
      const result = await api.zoomTo(requested, { duration: 0 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const targetId = document.querySelector('[data-lcos-window-body="conversation"]')?.getAttribute('data-lcos-window-target');
      const stage = document.querySelector('[data-lcos-professional-stage]');
      const pane = [...document.querySelectorAll('[data-lcos-window-pane]')]
        .find(element => element.querySelector(`[data-lcos-window-body="conversation"][data-lcos-window-target="${CSS.escape(targetId ?? '')}"]`));
      const body = pane?.querySelector(`[data-lcos-window-body="conversation"][data-lcos-window-target="${CSS.escape(targetId ?? '')}"]`);
      const title = pane?.querySelector('[data-lcos-window-title]');
      const message = body?.querySelector('[data-lcos-timeline-item="user_message"] .lcos-conversation-event-body');
      const rect = element => {
        const box = element?.getBoundingClientRect();
        return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
      };
      return {
        method,
        requestedZoom: requested,
        apiReturn: result,
        actualCanvasZoom: api.getViewport().zoom,
        reactFlowRoots: document.querySelectorAll('.react-flow').length,
        stageOutsideCanvas: !!stage && !stage.closest('.react-flow'),
        region: rect(pane?.closest('[data-lcos-window-region-id]')),
        titleFontSize: title ? getComputedStyle(title).fontSize : null,
        eventTextRect: rect(message),
        eventTextFontSize: message ? getComputedStyle(message).fontSize : null,
      };
    }, requestedZoom);

    const originalCanvasZoom = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.().zoom);
    assert.ok(typeof originalCanvasZoom === 'number' && Number.isFinite(originalCanvasZoom));
    let smallZoom;
    let largeZoom;
    try {
      smallZoom = await captureAtZoom(0.55);
      await screenshot(page, 'zoom-055');
      largeZoom = await captureAtZoom(1.45);
      await screenshot(page, 'zoom-145');
    } finally {
      await captureAtZoom(originalCanvasZoom);
    }

    const closeNumber = (a, b, tolerance = 1.25) => Math.abs(a - b) <= tolerance;
    const sameRect = (a, b) => a && b && ['x', 'y', 'width', 'height'].every(key => closeNumber(a[key], b[key]));
    for (const sample of [smallZoom, largeZoom]) {
      assert.ok(Math.abs(sample.actualCanvasZoom - sample.requestedZoom) < 0.08,
        `Original Canvas zoom did not reach requested diagnostic level: ${JSON.stringify(sample)}`);
      assert.equal(sample.reactFlowRoots, 1);
      assert.equal(sample.stageOutsideCanvas, true);
      assert.ok(sameRect(sample.region, baseline.region), 'Professional window region changed with Canvas zoom.');
      assert.ok(sameRect(sample.eventTextRect, baseline.eventTextRect), 'Conversation event text box scaled with Canvas zoom.');
      assert.equal(sample.titleFontSize, baseline.titleFontSize, 'WindowChrome title font scaled with Canvas zoom.');
      assert.equal(sample.eventTextFontSize, baseline.eventTextFontSize, 'ConversationEventView font scaled with Canvas zoom.');
    }
    report.zoomDiagnostic = {
      control: 'existing original NodeBridge API; no parallel zoom state or UI was introduced',
      invocations: [smallZoom, largeZoom],
      originalCanvasZoom,
      restoredCanvasZoom: await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getViewport?.().zoom),
      professionalRegionAndTextRemainScreenSpace: true,
      stageStylesCompared: ['window region DOMRect', 'WindowChrome title computed font size', 'Core user event text DOMRect and computed font size'],
    };
    return report.zoomDiagnostic;
  });

  await caseRun('same original shell window deduplicates, closes, and reopens once', async () => {
    const opener = node.getByRole('button', { name: conversationLabel, exact: true });
    const targetBody = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${conversationId}"]`);
    await opener.click();
    assert.equal(await targetBody.count(), 1, 'Reopening an already-open conversation created a duplicate window.');
    const firstWindowId = await targetBody.evaluate(element => element.closest('[data-lcos-window-pane]')?.getAttribute('data-lcos-window-pane'));
    const firstClose = page.locator('[data-lcos-window-pane]').filter({ has: targetBody }).getByRole('button', { name: '关闭窗口', exact: true });
    await firstClose.click();
    await targetBody.waitFor({ state: 'detached', timeout: 10000 });
    assert.equal(await page.locator('.react-flow').count(), 1);
    await opener.click();
    await targetBody.waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await targetBody.count(), 1, 'Close/reopen did not restore exactly one original shell window.');
    const reopenedWindowId = await targetBody.evaluate(element => element.closest('[data-lcos-window-pane]')?.getAttribute('data-lcos-window-pane'));
    report.reopen = { firstWindowPaneId: firstWindowId, reopenedWindowPaneId: reopenedWindowId,
      oneWindowAfterSecondOpen: true, zeroAfterClose: true, oneAfterReopen: true,
      owner: 'existing useLcosShellStore.openWindow/closeWindow + original ProfessionalWindowStage' };
    await screenshot(page, 'reopened-window');
    return report.reopen;
  });

  assert.deepEqual(report.scopeViolations, [], 'A non-Workflow mutation attempt occurred.');
  assert.deepEqual(report.forbiddenProviderMutationsBlocked, [], 'The browser attempted a forbidden provider/run mutation.');
  report.passed = true;
} catch (error) {
  failure = error;
  report.passed = false;
  report.failure = cleanText(error?.stack ?? error?.message ?? error);
  if (page) {
    try { await screenshot(page, `failure-${Date.now()}`); } catch { /* Keep the primary failure. */ }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({ passed: report.passed, target: report.target, projectId: report.projectId,
  conversationId: report.conversation?.id, projection: report.projection, professionalWindow: report.professionalWindow,
  zoomDiagnostic: report.zoomDiagnostic, reopen: report.reopen,
  pageErrors: report.pageErrors.length, apiFailuresRetained: report.apiFailures.length,
  remoteBlocked: report.remoteBlocked.length, remoteWebSocketsBlocked: report.remoteWebSocketsBlocked.length,
  blockedAgentGatewayPosts: report.blockedAgentGatewayPosts.length, screenshots: report.screenshots, failure: report.failure }, null, 2));
if (failure) process.exitCode = 1;
