import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const argument = process.argv.find(value => value.startsWith('--base-url='));
assert.ok(argument, 'Use --base-url=http://127.0.0.1:<isolated-port> after the coordinated product build.');
const address = new URL(argument.slice('--base-url='.length));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.pathname, '/');
const origin = address.origin;
const loseFirstResponse = process.argv.includes('--lose-first-placement-response');
const prepareText = process.argv.includes('--prepare-synthetic-text');
const targetCanvasId = process.argv.find(value => value.startsWith('--target-canvas='))?.slice('--target-canvas='.length);
const viewportWidth = Number(process.argv.find(value => value.startsWith('--viewport-width='))?.slice('--viewport-width='.length) ?? 1440);
assert.ok(Number.isInteger(viewportWidth) && viewportWidth >= 1000 && viewportWidth <= 1920);
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected && health.nativeAssemblyPilot);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(workspaceRoot, 'output', '原流程融合_20261017c', 'Library准确投放实测',
  (loseFirstResponse ? '丢回包恢复' : '正常投放') + (targetCanvasId ? '-' + targetCanvasId.replace(/[^a-zA-Z0-9_-]/g, '_') : ''),
  new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), origin, pid: health.pid, runtimeLabel: health.runtimeLabel, output,
  browser: 'Browser plugin not available; existing Playwright Core + Chrome', viewport: { width: viewportWidth, height: 1000 },
  fixture: 'Artificial isolated Core material; product placement exclusively by the original Library button', fixtureWrites: [],
  checks: [], placementPosts: [], blockedModelWrites: [], pageErrors: [], externalBlocked: [], screenshots: [],
  loseFirstResponse, responseWithheld: false, passed: false };
