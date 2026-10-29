import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { runNativeNavigationVisualCases } from './native-navigation-visual-cases.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const origin = new URL(option('base-url') ?? 'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const expectedPid = Number(option('expected-pid'));
assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0, '--expected-pid=N is required');
const root = path.resolve(import.meta.dirname, '..'), stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(option('output-root') ?? path.join(root, 'output/原生固定目录_20261026', stamp));
await fs.mkdir(output, { recursive: true });
const projectId = 'disposable-surface-core-facade', base = '/api/lcos/core/projects/' + projectId;
const mainId = 'surface-core-main', contextId = 'surface-core-context', longSession = 'conversation-08d78311-43d1-4be1-97c5-52d5442839f4';
const canvasPath = id => '/api/canvas/v1/canvases/' + encodeURIComponent(id);
const report = { passed: false, origin, expectedPid, output, steps: [], writes: [], receipts: [], blocked: [], screenshots: [],
  observation: { moduleAppend: 'Read-only shell/canvas/navigation/directory snapshots only', productFunctionTrace: false,
    ownerReplacement: false, setterCallsFromObservation: 0, responseBytesUnmodified: false },
  pageErrors: [], apiErrors: [], requestFailures: [], modelSends: 0, geometry: [], coverage: {
    real: [], notClaimed: ['nonzero directory scroll capacity', 'child worksite', 'Run marker', 'missing target', 'multiple-place picker unless an existing occurrence provides it'] } };
let browser, page, before, stage = 'preflight', pinPlan;
const attemptedPins = new Set(), receipts = new Map();
const reuseReportPath = option('reuse-owned-marker-report');
let reusedSource;
const get = async route => {
  assert.ok(route.startsWith('/') && !route.startsWith('//'));
  const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route); const payload = await response.json();
  assert.ok(payload.ok === true || payload.code === 0 || route === '/health', route + ' successful envelope');
  return payload.value ?? payload.data ?? payload;
};
const poll = async (read, test, label, timeout = 30000) => {
  const end = Date.now() + timeout; let last;
  do { last = await read(); if (test(last)) return last; await new Promise(resolve => setTimeout(resolve, 180)); } while (Date.now() < end);
  throw Error(label + ' timed out; last=' + JSON.stringify(last));
};
const markers = () => get(base + '/spatial-markers');
const stripCounters = graph => Object.fromEntries(Object.entries(graph).filter(([key]) => !['changeSets','mutationChangeSets','spatialMarkers','spatialMarkerIntents','projectionVersion','spatialVersion'].includes(key)));
async function facts() {
  const [graph, runs, collections, bindings, markerRows, sessions] = await Promise.all([
    get(base + '/graph'), get(base + '/runs'), get(base + '/collections'), get(base + '/spatial/bindings'), markers(), get(base + '/conversations'),
  ]);
  const canvases = {}, messages = {};
  const ids = [...new Set([mainId, contextId, ...(graph.workspaces ?? []).map(row => row.canvasId).filter(Boolean)])];
  for (const id of ids) canvases[id] = await get(canvasPath(id));
  for (const session of sessions) {
    const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
    const rows = Array.isArray(payload) ? payload : payload.messages ?? payload.items;
    assert.ok(Array.isArray(rows)); assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false, 'Complete message snapshot');
    messages[session.id] = rows;
  }
  assert.equal(messages[longSession]?.length, 28, 'Exact long session retains its original 28 messages');
  return { graph, runs, collections, bindings, markers: markerRows, messages, canvases };
}
function validateEcho(body, persisted, id) {
  if (!body || body.canvas_id !== id || body.created_by_role !== 'user'
    || Object.keys(body).some(key => !['canvas_id','created_by_role','actions','lcos_expected_revisions','lcos_refs'].includes(key))
    || !Array.isArray(body.actions) || body.actions.length !== 1) return 'Unexpected batch envelope';
  const action = body.actions[0];
  if (action.action !== 'update' || Object.keys(action).some(key => !['action','updates'].includes(key)) || !Array.isArray(action.updates) || !action.updates.length) return 'Only exact original DTO echoes';
  for (const patch of action.updates) {
    const old = persisted.nodes.find(row => row.id === patch.id);
    if (!old || Object.keys(patch).some(key => !['id','canvas_id','type','data','position','measured','parent_id','parentId','width','height'].includes(key))) return 'Unknown node/field';
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'canvas_id') { if (value !== id) return 'Canvas changed'; }
      else if (['parent_id','parentId'].includes(key)) { if ((value ?? '') !== (old.parent_id ?? old.parentId ?? '')) return 'Parent changed'; }
      else if (key === 'data') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid node data';
        for (const [field, next] of Object.entries(value)) if (!same(next, old.data?.[field])) return 'Node data changed: ' + field;
      } else if (!same(value, old[key])) return 'Node geometry/DTO changed: ' + patch.id + '/' + key;
    }
  }
  for (const [nodeId, revision] of Object.entries(body.lcos_expected_revisions ?? {})) {
    const node = persisted.nodes.find(row => row.id === nodeId);
    if (!node || String(revision) !== String(persisted.lcos_expected_revisions?.[nodeId] ?? node.lcos_revision_id ?? node.data?.lcos_ref?.revisionId ?? '')) return 'Unconfirmed revision';
  }
  if (body.lcos_refs !== undefined && !same(body.lcos_refs, persisted.lcos_refs)) return 'Reference envelope changed';
  return null;
}
const nodeFacts = node => ({ id: node.id, type: node.type, data: node.data, position: node.position, measured: node.measured,
  width: node.width, height: node.height, parent: node.parent_id ?? node.parentId ?? '' });
