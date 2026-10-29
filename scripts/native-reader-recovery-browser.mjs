import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const address = arg('base-url'), expectedPid = Number(arg('expected-pid')), nodeId = arg('node-id');
assert.ok(address && new URL(address).hostname === '127.0.0.1' && ['http:', 'https:'].includes(new URL(address).protocol), 'explicit loopback --base-url required');
const base = new URL(address).origin;
assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0 && nodeId, '--expected-pid and an existing synthetic --node-id required');
const output = path.join(root, 'output/原生文件Drop整合_20261017i/旧Reader真实恢复', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, base, expectedPid, nodeId, cases: [], screenshots: [], pageErrors: [],
  network: { blockedRemote: [], blockedWrites: [], readRequests: [] }, observations: {},
  scope: 'Fresh isolated Chrome context. Only synthetic original professional layout localStorage is seeded. Original setProject/Stage/wa/close/return run unchanged through shipped transforms. Response-copy closures expose read-only snapshots, no setters/open/camera calls. No business write is forwarded.',
  boundaries: ['The original disk writer deliberately removes returnToWindowId/composerOriginKey.',
    'Composer drafts are not claimed to persist across document reload; a second original-tab gesture tests a real nonempty draft within one document.',
    'No unknown save or local editor draft is injected; those refusal branches retain their independent actual-hook evidence.'] };
