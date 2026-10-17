import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const argument = process.argv.find(value => value.startsWith('--base-url='));
assert.ok(argument, 'Use an explicitly coordinated isolated runtime --base-url=http://127.0.0.1:<port>.');
const address = new URL(argument.slice('--base-url='.length));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1');
assert.equal(address.pathname, '/'); assert.equal(address.username, ''); assert.equal(address.password, '');
const origin = address.origin;
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected && health.nativeRailPilot);
const existingRunId = process.argv.find(value => value.startsWith('--run-id='))?.slice('--run-id='.length);
assert.ok(existingRunId || process.argv.includes('--prepare-synthetic-task'), 'Supply an existing synthetic --run-id or --prepare-synthetic-task; neither mode dispatches a Run.');
const outputGroup = process.argv.find(value => value.startsWith('--output-group='))?.slice('--output-group='.length) ?? '原流程施工_20261017b';
assert.ok(outputGroup && !/[\\/]/.test(outputGroup) && !['.', '..'].includes(outputGroup));
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', outputGroup, '任务原流程实测' + (existingRunId ? '-既有任务' : ''));
await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), origin, pid: health.pid, runtimeLabel: health.runtimeLabel, output,
  fixtureWrites: [], browserWrites: [], blockedWrites: [], pageErrors: [], externalBlocked: [], checks: [], screenshots: [],
  modelExecuted: false, runDispatched: false, passed: false };
