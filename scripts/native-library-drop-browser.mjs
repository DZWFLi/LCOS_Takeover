import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { nativeCollectionSavedPlacementMatches } from '../lab/pilot/native-collection-save-precision.mjs';

// Real Chrome mouse transport. No DataTransfer construction, synthetic drag
// events, store mutation, hidden canvas creation, or model request is used.
const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(arg('base-url'), 'Use --base-url=http://127.0.0.1:<coordinated isolated runtime>');
const url = new URL(arg('base-url'));
assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/');
const origin = url.origin, targetCanvasId = arg('target-canvas') ?? 'surface-core-main';
const commit = process.argv.includes('--commit');
const loseResponse = process.argv.includes('--lose-first-response');
const repeat = process.argv.includes('--repeat');
const measureOnly = process.argv.includes('--measure-existing-carrier-only');
const allowMeasurements = commit && (measureOnly || process.argv.includes('--allow-original-carrier-measurements'));
const sourcePart = arg('source-part') ?? 'label';
assert.ok(['label', 'icon'].includes(sourcePart));
assert.ok(!loseResponse || commit, 'Response-loss is only meaningful in the explicitly authorized commit run.');
assert.ok(!repeat || commit, 'Repeated placement is an explicit committed-run action.');
const targetKind = arg('target') ?? 'canvas';
assert.ok(!measureOnly || commit && !loseResponse && !repeat && targetKind === 'canvas', 'Measurement-only is a separate declared existing-carrier save, with no Drop/loss/repeat.');
assert.ok(['canvas', 'composer', 'glyth'].includes(targetKind));
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.realCoreConnected && health.nativeAssemblyPilot && health.runtimeLabel?.startsWith('isolated-'));
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/原生Drop整合_20261017f/原库真实鼠标拖动',
  new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), output, origin, pid: health.pid, runtimeLabel: health.runtimeLabel,
  scope: commit ? 'Full App original Library mouse drag → original target/resolver/router → real isolated Core'
    : 'Full App read-only original Library mouse start/hover/Escape; no release commit; receiver registration inspection',
  commitAuthorizedByInvocation: commit, targetCanvasId, targetKind, sourcePart, repeat, measureOnly, allowMeasurements,
  fixture: 'Existing explicitly synthetic isolated material; no fixture creation',
  responseCopyInstrumentation: 'Read-only getState/targets/targetAt access in the browser response copy; no production or state edits',
  syntheticDragEvents: 0, controlledDataTransfer: false, models: 0, externalBlocked: [], mutationRequests: [], blockedWrites: [],
  materialPosts: [], materialGets: [], originalMeasurementSaves: [], visualFailures: [], pageErrors: [], routeErrors: [], readOnlyTransportRetries: [], checks: [], screenshots: [], passed: false, integrationPassed: false };
const get = async pathname => { const response = await fetch(origin + pathname, { cache: 'no-store', redirect: 'error' });
  assert.equal(response.status, 200, pathname); const b = await response.json();
  if ('ok' in b) { assert.equal(b.ok, true); return b.value; } assert.equal(b.code, 0); return b.data; };
const listing = await get('/api/library/v1/assets:search?type_filter=1&page_size=100');
const asset = listing.items.map(x => x.asset).find(x => x.lcos_projection?.referenceable
  && x.lcos_projection?.artifact_view_id && (!arg('artifact-id') || x.lcos_projection.artifact_id === arg('artifact-id')));
assert.ok(asset, 'Requires an existing real, exact, readable synthetic Library image with a View.');
const projection = asset.lcos_projection, project = `/api/lcos/core/projects/${encodeURIComponent(projection.project_id)}`;
report.source = { title: asset.name, artifactId: projection.artifact_id, artifactViewId: projection.artifact_view_id,
  revisionId: projection.presented_revision_id, fileRecordId: projection.file_record_id };
