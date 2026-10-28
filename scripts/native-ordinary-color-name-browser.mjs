import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const execute = process.argv.includes('--execute-real-ui'),readonlyConsole=process.argv.includes('--readonly-console');
const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:56331', runtime = 'isolated-ordinary-frame-20261028-9dc7ede7';
const project = 'disposable-surface-core-facade', canvasId = 'surface-core-main', nodeId = 'ordinary-frame';
const base = '/api/lcos/core/projects/' + project, canvasPath = '/api/canvas/v1/canvases/' + canvasId;
const fixtureFile = path.join(root, 'output/普通Frame导航颜色_20261028/2026-10-27T16-41-53-647Z/report.json');
if (!execute) {
  console.log(JSON.stringify({ preparedOnly: true, script: import.meta.filename, origin, runtime, nodeId,
    requires: 'Root solewriter authorization, Frame GUI PASS, then --execute-real-ui --expected-pid=N --expected-file-count=7',
    flow: 'Original orange header inline first name → MCP exact CAS/name → original user CAS/name → stale known edit refuses. Original palette adds red → start absent-definition edit → MCP absence-create → old user input refuses. Original palette removes red, reload retains orange and exact hierarchy/files. Leave at most two explicitly recorded named definitions, zero memberships. No model/setter/geometry write or automatic cleanup.' }));
  process.exit(0);
}
const pid = Number(option('expected-pid')), expectedFileCount = Number(option('expected-file-count') ?? 7);
assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Exact current Core PID required');
assert.equal(expectedFileCount, 7, 'This script only owns the existing seven-file isolated Frame fixture');
const output = path.resolve(option('output-root') ?? path.join(root, 'output/普通颜色组独立命名_20261028/真实原页', new Date().toISOString().replace(/[:.]/g, '-')));
await fs.mkdir(output, { recursive: true });
const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
assert.equal(fixture.passed, true); assert.equal(fixture.runtimeLabel, runtime); assert.equal(fixture.canvasId, canvasId);
const orange = '#F4A14B', red = '#F0606B', run = promisify(execFile), ownedDefinitions = new Map();
const report = { passed: false, origin, runtime, expectedPid: pid, expectedFileCount, fixtureFile, canvasId, nodeId,
  scope: 'Real original header m7/y7 inline first naming and CAS edits, original Hie palette, installed MCP rename. No fake target/member, model, DOM/store setter or synthesized mouse events.',
  readonlyConsole, checks: [], writes: [], mcpCalls: [], streams: [], blocked: [], routeErrors: [], pageErrors: [], consoleSummary: [], screenshots: [],
  unknownWrite: false, modelCalls: 0, productSetters: 0, noAutomaticCleanup: true, allowedDefinitionDelta: [] };