async function checkFinal() {
  const after = await facts(); await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify(after, null, 2));
  assert.deepEqual(stripCounters(after.graph), stripCounters(before.graph), 'Domain graph unchanged');
  for (const key of ['runs','collections','bindings','messages','markers']) assert.deepEqual(after[key], before[key], key + ' unchanged');
  assert.deepEqual(Object.keys(after.canvases).sort(), Object.keys(before.canvases).sort());
  for (const [id, old] of Object.entries(before.canvases)) {
    assert.deepEqual(after.canvases[id].nodes.map(nodeFacts), old.nodes.map(nodeFacts), 'All node identity/content/geometry unchanged: ' + id);
    assert.deepEqual(after.canvases[id].links ?? after.canvases[id].edges ?? [], old.links ?? old.edges ?? [], 'All links unchanged: ' + id);
  }
  report.canonicalFactsUnchanged = true;
}
try {
  const health = await get('/health'); assert.equal(health.pid, expectedPid); assert.equal(health.realCoreConnected, true);
  assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020'); report.pid = health.pid;
  const initial = await facts();
  if (reuseReportPath) {
    const resolved = path.resolve(reuseReportPath);
    reusedSource = JSON.parse(await fs.readFile(resolved, 'utf8'));
    assert.equal(reusedSource.pid, expectedPid, 'Reuse only this same authorized Core instance');
    assert.equal(reusedSource.origin, origin); assert.equal(reusedSource.passed, false);
    assert.equal(reusedSource.receipts?.length, 2, 'Exactly the two prior GUI receipts are required');
    before = JSON.parse(await fs.readFile(path.join(path.dirname(resolved), 'before-facts.json'), 'utf8'));
    assert.equal(before.markers.length, 0);
    const expected = reusedSource.receipts.map(row => row.marker);
    assert.deepEqual([...initial.markers].sort((a,b)=>a.id.localeCompare(b.id)), [...expected].sort((a,b)=>a.id.localeCompare(b.id)), 'Current markers equal only the two unchanged original GUI receipts');
    for (const item of reusedSource.receipts) {
      assert.ok(reusedSource.writes.some(row => row.method === 'POST' && row.path === base + '/spatial-markers' && row.status === 201 && row.markerId === item.marker.id), 'Receipt was really created by the preceding original UI run');
      receipts.set(item.marker.id, item.marker); report.receipts.push({ ...item, reusedFrom: resolved });
    }
    assert.deepEqual(stripCounters(initial.graph), stripCounters(before.graph));
    for (const key of ['runs','collections','bindings','messages']) assert.deepEqual(initial[key], before[key], 'Failed run kept '+key+' unchanged');
    assert.deepEqual(Object.keys(initial.canvases).sort(), Object.keys(before.canvases).sort());
    for (const [id, old] of Object.entries(before.canvases)) {
      assert.deepEqual(initial.canvases[id].nodes.map(nodeFacts), old.nodes.map(nodeFacts), 'Prior node facts unchanged: '+id);
      assert.deepEqual(initial.canvases[id].links ?? initial.canvases[id].edges ?? [], old.links ?? old.edges ?? [], 'Prior links unchanged: '+id);
    }
    report.reusedOwnedReceipts = { source: resolved, ids: expected.map(row=>row.id), noNewMarkerCreation: true };
    await fs.writeFile(path.join(output, 'resume-initial-facts.json'), JSON.stringify(initial, null, 2));
  } else {
    before = initial;
    assert.equal(before.markers.length, 0, 'This empty-state run must not adopt or remove existing markers');
  }
  await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify(before, null, 2));
  const main = before.canvases[mainId].nodes.find(node => node.id === 'surface-main-image'); assert.equal(main?.type, 'image');
  const contextImages = before.canvases[contextId].nodes.filter(node => node.type === 'image' && node.data?.lcos_ref?.artifactViewId);
  const contextImage = contextImages.find(node => node.data.lcos_ref.artifactViewId !== main.data.lcos_ref.artifactViewId) ?? contextImages[0];
  assert.ok(contextImage, 'An existing canonical Context image is required; no test record will be created');
  const targets = [main, contextImage].map((node, index) => ({ canvasId: index ? contextId : mainId, node,
    ref: { projectId, kind: 'view', id: node.data.lcos_ref.artifactViewId } }));
  const refs = targets.map(row => row.ref); report.targets = targets;
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:','blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) {
      report.blocked.push({ stage, method, path: url.pathname, reason: 'Non-loopback/current-project request' }); return route.abort();
    }
    if (method === 'GET' && url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 120000 }), source = await response.text();
      for (const name of ['useLcosShellStore','useCanvasStore','useLcosReferenceStore','currentNativeNavigationScene','nativeNavigationSnapshot','navigationDirectorySnapshot'])
        assert.match(source, new RegExp('\\b' + name + '\\b'), 'Real read helper source ' + name);
      return route.fulfill({ response, body: source + `\nwindow.__DIRECTORY_BROWSER_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState(),n=nativeNavigationSnapshot(),d=navigationDirectorySnapshot(),scene=currentNativeNavigationScene();return{canvas:c.canvasId,workspace:s.activeWorkspaceId,prompt:s.composerPrompt,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,viewport:c.rfInstance?.getViewport(),scene:scene&&{projectId:scene.projectId,canvasId:scene.canvasId,workspaceId:scene.workspaceId,surfaceRef:scene.surfaceRef},navigation:{navigating:n.navigating,arrival:n.arrival,notice:n.notice},directory:{open:d.open,status:d.status,error:d.error,query:d.query,scroll:d.scroll,busy:d.busy,pending:d.pending,selectedMarkerId:d.selectedMarkerId,rows:d.rows.map(r=>({id:r.marker.id,title:r.title,status:r.status,candidates:r.candidates.map(p=>({key:p.key,canvasId:p.canvasId,nodeId:p.nodeId,workspaceId:p.workspaceId}))}))}};};` });
    }
    if (['GET','HEAD','OPTIONS'].includes(method)) return route.continue();
    const row = { stage, method, path: url.pathname, permitted: false }; report.writes.push(row);
    let body; try { body = request.postDataJSON(); } catch { body = null; } row.body = body;
    if (method === 'POST' && url.pathname === '/api/events') { row.permitted = true; return route.continue(); }
    if (method === 'POST' && [mainId,contextId].some(id => ['/api/lcos/canvases/' + id + '/execution:reconcile','/api/lcos/canvases/' + id + '/conversations:reconcile'].includes(url.pathname)) && same(body, {})) {
      row.permitted = true; return route.continue();
    }
    if (method === 'POST' && url.pathname === base + '/navigation/resolve' && refs.some(targetRef => same(body, { targetRef }))) { row.permitted = true; return route.continue(); }
    if (method === 'POST' && url.pathname === base + '/spatial-markers' && pinPlan && stage.startsWith('pin-')
      && !attemptedPins.has(pinPlan.key) && same(body, { targetRef: pinPlan.ref, scope: 'local', sourceSurfaceRef: pinPlan.surfaceRef })) {
      const plan = pinPlan; attemptedPins.add(plan.key); row.permitted = true;
      const response = await route.fetch(), payload = await response.json(), marker = payload.value; row.status = response.status();
      if (response.ok() && payload.ok === true && marker?.id && !before.markers.some(item => item.id === marker.id)
        && same(marker.targetRef, plan.ref) && marker.scope === 'local' && marker.sourceSurfaceRef === plan.surfaceRef) {
        receipts.set(marker.id, marker); row.markerId = marker.id; report.receipts.push({ key: plan.key, marker });
      }
      return route.fulfill({ response });
    }
    if (method === 'DELETE' && url.pathname.startsWith(base + '/spatial-markers/')) {
      const id = decodeURIComponent(url.pathname.slice((base + '/spatial-markers/').length)), receipt = receipts.get(id);
      const present = receipt && (await markers()).find(marker => marker.id === id);
      if (present && same(present, receipt) && !before.markers.some(marker => marker.id === id)) { row.permitted = true; return route.continue(); }
    }
    const batchCanvas = [mainId,contextId].find(id => url.pathname === canvasPath(id) + '/nodes:batchActions');
    if (method === 'POST' && batchCanvas) {
      const reason = validateEcho(body, await get(canvasPath(batchCanvas)), batchCanvas);
      if (!reason) { row.permitted = true; return route.continue(); } row.reason = reason;
    }
    report.blocked.push(row); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) report.apiErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on('requestfailed', request => report.requestFailures.push({ path: new URL(request.url()).pathname, failure: request.failure() }));
  const read = () => page.evaluate(() => window.__DIRECTORY_BROWSER_READ__());
  const ready = async id => {
    const targetId = targets.find(target => target.canvasId === id)?.node.id;
    await page.waitForFunction(({ id, targetId }) => {
      const current = window.__DIRECTORY_BROWSER_READ__?.();
      return current?.canvas === id && current?.scene?.canvasId === id
        && window.__LCOS_NODE_LAB__?.api?.getNodes?.().some(node => node.id === targetId);
    }, { id, targetId }, { timeout: 90000 });
    await page.locator('[data-native-navigation-layer][data-native-navigation-state="ready"]').waitFor({ timeout: 60000 });
    // Scene stores become ready before the original loading-overlay exit.
    // Wait for that actual owner to release input; do not click through it.
    await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  };
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); console.log(JSON.stringify({ stage, screenshot: name })); };
  const trigger = page.locator('button[data-native-navigation-directory-trigger]'), directory = page.locator('[data-native-navigation-directory]');
  const open = async () => { if (!await directory.isVisible()) await trigger.click(); await directory.waitFor(); await poll(read, value => value.directory.open && value.directory.status === 'ready', 'Directory ready');
    assert.equal(await directory.count(), 1, 'One original Popover directory'); };
  const closeEscape = async () => { await page.keyboard.press('Escape'); await directory.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.matches('button[data-native-navigation-directory-trigger]')); };
  const originalMore = async node => {
    const view = page.locator('.react-flow__node[data-id="' + node.id + '"]'); await view.waitFor();
    await page.waitForFunction(id => {
      const element = document.querySelector('.react-flow__node[data-id="' + id + '"]');
      if (!element) return false; const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.width > 0 && box.height > 0 && hit?.closest('.react-flow__node')?.getAttribute('data-id') === id;
    }, node.id);
    const point = await view.evaluate(element => {
      const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2, hit = document.elementFromPoint(x, y);
      return { rect: box.toJSON(), x, y, hitNodeId: hit?.closest('.react-flow__node')?.getAttribute('data-id'), hit: hit?.outerHTML.slice(0, 1000) };
    });
    assert.equal(point.hitNodeId, node.id, 'Actual mouse point hits this original node after its loading overlay exits');
    (report.originalPointerActions ??= []).push({ stage, nodeId: node.id, ...point });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api?.getNodes?.().find(node => node.id === id)?.selected === true, node.id);
    const toolbar = page.locator('[data-testid="canvas-node-toolbar"]:visible'); await toolbar.waitFor();
    const more = toolbar.locator('[aria-haspopup="menu"]'); assert.equal(await more.count(), 1, 'One actual original More'); await more.click();
  };
  const pin = async target => {
    const current = await read(); assert.equal(current.canvas, target.canvasId); assert.ok(current.scene?.surfaceRef);
    if (reuseReportPath) {
      const receipt = [...receipts.values()].find(row => same(row.targetRef,target.ref) && row.sourceSurfaceRef === current.scene.surfaceRef);
      assert.ok(receipt, 'Exact preceding GUI marker matches original target and scene');
      stage = 'reuse-pin-' + target.canvasId; await originalMore(target.node);
      await page.getByRole('menuitem', { name: '取消固定', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      return receipt;
    }
    pinPlan = { key: target.canvasId + '/' + target.node.id, ref: target.ref, surfaceRef: current.scene.surfaceRef };
    stage = 'pin-' + target.canvasId; await originalMore(target.node); await page.getByRole('menuitem', { name: '固定到导航', exact: true }).click();
    await poll(markers, rows => rows.some(row => receipts.has(row.id) && same(row.targetRef, target.ref) && row.sourceSurfaceRef === pinPlan.surfaceRef), 'Exact GUI-created marker receipt');
    const receipt = [...receipts.values()].find(row => same(row.targetRef, target.ref) && row.sourceSurfaceRef === pinPlan.surfaceRef);
    pinPlan = undefined; assert.ok(receipt); return receipt;
  };
  const choose = async (receipt, target) => {
    await directory.locator('[data-native-navigation-directory-row="' + receipt.id + '"] .native-navigation-directory-row-main').click();
    await poll(read, value => value.directory.selectedMarkerId === receipt.id || !value.directory.open || !!value.directory.error, 'Original directory selection');
    const value = await read(); assert.equal(value.directory.error, '');
    if (value.directory.selectedMarkerId === receipt.id) {
      const row = value.directory.rows.find(row => row.id === receipt.id);
      const index = row.candidates.findIndex(place => place.canvasId === target.canvasId && place.nodeId === target.node.id);
      assert.ok(index >= 0, 'Actual occurrence matches the original target');
      await directory.locator('[data-native-navigation-directory-place="' + index + '"]').click(); report.coverage.real.push('Existing multiple-place picker');
    }
    await ready(target.canvasId);
    await page.locator('[data-native-node-emphasis="' + target.node.id + '"][data-arrival="true"]').waitFor();
  };
  const navigationClip = async (label, id) => {
    const value = await page.evaluate(({ label, id }) => {
      const layer = document.querySelector('[data-native-navigation-layer]'), wrapper = layer?.querySelector('.native-navigation-halos');
      const halo = layer?.querySelector('[data-native-node-emphasis="' + id + '"]');
      const pane = document.querySelector('.react-flow'), node = document.querySelector('.react-flow__node[data-id="' + id + '"]');
      const marker = layer?.querySelector('[data-native-navigation-marker="' + id + '"]');
      if (!layer || !wrapper || !halo || !pane || !node || !marker) throw Error('Actual original navigation layer/target missing');
      const box = element => element.getBoundingClientRect().toJSON(), paneBox = box(pane), wrapperBox = box(wrapper), nodeBox = box(node), markerBox = box(marker);
      const chats = [...document.querySelectorAll('[data-lcos-native-chat-frame]')].filter(element =>
        element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false).map(box)
        .filter(rect => rect.width > 0 && rect.height > 0 && rect.bottom > paneBox.top && rect.top < paneBox.bottom && rect.left > paneBox.left + paneBox.width / 2);
      const expectedRight = Math.min(paneBox.right, ...chats.map(rect => rect.left));
      const css = getComputedStyle(wrapper).clipPath, match = /^inset\(([^)]+)\)$/.exec(css), tokens = match?.[1].trim().split(/\s+/).map(parseFloat) ?? [];
      const inset = tokens.length === 1 ? [tokens[0],tokens[0],tokens[0],tokens[0]] : tokens.length === 2 ? [tokens[0],tokens[1],tokens[0],tokens[1]]
        : tokens.length === 3 ? [tokens[0],tokens[1],tokens[2],tokens[1]] : tokens;
      if (inset.length !== 4 || inset.some(value => !Number.isFinite(value))) throw Error('Actual halo clip insets are not measurable');
      const clip = { left: wrapperBox.left + inset[3], right: wrapperBox.right - inset[1], top: wrapperBox.top + inset[0], bottom: wrapperBox.bottom - inset[2] };
      const hit = document.elementFromPoint(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
      return { label, id, layerParentIsBody: layer.parentElement === document.body, viewport: { width: innerWidth, height: innerHeight },
        wrapper: wrapperBox, clipPath: css, inset, clip, pane: paneBox, chats, expectedRight, node: nodeBox, halo: box(halo),
        visibleTarget: { left: Math.max(nodeBox.left,paneBox.left,clip.left), right: Math.min(nodeBox.right,expectedRight), top: Math.max(nodeBox.top,paneBox.top), bottom: Math.min(nodeBox.bottom,paneBox.bottom) },
        marker: markerBox, markerPhase: marker.getAttribute('data-phase'), markerHit: !!hit && marker.contains(hit) };
    }, { label, id });
    (report.navigationClipChecks ??= []).push(value);
    assert.equal(value.layerParentIsBody, true, 'Same existing navigation layer portals directly to body');
    assert.ok(Math.abs(value.wrapper.x) < .5 && Math.abs(value.wrapper.y) < .5 && Math.abs(value.wrapper.width - value.viewport.width) < 1
      && Math.abs(value.wrapper.height - value.viewport.height) < 1, 'Halo wrapper actually spans viewport rather than a paint-contained canvas');
    assert.ok(Math.abs(value.clip.right - value.expectedRight) < 1, 'Actual wrapper-relative clip ends at the real pane/chat boundary, without subtracting right rail twice');
    assert.ok(value.visibleTarget.right > value.visibleTarget.left && value.visibleTarget.bottom > value.visibleTarget.top);
    assert.ok(value.clip.right >= value.visibleTarget.right - .5 && value.clip.left <= value.visibleTarget.left + .5
      && value.halo.right >= value.visibleTarget.right && value.halo.left <= value.visibleTarget.left, 'Visible original image halo has no middle cut');
    assert.equal(value.markerPhase, 'local'); assert.equal(value.markerHit, true, 'Actual right-side original Pin receives its centre hit');
    assert.ok(value.marker.width >= 44 && value.marker.height >= 44, 'World Pin retains a real 44px hit area');
    return value;
  };
  const geometry = async label => {
    const value = await page.evaluate(label => {
      const get = selector => document.querySelector(selector), rect = el => el?.getBoundingClientRect().toJSON();
      const row = get('[data-native-navigation-bottom-row]'), pill = get('[data-native-navigation-camera-pill]'), zoom = get('[data-native-navigation-zoom]'), button = get('button[data-native-navigation-directory-trigger]');
      const buttonBox = rect(button), buttonHit = buttonBox && document.elementFromPoint(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
      const controls = [...(row?.querySelectorAll('button') ?? [])].map(control => {
        const box = control.getBoundingClientRect(), style = getComputedStyle(control), visible = box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        const hit = visible ? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) : null;
        return { label: control.getAttribute('aria-label') ?? control.title, box: box.toJSON(), visible, hit: !!hit && control.contains(hit) };
      });
      return { label, viewport: { width: innerWidth, height: innerHeight }, row: rect(row), rowScrollWidth: row?.scrollWidth, rowClientWidth: row?.clientWidth,
        pill: rect(pill), zoom: rect(zoom), trigger: buttonBox, triggerHit: !!buttonHit && button.contains(buttonHit), controls };
    }, label);
    report.geometry.push(value); assert.ok(value.row && value.pill && value.zoom && value.trigger);
    assert.ok(value.row.x >= -.5 && value.row.x + value.row.width <= value.viewport.width + .5, 'Entire original bottom row stays inside viewport');
    assert.ok(value.rowScrollWidth <= value.rowClientWidth + 1, 'Original row has no horizontal overflow');
    assert.equal(value.triggerHit, true, 'Real original gs button receives its centre hit');
    if (value.viewport.width <= 400) assert.ok(value.trigger.width >= 44 && value.trigger.height >= 44, 'New narrow Pin has real 44px button bounds');
    assert.ok(value.controls.filter(row => row.visible).every(row => row.hit), 'Every visible original row button remains actually hittable');
    return value;
  };
  stage = 'empty'; await page.goto(origin + '/canvas/' + mainId, { waitUntil: 'domcontentloaded', timeout: 90000 }); await ready(mainId);
  if (await page.getByRole('button', { name: '收起对话', exact: true }).isVisible()) await page.getByRole('button', { name: '收起对话', exact: true }).click();
  await open();
  if (!reuseReportPath) { await directory.getByText('还没有固定目标。', { exact: true }).waitFor(); await shot('01-original-empty-popover'); }
  else { assert.equal((await read()).directory.rows.length,2); await shot('01-original-two-receipts-reused'); }
  await closeEscape();
  report.steps.push(reuseReportPath ? 'Original Popover reuses exactly the two prior GUI-created receipts; no duplicate Pin POST is permitted' : 'Original camera Pin opens the empty original Popover; Escape restores actual gs button focus');
  for (const width of [360,320]) {
    stage = 'layout-' + width; await page.setViewportSize({ width, height: 820 }); await geometry(width + '-closed');
    await open(); await page.getByRole('searchbox', { name: '搜索固定目标', exact: true }).waitFor();
    const box = await directory.boundingBox(); assert.ok(box.x >= -.5 && box.x + box.width <= width + .5); await shot('02-' + width + '-original-popover'); await closeEscape();
  }
  await page.setViewportSize({ width: 1500, height: 1000 });
  // Only initial target discovery uses the original fitView. All directory
  // navigation, scope changes, Header Back, search and Pin writes use real UI.
  await page.evaluate(id => window.__LCOS_NODE_LAB__.api.fitView({ nodes: [{ id }], padding: 1.2, minZoom: .4, maxZoom: 1, duration: 0 }), main.id);
  const mainReceipt = await pin(targets[0]); stage = 'main-directory'; await open();
  const search = page.getByRole('searchbox', { name: '搜索固定目标', exact: true });
  await search.fill('__目录没有这个目标__'); await directory.getByText('没有匹配的固定目标。', { exact: true }).waitFor();
  assert.equal((await markers()).length, reuseReportPath ? 2 : 1, 'Search does not change the real markers');
  const mainRow = (await read()).directory.rows.find(row => row.id === mainReceipt.id); assert.ok(mainRow?.title);
  await search.fill(mainRow.title); await shot('03-main-query'); await choose(mainReceipt, targets[0]); await navigationClip('main-arrival', main.id);
  report.steps.push(reuseReportPath ? 'Main original More confirms the exact prior fixed marker; directory search and original locate reach the same image without a new marker POST' : 'Main original More creates one real marker; directory search and original locate reach the same image');
  stage = 'context-original-dock'; await page.locator('[data-lcos-surface="context"]').click(); await ready(contextId);
  await page.evaluate(id => window.__LCOS_NODE_LAB__.api.fitView({ nodes: [{ id }], padding: 1.2, minZoom: .4, maxZoom: 1, duration: 0 }), contextImage.id);
  const contextReceipt = await pin(targets[1]);
  stage = 'main-return-dock'; await page.locator('[data-lcos-surface="main"]').click(); await ready(mainId); await open();
  const contextRow = (await read()).directory.rows.find(row => row.id === contextReceipt.id); assert.ok(contextRow?.title);
  await search.fill(contextRow.title);
  const list = page.locator('[data-native-navigation-directory-list]'); await list.hover(); await page.mouse.wheel(0, 180);
  const saved = await read(), savedScroll = await list.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, content: el.scrollHeight }));
  report.savedDirectory = { query: saved.directory.query, scroll: saved.directory.scroll, dom: savedScroll, viewport: saved.viewport };
  if (savedScroll.content <= savedScroll.height) report.coverage.real.push('Two real rows have no nonzero scroll range; capacity is not claimed');
  await shot('04-main-before-cross'); stage = 'directory-cross-enter'; await choose(contextReceipt, targets[1]);
  assert.equal((await read()).canvas, contextId); await page.getByTestId('canvas-header-logo-button').waitFor();
  await navigationClip('context-right-rail-arrival', contextImage.id); await shot('05-context-from-original-directory');
  report.steps.push('Original directory enters the exact existing Context, locates its actual image and shows arrival feedback');
  stage = 'original-header-back'; await page.getByTestId('canvas-header-logo-button').click(); await ready(mainId); await directory.waitFor();
  await poll(read, value => value.directory.status === 'ready' && value.directory.open, 'Original Header Back restored directory');
  await page.waitForFunction(() => document.activeElement?.matches('input[type="search"][aria-label="搜索固定目标"]')
    && !!document.activeElement.closest('[data-native-navigation-directory]'));
  report.returnFocus = await search.evaluate(element => ({ active: document.activeElement === element, tag: element.tagName,
    type: element.type, label: element.getAttribute('aria-label'), inDirectory: !!element.closest('[data-native-navigation-directory]') }));
  assert.equal(report.returnFocus.active, true, 'Original directory owns actual search focus after Header Back');
  const returned = await read(); assert.equal(returned.directory.query, saved.directory.query); assert.equal(returned.directory.scroll, saved.directory.scroll);
  assert.equal(await search.inputValue(), saved.directory.query); assert.equal(await list.evaluate(el => el.scrollTop), savedScroll.top);
  for (const key of ['prompt','windows','refs','workspace']) assert.deepEqual(returned[key], saved[key], 'Source ' + key + ' restored');
  assert.ok(Math.abs(returned.viewport.x - saved.viewport.x) < 1 && Math.abs(returned.viewport.y - saved.viewport.y) < 1 && Math.abs(returned.viewport.zoom - saved.viewport.zoom) < .0001, 'Source camera restored');
  await shot('06-original-header-back-query-restored'); report.steps.push('Main directory enters the existing Context; original Header Back returns Main with the same query, list position, camera, input and refs, and actual original search focus');
  if (process.argv.includes('--visual-placement')) await runNativeNavigationVisualCases({ page, report, read, markers, target: targets[0], receipt: mainReceipt,
    openDirectory: open, closeEscape, choose, shot, setStage: value => { stage = value; } });
  stage = 'remove-own-markers'; await search.fill('');
  for (const receipt of [contextReceipt,mainReceipt]) {
    await directory.locator('[data-native-navigation-directory-remove="' + receipt.id + '"]').click();
    await poll(markers, rows => !rows.some(row => row.id === receipt.id), 'Only this run receipt removed by directory UI');
    await directory.locator('[data-native-navigation-directory-row="' + receipt.id + '"]').waitFor({ state: 'hidden' });
  }
  await directory.getByText('还没有固定目标。', { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="search"][aria-label="搜索固定目标"]')
    && !!document.activeElement.closest('[data-native-navigation-directory]'));
  report.afterRemovalFocus = await search.evaluate(element => ({ active: document.activeElement === element, tag: element.tagName,
    type: element.type, label: element.getAttribute('aria-label') }));
  assert.equal(report.afterRemovalFocus.active, true, 'Product moves focus to original search after the final focused row is removed');
  await closeEscape(); await geometry('desktop-final'); await shot('07-own-markers-removed');
  await checkFinal(); assert.deepEqual(report.blocked, [], 'No unknown business write or remote request'); assert.deepEqual(report.pageErrors, []);
  report.coverage.real.push(...(reuseReportPath ? ['Exact prior GUI receipt reuse; marker creation and initial empty state remain evidenced by the preceding source run'] : ['Empty state', 'Main and Context original More marker creation']), 'Exact local locate', 'Original directory cross-scene enter', 'Original Header Back restores directory', '320/360 bounds and real hits', 'Escape focus return', 'Owned markers UI removal');
  report.passed = true;
} catch (error) {
  report.failure = error.stack; report.failureStage = stage; process.exitCode = 1;
  if (page) try { report.failureDom = await page.evaluate(() => ({ text: document.body.innerText.slice(-6000), read: window.__DIRECTORY_BROWSER_READ__?.(),
    entry: document.querySelector('[data-native-navigation-directory-entry]')?.outerHTML,
    bottomRow: document.querySelector('[data-native-navigation-bottom-row]')?.outerHTML, active: document.activeElement?.outerHTML.slice(0, 1000) })); } catch {}
} finally {
  // On failure preserve the exact original UI and POST receipts. No direct API
  // cleanup, no automatic retry, and no adoption of another run's marker.
  try { const rows = await markers(); report.remainingOwnMarkers = rows.filter(row => receipts.has(row.id)); } catch (error) { report.cleanupReadError = String(error); }
  if (page && !report.passed) try { const file = path.join(output, 'failure.png'); await page.screenshot({ path: file }); report.screenshots.push(file); } catch {}
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, stage, pid: report.pid, report: path.join(output, 'report.json'), failure: report.failure,
    blocked: report.blocked, remainingOwnMarkers: report.remainingOwnMarkers, steps: report.steps }, null, 2));
}
