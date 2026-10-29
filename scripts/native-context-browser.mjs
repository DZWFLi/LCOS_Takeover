import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canvasId = 'surface-core-workflow';
const conversationRef = 'synthetic-native-agent-ui-20261014-workflow';
const conversationLabel = '合成会话历史 · 未运行模型';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const runTag = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const evidencePath = path.join(root, 'evidence', `native-context-browser-${runTag}.json`);

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loopbackOrigin(value) {
  assert.ok(value, 'Pass --base-url http://127.0.0.1:<deployed-port> after Root deployment.');
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), 'Expected a local HTTP(S) origin.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'This browser test is loopback-only.');
  assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.equal(url.username, ''); assert.equal(url.password, '');
  return url.origin;
}

if (!process.argv.includes('--deployed')) {
  console.error('Not run: wait for Root to confirm final deployment, then pass --deployed and --base-url.');
  process.exit(2);
}

const origin = loopbackOrigin(cliValue('--base-url') ?? process.env.NATIVE_CONTEXT_BASE_URL);
const targetUrl = `${origin}/canvas/${canvasId}`;
const report = {
  schema: 'native-context-browser-v2',
  runTag,
  at: new Date().toISOString(),
  target: targetUrl,
  flow: 'Workflow 原画布实时选区 → 原 Agent Panel 对同一 Glyth 连续两次显式添加 → Core 幂等逐项回执 → reload 后原 Glyth Work View 读回相同持久上下文',
  scope: {
    surface: 'workflow',
    canvasId,
    onlyWorkflowMutationAllowed: true,
    mainOrContextMutationAttempted: false,
    targetConversationRef: conversationRef,
    syntheticMaterialsCreated: false,
    providerExecutionAllowed: false,
    modelOrContinuationPostsAllowed: false,
  },
  browser: 'installed playwright-core; fresh Chrome context; headless; 1440x1000; service workers blocked; same-origin HTTP/WebSocket only',
  browserPlugin: 'Browser runtime unavailable in this session; regular Playwright was selected for route-level write allowlisting and response receipt capture.',
  runtimeProfile: null,
  projectId: null,
  workflow: null,
  targetConversation: null,
  originalGlythNode: null,
  professionalSurfaceState: { beforeSelection: null, afterReload: null },
  availableMaterialNodes: [],
  selection: null,
  beforeContext: null,
  sourceIntegrityBefore: null,
  sourceIntegrityAfterReload: null,
  assemblyApply: { first: null, second: null },
  idempotency: null,
  collaborationProjection: null,
  workView: null,
  reloadReadback: null,
  screenshotCaptureComparison: null,
  canvasUnchanged: null,
  cases: [],
  directReads: [],
  browserRequests: [],
  assemblyApplyResponses: [],
  pageErrors: [],
  consoleErrors: [],
  consoleWarnings: [],
  requestFailures: [],
  apiFailures: [],
  sseResponses: [],
  sseObservedInBrowser: false,
  remoteBlocked: [],
  remoteWebSocketsBlocked: [],
  forbiddenProviderMutationsBlocked: [],
  blockedAgentGatewayPosts: [],
  blockedOtherWrites: [],
  scopeViolations: [],
  screenshots: [],
  failure: null,
  passed: false,
  evidencePath,
  notes: [
    'The script does not create conversations/materials. It requires an existing linked synthetic Workflow conversation and persisted image/text lcos_ref nodes.',
    'Only two explicit clicks may pass, each with exactly the currently selected Workflow ArtifactViews and the same synthetic Conversation target.',
    'The first click may be already-member when Core already contains that relation; the script never clears relations or deletes materials to manufacture an applied result.',
    'After the second click, Core graph counts and exact source identities are compared; after real page.reload(), Canvas/Core identities and text bytes are compared again.',
    'A passing target flow does not imply zero unrelated application HTTP/API errors; every observed failure, blocked remote request, and Agent Gateway attempt is retained.',
    'No provider execution, Run, continuation send, manual import, Canvas reconcile, or Main/Context write is allowed.',
  ],
};

