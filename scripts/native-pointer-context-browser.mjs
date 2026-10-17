import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pointerHitEvidence } from './native-pointer-hit-test.mjs';
import { coreBoundContextFingerprint, workViewCoreReadback } from './native-pointer-context-readback.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canvasId = 'surface-core-workflow';
const originalCommonPageTitle = 'TapNow｜你的智能体创意画布';
const originalCanvasTitleUpdater = 'Original TapNow CanvasPage derives `${canvasName.trim()} | ${t("common.pageTitle")}` from persisted canvas metadata, calls sk(title), and the original use-meta-data hook assigns document.title.';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
const runTag = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const evidencePath = path.join(root, 'evidence', `native-pointer-context-${runTag}.json`);
const readbackOnly = process.argv.includes('--readback-only');

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loopbackOrigin(value) {
  assert.ok(value, 'After Root deployment, pass --base-url http://127.0.0.1:<deployed-port>.');
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), 'Expected a local HTTP(S) origin.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'This browser test is loopback-only.');
  assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.equal(url.username, ''); assert.equal(url.password, '');
  return url.origin;
}

if (!process.argv.includes('--deployed') || (!readbackOnly && !process.argv.includes('--allow-one-assembly-apply'))) {
  console.error('Not run: after Root confirms deployment, pass --deployed --base-url; write mode also requires --allow-one-assembly-apply. Readback-only also requires an existing --artifact-view-id.');
  process.exit(2);
}

const origin = loopbackOrigin(cliValue('--base-url') ?? process.env.NATIVE_POINTER_CONTEXT_BASE_URL);
const workflowUrl = `${origin}/canvas/${canvasId}`;
const requestedArtifactViewId = cliValue('--artifact-view-id');
const report = {
  schema: 'native-pointer-context-browser-v1',
  runTag,
  at: new Date().toISOString(),
  target: workflowUrl,
  flow: 'Workflow 原画布既有 Glyth ← 原 Professional Stage Assembly 材料把手的真实 pointer carry → LCOS 原 Semantic Drop preview/release → Core conversation_context → 原 ConversationWorkViewBody 读回',
  scope: {
    surface: 'workflow',
    canvasId,
    onlyWorkflowMutationAllowed: true,
    allowedCanonicalWrite: readbackOnly ? 'none; actual pointer preview will be cancelled before release'
      : 'one exact Core AssemblyApply after a receptive preview for the existing Workflow ConnectedConversation',
    ...(requestedArtifactViewId ? { requestedArtifactViewId } : {}),
    readbackOnly,
    mainOrContextMutationAttempted: false,
    materialOrConversationCreationAttempted: false,
    providerExecutionAllowed: false,
    runOrContinuationPostsAllowed: false,
  },
  browser: 'installed playwright-core; fresh Chrome context; headless; 1440x1000; service workers blocked; loopback HTTP only; off-origin WebSockets blocked',
  pointer: {
    trigger: 'original Assembly carry handle + left pointer; actual page.mouse move/down/move/up in Chromium',
    syntheticDomEventsUsed: false,
    htmlDataTransferUsed: false,
    releasedOnlyAfterExactReceptivePreview: false,
  },
  runtimeProfile: null,
  projectId: null,
  workflow: null,
  titleVerification: { originalUpdater: originalCanvasTitleUpdater, initial: null, afterReload: null },
  targetConversation: null,
  originalGlythNode: null,
  professionalSurfaceState: null,
  singleOriginalCanvas: null,
  sourceMaterial: null,
  targetGeometry: null,
  hitTestEvidence: null,
  assemblyWindow: null,
  preview: null,
  coreApply: null,
  uiReceipt: null,
  coreProjectionAfter: null,
  workViewReadback: null,
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
    'No conversation or material is created by this script; only an already projected Workflow Glyth and an existing Assembly artifact card can be used.',
    readbackOnly
      ? 'Readback-only mode requires an already-bound exact ArtifactView, performs a real pointer preview and Escape-cancels it before release; no Core write is permitted.'
      : 'The only browser write permitted is one real AssemblyApply produced by pointer release after the exact original preview is visible and receptive.',
    'The target rectangle is read from the rendered Glyth DOM; exposed-point evidence comes from the browser hit-test used by the original isDropPointExposed path.',
    'Core provider status is not invoked here. Agent Gateway, Run, continuation, and every other browser write are blocked and retained in the report.',
    'Unrelated HTTP/API failures are retained independently; a passing pointer path does not claim the whole application has zero errors or that a provider/model ran.',
  ],
};

const safeAddress = (raw) => {
  try {
    const url = new URL(raw);
    const keys = [...new Set(url.searchParams.keys())];
    url.search = keys.length === 0 ? '' : `?${keys.map((key) => `${encodeURIComponent(key)}=[redacted]`).join('&')}`;
    url.username = ''; url.password = '';
    return url.toString();
  } catch { return '[unparseable address]'; }
};
const cleanText = (value) => String(value)
  .replace(/https?:\/\/[^\s"'<>]+/g, (raw) => safeAddress(raw))
  .replace(/(authorization|token|secret|api.?key)=([^&\s]+)/gi, '$1=[redacted]')
  .slice(0, 1600);
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const projectPath = (projectId) => `/projects/${encodeURIComponent(projectId)}`;
const nodeSelector = (id) => `.react-flow__node[data-id="${String(id).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
const safePath = (raw) => {
  try { return new URL(raw).pathname; } catch { return '[unparseable path]'; }
};

async function directRead(method, route) {
  const response = await fetch(`${origin}${route}`, { method, headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${method} ${route} returned non-JSON (HTTP ${response.status}).`); }
  const entry = { method, path: route, status: response.status,
    ...(payload?.code === undefined ? {} : { code: payload.code }),
    ...(payload?.ok === undefined ? {} : { ok: payload.ok }),
    ...(payload?.error?.code ? { errorCode: payload.error.code } : {}) };
  report.directReads.push(entry);
  if (response.status >= 400) report.apiFailures.push({ source: 'direct read', ...entry,
    classification: 'HTTP/API failure; retained independently of the pointer flow' });
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

async function readWorkflowCanvas() {
  const result = await directRead('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`);
  assert.equal(result.response.status, 200, 'Workflow Canvas read failed.');
  assert.equal(result.payload?.code, 0, 'Workflow Canvas read returned a non-success envelope.');
  assert.ok(Array.isArray(result.payload?.data?.nodes), 'Workflow Canvas read omitted nodes.');
  return result.payload.data;
}

function expectedWorkflowDocumentTitle() {
  const canvasName = canvasBefore?.name;
  assert.ok(nonEmpty(canvasName), 'Persisted Workflow Canvas metadata did not provide its original title.');
  return `${canvasName.trim()} | ${originalCommonPageTitle}`;
}

async function waitForSettledWorkflowTitle(label) {
  const expectedTitle = expectedWorkflowDocumentTitle();
  await page.waitForFunction((expected) => document.title === expected, expectedTitle, { timeout: 20000 });
  const rawTitle = await page.evaluate(() => document.title);
  assert.equal(rawTitle, expectedTitle, `${label}: original canvas title updater did not settle to its metadata-derived title.`);
  return { canvasMetadataName: canvasBefore.name, expectedTitle, rawTitle, updater: originalCanvasTitleUpdater };
}

async function readConversationProjection(projectId, conversationId) {
  const projection = await coreValue(`${projectPath(projectId)}/connected-conversations/${encodeURIComponent(conversationId)}/collaboration-session`);
  assert.equal(projection?.projectId, projectId, 'Core session projection returned a different project.');
  assert.equal(projection?.conversationId, conversationId, 'Core session projection returned a different conversation.');
  return projection;
}

function boundViewIds(projection) {
  return new Set((projection?.relation?.boundContext ?? []).flatMap((row) => {
    const entity = row?.entityRef;
    if (!isRecord(entity)) return [];
    if (nonEmpty(entity.viewId)) return [entity.viewId];
    if (['artifactView', 'view'].includes(String(entity.type)) && nonEmpty(entity.id)) return [entity.id];
    return [];
  }));
}

async function assertFreshWorkflowIdentity(label) {
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 30000 });
  await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
  const titleCheck = await waitForSettledWorkflowTitle(label);
  const identity = await page.evaluate(() => ({ href: location.href, pathname: location.pathname, title: document.title,
    rawTitle: document.title,
    canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
    reactFlowRoots: document.querySelectorAll('.react-flow').length,
    surfaceState: document.querySelector('[data-lcos-professional-surface-state]')?.getAttribute('data-lcos-professional-surface-state') ?? null }));
  identity.canvasMetadataName = titleCheck.canvasMetadataName;
  identity.expectedDocumentTitle = titleCheck.expectedTitle;
  identity.titleUpdater = titleCheck.updater;
  assert.equal(new URL(identity.href).origin, origin, `${label}: browser left the deployed loopback origin.`);
  assert.equal(identity.href, workflowUrl, `${label}: exact Workflow URL changed.`);
  assert.equal(identity.rawTitle, titleCheck.expectedTitle, `${label}: raw title differs from the original metadata-derived page title.`);
  assert.equal(identity.pathname, `/canvas/${canvasId}`);
  assert.equal(identity.canvasId, canvasId);
  assert.equal(identity.reactFlowRoots, 1, `${label}: expected exactly one original ReactFlow.`);
  assert.equal(identity.surfaceState, 'ready', `${label}: original Core→Shell surface identity is not ready.`);
  if (label.includes('reload')) report.titleVerification.afterReload = titleCheck;
  return identity;
}

