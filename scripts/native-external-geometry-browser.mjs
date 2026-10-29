import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const run = promisify(execFile), option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const origin = new URL(option('base-url') ?? 'http://127.0.0.1:56311').origin; assert.equal(new URL(origin).hostname, '127.0.0.1');
const canvasId = 'surface-core-main', otherCanvasId = 'surface-core-context', runtime = 'isolated-node-carry-20261020';
const output = path.resolve('output/原画布外部工具实时接入_20261023/真实页面/' + new Date().toISOString().replace(/[:.]/g, '-')); await fs.mkdir(output, { recursive: true });
const report = { passed: false, preparedOnly: !process.argv.includes('--execute-real-ui'), output, origin, checks: [], screenshots: [], writes: [], httpErrors: [], pageErrors: [], mcpCalls: [], modelsExecuted: 0 };
if (report.preparedOnly) { await fs.writeFile(path.join(output, 'prepared-plan.json'), JSON.stringify({ ...report,
 flow: ['Original opened synthetic text → real official MCP inspect_nodes → move 32/24 → same original node updates without reload or receive POST', 'Original keyboard Undo/Redo each persist once; MCP reads confirm', 'Original Context/Main navigation rejects old scene events and catches up on return', 'Held original pointer/text editor defers external geometry, then catches up after release', 'Original page refresh reads the same saved geometry'], maxMcpGeometryCommands: 4 }, null, 2)); console.log(JSON.stringify({ preparedOnly: true, output, modelCalls: 0 })); process.exit(0); }