const beforeGraph = await get(project + '/graph'), beforeRuns = await get(project + '/runs');
const beforePresentations = await get(project + '/presentations');
const canvases = ['surface-core-main', 'surface-core-context', 'surface-core-workflow'];
const beforeCanvas = Object.fromEntries(await Promise.all(canvases.map(async id => [id, await get('/api/canvas/v1/canvases/' + id)])));
await writeFile(path.join(output, 'before-facts.json'), JSON.stringify({ graph: beforeGraph, runs: beforeRuns, presentations: beforePresentations, canvases: beforeCanvas }, null, 2));
const authorizedCarriers = new Map();
const observeCarrier = receipt => {
  const node = receipt?.node, ref = node?.data?.lcos_ref, binding = receipt?.binding;
  if (receipt?.state === 'present' && receipt.project_id === projection.project_id && receipt.canvas_id === targetCanvasId
    && receipt.artifact_id === projection.artifact_id && receipt.revision_id === projection.presented_revision_id
    && receipt.file_record_id === projection.file_record_id && node?.type === 'image' && node.canvas_id === targetCanvasId
    && ref?.version === 1 && ref.artifactId === projection.artifact_id && ref.revisionId === projection.presented_revision_id
    && ref.artifactViewId === receipt.artifact_view_id && binding?.canvasId === targetCanvasId && binding.spatialId === node.id
    && binding.entityId === ref.entityId && binding.entityType === ref.entityType) authorizedCarriers.set(node.id, structuredClone(node));
};
let seedAddress;
if (allowMeasurements && targetKind === 'canvas') {
  const workspace = beforeGraph.workspaces.filter(item => item.canvasId === targetCanvasId);
  assert.equal(workspace.length, 1);
  const owned = workspace[0], scope = beforeGraph.scopes.find(item => item.id === owned.scopeId);
  const rootSurface = scope?.kind === 'root' && ['main', 'context', 'workflow'].includes(owned.preferredSurface);
  const target = rootSurface ? owned.preferredSurface === 'main' ? { kind: 'main' } : { kind: owned.preferredSurface, id: scope.id }
    : { kind: 'workspace', id: owned.id };
  const selected = { projectId: projection.project_id, artifactId: projection.artifact_id, revisionId: projection.presented_revision_id,
    fileRecordId: projection.file_record_id, artifactViewId: projection.artifact_view_id,
    ...(rootSurface ? { targetRef: JSON.stringify(target) } : { workspaceId: owned.id }) };
  seedAddress = `/api/lcos/canvases/${encodeURIComponent(targetCanvasId)}/materials:${rootSurface ? 'receive' : 'place'}?` + new URLSearchParams(selected);
  const response = await fetch(origin + seedAddress, { cache: 'no-store', redirect: 'error' });
  report.existingCarrierRead = { address: seedAddress, status: response.status, response: await response.json() };
  observeCarrier(report.existingCarrierRead.response.data);
  if (measureOnly) assert.equal(authorizedCarriers.size, 1, 'An existing exact present carrier is required; no fixture/carrier is created by measurement-only.');
}
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
const fetchReadonly = async route => {
  assert.equal(route.request().method(), 'GET');
  try { return await route.fetch({ maxRedirects: 0 }); }
  catch (error) {
    report.readOnlyTransportRetries.push({ path: new URL(route.request().url()).pathname, error: String(error) });
    return route.fetch({ maxRedirects: 0 }); // One read-only network retry; never used by a POST.
  }
};
await context.route('**/*', async route => {
  try {
  const request = route.request(), u = new URL(request.url());
  if (['http:', 'https:'].includes(u.protocol) && u.origin !== origin) {
    report.externalBlocked.push(u.origin + u.pathname); return route.abort();
  }
  if (u.pathname === '/lcos/agent-ui.js') {
    const response = await fetchReadonly(route), source = await response.text();
    assert.ok(source.includes('useLcosDropStore ='), 'Read-only test seam must reference the actual original Drop store.');
    assert.ok(source.includes('useLcosReferenceStore'), 'Composer observations must use the actual existing reference owner.');
    const inspect = `\nwindow.__LCOS_TEST_DROP_READ__=(point)=>{const s=useLcosDropStore.getState();const clean=t=>t?{targetId:t.targetId,kind:t.kind,label:t.label,enabled:t.enabled,ineligibleReason:t.ineligibleReason,semantic:t.semantic,rect:t.rect,nodeId:t.nodeId}:null;return{state:s.state,resolution:s.resolution,feedback:s.feedback,referenceDraft:useLcosReferenceStore.getState().draft,targets:s.targets().map(clean),hit:point?clean(s.targetAt(point)):null}};\n`;
    report.sourceBridgeLoaded = source.includes('LCOSNativeLibraryDragStart');
    return route.fulfill({ response, body: source + inspect });
  }
  if (u.pathname.endsWith('/assets/page-Da_DfwiK.js')) {
    const response = await fetchReadonly(route), source = await response.text();
    report.originalRowBridgeLoaded = source.includes('LCOSNativeLibraryDragStart');
    return route.fulfill({ response, body: source });
  }
  if (/\/materials:(place|receive)$/.test(u.pathname)) {
    if (request.method() === 'GET') {
      const value = { path: u.pathname, search: u.search };
      report.materialGets.push(value);
      const response = await fetchReadonly(route);
      value.httpStatus = response.status();
      try { value.response = await response.json(); } catch {}
      observeCarrier(value.response?.data);
      return route.fulfill({ response });
    }
    if (request.method() === 'POST') {
      const value = { path: u.pathname, body: request.postDataJSON(), at: Date.now() };
      report.materialPosts.push(value);
      if (commit) {
        const response = await route.fetch({ maxRedirects: 0 });
        value.status = response.status();
        try { value.response = await response.json(); } catch {}
        observeCarrier(value.response?.data);
        if (loseResponse && !report.responseWithheld && response.ok()) {
          report.withheldStatus = response.status(); report.responseWithheld = true; return route.abort('failed');
        }
        return route.fulfill({ response });
      }
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    const value = { method: request.method(), path: u.pathname, body: request.postData() };
    report.mutationRequests.push(value);
    if (allowMeasurements && request.method() === 'POST' && u.pathname === `/api/canvas/v1/canvases/${encodeURIComponent(targetCanvasId)}/nodes:batchActions`) {
      const packet = request.postDataJSON();
      const current = await page.evaluate(canvasId => {
        const host = window.__LCOS_NODE_LAB__;
        return (host?.currentCanvasId ?? host?.canvasId) === canvasId
          ? { projectId: host.projectId, nodes: host.api?.getNodes() ?? [] } : null;
      }, targetCanvasId);
      const admitted = packet.canvas_id === targetCanvasId && Array.isArray(packet.actions) && packet.actions.length > 0
        && current?.projectId === projection.project_id
        && packet.actions.every(action => action.action === 'update' && Array.isArray(action.updates) && action.updates.length > 0
          && action.updates.every(update => {
            const proof = authorizedCarriers.get(update.id);
            const live = current.nodes.find(node => node.id === update.id);
            if (!proof || Object.keys(update).some(key => !['id', 'type', 'data', 'position', 'measured', 'width', 'height'].includes(key))
              || live?.type !== 'image' || update.type !== undefined && update.type !== 'image'
              || !nativeCollectionSavedPlacementMatches(update.position ?? live.position, proof.position)) return false;
            try { assert.deepEqual(live.data?.lcos_ref, proof.data.lcos_ref);
              if (update.data !== undefined) assert.deepEqual(update.data, proof.data); } catch { return false; }
            return live.data?.lcos_ref?.artifactViewId === proof.data.lcos_ref.artifactViewId
              && (!update.measured || Object.keys(update.measured).every(key => ['width', 'height'].includes(key)
                && Number.isFinite(update.measured[key]) && update.measured[key] > 0));
          }));
      if (admitted) {
        const response = await route.fetch({ maxRedirects: 0 });
        const saved = { ...value, status: response.status() };
        try { saved.response = await response.json(); } catch {}
        report.originalMeasurementSaves.push(saved);
        return route.fulfill({ response });
      }
    }
    // The read-only probe blocks every business mutation, including unrelated
    // startup persistence. The committed run admits only declared material
    // producers plus the explicitly scoped original image measurement update;
    // stock URL imports, model sends, and unrelated user edits remain blocked.
    if (!commit || !/^\/api\/lcos\/canvases\/[^/]+\/materials:(place|receive)$/.test(u.pathname)) {
      report.blockedWrites.push(value); return route.abort();
    }
  }
  return route.continue();
  } catch (error) {
    report.routeErrors.push({ path: new URL(route.request().url()).pathname, method: route.request().method(), error: String(error.stack ?? error) });
    try { await route.abort('failed'); } catch {}
  }
});
await context.routeWebSocket('**/*', socket => { report.externalBlocked.push('WebSocket:' + socket.url()); socket.close(); });
await context.addInitScript(() => {
  window.__LCOS_TEST_DRAG_EVENTS__ = [];
  const record = (event, phase) => {
    const element = event.target instanceof Element ? event.target : null;
    let data = {};
    if (event.type === 'dragstart' && phase === 'bubble') for (const type of event.dataTransfer?.types ?? []) {
      try { data[type] = event.dataTransfer.getData(type); } catch {}
    }
    const item = { type: event.type, phase, at: performance.now(), x: event.clientX, y: event.clientY,
      trusted: event.isTrusted, prevented: event.defaultPrevented, target: element?.outerHTML.slice(0, 350),
      types: [...(event.dataTransfer?.types ?? [])], data, effectAllowed: event.dataTransfer?.effectAllowed,
      dropEffect: event.dataTransfer?.dropEffect };
    window.__LCOS_TEST_DRAG_EVENTS__.push(item);
    queueMicrotask(() => { try { item.after = window.__LCOS_TEST_DROP_READ__?.({ x: event.clientX, y: event.clientY }); } catch {} });
  };
  for (const kind of ['dragstart', 'dragover', 'drop', 'dragend']) {
    window.addEventListener(kind, event => record(event, 'capture'), true);
    window.addEventListener(kind, event => record(event, 'bubble'));
  }
});
const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
const read = point => page.evaluate(point => window.__LCOS_TEST_DROP_READ__?.(point), point);
const noticeGeometry = async button => {
  const measure = () => button.evaluate(element => {
    const toast = element.closest('[data-sonner-toast]'), dock = document.querySelector('[data-lcos-surface-dock]');
    const shape = node => node?.getBoundingClientRect().toJSON();
    return { toast: shape(toast), dock: shape(dock), viewport: { width: innerWidth, height: innerHeight },
      toastOpacity: toast ? Number(getComputedStyle(toast).opacity) : null,
      buttons: dock ? [...dock.querySelectorAll('button')].map(node => ({ label: node.textContent?.trim(), rect: shape(node) })) : [] };
  });
  let geometry = await measure();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(160); const next = await measure();
    if (JSON.stringify(next) === JSON.stringify(geometry) && next.toastOpacity >= .99) { geometry = next; break; }
    geometry = next;
  }
  const { toast, dock, buttons, viewport } = geometry;
  if (!toast || !dock || buttons.length !== 3 || geometry.toastOpacity < .99) report.visualFailures.push('Original toast/Dock did not reach a measurable stable state with all three buttons.');
  else {
    const overlap = toast.left < dock.right && toast.right > dock.left && toast.top < dock.bottom && toast.bottom > dock.top;
    if (overlap) report.visualFailures.push('Original persistent unknown toast overlaps the three-view Dock.');
    for (const button of buttons) if (button.rect.left < 0 || button.rect.right > viewport.width || button.rect.top < 0 || button.rect.bottom > viewport.height)
      report.visualFailures.push('Original surface button is outside the viewport: ' + button.label);
    geometry.overlap = overlap;
  }
  return geometry;
};
const canvasState = () => page.evaluate(() => { const host = window.__LCOS_NODE_LAB__, api = host?.api;
  return { document: performance.timeOrigin, canvasId: host?.currentCanvasId ?? host?.canvasId,
    nodes: api?.getNodes(), edges: api?.getEdges(), selection: api?.getSelection(), camera: api?.getViewport() }; });