const get = async pathname => {
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' });
  assert.equal(response.status, 200, pathname);
  const body = await response.json();
  if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
let source, sourceWorkspace, prepared;
if (prepareText) {
  const mapping = await get('/api/lcos/translation');
  assert.equal(typeof mapping.projectId, 'string');
  const prefix = `/api/lcos/core/projects/${encodeURIComponent(mapping.projectId)}`;
  const [graph, sites] = await Promise.all([get(prefix + '/graph'), get(prefix + '/workspaces')]);
  const roots = graph.scopes.filter(scope => scope.kind === 'root' && scope.projectId === mapping.projectId);
  assert.equal(roots.length, 1);
  const sources = sites.filter(site => site.projectId === mapping.projectId && site.scopeId === roots[0].id && site.preferredSurface === 'main' && site.canvasId);
  assert.equal(sources.length, 1); sourceWorkspace = sources[0];
  const purpose = loseFirstResponse ? '人工完整落点与回包核对验证' : '人工完整矩形落点与幂等验证';
  const title = purpose + ' ' + new Date().toISOString();
  const route = prefix + '/text-artifacts';
  const body = { title, body: purpose + '：人工合成材料，仅用于本地原库投放验证；不得发送模型或改写已有材料。\n完整正文应从真实 Revision 读取。',
    scopeId: sourceWorkspace.scopeId, workspaceId: sourceWorkspace.id };
  const intent = { at: new Date().toISOString(), route, body, result: 'request not yet confirmed' };
  await writeFile(path.join(output, 'fixture-intent.json'), JSON.stringify(intent, null, 2));
  let response, envelope;
  try {
    response = await fetch(origin + route, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    envelope = await response.json();
  } catch (error) {
    report.failure = 'Synthetic text fixture response unknown; no request was repeated: ' + String(error);
    report.fixtureUnknown = intent;
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    throw error;
  }
  assert.equal(response.status, 201, JSON.stringify(envelope)); assert.equal(envelope.ok, true);
  prepared = envelope.value;
  assert.ok(prepared.artifactId && prepared.revisionId && prepared.viewId);
  report.fixtureWrites.push({ route, producer: 'existing Core createTextArtifact', ...prepared, title });
  await writeFile(path.join(output, 'fixture.json'), JSON.stringify(report.fixtureWrites, null, 2));
  source = await get('/api/library/v1/assets:search?type_filter=4&page_size=100&keyword=' + encodeURIComponent(title));
} else source = await get('/api/library/v1/assets:search?type_filter=1&page_size=100');
const assets = source.items.map(row => row.asset).filter(asset => asset.lcos_projection?.referenceable && [1, 4].includes(asset.asset_type)
  && (!prepared || asset.lcos_projection.artifact_id === prepared.artifactId && asset.lcos_projection.presented_revision_id === prepared.revisionId));
assert.ok(assets.length, 'Needs a real readable synthetic image/text and exact Core identity, never an invented URL import.');
const asset = assets[0], projection = asset.lcos_projection;
const project = `/api/lcos/core/projects/${encodeURIComponent(projection.project_id)}`;
const workspaces = await get(project + '/workspaces');
const options = [];
for (const workspace of workspaces.filter(workspace => workspace.canvasId)) {
  const canvas = await get('/api/canvas/v1/canvases/' + encodeURIComponent(workspace.canvasId));
  const exact = canvas.nodes.filter(node => node.data?.lcos_ref?.artifactId === projection.artifact_id
    && node.data.lcos_ref.revisionId === projection.presented_revision_id);
  options.push({ workspace, exactCount: exact.length });
}
const target = targetCanvasId ? options.find(option => option.workspace.canvasId === targetCanvasId)
  : options.find(option => option.exactCount === 0 && option.workspace.id !== sourceWorkspace?.id)
  ?? options.find(option => option.exactCount === 0) ?? options[0];
assert.ok(target);
if (loseFirstResponse) assert.equal(target.exactCount, 0, 'Response-loss test needs an existing material not yet placed on one synthetic Canvas.');
const runsBefore = await get(project + '/runs');
const graphBefore = await get(project + '/graph');
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: report.viewport, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    report.externalBlocked.push(url.origin + url.pathname); return route.abort();
  }
  if (request.method() !== 'GET' && /\/(runs|turns|messages|generations)(?:\/|$|:)/.test(url.pathname)) {
    report.blockedModelWrites.push(url.pathname); return route.abort();
  }
  if (request.method() === 'POST' && url.pathname.endsWith('/materials:place')) {
    report.placementPosts.push({ path: url.pathname, body: request.postDataJSON() });
    if (loseFirstResponse && !report.responseWithheld) {
      const response = await route.fetch({ maxRedirects: 0 });
      report.withheldResponseStatus = response.status();
      if (response.status() === 200) {
        report.responseWithheld = true;
        return route.abort('failed'); // Core committed; the browser receives no success receipt.
      }
      return route.fulfill({ response });
    }
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
const shot = async name => { const filename = path.join(output, `${name}.png`); await page.screenshot({ path: filename }); report.screenshots.push(filename); };
const snapshot = () => page.evaluate(() => {
  const api = window.__LCOS_NODE_LAB__?.api;
  return { document: performance.timeOrigin, viewport: api.getViewport(), selection: api.getSelection(),
    nodes: api.getNodes(), draft: document.querySelector('textarea[data-lcos-composer-input]')?.value };
});
try {
  await page.goto(origin + '/canvas/' + encodeURIComponent(target.workspace.canvasId), { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow').waitFor({ timeout: 60000 });
  await page.waitForFunction(canvasId => {
    const host = window.__LCOS_NODE_LAB__; return (host?.currentCanvasId ?? host?.canvasId) === canvasId && !!host?.api;
  }, target.workspace.canvasId);
  const editor = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
  await editor.waitFor({ state: 'visible', timeout: 60000 });
  await editor.fill('库投放联调草稿 · 未发送。');
  await page.getByTestId('canvas-dockbar-assets-btn').click();
  const library = page.locator('[data-library-view="library"]');
  await library.getByRole('textbox', { name: '搜索', exact: true }).fill(asset.name);
  await library.getByRole('button', { name: asset.name, exact: true }).click();
  await page.locator('[aria-label="材料预览"][data-native-assembly-state="ready"]').waitFor({ timeout: 30000 });
  const place = page.getByRole('button', { name: '放到画布', exact: true });
  assert.equal(await place.isEnabled(), true, 'Ordinary Library browsing has the real native Apply primary action.');
  const before = await snapshot(), apiHandle = await page.evaluateHandle(() => window.__LCOS_NODE_LAB__.api);
  await shot('01-before-place');
  await place.click();
  if (loseFirstResponse) {
    const verify = page.getByRole('button', { name: '核对放置结果', exact: true });
    await verify.waitFor({ timeout: 60000 });
    assert.equal(report.responseWithheld, true); assert.equal(report.placementPosts.length, 1);
    assert.equal(await place.isEnabled(), false);
    await shot('02-unconfirmed-no-replay');
    await verify.click();
    await page.getByText(/^(这个版本已在画布上。|已放在画布空白处，点「定位」查看。)$/).waitFor({ timeout: 60000 });
    assert.equal(report.placementPosts.length, 1, 'Read-only recovery cannot resubmit the committed mutation.');
    report.checks.push('real successful POST response withheld → honest unconfirmed UI → original read-only recovery, exactly one POST');
  }
  await page.getByText(/^(已放到画布。|这个版本已在画布上。|已放在画布空白处，点「定位」查看。)$/).waitFor({ timeout: 60000 });
  const after = await snapshot();
  const exactNodes = after.nodes.filter(node => node.data?.lcos_ref?.artifactId === projection.artifact_id
    && node.data.lcos_ref.revisionId === projection.presented_revision_id);
  assert.equal(exactNodes.length, 1);
  assert.equal(await page.evaluate(api => api === window.__LCOS_NODE_LAB__.api, apiHandle), true);
  assert.equal(after.document, before.document); assert.deepEqual(after.viewport, before.viewport);
  assert.deepEqual(after.selection, before.selection); assert.equal(after.draft, before.draft);
  for (const node of before.nodes) assert.deepEqual(after.nodes.find(current => current.id === node.id), node, 'Existing native nodes and unsaved fields stay intact.');
  report.checks.push('native Library → exact material producer → original O8 → same document/API/camera/selection/draft/existing nodes');
  report.nodeId = exactNodes[0].id; report.initialExactCount = target.exactCount;
  if (target.exactCount === 0) {
    report.landing = await page.evaluate(id => {
      const shape = element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }; };
      const api = window.__LCOS_NODE_LAB__.api, world = api.getNodesBounds([id]), viewport = api.getViewport();
      const origin = api.flowToScreenPosition({ x: world.x, y: world.y });
      const node = [...document.querySelectorAll('.react-flow__node')].find(element => element.getAttribute('data-id') === id);
      return { node: node ? shape(node) : { left: origin.x, top: origin.y, right: origin.x + world.width * viewport.zoom,
          bottom: origin.y + world.height * viewport.zoom, width: world.width * viewport.zoom, height: world.height * viewport.zoom },
        world, worldBlockers: api.getNodes().filter(node => node.id !== id).map(node => ({ id: node.id, ...api.getNodesBounds([node.id]) })),
        canvas: shape(document.querySelector('.react-flow')),
        blockers: [...document.querySelectorAll('[data-library-view="library"], [data-lcos-native-chat-frame], [aria-label="材料预览"], [data-lcos-surface-dock], .react-flow__node')]
          .filter(element => element !== node).map(element => ({ kind: element.getAttribute('data-id') ?? element.getAttribute('aria-label') ?? element.getAttribute('data-library-view') ?? element.tagName, ...shape(element) })) };
    }, report.nodeId);
    const { node, canvas, blockers } = report.landing;
    for (const old of report.landing.worldBlockers) { const next = report.landing.world;
      assert.ok(next.x + next.width <= old.x + .1 || next.x >= old.x + old.width - .1 || next.y + next.height <= old.y + .1 || next.y >= old.y + old.height - .1,
        'Actual original world bounds never overlap an existing carrier: ' + old.id);
    }
    report.usedOutsideFallback = await page.getByText('已放在画布空白处，点「定位」查看。', { exact: true }).isVisible();
    if (!report.usedOutsideFallback) {
      assert.ok(node.left >= canvas.left && node.right <= canvas.right && node.top >= canvas.top && node.bottom <= canvas.bottom, 'The whole new carrier fits in the visible Canvas.');
      for (const box of blockers.filter(box => box.width > 0 && box.height > 0)) assert.ok(
        node.right <= box.left + 1 || node.left >= box.right - 1 || node.bottom <= box.top + 1 || node.top >= box.bottom - 1,
        'Visible placement clears original rails, preview, dock and existing node: ' + box.kind);
    }
    report.checks.push('actual original bounds never overlap existing carriers; visible free slot or honest original empty-space fallback, camera unchanged');
  }
  await shot('03-exact-node-published');
  await place.click();
  await page.getByText(/^(这个版本已在画布上。|已放在画布空白处，点「定位」查看。)$/).waitFor({ timeout: 60000 });
  const repeated = await snapshot();
  assert.equal(repeated.nodes.filter(node => node.id === report.nodeId).length, 1);
  assert.equal(repeated.nodes.length, after.nodes.length);
  report.checks.push('explicit repeated native button is idempotent; no duplicate material node');
  await page.getByRole('button', { name: '定位准确版本', exact: true }).click();
  await page.waitForFunction(id => {
    const node = [...document.querySelectorAll('.react-flow__node')].find(node => node.getAttribute('data-id') === id);
    if (!node) return false;
    const box = node.getBoundingClientRect(), canvas = document.querySelector('.react-flow').getBoundingClientRect();
    let left = canvas.left, right = canvas.right;
    for (const element of document.querySelectorAll('[data-library-view="library"], [data-lcos-native-chat-frame]')) {
      const rail = element.getBoundingClientRect();
      if (rail.left <= canvas.left + 24) left = Math.max(left, rail.right);
      if (rail.right >= canvas.right - 24 && rail.left > left) right = Math.min(right, rail.left);
    }
    return box.width > 0 && box.height > 0 && box.left >= left - 1 && box.right <= right + 1 && box.top >= canvas.top - 1 && box.bottom <= canvas.bottom + 1;
  }, report.nodeId, { timeout: 15000 });
  assert.equal(await editor.inputValue(), before.draft);
  report.checks.push('existing locate action reveals the exact newly placed View between both rails, same draft retained');
  await shot('03b-exact-new-view-located');
  await page.reload(); await page.locator('.react-flow').waitFor({ timeout: 60000 });
  await page.waitForFunction(nodeId => window.__LCOS_NODE_LAB__?.api?.getNodes().some(node => node.id === nodeId), report.nodeId);
  const bindings = await get(project + '/spatial/bindings');
  const exactBindings = bindings.filter(binding => binding.canvasId === target.workspace.canvasId && binding.spatialId === report.nodeId);
  assert.equal(exactBindings.length, 1);
  report.binding = exactBindings[0];
  await shot('04-refresh-persisted');
  assert.deepEqual(await get(project + '/runs'), runsBefore);
  const graphAfter = await get(project + '/graph');
  assert.deepEqual(graphAfter.artifacts, graphBefore.artifacts); assert.deepEqual(graphAfter.artifactRevisions, graphBefore.artifactRevisions);
  assert.deepEqual(graphAfter.fileRecords, graphBefore.fileRecords);
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedModelWrites, []);
  report.checks.push('refresh keeps exact binding; no new Artifact/Revision/FileRecord/Run; no uncaught page errors');
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  try { await shot('failure'); await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
} finally {
  await browser.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
