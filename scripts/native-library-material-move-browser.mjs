import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { nativeCollectionSavedPlacementMatches as matchesSavedPoint } from '../lab/pilot/native-collection-save-precision.mjs';

const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(arg('base-url') && process.argv.includes('--run-declared-move'), 'Use the coordinated new candidate and --run-declared-move only during its authorized serial write window.');
const address = new URL(arg('base-url')); assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1');
const origin = address.origin, canvasId = arg('canvas-id') ?? 'surface-core-main';
const inspectOnly = process.argv.includes('--inspect-only');
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.realCoreConnected && health.runtimeLabel?.startsWith('isolated-'));
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'output/原生Drop整合_20261017f/原材料移动与原历史GUI', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), output, origin, canvasId, pid: health.pid, runtimeLabel: health.runtimeLabel, passed: false,
  scope: 'Existing exact synthetic pinned Main material: real original Canvas mouse move + original keyboard Undo/Redo, real geometry batch and Core Presentation/semantic GET. No new material, hidden setPosition/undo API, model, or creation-Undo claim.',
  batches: [], blockedWrites: [], externalBlocked: [], errors: [], routeErrors: [], screenshots: [], steps: [], phase: 'startup' };
const get = async pathname => {
  const response = await fetch(origin + pathname, { cache: 'no-store', redirect: 'error' }); const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify({ pathname, body }));
  if ('ok' in body) { assert.equal(body.ok, true); return body.value; } assert.equal(body.code, 0); return body.data;
};
const assets = await get('/api/library/v1/assets:search?type_filter=1&page_size=100');
const asset = assets.items.map(row => row.asset).find(asset => asset.lcos_projection?.referenceable
  && (!arg('artifact-id') || asset.lcos_projection.artifact_id === arg('artifact-id')));
assert.ok(asset, 'Use the existing explicit synthetic image; never create a fixture silently.');
const source = asset.lcos_projection, prefix = `/api/lcos/core/projects/${encodeURIComponent(source.project_id)}`;
const graphsBefore = await get(prefix + '/graph'), runsBefore = await get(prefix + '/runs');
const roots = graphsBefore.scopes.filter(scope => scope.kind === 'root'); assert.equal(roots.length, 1);
const ownedWorkspace = graphsBefore.workspaces.filter(workspace => workspace.canvasId === canvasId);
assert.equal(ownedWorkspace.length, 1); assert.equal(ownedWorkspace[0].scopeId, roots[0].id); assert.equal(ownedWorkspace[0].preferredSurface, 'main');
const selected = { projectId: source.project_id, artifactId: source.artifact_id, artifactViewId: source.artifact_view_id,
  revisionId: source.presented_revision_id, fileRecordId: source.file_record_id, targetRef: JSON.stringify({ kind: 'main' }) };
