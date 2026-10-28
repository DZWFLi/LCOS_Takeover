import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const previousFile = process.argv.find(arg => arg.startsWith('--review-existing-report='))?.slice('--review-existing-report='.length);
const previous = previousFile ? JSON.parse(await fs.readFile(previousFile, 'utf8')) : undefined;
assert.ok(process.argv.includes('--execute-one-real-run') || previous, 'Explicitly create one local planned Run, or review the same confirmed Run; never dispatch it.');
if (previous) { assert.ok(previous.runId && previous.runPosts === 1); assert.equal(previous.response?.body?.ok, true); }
const expectedPid = Number(process.argv.find(arg => arg.startsWith('--expected-pid='))?.split('=')[1]);
const origin = 'http://127.0.0.1:56311', project = 'disposable-surface-core-facade', prefix = '/api/lcos/core/projects/' + project;
const main = 'surface-core-main', methodId = 'scope-workflow-c96e51c3-c0bb-4d92-86e2-7bfbf164e459';
const out = path.resolve('output/子现场真实任务_20261025', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(out, { recursive: true });
const report = { passed: false, checks: [], writes: [], errors: [], screenshots: [], runPosts: 0, modelExecuted: false, dispatched: false };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) }); assert.ok(response.ok, route); const d = await response.json(); return d.value ?? d.data ?? d; };
const health = await get('/health'); assert.equal(health.pid, expectedPid); assert.equal(health.realCoreConnected, true); report.pid = health.pid;
const graph = await get(prefix + '/graph'), method = graph.scopes.find(row => row.id === methodId), workspace = graph.workspaces.find(row => row.id === 'workspace:' + methodId);
assert.ok(method && workspace?.canvasId);
const conversations = await get(prefix + '/connected-conversations'), presentations = await get(prefix + '/presentations');
const canvases = new Map(await Promise.all([main, workspace.canvasId].map(async id => [id, await get('/api/canvas/v1/canvases/' + id)])));
let browser, page;
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()); if (url.origin !== origin) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      const body = req.postDataJSON(), row = { method: req.method(), path: url.pathname, permitted: false }; report.writes.push(row);
      if (url.pathname === '/api/events' || url.pathname.endsWith('/execution:reconcile')) row.permitted = true;
      else if (url.pathname === '/api/lcos/workflow/' + methodId + '/workspace:open') { assert.deepEqual(body, { workspaceId: workspace.id }); row.permitted = true; }
      else if (url.pathname.endsWith('/nodes:batchActions')) {
        const original = canvases.get(body.canvas_id);
        row.permitted = !!original && !body.lcos_operation && body.actions?.every(action => action.action === 'update' && action.updates?.every(node => {
          const old = original.nodes.find(item => item.id === node.id);
          return old && Object.entries(node).every(([key, value]) => ['id', 'type', 'position', 'data', 'measured'].includes(key) && equal(value, old[key]));
        }));
      } else if (url.pathname === prefix + '/runs') {
        assert.equal(report.runPosts, 0, 'Never replay a Run creation.'); assert.equal(body.instruction, report.instruction); assert.equal(body.workspaceId, workspace.id);
        assert.ok(body.orderedReferences?.length === 1); assert.ok(JSON.stringify(body).includes(report.reference.revisionId));
        report.runPosts++; report.intent = body; row.permitted = true; await save();
      }
      if (!row.permitted) return route.abort();
    }
    if (url.pathname === '/lcos/agent-ui.js') { const response = await route.fetch({ timeout: 120000 }); return route.fulfill({ response, body: await response.text() + '\nwindow.__WORKSITE_RUN_READ__=()=>{const s=useLcosShellStore.getState();return{target:s.composerTarget,prompt:s.composerPrompt,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,windows:s.windows,canvas:useCanvasStore.getState().canvasId}};' }); }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.errors.push(String(error)));
  const ready = () => page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 120000 });
  const read = () => page.evaluate(() => window.__WORKSITE_RUN_READ__());
  const shot = async name => { const file = path.join(out, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); await save(); };
  await page.goto(origin + '/canvas/' + main, { waitUntil: 'domcontentloaded', timeout: 120000 }); await ready();
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }), mainDraft = '主现场保留草稿：不要提交到方法现场。'; await input.fill(mainDraft);
  const gallery = page.locator('[data-native-workflow-gallery]'), preview = gallery.locator('[data-native-workflow-preview]');
  const open = async () => { const more = page.getByRole('button', { name: '浏览全部', exact: true }); if (!await more.isVisible()) await page.getByTestId('canvas-dockbar-workflow-btn').click(); const guide = page.getByRole('button', { name: '知道了', exact: true }); if (await guide.isVisible()) await guide.click(); await more.click(); await gallery.getByText(method.name, { exact: true }).first().click(); };
  await open(); await preview.getByRole('button', { name: '进入工作现场', exact: true }).click();
  await page.waitForFunction(id => window.__WORKSITE_RUN_READ__().canvas === id && window.__WORKSITE_RUN_READ__().target?.nodeId === 'canvas:' + id, workspace.canvasId); await ready();
  assert.equal((await read()).prompt, ''); assert.deepEqual((await read()).refs, []);
  report.instruction = previous?.instruction ?? '人工子现场任务验证 ' + new Date().toISOString() + '：只核对当前引用；本轮保持待执行。';
  await input.fill(report.instruction); await open(); await preview.getByRole('button', { name: '查看 Context · 资料现场', exact: true }).click();
  const viewer = page.locator('[data-media-viewer]'); await viewer.waitFor(); await page.getByRole('button', { name: '加入当前输入', exact: true }).click(); await viewer.waitFor({ state: 'hidden' }); await gallery.waitFor({ state: 'hidden' });
  const before = await read(); assert.equal(before.target.workspaceId, workspace.id); assert.equal(before.refs.length, 1); report.reference = before.refs[0]; await shot('01-child-exact-input');
  let review;
  if (previous) { report.runId = previous.runId; report.creationEvidence = path.resolve(previousFile); review = await get('/api/lcos/core/runs/' + report.runId + '/review'); }
  else {
    const response = page.waitForResponse(row => row.request().method() === 'POST' && new URL(row.url()).pathname === prefix + '/runs', { timeout: 120000 });
    await page.getByRole('button', { name: '提交', exact: true }).click(); const actual = await response; report.response = { status: actual.status(), body: await actual.json() }; await save(); assert.ok(actual.ok() && report.response.body.ok);
    const result = report.response.body.value; review = result.review ?? result; assert.ok(review.run?.id); report.runId = review.run.id;
    await page.waitForFunction(() => window.__WORKSITE_RUN_READ__().prompt === '');
  }
  assert.equal(review.run.workspaceId, workspace.id); assert.equal(review.run.instruction, report.instruction); assert.equal(review.run.status, 'created'); assert.equal(review.dispatch.status, 'planned');
  const recipe = await get('/api/lcos/core/runs/' + report.runId + '/recipe'), manifest = await get(prefix + '/context-manifests/v0/' + recipe.contextManifestId);
  const canonical = JSON.parse(manifest.canonicalJson); assert.ok(canonical.orderedItems.some(item => item.revisionId === report.reference.revisionId)); report.recipe = recipe; report.contextManifest = manifest;
  report.checks.push(previous ? 'Read back the exact previously confirmed Run and exact Revision without repeating its creation; it remains created/planned.' : 'One original child Composer submission creates exactly one real Core Run in that exact Workspace with its exact referenced Revision; original execution remains created/planned, no model dispatch.');
  if (process.argv.includes('--verify-canvas-node')) {
    assert.ok(previous, 'Inspect an already confirmed task; never create another.');
    const carrier = (await get('/api/canvas/v1/canvases/' + workspace.canvasId)).nodes.find(node => node.type === 'lcos-execution' && node.data?.lcos_execution_ref?.entityId === report.runId);
    assert.ok(carrier); report.carrierId = carrier.id;
    const glyph = page.locator('[data-lcos-native-execution-node="' + carrier.id + '"][data-lcos-native-execution-availability="ready"]');
    await glyph.waitFor({ state: 'visible' }); assert.ok(!(await glyph.innerText()).includes('状态暂不可用')); await shot('01b-ready-child-task-node');
    await glyph.locator('.lcos-execution-body').dblclick();
    report.checks.push('The actual child Run carrier renders its original available status and double-click opens its exact original task; root navigation mapping was not overwritten.');
  }
  else if (previous) { await page.locator('[data-lcos-native-chat-header]').getByRole('button', { name: '查看任务', exact: true }).click(); await page.locator('[data-lcos-native-run-list-item="' + report.runId + '"]').getByRole('button').click(); }
  else await page.locator('[data-lcos-composer]').getByRole('button', { name: '查看任务', exact: true }).click();
  const task = page.locator('[data-native-task-detail]');
  await task.getByRole('heading', { name: report.instruction, exact: true }).waitFor(); assert.equal(await page.locator('[data-lcos-window-body="run-review"]').count(), 0); await shot('02-original-task-detail');
  if (await page.getByRole('button', { name: '返回任务列表', exact: true }).isVisible()) await page.getByRole('button', { name: '返回任务列表', exact: true }).click();
  await page.getByRole('button', { name: '返回对话', exact: true }).click(); await input.waitFor();
  await page.getByTestId('canvas-header-logo-button').click(); await page.waitForFunction(id => window.__WORKSITE_RUN_READ__().canvas === id, main); await ready();
  await gallery.waitFor(); await gallery.getByTestId('common-dialog-close-btn').click(); if (await page.getByRole('button', { name: '浏览全部', exact: true }).isVisible()) await page.getByTestId('canvas-dockbar-workflow-btn').click();
  await page.waitForFunction(text => window.__WORKSITE_RUN_READ__().prompt === text, mainDraft); assert.deepEqual((await read()).windows, []); await shot('03-main-draft-kept');
  const final = await get('/api/lcos/core/runs/' + report.runId + '/review'); assert.equal(final.run.status, 'created'); assert.equal(final.dispatch.status, 'planned');
  assert.deepEqual(await get(prefix + '/connected-conversations'), conversations); assert.deepEqual(await get(prefix + '/presentations'), presentations);
  for (const [id, original] of canvases) { const current = await get('/api/canvas/v1/canvases/' + id); assert.deepEqual(current.nodes.filter(node => node.data?.lcos_ref), original.nodes.filter(node => node.data?.lcos_ref)); }
  assert.equal(report.runPosts, previous ? 0 : 1); assert.deepEqual(report.errors, []); assert.ok(report.writes.every(row => row.permitted)); report.passed = true;
  report.checks.push('Original task details open in the existing right panel, return to the same Composer, and original method return restores the untouched Main draft; no separate task window.');
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; if (page) { report.visible = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); } }
finally { await save(); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, runId: report.runId, runPosts: report.runPosts, output: out, error: report.error, checks: report.checks }, null, 2));
