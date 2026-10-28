import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const origin = new URL(option('base-url') ?? 'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const expectedPid = Number(option('expected-pid')); assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0, '--expected-pid=N is required');
const cleanupOnly = process.argv.includes('--cleanup-only'); assert.ok(!cleanupOnly || option('owned-marker-report'), 'Cleanup requires the exact previous script POST receipt');
const root = path.resolve(import.meta.dirname, '..'), stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(option('output-root') ?? path.join(root, 'output/原生导航与强调_20261026', stamp));
await fs.mkdir(output, { recursive: true });
const projectId = 'disposable-surface-core-facade', canvasId = 'surface-core-main', nodeId = 'surface-main-image';
const base = '/api/lcos/core/projects/' + projectId, canvasPath = '/api/canvas/v1/canvases/' + canvasId;
const longSession = 'conversation-08d78311-43d1-4be1-97c5-52d5442839f4';
const report = { passed: false, origin, expectedPid, output, steps: [], writes: [], blocked: [], pageErrors: [], apiErrors: [], requestFailures: [], consoleErrors: [], screenshots: [], modelSends: 0, cleanup: {} };
let browser, page, stage = 'preflight', expectedEmphasis, createdMarkerId, createAttempted = false, before, targetRef, priorOwnedMarker;
const get = async pathname => {
  assert.ok(pathname.startsWith('/') && !pathname.startsWith('//'));
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, pathname); const payload = await response.json();
  assert.ok(payload.ok === true || payload.code === 0 || pathname === '/health', pathname + ' returned no successful envelope');
  return payload.value ?? payload.data ?? payload;
};
const poll = async (read, test, label, timeout = 25000) => {
  const deadline = Date.now() + timeout; let last;
  do { last = await read(); if (test(last)) return last; await new Promise(resolve => setTimeout(resolve, 180)); } while (Date.now() < deadline);
  throw new Error(label + ' timed out; last=' + JSON.stringify(last));
};
const markers = () => get(base + '/spatial-markers');
const target = canvas => canvas.nodes.find(node => node.id === nodeId);
const targetMarkers = rows => rows.filter(row => row.scope === 'local' && row.sourceSurfaceRef === 'main' && same(row.targetRef, targetRef));
const stripGraphCounters = graph => Object.fromEntries(Object.entries(graph).filter(([key]) => !['changeSets', 'mutationChangeSets', 'spatialMarkers', 'spatialMarkerIntents', 'projectionVersion', 'spatialVersion'].includes(key)));
const canonicalNode = (node, imageTitle) => {
  const data = structuredClone(node.data ?? {});
  if (node.id === nodeId) { delete data.lcos_gui_emphasis; if (!Object.hasOwn(data, 'title') && imageTitle !== undefined) data.title = imageTitle; }
  return { id: node.id, type: node.type, position: node.position, parent: node.parent_id ?? node.parentId ?? '',
    width: node.width, height: node.height, measured: node.measured, data };
};
async function readMessages() {
  const sessions = await get(base + '/conversations'), rows = {};
  assert.ok(Array.isArray(sessions));
  for (const session of sessions) {
    const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
    const items = Array.isArray(payload) ? payload : payload.messages ?? payload.items;
    assert.ok(Array.isArray(items), 'Message read model must expose its actual array');
    assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false, 'Message snapshot must be complete, not one page');
    rows[session.id] = items;
  }
  assert.equal(rows[longSession]?.length, 28, 'The exact long session has 28 original messages');
  return rows;
}
async function facts() {
  const [graph, runs, collections, bindings, canvas, markerRows, messages] = await Promise.all([
    get(base + '/graph'), get(base + '/runs'), get(base + '/collections'), get(base + '/spatial/bindings'), get(canvasPath), markers(), readMessages(),
  ]);
  const workspaceCanvasIds = [...new Set((graph.workspaces ?? []).filter(row => row.canvasId).map(row => row.canvasId))];
  const canvases = {};
  for (const id of workspaceCanvasIds) canvases[id] = id === canvasId ? canvas : await get('/api/canvas/v1/canvases/' + encodeURIComponent(id));
  return { graph, runs, collections, bindings, canvas, markers: markerRows, messages, canvases };
}
function validateBatch(body, persisted) {
  if (!body || Object.keys(body).some(key => !['canvas_id', 'created_by_role', 'actions', 'lcos_expected_revisions', 'lcos_refs'].includes(key))
    || body.canvas_id !== canvasId || body.created_by_role !== 'user' || !Array.isArray(body.actions) || body.actions.length !== 1) return 'Unexpected batch envelope';
  const action = body.actions[0];
  if (action.action !== 'update' || Object.keys(action).some(key => !['action', 'updates'].includes(key)) || !Array.isArray(action.updates) || !action.updates.length) return 'Only unchanged DTO echoes or the target emphasis update are allowed';
  for (const patch of action.updates) {
    const current = persisted.nodes.find(node => node.id === patch.id);
    if (!current || Object.keys(patch).some(key => !['id', 'canvas_id', 'type', 'data', 'position', 'measured', 'parent_id', 'parentId', 'width', 'height'].includes(key))) return 'Unknown node or DTO field';
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'data') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid data';
        for (const [field, next] of Object.entries(value)) {
          if (field === 'lcos_gui_emphasis' && patch.id === nodeId) {
            if (typeof next !== 'boolean' || next !== (current.data?.[field] === true) && next !== expectedEmphasis) return 'Unstaged emphasis change';
          } else if (!same(next, current.data?.[field])) return 'Non-emphasis data changed: ' + patch.id + '/' + field;
        }
      } else if (['parentId', 'parent_id'].includes(key)) {
        if ((value ?? '') !== (current.parentId ?? current.parent_id ?? '')) return 'Parent changed';
      } else if (key === 'canvas_id') { if (value !== canvasId) return 'Wrong canvas';
      } else if (key === 'measured' && patch.id === nodeId && value?.width === 375 && value?.height === 250) {
        if (Object.keys(value).some(field => !['width', 'height'].includes(field))) return 'Measurement has extra fields';
      } else if (!same(value, current[key])) return 'Unchanged geometry/DTO echo differs: ' + patch.id + '/' + key;
    }
  }
  for (const [id, revision] of Object.entries(body.lcos_expected_revisions ?? {})) {
    const node = persisted.nodes.find(row => row.id === id);
    if (!node || String(revision) !== String(persisted.lcos_expected_revisions?.[id] ?? node.lcos_revision_id ?? node.data?.lcos_ref?.revisionId ?? '')) return 'Unconfirmed CAS revision';
  }
  if (body.lcos_refs !== undefined && !same(body.lcos_refs, persisted.lcos_refs)) return 'Reference envelope changed';
  return null;
}
async function checkFinal() {
  const after = await facts(); report.afterSummary = { messages: Object.fromEntries(Object.entries(after.messages).map(([id, rows]) => [id, rows.length])), markers: after.markers.length };
  await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify(after, null, 2));
  assert.deepEqual(stripGraphCounters(after.graph), stripGraphCounters(before.graph), 'Canonical graph content unchanged');
  assert.deepEqual(after.runs, before.runs, 'Runs unchanged'); assert.deepEqual(after.collections, before.collections, 'Collections unchanged');
  assert.deepEqual(after.bindings, before.bindings, 'All exact references unchanged'); assert.deepEqual(after.messages, before.messages, 'All original messages unchanged');
  assert.deepEqual(after.markers, before.markers, 'Only this script marker was created, then removed');
  for (const [id, original] of Object.entries(before.canvases)) {
    const next = after.canvases[id]; assert.ok(next, 'Original workspace canvas retained');
    assert.deepEqual(next.links ?? next.edges ?? [], original.links ?? original.edges ?? [], 'Links unchanged: ' + id);
    assert.deepEqual(next.nodes.map(node => canonicalNode(node, target(before.canvas)?.data?.title)), original.nodes.map(node => canonicalNode(node, target(before.canvas)?.data?.title)), 'All node data/identity/geometry unchanged: ' + id);
  }
  assert.notEqual(target(after.canvas)?.data?.lcos_gui_emphasis, true, 'Final target emphasis is off');
  report.canonicalFactsUnchanged = true;
}
try {
  const health = await get('/health'); assert.equal(health.pid, expectedPid); assert.equal(health.realCoreConnected, true);
  assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020'); report.pid = health.pid;
  before = await facts(); const image = target(before.canvas); assert.equal(image?.type, 'image');
  await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify(before, null, 2));
  assert.notEqual(image.data?.lcos_gui_emphasis, true, 'Do not overwrite pre-existing emphasis');
  assert.ok(image.data?.lcos_ref?.artifactViewId); targetRef = { projectId, kind: 'view', id: image.data.lcos_ref.artifactViewId };
  if (option('owned-marker-report')) {
    const proof = JSON.parse(await fs.readFile(path.resolve(option('owned-marker-report')), 'utf8'));
    assert.equal(proof.pid, expectedPid); assert.equal(proof.passed, false);
    priorOwnedMarker = proof.createdMarker; assert.ok(priorOwnedMarker?.id);
    assert.ok(proof.writes.some(row => row.path === base + '/spatial-markers' && row.method === 'POST' && row.permitted && row.status >= 200 && row.status < 300 && row.markerId === priorOwnedMarker.id));
    assert.ok(same(priorOwnedMarker.targetRef, targetRef) && priorOwnedMarker.scope === 'local' && priorOwnedMarker.sourceSurfaceRef === 'main');
    assert.equal(targetMarkers(before.markers).length, 1); assert.deepEqual(targetMarkers(before.markers)[0], priorOwnedMarker);
    createdMarkerId = priorOwnedMarker.id; report.priorOwnedMarker = priorOwnedMarker;
  } else assert.equal(targetMarkers(before.markers).length, 0, 'Do not remove or adopt a pre-existing target marker');
  report.beforeSummary = { nodes: before.canvas.nodes.length, markers: before.markers.length, messages: Object.fromEntries(Object.entries(before.messages).map(([id, rows]) => [id, rows.length])) };
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) {
      report.blocked.push({ stage, method, path: url.pathname, reason: 'Non-loopback/current-project request' }); return route.abort();
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue();
    const row = { stage, method, path: url.pathname, permitted: false }; report.writes.push(row);
    let body; try { body = request.postDataJSON(); } catch { body = null; }
    row.body = body;
    if (method === 'POST' && url.pathname === '/api/events') { row.permitted = true; return route.continue(); }
    if (method === 'POST' && ['/api/lcos/canvases/' + canvasId + '/execution:reconcile', '/api/lcos/canvases/' + canvasId + '/conversations:reconcile'].includes(url.pathname) && same(body, {})) {
      row.permitted = true; return route.continue();
    }
    if (method === 'POST' && url.pathname === base + '/navigation/resolve' && same(body, { targetRef })) { row.permitted = true; return route.continue(); }
    if (method === 'POST' && url.pathname === base + '/spatial-markers' && stage === 'pin' && !createAttempted
      && same(body, { targetRef, scope: 'local', sourceSurfaceRef: 'main' })) {
      createAttempted = true; row.permitted = true;
      const response = await route.fetch(), payload = await response.json(); row.status = response.status();
      const marker = payload.value;
      if (response.ok() && payload.ok === true && marker?.id && !before.markers.some(item => item.id === marker.id)
        && same(marker.targetRef, targetRef) && marker.scope === 'local' && marker.sourceSurfaceRef === 'main') createdMarkerId = marker.id;
      row.markerId = createdMarkerId; return route.fulfill({ response });
    }
    if (method === 'DELETE' && createdMarkerId && url.pathname === base + '/spatial-markers/' + encodeURIComponent(createdMarkerId)) {
      const present = (await markers()).find(marker => marker.id === createdMarkerId);
      if (present && (!before.markers.some(marker => marker.id === present.id) || priorOwnedMarker?.id === present.id)
        && same(present.targetRef, targetRef) && present.scope === 'local' && present.sourceSurfaceRef === 'main') {
        row.permitted = true; return route.continue();
      }
    }
    if (method === 'POST' && url.pathname === canvasPath + '/nodes:batchActions') {
      const reason = validateBatch(body, await get(canvasPath));
      if (!reason) { row.permitted = true; return route.continue(); } row.reason = reason;
    }
    report.blocked.push(row); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('requestfailed', request => report.requestFailures.push({ path: new URL(request.url()).pathname, failure: request.failure() }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.apiErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); console.log(JSON.stringify({ stage, screenshot: name })); };
  const ready = async () => { await page.waitForFunction(() => window.__LCOS_NODE_LAB__?.api?.getNodes?.().some(node => node.id === 'surface-main-image'), undefined, { timeout: 90000 });
    await page.locator('[data-native-navigation-layer][data-native-navigation-state="ready"]').waitFor({ timeout: 60000 }); };
  const readViewport = () => page.evaluate(() => ({ ...window.__LCOS_NODE_LAB__.api.getViewport() }));
  const readTarget = () => page.evaluate(id => window.__LCOS_NODE_LAB__.api.getNodes().find(node => node.id === id), nodeId);
  const readArrivalMedia = async (label, startedAt, arrivedAt) => {
    const value = await page.evaluate(({ id, label, startedAt, arrivedAt }) => {
      const node = document.querySelector('.react-flow__node[data-id="' + id + '"]');
      const originalSource = window.__LCOS_NODE_LAB__.api.getNode(id)?.data?.src;
      const canonical = typeof originalSource === 'string' ? new URL(originalSource, location.href) : null;
      const sameOriginalMedia = source => {
        if (!source || !canonical) return false;
        const actual = new URL(source, location.href);
        return actual.origin === canonical.origin && actual.pathname === canonical.pathname
          && [...actual.searchParams.keys()].every(key => key === 'variant_name' || actual.searchParams.get(key) === canonical.searchParams.get(key));
      };
      const images = [...(node?.querySelectorAll('img[data-testid="canvas-node-image-content"]') ?? [])].map(img => {
        let opacity = 1, visible = true;
        for (let parent = img; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent); opacity *= Number(style.opacity);
          if (style.display === 'none' || style.visibility === 'hidden') visible = false;
          if (parent === node) break;
        }
        return { testId: img.getAttribute('data-testid'), src: img.getAttribute('src'), currentSrc: img.currentSrc,
          current: img.getAttribute('aria-hidden') !== 'true', complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
          sourceMatches: sameOriginalMedia(img.getAttribute('src')) && sameOriginalMedia(img.currentSrc), opacity, visible, rect: img.getBoundingClientRect().toJSON() };
      });
      return { label, elapsedSinceClick: Date.now() - startedAt, elapsedSinceArrival: Date.now() - arrivedAt,
        originalSource, mounted: images.length > 0, images,
        // vT keeps the same canonical media's previous buffer visibly painted
        // while its current variant fades in. aria-hidden is accessibility
        // semantics; actual opacity/source/decoded pixels decide readiness.
        ready: images.some(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 && img.sourceMatches && img.visible && img.opacity > .9) };
    }, { id: nodeId, label, startedAt, arrivedAt });
    (report.arrivalMedia ??= []).push(value); return value;
  };
  const imageNode = page.locator('.react-flow__node[data-id="' + nodeId + '"]');
  const selectImage = async () => { const rect = await imageNode.boundingBox(); assert.ok(rect && rect.x + rect.width > 0 && rect.x < 1500 && rect.y + rect.height > 0 && rect.y < 1000, 'Target must be actually on screen');
    await page.mouse.click(Math.max(100, rect.x + Math.min(18, rect.width / 3)), Math.max(100, rect.y + Math.min(18, rect.height / 3))); };
  const originalMore = async () => { await selectImage(); const toolbar = page.locator('[data-testid="canvas-node-toolbar"]:visible');
    await toolbar.waitFor(); const trigger = toolbar.locator('[aria-haspopup="menu"]'); assert.equal(await trigger.count(), 1, 'Use one original generic More'); await trigger.click(); };
  const action = async name => { await originalMore(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const waitEmphasis = async value => { await poll(() => get(canvasPath), value2 => (target(value2)?.data?.lcos_gui_emphasis === true) === value, 'Persisted emphasis=' + value);
    await page.waitForFunction(({ id, expected }) => (window.__LCOS_NODE_LAB__.api.getNodes().find(node => node.id === id)?.data?.lcos_gui_emphasis === true) === expected, { id: nodeId, expected: value }); };
  const pin = page.locator('[data-native-navigation-marker="' + nodeId + '"]');
  const halo = page.locator('[data-native-node-emphasis="' + nodeId + '"]');
  const checkOriginalChrome = async label => {
    const value = await page.evaluate(label => {
      const wrapper = document.querySelector('[data-lcos-native-collapsed-assistant]'), button = wrapper?.querySelector('button');
      const bottom = document.querySelector('[data-pile-gallery-chrome="bottom-left"]'), dock = document.querySelector('[data-lcos-surface-dock]');
      const help = document.querySelector('[data-testid="canvas-user-guide-menu-trigger-btn"]');
      if (!wrapper || !button || !bottom || !dock) throw new Error('Original MF wrapper/button, bottom row and Dock must be mounted');
      const assistant = wrapper.getBoundingClientRect(), hit = button.getBoundingClientRect(), row = bottom.getBoundingClientRect(), dockBox = dock.getBoundingClientRect();
      const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const centre = { x: hit.left + hit.width / 2, y: hit.top + hit.height / 2 }, element = document.elementFromPoint(centre.x, centre.y);
      return { label, viewport: { width: innerWidth, height: innerHeight }, wrapper: assistant.toJSON(), hit: hit.toJSON(), bottomRow: row.toJSON(),
        dock: dockBox.toJSON(), help: help?.getBoundingClientRect().toJSON(), intersectsBottom: area(assistant, row), intersectsDock: area(assistant, dockBox),
        centre, centreHit: element?.tagName, centreHitsOriginalButton: !!element && button.contains(element),
        disabled: button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true' };
    }, label);
    (report.chromeLayout ??= []).push(value);
    assert.equal(value.intersectsBottom, 0, 'Original MF wrapper does not overlap original bottom controls/help row');
    assert.equal(value.intersectsDock, 0, 'Original MF wrapper does not overlap original three-view Dock');
    assert.ok(value.hit.width >= 44 && value.hit.height >= 44, 'Original assistant ball retains its 44px hit area');
    assert.ok(value.hit.left >= -.5 && value.hit.top >= -.5 && value.hit.right <= value.viewport.width + .5 && value.hit.bottom <= value.viewport.height + .5, 'Entire original assistant hit area is inside viewport');
    assert.equal(value.disabled, false); assert.equal(value.centreHitsOriginalButton, true, 'Actual elementFromPoint reaches original assistant ball');
  };
  const checkHaloClip = async label => {
    const value = await page.evaluate(id => {
      const wrapper = document.querySelector('.native-navigation-halos'), halo = document.querySelector('[data-native-node-emphasis="' + id + '"]');
      if (!wrapper || !halo) throw new Error('The actual clipped halo wrapper and target halo must be mounted');
      const pane = document.querySelector('.react-flow').getBoundingClientRect();
      let left = pane.left, right = pane.right, bottom = pane.bottom;
      // Independently read the same visible original surfaces as visibleCanvas;
      // no camera, node, store or layer state is changed by this measurement.
      for (const element of document.querySelectorAll('[data-library-view="library"], [data-lcos-native-chat-frame], [data-testid="canvas-dockbar-container"]')) {
        if (element.getAttribute('aria-hidden') === 'true' || element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.bottom <= pane.top || box.top >= pane.bottom) continue;
        if (box.left <= pane.left + 24 && box.right >= pane.right - 24 && box.top > pane.top && box.bottom >= pane.bottom - 24) bottom = Math.min(bottom, box.top);
        if (box.left <= pane.left + 24 && box.right < right) left = Math.max(left, box.right);
        if (box.right >= pane.right - 24 && box.left > left) right = Math.min(right, box.left);
      }
      const clipPath = getComputedStyle(wrapper).clipPath, match = /^inset\(([^)]+)\)$/.exec(clipPath);
      const tokens = match?.[1].trim().split(/\s+/).map(parseFloat) ?? [];
      const actual = tokens.length === 1 ? [tokens[0], tokens[0], tokens[0], tokens[0]]
        : tokens.length === 2 ? [tokens[0], tokens[1], tokens[0], tokens[1]]
        : tokens.length === 3 ? [tokens[0], tokens[1], tokens[2], tokens[1]] : tokens;
      const expected = [Math.max(0, pane.top), Math.max(0, innerWidth - right), Math.max(0, innerHeight - bottom), Math.max(0, left)];
      const rect = halo.getBoundingClientRect();
      return { clipPath, actual, expected, visibleCanvas: { left, right, top: pane.top, bottom }, halo: rect.toJSON(),
        visibleIntersection: Math.max(0, Math.min(rect.right, right) - Math.max(rect.left, left)) * Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, pane.top)),
        pointerEvents: getComputedStyle(wrapper).pointerEvents };
    }, nodeId);
    (report.haloClipping ??= []).push({ label, ...value });
    assert.notEqual(value.clipPath, 'none'); assert.equal(value.actual.length, 4);
    assert.ok(value.actual.every((number, index) => Number.isFinite(number) && Math.abs(number - value.expected[index]) < .5), 'Halo clip follows actual visibleCanvas boundaries');
    assert.ok(value.visibleIntersection > 0, 'Clipped target halo remains visibly inside the current canvas');
    assert.equal(value.pointerEvents, 'none');
  };
  stage = 'opening'; await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready();
  if (await page.getByRole('button', { name: '收起对话', exact: true }).isVisible()) await page.getByRole('button', { name: '收起对话', exact: true }).click();
  // The sole setup setter: original fitView finds the initial image. All pan,
  // navigation, return, emphasis and Pin actions below use real mouse/keys.
  await page.evaluate(id => { const api = window.__LCOS_NODE_LAB__.api; return api.fitView({ nodes: [{ id }], padding: 1.2, minZoom: .4, maxZoom: 1, duration: 0 }); }, nodeId);
  await selectImage(); report.initialViewport = await readViewport(); await shot('01-original-image-selected');
  if (priorOwnedMarker) {
    stage = 'cleanup-prior-original-ui'; await action('取消固定');
    await poll(markers, rows => !rows.some(row => row.id === priorOwnedMarker.id), 'Prior script marker removed through original UI');
    before = await facts(); createdMarkerId = undefined; createAttempted = false;
    await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify(before, null, 2));
    report.steps.push('Previous failed-run marker ownership proved by its POST receipt, then removed only through original More');
  }
  if (!cleanupOnly) {
  stage = 'emphasis'; expectedEmphasis = true; await action('强调'); await waitEmphasis(true); await halo.waitFor(); await checkHaloClip('desktop-emphasis'); await checkOriginalChrome('desktop-emphasis'); await shot('02-emphasis');
  report.steps.push('Original image More → emphasis persisted true and visible halo');
  for (const [name, key, value] of [['undo', 'Control+z', false], ['redo', 'Control+Shift+z', true], ['undo-final', 'Control+z', false]]) {
    stage = name; expectedEmphasis = value; await page.keyboard.press('Escape'); await page.keyboard.press(key); await waitEmphasis(value);
    report.steps.push('Original ' + key + ' → persisted emphasis=' + value);
  }
  expectedEmphasis = undefined; stage = 'pin'; await action('固定到导航');
  const created = await poll(markers, rows => !!createdMarkerId && targetMarkers(rows).length === 1 && targetMarkers(rows)[0].id === createdMarkerId, 'Exact new local View marker');
  report.createdMarker = created.find(row => row.id === createdMarkerId); await pin.waitFor(); assert.equal(await pin.getAttribute('data-phase'), 'local'); await shot('03-fixed-local');
  report.steps.push('Original More → one confirmed Core View local/main marker and local large Pin');
  stage = 'reload'; await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await pin.waitFor();
  assert.equal(targetMarkers(await markers())[0]?.id, createdMarkerId); await shot('04-fixed-after-refresh'); report.steps.push('Refresh retained the exact persisted marker');
  if (await page.getByRole('button', { name: '收起对话', exact: true }).isVisible()) await page.getByRole('button', { name: '收起对话', exact: true }).click();
  if (await pin.getAttribute('data-phase') === 'edge') { stage = 'post-refresh-visible-setup'; await pin.click(); await page.getByRole('button', { name: '返回原视角', exact: true }).waitFor(); }
  stage = 'mouse-pan'; const prePan = await readViewport();
  for (let attempt = 0; attempt < 5 && await pin.getAttribute('data-phase') !== 'edge'; attempt++) {
    const point = await page.evaluate(() => { for (const x of [1370, 1230, 1090, 950, 810]) for (const y of [790, 650, 510, 370]) {
      const item = document.elementFromPoint(x, y);
      if (item?.closest('.react-flow') && !item.closest('.react-flow__node,button,input,[role="button"],.react-flow__controls,.react-flow__minimap,.canvas-header-chrome,[data-native-navigation-layer]')) return { x, y, hit: item.tagName + '.' + item.getAttribute('class') }; } return null; });
    assert.ok(point, 'Find a real unobstructed original canvas pane point');
    report.steps.push('Original middle-mouse pan from actual background hit ' + point.hit);
    await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(Math.max(100, point.x - 1050), point.y, { steps: 28 }); await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(250);
  }
  assert.equal(await pin.getAttribute('data-phase'), 'edge', 'Mouse pan produced a real edge marker');
  const departure = await readViewport(); assert.ok(Math.abs(departure.x - prePan.x) > 100, 'Original mouse changed camera'); report.departureViewport = departure;
  const rect = await imageNode.boundingBox(); assert.ok(!rect || rect.x + rect.width < 0 || rect.x > 1500 || rect.y + rect.height < 0 || rect.y > 1000, 'Image is really off screen');
  await shot('05-real-pan-edge-cursor'); report.steps.push('Real original mouse pan moved target off screen and projected edge cursor');
  stage = 'edge-locate'; const desktopLocateStarted = Date.now();
  await pin.click(); await page.locator('[data-native-node-emphasis="' + nodeId + '"][data-arrival="true"]').waitFor();
  const desktopArrivedAt = Date.now(); await page.getByRole('button', { name: '返回原视角', exact: true }).waitFor();
  await readArrivalMedia('desktop-arrival-no-extra-wait', desktopLocateStarted, desktopArrivedAt); await shot('06-arrival-halo');
  const arrived = await readViewport(); assert.ok(Math.abs(arrived.x - departure.x) > 100); report.arrivedViewport = arrived;
  stage = 'return'; await page.getByRole('button', { name: '返回原视角', exact: true }).click();
  await poll(readViewport, value => Math.abs(value.x - departure.x) < 1 && Math.abs(value.y - departure.y) < 1 && Math.abs(value.zoom - departure.zoom) < .0001, 'Original return restored departure viewport');
  await shot('07-return-to-original-view'); report.steps.push('Edge cursor → original camera arrival/halo → original Return restores exact departure viewport');
  if (process.argv.includes('--narrow')) {
    stage = 'narrow-pan'; await page.setViewportSize({ width: 360, height: 820 }); await page.waitForTimeout(450);
    const point = await page.evaluate(() => { for (const x of [290, 250, 210, 170]) for (const y of [340, 280, 220, 160, 110]) {
      const item = document.elementFromPoint(x, y);
      if (item?.closest('.react-flow') && !item.closest('.react-flow__node,button,input,[role="button"],.react-flow__controls,.react-flow__minimap,.canvas-header-chrome,[data-native-navigation-layer]')) return { x, y, hit: item.tagName + '.' + item.getAttribute('class') }; } return null; });
    assert.ok(point, 'Narrow original blank canvas is actually reachable'); const previous = await readViewport();
    await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(Math.max(80, point.x - 180), point.y, { steps: 16 }); await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(300); const narrowDeparture = await readViewport();
    assert.ok(Math.abs(narrowDeparture.x - previous.x) >= 50, 'Narrow real mouse pan changes camera');
    assert.equal(await pin.getAttribute('data-phase'), 'edge'); const markerBox = await pin.boundingBox();
    assert.ok(markerBox); report.narrowGeometry = { markerBox, departure: narrowDeparture, background: point.hit };
    assert.ok(markerBox.width >= 44 && markerBox.height >= 44, 'Narrow edge cursor has a 44px hit area');
    assert.ok(markerBox.x >= -.5 && markerBox.y >= -.5 && markerBox.x + markerBox.width <= 360.5 && markerBox.y + markerBox.height <= 820.5, 'Entire narrow cursor hit area stays inside viewport');
    const direction = await page.evaluate(id => {
      const marker = document.querySelector('[data-native-navigation-marker="' + id + '"]'), api = window.__LCOS_NODE_LAB__.api;
      const rect = marker.getBoundingClientRect(), bounds = api.getNodesBounds([id]);
      const screen = api.flowToScreenPosition({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
      const arrows = marker.querySelectorAll('.native-navigation-marker-face>svg');
      if (arrows.length !== 2) throw new Error('Expected the actual Pin plus Navigation2 SVG pair');
      const arrow = arrows[1], transform = getComputedStyle(arrow).transform, matrix = new DOMMatrixReadOnly(transform);
      // The installed Navigation2 polygon tip points up at (12,2): (0,-1).
      // Transform that real vector, instead of assuming the icon faces right.
      const vector = { x: -matrix.c, y: -matrix.d }, rendered = Math.atan2(vector.y, vector.x);
      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const expected = Math.atan2(screen.y - centre.y, screen.x - centre.x);
      return { centre, target: screen, polygon: arrow.querySelector('polygon')?.getAttribute('points'), transform, vector, rendered, expected,
        delta: Math.abs(Math.atan2(Math.sin(rendered - expected), Math.cos(rendered - expected))), opacity: Number(getComputedStyle(arrow).opacity) };
    }, nodeId);
    report.narrowGeometry.direction = direction;
    assert.ok(direction.opacity > .99 && direction.delta < .05, 'Actual transformed edge arrow points to the actual target screen centre');
    await shot('09-narrow-edge-cursor'); stage = 'narrow-locate'; const narrowLocateStarted = Date.now(); await pin.click();
    await page.locator('[data-native-node-emphasis="' + nodeId + '"][data-arrival="true"]').waitFor();
    const narrowArrivedAt = Date.now();
    const back = page.getByRole('button', { name: '返回原视角', exact: true }); await back.waitFor(); await page.waitForTimeout(220);
    const narrowMedia = await readArrivalMedia('narrow-arrival-original-220ms', narrowLocateStarted, narrowArrivedAt);
    assert.equal(narrowMedia.ready, true, 'Original vT image must already be mounted, decoded and visible at the existing 220ms arrival sample');
    await checkOriginalChrome('narrow-arrival');
    await checkHaloClip('narrow-arrival');
    const backBox = await back.boundingBox(); report.narrowGeometry.returnBox = backBox; await shot('10-narrow-arrival');
    assert.ok(backBox && backBox.width >= 44 && backBox.height >= 44, 'Narrow return button has a 44px hit area');
    assert.ok(backBox.x >= 0 && backBox.y >= 0 && backBox.x + backBox.width <= 360 && backBox.y + backBox.height <= 820, 'Entire narrow return stays inside viewport');
    stage = 'narrow-return'; await back.click();
    await poll(readViewport, value => Math.abs(value.x - narrowDeparture.x) < 1 && Math.abs(value.y - narrowDeparture.y) < 1 && Math.abs(value.zoom - narrowDeparture.zoom) < .0001, 'Narrow return restores original departure viewport');
    await shot('11-narrow-return'); report.steps.push('360×820 original mouse pan/edge locate/arrival/return all clickable, 44px and inside viewport');
    await page.setViewportSize({ width: 1500, height: 1000 }); await page.waitForTimeout(450);
  }
  stage = 'unpin-locate'; await pin.click(); await page.getByRole('button', { name: '返回原视角', exact: true }).waitFor();
  stage = 'unpin'; await action('取消固定'); await poll(markers, rows => !rows.some(row => row.id === createdMarkerId), 'Only script marker removed'); await pin.waitFor({ state: 'hidden' });
  report.steps.push('Second original cursor locate makes image reachable; original More removes only confirmed script marker'); await shot('08-unpinned');
  }
  assert.equal((await readTarget()).data?.lcos_gui_emphasis === true, false);
  await checkFinal(); assert.deepEqual(report.blocked, [], 'No unexpected business write or remote request'); assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; if (page) try { report.failureDom = await page.evaluate(() => ({ text: document.body.innerText.slice(-5000), host: !!window.__LCOS_NODE_LAB__, scripts: [...document.scripts].map(script => script.src) })); } catch {} process.exitCode = 1; }
finally {
  // No direct API cleanup. If the UI chain fails, preserve its evidence and
  // record any marker still present instead of hiding the product defect.
  if (before && targetRef) {
    try { report.cleanup.remainingScriptMarker = createdMarkerId ? (await markers()).find(row => row.id === createdMarkerId) ?? null : null;
      report.cleanup.finalEmphasis = target(await get(canvasPath))?.data?.lcos_gui_emphasis === true; } catch (error) { report.cleanup.error = String(error); }
  }
  if (page && !report.passed) try { const file = path.join(output, 'failure.png'); await page.screenshot({ path: file }); report.screenshots.push(file); } catch {}
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, stage, pid: report.pid, steps: report.steps, failure: report.failure, blocked: report.blocked, cleanup: report.cleanup, report: path.join(output, 'report.json') }, null, 2));
}