assert.ok(option('expected-pid'));
const get = async route => { const response = await fetch(origin + route, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) }), result = await response.json(); assert.ok(response.ok); return result.value ?? result.data ?? result; };
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); assert.equal(health.realCoreConnected, true); assert.equal(health.runtimeLabel, runtime); report.pid = health.pid;
const prefix = '/api/canvas/v1/canvases/', batchPath = prefix + canvasId + '/nodes:batchActions';
let browser, page, nodeId, stage = 'opening', mcpGeometryCommands = 0, mcpReadCount = 0;
const json = value => JSON.stringify(value, (key, item) => /^(?:authorization|cookie|token|api[_-]?key|connectionToken|secret|password)$/i.test(key) ? '[REDACTED]' : item, 2);
async function mcp(tool, args) {
 if (tool === 'set_node_geometry') { assert.ok(mcpGeometryCommands < 4); mcpGeometryCommands++; } else mcpReadCount++;
 const basename = String(report.mcpCalls.length + 1).padStart(2, '0') + '-' + tool, input = path.join(output, basename + '-arguments.json'), file = path.join(output, basename + '-receipt.json');
 await fs.writeFile(input, json(args)); const record = { tool, args, receiptFile: file, submitted: false }; report.mcpCalls.push(record); await fs.writeFile(path.join(output, 'report.json'), json(report));
 // Credentials stay inside the official client and its ignored connection file.
 record.submitted = true;
 await run(option('python') ?? 'python', ['-X', 'utf8', 'scripts/native-space-kernel-mcp-client.py', '--runtime-label=' + runtime, '--canvas=' + canvasId, '--tool=' + tool, '--arguments-file=' + input, '--output=' + file], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
 const result = JSON.parse(await fs.readFile(file, 'utf8')); assert.equal(result.calls, 1); assert.notEqual(result.result.isError, true, 'Original MCP tool did not confirm. Do not replay unknown command.'); record.confirmed = true; return result.result.structuredContent;
}
const round = number => Math.round(number * 100) / 100, samePoint = (left, right) => round(left?.x) === round(right?.x) && round(left?.y) === round(right?.y);
function originalOpeningEcho(body, original) {
 if (body?.canvas_id !== canvasId || body.created_by_role !== 'user' || body.lcos_operation !== undefined
   || !Array.isArray(body.actions) || body.actions.length !== 1) return false;
 const action = body.actions[0];
 if (action.action !== 'update' || Object.keys(action).some(key => !['action', 'updates'].includes(key))
   || !Array.isArray(action.updates) || !action.updates.length) return false;
 for (const update of action.updates) {
  const source = original.nodes.find(node => node.id === update.id);
  if (!source || Object.keys(update).some(key => !['id', 'type', 'data', 'position', 'measured'].includes(key))) return false;
  for (const [key, value] of Object.entries(update)) if (!isDeepStrictEqual(value, source[key])) return false;
 }
 const revisions = body.lcos_expected_revisions;
 if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) return false;
 for (const [id, revision] of Object.entries(revisions)) {
  const source = original.nodes.find(node => node.id === id);
  if (!source || revision !== (original.lcos_expected_revisions?.[id] ?? source.data?.lcos_ref?.revisionId)) return false;
 }
 return true;
}
async function canonicalNode() { const canvas = await get(prefix + canvasId); assert.equal(canvas.id, canvasId); const node = canvas.nodes.find(row => row.id === nodeId); assert.ok(node); return node; }
async function inspect() { const result = await mcp('inspect_nodes', { ids: [nodeId] }); assert.equal(result.type, 'INSPECT_NODES'); assert.equal(result.result.nodes.length, 1); assert.equal(result.result.nodes[0].id, nodeId); return result.result.nodes[0]; }
async function move(position) { const result = await mcp('set_node_geometry', { items: [{ nodeId, position }] }); report.lastGeometryReceipt = result; assert.ok(samePoint((await inspect()).position, position)); }
try {
 const graph = await get('/api/lcos/core/projects/disposable-surface-core-facade/graph'); assert.equal(graph.project.id, 'disposable-surface-core-facade'); assert.match(graph.project.rootPath, /isolated-node-carry-20261020[\\/]synthetic-project$/);
 const canvas = await get(prefix + canvasId); assert.ok(Number.isSafeInteger(canvas.version)); let openingCanvas = canvas; const candidate = canvas.nodes.find(n => n.id === option('node-id')) ?? canvas.nodes.find(n => n.type === 'text' && !n.parentId && n.data?.lcos_ref?.entityType === 'artifact'); assert.ok(candidate); nodeId = candidate.id; report.nodeId = nodeId; report.before = candidate;
 const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core'); browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
 const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
 await context.route('**/*', async route => { const request = route.request(), url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { const row = { method: request.method(), path: url.pathname, stage, permitted: true }; report.writes.push(row);
   if (/collaboration-send|conversation-continuations|\/runs(?:$|\/)|:dispatch/.test(url.pathname)) { row.permitted = false; return route.abort(); }
   if (/^\/api\/lcos\/canvases\/surface-core-(?:main|context)\/execution:reconcile$/.test(url.pathname)) {
    row.originalProjection = true; row.body = JSON.parse(request.postData());
    if (request.method() !== 'POST' || !isDeepStrictEqual(row.body, {})) { row.permitted = false; return route.abort(); }
    const response = await route.fetch({ timeout: 60000 }), payload = await response.json();
    row.result = { status: response.status(), providerExecutionStarted: payload.data?.provider_execution_started, canvasId: payload.data?.canvas_id };
    return route.fulfill({ response });
   }
   if (url.pathname === batchPath) { row.body = JSON.parse(request.postData()); const targets = (row.body.actions ?? []).flatMap(a => a.updates ?? a.creates ?? []); row.targetNode = targets.some(n => n.id === nodeId);
    if (['opening', 'scene-return', 'refresh', 'pointer-diagnostic'].includes(stage) && originalOpeningEcho(row.body, openingCanvas)) row.originalOpeningEcho = true;
    else if (!['undo', 'redo'].includes(stage)) { row.permitted = false; return route.abort(); }
   }
  } return route.continue(); });
 await context.routeWebSocket('**/*', socket => socket.close()); page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.pageErrors.push(String(error))); page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
 const read = () => page.evaluate(() => { const host = window.__LCOS_NODE_LAB__; return { canvasId: host?.currentCanvasId || host?.canvasId, nodes: host?.api?.getNodes?.(), sync: host?.api?.inspectExternalGeometrySync?.(), document: performance.timeOrigin }; });
 const snapshot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file, mask: [page.locator('input[type=password],input[name*=token i],input[name*=key i],input[name*=secret i]')] }); report.screenshots.push(file); };
 const waitPosition = async position => { await page.waitForFunction(({ id, position }) => { const node = window.__LCOS_NODE_LAB__?.api?.getNode(id); return !!node && ['x', 'y'].every(key => Math.round(node.position[key] * 100) === Math.round(position[key] * 100)); }, { id: nodeId, position }, { timeout: 60000 }); };
 const waitIdle = async expectedCanvasId => page.waitForFunction(expected => { const host = window.__LCOS_NODE_LAB__, current = host?.currentCanvasId || host?.canvasId, state = host?.api?.inspectExternalGeometrySync?.(); return state?.active && state.canvasId === current && (!expected || current === expected) && state.appliedVersion !== undefined && state.appliedVersion >= state.desiredVersion && !state.working; }, expectedCanvasId, { timeout: 90000 });
 const open = async () => { await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 }); await waitIdle(); };
 const originalHoldPoint = async () => {
  const element = page.locator('.react-flow__node[data-id="' + nodeId + '"]'), initial = await element.boundingBox(); assert.ok(initial);
  // A ready Canvas may still be behind the original scene-transition layer.
  // Trial checks real actionability without clicking, dismissing or piercing it.
  await element.click({ trial: true, position: { x: initial.width / 2, y: 12 }, timeout: 60000 });
  const box = await element.boundingBox(); assert.ok(box); const point = { x: box.x + box.width / 2, y: box.y + 12 };
  await page.waitForFunction(({ id, point }) => document.elementFromPoint(point.x, point.y)?.closest('.react-flow__node')?.getAttribute('data-id') === id, { id: nodeId, point }, { timeout: 30000 });
  return { box, point };
 };
 await open(); const documentId = (await read()).document; report.beforeMcp = await inspect(); assert.ok(samePoint(report.beforeMcp.position, candidate.position));
 if (process.argv.includes('--diagnose-pointer') || process.argv.includes('--diagnose-pointer-after-scene-return') || process.argv.includes('--verify-pointer-from-current')) {
  const verify = process.argv.includes('--verify-pointer-from-current');
  if (process.argv.includes('--diagnose-pointer-after-scene-return') || process.argv.includes('--after-scene-return')) {
   await page.evaluate(() => { const host = window.__LCOS_NODE_LAB__; window.__LCOS_SCENE_DIAGNOSTIC__ = { api: host.api, inspect: host.api.inspectExternalGeometrySync }; });
   report.sceneProbe = [{ phase: 'before', ...(await read()) }];
   stage = 'scene'; await page.getByRole('button', { name: 'Context', exact: true }).click();
   await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === id, otherCanvasId); await waitIdle(otherCanvasId);
   report.sceneProbe.push({ phase: 'context', ...(await read()) });
   stage = 'scene-return'; openingCanvas = await get(prefix + canvasId); await page.getByRole('button', { name: 'Main', exact: true }).click();
   await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === id, canvasId); await waitIdle(canvasId);
   report.sceneProbe.push({ phase: 'returned', ...(await read()), ...(await page.evaluate(() => { const host = window.__LCOS_NODE_LAB__, initial = window.__LCOS_SCENE_DIAGNOSTIC__, identity = { sameInitialApi: host.api === initial.api, sameInitialInspect: host.api.inspectExternalGeometrySync === initial.inspect }; delete window.__LCOS_SCENE_DIAGNOSTIC__; return identity; })) });
   assert.equal(report.sceneProbe[2].canvasId, canvasId); assert.equal(report.sceneProbe[2].sync.canvasId, canvasId);
   report.checks.push('Original Context/Main return confirms current host and sync Canvas owner before pointer measurement');
  }
  stage = 'pointer-diagnostic';
  const { box, point } = await originalHoldPoint(); report.pointerProbe = { box, point, maxGeometryCommands: verify ? 1 : 0 };
  await page.evaluate(({ point, id }) => {
   const api = window.__LCOS_NODE_LAB__?.api, inspect = api?.inspectExternalGeometrySync;
   const describe = target => target instanceof Element ? { tag: target.tagName, classes: String(target.className ?? ''), nodeId: target.closest('[data-id]')?.getAttribute('data-id'), inReactFlow: !!target.closest('.react-flow') } : { kind: String(target) };
   const events = [], handlers = [], samples = [];
   const sample = () => ({ at: performance.now(), sameApi: api === window.__LCOS_NODE_LAB__?.api, sameInspect: inspect === window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync, focus: describe(document.activeElement), sync: window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync?.(), nodes: window.__LCOS_NODE_LAB__?.api?.getNodes?.().filter(node => node.id === id).map(node => ({ id: node.id, position: node.position, selected: node.selected, dragging: node.dragging, resizing: node.resizing })) });
   for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'blur', 'focus', 'visibilitychange']) {
    const owner = type === 'blur' || type === 'focus' ? window : document;
    const handler = event => events.push({ type, at: performance.now(), target: describe(event.target), buttons: event.buttons, pointerId: event.pointerId, path: event.composedPath().filter(target => target instanceof Element).slice(0, 10).map(describe), ...sample() });
    owner.addEventListener(type, handler, true); handlers.push(() => owner.removeEventListener(type, handler, true));
   }
   const interval = setInterval(() => { if (samples.length < 1200) samples.push(sample()); }, 100);
   window.__LCOS_POINTER_DIAGNOSTIC__ = { events, samples, sample, hit: document.elementsFromPoint(point.x, point.y).map(describe), close: () => { clearInterval(interval); handlers.forEach(remove => remove()); } };
  }, { point, id: nodeId });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await new Promise(resolve => setTimeout(resolve, 300));
  report.pointerProbe.afterDown = await page.evaluate(() => window.__LCOS_POINTER_DIAGNOSTIC__.sample());
  if (verify) {
   assert.equal(report.pointerProbe.afterDown.sync.interaction.pointerActive, true, 'No external command until the original pointer listener confirms held input.');
   assert.ok(samePoint(report.pointerProbe.afterDown.nodes[0]?.position, candidate.position));
   stage = 'held-pointer';
   const next = { x: round(candidate.position.x + 8), y: round(candidate.position.y + 6) }; report.pointerProbe.target = next;
   await move(next);
   await page.waitForFunction(() => { const sync = window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync?.(); return sync?.interaction?.pointerActive === true && sync.desiredVersion > sync.appliedVersion && sync.state?.status === 'deferred'; }, undefined, { timeout: 30000 });
  } else report.pointerProbe.mcpRead = await inspect();
  await new Promise(resolve => setTimeout(resolve, 700));
  report.pointerProbe.beforeUp = await page.evaluate(() => window.__LCOS_POINTER_DIAGNOSTIC__.sample());
  if (verify) {
   assert.equal(report.pointerProbe.beforeUp.sync.interaction.pointerActive, true);
   assert.ok(samePoint(report.pointerProbe.beforeUp.nodes[0]?.position, candidate.position), 'The held original node must keep its local geometry.');
  }
  await snapshot(verify ? '06-original-pointer-held-deferred' : 'pointer-diagnostic-held-zero-geometry'); await page.mouse.up();
  report.pointerProbe.events = await page.evaluate(() => { const probe = window.__LCOS_POINTER_DIAGNOSTIC__, result = { hit: probe.hit, events: probe.events, samples: probe.samples, final: probe.sample() }; probe.close(); delete window.__LCOS_POINTER_DIAGNOSTIC__; return result; });
  if (verify) {
   await waitPosition(report.pointerProbe.target); await waitIdle();
   assert.equal(report.writes.filter(row => row.path === batchPath && row.stage === 'held-pointer').length, 0);
   report.after = await canonicalNode(); assert.deepEqual(report.after.data, candidate.data);
   report.checks.push('One new official MCP move from current saved geometry defers while the original pointer is held and catches up after release; zero receiving save and unchanged content');
   await snapshot('07-pointer-release-catches-up'); stage = 'refresh'; openingCanvas = await get(prefix + canvasId);
   await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 }); await waitIdle(); await waitPosition(report.pointerProbe.target);
   report.afterRefresh = await canonicalNode(); assert.deepEqual(report.afterRefresh.data, candidate.data); assert.ok(samePoint((await inspect()).position, report.pointerProbe.target)); await snapshot('08-refresh-keeps-current-saved-geometry');
   assert.equal(mcpGeometryCommands, 1); report.checks.push('Original reload keeps the same actual saved geometry and content; the three previous confirmed commands were never replayed');
  } else { assert.equal(mcpGeometryCommands, 0); report.checks.push('Read-only pointer event/owner lifecycle diagnosis; no external geometry command'); }
  report.mcpGeometryCommands = mcpGeometryCommands; report.mcpReadCount = mcpReadCount;
  assert.ok(report.writes.filter(row => row.path === batchPath).every(row => row.originalOpeningEcho === true && row.permitted)); assert.deepEqual(report.pageErrors, []); report.passed = true;
 } else {
 stage = 'receive'; const moved = { x: round(candidate.position.x + 32), y: round(candidate.position.y + 24) }; await move(moved); await waitPosition(moved); await waitIdle();
 assert.equal((await read()).document, documentId); assert.equal(report.writes.filter(row => row.path === batchPath && row.stage === 'receive').length, 0); await snapshot('01-mcp-move-on-original-canvas');
 report.checks.push('Real official MCP move 32/24 updates the same original node without reload or any receiving-side node batch');
 const undoRedo = async (phase, expected) => { stage = phase; const beforeCount = report.writes.filter(row => row.path === batchPath).length;
  await page.keyboard.press('Escape'); await page.locator('.react-flow__pane').click({ position: { x: 80, y: 120 } });
  const responseWait = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === batchPath, { timeout: 60000 });
  await page.keyboard.press(phase === 'undo' ? 'Control+z' : 'Control+Shift+z');
  await waitPosition(expected); const saved = await responseWait; assert.equal(saved.status(), 200);
  const deadline = Date.now() + 60000; while (!samePoint((await canonicalNode()).position, expected)) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 200)); }
  assert.equal(report.writes.filter(row => row.path === batchPath).length, beforeCount + 1); assert.ok(samePoint((await inspect()).position, expected)); await snapshot(phase === 'undo' ? '02-original-undo-saved' : '03-original-redo-saved'); stage = 'observe'; };
 await undoRedo('undo', candidate.position); await undoRedo('redo', moved); report.checks.push('Original keyboard Undo and Redo persist exactly once each, confirmed by real MCP reads');
 stage = 'scene'; await page.getByRole('button', { name: 'Context', exact: true }).click(); await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === id, otherCanvasId); await waitIdle(); const beforeOther = await read();
 const offScene = { x: moved.x + 8, y: moved.y + 6 }; await move(offScene); await new Promise(resolve => setTimeout(resolve, 500)); const afterOther = await read(); assert.equal(afterOther.canvasId, otherCanvasId); assert.deepEqual(afterOther.nodes, beforeOther.nodes);
 stage = 'scene-return'; openingCanvas = await get(prefix + canvasId); await page.getByRole('button', { name: 'Main', exact: true }).click(); await page.waitForFunction(id => (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === id, canvasId); await waitIdle(); await waitPosition(offScene); await snapshot('04-scene-return-catches-up');
 report.checks.push('Leaving the original scene prevents old external events touching the other Canvas; return reads its actual version and catches up');
 stage = 'held-pointer'; const { point } = await originalHoldPoint(); await page.mouse.move(point.x, point.y); await page.mouse.down();
 assert.equal((await read()).sync?.interaction?.pointerActive, true, 'No external command until the original Canvas confirms the held pointer.');
 const heldMove = { x: offScene.x + 8, y: offScene.y + 6 }; await move(heldMove); await new Promise(resolve => setTimeout(resolve, 500)); assert.ok(samePoint((await read()).nodes.find(n => n.id === nodeId).position, offScene)); await snapshot('05-original-pointer-edit-protected'); await page.mouse.up(); await waitPosition(heldMove); await waitIdle();
 report.checks.push('A real held pointer on the original node preserves the in-progress interaction and applies committed geometry only after release');
 stage = 'refresh'; openingCanvas = await get(prefix + canvasId); await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 }); await waitIdle(); await waitPosition(heldMove); assert.ok(samePoint((await inspect()).position, heldMove)); await snapshot('06-refresh-keeps-saved-geometry');
 assert.equal(mcpGeometryCommands, 3); assert.ok(report.writes.filter(row => row.path === batchPath).every(row => (['undo', 'redo'].includes(row.stage) || row.originalOpeningEcho === true) && row.permitted)); assert.equal(report.writes.filter(row => !row.permitted && row.path === batchPath).length, 0); assert.deepEqual(report.pageErrors, []);
 report.after = await canonicalNode(); report.mcpGeometryCommands = mcpGeometryCommands; report.mcpReadCount = mcpReadCount;
 assert.ok(report.writes.filter(row => row.originalProjection).every(row => row.permitted && row.result?.status === 200 && row.result.providerExecutionStarted === false));
 report.passed = true;
 report.limitations = ['Real pointer edit protection is exercised; contenteditable and unconfirmed-save protection additionally have controlled original-owner regression coverage, not a claimed live typed-text mutation test.', 'Only existing-node geometry is connected; new nodes/content and Collection geometry retain their own original owners.'];
 }
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; if (page && report.pointerProbe) report.pointerProbe.failure = await page.evaluate(() => { const probe = window.__LCOS_POINTER_DIAGNOSTIC__; return probe ? { hit: probe.hit, events: probe.events, samples: probe.samples, final: probe.sample() } : null; }).catch(() => null); if (nodeId) { try { report.readBack = await inspect(); } catch { report.readBack = { unavailable: true, replayed: false }; } } if (page) { report.dom = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); } }
finally { await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), json(report)); console.log(json({ passed: report.passed, output, checks: report.checks, error: report.error, modelsExecuted: 0 })); }