const semanticAddress = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/materials:receive?` + new URLSearchParams(selected);
const initialReceipt = await get(semanticAddress); assert.equal(initialReceipt.state, 'present');
const nodeId = initialReceipt.node?.id, proof = initialReceipt.node; assert.ok(nodeId && proof.type === 'image');
assert.equal(proof.data.lcos_ref.artifactId, source.artifact_id); assert.equal(proof.data.lcos_ref.revisionId, source.presented_revision_id);
const presentationId = initialReceipt.presentation.id;
report.source = { nodeId, artifactId: source.artifact_id, revisionId: source.presented_revision_id, viewId: proof.data.lcos_ref.artifactViewId };
const otherCanvases = ['surface-core-main', 'surface-core-context', 'surface-core-workflow'].filter(id => id !== canvasId);
const otherBefore = Object.fromEntries(await Promise.all(otherCanvases.map(async id => [id, await get('/api/canvas/v1/canvases/' + id)])));
await writeFile(path.join(output, 'before-facts.json'), JSON.stringify({ graph: graphsBefore, runs: runsBefore, initialReceipt, otherCanvases: otherBefore }, null, 2));
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
let page;
await context.route('**/*', async route => {
  try {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const record = { phase: report.phase, path: url.pathname, method: request.method(), body: request.postData() };
      if (request.method() === 'POST' && url.pathname === `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`) {
        const body = request.postDataJSON();
        const current = await page.evaluate(({ canvasId, nodeId }) => {
          const host = window.__LCOS_NODE_LAB__;
          return (host?.currentCanvasId ?? host?.canvasId) === canvasId
            ? { projectId: host.projectId, node: host.api?.getNode(nodeId) } : null;
        }, { canvasId, nodeId });
        let admitted = current?.projectId === source.project_id && body.canvas_id === canvasId
          && Array.isArray(body.actions) && body.actions.length > 0;
        try { assert.deepEqual(current?.node?.data?.lcos_ref, proof.data.lcos_ref); } catch { admitted = false; }
        admitted &&= body.actions.every(action => action.action === 'update' && Array.isArray(action.updates) && action.updates.length > 0
          && action.updates.every(update => {
            if (update.id !== nodeId || Object.keys(update).some(key => !['id', 'type', 'data', 'position', 'measured', 'width', 'height', 'parent_id'].includes(key))
              || update.type !== undefined && update.type !== 'image') return false;
            if (update.position && (!Number.isFinite(update.position.x) || !Number.isFinite(update.position.y))) return false;
            if (report.phase === 'startup' && update.position && !matchesSavedPoint(update.position, proof.position)) return false;
            // Original PC emits a root-parent echo for original history replay;
            // it is not permission to move the carrier into another parent.
            if ('parent_id' in update && (update.parent_id !== '' || current.node.parentId || proof.parentId || proof.parent_id)) return false;
            try {
              if (update.data) {
                const expected = { ...proof.data };
                // The observed original Undo/PC payload omits the display title.
                // All other source bytes/metadata and the complete exact ref stay equal.
                if (!('title' in update.data)) delete expected.title;
                assert.deepEqual(update.data, expected);
              }
              if (update.measured) assert.deepEqual(update.measured, proof.measured);
              if ('width' in update) assert.equal(update.width, proof.measured.width);
              if ('height' in update) assert.equal(update.height, proof.measured.height);
            } catch { return false; }
            return true;
          }));
        if (admitted) {
          report.batches.push(record); const response = await route.fetch({ maxRedirects: 0 });
          record.status = response.status(); try { record.response = await response.json(); } catch {}
          return route.fulfill({ response });
        }
      }
      report.blockedWrites.push(record); return route.abort();
    }
    return route.continue();
  } catch (error) {
    report.routeErrors.push(String(error.stack ?? error)); try { await route.abort('failed'); } catch {}
  }
});
await context.routeWebSocket('**/*', socket => { report.externalBlocked.push('WebSocket:' + socket.url()); socket.close(); });
page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
const snapshot = () => page.evaluate(({ canvasId, nodeId }) => {
  const host = window.__LCOS_NODE_LAB__, api = host.api;
  return { document: performance.timeOrigin, canvasId: host.currentCanvasId ?? host.canvasId, nodes: api.getNodes(), edges: api.getEdges(),
    camera: api.getViewport(), selection: api.getSelection(), node: api.getNode(nodeId),
    history: api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId }) };
}, { canvasId, nodeId });
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
const waitFor = async (read, predicate, label) => { let value;
  for (let i = 0; i < 100; i++) { value = await read(); if (predicate(value)) return value; await page.waitForTimeout(150); }
  throw new Error(label + ': ' + JSON.stringify(value));
};
let before, apiHandle;
async function inspectPhase(phase, expected, index) {
  const live = await waitFor(snapshot, state => state.history?.ok && state.history.currentIndex === index
    && matchesSavedPoint(state.node.position, expected), phase + ' original history/live position did not settle');
  const receipt = await waitFor(() => get(semanticAddress), receipt => receipt.state === 'present'
    && matchesSavedPoint(receipt.node?.position, expected) && matchesSavedPoint(receipt.presentation?.state?.positions?.[report.source.viewId], expected),
  phase + ' Core Presentation and semantic receipt did not follow the original geometry write');
  assert.equal(receipt.node.id, nodeId); assert.deepEqual(receipt.node.data.lcos_ref, proof.data.lcos_ref);
  assert.equal(await page.evaluate(api => api === window.__LCOS_NODE_LAB__.api, apiHandle), true);
  assert.equal(live.document, before.document); assert.deepEqual(live.camera, before.camera);
  assert.deepEqual(live.edges, before.edges);
  assert.ok(live.selection.nodeIds.every(id => id === nodeId)); assert.deepEqual(live.selection.edgeIds, []);
  for (const old of before.nodes.filter(node => node.id !== nodeId)) {
    const now = live.nodes.find(node => node.id === old.id); assert.ok(now);
    for (const field of ['position', 'data', 'type', 'style', 'parentId']) assert.deepEqual(now[field], old[field], phase + ' changed unrelated node ' + old.id + '.' + field);
  }
  const value = { phase, expectedWorld: expected, livePosition: live.node.position, persistedPosition: receipt.node.position,
    presentationPosition: receipt.presentation.state.positions[report.source.viewId], history: live.history, selection: live.selection,
    receipt, savedBatches: report.batches.filter(batch => batch.phase === phase) };
  assert.ok(value.savedBatches.some(batch => batch.status === 200), phase + ' needs a real original batch HTTP 200');
  report.steps.push(value); await shot(phase + '-Core-Presentation-original-Canvas'); return value;
}
try {
  await page.goto(origin + '/canvas/' + encodeURIComponent(canvasId), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ canvasId, nodeId }) => { const host = window.__LCOS_NODE_LAB__;
    return (host?.currentCanvasId ?? host?.canvasId) === canvasId && !!host?.api?.getNode(nodeId); }, { canvasId, nodeId }, { timeout: 60000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  const library = page.locator('[data-library-view="library"]');
  if (await library.isVisible()) {
    const back = library.getByRole('button').first(); report.libraryCloseButton = await back.evaluate(node => node.outerHTML);
    await back.click(); await library.waitFor({ state: 'hidden' });
  }
  const node = page.locator('.react-flow__node[data-id="' + nodeId + '"]'); await node.waitFor();
  await page.waitForTimeout(800); before = await snapshot(); report.before = before;
  assert.equal(before.history?.ok, true); assert.deepEqual(before.node.data.lcos_ref, proof.data.lcos_ref);
  apiHandle = await page.evaluateHandle(() => window.__LCOS_NODE_LAB__.api);
  const box = await node.boundingBox(), canvas = await page.locator('.react-flow').boundingBox(); assert.ok(box && canvas);
  const start = { x: box.x + box.width * .45, y: box.y + box.height * .35 }, end = { x: start.x + 80, y: start.y - 25 };
  assert.ok(end.x + box.width * .55 < canvas.x + canvas.width - 12 && box.y - 25 > canvas.y + 64,
    'Declared mouse move must stay exposed within the current Canvas; do not pan or setPosition to repair it.');
  report.pointerReadback = await page.evaluate(({ x, y, nodeId }) => {
    const describe = node => ({ tag: node.tagName, classes: node.className, id: node.getAttribute('data-id'),
      nodeId: node.getAttribute('data-node-id'), pointerEvents: getComputedStyle(node).pointerEvents,
      rect: node.getBoundingClientRect().toJSON(), html: node.outerHTML.slice(0, 1500) });
    const front = document.elementFromPoint(x, y), outer = [...document.querySelectorAll('.react-flow__node')].find(node => node.getAttribute('data-id') === nodeId);
    return { point: { x, y }, matches: front?.closest('.react-flow__node')?.getAttribute('data-id') === nodeId,
      stack: document.elementsFromPoint(x, y).slice(0, 8).map(describe), intended: outer && describe(outer),
      inside: outer && [...outer.querySelectorAll('*')].slice(0, 18).map(describe) };
  }, { ...start, nodeId });
  if (inspectOnly) { report.scope = 'Read-only actual node and frontmost DOM hit diagnosis; no mouseDown, material move, or history action.';
    report.inspectionOnly = true; report.passed = true; await shot('readonly-node-hit-diagnosis'); }
  else {
  assert.equal(report.pointerReadback.matches, true, JSON.stringify(report.pointerReadback.stack));
  await shot('01-existing-pinned-material-before-move'); report.phase = 'move';
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.waitForTimeout(100);
  report.selectionFromActualMouseDown = (await snapshot()).selection;
  await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up();
  const movedLive = await waitFor(snapshot, state => Math.hypot(state.node.position.x - before.node.position.x, state.node.position.y - before.node.position.y) > 10,
    'Real original node drag did not move the intended material');
  const moved = await inspectPhase('move', movedLive.node.position, before.history.currentIndex + 1);
  report.phase = 'undo'; await page.keyboard.press('Control+z');
  const undone = await inspectPhase('undo', before.node.position, before.history.currentIndex);
  assert.equal(undone.history.historySize, moved.history.historySize);
  report.phase = 'redo'; await page.keyboard.press('Control+Shift+z');
  const redone = await inspectPhase('redo', moved.expectedWorld, moved.history.currentIndex);
  assert.equal(redone.history.historySize, moved.history.historySize);
  const afterGraph = await get(prefix + '/graph'), afterRuns = await get(prefix + '/runs');
  for (const key of ['artifacts', 'artifactRevisions', 'fileRecords', 'relations', 'workspaceMemberships', 'workspaceEntityMemberships', 'collections', 'collectionMemberships'])
    assert.deepEqual(afterGraph[key], graphsBefore[key], 'Geometry cannot change project content or membership: ' + key);
  assert.deepEqual(afterRuns, runsBefore);
  for (const id of otherCanvases) assert.deepEqual(await get('/api/canvas/v1/canvases/' + id), otherBefore[id]);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.routeErrors, []);
  report.after = await snapshot(); report.passed = true;
  await writeFile(path.join(output, 'after-facts.json'), JSON.stringify({ graph: afterGraph, runs: afterRuns, presentation: await get(prefix + '/presentations/' + encodeURIComponent(presentationId)) }, null, 2));
  }
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  try { report.failureLive = await snapshot(); report.failureReceipt = await get(semanticAddress); await shot('failure');
    await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
} finally {
  try { await page.mouse.up(); } catch {} await browser.close();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, output, pid: health.pid, steps: report.steps.map(step => ({ phase: step.phase,
    expectedWorld: step.expectedWorld, persisted: step.persistedPosition, index: step.history.currentIndex })), failure: report.failure }, null, 2));
}