let browser, context, page, before, beforeBytes, beforeNodeBytes, permit, stage = 'preflight', workspaceId;
const get = async route => {
  assert.ok(route.startsWith('/') && !route.startsWith('//'));
  const response = await fetch(origin + route, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route); const body = await response.json();
  assert.ok(body.ok === true || body.code === 0 || route === '/health', route); return body.value ?? body.data ?? body;
};
const health = async () => { const value = await get('/health'); assert.equal(value.pid, pid); assert.equal(value.runtimeLabel, runtime); assert.equal(value.realCoreConnected, true); };
async function facts(name) {
  await health();
  const keys = ['graph', 'presentations', 'bindings', 'execution', 'markers', 'operations', 'connected', 'sessions', 'colors'];
  const routes = ['/graph', '/presentations', '/spatial/bindings', '/execution-projection', '/spatial-markers', '/conversation-continuations', '/connected-conversations', '/conversations', '/color-pins'];
  const data = Object.fromEntries((await Promise.all(routes.map(route => get(base + route)))).map((value, index) => [keys[index], value]));
  data.messages = {};
  for (const session of data.sessions) {
    const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
    assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false);
    const rows = Array.isArray(payload) ? payload : payload.messages ?? payload.items; assert.ok(Array.isArray(rows)); data.messages[session.id] = rows;
  }
  data.canvases = {};
  for (const id of new Set(data.graph.workspaces.map(workspace => workspace.canvasId).filter(Boolean)))
    data.canvases[id] = await get('/api/canvas/v1/canvases/' + encodeURIComponent(id));
  await fs.writeFile(path.join(output, name + '.json'), JSON.stringify(data, null, 2)); return data;
}
async function bytes(ids) {
  const rows = new Map();
  for (const id of ids) { const response = await fetch(origin + base + '/file-records/' + encodeURIComponent(id) + '/content',
    { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200);
    rows.set(id, { type: response.headers.get('content-type'), body: Buffer.from(await response.arrayBuffer()) }); }
  return rows;
}
async function nodeFiles(directory = path.join(root, '.runtime', runtime, 'huabu-workspace')) {
  const files = new Map();
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) for (const [id, body] of await nodeFiles(file)) files.set(id, body);
    else if (entry.isFile() && entry.name.endsWith('.md') && path.basename(directory) === 'nodes') files.set(file, await fs.readFile(file));
  }
  return files;
}
async function wait(read, accepted, label, timeout = 30000) {
  let last; const end = Date.now() + timeout;
  do { last = await read(); if (accepted(last)) return last; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < end);
  report.lastPoll = { label, last }; throw Error(label + ' timed out');
}
const colorFacts = () => get(base + '/color-pins');
const liveFrame = async () => { const nodes = (await get(canvasPath)).nodes.filter(node => node.id === nodeId); assert.equal(nodes.length, 1); return nodes[0]; };
const snap = () => page.evaluate(() => window.__ORDINARY_NAME_READ__());
const screenshot = async label => { const file = path.join(output, label + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); return file; };
function rememberDefinition(definition, expectedColor, label) {
  assert.ok(definition && definition.projectId === project && definition.color.toUpperCase() === expectedColor && definition.label === label);
  assert.ok(definition.id && definition.createdAt && definition.updatedAt);
  const previous = ownedDefinitions.get(definition.id);
  if (previous) { assert.equal(previous.color, definition.color); assert.equal(previous.createdAt, definition.createdAt); }
  else { assert.ok(![...ownedDefinitions.values()].some(row => row.color === definition.color)); assert.ok(ownedDefinitions.size < 2); }
  ownedDefinitions.set(definition.id, structuredClone(definition));
  report.allowedDefinitionDelta = [...ownedDefinitions.values()];
}
async function mcpRename(args, expectedColor, label) {
  await health(); assert.equal(report.unknownWrite, false);
  const index = report.mcpCalls.length + 1, argfile = path.join(output, 'mcp-' + index + '-args.json'), receipt = path.join(output, 'mcp-' + index + '-receipt.json');
  const row = { tool: 'rename_color_pin', args, submitted: false, confirmed: false, receipt }; report.mcpCalls.push(row);
  await fs.writeFile(argfile, JSON.stringify(args)); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  row.submitted = true; report.unknownWrite = true;
  await run(option('python') ?? 'C:/Users/1/AppData/Local/Programs/Python/Python312/python.exe', ['-X', 'utf8', 'scripts/native-space-kernel-mcp-client.py',
    '--runtime-label=' + runtime, '--canvas=' + canvasId, '--tool=rename_color_pin', '--arguments-file=' + argfile, '--output=' + receipt],
  { cwd: root, windowsHide: true, timeout: 65000, maxBuffer: 1000000 });
  const result = JSON.parse(await fs.readFile(receipt, 'utf8')); assert.equal(result.calls, 1); row.result = result.result;
  assert.equal(result.result.isError, false, 'Unknown/rejected MCP result stops; never resubmit');
  const value = result.result.structuredContent; assert.equal(value.status, 'confirmed'); rememberDefinition(value.definition, expectedColor, label);
  row.confirmed = true; report.unknownWrite = false; return value.definition;
}
async function exactImageNoop(route, row, body) {
  if (body && Object.keys(body).every(key => ['canvas_id', 'actions', 'created_by_role', 'lcos_expected_revisions'].includes(key))
    && body.canvas_id === canvasId && (body.created_by_role === undefined || body.created_by_role === 'user')
    && Array.isArray(body.actions) && body.actions.length === 1 && body.actions[0]?.action === 'update'
    && Object.keys(body.actions[0]).every(key => ['action', 'updates'].includes(key)) && Array.isArray(body.actions[0].updates) && body.actions[0].updates.length > 0) {
    const current = await get(canvasPath), updates = body.actions[0].updates, ids = new Set();
    const unchanged = updates.every(patch => { const node = current.nodes.find(node => node.id === patch.id);
      if (!node || node.type !== 'image' || ids.has(node.id) || Object.keys(patch).some(key => !['id', 'type', 'data', 'position', 'measured'].includes(key))) return false;
      ids.add(node.id); return Object.entries(patch).every(([key, value]) => value !== undefined && same(value, node[key])); });
    const refs = body.lcos_expected_revisions;
    const exactRevisions = refs === undefined || refs && typeof refs === 'object' && !Array.isArray(refs)
      && Object.entries(refs).every(([id, revision]) => { const node = current.nodes.find(node => node.id === id); return node && revision === (node.data?.lcos_ref?.revisionId ?? node.lcos_revision_id); });
    if (unchanged && exactRevisions) {
      row.allowed = true; row.semantic = 'original exact current DTO image no-op initialization echo'; row.before = updates.map(patch => current.nodes.find(node => node.id === patch.id));
      const response = await route.fetch({ maxRedirects: 0, timeout: 45000 }); row.status = response.status(); row.response = await response.json();
      assert.ok(response.ok() && row.response.code === 0, 'Original sameDTO image no-op actual receipt'); await route.fulfill({ response }); return true;
    }
  }
  return false;
}
async function userWrite(kind, body, action, definitionId) {
  assert.equal(report.unknownWrite, false);
  if (kind === 'rename') assert.ok(ownedDefinitions.has(definitionId), 'Only this script acknowledged exact definition can be renamed');
  permit = { kind, body, ...(kind === 'rename' ? { definitionId } : {}), used: false, settled: false }; const captured = permit;
  await action(); await wait(() => Promise.resolve(captured), value => value.used && value.settled, 'One original ' + kind + ' receipt');
  assert.equal(captured.confirmed, true, 'Unconfirmed original action stops without replay'); permit = undefined; return captured.definition;
}
async function headerColor(color) {
  const all = page.locator('button');
  const indices = await all.evaluateAll((buttons, value) => { const rgb = 'rgb(' + value.slice(1).match(/../g).map(x => parseInt(x, 16)).join(', ') + ')';
    return buttons.flatMap((button, index) => button.classList.contains('h-5') && button.classList.contains('w-7')
      && [...button.querySelectorAll('span')].some(span => getComputedStyle(span).backgroundColor === rgb) ? [index] : []); }, color);
  assert.equal(indices.length, 1, 'One original same-color header group'); return all.nth(indices[0]);
}
const menu = () => page.getByRole('menu');
const renameInput = () => menu().getByRole('textbox', { name: '颜色组名称（本项目）', exact: true });
async function openGroup(color) { const button = await headerColor(color); await button.click(); await menu().waitFor(); assert.equal(await menu().count(), 1); return menu(); }
async function beginRename() {
  const control = menu().getByRole('menuitem', { name: /重命名|改名|Rename/i });
  assert.equal(await control.count(), 1, 'Original rename menu item identified by its accessible name'); assert.equal(await control.isDisabled(), false);
  await control.click(); await renameInput().waitFor(); assert.equal(await renameInput().count(), 1); assert.ok((await menu().innerText()).includes('项目共享'));
}
async function committedName(color, label, kind, definition) {
  await beginRename(); await renameInput().fill(label);
  const body = kind === 'create' ? { color, label, expectedDefinitionId: null }
    : { label, expectedLabel: definition.label ?? null, expectedUpdatedAt: definition.updatedAt };
  const result = await userWrite(kind, body, () => renameInput().press('Enter'), definition?.id);
  await renameInput().waitFor({ state: 'hidden' });
  await wait(colorFacts, facts => facts.definitions.some(row => row.id === result.id && row.label === label), 'Original saved definition and name');
  await wait(async () => (await headerColor(color)).getAttribute('aria-label'), value => value?.includes(label), 'Same original header reflects name'); return result;
}
async function unchangedReader(beforeState, label, focus = false) {
  const after = await snap(); assert.deepEqual(after.viewport, beforeState.viewport, label + ' camera'); assert.equal(after.document, beforeState.document, label + ' document');
  assert.equal(after.input, beforeState.input, label + ' composer text'); assert.deepEqual(after.inputTarget, beforeState.inputTarget, label + ' same input'); assert.deepEqual(after.windows, beforeState.windows, label + ' no window');
  if (focus) assert.deepEqual(after.focus, beforeState.focus, label + ' focus/caret'); return after;
}
async function staleSubmit(expectedLabel, message) {
  const inputValue = await renameInput().inputValue(), writes = report.writes.filter(row => row.allowed && /^original user/.test(row.semantic ?? '')).length;
  await renameInput().press('Enter');
  await wait(async () => menu().innerText(), text => message.test(text), 'Original stale rename rejection');
  assert.equal(await renameInput().inputValue(), inputValue); assert.equal(await renameInput().getAttribute('readonly'), null);
  assert.equal(report.writes.filter(row => row.allowed && /^original user/.test(row.semantic ?? '')).length, writes, 'Stale observed input dispatched no new mutation');
  assert.equal(report.writes.filter(row => row.stage === stage && row.blockedUnexpectedNameWrite).length, 0, 'No mutation attempt hidden by harness');
  assert.ok((await colorFacts()).definitions.some(row => row.label === expectedLabel));
}
async function readableControl(control, label) {
  const observation = await control.evaluate(element => {
    const rect = element.getBoundingClientRect(), points = [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]];
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
      inViewport: rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + .5 && rect.bottom <= innerHeight + .5,
      hits: points.map(([dx, dy]) => { const hit = document.elementFromPoint(rect.left + rect.width * dx, rect.top + rect.height * dy); return hit === element || !!hit && element.contains(hit); }),
      viewport: { width: innerWidth, height: innerHeight }, text: element instanceof HTMLInputElement ? element.value : element.textContent };
  });
  assert.equal(observation.inViewport, true, label + ' is entirely within the viewport');
  assert.ok(observation.hits.every(Boolean), label + ' five real hit-test points are unobstructed'); return observation;
}
async function narrowOriginalEditor() {
  stage = 'narrow-original-menu-readonly'; await page.setViewportSize({ width: 360, height: 800 });
  await wait(async () => (await headerColor(orange)).isVisible(), Boolean, 'Original narrow orange header');
  const sameOwner = await snap(), writesBefore = report.writes.length; await openGroup(orange); await beginRename();
  const input = await readableControl(renameInput(), 'Original 360×800 inline name input');
  const panel = await menu().evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5 }; });
  assert.equal(panel.inViewport, true, 'Original narrow menu keeps all its editing controls within the viewport');
  assert.ok((await menu().innerText()).includes('项目共享')); assert.equal(await renameInput().inputValue(), '灵感橙');
  await screenshot('06-narrow-original-inline-and-project-shared');
  const originalWrites = report.writes.filter(row => row.allowed && /^original user/.test(row.semantic ?? '')).length;
  await renameInput().press('Escape'); await renameInput().waitFor({ state: 'hidden' }); await page.keyboard.press('Escape'); await menu().waitFor({ state: 'hidden' });
  await unchangedReader(sameOwner, 'Original narrow editor cancellation'); assert.equal(context.pages().length, 1);
  assert.equal(report.writes.filter(row => row.allowed && /^original user/.test(row.semantic ?? '')).length, originalWrites);
  assert.deepEqual(report.writes.slice(writesBefore).filter(row => !['original exact current DTO image no-op initialization echo', 'original exact-canvas projection synchronization, not Run execution'].includes(row.semantic)), [], 'Narrow observation dispatches no business write, including blocked attempts');
  report.narrowEditor = { viewport: { width: 360, height: 800 }, input, panel, originalCancel: true, mutationRequests: 0, newWindows: 0,
    notCovered: '360×400 was not exercised by this naming-only script; no claim about short-height editing controls.' };
  report.checks.push('360×800 original header/menu/inline input is inside the viewport and hit-testable; original Escape cancellation has no mutation or new window');
  await page.setViewportSize({ width: 1500, height: 1000 });
}
async function selectFrame() {
  const view = page.locator('.react-flow__node[data-id="ordinary-frame"]');
  const point = await wait(() => view.evaluate(element => { const rect = element.getBoundingClientRect();
    for (const [dx, dy] of [[.5, .95], [.08, .9], [.92, .9], [.5, .5], [.1, .2], [.9, .2]]) {
      const x = rect.left + rect.width * dx, y = rect.top + rect.height * dy, target = document.elementFromPoint(x, y);
      if (target?.closest('.react-flow__node') === element && !target.closest('button,input,textarea,[contenteditable="true"]')) return { x, y };
    } return null; }), Boolean, 'Original outer Frame has its own real unobstructed point');
  if (!(await snap()).selected.includes(nodeId)) { await page.mouse.click(point.x, point.y); await wait(snap, value => value.selected.includes(nodeId), 'Original Frame selected'); }
  const blank = await page.evaluate(() => { const pane = document.querySelector('.react-flow__pane'), rect = pane?.getBoundingClientRect(); if (!rect) return null;
    for (const [dx, dy] of [[.08, .08], [.9, .1], [.1, .8], [.9, .8]]) { const x = rect.left + rect.width * dx, y = rect.top + rect.height * dy, element = document.elementFromPoint(x, y);
      if (element?.closest('.react-flow') && !element.closest('.react-flow__node,button,input,textarea')) return { x, y }; } return null; });
  assert.ok(blank); await page.mouse.move(blank.x, blank.y); await page.mouse.move(point.x, point.y);
  const toolbar = view.locator('[data-testid="canvas-node-toolbar"]:visible'); await toolbar.waitFor(); assert.equal(await toolbar.count(), 1); return toolbar;
}
async function setRed(present) {
  const toolbar = await selectFrame(), trigger = toolbar.getByRole('button', { name: /颜色标记|^Pin$|^已\s*Pin[:：]|^Pinned:|color pin/i });
  assert.equal(await trigger.count(), 1); assert.equal(await trigger.isDisabled(), false); await trigger.click();
  const palette = page.locator('[data-native-colorpin-popover]'); await palette.waitFor();
  const indices = await palette.locator('button[aria-pressed]').evaluateAll(buttons => buttons.flatMap((button, index) => [button, ...button.querySelectorAll('*')]
    .some(element => getComputedStyle(element).backgroundColor === 'rgb(240, 96, 107)') ? [index] : []));
  assert.equal(indices.length, 1); const dot = palette.locator('button[aria-pressed]').nth(indices[0]);
  assert.equal(await dot.getAttribute('aria-pressed'), String(!present));
  await userWrite('color', { type: 'SET_COLOR_PIN', nodeId, color: red, present }, () => dot.click());
  await wait(async () => ({ pressed: await dot.getAttribute('aria-pressed'), disabled: await dot.isDisabled() }), value => value.pressed === String(present) && !value.disabled, 'Original red palette readback');
  await wait(liveFrame, node => node.data.color_pins.includes('F0606B') === present, 'Original saved red membership');
  await page.keyboard.press('Escape'); await palette.waitFor({ state: 'hidden' });
}

