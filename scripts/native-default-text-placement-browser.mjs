import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

// Explicit synthetic Canvas only. Creation is through the real original menu;
// an unknown create receipt is read back, never retried or cleaned up here.
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const address = new URL(option('--base-url'));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1');
assert.equal(address.pathname, '/'); assert.ok(address.port);
const origin = address.origin, canvasId = option('--canvas-id'), expectedRuntime = option('--runtime-label');
assert.ok(['surface-core-context', 'surface-core-workflow'].includes(canvasId), 'Use an explicitly chosen synthetic Context/Workflow Canvas.');
assert.ok(expectedRuntime?.startsWith('isolated-'));
const fallback = process.argv.includes('--fallback');
const modeChange = process.argv.includes('--mode-change');
const withoutLibrary = process.argv.includes('--without-library');
const setupOriginalZoom = process.argv.includes('--setup-original-zoom');
const testIntent = option('--test-intent') ?? (fallback ? '人工新建Text验证无可见空位与原toast定位' : '人工新建Text验证默认可见落点');
const previousConfirmedNode = option('--previous-confirmed-node');
const viewportWidth = Number(option('--viewport-width') ?? (fallback ? 1000 : 1440));
assert.ok(Number.isInteger(viewportWidth) && viewportWidth >= 640 && viewportWidth <= 1920);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/原流程收口_20261017d/原加号整页验证',
  (fallback ? '无可见空位' : '普通可见落点') + '-' + canvasId, new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const get = async route => {
  const response = await fetch(origin + route, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, route); const body = await response.json();
  if ('ok' in body) { assert.equal(body.ok, true, route); return body.value; }
  assert.equal(body.code, 0, route); return body.data;
};
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.runtimeLabel, expectedRuntime); assert.equal(health.realCoreConnected, true);
const donorPage = await (await fetch(origin + '/assets/page-Da_DfwiK.js')).text();
assert.ok(donorPage.includes('LCOS original fH default Text placement'), 'The newly built transform must be loaded before a real create test.');
if (fallback) assert.ok(donorPage.includes('se({title:"新文本在当前视口外，可点定位查看。",action:'),
  'The corrected original Rt object signature must be loaded before another declared synthetic fallback create.');
const mapping = await get('/api/lcos/translation'), projectId = mapping.projectId;
const core = '/api/lcos/core/projects/' + encodeURIComponent(projectId);
const canvasRoute = '/api/canvas/v1/canvases/' + encodeURIComponent(canvasId);
const runsBefore = await get(core + '/runs');
const report = { passed: false, at: new Date().toISOString(), origin, pid: health.pid,
  runtimeLabel: health.runtimeLabel, canvasId, projectId, fallback, modeChange, withoutLibrary, viewportWidth, setupOriginalZoom, testIntent, previousConfirmedNode,
  synthetic: 'One original-menu Text only; retained with its exact node/ref recorded below. No model, direct producer, cleanup, or automatic replay.',
  creationClicks: 0, writes: [], responses: [], blockedWrites: [], externalBlocked: [], errors: [], screenshots: [], checks: [], output };
const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: viewportWidth, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin) {
    report.externalBlocked.push({ method: request.method(), path: url.origin + url.pathname }); return route.abort();
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    if (request.method() === 'POST' && url.pathname === canvasRoute + '/nodes:batchActions') {
      report.writes.push({ at: new Date().toISOString(), path: url.pathname, body: request.postDataJSON() });
    } else if (request.method() === 'POST' && url.pathname === '/api/events') {
      // Original local telemetry is not a product mutation.
    } else {
      report.blockedWrites.push({ method: request.method(), path: url.pathname }); return route.abort();
    }
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => {
  if (new URL(response.url()).pathname === canvasRoute + '/nodes:batchActions')
    report.responses.push({ at: new Date().toISOString(), status: response.status() });
});
const screenshot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
const snapshot = () => page.evaluate(() => {
  const owner = window.__LCOS_NODE_LAB__, api = owner.api;
  return { document: performance.timeOrigin, projectId: owner.projectId, canvasId: owner.currentCanvasId ?? owner.canvasId,
    viewport: api.getViewport(), nodes: api.getNodes(), selection: api.getSelection() };
});
const geometry = node => ({ id: node.id, type: node.type, position: node.position,
  width: node.measured?.width ?? node.width, height: node.measured?.height ?? node.height,
  parentId: node.parentId ?? null, data: node.data });