let browser, page;
const read = async route => {
  const response = await fetch(origin + route, { cache: 'no-store', redirect: 'error' });
  assert.equal(response.status, 200, route);
  const value = await response.json();
  if ('ok' in value) { assert.equal(value.ok, true); return value.value; }
  assert.equal(value.code, 0); return value.data;
};
const create = async (route, body) => {
  const intent = { at: new Date().toISOString(), route, body, result: 'request not yet confirmed' };
  await writeFile(path.join(output, 'fixture-intent.json'), JSON.stringify(intent, null, 2));
  const response = await fetch(origin + route, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json(); assert.equal(response.status, 201, JSON.stringify(value)); assert.equal(value.ok, true);
  report.fixtureWrites.push({ route, result: value.value }); return value.value;
};
try {
  const mapping = await read('/api/lcos/translation'), projectId = mapping.projectId;
  assert.equal(typeof projectId, 'string');
  const prefix = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`;
  const [graph, workspaces] = await Promise.all([read(prefix + '/graph'), read(prefix + '/workspaces')]);
  const roots = graph.scopes.filter(scope => scope.kind === 'root' && scope.projectId === projectId);
  assert.equal(roots.length, 1);
  const sites = workspaces.filter(site => site.projectId === projectId && site.scopeId === roots[0].id && site.preferredSurface === 'main' && site.canvasId);
  assert.equal(sites.length, 1);
  let workspace = sites[0];
  let title = '人工任务输入验证 ' + new Date().toISOString();
  const content = '人工合成原流程材料：全文、版本和来源必须从现有 Core 读取。\n不执行模型，不派发任务，不改已有材料。';
  let material, review, instruction;
  if (existingRunId) {
    review = await read(`/api/lcos/core/runs/${encodeURIComponent(existingRunId)}/review`);
    instruction = review.run.instruction;
    assert.ok(instruction.startsWith('人工任务流程验证 '), 'Read-only retry only targets this script’s clearly marked synthetic task.');
    workspace = workspaces.find(site => site.id === review.run.workspaceId && site.canvasId);
    assert.ok(workspace);
  } else {
    material = await create(prefix + '/text-artifacts', { title, body: content, scopeId: workspace.scopeId, workspaceId: workspace.id });
    instruction = '人工任务流程验证 ' + new Date().toISOString();
    const created = await create(prefix + '/runs', { instruction, outputIntent: 'analyze', workspaceId: workspace.id,
      orderedReferences: [{ ref: { type: 'view', viewId: material.viewId }, order: 0 }] });
    review = created.review ?? created;
  }
  const runId = review.run.id;
  assert.equal(review.run.status, 'created'); assert.equal(review.dispatch.status, 'planned');
  const recipe = await read(`/api/lcos/core/runs/${encodeURIComponent(runId)}/recipe`);
  assert.equal(recipe.runId, runId); assert.equal(recipe.projectId, projectId);
  const persisted = await read(prefix + '/context-manifests/v0/' + encodeURIComponent(recipe.contextManifestId));
  assert.equal(persisted.id, recipe.contextManifestId); assert.equal(persisted.projectId, projectId);
  const canonical = JSON.parse(persisted.canonicalJson);
  const source = canonical.orderedItems.find(item => material ? item.artifactId === material.artifactId && item.revisionId === material.revisionId
    : typeof item.artifactId === 'string' && typeof item.revisionId === 'string');
  assert.ok(source); report.exactInput = { artifactId: source.artifactId, revisionId: source.revisionId, manifestId: persisted.id, runId };
  if (!material) {
    const artifact = graph.artifacts.find(row => row.id === source.artifactId);
    assert.ok(artifact?.title.startsWith('人工任务输入验证 ')); title = artifact.title;
  }
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (request.method() !== 'GET') {
      report.browserWrites.push(url.pathname);
      if (/\/(runs|artifact-returns|conversation-continuations|connected-conversations|turns|messages|generations)(?:\/|$|:)/.test(url.pathname)) {
        report.blockedWrites.push(url.pathname); return route.abort();
      }
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.addInitScript(() => { window.__taskFlowMaterialRequests = []; window.addEventListener('lcos-native-open-material', event => window.__taskFlowMaterialRequests.push(event.detail)); });
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  await page.goto(origin + '/canvas/' + encodeURIComponent(workspace.canvasId), { waitUntil: 'domcontentloaded' });
  const editor = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await editor.waitFor({ state: 'visible' });
  const draft = '任务回程验证草稿，尚未发送。'; await editor.fill(draft);
  const camera = await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getViewport());
  await page.getByRole('button', { name: '查看任务', exact: true }).click();
  await page.locator(`[data-lcos-native-run-list-item="${runId}"]`).getByRole('button').click();
  const task = page.locator('[data-native-task-detail]'); await task.getByRole('heading', { name: instruction, exact: true }).waitFor();
  assert.equal(await page.locator('[data-lcos-window-body="run-review"], [data-lcos-window-body="conversation"]').count(), 0);
  await shot('01-original-right-rail-task');
  await task.locator('summary').filter({ hasText: '使用的材料' }).click();
  assert.equal(await task.evaluate(element => /Note note-/.test(element.textContent)), false, 'Core generated Note addresses are not user-facing titles.');
  await task.getByRole('button', { name: title, exact: true }).click();
  const reading = page.locator('[data-lcos-native-text-reading]'); await reading.waitFor({ state: 'visible' });
  assert.ok((await reading.textContent()).includes('人工合成原流程材料'));
  const target = await page.evaluate(() => window.__taskFlowMaterialRequests.at(-1));
  assert.equal(target.artifactId, source.artifactId); assert.equal(target.revisionId, source.revisionId);
  await shot('02-task-exact-input-original-viewer');
  const viewerKey = await page.evaluate(async () => {
    const runtime = (await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime;
    window.__taskFlowReadViewer = () => runtime.getState();
    const state = window.__taskFlowReadViewer();
    window.__taskFlowViewerReady = { requestKey: state.session?.lcosControlled?.requestKey, stable: 0, phases: [] };
    return window.__taskFlowViewerReady.requestKey;
  });
  assert.ok(viewerKey !== undefined);
  await page.waitForFunction(expected => {
    const state = window.__taskFlowReadViewer();
    const probe = window.__taskFlowViewerReady;
    if (probe.phases.at(-1) !== state.phase) probe.phases.push(state.phase);
    probe.stable = state.phase === 'open' && state.session?.lcosControlled?.requestKey === expected ? probe.stable + 1 : 0;
    return probe.stable >= 3;
  }, viewerKey, { polling: 'raf' });
  report.viewerLifecycle = await page.evaluate(() => window.__taskFlowViewerReady);
  await page.keyboard.press('Escape'); await reading.waitFor({ state: 'hidden' });
  await task.getByRole('heading', { name: instruction, exact: true }).waitFor();
  await page.getByRole('button', { name: '返回任务列表', exact: true }).click();
  await page.locator('[data-lcos-native-run-list]').waitFor();
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  await editor.waitFor({ state: 'visible' }); assert.equal(await editor.inputValue(), draft);
  assert.deepEqual(await page.evaluate(() => window.__LCOS_NODE_LAB__.api.getViewport()), camera);
  const final = await read(`/api/lcos/core/runs/${encodeURIComponent(runId)}/review`);
  assert.equal(final.run.status, 'created'); assert.equal(final.dispatch.status, 'planned');
  assert.deepEqual(report.blockedWrites, []); assert.deepEqual(report.pageErrors, []);
  await shot('03-return-original-input');
  report.checks.push('original task entry → same right rail → real created/planned Run', 'real persisted manifest → exact original Viewer',
    'Viewer Escape → same task → same list → original input/camera/draft', 'no model/dispatch/review-decision write');
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  try { await page?.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {}
}
finally { await browser?.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
