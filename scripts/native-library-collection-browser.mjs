import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Full original App, original mouse and original Library. The sole optional
// fixture is a canonical Collection of already-existing synthetic materials.
// No carrier/bootstrap, browser state setter or synthetic drag is supplied.
const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(arg('base-url'), 'Specify the coordinated isolated candidate URL.');
const address = new URL(arg('base-url'));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1');
assert.equal(address.pathname, '/'); assert.equal(address.username, ''); assert.equal(address.password, '');
const origin = address.origin, canvasId = arg('canvas-id') ?? 'surface-core-main';
const commit = process.argv.includes('--commit'), loseReply = process.argv.includes('--lose-project-reply');
const existingOnly = process.argv.includes('--existing-only');
const closePendingLibrary = process.argv.includes('--close-pending-library');
const unprojectedMember = process.argv.includes('--unprojected-member');
assert.ok(!unprojectedMember || commit && !existingOnly && !arg('collection-id'), 'Unprojected case creates only one declared canonical Collection from an existing readable text Artifact.');
assert.ok(!closePendingLibrary || commit && loseReply && !existingOnly, 'Close/reopen case holds exactly one real first-placement request and discards its reply.');
assert.ok(!loseReply || commit); assert.ok(commit || arg('collection-id'), 'Read-only run needs an existing Collection.');
assert.ok(!existingOnly || commit && arg('collection-id') && !loseReply, 'Existing-only validation never creates a Collection or invokes its producer.');
const output = path.resolve(import.meta.dirname, unprojectedMember ? '../output/原生ColorPin整合_20261017h/未投影成员原阅读'
  : closePendingLibrary ? '../output/原生ColorPin整合_20261017h/原库关开真实页面'
  : '../output/原生库集合整合_20261017g/原库真实页面', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), origin, canvasId, commit, loseReply, existingOnly, closePendingLibrary, unprojectedMember, output,
  scope: 'Original Library category/search/Zp row/TS Popover → real Collection receive/projection → original native pile/Gallery and reload',
  fixtureWrites: [], writes: [], startupWrites: [], blockedWrites: [], externalBlocked: [], projectPosts: [], projectionGets: [], measurements: [],
  pageErrors: [], consoleErrors: [], routeErrors: [], screenshots: [], checks: [], passed: false, models: 0, storeInjection: false,
  browser: 'Browser plugin not available; existing Playwright Core and installed Chrome', fileReads: [] };