const get = async route => {
  const response = await fetch(base + route, { method: 'GET', cache: 'no-store' });
  assert.equal(response.status, 200, route);
  const body = await response.json();
  if ('ok' in body) { assert.equal(body.ok, true, JSON.stringify(body)); return body.value; }
  assert.equal(body.code, 0, JSON.stringify(body)); return body.data;
};
const health = async () => {
  const response = await fetch(base + '/health', { method: 'GET', cache: 'no-store' });
  assert.equal(response.status, 200); const value = await response.json();
  assert.equal(value.ok, true); assert.equal(value.realCoreConnected, true);
  assert.equal(value.pid, expectedPid, 'do not run against another candidate generation');
  assert.ok(value.runtimeLabel?.startsWith('isolated-'));
  return value;
};
let browser, context, page, releaseContent;
try {
  report.healthBefore = await health();
  const translation = await get('/api/lcos/translation'), projectId = translation.projectId;
  const canvasId = arg('canvas-id') ?? 'surface-core-main';
  const surface = { 'surface-core-main': 'main', 'surface-core-context': 'context', 'surface-core-workflow': 'workflow' }[canvasId];
  assert.ok(surface, 'only an existing explicit root Canvas may be used');
  const prefix = '/api/lcos/core/projects/' + encodeURIComponent(projectId);
  const facts = async () => ({ graph: await get(prefix + '/graph'), runs: await get(prefix + '/runs'),
    presentations: await get(prefix + '/presentations'), canvases: await Promise.all(['main', 'context', 'workflow'].map(kind => get('/api/canvas/v1/canvases/surface-core-' + kind))) });
  const before = await facts(); await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify(before, null, 2));
  const canvas = before.canvases.find(row => row.id === canvasId), node = canvas?.nodes.find(row => row.id === nodeId);
  const ref = node?.data?.lcos_ref;
  assert.ok(ref?.version === 1 && ref.entityType === 'artifact' && ref.artifactId && ref.artifactViewId, 'node must be an existing synthetic Core-owned artifact occurrence');
  const artifactId = ref.artifactId, artifactPath = '/api/lcos/core/artifacts/' + encodeURIComponent(artifactId);
  const detail = await get(artifactPath), revisions = await get(artifactPath + '/revisions');
  assert.equal(String(detail.artifact.projectId), projectId);
  const currentRevisionId = detail.currentRevisionId ?? detail.artifact.currentRevisionId;
  const available = revision => String(revision.artifactId) === artifactId && before.graph.fileRecords.some(file => String(file.id) === String(revision.fileRecordId)
    && String(file.projectId) === projectId && file.availability === 'current' && file.size > 0 && file.observedHash === revision.contentHash && file.mimeType?.startsWith('text/'));
  const revision = arg('revision-id') ? revisions.find(row => String(row.id) === arg('revision-id') && available(row))
    : revisions.find(row => String(row.id) !== String(currentRevisionId) && row.status === 'superseded' && available(row));
  assert.ok(revision, 'an exact readable historical text revision is required; never silently substitute Current');
  const revisionId = String(revision.id), fileRecordId = String(revision.fileRecordId);
  const contentPath = prefix + '/file-records/' + encodeURIComponent(fileRecordId) + '/content';
  const contentResponse = await fetch(base + contentPath, { method: 'GET', cache: 'no-store' });
  assert.equal(contentResponse.status, 200); const exactBody = await contentResponse.text(); assert.ok(exactBody.length > 0);
  const locator = { kind: 'lines', start: 0, end: 1, label: '恢复测试：准确历史首行' };
  const readerId = 'test-restored-reader-' + Date.now(), otherId = readerId + '-other', readerTitle = '恢复测试：历史阅读', otherTitle = '恢复测试：保留原归档地址';
  const layoutKey = 'lcos.professional-window-layout.v1.' + projectId;
  const layout = active => ({ version: 1, projectId, windows: [
    { id: otherId, bodyKey: 'archive', title: otherTitle, active: !active },
    { id: readerId, bodyKey: 'reader', title: readerTitle, target: artifactId, readerRevisionId: revisionId,
      readerSource: { surface, nodeId }, sourceLocator: locator, active },
  ], windowRegions: [{ id: readerId + '-region', layout: 'floating',
    groups: [{ id: readerId + '-group', windowIds: [otherId, readerId], activeWindowId: active ? readerId : otherId }],
    activeGroupId: readerId + '-group', rect: { x: 110, y: 80, width: 570, height: 460 } }] });
  const persistenceSource = await fs.readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/professionalWindowPersistence.ts'), 'utf8');
  assert.match(persistenceSource, /const PREFIX = 'lcos\.professional-window-layout\.v1\.'/);
  assert.ok(persistenceSource.includes('composerOriginKey: _detour, returnToWindowId: _ephemeralOrigin'));
  report.fixture = { projectId, canvasId, artifactId, revisionId, fileRecordId, currentRevisionId, readerId, otherId, layoutKey, locator,
    source: 'Original readProfessionalWindowLayout/writeProfessionalWindowLayout v1 shape; no ephemeral return fields', layout: layout(true) };
  await fs.writeFile(path.join(output, 'fixture-layout.json'), JSON.stringify(layout(true), null, 2));
  const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
  browser = await chromium.launch({ headless: !process.argv.includes('--headed'), executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  let holdContent = true, heldContent = false;
  const shellProbe = `
;(() => {
  const events=[];let subscribed=false;
  const pick=state=>({projectId:state.projectId,windows:state.windows.map(row=>({id:row.id,bodyKey:row.bodyKey,target:row.target,title:row.title,active:row.active,readerRevisionId:row.readerRevisionId,readerSource:row.readerSource,sourceLocator:row.sourceLocator})),
    windowRegions:state.windowRegions,composerPrompt:state.composerPrompt,composerCaret:state.composerCaret,composerOpen:state.composerOpen,locateRequest:state.locateRequest});
  window.__LCOS_TEST_READER_SNAPSHOT__=()=>{
    if(!useLcosShellStore)return null;
    if(!subscribed){subscribed=true;useLcosShellStore.subscribe((next,previous)=>{const removed=previous.windows.filter(row=>!next.windows.some(item=>item.id===row.id)).map(row=>row.id);if(removed.length||next.locateRequest!==previous.locateRequest)events.push({at:Date.now(),removed,locateRequest:next.locateRequest});});}
    return structuredClone({...pick(useLcosShellStore.getState()),events});
  };
})();`;
  const runtimeProbe = `
;window.__LCOS_TEST_READER_RUNTIME__=()=>{const value=LCOSNativeMaterialViewerRuntime.getState(),session=value.session,lease=session?.lcosControlled?.readerRecovery;
  return {phase:value.phase,session:session?{id:session.id,mode:session.mode,media:{type:session.media?.type,title:session.media?.title,markdown:session.media?.markdown},requestKey:session.lcosControlled?.requestKey,
    recovery:lease?{accepted:lease.accepted,cancelled:lease.cancelled,closed:lease.closed,sourceId:lease.source.id,revisionId:lease.source.readerRevisionId,readerSource:lease.source.readerSource,sourceLocator:lease.source.sourceLocator,ready:lease.ready}:null}:null};};`;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== base) { report.network.blockedRemote.push({ method, url: url.href }); return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      report.network.blockedWrites.push({ method, path: url.pathname, body: request.postData() });
      return route.abort('blockedbyclient');
    }
    if (method === 'GET') report.network.readRequests.push(url.pathname);
    if (url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 60000 }), body = await response.text();
      assert.match(body, /(?:var|let|const)[^;\n]*\buseLcosShellStore\b/);
      assert.ok(body.includes('NativeRestoredReaderBody'), 'Reader delegation must be in the actual served UI');
      report.observations.shellProbeInstalled = true;
      return route.fulfill({ response, body: body + shellProbe });
    }
    if (url.pathname.endsWith('/course-api-base-url-CifxI1ia.js')) {
      const response = await route.fetch({ timeout: 60000 }), body = await response.text();
      assert.equal(body.split('const LCOSNativeMaterialViewerRuntime=').length - 1, 1);
      report.observations.runtimeProbeInstalled = true;
      return route.fulfill({ response, body: body + runtimeProbe });
    }
    if (holdContent && !heldContent && url.pathname === contentPath) {
      heldContent = true; const response = await route.fetch({ timeout: 60000 });
      await new Promise(resolve => { releaseContent = resolve; });
      return route.fulfill({ response });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  const snapshot = () => page.evaluate(() => window.__LCOS_TEST_READER_SNAPSHOT__?.());
  const runtime = () => page.evaluate(() => window.__LCOS_TEST_READER_RUNTIME__?.());
  const disk = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey);
  const until = async (read, predicate, label, timeout = 45000) => {
    const started = Date.now(); let value;
    while (Date.now() - started < timeout) { value = await read(); if (predicate(value)) return value; await page.waitForTimeout(100); }
    throw new Error(label + ': ' + JSON.stringify(value));
  };
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  const installed = () => until(snapshot, value => value?.projectId === projectId && value.windows.some(row => row.id === readerId), 'setProject did not restore original Reader address');
  const assertSource = value => {
    const row = value.windows.find(item => item.id === readerId); assert.ok(row);
    assert.equal(row.target, artifactId); assert.equal(row.readerRevisionId, revisionId);
    assert.deepEqual(row.readerSource, { surface, nodeId }); assert.deepEqual(row.sourceLocator, locator);
    assert.ok(value.windows.some(item => item.id === otherId));
  };
  const open = async label => {
    const state = await until(runtime, value => value?.phase === 'open' && value.session?.recovery?.accepted && value.session.recovery.ready?.revisionId === revisionId,
      'actual wa phase=open and exact ready proof not observed');
    assert.equal(state.session.recovery.sourceId, readerId); assert.equal(state.session.recovery.ready.fileRecordId, fileRecordId);
    assert.deepEqual(state.session.recovery.readerSource, { surface, nodeId }); assert.deepEqual(state.session.recovery.sourceLocator, locator);
    assert.equal(state.session.media.markdown, exactBody, 'native viewer must keep the exact historical FileRecord bytes');
    await page.locator('[data-lcos-native-text-reading]').waitFor({ state: 'visible' });
    await until(() => page.locator('[data-lcos-window-body="reader"]').count(), value => value === 0, 'old Reader presentation still mounted after actual handoff');
    assertSource(await snapshot()); assertSource(await disk());
    report.observations[label] = { state, shell: await snapshot(), disk: await disk() }; await shot(label);
  };
  const close = async label => {
    const beforeClose = await snapshot(), eventCount = beforeClose.events.length;
    await page.keyboard.press('Escape');
    await until(runtime, value => value?.phase === 'open' && !value.session, 'original wa finishClose did not return to its idle open/null state');
    const afterClose = await until(snapshot, value => !value.windows.some(row => row.id === readerId), 'accepted Viewer close did not consume exact original Reader address');
    const events = afterClose.events.slice(eventCount);
    assert.equal(events.filter(event => event.removed.includes(readerId)).length, 1, 'one original close consumes this address exactly once');
    assert.equal(events.filter(event => event.locateRequest?.nodeId === nodeId && event.locateRequest?.surface === surface).length, 1, 'one original return targets exact readerSource node/surface');
    assert.ok(afterClose.windows.some(row => row.id === otherId), 'unrelated old address survives original close');
    const persisted = await disk(); assert.ok(!persisted.windows.some(row => row.id === readerId)); assert.ok(persisted.windows.some(row => row.id === otherId));
    assert.equal(afterClose.composerPrompt, beforeClose.composerPrompt); assert.deepEqual(afterClose.composerCaret, beforeClose.composerCaret);
    report.observations[label] = { before: beforeClose, after: afterClose, disk: persisted, events }; await shot(label);
    return afterClose;
  };

  // Same-origin health document has no application/store. Seed only the exact
  // original durable layout, then let normal application startup read it.
  await page.goto(base + '/health');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: layoutKey, value: layout(true) });
  await page.goto(base + '/canvas/' + canvasId);
  const initial = await installed(); assertSource(initial);
  await until(() => Promise.resolve(typeof releaseContent === 'function'), Boolean, 'exact content GET was not held before decode');
  const loading = await runtime();
  assert.ok(!loading?.session?.recovery?.ready, 'an emitted request/loading session is not readiness');
  assert.equal(await page.locator('[data-lcos-window-body="reader"]').count(), 1, 'old presentation remains until real successful read/open');
  assertSource(await disk()); report.observations.initialLoading = { shell: await snapshot(), runtime: loading, disk: await disk() };
  await shot('01-real-layout-loading-before-ack'); holdContent = false; releaseContent(); releaseContent = undefined;
  await open('02-original-viewer-historical-open');
  await page.reload(); await installed(); await open('03-reload-original-address-still-restores');
  await close('04-escape-consumes-only-source-and-returns-once');
  report.cases.push('active original disk Reader: setProject -> exact historical read -> actual wa open -> old presentation retires; reload preserves original address; Escape closes/returns once and consumes only that address');

  // Preserve a real nonempty input without inventing disk draft persistence:
  // an inactive restored Reader is activated through its original visible tab.
  await page.goto(base + '/health');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: layoutKey, value: layout(false) });
  await page.goto(base + '/canvas/' + canvasId); await installed();
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
  await input.waitFor({ state: 'visible', timeout: 30000 });
  const draft = 'Reader恢复测试：只保留草稿，不发送 ' + new Date().toISOString();
  await input.fill(draft); await input.press('Home'); await input.press('ArrowRight'); await input.press('Shift+ArrowRight'); await input.press('Tab');
  const beforeDraft = await until(snapshot, value => value?.composerPrompt === draft, 'original Composer did not retain human input');
  await page.locator('[data-lcos-window-tab-value="' + readerId + '"]').click();
  await open('05-original-reader-tab-preserves-real-draft');
  const duringDraft = await snapshot(); assert.equal(duringDraft.composerPrompt, draft); assert.deepEqual(duringDraft.composerCaret, beforeDraft.composerCaret);
  const afterDraft = await close('06-original-return-preserves-real-draft');
  assert.equal(afterDraft.composerPrompt, draft); assert.deepEqual(afterDraft.composerCaret, beforeDraft.composerCaret);
  report.cases.push('inactive disk Reader activated by original visible tab: real original Composer input/caret survive actual Viewer handoff and one original close/return; unrelated old address remains');
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.healthAfter = await health(); const after = await facts();
  await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify(after, null, 2));
  assert.deepEqual(after, before, 'graph/Runs/Presentations/three Canvases must remain fully unchanged');
  report.businessWritesForwarded = 0; report.passed = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  if (page) {
    try { await fs.writeFile(path.join(output, 'failure-aria.txt'), await page.locator('body').ariaSnapshot()); await page.screenshot({ path: path.join(output, 'failure.png') }); }
    catch (captureError) { report.captureError = captureError.message; }
    try { report.failureState = await page.evaluate(() => ({ shell: window.__LCOS_TEST_READER_SNAPSHOT__?.(), runtime: window.__LCOS_TEST_READER_RUNTIME__?.(), body: document.body.innerText.slice(0, 12000) })); }
    catch (captureError) { report.stateError = captureError.message; }
  }
} finally {
  releaseContent?.(); await context?.close(); await browser?.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, output, ...(report.error ? { error: report.error.message } : {}) }, null, 2));
}