try {
  await page.goto(origin + '/canvas/' + encodeURIComponent(targetCanvasId), { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow').waitFor({ timeout: 60000 });
  await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
    && !!window.__LCOS_NODE_LAB__?.api && !!window.__LCOS_TEST_DROP_READ__, targetCanvasId, { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  if (measureOnly) {
    report.scope = 'Full App original image renderer measurement save for an already confirmed exact carrier; subsequent real semantic GET readback. No drag/drop/material POST.';
    report.before = await canvasState();
    await shot('01-existing-carrier-original-renderer');
    for (let i = 0; i < 75 && !report.originalMeasurementSaves.length; i++) await page.waitForTimeout(200);
    assert.ok(report.originalMeasurementSaves.length >= 1, 'Observe the actual original renderer measurement saves, without a hidden update/flush/retry call.');
    assert.equal(report.originalMeasurementSaves[0].status, 200);
    const response = await fetch(origin + seedAddress, { cache: 'no-store', redirect: 'error' });
    report.afterOriginalMeasurementRead = { status: response.status, response: await response.json() };
    report.after = await canvasState();
    await shot('02-after-original-measurement-real-receipt');
    assert.equal(report.materialPosts.length, 0);
    assert.deepEqual(await get(project + '/graph'), beforeGraph); assert.deepEqual(await get(project + '/runs'), beforeRuns);
    assert.deepEqual(await get(project + '/presentations'), beforePresentations);
    assert.equal(report.afterOriginalMeasurementRead.status, 200);
    assert.equal(report.afterOriginalMeasurementRead.response.data.state, 'present', 'Existing exact native PC/DC two-decimal save must remain a readable material receipt.');
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors, []);
    report.checks.push('Original renderer actually saved its declared exact carrier; material producer POST 0; Core/Run/Presentation unchanged.');
    report.passed = true;
  } else {
  report.receiverBeforeLibrary = await read();
  await page.getByTestId('canvas-dockbar-assets-btn').click();
  const library = page.locator('[data-library-view="library"]');
  await library.getByRole('textbox', { name: '搜索', exact: true }).fill(asset.name);
  const sourceButton = library.getByRole('button', { name: asset.name, exact: true });
  await sourceButton.waitFor({ timeout: 30000 });
  const row = sourceButton.locator('xpath=ancestor::div[@draggable="true"][1]');
  assert.equal(await row.count(), 1, 'Source is the actual original Zp draggable row, not its preview or an invented proxy.');
  report.originalRow = await row.evaluate(element => ({ html: element.outerHTML, rect: element.getBoundingClientRect().toJSON() }));
  report.receiverWithLibrary = await read();
  const rowRect = report.originalRow.rect;
  report.occlusion = { libraryRowHit: await read({ x: rowRect.x + rowRect.width / 2, y: rowRect.y + rowRect.height / 2 }) };
  await shot('01-original-Zp-source-and-receivers');
  const before = await canvasState(), apiHandle = await page.evaluateHandle(() => window.__LCOS_NODE_LAB__.api);
  report.before = before;
  const point = await page.evaluate(targetKind => {
    const shape = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    if (targetKind !== 'canvas') {
      const selector = targetKind === 'composer' ? '[data-lcos-composer-reference-surface]' : '[data-lcos-native-conversation-drop-target]';
      const elements = [...document.querySelectorAll(selector)].filter(e => e.getBoundingClientRect().width > 0);
      if (elements.length !== 1) return { error: 'Expected one real receiver DOM: ' + selector, found: elements.length };
      const b = shape(elements[0]); return { x: b.x + b.width / 2, y: b.y + b.height / 2, receiver: selector, rect: b };
    }
    const canvas = document.querySelector('.react-flow'), b = canvas.getBoundingClientRect();
    const blockers = '[data-library-view], [data-lcos-native-chat-frame], [data-lcos-surface-dock], .react-flow__node, [role="dialog"], [data-lcos-drop-preview]';
    for (let y = Math.max(b.top + 80, 100); y < b.bottom - 80; y += 45) for (let x = Math.max(b.left + 100, 430); x < b.right - 80; x += 45) {
      const front = document.elementFromPoint(x, y);
      if (front && canvas.contains(front) && !front.closest(blockers)) return { x, y, receiver: '.react-flow exposed blank', rect: shape(canvas) };
    }
    return { error: 'No actually exposed blank Canvas point; do not force a drop through a window.' };
  }, targetKind);
  assert.ok(!point.error, JSON.stringify(point)); report.pointerTarget = point;
  report.hitBeforeDrag = await read(point);
  const box = await row.boundingBox(); assert.ok(box && box.width > 20 && box.height > 10);
  const mouseHover = async targetPoint => {
    const liveBox = await row.boundingBox(); assert.ok(liveBox);
    const startX = liveBox.x + (sourcePart === 'icon' ? 18 : 95);
    await page.mouse.move(startX, liveBox.y + liveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(startX + 26, liveBox.y + liveBox.height / 2, { steps: 5 });
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 16 });
    await page.waitForTimeout(650);
    await page.mouse.move(targetPoint.x + 1, targetPoint.y + 1, { steps: 2 });
    await page.waitForTimeout(200);
  };
  await mouseHover(point);
  report.hover = await read({ x: point.x + 1, y: point.y + 1 });
  report.previewDOM = await page.locator('[data-lcos-drop-preview], [data-lcos-drop-receptor]').evaluateAll(elements =>
    elements.map(element => ({ html: element.outerHTML, rect: element.getBoundingClientRect().toJSON() })));
  await shot('02-real-mouse-hover-before-release');
  if (!commit) {
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(200);
    report.afterCancel = await read();
    report.checks.push('Native mouse drag started and hovered; Escape canceled before release; all business mutations blocked.');
  } else {
    assert.equal(report.originalRowBridgeLoaded, true, 'Do not release an unwired original stock URL importer.');
    assert.equal(report.hover?.state.status, 'preview', 'Original dwell must reach a real preview before release.');
    assert.equal(report.hover?.resolution?.status, 'ready', 'Never bypass an ineligible original receiver.');
    assert.equal(report.hover.state.payload.reference.revisionId, projection.presented_revision_id);
    await page.mouse.up();
    await page.waitForFunction(() => !!window.__LCOS_TEST_DROP_READ__?.().feedback, undefined, { timeout: 60000 });
    report.afterRelease = await read();
    await shot('03-original-feedback-after-release');
    if (loseResponse) {
      assert.equal(report.responseWithheld, true); assert.equal(report.materialPosts.length, 1);
      const verify = page.getByRole('button', { name: '核对放置结果', exact: true });
      await verify.waitFor({ timeout: 30000 });
      report.unknownToastGeometry = await noticeGeometry(verify);
      await shot('03a-unknown-toast-and-three-view-buttons');
      const postCount = report.materialPosts.length;
      await page.waitForTimeout(30000);
      assert.equal(report.materialPosts.length, postCount, 'Unknown cannot replay while waiting; verification is a later explicit action.');
      report.unknownAfter30Seconds = await read();
      await verify.click();
      await page.waitForFunction(() => window.__LCOS_TEST_DROP_READ__?.().feedback?.receipt.status === 'success', undefined, { timeout: 60000 });
      assert.equal(report.materialPosts.length, postCount, 'Original unknown feedback recovery must be GET-only.');
      report.originalToastRecoveryPassed = true;
    } else assert.equal(report.afterRelease.feedback.receipt.status, 'success', JSON.stringify(report.afterRelease.feedback));
    report.finalFeedback = await read();
    if (targetKind === 'composer') {
      const references = report.finalFeedback.referenceDraft?.orderedEntityRefs ?? [];
      assert.ok(references.some(ref => ref.artifactId === projection.artifact_id
        && ref.artifactViewId === projection.artifact_view_id && ref.revisionId === projection.presented_revision_id),
      'Composer receives the captured exact version in the original this-input draft owner.');
      assert.equal(report.materialPosts.length, 0, 'A temporary Composer reference is not durable Canvas or conversation placement.');
      assert.ok(await page.locator('[data-lcos-composer-ref]').count());
    }
    if (targetKind !== 'composer') {
      const first = report.materialGets[0]?.response?.data;
      assert.ok(first && ['absent', 'present'].includes(first.state), 'The exact original semantic receiver must be inspected, never fabricated from the stock URL importer.');
      assert.equal(report.materialPosts.length, first.state === 'absent' ? 1 : 0, 'One admitted absent result creates one POST; an existing exact result creates none.');
      const expectedTarget = report.hover.resolution.intent.targetRef;
      if (report.materialPosts.length) {
        const post = report.materialPosts[0];
        assert.equal(post.body.artifactId, projection.artifact_id); assert.equal(post.body.artifactViewId, projection.artifact_view_id);
        assert.equal(post.body.revisionId, projection.presented_revision_id); assert.equal(post.body.fileRecordId, projection.file_record_id);
        if (expectedTarget?.kind === 'workspace') {
          assert.ok(post.path.endsWith('/materials:place')); assert.equal(post.body.workspaceId, expectedTarget.id);
        } else { assert.ok(post.path.endsWith('/materials:receive')); assert.deepEqual(post.body.targetRef, expectedTarget); }
      }
    }
    if (targetKind === 'canvas') {
      const receipt = report.finalFeedback.feedback.receipt;
      const afterPlacement = await canvasState();
      const nodes = afterPlacement.nodes.filter(node => node.data?.lcos_ref?.artifactId === projection.artifact_id
        && node.data.lcos_ref.revisionId === projection.presented_revision_id);
      const returned = receipt.canonicalReceipt;
      const nodeId = returned?.node?.id ?? returned?.nodeId;
      const exact = nodeId ? nodes.find(node => node.id === nodeId) : nodes.find(node => !before.nodes.some(old => old.id === node.id));
      assert.ok(exact, 'The original live Canvas must publish the accurate real producer carrier, not only a success toast.');
      report.placed = { nodeId: exact.id, position: exact.position, canonicalPosition: returned?.node?.position,
        ref: exact.data.lcos_ref, canonicalReceipt: returned };
      const release = report.hover.resolution.intent.placementPoint;
      assert.ok(release && Number.isFinite(release.x) && Number.isFinite(release.y));
      report.placed.releasedPosition = release;
      if (!before.nodes.some(old => old.id === exact.id)) assert.ok(nativeCollectionSavedPlacementMatches(exact.position, release),
        'New original carrier uses the original release or the donor DC/PC exact persisted quantization.');
      for (const old of before.nodes) {
        const current = afterPlacement.nodes.find(node => node.id === old.id);
        assert.ok(current); for (const field of ['position', 'data', 'type', 'style', 'parentId']) assert.deepEqual(current[field], old[field], 'Existing original node field stays intact: ' + old.id + '.' + field);
      }
      report.primaryPlacementPassed = true;
      if (repeat) {
        const priorPosts = report.materialPosts.length;
        await mouseHover({ x: point.x + 45, y: point.y + 45 });
        const repeatedPreview = await read({ x: point.x + 46, y: point.y + 46 });
        assert.equal(repeatedPreview?.state.status, 'preview'); assert.equal(repeatedPreview.resolution?.status, 'ready');
        await page.mouse.up();
        await page.waitForFunction(() => !!window.__LCOS_TEST_DROP_READ__?.().feedback, undefined, { timeout: 60000 });
        const repeatedFeedback = await read();
        assert.equal(repeatedFeedback.feedback.receipt.status, 'success', JSON.stringify(repeatedFeedback.feedback.receipt));
        const repeated = await canvasState();
        assert.equal(report.materialPosts.length, priorPosts, 'Second explicit mouse drag finds the existing exact result by GET, without a new POST.');
        assert.ok(nativeCollectionSavedPlacementMatches(repeated.nodes.find(node => node.id === exact.id)?.position, exact.position),
          'Second release does not move the existing exact carrier; only exact known donor persistence equivalence is accepted.');
        assert.equal(repeated.nodes.length, afterPlacement.nodes.length);
        report.repeated = { preview: repeatedPreview, after: repeatedFeedback, nodes: repeated.nodes };
        await shot('04-repeated-exact-drop-no-move');
      }
    }
    report.integrationPassed = true;
  }
  report.events = await page.evaluate(() => window.__LCOS_TEST_DRAG_EVENTS__);
  const started = report.events.find(e => e.type === 'dragstart' && e.phase === 'bubble');
  assert.ok(started?.trusted, 'Real browser mouse must create a trusted dragstart.');
  assert.ok(started.types.includes('application/x-library-asset'), 'Original Ko transport stays present.');
  assert.equal(JSON.parse(started.data['application/x-library-asset']).id, asset.id);
  const after = await canvasState(); report.before = before; report.after = after;
  assert.equal(await page.evaluate(api => api === window.__LCOS_NODE_LAB__.api, apiHandle), true);
  assert.equal(after.document, before.document); assert.deepEqual(after.camera, before.camera); assert.deepEqual(after.selection, before.selection);
  if (!commit || targetKind !== 'canvas') { assert.deepEqual(after.nodes, before.nodes); assert.deepEqual(after.edges, before.edges); }
  const afterGraph = await get(project + '/graph'), afterRuns = await get(project + '/runs');
  const afterPresentations = await get(project + '/presentations');
  if (!commit || targetKind === 'composer') {
    assert.deepEqual(afterGraph, beforeGraph); assert.deepEqual(afterRuns, beforeRuns);
    assert.deepEqual(afterPresentations, beforePresentations);
    for (const id of canvases) assert.deepEqual(await get('/api/canvas/v1/canvases/' + id), beforeCanvas[id]);
  } else {
    assert.deepEqual(afterGraph.artifacts, beforeGraph.artifacts); assert.deepEqual(afterGraph.artifactRevisions, beforeGraph.artifactRevisions);
    assert.deepEqual(afterGraph.fileRecords, beforeGraph.fileRecords); assert.deepEqual(afterRuns, beforeRuns);
    for (const old of beforeGraph.artifactViews) assert.deepEqual(afterGraph.artifactViews.find(view => view.id === old.id), old, 'Existing Views are not repinned or repositioned.');
    assert.deepEqual(afterGraph.collections, beforeGraph.collections); assert.deepEqual(afterGraph.collectionMemberships, beforeGraph.collectionMemberships);
    const target = report.hover.resolution.intent.targetRef;
    if (target?.kind !== 'workspace') {
      assert.deepEqual(afterGraph.workspaceMemberships, beforeGraph.workspaceMemberships);
      assert.deepEqual(afterGraph.workspaceEntityMemberships, beforeGraph.workspaceEntityMemberships,
        'Root surface and Glyth drops must not be silently converted into Workspace membership.');
    }
    for (const id of canvases.filter(id => id !== targetCanvasId)) assert.deepEqual(await get('/api/canvas/v1/canvases/' + id), beforeCanvas[id], 'Another original Canvas is not overwritten.');
    if (targetKind === 'canvas') {
      assert.deepEqual(afterGraph.relations, beforeGraph.relations, 'Canvas material placement is not persistent conversation context.');
      const view = afterGraph.artifactViews.find(view => view.id === report.placed.ref.artifactViewId);
      assert.equal(view?.artifactId, projection.artifact_id); assert.equal(view.revisionId, projection.presented_revision_id);
      assert.equal(view.referenceKind, 'explicit_additional');
      if (target?.kind !== 'workspace') {
        const scope = target.kind === 'main' ? afterGraph.scopes.find(scope => scope.kind === 'root') : afterGraph.scopes.find(scope => scope.id === target.id);
        assert.equal(view.scopeId, scope?.id);
        const presentationId = `presentation:${target.kind === 'workflow' ? 'workflow' : 'context'}:${scope.id}`;
        const presentation = await get(project + '/presentations/' + encodeURIComponent(presentationId));
        assert.ok(presentation.state.memberViewIds.includes(view.id));
        assert.ok(nativeCollectionSavedPlacementMatches(report.placed.position, presentation.state.positions[view.id]),
          'Original Presentation and carrier retain the released point under the exact donor persisted quantization.');
        const old = beforePresentations.find(item => item.id === presentationId);
        if (old) {
          for (const member of old.state.memberViewIds) assert.ok(presentation.state.memberViewIds.includes(member));
          for (const [id, position] of Object.entries(old.state.positions)) assert.deepEqual(presentation.state.positions[id], position, 'Existing Presentation member positions stay intact.');
        }
        report.presentation = presentation;
      }
    } else if (targetKind === 'glyth') {
      assert.deepEqual(afterPresentations, beforePresentations);
      const canonical = report.finalFeedback.feedback.receipt.canonicalReceipt;
      const relation = canonical?.relation;
      assert.equal(relation?.kind, 'conversation_context'); assert.equal(relation.targetEntityType, 'view');
      assert.equal(relation.targetEntityId, canonical.artifact_view_id);
      assert.equal(afterGraph.relations.filter(item => item.id === relation.id).length, 1);
      report.conversationRelation = relation;
    }
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.routeErrors, []);
  assert.deepEqual(report.visualFailures, []);
  report.checks.push('Same original API/document/camera/selection; real Graph/Runs and three Canvas reads compared; no models.');
  report.passed = true;
  }
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  try { report.failureDrop = await read(); report.events = await page.evaluate(() => window.__LCOS_TEST_DRAG_EVENTS__);
    await shot('failure'); await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
  try { report.afterFailureCanvas = await canvasState();
    await writeFile(path.join(output, 'after-failure-facts.json'), JSON.stringify({ graph: await get(project + '/graph'),
      runs: await get(project + '/runs'), presentations: await get(project + '/presentations'),
      canvas: await get('/api/canvas/v1/canvases/' + encodeURIComponent(targetCanvasId)) }, null, 2)); } catch {}
} finally {
  try { await page.keyboard.press('Escape'); await page.mouse.up(); } catch {}
  await browser.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, integrationPassed: report.integrationPassed, output, pid: health.pid,
    hover: report.hover?.state.status, target: report.hover?.hit, failure: report.failure }, null, 2));
}