const request = async (pathname, init) => {
  const r = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store', ...init });
  const body = await r.json(); assert.ok(r.ok, pathname + ': ' + JSON.stringify(body));
  if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const healthResponse = await fetch(origin + '/health'); const health = await healthResponse.json();
assert.ok(health.realCoreConnected && health.nativeCollectionPilot && health.nativeAssemblyPilot && health.runtimeLabel?.startsWith('isolated-'));
report.health = health;
const projectId = 'disposable-surface-core-facade', project = `/api/lcos/core/projects/${projectId}`;
const canvasPath = `/api/canvas/v1/canvases/${canvasId}`;
const facts = async () => ({ graph: await request(project + '/graph'), runs: await request(project + '/runs'),
  presentations: await request(project + '/presentations'), bindings: await request(project + '/spatial/bindings'),
  canvases: Object.fromEntries(await Promise.all(['main', 'context', 'workflow'].map(async kind => {
    const id = `surface-core-${kind}`; return [id, await request('/api/canvas/v1/canvases/' + id)];
  }))) });
let collectionId = arg('collection-id'), collection, before, browser, page, carrier, unprojectedSource;
let releaseProject;
const projectHold = closePendingLibrary ? new Promise(resolve => { releaseProject = resolve; }) : Promise.resolve();
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
try {
  const initial = await facts(); await writeFile(path.join(output, 'before-fixture-facts.json'), JSON.stringify(initial, null, 2));
  if (!collectionId) {
    assert.ok(commit);
    const refs = initial.canvases[canvasId]?.nodes.filter(node => ['image', 'text'].includes(node.type) && node.data?.lcos_ref?.artifactId)
      .map(node => node.data.lcos_ref.artifactId);
    let ids = [...new Set(refs ?? [])].slice(0, 2);
    if (unprojectedMember) {
      const projected = new Set(Object.values(initial.canvases).flatMap(canvas => canvas.nodes.map(node => node.data?.lcos_ref?.artifactId).filter(Boolean)));
      const artifact = initial.graph.artifacts.find(artifact => {
        const revision = initial.graph.artifactRevisions.find(row => row.artifactId === artifact.id && row.id === artifact.currentRevisionId);
        const file = initial.graph.fileRecords.find(row => row.id === revision?.fileRecordId);
        return !projected.has(artifact.id) && !artifact.archivedAt && revision?.status !== 'draft' && file?.availability === 'current'
          && ['text/plain', 'text/markdown'].includes(file.mimeType);
      });
      assert.ok(artifact, 'Need a real existing readable Artifact with no Canvas occurrence; never fabricate one.');
      const revision = initial.graph.artifactRevisions.find(row => row.id === artifact.currentRevisionId);
      unprojectedSource = { artifactId: artifact.id, revisionId: revision.id, fileRecordId: revision.fileRecordId };
      report.unprojectedSource = unprojectedSource; ids = [artifact.id];
    } else assert.equal(ids.length, 2, 'Use existing synthetic materials, no file import.');
    collection = await request(project + '/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '原库首次集合 · ' + new Date().toISOString(), members: ids.map(id => ({ type: 'artifact', id })) }) });
    collectionId = collection.id; report.fixtureWrites.push({ producer: 'Canonical Collections API', collectionId, members: ids,
      note: 'Only Collection created manually; no Presentation membership, binding, Canvas node, file, Run or model created.' });
  } else collection = initial.graph.collections.find(row => row.id === collectionId);
  assert.ok(collection?.id === collectionId); report.collection = collection;
  const projectionPath = `/api/lcos/canvases/${canvasId}/collections/${encodeURIComponent(collectionId)}/projection`;
  const producerPath = `/api/lcos/canvases/${canvasId}/collections:project`;
  before = await facts(); await writeFile(path.join(output, 'before-business-facts.json'), JSON.stringify(before, null, 2));
  report.beforeProjection = await request(projectionPath);
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    try {
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
      if (unprojectedSource && req.method() === 'GET' && url.pathname.includes('/file-records/') && url.pathname.endsWith('/content')) {
        const response = await route.fetch({ maxRedirects: 0 });
        report.fileReads.push({ path: url.pathname, status: response.status(), body: (await response.body()).toString('utf8') });
        return route.fulfill({ response });
      }
      if (url.pathname === projectionPath && req.method() === 'GET') {
        const r = await route.fetch({ maxRedirects: 0 }); report.projectionGets.push({ at: Date.now(), status: r.status(), body: await r.json() });
        return route.fulfill({ response: r });
      }
      if (req.method() === 'POST' && url.pathname === producerPath && commit && !existingOnly) {
        const body = req.postDataJSON(); assert.equal(body.collectionId, collectionId);
        assert.ok(Object.keys(body).every(key => ['collectionId', 'position'].includes(key)));
        const record = { at: Date.now(), body }; report.projectPosts.push(record);
        if (closePendingLibrary && report.projectPosts.length === 1) await projectHold;
        const r = await route.fetch({ maxRedirects: 0 }); record.status = r.status(); record.response = await r.json();
        if (r.ok() && record.response?.data?.node) carrier = record.response.data.node;
        if (loseReply && !report.withheld && r.ok()) { report.withheld = true; return route.abort('failed'); }
        return route.fulfill({ response: r });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
        const write = { method: req.method(), path: url.pathname, body: req.postData() }; report.writes.push(write);
        // These are the real offline host's existing diagnostic recorder and
        // idempotent execution projection refresh, never a model/Run send.
        // Keep the normal App startup; compare all Core/Canvas facts below.
        if (req.method() === 'POST' && (url.pathname === '/api/events'
          || url.pathname === `/api/lcos/canvases/${canvasId}/execution:reconcile` && req.postData() === '{}')) {
          const r = await route.fetch({ maxRedirects: 0 });
          report.startupWrites.push({ ...write, status: r.status() }); return route.fulfill({ response: r });
        }
        // The original renderer may persist its measured size. Admit only
        // updates to the one exact producer-returned collection carrier.
        if (commit && carrier && req.method() === 'POST' && url.pathname === canvasPath + '/nodes:batchActions') {
          const packet = req.postDataJSON();
          if (packet.canvas_id === canvasId && Array.isArray(packet.actions) && packet.actions.length && packet.actions.every(action =>
            action.action === 'update' && Array.isArray(action.updates) && action.updates.length && action.updates.every(update =>
              update.id === carrier.id && Object.keys(update).every(key => ['id', 'type', 'data', 'position', 'measured', 'width', 'height', 'parent_id'].includes(key))
              && (!update.data || update.data.lcos_collection_ref?.collectionId === collectionId)))) {
            const r = await route.fetch({ maxRedirects: 0 }); report.measurements.push({ ...write, status: r.status(), response: await r.json() });
            return route.fulfill({ response: r });
          }
        }
        report.blockedWrites.push(write); return route.abort();
      }
      return route.continue();
    } catch (error) { report.routeErrors.push({ path: url.pathname, error: String(error.stack ?? error) }); try { await route.abort('failed'); } catch {} }
  });
  await context.routeWebSocket('**/*', socket => { report.externalBlocked.push('WebSocket:' + socket.url()); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  const ready = async () => {
    await page.locator('.react-flow').waitFor({ timeout: 60000 });
    await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId ?? window.__LCOS_NODE_LAB__?.canvasId) === id
      && !!window.__LCOS_NODE_LAB__?.api, canvasId, { timeout: 60000 });
  };
  const openEntry = async () => {
    await page.getByTestId('canvas-dockbar-assets-btn').click();
    const library = page.locator('[data-library-view="library"]');
    await library.getByRole('textbox', { name: '搜索', exact: true }).fill(collection.title);
    const button = library.getByRole('button', { name: collection.title, exact: true }); await button.waitFor();
    const originalRow = button.locator('xpath=ancestor::div[@draggable][1]');
    assert.equal(await originalRow.count(), 1, 'Actual original Zp row must own selection.');
    assert.equal(await originalRow.getAttribute('draggable'), 'false', 'A Collection must not impersonate the stock Artifact URL drag.');
    await button.click();
    await page.locator('[data-native-library-collection-preview]').waitFor(); return library;
  };
  const closeLibrary = async library => {
    await page.keyboard.press('Escape');
    const back = library.locator('button').filter({ has: page.locator('svg.tabler-icon-chevron-left') });
    assert.equal(await back.count(), 1, 'Close using the original Library header back action.');
    await back.click(); await library.waitFor({ state: 'hidden' });
  };
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' }); await ready();
  report.pageIdentity = { url: page.url(), title: await page.title() };
  assert.equal(new URL(page.url()).pathname, '/canvas/' + canvasId);
  assert.equal(await page.locator('vite-error-overlay, [data-nextjs-error-overlay], [data-webpack-error-overlay]').count(), 0);
  const library = await openEntry(); await shot('01-original-library-collection-entry');
  report.entryDom = await library.evaluate(element => element.outerHTML);
  assert.equal(await page.locator('[data-lcos-window-body="assembly"]').count(), 0, 'No old Assembly window for ordinary Library browsing.');
  if (!commit) {
    assert.deepEqual(await facts(), before); report.checks.push('Original Library Collection row and native preview reachable; all business writes blocked.');
  } else {
    if (!existingOnly) await page.getByRole('button', { name: '放到画布', exact: true }).click();
    else assert.equal(report.beforeProjection.state, 'present', 'No bootstrap in existing-only validation.');
    if (closePendingLibrary) {
      for (let tries = 0; report.projectPosts.length === 0 && tries < 100; tries++) await page.waitForTimeout(50);
      assert.equal(report.projectPosts.length, 1);
      assert.equal((await request(projectionPath)).state, 'absent', 'Held request has not reached the real producer.');
      await closeLibrary(library); await openEntry();
      const pendingCheck = page.getByRole('button', { name: '核对放置结果', exact: true }); await pendingCheck.waitFor();
      assert.equal(await pendingCheck.isDisabled(), true, 'Original Library close/reopen retains the pending attempt.');
      assert.equal(await page.getByRole('button', { name: '放到画布', exact: true }).count(), 0);
      await shot('02a-reopened-original-library-retains-pending');
      assert.equal(report.projectPosts.length, 1); releaseProject();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '核对放置结果' && !button.disabled));
      await closeLibrary(library); await openEntry();
      await pendingCheck.waitFor(); assert.equal(await pendingCheck.isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: '放到画布', exact: true }).count(), 0);
      report.checks.push('Original Library pending close/reopen retains its synchronous reservation; lost reply after old preview unmount retains GET-only recovery through another full Library close/reopen.');
    }
    if (loseReply) {
      const verify = page.getByRole('button', { name: '核对放置结果', exact: true }); await verify.waitFor();
      await shot('02-original-preview-unknown-result');
      await page.waitForTimeout(10000); assert.equal(report.projectPosts.length, 1, 'Unknown reply must not cause a second producer request.');
      const count = report.projectionGets.length; await verify.click();
      await page.getByRole('button', { name: '定位到画布', exact: true }).waitFor();
      assert.ok(report.projectionGets.length > count, 'Explicit recovery reads the actual original carrier.');
      assert.equal(report.projectPosts.length, 1); report.checks.push('Actual successful producer response discarded; original Popover recovery is GET-only.');
    }
    await page.getByRole('button', { name: '定位到画布', exact: true }).waitFor();
    report.afterProjection = await request(projectionPath);
    assert.equal(report.afterProjection.state, 'present'); carrier = report.afterProjection.node;
    assert.equal(carrier.type, 'pile'); assert.equal(carrier.data.lcos_collection_ref.collectionId, collectionId);
    assert.equal(report.projectPosts.length, existingOnly ? 0 : 1);
    if (!existingOnly) assert.equal(report.projectPosts[0].status, 200);
    const after = await facts(); await writeFile(path.join(output, 'after-placement-facts.json'), JSON.stringify(after, null, 2));
    const binding = after.bindings.filter(row => row.canvasId === canvasId && row.entityType === 'collection' && row.entityId === collectionId);
    assert.equal(binding.length, 1); assert.equal(binding[0].spatialId, carrier.id);
    assert.equal(after.canvases[canvasId].nodes.filter(node => node.data?.lcos_collection_ref?.collectionId === collectionId).length, 1);
    for (const key of ['artifacts', 'artifactRevisions', 'fileRecords', 'artifactViews', 'collections', 'collectionMemberships', 'workspaceMemberships', 'workspaceEntityMemberships'])
      assert.deepEqual(after.graph[key], before.graph[key], key + ' is not rewritten by taking an existing Collection.');
    assert.deepEqual(after.runs, before.runs);
    for (const id of Object.keys(before.canvases).filter(id => id !== canvasId)) assert.deepEqual(after.canvases[id], before.canvases[id]);
    await shot('03-confirmed-native-collection-in-original-preview');
    await page.getByRole('button', { name: '定位到画布', exact: true }).click();
    await page.keyboard.press('Escape');
    // Close the original Library through its own trigger if it remains open.
    if (await library.isVisible()) {
      const back = library.locator('button').filter({ has: page.locator('svg.tabler-icon-chevron-left') });
      assert.equal(await back.count(), 1, 'Use the observed original Library header back action.');
      await back.click(); await library.waitFor({ state: 'hidden' });
    }
    const pile = page.locator(`[data-pile-node="${carrier.id}"]`); await pile.waitFor();
    await shot('04-original-native-pile-carrier');
    await pile.click();
    const gallery = page.locator('[role="dialog"][data-pile-gallery-phase="open"]'); await gallery.waitFor();
    report.galleryDom = await gallery.evaluate(element => element.outerHTML);
    report.galleryPaint = await gallery.evaluate(element => ({ background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color, className: element.className,
      backdrops: [...element.querySelectorAll('.pointer-events-none.absolute.inset-0')].filter(e => e.classList.contains('bg-black') || e.classList.contains('bg-background'))
        .map(e => ({ className: e.className, background: getComputedStyle(e).backgroundColor, rect: e.getBoundingClientRect().toJSON() })) }));
    if (process.argv.includes('--expect-light-gallery')) {
      assert.equal(report.galleryPaint.backdrops.length, 1, 'Measure the actual original Gallery backdrop.');
      const backdrop = report.galleryPaint.backdrops[0];
      const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(backdrop.background);
      assert.ok(rgb && rgb.slice(1).every(value => Number(value) >= 220), 'Original Gallery backdrop must actually paint light, not merely carry a light class.');
    }
    report.galleryIds = await gallery.locator('[data-pile-gallery-item]').evaluateAll(elements => elements.map(e => e.getAttribute('data-pile-gallery-item')).sort());
    assert.deepEqual(report.galleryIds, [...carrier.data.memberIds].sort()); await shot('05-original-gallery-members');
    if (unprojectedSource) {
      assert.equal(carrier.data.memberIds.length, 0, 'Reading must not materialize the existing Artifact into a Canvas occurrence.');
      const info = gallery.locator('[data-native-collection-gallery-info]');
      await info.getByRole('button', { name: '查看', exact: true }).waitFor();
      assert.ok((await info.textContent()).includes('1 个成员 · 0 个位置'));
      const beforeRead = await facts(); await info.getByRole('button', { name: '查看', exact: true }).click();
      const viewer = page.locator('[data-media-viewer]'); await viewer.waitFor();
      await page.locator('[data-lcos-native-text-reading]').waitFor();
      const fileRead = report.fileReads.find(row => row.status === 200 && row.path.includes('/' + encodeURIComponent(unprojectedSource.fileRecordId) + '/content'));
      assert.ok(fileRead, 'The original Viewer must actually read the selected entity Current FileRecord, not a placeholder or Canvas DTO.');
      const expected = await fetch(origin + '/api/surface-core/file-records/' + encodeURIComponent(unprojectedSource.fileRecordId) + '/content');
      assert.equal(expected.status, 200); assert.equal(fileRead.body, await expected.text());
      await shot('05a-unprojected-existing-artifact-in-original-reader');
      await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'hidden' });
      await gallery.waitFor(); assert.equal(await gallery.getAttribute('data-pile-gallery-phase'), 'open');
      await info.getByRole('button', { name: '查看', exact: true }).waitFor();
      assert.deepEqual(await facts(), beforeRead, 'Pure reading cannot create any View, Canvas node, membership or Run.');
      report.checks.push('Canonical member with zero spatial occurrence opens same original Gallery, reads real existing entity FileRecord in original Viewer, Escape returns to same Gallery; all seven facts unchanged.');
      await shot('05b-return-same-original-gallery-no-node-created');
    }
    await page.keyboard.press('Escape');
    const beforeReload = await facts();
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
    await openEntry();
    await page.getByRole('button', { name: '定位到画布', exact: true }).waitFor();
    const refreshed = await request(projectionPath); assert.equal(refreshed.node.id, carrier.id);
    assert.equal(report.projectPosts.length, existingOnly ? 0 : 1, 'Reopening and reloading do not repeat the Collection producer.');
    assert.deepEqual(await facts(), beforeReload); await shot('06-reload-same-native-collection');
    await page.setViewportSize({ width: 1000, height: 800 });
    const preview = page.locator('[data-native-library-collection-preview]'); await preview.waitFor();
    report.narrowPreview = await preview.evaluate(element => ({ rect: element.getBoundingClientRect().toJSON(),
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, text: element.textContent }));
    const b = report.narrowPreview.rect;
    assert.ok(b.x >= 0 && b.y >= 0 && b.right <= 1000 && b.bottom <= 800, 'Original Collection preview must remain inside the narrow viewport.');
    assert.ok(report.narrowPreview.scrollWidth <= report.narrowPreview.clientWidth, 'Collection member text must not force horizontal overflow.');
    await shot('07-narrow-original-preview');
    report.checks.push(existingOnly ? 'Existing native pile/binding and original Gallery/reload; zero producer requests.'
      : 'One real producer → one exact native pile/binding; original Gallery members; reload reuses same carrier with zero extra producer requests.');
  }
  assert.deepEqual(report.routeErrors, []); assert.deepEqual(report.pageErrors, []); report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error);
  if (page) {
    await shot('failure').catch(() => {});
    await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()).catch(() => {});
  }
  process.exitCode = 1;
}
finally {
  releaseProject?.();
  if (browser) await browser.close();
  report.finalFacts = await facts().catch(error => ({ error: String(error) }));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, collectionId, nodeId: carrier?.id, posts: report.projectPosts.length,
    gets: report.projectionGets.length, output, error: report.error }, null, 2));
}