const oldNodesUnchanged = (before, after) => {
  for (const node of before.nodes) assert.deepEqual(geometry(after.nodes.find(row => row.id === node.id)), geometry(node), 'Old geometry/content moved: ' + node.id);
};
const closeEnoughViewport = (before, after) => {
  for (const key of ['x', 'y', 'zoom']) assert.ok(Math.abs(before[key] - after[key]) < .0001, 'Camera moved during creation: ' + key);
};
const noOverlap = (a, b) => a.x + a.width <= b.x + .2 || a.x >= b.x + b.width - .2
  || a.y + a.height <= b.y + .2 || a.y >= b.y + b.height - .2;
const measure = id => page.evaluate(id => {
  const api = window.__LCOS_NODE_LAB__.api;
  const rect = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  const element = [...document.querySelectorAll('.react-flow__node')].find(node => node.getAttribute('data-id') === id);
  return { node: api.getNodes().find(node => node.id === id), world: api.getNodesBounds([id]),
    rect: element ? rect(element) : null, canvas: rect(document.querySelector('.react-flow')),
    oldWorld: api.getNodes().filter(node => node.id !== id).map(node => ({ id: node.id, ...api.getNodesBounds([node.id]) })),
    obstacles: [...document.querySelectorAll('.canvas-header-chrome,[data-lcos-surface-dock],[data-library-view="library"],[data-lcos-native-chat-frame],[aria-label="材料预览"],[data-testid="canvas-dockbar-container"]')]
      .filter(element => element.getAttribute('aria-hidden') !== 'true' && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .map(element => ({ kind: element.getAttribute('data-testid') ?? element.getAttribute('data-library-view') ?? element.getAttribute('aria-label') ?? element.className, ...rect(element) })),
    textMode: document.querySelector(`[data-native-first-text-body="${id}"]`)?.getAttribute('data-native-first-mode') ?? null };
}, id);
const stableMeasure = async (id, allowVirtualized = false) => {
  let previous, steady = 0, last;
  for (let n = 0; n < 50; n++) {
    last = await measure(id);
    const signature = JSON.stringify({ position: last.node?.position, world: last.world, rect: last.rect });
    steady = signature === previous ? steady + 1 : 0; previous = signature;
    if ((last.rect?.width > 0 && last.rect?.height > 0 || allowVirtualized && last.world?.width > 0 && last.world?.height > 0) && steady >= 3) return last;
    await page.waitForTimeout(150);
  }
  throw new Error('Original Text bounds did not stabilize: ' + JSON.stringify(last));
};
try {
  await page.goto(origin + '/canvas/' + encodeURIComponent(canvasId), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api && (window.__LCOS_NODE_LAB__.currentCanvasId ?? window.__LCOS_NODE_LAB__.canvasId) === id, canvasId);
  if (fallback) {
    if (!withoutLibrary) {
      await page.getByTestId('canvas-dockbar-assets-btn').click();
      await page.locator('[data-library-view="library"]').waitFor({ state: 'visible' });
    }
    // The original right frame normally starts expanded. Do not invent a new
    // overlay or change camera to force this case: prove actual free width.
    await page.locator('[data-lcos-native-chat-frame]').waitFor({ state: 'visible', timeout: 15000 });
  }
  await page.waitForTimeout(1000);
  if (setupOriginalZoom) {
    const beforeZoom = await snapshot(), box = await page.locator('.react-flow').boundingBox();
    await page.mouse.move(box.x + box.width - 35, box.y + box.height - 200);
    await page.keyboard.down('Control');
    try { await page.mouse.wheel(0, -400); } finally { await page.keyboard.up('Control'); }
    await page.waitForTimeout(800);
    const afterZoom = await snapshot();
    report.explicitTestZoomSetup = { input: 'Real original Canvas Control+wheel(-400), before creation baseline; never API setViewport.', before: beforeZoom.viewport, after: afterZoom.viewport };
    assert.ok(afterZoom.viewport.zoom > beforeZoom.viewport.zoom, 'Actual original user zoom gesture must take effect.');
  }
  const before = await snapshot(), beforePersisted = await get(canvasRoute);
  const beforeGraph = await get(core + '/graph');
  report.before = before; report.beforePersisted = beforePersisted;
  if (previousConfirmedNode) {
    const old = beforePersisted.nodes.find(node => node.id === previousConfirmedNode);
    assert.ok(old?.data?.lcos_ref?.artifactId, 'The prior successful synthetic create must remain; the new test is not its retry.');
  }
  if (fallback && withoutLibrary) {
    report.noVisibleSlotBeforeCreate = await page.locator('.react-flow').evaluate((element, zoom) => {
      const b = element.getBoundingClientRect(); return { width: b.width, height: b.height, zoom,
        plannedWidth: 360 * zoom, plannedHeight: 280 * zoom,
        wholeCanvasTooSmall: b.width < 360 * zoom || b.height < 280 * zoom };
    }, before.viewport.zoom);
    assert.equal(report.noVisibleSlotBeforeCreate.wholeCanvasTooSmall, true, 'Measure a genuinely insufficient original Canvas before the one create click. Do not force hidden original buttons.');
  }
  const apiHandle = await page.evaluateHandle(() => window.__LCOS_NODE_LAB__.api);
  await page.getByTestId('canvas-dockbar-add-node-btn').click();
  await page.getByTestId('canvas-dockbar-add-text-node-btn').waitFor({ state: 'visible' });
  await screenshot('01-original-add-before-create');
  await writeFile(path.join(output, 'test-intent.json'), JSON.stringify({ at: new Date().toISOString(), testIntent,
    kind: 'new explicitly synthetic original-menu create test, never retry of a previous confirmed or unknown operation',
    intendedOriginalCreateClicks: 1, previousConfirmedNode: previousConfirmedNode ?? null,
    canvasId, projectId, originalViewportBeforeCreate: before.viewport, priorNodeIds: before.nodes.map(node => node.id) }, null, 2));
  report.creationClicks++; await page.getByTestId('canvas-dockbar-add-text-node-btn').click();
  const beforeIds = before.nodes.map(node => node.id);
  await page.waitForFunction(ids => window.__LCOS_NODE_LAB__.api.getNodes().some(node => !ids.includes(node.id) && node.type === 'text'), beforeIds, { timeout: 30000 });
  const after = await snapshot(), added = after.nodes.filter(node => !beforeIds.includes(node.id));
  assert.equal(added.length, 1); report.nodeId = added[0].id;
  await writeFile(path.join(output, 'created-node-intent.json'), JSON.stringify({ synthetic: true, nodeId: report.nodeId,
    creationClicks: report.creationClicks, note: 'Do not create another node if later receipt checks fail; read this same ID.' }, null, 2));
  report.freshStable = await stableMeasure(report.nodeId, fallback);
  const settled = await snapshot(); report.after = settled;
  assert.equal(await page.evaluate(api => api === window.__LCOS_NODE_LAB__.api, apiHandle), true);
  assert.equal(before.document, settled.document); closeEnoughViewport(before.viewport, settled.viewport); oldNodesUnchanged(before, settled);
  for (const box of report.freshStable.oldWorld) assert.ok(noOverlap(report.freshStable.world, box), 'Fresh actual node overlaps old carrier: ' + box.id);
  const outsideToast = page.locator('[data-sonner-toast]').filter({ hasText: '新文本在当前视口外，可点定位查看。' });
  report.outsideToast = await outsideToast.isVisible();
  if (fallback) assert.equal(report.outsideToast, true, 'A real no-visible-slot case must use the original fallback/toast.');
  if (!report.outsideToast) {
    const rect = report.freshStable.rect, canvas = report.freshStable.canvas;
    assert.ok(rect.x >= canvas.x - 1 && rect.y >= canvas.y - 1 && rect.x + rect.width <= canvas.x + canvas.width + 1 && rect.y + rect.height <= canvas.y + canvas.height + 1);
    for (const box of report.freshStable.obstacles.filter(box => box.width > 0 && box.height > 0))
      assert.ok(noOverlap(rect, box), 'Fresh visible node overlaps native chrome: ' + box.kind);
  }
  report.checks.push('Original Add → Text exactly once; stable fresh actual bounds do not overlap; same document/API/camera; old geometry/content unchanged (original Ke selection policy retained).');
  await screenshot('02-fresh-text-stable');
  if (report.outsideToast) {
    // Do not wait for Core's network receipt until the original short-lived
    // toast expires. Locate is independently bound to this native publication;
    // persisted Core identity is still required below before success.
    await outsideToast.getByRole('button', { name: '定位', exact: true }).click();
    await page.waitForFunction(id => {
      const e = [...document.querySelectorAll('.react-flow__node')].find(e => e.getAttribute('data-id') === id);
      if (!e) return false; const b = e.getBoundingClientRect(), c = document.querySelector('.react-flow').getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.x >= c.x - 1 && b.y >= c.y - 1 && b.right <= c.right + 1 && b.bottom <= c.bottom + 1;
    }, report.nodeId, { timeout: 15000 });
    report.afterExplicitLocate = await snapshot(); oldNodesUnchanged(before, report.afterExplicitLocate);
    report.locatedFreshStable = await stableMeasure(report.nodeId);
    for (const box of report.locatedFreshStable.obstacles.filter(box => box.width > 0 && box.height > 0))
      assert.ok(noOverlap(report.locatedFreshStable.rect, box), 'Located Text remains obscured by native chrome: ' + box.kind);
    report.checks.push('No automatic camera move; explicit original toast locate waits same published node and reveals it. Offscreen virtualization, if any, is measured only after locate.');
    await screenshot('03-explicit-original-toast-locate');
  }
  let persisted;
  for (let n = 0; n < 80; n++) {
    persisted = await get(canvasRoute);
    const row = persisted.nodes.find(node => node.id === report.nodeId);
    if (row?.data?.lcos_ref?.entityType === 'artifact') break;
    await page.waitForTimeout(200);
  }
  const confirmed = persisted.nodes.find(node => node.id === report.nodeId);
  assert.ok(confirmed?.data?.lcos_ref?.artifactId && confirmed.data.lcos_ref.revisionId, 'Original create must be confirmed by real Core identity. No retry on unknown.');
  report.persisted = confirmed;
  if (modeChange) {
    const body = page.locator(`[data-native-first-text-body="${report.nodeId}"]`);
    await body.waitFor({ state: 'visible' }); await body.click({ position: { x: 35, y: 45 } });
    const button = page.getByRole('button', { name: '导图', exact: true }); await button.waitFor({ state: 'visible' });
    await button.click();
    await page.waitForFunction(id => document.querySelector(`[data-native-first-text-body="${id}"]`)?.getAttribute('data-native-first-mode') === 'mindmap', report.nodeId);
    report.separateModeChange = await stableMeasure(report.nodeId);
    report.separateModeChange.overlaps = report.separateModeChange.oldWorld.filter(box => !noOverlap(report.separateModeChange.world, box)).map(box => box.id);
    report.checks.push('Mode change measured separately; initial placement is not a promise about arbitrary future body growth, mode sizing, or user resize.');
    await screenshot('04-separate-mode-size-boundary');
  }
  await page.reload();
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api?.getNodes().some(node => node.id === id), report.nodeId);
  const reloaded = await get(canvasRoute), exact = reloaded.nodes.filter(node => node.id === report.nodeId);
  assert.equal(exact.length, 1); assert.equal(exact[0].data.lcos_ref.artifactId, confirmed.data.lcos_ref.artifactId);
  assert.equal(exact[0].data.lcos_ref.artifactViewId, confirmed.data.lcos_ref.artifactViewId);
  report.reloaded = exact[0];
  for (const row of beforePersisted.nodes) assert.deepEqual(geometry(reloaded.nodes.find(node => node.id === row.id)), geometry(row), 'Persisted old carrier changed: ' + row.id);
  const afterGraph = await get(core + '/graph');
  report.graphCounts = Object.fromEntries(['artifacts', 'artifactRevisions', 'fileRecords'].map(key => [key, { before: beforeGraph[key].length, after: afterGraph[key].length }]));
  assert.equal(afterGraph.artifacts.length, beforeGraph.artifacts.length + 1, 'Exactly one primary Text Artifact; no duplicate or hidden retry artifact.');
  assert.equal(afterGraph.artifactRevisions.length, beforeGraph.artifactRevisions.length + 1, 'Mode presentation must not create another body Revision.');
  const bindings = await get(core + '/spatial/bindings');
  report.bindings = bindings.filter(binding => binding.canvasId === canvasId && binding.spatialId === report.nodeId);
  assert.equal(report.bindings.length, 1); assert.equal(report.bindings[0].projectId, projectId);
  assert.equal(report.bindings[0].entityId, confirmed.data.lcos_ref.entityId);
  assert.deepEqual(await get(core + '/runs'), runsBefore); assert.deepEqual(report.errors, []);
  report.checks.push('Refresh keeps the single same Core material/View/node; old persisted geometry/content unchanged; no model Run. Synthetic node retained.');
  await screenshot('05-refresh-exact-synthetic-node'); report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  report.dom = await page.locator('body').innerText().catch(() => '');
  await screenshot('failure').catch(() => {});
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify({ passed: report.passed, output, nodeId: report.nodeId, failure: report.failure }));
}