const safeAddress = raw => {
  try {
    const url = new URL(raw);
    const keys = [...new Set(url.searchParams.keys())];
    url.search = keys.length === 0 ? '' : `?${keys.map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')}`;
    url.username = ''; url.password = '';
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
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

async function directRead(method, route, body) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${method} ${route} returned non-JSON (HTTP ${response.status}).`); }
  const entry = { method, path: route, status: response.status, ...(payload?.code === undefined ? {} : { code: payload.code }),
    ...(payload?.ok === undefined ? {} : { ok: payload.ok }), ...(payload?.error?.code ? { errorCode: payload.error.code } : {}) };
  report.directReads.push(entry);
  if (response.status >= 400) report.apiFailures.push({ source: 'direct read', ...entry, classification: 'HTTP/API failure; retained independently of the target flow' });
  return { response, payload };
}

async function tapNowData(route) {
  const result = await directRead('GET', route);
  assert.equal(result.response.status, 200, `GET ${route} failed with HTTP ${result.response.status}.`);
  assert.equal(result.payload?.code, 0, `GET ${route} returned a non-success TapNow envelope.`);
  return result.payload.data;
}

async function coreValue(route) {
  const result = await directRead('GET', `/api/lcos/core${route}`);
  assert.ok(result.response.ok && result.payload?.ok === true && 'value' in result.payload,
    `Core GET ${route} did not return {ok,value}: ${JSON.stringify({ status: result.response.status, error: result.payload?.error })}`);
  return result.payload.value;
}

async function coreBytes(route) {
  const response = await fetch(`${origin}/api/lcos/core${route}`, { headers: { Accept: '*/*' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  const entry = { method: 'GET', path: `/api/lcos/core${route}`, status: response.status,
    contentType: response.headers.get('content-type') ?? '', byteLength: bytes.length };
  report.directReads.push(entry);
  if (response.status >= 400) {
    report.apiFailures.push({ source: 'direct Core bytes read', ...entry,
      classification: 'HTTP/API failure; retained independently of target flow' });
    throw new Error(`Core bytes GET ${route} failed (HTTP ${response.status}).`);
  }
  return { bytes, contentType: entry.contentType };
}

function exactLcosRef(value) {
  return isRecord(value) && value.version === 1
    && ['artifact', 'view'].includes(value.entityType)
    && nonEmpty(value.entityId) && nonEmpty(value.artifactId)
    && nonEmpty(value.artifactViewId) && nonEmpty(value.revisionId)
    && (value.entityType !== 'artifact' || value.entityId === value.artifactId)
    && (value.entityType !== 'view' || value.entityId === value.artifactViewId);
}

async function readCanvas() {
  const route = `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`;
  const result = await directRead('GET', route);
  assert.equal(result.response.status, 200, `Workflow Canvas read failed (HTTP ${result.response.status}).`);
  assert.equal(result.payload?.code, 0, 'Workflow Canvas read returned a non-success TapNow envelope.');
  assert.ok(Array.isArray(result.payload?.data?.nodes), 'Workflow Canvas read omitted nodes.');
  return result.payload.data;
}

function graphObjectCounts(graph) {
  return Object.fromEntries(['artifacts', 'artifactViews', 'artifactRevisions', 'fileRecords']
    .map(key => [key, Array.isArray(graph?.[key]) ? graph[key].length : null]));
}

function canvasNodeStructure(canvas) {
  return [...(canvas?.nodes ?? [])].map(node => ({ id: node?.id, type: node?.type,
    position: node?.position ?? null, width: node?.width ?? null, height: node?.height ?? null,
    ...(node?.data?.lcos_ref ? { lcos_ref: node.data.lcos_ref } : {}) }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function canvasEdgeIdentity(canvas) {
  return [...(canvas?.edges ?? [])].map(edge => ({ id: edge?.id, source: edge?.source, target: edge?.target }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function boundViewCounts(projection, viewIds) {
  const bound = projection?.relation?.boundContext ?? [];
  return Object.fromEntries(viewIds.map(viewId => [viewId, bound.filter(item =>
    item?.entityRef?.type === 'artifact' && item.entityRef.viewId === viewId).length]));
}

async function captureSelectedSourceIntegrity(nodes) {
  assert.ok(coreGraphBefore && Array.isArray(coreGraphBefore.artifacts)
    && Array.isArray(coreGraphBefore.artifactViews) && Array.isArray(coreGraphBefore.artifactRevisions)
    && Array.isArray(coreGraphBefore.fileRecords), 'Core project graph omitted artifact/revision/file identities.');
  const captured = [];
  for (const selected of nodes) {
    const carrier = canvasBefore.nodes.find(node => node?.id === selected.nodeId);
    assert.ok(carrier, `Selected Huabu node ${selected.nodeId} is missing from the persisted Canvas read.`);
    const ref = carrier.data?.lcos_ref;
    const views = coreGraphBefore.artifactViews.filter(item => String(item.id) === selected.artifactViewId);
    const artifacts = coreGraphBefore.artifacts.filter(item => String(item.id) === selected.artifactId);
    const revisions = coreGraphBefore.artifactRevisions.filter(item => String(item.id) === selected.revisionId);
    assert.equal(views.length, 1, `Core graph must contain exactly one ArtifactView ${selected.artifactViewId}.`);
    assert.equal(artifacts.length, 1, `Core graph must contain exactly one Artifact ${selected.artifactId}.`);
    assert.equal(revisions.length, 1, `Core graph must contain exactly one Revision ${selected.revisionId}.`);
    assert.equal(String(views[0].artifactId), selected.artifactId);
    assert.equal(String(views[0].revisionId), selected.revisionId);
    assert.equal(String(revisions[0].artifactId), selected.artifactId);
    const fileRecordId = String(revisions[0].fileRecordId);
    const fileRecords = coreGraphBefore.fileRecords.filter(item => String(item.id) === fileRecordId);
    assert.equal(fileRecords.length, 1, `Core graph must contain exactly one FileRecord ${fileRecordId}.`);

    let textBytes;
    if (selected.type === 'text') {
      textBytes = await coreBytes(`${projectPath(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`);
      coreTextBytesBefore.set(selected.artifactViewId, textBytes.bytes);
      const body = typeof carrier.data?.content === 'string' ? Buffer.from(carrier.data.content, 'utf8') : undefined;
      if (body !== undefined) canvasTextBytesBefore.set(selected.nodeId, body);
    }
    captured.push({ nodeId: carrier.id, type: carrier.type, lcosRef: ref,
      artifactId: selected.artifactId, artifactViewId: selected.artifactViewId, revisionId: selected.revisionId,
      fileRecordId, coreIdentityCounts: { artifact: artifacts.length, artifactView: views.length,
        revision: revisions.length, fileRecord: fileRecords.length },
      ...(selected.type === 'text' ? { coreTextBytes: { status: 200, byteLength: textBytes.bytes.length,
        contentType: textBytes.contentType },
        canvasCarrierTextBytes: typeof carrier.data?.content === 'string'
          ? { present: true, byteLength: Buffer.byteLength(carrier.data.content, 'utf8') }
          : { present: false } } : {}) });
  }
  report.sourceIntegrityBefore = { graphObjectCounts: graphObjectCounts(coreGraphBefore), materials: captured,
    textByteBuffersRead: coreTextBytesBefore.size, source: 'current Huabu DTO + exact Core graph/FileRecord content route' };
  return captured;
}

async function captureReloadSourceIntegrity(nodes) {
  const canvas = await readCanvas();
  const graph = await coreValue(`${projectPath(projectId)}/graph`);
  const materials = [];
  for (const selected of nodes) {
    const carrierMatches = canvas.nodes.filter(node => node?.id === selected.nodeId);
    assert.equal(carrierMatches.length, 1, `Reloaded Workflow Canvas must contain exactly one original node ${selected.nodeId}.`);
    const carrier = carrierMatches[0];
    assert.equal(carrier.type, selected.type, `Reload changed node type for ${selected.nodeId}.`);
    const before = report.sourceIntegrityBefore.materials.find(item => item.nodeId === selected.nodeId);
    assert.ok(before, `No pre-action source identity snapshot for ${selected.nodeId}.`);
    assert.deepEqual(carrier.data?.lcos_ref, before.lcosRef, `Reload changed the persisted lcos_ref for ${selected.nodeId}.`);
    const ref = carrier.data.lcos_ref;
    const views = graph.artifactViews.filter(item => String(item.id) === ref.artifactViewId);
    const artifacts = graph.artifacts.filter(item => String(item.id) === ref.artifactId);
    const revisions = graph.artifactRevisions.filter(item => String(item.id) === ref.revisionId);
    assert.equal(views.length, 1, `Reloaded Core graph must contain exactly one ArtifactView ${ref.artifactViewId}.`);
    assert.equal(artifacts.length, 1, `Reloaded Core graph must contain exactly one Artifact ${ref.artifactId}.`);
    assert.equal(revisions.length, 1, `Reloaded Core graph must contain exactly one Revision ${ref.revisionId}.`);
    assert.equal(String(views[0].artifactId), ref.artifactId);
    assert.equal(String(views[0].revisionId), ref.revisionId);
    assert.equal(String(revisions[0].artifactId), ref.artifactId);
    const fileRecordId = String(revisions[0].fileRecordId);
    assert.equal(graph.fileRecords.filter(item => String(item.id) === fileRecordId).length, 1,
      `Reloaded Core graph must contain exactly one FileRecord ${fileRecordId}.`);

    let textIntegrity;
    if (selected.type === 'text') {
      const coreRead = await coreBytes(`${projectPath(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`);
      const beforeCore = coreTextBytesBefore.get(selected.artifactViewId);
      assert.ok(beforeCore, `No pre-action Core text-byte baseline for ${selected.artifactViewId}.`);
      assert.equal(coreRead.bytes.equals(beforeCore), true, `Core text bytes changed for ${selected.artifactViewId}.`);
      const beforeCanvas = canvasTextBytesBefore.get(selected.nodeId);
      const currentCanvas = typeof carrier.data?.content === 'string' ? Buffer.from(carrier.data.content, 'utf8') : undefined;
      assert.ok(beforeCanvas && currentCanvas, `Canvas text bytes are unavailable for ${selected.nodeId}.`);
      assert.equal(currentCanvas.equals(beforeCanvas), true, `Canvas text bytes changed for ${selected.nodeId}.`);
      textIntegrity = { coreByteLength: coreRead.bytes.length, coreBytesUnchanged: true,
        canvasByteLength: currentCanvas.length, canvasBytesUnchanged: true };
    }
    materials.push({ nodeId: carrier.id, type: carrier.type, artifactId: ref.artifactId,
      artifactViewId: ref.artifactViewId, revisionId: ref.revisionId, fileRecordId,
      ...(textIntegrity ? { textIntegrity } : {}) });
  }
  return { canvas, graph, materials };
}

function waitForNodeCondition(description, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) { resolve(); return; }
      if (Date.now() >= deadline) { reject(new Error(`Timed out waiting for ${description}.`)); return; }
      setTimeout(check, 50);
    };
    check();
  });
}

async function readConversationProjection() {
  const projection = await coreValue(`${projectPath(projectId)}/connected-conversations/${encodeURIComponent(conversation.id)}/collaboration-session`);
  assert.equal(projection?.projectId, projectId);
  assert.equal(projection?.conversationId, conversation.id);
  return projection;
}

async function caseRun(name, run) {
  const detail = await run();
  report.cases.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
  return detail;
}

async function screenshot(page, name, options = {}) {
  await mkdir(visualRoot, { recursive: true });
  const filename = path.join(visualRoot, `tapnow-native-context-${runTag}-${name}.png`);
  await page.screenshot({ path: filename, ...options });
  report.screenshots.push(filename);
  return filename;
}

async function screenshotElement(locator, name) {
  await mkdir(visualRoot, { recursive: true });
  const filename = path.join(visualRoot, `tapnow-native-context-${runTag}-${name}.png`);
  await locator.screenshot({ path: filename, animations: 'disabled' });
  report.screenshots.push(filename);
  return filename;
}

async function readWindowVisualGeometry(page, bodyLocator) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return bodyLocator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const stage = element.closest('[data-lcos-professional-stage]');
    const stageRect = stage?.getBoundingClientRect();
    const centerX = Math.min(Math.max(rect.left + rect.width / 2, 0), Math.max(0, window.innerWidth - 1));
    const centerY = Math.min(Math.max(rect.top + rect.height / 2, 0), Math.max(0, window.innerHeight - 1));
    const hit = document.elementFromPoint(centerX, centerY);
    const style = getComputedStyle(element);
    const stageStyle = stage ? getComputedStyle(stage) : undefined;
    return {
      bodyRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyStyle: { display: style.display, visibility: style.visibility, opacity: style.opacity, position: style.position, zIndex: style.zIndex },
      bodyIntersectsViewport: rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < window.innerWidth && rect.top < window.innerHeight,
      stageRect: stageRect ? { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height } : null,
      stageStyle: stageStyle ? { display: stageStyle.display, visibility: stageStyle.visibility, opacity: stageStyle.opacity, zIndex: stageStyle.zIndex } : null,
      centerHit: hit ? { tagName: hit.tagName, className: typeof hit.className === 'string' ? hit.className : '',
        insideTargetWindowBody: element.contains(hit) } : null,
    };
  });
}

let browser;
let context;
let page;
let failure;
let projectId;
let workflow;
let conversation;
let glythNode;
let selectedNodes;
let canvasBefore;
let coreGraphBefore;
let contextProjectionBefore;
let applyReceiptCaptures = [];
const coreTextBytesBefore = new Map();
const canvasTextBytesBefore = new Map();

try {
  await mkdir(path.join(root, 'evidence'), { recursive: true });

  await caseRun('deployed loopback service and Workflow project are exact', async () => {
    const health = await directRead('GET', '/health');
    assert.equal(health.response.status, 200, 'Local service health failed.');
    report.runtimeProfile = health.payload?.profile ?? 'profile-not-reported';
    const status = await tapNowData('/api/surface-core/status');
    projectId = status?.projectId;
    workflow = status?.surfaces?.find(surface => surface?.preferredSurface === 'workflow');
    assert.ok(nonEmpty(projectId), 'Surface Core did not provide a project ID.');
    assert.ok(workflow && workflow.canvasId === canvasId && nonEmpty(workflow.workspaceId) && nonEmpty(workflow.scopeId),
      'Surface Core did not map this exact Workflow canvas/workspace/scope.');
    report.projectId = projectId;
    report.workflow = { canvasId, workspaceId: workflow.workspaceId, scopeId: workflow.scopeId, name: workflow.name };
    canvasBefore = await readCanvas();
    return { profile: report.runtimeProfile, projectId, workflow: report.workflow, canvasNodeCount: canvasBefore.nodes.length };
  });

  await caseRun('existing synthetic target and persisted lcos_ref materials are present; no setup mutation is needed', async () => {
    const conversations = await coreValue(`${projectPath(projectId)}/connected-conversations`);
    assert.ok(Array.isArray(conversations), 'Core ConnectedConversation list is not an array.');
    const matches = conversations.filter(item => item?.conversationRef === conversationRef);
    assert.equal(matches.length, 1, `Expected exactly one existing ${conversationRef} registration.`);
    conversation = matches[0];
    assert.equal(conversation.projectId, projectId);
    assert.equal(conversation.label, conversationLabel);
    assert.equal(conversation.isRunning, false, 'The synthetic conversation must not claim a running provider.');
    assert.ok(nonEmpty(conversation.conversationSessionId), 'Target conversation is not explicitly linked to a Core session.');
    const identity = await coreValue(`${projectPath(projectId)}/connected-conversations/${encodeURIComponent(conversation.id)}/identity`);
    assert.equal(identity?.connectedConversation?.id, conversation.id, 'Core identity did not confirm the exact target conversation.');
    assert.equal(identity?.conversationSession?.id, conversation.conversationSessionId, 'Core identity did not confirm the linked session.');
    coreGraphBefore = await coreValue(`${projectPath(projectId)}/graph`);
    contextProjectionBefore = await readConversationProjection();
    report.beforeContext = { projectId, conversationId: conversation.id, source: 'Core collaboration-session before any action',
      boundReferenceCount: contextProjectionBefore.relation?.boundContext?.length ?? 0,
      artifactViewIds: (contextProjectionBefore.relation?.boundContext ?? []).flatMap(item =>
        item?.entityRef?.type === 'artifact' && nonEmpty(item.entityRef.viewId) ? [item.entityRef.viewId] : []) };

    const materialNodes = canvasBefore.nodes.filter(node => (node?.type === 'image' || node?.type === 'text')
      && exactLcosRef(node?.data?.lcos_ref));
    report.availableMaterialNodes = materialNodes.map(node => ({ nodeId: node.id, type: node.type,
      artifactId: node.data.lcos_ref.artifactId, artifactViewId: node.data.lcos_ref.artifactViewId,
      revisionId: node.data.lcos_ref.revisionId }));
    assert.ok(materialNodes.length > 0, 'Workflow Canvas has no original image/text node with a persisted exact lcos_ref.');
    glythNode = canvasBefore.nodes.find(node => node?.type === 'lcos-conversation'
      && node?.data?.lcos_conversation_ref?.projectId === projectId
      && node?.data?.lcos_conversation_ref?.connectedConversationId === conversation.id
      && node?.data?.lcos_conversation_ref?.canvasId === canvasId);
    assert.ok(glythNode?.id, 'The exact target Glyth is not projected on the Workflow Canvas; refusing to create another node in this test.');
    report.targetConversation = { id: conversation.id, label: conversation.label, provider: conversation.provider,
      isRunning: conversation.isRunning, conversationSessionId: conversation.conversationSessionId,
      conversationRef: conversation.conversationRef, source: 'existing Core registration; read only' };
    report.originalGlythNode = { id: glythNode.id, type: glythNode.type, canvasId };
    return { targetConversationId: conversation.id, linkedSessionConfirmed: true, isRunning: conversation.isRunning,
      persistedMaterialCount: materialNodes.length, materialTypes: [...new Set(materialNodes.map(node => node.type))],
      exactGlythNodeId: glythNode.id, setupWrites: 0 };
  });

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
        report.blockedAgentGatewayPosts.push({ method, path: url.pathname, reason: 'Agent Gateway/model execution is outside this context-reference flow.' });
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
      const expectedApplyPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`;
      if (method === 'POST' && url.pathname === expectedApplyPath) {
        let body;
        try { body = JSON.parse(request.postData() ?? '{}'); }
        catch { body = undefined; }
        const expectedViewIds = Array.isArray(selectedNodes) ? selectedNodes.map(node => node.artifactViewId).sort() : [];
        const requestedViewIds = Array.isArray(body?.sourceRefs) ? body.sourceRefs.map(ref => ref?.id).sort() : [];
        const validSelection = Array.isArray(selectedNodes) && body?.schemaVersion === 1 && body.projectId === projectId
          && body.targetRef?.kind === 'conversation' && body.targetRef.id === conversation.id
          && Array.isArray(body.sourceRefs) && body.sourceRefs.length === selectedNodes.length && body.sourceRefs.length > 0
          && new Set(requestedViewIds).size === requestedViewIds.length
          && JSON.stringify(requestedViewIds) === JSON.stringify(expectedViewIds)
          && body.sourceRefs.every(ref => ref?.kind === 'artifactView'
            && selectedNodes.some(node => node.artifactViewId === ref.id))
          && report.assemblyApplyResponses.length < 2;
        if (!validSelection) {
          report.scopeViolations.push({ method, path: url.pathname,
            reason: 'Assembly request did not match exact selected Workflow ArtifactViews/target, or exceeded the two explicit clicks.' });
          await route.abort('blockedbyclient');
          return;
        }
        const response = await route.fetch();
        let payload;
        try { payload = await response.json(); }
        catch { payload = { nonJson: true }; }
        const attempt = report.assemblyApplyResponses.length + 1;
        applyReceiptCaptures.push({ attempt, status: response.status(), payload, requestedViewIds });
        report.assemblyApplyResponses.push({ attempt, method, path: url.pathname, status: response.status(),
          ok: payload?.ok, projectId: payload?.value?.projectId, targetConversationId: body.targetRef.id,
          sourceViewIds: body.sourceRefs.map(ref => ref.id), itemStatuses: payload?.value?.results?.map(item => ({
            sourceViewId: item?.sourceRef?.id, status: item?.status, channel: item?.channel,
            ...(item?.message ? { message: cleanText(item.message) } : {}), ...(item?.changeSetId ? { changeSetId: item.changeSetId } : {}),
          })) ?? [] });
        report.browserRequests.push({ method, path: url.pathname, status: response.status(), classification: 'one of two explicitly clicked idempotency writes only' });
        await route.fulfill({ response });
        return;
      }
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        report.blockedOtherWrites.push({ method, path: url.pathname, reason: 'Only one exact current-Workflow Core assembly/apply request is allowed.' });
        await route.abort('blockedbyclient');
        return;
      }
      report.browserRequests.push({ method, path: url.pathname, status: 'requested' });
      await route.continue();
      return;
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return; }
    report.remoteBlocked.push({ method, address: safeAddress(url.href), protocol: url.protocol, reason: 'unknown protocol blocked' });
    await route.abort('blockedbyclient');
  });
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async socketRoute => {
      const address = new URL(socketRoute.url());
      const equivalentOrigin = address.origin.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
      if (equivalentOrigin === origin) { await socketRoute.connect(); return; }
      report.remoteWebSocketsBlocked.push(safeAddress(address.href));
      await socketRoute.close({ code: 1008, reason: 'off-origin websocket blocked for this local experiment' });
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
    failure: cleanText(request.failure()?.errorText ?? 'request failed') }));
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const matching = report.browserRequests.findLast(item => item.path === url.pathname && item.status === 'requested');
    if (matching) matching.status = response.status();
    if (response.status() >= 400) report.apiFailures.push({ source: 'browser', method: response.request().method(),
      path: url.pathname, status: response.status(), classification: 'HTTP/API failure; retained independently of target-flow result' });
    const contentType = response.headers()['content-type'] ?? '';
    if (/text\/event-stream/i.test(contentType)) {
      report.sseObservedInBrowser = true;
      report.sseResponses.push({ path: url.pathname, status: response.status(), contentType });
    }
  });

  await caseRun('fresh browser stays on one original Workflow Canvas and selects live Huabu nodes', async () => {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
    report.professionalSurfaceState.beforeSelection = await page.locator('[data-lcos-professional-surface-state]').getAttribute('data-lcos-professional-surface-state');
    assert.equal(await page.locator('.react-flow').count(), 1, 'Expected exactly one original ReactFlow root.');
    const sources = report.availableMaterialNodes;
    const image = sources.find(node => node.type === 'image');
    const text = sources.find(node => node.type === 'text');
    assert.ok(image && text, 'This idempotency check requires the existing persisted Workflow image and text nodes; it will not create replacement material.');
    selectedNodes = [image, text];

    await page.locator('.react-flow__pane').click({ position: { x: 12, y: 12 } });
    const first = page.locator(nodeSelector(selectedNodes[0].nodeId));
    await first.waitFor({ state: 'visible', timeout: 15000 });
    await first.click({ position: { x: 18, y: 18 } });
    if (selectedNodes.length > 1) {
      const second = page.locator(nodeSelector(selectedNodes[1].nodeId));
      await second.waitFor({ state: 'visible', timeout: 10000 });
      await second.click({ modifiers: ['Shift'], position: { x: 18, y: 18 } });
      const selectedIds = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getSelection?.().nodeIds ?? []);
      if (!selectedNodes.every(node => selectedIds.includes(node.nodeId))) {
        throw new Error('Original Canvas did not preserve both actual image+text pointers in one live selection; refusing to reduce the idempotency test to one item.');
      }
    }
    const selectedIds = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getSelection?.().nodeIds ?? []);
    assert.deepEqual([...selectedIds].sort(), selectedNodes.map(node => node.nodeId).sort(),
      'The original Canvas API did not confirm the exact actual pointer selection.');
    report.selection = { method: 'real pointer clicks on original ReactFlow nodes', selectedNodeIds: selectedNodes.map(node => node.nodeId),
      selectedTypes: selectedNodes.map(node => node.type), exactArtifactViewIds: selectedNodes.map(node => node.artifactViewId),
      simultaneousImageAndText: selectedNodes.some(node => node.type === 'image') && selectedNodes.some(node => node.type === 'text') };
    const sourceIntegrity = await captureSelectedSourceIntegrity(selectedNodes);
    const selectedViewIds = selectedNodes.map(node => node.artifactViewId);
    report.beforeContext.selectedViewCounts = boundViewCounts(contextProjectionBefore, selectedViewIds);
    report.sourceIntegrityBefore.materials = sourceIntegrity;
    await screenshot(page, 'selection');
    return { oneReactFlow: true, selection: report.selection, beforeContext: report.beforeContext,
      sourceIntegrity: report.sourceIntegrityBefore, screenshot: report.screenshots.at(-1) };
  });

  await caseRun('original controlled Agent Panel submits only the selected references to the chosen Glyth', async () => {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口' });
    const initialClose = page.getByRole('button', { name: '关闭 Agent 面板', exact: true });
    if (await initialClose.count() && await initialClose.isVisible()) {
      await initialClose.click();
      await panel.waitFor({ state: 'hidden', timeout: 10000 });
    }
    const selectionAfterClose = await page.evaluate(() => window.__LCOS_NODE_LAB__?.api?.getSelection?.().nodeIds ?? []);
    assert.deepEqual([...selectionAfterClose].sort(), selectedNodes.map(node => node.nodeId).sort(),
      'Closing the original controlled panel must not replace or clear the current Canvas selection.');
    const launchers = page.locator('[data-pile-gallery-chrome="bottom-right"] button');
    await launchers.last().waitFor({ state: 'visible', timeout: 10000 });
    const launcher = launchers.last();
    const markup = await launcher.evaluate(element => element.outerHTML);
    assert.match(markup, /\/agent-motion\//, 'Expected the existing in-app Agent launcher; do not use the external connector.');
    await launcher.click();
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    const action = panel.getByRole('button', { name: `把当前选区添加为 ${conversationLabel} 的上下文` });
    await action.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await action.isEnabled(), true, 'Current selection/Workflow identity was not accepted by the UI.');
    const actionRoot = page.locator(`[data-lcos-native-context-action="${conversation.id}"]`);
    assert.equal(report.assemblyApplyResponses.length, 0, 'An Assembly write occurred before this test explicitly clicked the Panel action.');
    const expectedViewIds = selectedNodes.map(node => node.artifactViewId).sort();
    const beforeCounts = report.beforeContext.selectedViewCounts;
    const validateCapture = (capture, attempt) => {
      assert.ok(capture, `No allowlisted real Core Assembly response was captured for click ${attempt}.`);
      assert.equal(capture.attempt, attempt);
      assert.equal(capture.status, 200, `Core Assembly apply click ${attempt} did not return HTTP 200.`);
      assert.equal(capture.payload?.ok, true, `Core click ${attempt} did not return its {ok,value} envelope.`);
      const value = capture.payload.value;
      assert.equal(value.projectId, projectId);
      assert.equal(value.results.length, selectedNodes.length, `Core item receipt count differs from the exact selected material count on click ${attempt}.`);
      assert.deepEqual(value.results.map(item => item.sourceRef.id).sort(), expectedViewIds);
      assert.ok(value.results.every(item => item.sourceRef.kind === 'artifactView'), 'A Canvas node id was sent as a Core reference.');
      return value;
    };
    const summarize = (capture, value, uiReceiptText, uiItemLines) => ({ httpStatus: capture.status,
      projectId: value.projectId, target: { kind: 'conversation', id: conversation.id },
      sourceViewIds: value.results.map(item => item.sourceRef.id).sort(), allApplied: value.allApplied,
      results: value.results.map(item => ({ sourceRef: item.sourceRef, status: item.status,
        channel: item.channel, ...(item.message ? { message: cleanText(item.message) } : {}),
        ...(item.changeSetId ? { changeSetId: item.changeSetId } : {}) })),
      uiReceiptText: cleanText(uiReceiptText), uiItemLines: uiItemLines.map(cleanText) });
    const waitForReceipt = async (expectedCaptures) => {
      await waitForNodeCondition(`Core Assembly response ${expectedCaptures}`, () => applyReceiptCaptures.length >= expectedCaptures);
      await page.waitForFunction(id => {
        const root = document.querySelector(`[data-lcos-native-context-action="${CSS.escape(id)}"]`);
        const button = root?.querySelector('button[aria-label]');
        return !!root?.querySelector('[data-context-action-receipt]') && !!button && !button.disabled;
      }, conversation.id, { timeout: 30000 });
      const receipt = actionRoot.locator('[data-context-action-receipt]');
      assert.equal(await receipt.count(), 1, `Panel click ${expectedCaptures} did not yield exactly one visible Core receipt.`);
      return { text: await receipt.innerText(), lines: await receipt.locator('li').allInnerTexts() };
    };

    await action.click();
    const firstUi = await waitForReceipt(1);
    const firstValue = validateCapture(applyReceiptCaptures[0], 1);
    const firstResults = firstValue.results;
    assert.equal(firstResults.length, expectedViewIds.length);
    for (const item of firstResults) {
      const existingCount = beforeCounts[item.sourceRef.id] ?? 0;
      if (existingCount > 0) {
        assert.equal(item.status, 'skipped', `Core already projected ${item.sourceRef.id}; first click must remain an idempotent skip.`);
        assert.equal(item.channel, 'already-member', `Core already projected ${item.sourceRef.id}; first click must report already-member.`);
      } else {
        assert.equal(item.status, 'applied', `Core had no pre-existing ${item.sourceRef.id} relation; first click did not apply it.`);
      }
    }
    report.assemblyApply.first = summarize(applyReceiptCaptures[0], firstValue, firstUi.text, firstUi.lines);
    await screenshot(page, 'agent-panel-receipt-first');

    await action.waitFor({ state: 'visible' });
    assert.equal(await action.isEnabled(), true, 'Original Agent Panel did not re-enable its explicit action after the first real receipt.');
    await action.click();
    const secondUi = await waitForReceipt(2);
    const secondValue = validateCapture(applyReceiptCaptures[1], 2);
    assert.ok(secondValue.results.every(item => item.status === 'skipped' && item.channel === 'already-member'),
      'Second explicit Core apply must return skipped/already-member for every selected ArtifactView.');
    assert.ok(secondValue.results.every(item => !item.changeSetId), 'Idempotent already-member result unexpectedly created a ChangeSet.');
    assert.equal(secondUi.lines.length, selectedNodes.length, 'Second Panel receipt did not render one visible item result per selected ArtifactView.');
    assert.ok(secondUi.lines.every(line => line.includes('已在目标中 · 未新增')),
      'Second visible Panel receipt did not faithfully show every per-item already-member result.');
    report.assemblyApply.second = summarize(applyReceiptCaptures[1], secondValue, secondUi.text, secondUi.lines);

    const projectionAfterBoth = await readConversationProjection();
    const afterCounts = boundViewCounts(projectionAfterBoth, expectedViewIds);
    const expectedAfterCounts = Object.fromEntries(expectedViewIds.map(id => [id,
      (beforeCounts[id] ?? 0) > 0 ? beforeCounts[id] : 1]));
    assert.deepEqual(afterCounts, expectedAfterCounts,
      'Core relation membership counts changed unexpectedly; the second click must not duplicate a relation already present before the test.');
    const graphAfterBoth = await coreValue(`${projectPath(projectId)}/graph`);
    const graphCountsBefore = graphObjectCounts(coreGraphBefore);
    const graphCountsAfter = graphObjectCounts(graphAfterBoth);
    assert.deepEqual(graphCountsAfter, graphCountsBefore, 'Repeated context apply changed Artifact/ArtifactView/Revision/FileRecord object counts.');
    report.idempotency = { explicitClicks: 2, sameTargetConversationId: conversation.id,
      selectedViewIds: expectedViewIds, beforeBoundMembershipCounts: beforeCounts,
      expectedAfterBoundMembershipCounts: expectedAfterCounts, afterBoundMembershipCounts: afterCounts,
      secondClickAllSkippedAlreadyMember: true, secondClickChangeSetIds: secondValue.results.map(item => item.changeSetId ?? null),
      coreGraphObjectCountsBefore: graphCountsBefore, coreGraphObjectCountsAfter: graphCountsAfter,
      graphObjectCountsUnchanged: true };
    await screenshot(page, 'agent-panel-receipt-second-already-member');
    return { originalAgentLauncher: true, controlledPanel: true, receiptsFromCore: report.assemblyApply,
      idempotency: report.idempotency, screenshots: report.screenshots.slice(-2) };
  });

  await caseRun('original Glyth Work View reads two Core bindings before and after real page reload', async () => {
    const closePanel = page.getByRole('button', { name: '关闭 Agent 面板', exact: true });
    if (await closePanel.count()) await closePanel.click();
    await page.getByRole('dialog', { name: '本地 Agent 会话入口' }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    const expectedViewIds = selectedNodes.map(node => node.artifactViewId).sort();
    const targetBodySelector = `[data-lcos-window-body="conversation"][data-lcos-window-target="${conversation.id}"]`;
    const openOriginalGlyth = async () => {
      const glyth = page.locator(nodeSelector(glythNode.id));
      await glyth.waitFor({ state: 'visible', timeout: 15000 });
      await glyth.getByRole('button').first().click();
      const windowBody = page.locator(targetBodySelector);
      await windowBody.waitFor({ state: 'visible', timeout: 20000 });
      const workView = windowBody.locator('[data-lcos-conversation-work-view]');
      await workView.waitFor({ state: 'visible', timeout: 20000 });
      const boundContext = workView.locator('[data-lcos-conversation-bound-context]');
      await boundContext.waitFor({ state: 'visible', timeout: 20000 });
      const visualGeometry = await readWindowVisualGeometry(page, windowBody);
      assert.ok(visualGeometry.bodyIntersectsViewport, 'Original Professional Window body is outside the visible viewport after opening.');
      assert.equal(visualGeometry.bodyStyle.visibility, 'visible', 'Original Professional Window body is not visibly rendered.');
      assert.notEqual(visualGeometry.bodyStyle.opacity, '0', 'Original Professional Window body is fully transparent.');
      assert.equal(visualGeometry.centerHit?.insideTargetWindowBody, true,
        'Another layer covers the center of the original Professional Window body.');
      return { windowBody, workView, boundContext, visualGeometry };
    };
    const assertTwoCoreBindings = async (phase) => {
      const projection = await readConversationProjection();
      const counts = boundViewCounts(projection, expectedViewIds);
      assert.deepEqual(counts, report.idempotency.expectedAfterBoundMembershipCounts,
        `${phase}: Core collaboration-session membership counts differ from the confirmed two-click result.`);
      return { projection, counts };
    };

    let opened = await openOriginalGlyth();
    let firstRead = await assertTwoCoreBindings('before reload');
    let firstTitles = await opened.boundContext.locator('[data-lcos-bound-material]').allInnerTexts();
    assert.equal(firstTitles.length, selectedNodes.length, 'Original ConversationWorkView must visibly render exactly the two selected materials before reload.');
    report.collaborationProjection = { projectId, conversationId: conversation.id, source: 'Core collaboration-session reread after two explicit Panel clicks',
      expectedArtifactViewIds: expectedViewIds, boundMembershipCounts: firstRead.counts };
    report.workView = { component: 'original ConversationWorkViewBody', visible: true, phase: 'before reload',
      visibleMaterialTitles: firstTitles.map(cleanText), conversationWorkViewCount: await page.locator('[data-lcos-conversation-work-view]').count(),
      reactFlowRootCount: await page.locator('.react-flow').count(), visualGeometry: opened.visualGeometry };
    assert.equal(report.workView.conversationWorkViewCount, 1);
    assert.equal(report.workView.reactFlowRootCount, 1, 'Professional Window must not mount a second Canvas.');
    await screenshot(page, 'glyth-workview-context-before-reload');

    const targetWindow = page.locator('[data-lcos-window-pane]').filter({ has: opened.windowBody });
    const closeWindow = targetWindow.getByRole('button', { name: '关闭窗口', exact: true });
    assert.equal(await closeWindow.count(), 1, 'Expected the original Professional Window close control for the target conversation.');
    await closeWindow.click();
    await opened.windowBody.waitFor({ state: 'detached', timeout: 10000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, { timeout: 30000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
    report.professionalSurfaceState.afterReload = await page.locator('[data-lcos-professional-surface-state]').getAttribute('data-lcos-professional-surface-state');
    assert.equal(await page.locator('.react-flow').count(), 1, 'Reload must retain exactly one original ReactFlow root.');
    const agentPanelAfterReload = page.getByRole('dialog', { name: '本地 Agent 会话入口' });
    if (await agentPanelAfterReload.count() && await agentPanelAfterReload.isVisible()) {
      const closeAgentPanelAfterReload = agentPanelAfterReload.getByRole('button', { name: '关闭 Agent 面板', exact: true });
      assert.equal(await closeAgentPanelAfterReload.count(), 1, 'Reloaded Agent Panel did not expose its original controlled close action.');
      await closeAgentPanelAfterReload.click();
      await agentPanelAfterReload.waitFor({ state: 'hidden', timeout: 10000 });
    }
    assert.ok(!(await agentPanelAfterReload.count()) || !(await agentPanelAfterReload.isVisible()),
      'The original Agent Panel must be visually closed before reopening the screen-space Glyth Window.');
    const reloaded = await captureReloadSourceIntegrity(selectedNodes);
    const initialStructure = canvasNodeStructure(canvasBefore);
    const reloadedStructure = canvasNodeStructure(reloaded.canvas);
    const initialEdges = canvasEdgeIdentity(canvasBefore);
    const reloadedEdges = canvasEdgeIdentity(reloaded.canvas);
    assert.deepEqual(reloadedStructure, initialStructure, 'Workflow persisted node IDs/geometry/lcos_ref changed after applying context.');
    assert.deepEqual(reloadedEdges, initialEdges, 'Workflow persisted edge identity changed after applying context.');
    const graphCountsAfterReload = graphObjectCounts(reloaded.graph);
    assert.deepEqual(graphCountsAfterReload, graphObjectCounts(coreGraphBefore), 'Reload changed Core Artifact/ArtifactView/Revision/FileRecord object counts.');
    report.sourceIntegrityAfterReload = { graphObjectCounts: graphCountsAfterReload,
      graphObjectCountsUnchanged: true, materials: reloaded.materials,
      nodeIdsAndArtifactViewRevisionIdsUnchanged: true,
      textBytesUnchanged: reloaded.materials.filter(item => item.textIntegrity).every(item => item.textIntegrity.coreBytesUnchanged && item.textIntegrity.canvasBytesUnchanged) };

    const reloadProjection = await readConversationProjection();
    const reloadCounts = boundViewCounts(reloadProjection, expectedViewIds);
    assert.deepEqual(reloadCounts, report.idempotency.expectedAfterBoundMembershipCounts,
      'Core reload readback lost or duplicated one of the two ArtifactView bindings.');
    assert.deepEqual(reloadCounts, firstRead.counts, 'Core relation projection changed across browser reload.');
    opened = await openOriginalGlyth();
    const reloadedTitles = await opened.boundContext.locator('[data-lcos-bound-material]').allInnerTexts();
    assert.equal(reloadedTitles.length, selectedNodes.length, 'Reloaded original ConversationWorkView must visibly render exactly the two same materials.');
    assert.deepEqual(reloadedTitles.map(cleanText), firstTitles.map(cleanText), 'Original Glyth Work View material labels changed after reload.');
    report.reloadReadback = { realPageReload: true, originalGlythNodeId: glythNode.id,
      originalWindowBody: true, exactArtifactViewIds: expectedViewIds, boundMembershipCounts: reloadCounts,
      visibleMaterialTitles: reloadedTitles.map(cleanText), workViewVisible: true,
      visualGeometry: opened.visualGeometry,
      originalAgentPanelClosedAfterReload: true,
      oneReactFlow: await page.locator('.react-flow').count() === 1 };
    report.workView = { ...report.workView, phase: 'after reload', visibleMaterialTitles: reloadedTitles.map(cleanText),
      conversationWorkViewCount: await page.locator('[data-lcos-conversation-work-view]').count(),
      reactFlowRootCount: await page.locator('.react-flow').count(), visualGeometry: opened.visualGeometry };
    assert.equal(report.workView.conversationWorkViewCount, 1);
    assert.equal(report.workView.reactFlowRootCount, 1, 'Reloaded Professional Window must not mount a second Canvas.');
    report.collaborationProjection = { ...report.collaborationProjection, boundMembershipCountsAfterReload: reloadCounts,
      sameProjectionAcrossReload: true };
    report.canvasUnchanged = { canvasId, nodeCountBefore: canvasBefore.nodes.length, nodeCountAfter: reloaded.canvas.nodes.length,
      nodeIdentitySetUnchanged: true, nodeGeometryAndPersistedRefsUnchanged: true, edgeIdentityUnchanged: true,
      readback: 'direct original Workflow Canvas GET before action vs real page.reload readback' };
    const windowElementScreenshot = await screenshotElement(opened.windowBody, 'glyth-window-element-after-reload');
    const viewportScreenshot = await screenshot(page, 'glyth-workview-context-after-reload', { fullPage: false, animations: 'disabled' });
    const fullPageScreenshot = await screenshot(page, 'glyth-workview-fullpage-after-reload', { fullPage: true, animations: 'disabled' });
    const postCaptureGeometry = await readWindowVisualGeometry(page, page.locator(targetBodySelector));
    report.screenshotCaptureComparison = { captureOrder: ['window element', 'viewport page', 'full page'],
      windowElementScreenshot, viewportScreenshot, fullPageScreenshot,
      fullPageCaptureCaveat: 'ProfessionalWindowStage is fixed-position; this Playwright fullPage diagnostic omits the fixed overlay. Use the target-window element and viewport screenshots as visual evidence.',
      geometryBeforeCapture: opened.visualGeometry, geometryAfterCapture: postCaptureGeometry };
    return { clickReceipts: report.assemblyApply, beforeAndAfterReloadBoundMembershipCounts: [firstRead.counts, reloadCounts],
      visibleMaterialTitles: report.reloadReadback.visibleMaterialTitles, sourceIntegrityAfterReload: report.sourceIntegrityAfterReload,
      oneReactFlow: true, canvasNodeCount: canvasBefore.nodes.length, screenshots: report.screenshots.slice(-3) };
  });

  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = cleanText(error?.stack ?? error?.message ?? error);
  if (page) {
    try { await screenshot(page, `failure-${Date.now()}`); } catch { /* Keep the primary failure. */ }
  }
} finally {
  try { await context?.close(); } catch { /* best effort */ }
  try { await browser?.close(); } catch { /* best effort */ }
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ passed: report.passed, evidencePath, cases: report.cases,
  assemblyApply: report.assemblyApply, projection: report.collaborationProjection,
  sseObservedInBrowser: report.sseObservedInBrowser, apiFailures: report.apiFailures,
  remoteBlocked: report.remoteBlocked, remoteWebSocketsBlocked: report.remoteWebSocketsBlocked,
  forbiddenProviderMutationsBlocked: report.forbiddenProviderMutationsBlocked,
  blockedAgentGatewayPosts: report.blockedAgentGatewayPosts, screenshots: report.screenshots,
  failure: report.failure }, null, 2));

if (failure) process.exitCode = 1;