function canvasFingerprint(canvas) {
  return {
    nodes: [...(canvas?.nodes ?? [])].map((node) => ({ id: node.id, type: node.type,
      position: node.position ?? null, width: node.width ?? null, height: node.height ?? null,
      ...(node?.data?.lcos_ref ? { lcos_ref: node.data.lcos_ref } : {}),
      ...(node?.data?.lcos_conversation_ref ? { lcos_conversation_ref: node.data.lcos_conversation_ref } : {}) }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    edges: [...(canvas?.edges ?? [])].map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

async function caseRun(name, run) {
  const detail = await run();
  report.cases.push({ name, passed: true, detail });
  console.log(`PASS ${name}`);
  return detail;
}

async function saveScreenshot(page, name) {
  await mkdir(visualRoot, { recursive: true });
  const filename = path.join(visualRoot, `tapnow-native-pointer-context-${runTag}-${name}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  report.screenshots.push(filename);
  return filename;
}

async function saveLocatorScreenshot(locator, name) {
  await mkdir(visualRoot, { recursive: true });
  const filename = path.join(visualRoot, `tapnow-native-pointer-context-${runTag}-${name}.png`);
  await locator.screenshot({ path: filename, animations: 'disabled' });
  report.screenshots.push(filename);
  return filename;
}

async function settlePaintFrames(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
    performanceNow: performance.now(), visibilityState: document.visibilityState,
  })))));
}

async function inspectDropPaint(page, nodeId) {
  return page.evaluate((targetId) => {
    const target = document.querySelector(`[data-lcos-native-conversation-drop-target="${CSS.escape(targetId)}"]`);
    const preview = document.querySelector('[data-lcos-drop-preview]');
    const receptor = [...document.querySelectorAll('[data-lcos-drop-receptor]')]
      .find((element) => element.getAttribute('data-target-label')?.startsWith('会话上下文 ·'));
    const caption = preview?.querySelector('.lcos-drop-caption') ?? null;
    const nodes = { html: document.documentElement, body: document.body, target, receptor, preview, caption };
    const tokenNames = ['--gen2-accent', '--gen2-surface', '--gen2-text', '--gen2-muted',
      '--lcos-glass-bg', '--lcos-glass-blur', '--lcos-glass-shadow', '--lcos-color-border-subtle', '--lcos-status-danger'];
    const readStyle = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const colorProperties = ['display', 'visibility', 'opacity', 'position', 'zIndex', 'pointerEvents',
        'backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'borderTopStyle', 'borderTopWidth',
        'boxShadow', 'backdropFilter', 'webkitBackdropFilter', 'transform', 'filter', 'isolation', 'overflow'];
      return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '',
        parentIsBody: element.parentElement === document.body,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
        intersectsViewport: rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
          && rect.left < innerWidth && rect.top < innerHeight,
        inlineStyle: element.getAttribute('style'),
        computed: Object.fromEntries(colorProperties.map((name) => [name, style[name]])),
        variables: Object.fromEntries(tokenNames.map((name) => [name, style.getPropertyValue(name).trim()])) };
    };
    const stackChain = (element) => {
      const rows = [];
      for (let current = element; current && rows.length < 8; current = current.parentElement) {
        const style = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        rows.push({ tag: current.tagName, id: current.id || null,
          className: typeof current.className === 'string' ? current.className : '',
          position: style.position, zIndex: style.zIndex, opacity: style.opacity,
          transform: style.transform, isolation: style.isolation,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      }
      return rows;
    };
    const previewRect = preview?.getBoundingClientRect();
    const center = previewRect ? { x: Math.max(0, Math.min(innerWidth - 1, previewRect.left + previewRect.width / 2)),
      y: Math.max(0, Math.min(innerHeight - 1, previewRect.top + previewRect.height / 2)) } : null;
    const centerHit = center ? document.elementFromPoint(center.x, center.y) : null;
    return {
      capturedAt: performance.now(), viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: { title: document.title, readyState: document.readyState, visibilityState: document.visibilityState,
        href: location.href, activeElement: document.activeElement?.tagName ?? null },
      loadedStylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
        href: link.href, sheetAttached: link.sheet !== null, disabled: link.disabled })),
      tokenValues: Object.fromEntries(tokenNames.map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()])),
      elements: { target: readStyle(target), receptor: readStyle(receptor), preview: readStyle(preview), caption: readStyle(caption) },
      stacking: { receptor: stackChain(receptor), preview: stackChain(preview) },
      previewCenterHit: centerHit ? { tag: centerHit.tagName, className: typeof centerHit.className === 'string' ? centerHit.className : '',
        closestLcosLayer: centerHit.closest('[data-lcos-drop-preview],[data-lcos-drop-receptor]')?.getAttribute('data-target-label') ?? null } : null,
      pointerEvents: (window.__lcosPointerEventEvidence ?? []).slice(-18),
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
    };
  }, nodeId);
}

async function inspectTarget(targetLocator) {
  return targetLocator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [];
    const fractions = [0.12, 0.25, 0.5, 0.75, 0.88];
    const xFractions = rect.width < 16 ? [0.5] : fractions;
    const yFractions = rect.height < 16 ? [0.5] : fractions;
    for (const fy of yFractions) for (const fx of xFractions) {
      const x = Math.min(rect.right - 0.5, Math.max(rect.left + 0.5, rect.left + rect.width * fx));
      const y = Math.min(rect.bottom - 0.5, Math.max(rect.top + 0.5, rect.top + rect.height * fy));
      const hits = document.elementsFromPoint(x, y);
      const front = hits.find((candidate) => candidate.closest('.react-flow__node.dragging,[data-lcos-native-drop-source],[data-lcos-native-drop-pending]') === null);
      points.push({ x, y, exposedByOriginalHitTest: !!front && element.contains(front),
        front: front ? { tag: front.tagName, className: typeof front.className === 'string' ? front.className : '',
          insideTarget: element.contains(front), closestNodeId: front.closest('.react-flow__node')?.getAttribute('data-id') ?? null } : null });
    }
    return { nodeId: element.getAttribute('data-lcos-native-conversation-drop-target'),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      connected: element.isConnected, pointSamples: points };
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
let warehouse;
let projectionBefore;
let canvasBefore;
let selectedSource;
let exactApplyPath;
let writeGateOpen = false;
let writeGateConsumed = false;
let applyCapture = null;
let resolveApplyRouteCapture;
const applyRouteCapturePromise = new Promise((resolve) => { resolveApplyRouteCapture = resolve; });

async function openOriginalWorkViewReadback(label) {
  const escapedNodeId = String(glythNode.id).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const escapedConversationId = String(conversation.id).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const node = page.locator(nodeSelector(glythNode.id));
  const target = node.locator(`[data-lcos-native-conversation-drop-target="${escapedNodeId}"]`);
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await node.locator('button[aria-haspopup="dialog"]').click();
  const body = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${escapedConversationId}"]`);
  await body.waitFor({ state: 'visible', timeout: 20000 });
  const view = body.locator('[data-lcos-conversation-work-view]');
  await view.waitFor({ state: 'visible', timeout: 20000 });
  const boundContext = view.locator('[data-lcos-conversation-bound-context]');
  await boundContext.waitFor({ state: 'visible', timeout: 20000 });

  const projection = await readConversationProjection(projectId, conversation.id);
  const coreMaterialRows = (projection.relation?.boundContext ?? []).filter((row) =>
    ['artifact', 'view', 'artifactView'].includes(String(row?.entityRef?.type)));
  const coreTitles = coreMaterialRows.map((row) => String(row?.title ?? '')).sort();
  const uiTitles = (await boundContext.locator('[data-lcos-bound-material]').allInnerTexts())
    .map((title) => title.trim()).sort();
  assert.deepEqual(uiTitles, coreTitles,
    `${label}: original ConversationWorkViewBody labels/count do not match the full Core boundContext material multiset.`);
  assert.ok(selectedSource && coreMaterialRows.some((row) => row?.entityRef?.viewId === selectedSource.artifactViewId
    || row?.entityRef?.id === selectedSource.artifactViewId),
  `${label}: Core session no longer contains the exact selected ArtifactView.`);
  assert.equal(await page.locator('.react-flow').count(), 1, `${label}: more than one original ReactFlow is mounted.`);

  await settlePaintFrames(page);
  const geometry = await body.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const stage = element.closest('[data-lcos-professional-stage]');
    const stageRect = stage?.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + Math.min(r.width / 2, 80)));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 80)));
    const hit = document.elementFromPoint(x, y);
    return { rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      intersectsViewport: r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
      stageRect: stageRect ? { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height } : null,
      centerHitInsideConversationBody: !!hit && element.contains(hit), hitTag: hit?.tagName ?? null };
  });
  assert.ok(geometry.intersectsViewport, `${label}: original Work View is not in screen space.`);
  return { label, component: 'original ProfessionalWindowStage → ConversationWorkViewBody',
    projectId, conversationId: conversation.id, exactArtifactViewId: selectedSource.artifactViewId,
    coreBoundArtifactViewIds: [...boundViewIds(projection)], coreMaterialRows: coreMaterialRows.map((row) => ({ entityRef: row.entityRef, title: row.title })),
    ...workViewCoreReadback(projection),
    coreMaterialTitleMultiset: coreTitles, uiMaterialTitleMultiset: uiTitles, titleMultisetMatches: true,
    identityBoundary: 'Original Work View markup exposes labels, not ArtifactView IDs; the exact view ID is confirmed by Core, and all labels/counts are compared.',
    geometry, viewportScreenshot: await saveScreenshot(page, `workview-${label}`),
    windowCropScreenshot: await saveLocatorScreenshot(body, `workview-${label}-window-crop`) };
}