try {
  before = await facts('facts-before'); beforeBytes = await bytes(before.graph.fileRecords.map(file => file.id)); assert.equal(beforeBytes.size, expectedFileCount);
  beforeNodeBytes = await nodeFiles(); assert.ok(beforeNodeBytes.size > 0, 'Existing original Huabu node source files are protected');
  const owners = before.graph.workspaces.filter(workspace => workspace.canvasId === canvasId); assert.equal(owners.length, 1); workspaceId = owners[0].id;
  if(!readonlyConsole)assert.deepEqual(before.colors.definitions, [], 'Existing raw-only fixture; no prior named definition may be overwritten'); assert.deepEqual(before.colors.memberships, []);
  const frame = before.canvases[canvasId].nodes.find(node => node.id === nodeId); assert.equal(frame?.type, 'group'); assert.equal(frame.data.createdBy, 'client'); assert.equal(frame.data.layoutType, 'none');
  assert.deepEqual(frame.data.color_pins, ['F4A14B']);
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (['blob:', 'data:'].includes(url.protocol)) return route.continue();
      if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) {
        report.blocked.push({ stage, path: url.pathname, method, reason: 'foreign origin/project/protocol' }); return route.abort();
      }
      if (/event-stream/i.test(request.headers().accept ?? '') || method === 'GET' && /\/sync\/stream$|\/events$/.test(url.pathname)) {
        const allowed = [base + '/events', '/api/canvas/' + canvasId + '/sync/stream'].includes(url.pathname); report.streams.push({ path: url.pathname, allowed }); if (!allowed) return route.abort();
      }
      if (method === 'GET' && url.pathname === '/lcos/agent-ui.js') {
        const response = await route.fetch({ maxRedirects: 0, timeout: 120000 }), source = await response.text();
        for (const name of ['useCanvasStore', 'useLcosShellStore']) assert.match(source, new RegExp('\\b' + name + '\\b'));
        return route.fulfill({ response, body: source + '\nwindow.__ORDINARY_NAME_READ__=()=>{const c=useCanvasStore.getState(),s=useLcosShellStore.getState(),e=document.activeElement;return{canvas:c.canvasId,status:c.status,workspace:s.activeWorkspaceId,selected:c.selectedNodeIds,viewport:c.rfInstance?.getViewport?.(),input:s.composerPrompt,inputTarget:s.composerTarget,windows:s.windows,document:performance.timeOrigin,focus:{tag:e?.tagName,id:e?.id,value:e instanceof HTMLInputElement?e.value:null,start:e instanceof HTMLInputElement?e.selectionStart:null,end:e instanceof HTMLInputElement?e.selectionEnd:null}}};' });
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue();
      const row = { stage, path: url.pathname, method, allowed: false }; report.writes.push(row); let body;
      try { body = request.postDataJSON(); } catch { body = null; } row.body = body;
      if (method === 'POST' && url.pathname === canvasPath + '/nodes:batchActions' && await exactImageNoop(route, row, body)) return;
      if (method === 'POST' && url.pathname === '/api/lcos/canvases/' + canvasId + '/execution:reconcile' && same(body, {})) {
        row.allowed = true; row.semantic = 'original exact-canvas projection synchronization, not Run execution';
        const response = await route.fetch({ maxRedirects: 0, timeout: 45000 }); row.status = response.status(); row.response = await response.json(); return route.fulfill({ response });
      }
      const op = permit;
      const allowed = op && !op.used && same(body, op.body) && (op.kind === 'create' && method === 'POST' && url.pathname === base + '/color-pins/definitions'
        || op.kind === 'rename' && method === 'PATCH' && url.pathname === base + '/color-pins/definitions/' + encodeURIComponent(op.definitionId)
        || op.kind === 'color' && method === 'POST' && url.pathname === '/api/lcos/canvases/' + canvasId + '/gui');
      if (!allowed) {
        if (/\/color-pins\/definitions(?:\/|$)/.test(url.pathname)) row.blockedUnexpectedNameWrite = true;
        report.blocked.push(row); return route.abort();
      }
      op.used = true; row.allowed = true; row.semantic = 'original user ' + op.kind; report.unknownWrite = true;
      const response = await route.fetch({ maxRedirects: 0, timeout: 45000 }), payload = await response.json(), value = payload.value ?? payload.data;
      row.status = response.status(); row.response = payload; assert.ok(response.ok() && (payload.ok === true || payload.code === 0));
      if (op.kind === 'color') { assert.equal(value.status, 'confirmed'); assert.deepEqual(value.nativeNode, { canvasId, nodeId }); }
      else { const expectedColor = op.kind === 'create' ? op.body.color : ownedDefinitions.get(op.definitionId).color;
        rememberDefinition(value.definition, expectedColor, op.body.label); op.definition = value.definition; if (op.kind === 'create') assert.equal(response.status(), 201); }
      op.confirmed = true; op.settled = true; report.unknownWrite = false; return route.fulfill({ response });
    } catch (error) { report.routeErrors.push(String(error.stack ?? error)); if (permit?.used) permit.settled = true; try { await route.abort(); } catch {} }
  });
  await context.routeWebSocket('**/*', socket => { report.blocked.push({ stage, reason: 'WebSocket' }); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.pageErrors.push(String(error)));page.on('console', message => {if(!['error','warning','warn'].includes(message.type()))return;const value=message.text(),react=['Invalid hook call','Maximum update depth','Hydration failed','Cannot update a component','Each child in a list','React has detected'].find(text=>value.includes(text)),status=/status(?: code)?(?: of)?[: ]+(\d{3})/i.exec(value)?.[1],category=react?'react':/Failed to fetch|ERR_|Failed to load resource|status code/i.test(value)?'network':'other';report.consoleSummary.push({stage,type:message.type(),category,...(status?{status:Number(status)}:{}),...(react?{reactCode:react}:{}),asset:message.location().url?.split('/').at(-1)?.split('?')[0],line:(message.location().lineNumber??-1)+1,column:(message.location().columnNumber??-1)+1,...(readonlyConsole&&category==='other'?{sanitizedMessage:value.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/(token|secret|api[_-]?key|authorization|password|credential)\s*[:=]\s*[^ ,;}\n]+/gi,'$1=[redacted]').replace(/https?:[^\s)]+/g,'[URL omitted]').slice(0,350)}:{}),rawTextStored:false});});
  stage = 'opening'; await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 120000 }); await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 120000 });
  await wait(snap, value => value.canvas === canvasId && value.status === 'ready' && value.workspace === workspaceId, 'Original exact Frame owner', 120000);
  if(readonlyConsole){stage='readonly-console';await page.waitForTimeout(2000);report.checks.push('One fresh passive console observation only; zero naming, palette, MCP, camera or input actions.');}else{
  const collapse = page.getByRole('button', { name: '收起对话', exact: true }); if (await collapse.count() === 1) await collapse.click();
  const fit = page.getByTestId('canvas-editor-fit-view-btn'); assert.equal(await fit.count(), 1); await fit.click();
  stage = 'orange-user-first-name'; await openGroup(orange); const original = await snap();
  let orangeDefinition = await committedName(orange, '灵感橙', 'create'); await unchangedReader(original, 'First ordinary color name'); await screenshot('01-orange-original-inline-created');
  report.checks.push('Original orange raw-only header created one real definition/name; no target/member or new window');
  stage = 'orange-agent-existing-cas'; const beforeAgent = await snap(); orangeDefinition = await mcpRename({ definitionId: orangeDefinition.id, label: '项目灵感', expectedLabel: orangeDefinition.label, expectedUpdatedAt: orangeDefinition.updatedAt }, orange, '项目灵感');
  await wait(async () => menu().innerText(), text => text.includes('项目灵感'), 'Same open original menu receives Agent name'); await unchangedReader(beforeAgent, 'Same-menu Agent rename', true);
  stage = 'orange-user-existing-cas';
  orangeDefinition = await committedName(orange, '灵感橙', 'rename', orangeDefinition); await screenshot('02-orange-original-user-cas');
  stage = 'orange-stale-known-edit'; await beginRename(); await renameInput().fill('旧编辑不应覆盖'); const knownInput = await snap();
  orangeDefinition = await mcpRename({ definitionId: orangeDefinition.id, label: '协作灵感橙', expectedLabel: orangeDefinition.label, expectedUpdatedAt: orangeDefinition.updatedAt }, orange, '协作灵感橙');
  await wait(async () => (await headerColor(orange)).getAttribute('aria-label'), value => value?.includes('协作灵感橙'), 'Agent latest name in original header'); await unchangedReader(knownInput, 'Agent preserves original inline draft/caret', true);
  await staleSubmit('协作灵感橙', /名称已更新|最新名称|刚有变化/); await screenshot('03-stale-known-edit-retained');
  await renameInput().press('Escape'); await renameInput().waitFor({ state: 'hidden' });
  orangeDefinition = await mcpRename({ definitionId: orangeDefinition.id, label: '灵感橙', expectedLabel: orangeDefinition.label, expectedUpdatedAt: orangeDefinition.updatedAt }, orange, '灵感橙');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'hidden' }); report.checks.push('Original user and installed MCP share exact definition CAS; old known-name input cannot overwrite a newer Agent label');
  stage = 'red-original-palette-add'; await setRed(true); assert.equal((await colorFacts()).definitions.some(row => row.color.toUpperCase() === red), false);
  stage = 'red-stale-observed-absence'; await openGroup(red); await beginRename(); await renameInput().fill('旧首次命名不能盖'); const absenceInput = await snap();
  const redDefinition = await mcpRename({ color: red, label: '珊瑚红', expectedDefinitionId: null }, red, '珊瑚红');
  await wait(async () => (await headerColor(red)).getAttribute('aria-label'), value => value?.includes('珊瑚红'), 'Agent first name in original header'); await unchangedReader(absenceInput, 'Agent first name preserves old absence draft/caret', true);
  await staleSubmit(redDefinition.label, /刚有了名称|最新名称|刚有变化/); await screenshot('04-stale-absence-retained');
  await renameInput().press('Escape'); await renameInput().waitFor({ state: 'hidden' }); await page.keyboard.press('Escape'); await menu().waitFor({ state: 'hidden' });
  report.checks.push('Agent absent-definition create uses color/null only; an already-editing user absence remains absence and refuses instead of being upgraded to overwrite the new definition');
  stage = 'restore-original-frame-color'; await setRed(false); assert.deepEqual((await liveFrame()).data.color_pins, ['F4A14B']);
  stage = 'reload-names-and-frame'; await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 120000 }); await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 120000 });
  await wait(snap, value => value.canvas === canvasId && value.status === 'ready' && value.workspace === workspaceId, 'Original reload same owner', 120000);
  await wait(async () => (await headerColor(orange)).getAttribute('aria-label'), value => value?.includes('灵感橙'), 'Original named orange persists');
  assert.deepEqual((await liveFrame()).data.color_pins, ['F4A14B']); assert.equal(context.pages().length, 1); await screenshot('05-original-orange-restored-names-persist');
  await narrowOriginalEditor();
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors, []); assert.equal(report.unknownWrite, false); report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page) { report.failureSnapshot = await snap().catch(() => undefined); await screenshot('failure').catch(() => {}); await fs.writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()).catch(() => {}); }
} finally {
  report.stage = stage;
  if (before) try {
    const after = await facts('facts-after'), left = structuredClone(before), right = structuredClone(after); report.allowedDefinitionDelta = [...ownedDefinitions.values()];
    assert.ok(ownedDefinitions.size <= 2); assert.deepEqual(after.colors.memberships, before.colors.memberships, 'Names create no memberships');
    for (const [id, expected] of ownedDefinitions) assert.deepEqual(after.colors.definitions.find(row => row.id === id), expected, 'Only exact acknowledged name records may remain');
    right.colors.definitions = right.colors.definitions.filter(row => !ownedDefinitions.has(row.id));
    if (report.passed&&!readonlyConsole) { assert.equal(ownedDefinitions.size, 2); assert.deepEqual([...ownedDefinitions.values()].map(row => [row.color, row.label]).sort(), [[orange, '灵感橙'], [red, '珊瑚红']].sort()); }
    report.actualCanvasCounters = { before: { version: left.canvases[canvasId].version, updated_at: left.canvases[canvasId].updated_at }, after: { version: right.canvases[canvasId].version, updated_at: right.canvases[canvasId].updated_at } };
    delete left.canvases[canvasId].version; delete left.canvases[canvasId].updated_at; delete right.canvases[canvasId].version; delete right.canvases[canvasId].updated_at;
    report.factDifferences = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(key => !same(left[key], right[key])); assert.deepEqual(report.factDifferences, [], 'Only exact new named definitions and original Canvas counter/time may differ; all colors, layout, parent, content/domain/messages stay exact');
    const afterBytes = await bytes([...beforeBytes.keys()]); for (const [id, original] of beforeBytes) { assert.equal(afterBytes.get(id).type, original.type); assert.ok(afterBytes.get(id).body.equals(original.body), id + ' original bytes'); }
    const afterNodeBytes = await nodeFiles(); assert.deepEqual([...afterNodeBytes.keys()].sort(), [...beforeNodeBytes.keys()].sort());
    for (const [id, original] of beforeNodeBytes) assert.ok(afterNodeBytes.get(id).equals(original), id + ' original Huabu node source bytes');
    report.nodeFileBytesUnchanged = true; report.nodeFileCount = beforeNodeBytes.size;
    report.fileBytesUnchanged = true; report.fileCount = beforeBytes.size; report.factsRestoredExceptNamedDefinitions = true;
  } catch (error) { report.protectionError = String(error.stack ?? error); report.passed = false; process.exitCode = 1; }
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, stage, report: path.join(output, 'report.json'), unknownWrite: report.unknownWrite,
    namedDefinitionsRetained: report.allowedDefinitionDelta.map(row => ({ id: row.id, color: row.color, label: row.label })), fileBytesUnchanged: report.fileBytesUnchanged,
    nodeFileBytesUnchanged: report.nodeFileBytesUnchanged, nodeFileCount: report.nodeFileCount,
    factsRestoredExceptNamedDefinitions: report.factsRestoredExceptNamedDefinitions, modelCalls: 0, error: report.error, protectionError: report.protectionError }, null, 2));
}
