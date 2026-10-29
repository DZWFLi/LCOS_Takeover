import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const address = new URL(arg('base-url') ?? 'http://127.0.0.1:56239/');
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.pathname, '/');
const origin = address.origin, canvasId = 'surface-core-main', projectId = 'disposable-surface-core-facade';
const narrowOnly = process.argv.includes('--narrow-only');
const continueKnownSuggestions = process.argv.includes('--continue-known-blocked-suggestions');
const prefix = '/api/lcos/core/projects/' + projectId;
const output = path.resolve(import.meta.dirname, '../output/原生ColorPin整合_20261017h/小地图只读手势', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const get = async pathname => {
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' }), body = await response.json();
  assert.equal(response.status, 200); if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const facts = async () => ({ graph: await get(prefix + '/graph'), runs: await get(prefix + '/runs'),
  presentations: await get(prefix + '/presentations'), bindings: await get(prefix + '/spatial/bindings'),
  canvases: Object.fromEntries(await Promise.all(['main', 'context', 'workflow'].map(async name => {
    const id = 'surface-core-' + name; return [id, await get('/api/canvas/v1/canvases/' + id)];
  }))) });
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.pid, Number(arg('expected-pid') ?? 5532)); assert.equal(health.runtimeLabel, 'isolated-native-flow-20261017c');
const before = await facts(), pinsBefore = await get(prefix + '/color-pins'); assert.equal(pinsBefore.memberships.length, 0);
const report = { passed: false, at: new Date().toISOString(), output, health,
  scope: 'Fresh original App; actual minimap button/pointer/wheel/viewport only. No API camera setter, node/geometry/Core writes, fixture or product change.',
  narrowOnly, continueKnownSuggestions, allowedStartup: [], blockedWrites: [], knownBlockedSideEffects: [], externalBlocked: [], pageErrors: [], routeErrors: [], screenshots: [], checks: [], measurements: [], toggles: [], knownLayoutFailures: [] };
let browser, context, page;
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
const viewport = () => page.evaluate(() => window.__LCOS_NODE_LAB__.api.getViewport());
const settle = async () => { let previous, stable = 0; for (let turn = 0; turn < 50; turn++) {
  const current = await viewport(); stable = previous && ['x', 'y', 'zoom'].every(key => Math.abs(current[key] - previous[key]) < .03) ? stable + 1 : 0;
  if (stable >= 3) return current; previous = current; await page.waitForTimeout(80);
} return viewport(); };
const stopOnWrite = () => assert.deepEqual(report.blockedWrites.filter(entry => !report.knownBlockedSideEffects.includes(entry)), [],
  'Original gesture attempted an unknown business write; stop, do not widen permission.');
try {
  await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify({ before, pinsBefore }, null, 2));
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const entry = { method, path: url.pathname, body: request.postData() };
        if (method === 'POST' && (url.pathname === '/api/events' || url.pathname === `/api/lcos/canvases/${canvasId}/execution:reconcile` && entry.body === '{}')) {
          const response = await route.fetch({ maxRedirects: 0 }); report.allowedStartup.push({ ...entry, status: response.status() }); return route.fulfill({ response });
        }
        report.blockedWrites.push(entry);
        if (continueKnownSuggestions && method === 'POST' && url.pathname === '/api/agent-gateway/v1/conversations/suggestions/dynamic') {
          let payload; try { payload = request.postDataJSON(); } catch {}
          if (payload?.canvas_id === canvasId && payload.count === 5 && payload.mode === 'mixed') report.knownBlockedSideEffects.push(entry);
        }
        return route.abort('blockedbyclient');
      }
      return route.continue();
    } catch (error) { report.routeErrors.push(String(error.stack ?? error)); try { await route.abort('failed'); } catch {} }
  });
  await context.routeWebSocket('**/*', socket => { report.externalBlocked.push(socket.url()); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api?.getNodes().length
    && (window.__LCOS_NODE_LAB__.currentCanvasId ?? window.__LCOS_NODE_LAB__.canvasId) === id, canvasId, { timeout: 60000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  await settle(); stopOnWrite(); report.initialViewport = await viewport();
  const controls = page.locator('[data-pile-gallery-chrome="bottom-left"] button').filter({
    has: page.locator('span[aria-hidden="true"][class*="-inset-0.5"][class*="group-data-[active]"]') });
  report.controls = await controls.evaluateAll(elements => elements.map(element => ({ html: element.outerHTML, rect: element.getBoundingClientRect().toJSON() })));
  let controlIndex = -1;
  for (let index = 0; index < await controls.count(); index++) {
    await controls.nth(index).hover();
    const tooltip = page.getByRole('tooltip').filter({ hasText: /打开小地图|关闭小地图|Open [Mm]inimap|Close [Mm]inimap/ });
    if (await tooltip.waitFor({ timeout: 1000 }).then(() => true, () => false)) { controlIndex = index; report.minimapTooltip = await tooltip.textContent(); break; }
  }
  assert.ok(controlIndex >= 0, 'Use actual original tooltip to identify minimap; never assume one of the four similar controls.');
  const toggle = controls.nth(controlIndex), map = page.getByTestId('rf__minimap');
  if (await map.count()) { await toggle.click(); await map.waitFor({ state: 'hidden' }); }
  await toggle.click(); await map.waitFor({ state: 'visible' }); assert.equal(await toggle.getAttribute('data-active'), 'true');
  const rootMap = map.locator('xpath=../..'), overlay = rootMap.locator(':scope > div.cursor-grab');
  assert.equal(await overlay.count(), 1);
  const measure = async label => {
    const value = await rootMap.evaluate((element, label) => {
      const rect = el => el?.getBoundingClientRect().toJSON() ?? null;
      const style = el => el && ({ overflow: getComputedStyle(el).overflow, background: getComputedStyle(el).backgroundColor });
      const marker = element.querySelector(':scope > div:first-child > div.pointer-events-none');
      const flow = document.querySelector('.react-flow');
      const api = window.__LCOS_NODE_LAB__.api;
      return { label, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
        map: rect(element), nativeMap: rect(element.querySelector('[data-testid="rf__minimap"]')),
        svg: rect(element.querySelector('svg.react-flow__minimap-svg')), overlay: rect(element.querySelector(':scope > div.cursor-grab')),
        marker: rect(marker), markerTransform: marker && getComputedStyle(marker).transform, markerStyle: style(marker), flow: rect(flow),
        nodeBounds: api.getNodesBounds(api.getNodes().map(node => node.id)),
        dock: rect(document.querySelector('[data-lcos-surface-dock]')), buttons: [...document.querySelectorAll('[data-lcos-surface-dock] button')].map(rect),
        nodes: [...element.querySelectorAll('rect.react-flow__minimap-node')].map(node => ({ x: node.getAttribute('x'), y: node.getAttribute('y'),
          width: node.getAttribute('width'), height: node.getAttribute('height'), fill: getComputedStyle(node).fill })) };
    }, label);
    value.camera = await viewport();
    const camera = value.camera, bounds = value.nodeBounds, view = { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom,
      width: value.flow.width / camera.zoom, height: value.flow.height / camera.zoom };
    const left = Math.min(bounds.x, view.x), top = Math.min(bounds.y, view.y), right = Math.max(bounds.x + bounds.width, view.x + view.width),
      bottom = Math.max(bounds.y + bounds.height, view.y + view.height), scale = Math.min(200 / (right - left), 150 / (bottom - top));
    value.expectedMarker = { x: value.svg.x + (view.x - left) * scale + (200 - (right - left) * scale) / 2,
      y: value.svg.y + (view.y - top) * scale + (150 - (bottom - top) * scale) / 2, width: view.width * scale, height: view.height * scale };
    report.measurements.push(value); return value;
  };
  const assertMarkerMapping = measurement => { for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(measurement.marker[key] - measurement.expectedMarker[key]) < 1.1,
      'Actual minimap viewport ' + key + ' must map the current original camera and original read-only node bounds.'); };
  const assertDockClearsMap = measurement => {
    const map = measurement.map, dock = measurement.dock;
    assert.ok(dock, 'Keep the actual three-view Dock mounted.');
    assert.ok(!(map.x < dock.right && map.right > dock.x && map.y < dock.bottom && map.bottom > dock.y),
      'Actual visible original minimap and three-view Dock must not overlap at ' + measurement.label);
    assert.equal(measurement.buttons.length, 3, 'Keep all three existing surface buttons.');
    assert.ok(dock.x >= -1 && dock.right <= measurement.viewport.width + 1);
    measurement.dockMapGap = { nativeMap: measurement.nativeMap.y - dock.bottom, outerPointerFrame: map.y - dock.bottom };
    assert.ok(measurement.dockMapGap.nativeMap >= 11.9, 'Preserve the existing 12px gap to the actual rf__minimap obstacle rectangle.');
  };
  const original = await measure('1440-open'); await shot('01-original-minimap-open'); stopOnWrite();
  assertMarkerMapping(original);
  assert.equal(original.nodes.length > 0, true);
  if (!narrowOnly) {
  const marker = original.marker, surface = original.overlay;
  const left = Math.max(marker.x, surface.x), top = Math.max(marker.y, surface.y), right = Math.min(marker.right, surface.right), bottom = Math.min(marker.bottom, surface.bottom);
  assert.ok(right - left > 4 && bottom - top > 4, 'Original visible viewport marker must provide a true drag start.');
  const start = { x: (left + right) / 2, y: (top + bottom) / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 28, start.y - 15, { steps: 12 }); await page.mouse.up();
  const panned = await settle(); assert.equal(panned.zoom, original.camera.zoom);
  assert.ok(Math.abs(panned.x - original.camera.x) > 5 || Math.abs(panned.y - original.camera.y) > 5, 'Actual minimap viewport drag must pan original camera.');
  const afterPan = await measure('1440-minimap-pan'); await shot('02-original-minimap-pan'); stopOnWrite();
  assert.ok(Math.abs(afterPan.marker.x - marker.x) > .5 || Math.abs(afterPan.marker.y - marker.y) > .5);
  const panePoint = await page.locator('.react-flow').evaluate(element => {
    const r = element.getBoundingClientRect(); return { x: r.x + r.width * .55, y: r.y + r.height * .35 };
  });
  await page.mouse.move(panePoint.x, panePoint.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, 210); await page.keyboard.up('Control');
  const zoomed = await settle(); assert.ok(Math.abs(zoomed.zoom - panned.zoom) > .01, 'Actual original canvas Control+wheel must change zoom.');
  const afterZoom = await measure('1440-original-control-wheel'); await shot('03-original-canvas-wheel-map-sync'); stopOnWrite();
  assertMarkerMapping(afterZoom);
  await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2); await page.mouse.wheel(0, 90);
  report.wheelOverMap = { before: zoomed, after: await settle(), note: 'Original B7 disables its own zoom; record actual bubbled wheel behavior without inventing a new interaction.' }; stopOnWrite();
  }
  for (const width of narrowOnly ? [360, 320] : [680, 360, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await settle(); let measurement = await measure(width + '-open'); await shot('04-width-' + width);
    if (measurement.flow.width < 1) {
      report.knownLayoutFailures.push({ width, reason: 'Default original open conversation consumes entire Canvas width; minimap remains mounted behind the conversation with a stale viewport width.', measurement });
      await page.getByRole('button', { name: '收起对话', exact: true }).click(); await page.waitForTimeout(350);
      measurement = await measure(width + '-after-original-collapse-chat'); await shot('04b-width-' + width + '-original-collapse-chat');
    }
    assertMarkerMapping(measurement);
    assertDockClearsMap(measurement);
    assert.ok(measurement.map.x >= -1 && measurement.map.right <= width + 1 && measurement.map.y >= -1 && measurement.map.bottom <= 1001,
      'Original minimap must remain inside narrow viewport ' + width);
    assert.ok(measurement.overlay.width >= 190 && measurement.overlay.height >= 140);
    await toggle.click(); await map.waitFor({ state: 'hidden' }); assert.equal(await toggle.getAttribute('data-active'), null);
    await page.waitForTimeout(150);
    const closedDock = await page.locator('[data-lcos-surface-dock]').evaluate(element => element.getBoundingClientRect().toJSON());
    await toggle.click(); await map.waitFor({ state: 'visible' }); await settle();
    const reopened = await measure(width + '-reopened'); assertMarkerMapping(reopened); assertDockClearsMap(reopened);
    report.toggles.push({ width, openDock: measurement.dock, closedDock, reopenedDock: reopened.dock });
    stopOnWrite();
  }
  report.finalViewport = await viewport();
  report.checks.push('Actual original tooltip/button/O0 opens and closes map; desktop plus 680/360/320 real controls remain reachable.',
    'Actual yBe overlay pointer drag pans original camera without zoom or node write; minimap viewport moves.',
    'Actual original Canvas Control+wheel changes zoom and original minimap viewport dimensions follow; direct map wheel behavior separately recorded.');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors, []); stopOnWrite();
  report.gestureChecksPassed = true;
  report.layoutPassed = true;
  report.layoutScope = 'Usable original Canvas after an explicit original chat collapse when needed; default chat-open zero-width Canvas is separately retained as a known layout failure.';
  report.wholeFlowPassed = report.knownLayoutFailures.length === 0 && report.knownBlockedSideEffects.length === 0;
  report.passed = report.layoutPassed && report.wholeFlowPassed;
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page) { await shot('failure').catch(() => {}); await fs.writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()).catch(() => {}); }
} finally {
  if (context) await context.close(); if (browser) await browser.close();
  if (report.blockedWrites.some(entry => !report.knownBlockedSideEffects.includes(entry))) {
    report.passed = false; report.wholeFlowPassed = false; process.exitCode = 1;
  }
  if (report.knownBlockedSideEffects.length) { report.passed = false; report.wholeFlowPassed = false; }
  try { const after = await facts(), pinsAfter = await get(prefix + '/color-pins');
    assert.deepEqual(after, before); assert.deepEqual(pinsAfter, pinsBefore); report.sevenFactsUnchanged = true; report.pinSnapshotUnchanged = true;
    await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify({ after, pinsAfter }, null, 2));
  } catch (error) { report.passed = false; report.factError = String(error.stack ?? error); process.exitCode = 1; }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, layoutPassed: report.layoutPassed, wholeFlowPassed: report.wholeFlowPassed,
    output, error: report.error, blockedWrites: report.blockedWrites, knownBlockedSideEffects: report.knownBlockedSideEffects,
    sevenFactsUnchanged: report.sevenFactsUnchanged, pinSnapshotUnchanged: report.pinSnapshotUnchanged }, null, 2));
}