try {
  await mkdir(path.join(root, 'evidence'), { recursive: true });

  await caseRun('deployed loopback runtime is mapped to the exact Workflow surface', async () => {
    const health = await directRead('GET', '/health');
    assert.equal(health.response.status, 200, 'Local runtime health failed.');
    report.runtimeProfile = health.payload?.profile ?? 'profile-not-reported';
    assert.equal(health.payload?.realCoreConnected, true, 'The deployed runtime did not confirm its real Core connection.');
    const status = await tapNowData('/api/surface-core/status');
    projectId = status?.projectId;
    workflow = status?.surfaces?.find((surface) => surface?.preferredSurface === 'workflow');
    assert.ok(nonEmpty(projectId), 'Surface Core did not provide a project ID.');
    assert.ok(workflow && workflow.canvasId === canvasId && nonEmpty(workflow.workspaceId),
      'Surface Core did not map this exact Workflow Canvas and Workspace.');
    report.projectId = projectId;
    report.workflow = { canvasId, workspaceId: workflow.workspaceId, preferredSurface: workflow.preferredSurface };
    canvasBefore = await readWorkflowCanvas();
    const conversationRows = await coreValue(`${projectPath(projectId)}/connected-conversations`);
    assert.ok(Array.isArray(conversationRows), 'Core ConnectedConversation list is not an array.');
    const candidates = conversationRows.filter((row) => row?.projectId === projectId && nonEmpty(row.id)
      && nonEmpty(row.conversationSessionId) && !String(row.conversationRef ?? '').startsWith('pending-'));
    const matching = candidates.flatMap((row) => canvasBefore.nodes.filter((node) => node?.type === 'lcos-conversation'
      && node?.data?.lcos_conversation_ref?.projectId === projectId
      && node?.data?.lcos_conversation_ref?.connectedConversationId === row.id
      && node?.data?.lcos_conversation_ref?.canvasId === canvasId
      && node?.data?.lcos_conversation_ref?.workspaceId === workflow.workspaceId)
      .map((node) => ({ conversation: row, node })));
    assert.equal(matching.length, 1, 'Expected exactly one already-projected Workflow Glyth with an exact existing Core binding.');
    conversation = matching[0].conversation;
    glythNode = matching[0].node;
    const rawGlythTitle = glythNode.data?.title ?? glythNode.data?.label;
    const glythTitle = typeof rawGlythTitle === 'string' && rawGlythTitle.trim()
      ? rawGlythTitle.trim() : `协作会话 ${conversation.id.slice(0, 8)}`;
    report.targetConversation = { id: conversation.id, label: conversation.label, conversationRef: conversation.conversationRef,
      conversationSessionId: conversation.conversationSessionId, provider: conversation.provider,
      isRunning: conversation.isRunning, source: 'existing Core registration; no setup write' };
    report.originalGlythNode = { id: glythNode.id, type: glythNode.type, title: glythTitle,
      reference: glythNode.data.lcos_conversation_ref };
    report.singleOriginalCanvas = { persistedWorkflowCanvasId: canvasId, persistedNodeCount: canvasBefore.nodes.length,
      exactGlythCount: 1, browserReactFlowRootsExpected: 1 };
    exactApplyPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`;
    return { profile: report.runtimeProfile, projectId, workflow: report.workflow,
      conversationId: conversation.id, glythNodeId: glythNode.id, setupWrites: 0 };
  });

  await caseRun('pre-action Core session and Assembly candidates are read without creating materials', async () => {
    projectionBefore = await readConversationProjection(projectId, conversation.id);
    report.coreProjectionBefore = { projectId: projectionBefore.projectId, conversationId: projectionBefore.conversationId,
      boundContextCount: projectionBefore.relation?.boundContext?.length ?? 0,
      boundArtifactViewIds: [...boundViewIds(projectionBefore)] };
    warehouse = await coreValue(`${projectPath(projectId)}/warehouse?limit=100`);
    assert.equal(warehouse?.projectId, projectId, 'Core Warehouse belongs to a different project.');
    assert.ok(Array.isArray(warehouse?.items), 'Core Warehouse omitted its items.');
    const bound = boundViewIds(projectionBefore);
    const candidates = warehouse.items.filter((item) => item?.kind === 'artifact' && item?.entityRef?.type === 'artifact'
      && nonEmpty(item.entityRef.id) && nonEmpty(item.entityRef.viewId) && nonEmpty(item.title))
      .map((item) => ({ artifactId: item.entityRef.id, artifactViewId: item.entityRef.viewId,
        title: item.title, presentedRevisionId: item.presentedRevisionId ?? null,
        alreadyBound: bound.has(item.entityRef.viewId), visualFamily: item.visualFamily ?? null }))
      .sort((left, right) => Number(left.alreadyBound) - Number(right.alreadyBound));
    assert.ok(candidates.length > 0, 'Core Warehouse has no existing Artifact with an exact ArtifactView identity.');
    if (readbackOnly) {
      assert.ok(nonEmpty(requestedArtifactViewId), 'Readback-only mode requires an exact existing --artifact-view-id.');
      selectedSource = candidates.find((candidate) => candidate.artifactViewId === requestedArtifactViewId);
      assert.ok(selectedSource, `--artifact-view-id ${requestedArtifactViewId} is not an exact existing Core Warehouse view for this project.`);
      assert.equal(selectedSource.alreadyBound, true,
        'Readback-only mode is limited to a relation Core already confirms; it cannot preview an unbound relation as a no-op.');
    } else if (requestedArtifactViewId !== undefined) {
      assert.ok(nonEmpty(requestedArtifactViewId), '--artifact-view-id must be a non-empty exact Core ArtifactView ID.');
      selectedSource = candidates.find((candidate) => candidate.artifactViewId === requestedArtifactViewId);
      assert.ok(selectedSource, `--artifact-view-id ${requestedArtifactViewId} is not an exact existing Core Warehouse view for this project.`);
    } else selectedSource = candidates[0];
    report.sourceMaterial = { ...selectedSource,
      sourceRef: { kind: 'artifactView', id: selectedSource.artifactViewId },
      source: requestedArtifactViewId
        ? 'exact --artifact-view-id matched an existing Core Warehouse row; no Artifact/View/Revision/FileRecord is created'
        : 'existing Core Warehouse row; no Artifact/View/Revision/FileRecord is created' };
    return { conversationId: conversation.id, beforeBoundViewCount: bound.size,
      candidateCount: candidates.length, selectedArtifactId: selectedSource.artifactId,
      selectedArtifactViewId: selectedSource.artifactViewId, alreadyMemberBeforeAction: selectedSource.alreadyBound };
  });

  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__lcosPointerEventEvidence = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'keydown']) {
      window.addEventListener(type, (event) => {
        const pointer = event;
        const target = event.target instanceof Element ? event.target : null;
        const evidence = window.__lcosPointerEventEvidence;
        evidence.push({ type, timeStamp: event.timeStamp,
          ...(pointer instanceof PointerEvent ? { pointerId: pointer.pointerId, button: pointer.button,
            buttons: pointer.buttons, clientX: pointer.clientX, clientY: pointer.clientY,
            hasCapture: target?.hasPointerCapture?.(pointer.pointerId) ?? false } : {}),
          ...(event instanceof KeyboardEvent ? { key: event.key } : {}),
          targetTag: target?.tagName ?? null,
          targetClass: target && typeof target.className === 'string' ? target.className : '' });
        if (evidence.length > 300) evidence.splice(0, evidence.length - 300);
      }, true);
    }
    const original = Document.prototype.elementsFromPoint;
    if (typeof original !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'elementsFromPoint');
    Object.defineProperty(Document.prototype, 'elementsFromPoint', { ...descriptor, value: function observedElementsFromPoint(x, y) {
      const hits = original.call(this, x, y);
      const front = hits.find((candidate) => candidate.closest('.react-flow__node.dragging,[data-lcos-native-drop-source],[data-lcos-native-drop-pending]') === null);
      const exposedTargetIds = front ? [...this.querySelectorAll('[data-lcos-native-conversation-drop-target]')]
        .filter((element) => element.contains(front))
        .map((element) => element.getAttribute('data-lcos-native-conversation-drop-target')) : [];
      const root = this.defaultView;
      if (root) {
        root.__lcosPointerHitTestEvidence ??= [];
        root.__lcosPointerHitTestEvidence.push({ x, y, exposedTargetIds,
          front: front ? { tag: front.tagName, className: typeof front.className === 'string' ? front.className : '' } : null });
      }
      return hits;
    } });
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (url.protocol === 'data:' || url.protocol === 'blob:') { await route.continue(); return; }
    if (!['http:', 'https:'].includes(url.protocol)) {
      report.remoteBlocked.push({ method, address: safeAddress(url.href), reason: 'unknown protocol blocked' });
      await route.abort('blockedbyclient'); return;
    }
    if (url.origin !== origin) {
      report.remoteBlocked.push({ method, address: safeAddress(url.href), reason: 'off-origin HTTP blocked' });
      await route.abort('blockedbyclient'); return;
    }
    if (method === 'POST' && url.pathname.startsWith('/api/agent-gateway/')) {
      report.blockedAgentGatewayPosts.push({ method, path: url.pathname, reason: 'Provider/model execution is outside the pointer-reference flow.' });
      await route.abort('blockedbyclient'); return;
    }
    if (method === 'POST' && (/\/collaboration-send$/.test(url.pathname)
      || /\/conversation-continuations(?:\/|$)/.test(url.pathname)
      || /\/recovery-actions$/.test(url.pathname)
      || /\/runtime\/(?:runs|dispatch|execute)(?:\/|$)/.test(url.pathname))) {
      report.forbiddenProviderMutationsBlocked.push({ method, path: url.pathname });
      await route.abort('blockedbyclient'); return;
    }
    if (method === 'POST' && url.pathname === exactApplyPath) {
      let body;
      try { body = JSON.parse(request.postData() ?? '{}'); } catch { body = undefined; }
      const exactBody = body?.schemaVersion === 1 && body.projectId === projectId
        && body.targetRef?.kind === 'conversation' && body.targetRef.id === conversation.id
        && Array.isArray(body.sourceRefs) && body.sourceRefs.length === 1
        && body.sourceRefs[0]?.kind === 'artifactView' && body.sourceRefs[0]?.id === selectedSource.artifactViewId;
      if (!writeGateOpen || writeGateConsumed || !exactBody) {
        report.scopeViolations.push({ method, path: url.pathname, exactBody,
          reason: 'Only one exact existing Workflow ArtifactView→ConnectedConversation Apply is allowed after receptive preview.' });
        await route.abort('blockedbyclient'); return;
      }
      writeGateConsumed = true;
      const response = await route.fetch();
      let payload;
      try { payload = await response.json(); } catch { payload = { nonJson: true }; }
      applyCapture = { status: response.status(), payload, request: body };
      report.assemblyApplyResponses.push({ method, path: url.pathname, status: response.status(),
        request: body, payload });
      resolveApplyRouteCapture(applyCapture);
      await route.fulfill({ response });
      return;
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) { await route.continue(); return; }
    report.blockedOtherWrites.push({ method, path: url.pathname,
      reason: 'Only the one exact preview-authorized AssemblyApply is permitted in this browser run.' });
    await route.abort('blockedbyclient');
  });

  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async (socketRoute) => {
      const address = new URL(socketRoute.url());
      const current = new URL(origin);
      const expectedProtocol = current.protocol === 'https:' ? 'wss:' : 'ws:';
      if (address.protocol === expectedProtocol && address.host === current.host) {
        await socketRoute.connect();
        return;
      }
      report.remoteWebSocketsBlocked.push(safeAddress(address.href));
      await socketRoute.close({ code: 1008, reason: 'off-origin websocket blocked for this local pointer test' });
    });
  } else report.websocketInterception = 'routeWebSocket unavailable in installed Playwright runtime';

  page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(cleanText(error.stack ?? error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(cleanText(message.text()));
    else if (message.type() === 'warning' || message.type() === 'warn') report.consoleWarnings.push(cleanText(message.text()));
  });
  page.on('requestfailed', (request) => report.requestFailures.push({ method: request.method(), address: safeAddress(request.url()),
    error: cleanText(request.failure()?.errorText ?? 'request failed') }));
  page.on('request', (request) => report.browserRequests.push({ method: request.method(), path: safePath(request.url()), status: 'requested' }));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const matching = [...report.browserRequests].reverse().find((row) => row.path === url.pathname && row.status === 'requested');
    if (matching) matching.status = response.status();
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('text/event-stream')) report.sseResponses.push({ method: response.request().method(),
      path: url.pathname, status: response.status(), contentType, actualHttpSseResponse: true });
    if (response.status() >= 400) report.apiFailures.push({ source: 'browser response', method: response.request().method(),
      path: url.pathname, status: response.status(), classification: 'HTTP/API failure; retained independently of target-flow result' });
  });
  page.on('dialog', (dialog) => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());

  await caseRun('fresh Workflow browser maps one original ReactFlow and mature host before opening source', async () => {
    await page.goto(workflowUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 30000 });
    await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 20000 });
    const initialTitleCheck = await waitForSettledWorkflowTitle('initial fresh Workflow route');
    const closeAgentPanel = page.getByRole('button', { name: '关闭 Agent 面板', exact: true });
    if (await closeAgentPanel.count() && await closeAgentPanel.isVisible()) await closeAgentPanel.click();
    const identity = await page.evaluate(() => ({ href: location.href, pathname: location.pathname, title: document.title,
      rawTitle: document.title,
      documentReadyState: document.readyState,
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
        href: link.href, sheetAttached: link.sheet !== null, disabled: link.disabled })),
      reactFlowRoots: document.querySelectorAll('.react-flow').length,
      canvasId: window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId ?? null,
      surfaceState: document.querySelector('[data-lcos-professional-surface-state]')?.getAttribute('data-lcos-professional-surface-state') ?? null }));
    identity.canvasMetadataName = initialTitleCheck.canvasMetadataName;
    identity.expectedDocumentTitle = initialTitleCheck.expectedTitle;
    identity.titleUpdater = initialTitleCheck.updater;
    assert.equal(identity.pathname, `/canvas/${canvasId}`);
    assert.equal(new URL(identity.href).origin, origin, 'Fresh browser route left the expected deployed loopback origin.');
    assert.equal(identity.href, workflowUrl, 'Fresh browser route URL differs from the exact Workflow route.');
    assert.equal(identity.rawTitle, initialTitleCheck.expectedTitle, 'Fresh raw document title differs from original canvas metadata + title updater.');
    assert.equal(identity.canvasId, canvasId);
    assert.equal(identity.reactFlowRoots, 1, 'A second Canvas root appeared.');
    assert.equal(identity.surfaceState, 'ready', 'Original surface identity was not ready.');
    assert.ok(identity.stylesheets.some((row) => new URL(row.href).pathname === '/lcos/agent-ui.css' && row.sheetAttached),
      'The emitted same-root LCOS stylesheet was not attached to the live document.');
    report.professionalSurfaceState = identity.surfaceState;
    report.pageIdentity = identity;
    report.titleVerification.initial = initialTitleCheck;
    report.singleOriginalCanvas.browser = identity;
    await saveScreenshot(page, 'workflow-original-canvas');
    return identity;
  });

  const targetNode = page.locator(nodeSelector(glythNode.id));
  const glythTarget = targetNode.locator(`[data-lcos-native-conversation-drop-target="${String(glythNode.id).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
  await caseRun('existing Glyth opens its original conversation Work View and Assembly window', async () => {
    await glythTarget.waitFor({ state: 'visible', timeout: 20000 });
    await targetNode.locator('button[aria-haspopup="dialog"]').click();
    const conversationBody = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${String(conversation.id).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
    await conversationBody.waitFor({ state: 'visible', timeout: 20000 });
    const workView = conversationBody.locator('[data-lcos-conversation-work-view]');
    await workView.waitFor({ state: 'visible', timeout: 20000 });
    await page.getByRole('button', { name: '打开 Assembly', exact: true }).click();
    const assemblyBody = page.locator('[data-lcos-window-body="assembly"]');
    await assemblyBody.waitFor({ state: 'visible', timeout: 20000 });
    const assemblyPane = assemblyBody.locator('xpath=ancestor::*[@data-lcos-window-pane][1]');
    report.assemblyWindow = await assemblyPane.evaluate((pane) => {
      const r = pane.getBoundingClientRect();
      const region = pane.closest('[data-lcos-window-region-id]');
      const rr = region?.getBoundingClientRect();
      return { paneLabel: pane.getAttribute('aria-label'), bodyKey: assemblyBodyKey(pane),
        paneRect: { x: r.x, y: r.y, width: r.width, height: r.height },
        regionRect: rr ? { x: rr.x, y: rr.y, width: rr.width, height: rr.height } : null,
        layout: region?.getAttribute('data-lcos-window-layout') ?? null };
      function assemblyBodyKey(element) { return element.querySelector('[data-lcos-window-body="assembly"]') ? 'assembly' : null; }
    });
    assert.equal(report.assemblyWindow.bodyKey, 'assembly');
    assert.equal(await page.locator('.react-flow').count(), 1, 'Opening Assembly created another ReactFlow.');
    // Keep the original Stage-owned Assembly material source visible while clearing the conversation pane over Canvas.
    const workPane = conversationBody.locator('xpath=ancestor::*[@data-lcos-window-pane][1]');
    const closeConversation = workPane.getByRole('button', { name: '关闭窗口', exact: true });
    if (await closeConversation.count() && await closeConversation.isVisible()) await closeConversation.click();
    await conversationBody.waitFor({ state: 'hidden', timeout: 10000 });
    await assemblyBody.waitFor({ state: 'visible', timeout: 10000 });
    return { conversationWorkViewOpened: true, originalAssemblyVisible: true, singleReactFlow: true,
      assemblyWindow: report.assemblyWindow };
  });

  await caseRun('the visible original Assembly artifact row resolves the exact existing Core ArtifactView', async () => {
    const artifactRows = page.locator('[data-lcos-assembly-item-kind="artifact"]');
    await artifactRows.first().waitFor({ state: 'visible', timeout: 20000 });
    const visibleRows = await artifactRows.evaluateAll((rows) => rows.map((row) => ({ artifactId: row.getAttribute('data-lcos-assembly-item'),
      title: row.getAttribute('data-lcos-assembly-item-title') ?? row.querySelector('[title]')?.getAttribute('title') ?? row.innerText.trim(),
      text: row.innerText.trim() })));
    const candidates = warehouse.items.filter((item) => item?.kind === 'artifact' && item?.entityRef?.type === 'artifact'
      && nonEmpty(item.entityRef.id) && nonEmpty(item.entityRef.viewId) && nonEmpty(item.title))
      .map((item) => ({ artifactId: item.entityRef.id, artifactViewId: item.entityRef.viewId, title: item.title,
        presentedRevisionId: item.presentedRevisionId ?? null, alreadyBound: boundViewIds(projectionBefore).has(item.entityRef.viewId),
        visualFamily: item.visualFamily ?? null }))
      .sort((left, right) => Number(left.alreadyBound) - Number(right.alreadyBound));
    const visible = candidates.find((candidate) => candidate.artifactViewId === selectedSource.artifactViewId
      && visibleRows.some((row) => row.artifactId === candidate.artifactId && row.text.includes(candidate.title)));
    assert.ok(visible, 'No visible Assembly artifact card maps unambiguously to an exact Core Warehouse ArtifactView.');
    selectedSource = visible;
    report.sourceMaterial = { ...visible, sourceRef: { kind: 'artifactView', id: visible.artifactViewId },
      visibleAssemblyRow: visibleRows.find((row) => row.artifactId === visible.artifactId && row.text.includes(visible.title)),
      source: 'original Assembly card joined to existing canonical Core Warehouse row by artifact identity and title' };
    return { visibleArtifactCardCount: visibleRows.length, artifactId: visible.artifactId,
      artifactViewId: visible.artifactViewId, exactTitle: visible.title, alreadyMemberBeforeAction: visible.alreadyBound };
  });

  const materialCard = page.locator(`[data-lcos-assembly-item-kind="artifact"][data-lcos-assembly-item="${String(selectedSource.artifactId).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
  await materialCard.scrollIntoViewIfNeeded();
  const carryHandle = materialCard.locator('[data-semantic-drop-handle]');
  await carryHandle.waitFor({ state: 'visible', timeout: 10000 });
  const targetInspection = await inspectTarget(glythTarget);
  report.targetGeometry = { ...targetInspection,
    source: 'lcos-conversation-node-shell.getBoundingClientRect() in the deployed original ReactFlow DOM',
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })) };
  await caseRun('live Glyth DOM rectangle exposes at least one real hit-test point', async () => {
    assert.ok(targetInspection.connected && targetInspection.rect.width > 0 && targetInspection.rect.height > 0,
      'The original Glyth target DOM is detached or has no live screen-space rectangle.');
    const points = targetInspection.pointSamples.filter((point) => point.exposedByOriginalHitTest);
    assert.ok(points.length > 0, 'No point inside the actual Glyth DOM rectangle passes the original exposed-point hit test.');
    return { domRect: targetInspection.rect, liveDOMSamples: targetInspection.pointSamples.length,
      originalHitTestExposedSamples: points.length, chosenRealPoint: points[0] };
  });
  const targetPoint = targetInspection.pointSamples.find((point) => point.exposedByOriginalHitTest);
  report.hitTestEvidence = { method: 'the exact production elementsFromPoint/front-filter/element.contains logic used by isDropPointExposed',
    measuredTargetId: glythNode.id, exposedSamples: targetInspection.pointSamples.filter((point) => point.exposedByOriginalHitTest).length,
    chosenPointerPoint: { x: targetPoint.x, y: targetPoint.y, front: targetPoint.front },
    browserImplementationCalls: 'Document.elementsFromPoint is observed by a transparent wrapper that returns the original result unchanged; pointer-destination call is matched after movement.' };

  let previewApprovedForRelease = false;
  // The page route closure reads this flag. It becomes true only after live original preview + exact receptive receptor checks.
  writeGateOpen = false;
  await caseRun('actual Assembly handle pointer creates the exact original conversation-context preview', async () => {
    const handleBox = await carryHandle.boundingBox();
    assert.ok(handleBox && handleBox.width > 0 && handleBox.height > 0, 'Original Assembly carry handle has no browser hit rectangle.');
    const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    report.sourceMaterial.pointerHandleRect = handleBox;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 18 });
    const preview = page.locator('[data-lcos-drop-preview][data-presentation="preview"]');
    await preview.waitFor({ state: 'visible', timeout: 10000 });
    const expectedTargetLabel = `会话上下文 · ${report.originalGlythNode.title}`;
    await page.waitForFunction((label) => [...document.querySelectorAll('[data-lcos-drop-receptor][data-state="receptive"]')]
      .some((element) => element.getAttribute('data-target-label') === label), expectedTargetLabel, { timeout: 10000 });
    const receptive = page.locator('[data-lcos-drop-receptor][data-state="receptive"]');
    const previewEvidence = await page.evaluate(({ nodeId }) => {
      const previewElement = document.querySelector('[data-lcos-drop-preview][data-presentation="preview"]');
      const receptor = [...document.querySelectorAll('[data-lcos-drop-receptor][data-state="receptive"]')]
        .find((element) => element.getAttribute('data-target-label') === `会话上下文 · ${document.querySelector(`[data-lcos-native-conversation-drop-target="${CSS.escape(nodeId)}"]`)?.querySelector('button')?.textContent?.trim()}`);
      const target = document.querySelector(`[data-lcos-native-conversation-drop-target="${CSS.escape(nodeId)}"]`);
      const hitEvidence = window.__lcosPointerHitTestEvidence ?? [];
      return { previewText: previewElement?.innerText ?? null,
        receptorLabel: receptor?.getAttribute('data-target-label') ?? null,
        receptorRect: receptor ? (() => { const r = receptor.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() : null,
        targetRect: target ? (() => { const r = target.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() : null,
        targetId: target?.getAttribute('data-lcos-native-conversation-drop-target') ?? null,
        pointerHitTestCalls: hitEvidence.slice(-100),
        reactFlowRoots: document.querySelectorAll('.react-flow').length };
    }, { nodeId: glythNode.id });
    assert.equal(previewEvidence.reactFlowRoots, 1, 'Preview appeared alongside a second Canvas.');
    assert.equal(previewEvidence.targetId, glythNode.id, 'Preview hit a different Glyth node.');
    assert.equal(previewEvidence.receptorLabel, expectedTargetLabel, 'Original semantic receiver did not identify the exact Glyth conversation target.');
    assert.ok(previewEvidence.receptorRect && previewEvidence.targetRect
      && Math.abs(previewEvidence.receptorRect.x - previewEvidence.targetRect.x) < 2
      && Math.abs(previewEvidence.receptorRect.y - previewEvidence.targetRect.y) < 2
      && Math.abs(previewEvidence.receptorRect.width - previewEvidence.targetRect.width) < 2
      && Math.abs(previewEvidence.receptorRect.height - previewEvidence.targetRect.height) < 2,
    'Live receiver overlay geometry does not match the original Glyth DOM rectangle.');
    assert.ok(previewEvidence.previewText?.includes('会话上下文') || previewEvidence.previewText?.includes('会话'),
      'Original preview did not communicate the conversation target.');
    const paintFrame = await settlePaintFrames(page);
    const paintAudit = await inspectDropPaint(page, glythNode.id);
    const previewViewportScreenshot = await saveScreenshot(page, 'original-semantic-drop-preview');
    const previewCropScreenshot = await saveLocatorScreenshot(preview, 'original-semantic-drop-preview-crop');
    const receptorCropScreenshot = await saveLocatorScreenshot(receptive, 'original-semantic-drop-receptor-crop');
    report.preview = { status: 'preview', presentation: await preview.getAttribute('data-presentation'),
      receptorState: await receptive.getAttribute('data-state'), label: previewEvidence.receptorLabel,
      text: cleanText(previewEvidence.previewText), actualPointerPoint: { x: targetPoint.x, y: targetPoint.y },
      domTargetId: previewEvidence.targetId, sourceRef: { kind: 'artifactView', id: selectedSource.artifactViewId },
      targetRef: { kind: 'conversation', id: conversation.id },
      screenshots: { viewport: previewViewportScreenshot, previewCrop: previewCropScreenshot, receptorCrop: receptorCropScreenshot },
      paintFrame, paintAudit, pointerHitTestMatched: false };
    const hitRecord = pointerHitEvidence(previewEvidence.pointerHitTestCalls, glythNode.id, targetPoint.x, targetPoint.y);
    assert.ok(hitRecord, 'No production exposed-point hit-test call at the actual pointer destination confirmed the exact Glyth.');
    report.hitTestEvidence.pointerDestinationCall = hitRecord;
    report.preview.pointerHitTestMatched = true;
    if (!readbackOnly) {
      previewApprovedForRelease = true;
      writeGateOpen = true;
      report.pointer.releasedOnlyAfterExactReceptivePreview = true;
    }
    return { trigger: 'existing Assembly handle left-pointer carry', sourceArtifactViewId: selectedSource.artifactViewId,
      originalPreview: true, receptiveConversationTarget: report.preview.label, exactGlythNodeId: glythNode.id,
      actualDOMPointPassedHitTest: true, releaseNotYetSent: true,
      readbackOnlyCancelledBeforeRelease: readbackOnly };
  });

  if (readbackOnly) {
    await caseRun('readback-only pointer preview is Escape-cancelled before release and changes no Core relation', async () => {
      assert.equal(report.preview?.pointerHitTestMatched, true);
      assert.equal(writeGateOpen, false, 'Readback-only mode must never open the canonical write route.');
      const receiptBeforeCancel = await page.locator('[data-lcos-drop-receipt]').count();
      await page.keyboard.press('Escape');
      await page.locator('[data-lcos-drop-preview]').waitFor({ state: 'hidden', timeout: 10000 });
      report.pointer.cancelledByOriginalEscape = true;
      await page.mouse.up();
      await settlePaintFrames(page);
      const projectionAfterCancel = await readConversationProjection(projectId, conversation.id);
      assert.deepEqual(coreBoundContextFingerprint(projectionAfterCancel), coreBoundContextFingerprint(projectionBefore),
        'Escape-cancelled preview changed the existing Core conversation_context.');
      const applyRequests = report.browserRequests.filter((row) => row.method === 'POST' && row.path === exactApplyPath);
      assert.equal(applyRequests.length, 0, 'Readback-only preview attempted a Core AssemblyApply POST.');
      assert.equal(report.assemblyApplyResponses.length, 0, 'Readback-only preview captured a Core AssemblyApply response.');
      assert.equal(report.scopeViolations.length, 0, 'A prohibited AssemblyApply was attempted in readback-only mode.');
      assert.equal(await page.locator('[data-lcos-drop-receipt]').count(), receiptBeforeCancel,
        'Escape-cancelled preview unexpectedly produced an apply receipt.');
      const assemblyBody = page.locator('[data-lcos-window-body="assembly"]');
      if (await assemblyBody.count()) {
        const pane = assemblyBody.locator('xpath=ancestor::*[@data-lcos-window-pane][1]');
        const close = pane.getByRole('button', { name: '关闭窗口', exact: true });
        if (await close.count() && await close.isVisible()) await close.click();
      }
      await assemblyBody.waitFor({ state: 'hidden', timeout: 10000 });
      const reloadedIdentity = await (async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        return assertFreshWorkflowIdentity('readback-only real reload');
      })();
      report.pageReload = { identity: reloadedIdentity, sameOriginalWorkflowCanvas: true,
        performedAfterEscapeCancel: true, noCoreWriteAllowed: true };
      const readback = await openOriginalWorkViewReadback('readback-only-after-reload');
      assert.deepEqual(coreBoundContextFingerprint(projectionAfterCancel), readback.coreBoundContextFingerprint,
        'Real reload changed Core boundContext identities during readback-only mode.');
      report.readbackOnly = { sourceArtifactViewId: selectedSource.artifactViewId,
        sourceAlreadyMemberBeforeStart: selectedSource.alreadyBound,
        preview: report.preview, paintEvidence: report.preview.paintAudit,
        projectionUnchangedByEscape: true, applyPostCount: 0,
        workViewAfterReload: readback };
      return { previewCaptured: true, previewCancelledWithEscape: true, noAssemblyApply: true,
        exactExistingBoundView: selectedSource.artifactViewId, workViewAfterReload: true,
        allExistingMaterialTitlesMatchCore: readback.titleMultisetMatches };
    });
  } else {
  await caseRun('real pointer release submits one exact Core AssemblyApply and original per-item receipt', async () => {
    assert.equal(previewApprovedForRelease, true, 'The exact receptive preview was not approved for release.');
    // Subscribe before release: a committing receipt is progress, not proof that Core or the UI settled.
    const browserApplyResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return request.method().toUpperCase() === 'POST' && url.origin === origin && url.pathname === exactApplyPath;
    }, { timeout: 30000 });
    await page.mouse.up();
    const browserApplyResponse = await browserApplyResponsePromise;
    const responseFinishedError = await browserApplyResponse.finished();
    const routeCapture = await applyRouteCapturePromise;
    report.applyCompletion = { browserResponseStatus: browserApplyResponse.status(),
      routeCaptureStatus: routeCapture.status, responseFinishedError: responseFinishedError ?? null,
      completedBeforeReceiptInspection: true };
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-lcos-drop-receipt]')?.getAttribute('data-status');
      return status === 'success' || status === 'partial' || status === 'failed';
    }, null, { timeout: 30000 });
    const receipt = page.locator('[data-lcos-drop-receipt][data-status]');
    const status = await receipt.getAttribute('data-status');
    const message = await receipt.innerText();
    if (await receipt.getByRole('button', { name: '查看详情', exact: true }).count()) {
      await receipt.getByRole('button', { name: '查看详情', exact: true }).click();
    }
    const itemLines = await page.locator('[data-lcos-drop-receipt] li[data-outcome]').allInnerTexts();
    const value = applyCapture?.payload?.value;
    report.coreApply = { httpStatus: applyCapture?.status ?? null,
      projectId: value?.projectId ?? null, request: applyCapture?.request ?? null,
      envelope: applyCapture?.payload ?? null, allApplied: value?.allApplied ?? null,
      results: value?.results ?? null, exactlyOnePermittedApply: report.assemblyApplyResponses.length === 1 };
    report.uiReceipt = { status, message: cleanText(message), itemLines: itemLines.map(cleanText),
      terminalReceiptObserved: ['success', 'partial', 'failed'].includes(String(status)),
      screenshot: await saveScreenshot(page, 'original-drop-core-receipt') };

    const browserApplyRequests = report.browserRequests.filter((row) => row.method === 'POST' && row.path === exactApplyPath);
    assert.equal(browserApplyRequests.length, 1, 'Pointer release must not retry or duplicate the Core AssemblyApply request.');
    assert.equal(report.assemblyApplyResponses.length, 1, 'The pointer release did not yield exactly one permitted AssemblyApply response.');
    assert.ok(applyCapture, 'The exact original Core AssemblyApply request was not captured.');
    assert.equal(browserApplyResponse.status(), applyCapture.status, 'Browser response and route capture status do not match.');
    assert.equal(responseFinishedError, null, 'The browser AssemblyApply response did not finish cleanly.');
    assert.equal(applyCapture.status, 200, `Core AssemblyApply failed with HTTP ${applyCapture.status}.`);
    assert.equal(applyCapture.payload?.ok, true, 'Core AssemblyApply did not return its {ok,value} envelope.');
    assert.equal(value?.projectId, projectId);
    assert.equal(value?.results?.length, 1, 'Core did not return exactly one item-level Assembly receipt.');
    assert.deepEqual(value.results[0].sourceRef, { kind: 'artifactView', id: selectedSource.artifactViewId },
      'Core receipt does not identify the exact canonical ArtifactView; a Canvas node id must never be sent as Core identity.');
    assert.ok((value.results[0].status === 'applied')
      || (value.results[0].status === 'skipped' && value.results[0].channel === 'already-member'),
    'Core receipt is neither an applied reference nor an explicit already-member result.');
    assert.equal(writeGateConsumed, true);
    assert.equal(status, 'success', `Original drop receipt is ${status}, not success; preserving the actual Core per-item outcome.`);
    assert.equal(itemLines.length, 1, 'Original drop UI did not render exactly one item-level receipt.');
    const expectedUiOutcome = value.results[0].status === 'applied' ? '已加入' : '已在目标中';
    assert.ok(itemLines[0].includes(expectedUiOutcome), 'Original UI item outcome does not match Core’s real receipt.');
    report.coreApply.result = value.results[0];
    report.coreApply.exactlyOnePermittedApply = true;
    report.uiReceipt.outcomeMatchesCore = true;
    return { status: value.results[0].status, channel: value.results[0].channel,
      sourceRef: value.results[0].sourceRef, UIReceiptStatus: status, UIOutcome: expectedUiOutcome };
  });

  await caseRun('Core collaboration-session and original Glyth Work View read back the exact bound material', async () => {
    const projectionAfter = await readConversationProjection(projectId, conversation.id);
    const confirmed = boundViewIds(projectionAfter).has(selectedSource.artifactViewId);
    assert.equal(confirmed, true, 'Core collaboration-session does not project the exact ArtifactView after the drop.');
    report.coreProjectionAfter = { projectId: projectionAfter.projectId, conversationId: projectionAfter.conversationId,
      boundContextCount: projectionAfter.relation?.boundContext?.length ?? 0,
      exactArtifactViewConfirmed: selectedSource.artifactViewId,
      matchingRows: (projectionAfter.relation?.boundContext ?? []).filter((row) => row?.entityRef?.viewId === selectedSource.artifactViewId
        || row?.entityRef?.id === selectedSource.artifactViewId).map((row) => ({ entityRef: row.entityRef, title: row.title })) };
    // Dismiss only the original transient receipt and close the mature Assembly window before reopening Glyth.
    const closeReceipt = page.getByRole('button', { name: '关闭投放结果', exact: true });
    if (await closeReceipt.count() && await closeReceipt.isVisible()) await closeReceipt.click();
    const assemblyBody = page.locator('[data-lcos-window-body="assembly"]');
    if (await assemblyBody.count()) {
      const assemblyPane = assemblyBody.locator('xpath=ancestor::*[@data-lcos-window-pane][1]');
      const closeAssembly = assemblyPane.getByRole('button', { name: '关闭窗口', exact: true });
      if (await closeAssembly.count() && await closeAssembly.isVisible()) await closeAssembly.click();
    }
    await assemblyBody.waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 10000 });
    await glythTarget.waitFor({ state: 'visible', timeout: 10000 });
    await targetNode.locator('button[aria-haspopup="dialog"]').click();
    const conversationBody = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${String(conversation.id).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
    await conversationBody.waitFor({ state: 'visible', timeout: 15000 });
    const workView = conversationBody.locator('[data-lcos-conversation-work-view]');
    await workView.waitFor({ state: 'visible', timeout: 15000 });
    const boundContext = workView.locator('[data-lcos-conversation-bound-context]');
    await boundContext.waitFor({ state: 'visible', timeout: 15000 });
    const titleMatches = boundContext.locator('[data-lcos-bound-material]');
    await page.waitForFunction((title) => [...document.querySelectorAll('[data-lcos-conversation-bound-context] [data-lcos-bound-material]')]
      .some((element) => element.textContent?.trim() === title), selectedSource.title, { timeout: 20000 });
    const visibleTitles = await titleMatches.allInnerTexts();
    const coreMaterialRows = (projectionAfter.relation?.boundContext ?? []).filter((row) =>
      ['artifact', 'view', 'artifactView'].includes(String(row?.entityRef?.type)));
    const coreTitles = coreMaterialRows.map((row) => String(row?.title ?? '')).sort();
    const uiTitles = visibleTitles.map((title) => title.trim()).sort();
    const coreExactSourceRows = coreMaterialRows.filter((row) => row?.entityRef?.viewId === selectedSource.artifactViewId
      || row?.entityRef?.id === selectedSource.artifactViewId);
    const coreSelectedTitleCount = coreMaterialRows.filter((row) => String(row?.title ?? '') === selectedSource.title).length;
    const uiSelectedTitleCount = visibleTitles.filter((title) => title.trim() === selectedSource.title).length;
    report.workViewReadback = { component: 'original ProfessionalWindowStage → ConversationWorkViewBody',
      materialTitle: selectedSource.title, visibleBoundMaterials: visibleTitles,
      exactCoreArtifactView: selectedSource.artifactViewId,
      exactCoreSourceMatchCount: coreExactSourceRows.length,
      exactCoreSourceRows: coreExactSourceRows.map((row) => ({ entityRef: row.entityRef, title: row.title })),
      coreMaterialTitleMultiset: coreTitles, uiMaterialTitleMultiset: uiTitles,
      titleMultisetMatches: JSON.stringify(coreTitles) === JSON.stringify(uiTitles),
      selectedTitleCoreCount: coreSelectedTitleCount, selectedTitleUiCount: uiSelectedTitleCount,
      identityBoundary: 'ConversationWorkViewBody exposes labels, not ArtifactView IDs; exact identity is confirmed by Core projection, while UI is checked by full title multiset/count.',
      screenshot: null };
    assert.equal(coreExactSourceRows.length, 1, 'Core projection did not contain exactly one exact ArtifactView row.');
    assert.deepEqual(uiTitles, coreTitles,
      'Original Work View material label multiset/count does not match all artifact-like Core boundContext rows.');
    assert.ok(uiSelectedTitleCount >= 1 && uiSelectedTitleCount === coreSelectedTitleCount,
      'The selected title count in the original Work View does not match Core boundContext.');
    assert.equal(await page.locator('.react-flow').count(), 1, 'Reading the relation mounted another Canvas.');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const workViewGeometry = await conversationBody.evaluate((element) => {
      const r = element.getBoundingClientRect(); const stage = element.closest('[data-lcos-professional-stage]');
      const stageRect = stage?.getBoundingClientRect();
      const x = Math.max(0, Math.min(innerWidth - 1, r.left + Math.min(r.width / 2, 80)));
      const y = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 80)));
      const hit = document.elementFromPoint(x, y);
      return { rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        intersectsViewport: r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
        stageRect: stageRect ? { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height } : null,
        centerHitInsideConversationBody: !!hit && element.contains(hit), hitTag: hit?.tagName ?? null };
    });
    assert.ok(workViewGeometry.intersectsViewport, 'Original Work View body is not visibly on screen.');
    report.workViewReadback.geometry = workViewGeometry;
    report.workViewReadback.screenshot = await saveScreenshot(page, 'original-workview-core-context');
    const canvasAfter = await readWorkflowCanvas();
    const unchanged = JSON.stringify(canvasFingerprint(canvasAfter)) === JSON.stringify(canvasFingerprint(canvasBefore));
    report.canvasUnchanged = { unchanged, beforeNodeCount: canvasBefore.nodes.length, afterNodeCount: canvasAfter.nodes.length,
      beforeEdgeCount: canvasBefore.edges?.length ?? 0, afterEdgeCount: canvasAfter.edges?.length ?? 0,
      exactOriginalGlythReferenceStillPresent: canvasAfter.nodes.filter((node) => node?.id === glythNode.id
        && node?.data?.lcos_conversation_ref?.connectedConversationId === conversation.id).length === 1 };
    assert.equal(unchanged, true, 'Context reference drop changed persisted Canvas nodes/edges; no such spatial mutation was intended.');
    const preReloadProjection = projectionAfter;
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedIdentity = await assertFreshWorkflowIdentity('post-drop real reload');
    report.pageReload = { identity: reloadedIdentity, sameOriginalWorkflowCanvas: true,
      performedAfterCoreApply: true, noSecondCoreWriteExpected: true };
    const reloadedWorkView = await openOriginalWorkViewReadback('after-drop-reload');
    assert.deepEqual(coreBoundContextFingerprint(preReloadProjection), reloadedWorkView.coreBoundContextFingerprint,
      'The original Core conversation_context references changed after a real page reload.');
    report.workViewReadback.afterReload = reloadedWorkView;
    assert.equal(report.browserRequests.filter((row) => row.method === 'POST' && row.path === exactApplyPath).length, 1,
      'Reload/readback issued another Core AssemblyApply request.');
    return { CoreBoundArtifactView: selectedSource.artifactViewId, visibleInOriginalWorkView: true,
      screenSpaceWindow: workViewGeometry, onlyOriginalReactFlow: true, persistedCanvasUnchanged: true,
      originalWorkViewReopenedAfterRealReload: true,
      boundContextRowsAfterReload: reloadedWorkView.coreBoundContextFingerprint.length };
  });
  }

  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = cleanText(error?.stack ?? error?.message ?? error);
  report.writeGateAtFailure = { open: writeGateOpen, consumed: writeGateConsumed,
    previewApprovedForRelease: report.pointer.releasedOnlyAfterExactReceptivePreview };
  if (page) {
    report.failureDom = cleanText(await page.locator('body').innerText().catch(() => '')).slice(0, 9000);
    try { await saveScreenshot(page, 'failure-current-page'); } catch (captureError) {
      report.screenshotFailure = cleanText(captureError?.message ?? captureError);
    }
    report.partialHitTestEvidence = await page.evaluate(() => (window.__lcosPointerHitTestEvidence ?? []).slice(-100)).catch(() => []);
  }
} finally {
  await browser?.close();
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({ passed: report.passed, evidencePath, screenshots: report.screenshots,
  cases: report.cases.map((row) => row.name), failure: report.failure?.split('\n')[0],
  apiFailures: report.apiFailures.length, blockedWrites: report.blockedOtherWrites.length,
  assemblyApplyCount: report.assemblyApplyResponses.length }));
if (failure) process.exitCode = 1;
