import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installedRoot, buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFirstTextScript as first } from '../lab/native-text-first-transform.mjs';
import { transformNativeTextActionsScript as actions } from '../lab/native-text-actions-transform.mjs';
const root = path.resolve(import.meta.dirname, '..'), temp = await fs.mkdtemp(path.join(root, '.runtime/ordinary-text-component-'));
const output = path.join(root, 'output/普通Frame子文字只读_20261028', new Date().toISOString().replace(/[:.]/g, '-')); await fs.mkdir(output, { recursive: true });
const dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json')), esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
const { Window } = dep('happy-dom'), dom = new Window({ url: 'http://127.0.0.1:1/' });
const globals = ['window','document','navigator','HTMLElement','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'];
const prior = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of ['window','document','navigator','HTMLElement','Event','MouseEvent']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const report = { passed: false, scope: 'Actual original o4 pure/generate router, r4/s4/e4 and iBe/ua/xl/JT/Hde toolbar plus production NodeOwner/Body/commands in isolated happy-dom; controlled CT/menu/Flow leaves, no Chrome/live Core/service/model.', cases: [], requests: [], events: [] };
let app;
try {
  const donor = 'course-api-base-url-CifxI1ia.js', original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', donor), 'utf8');
  const transformed = actions(donor, first(donor, original)), ast = parse(transformed, donor);
  const bindings = new Map(ast.body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
    : (node.declarations ?? []).filter(row => row.id?.type === 'Identifier').map(row => [row.id.name, row])));
  const names = ['o4','t4','Vde','Hde','JT','ua','n4','iBe','zde','xl','rBe','e4','r4','s4'];
  const statements = names.map(name => { const node = bindings.get(name); assert.ok(node, name); return (node.type === 'FunctionDeclaration' ? '' : 'const ') + transformed.slice(node.start, node.end) + ';'; }).join('\n');
  // Reuse the established original component fixture's leaf ports rather than
  // inventing another toolbar/body implementation. Its test main never runs.
  const harness = await fs.readFile(path.join(root, 'scripts/native-text-actions-component.test.mjs'), 'utf8'), templates = [];
  function walk(node) { if (!node?.type) return; if (node.type === 'CallExpression' && node.callee?.object?.name === 'fs' && node.callee?.property?.name === 'writeFile'
    && node.arguments[0]?.name === 'entry' && node.arguments[1]?.type === 'TemplateLiteral') templates.push(node.arguments[1]);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value?.type) walk(value); }
  walk(parse(harness, 'native-text-actions-component.test.mjs')); assert.equal(templates.length, 1); const template = templates[0]; assert.equal(template.expressions.length, 2);
  const substitutions = [JSON.stringify(path.join(root, 'lab/pilot/native-text-first-ui.tsx')), JSON.stringify(statements)];
  let fixture = template.quasis.map((quasi, index) => quasi.value.cooked + (substitutions[index] ?? '')).join('');
  const replace = (from, to) => { assert.equal(fixture.split(from).length - 1, 1, 'exact existing fixture seam'); fixture = fixture.replace(from, to); };
  replace('const controls={d:React,', 'const controls={Ck:{PURE:"pure",GENERATE:"generate"},AM:props=>props,d:React,');
  replace('return{r4,s4,Hde};', 'return{r4,s4,o4,Hde};');
  replace("policy.kind==='generative'?originalFunctions.s4:originalFunctions.r4", 'originalFunctions.o4');
  const entry = path.join(temp, 'fixture.tsx'), bundle = path.join(temp, 'fixture.mjs'); await fs.writeFile(entry, fixture);
  await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic', logLevel: 'warning',
    plugins: [{ name: 'same-original-components-controlled-leaf-ports', setup(build) {
      build.onResolve({ filter: /^\/lcos\/(native-flow|agent-ui)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.includes('native-flow')
        ? 'export const useViewport=()=>globalThis.__TEXT_ACTION_FIXTURE__.viewport;'
        : 'export const nativeMaterialViewerAvailable=()=>true;export const requestNativeMaterialView=input=>globalThis.__TEXT_ACTION_FIXTURE__.events.push({kind:"viewer",input});export const hasNativeMindMapDraft=()=>false;', loader: 'js' }));
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      build.onResolve({ filter: /^[^./][^:]*$/ }, args => { try { return { path: dep.resolve(args.path) }; } catch {} });
    } }] });
  const moduleFile = await buildPilotEntry('lab/pilot/native-ordinary-node-content.ts', path.join(temp, 'content.mjs'));
  const { projectNativeOrdinaryNodeContent: project } = await import(pathToFileURL(moduleFile));
  const body = '原子正文保持\n第二行';
  const native = { id: 'child', type: 'note', parentId: 'nested-frame', position: { x: 60, y: 70 }, measured: { width: 360, height: 240 }, data: { color_pins: ['F4A14B'], lcos_gui_navigation_pin: false } };
  const projected = project({ projectId: 'project', canvasId: 'canvas', node: native, nodes: [native], workspaces: [{ id: 'workspace', projectId: 'project', canvasId: 'canvas' }], bindings: [],
    content: { canvasId: 'canvas', record: { nodeId: 'child', type: 'note', label: '原子标题', content: body } } });
  const listeners = new Set();
  const env = { node: { id: native.id, type: 'text', position: native.position, width: 360, height: 240, data: { ...projected.data, lcosTextViewMode: 'mindmap' } },
    viewport: { x: 0, y: 0, zoom: 1 }, events: report.events, mapDrafts: new Map(), viewerReady: true };
  env.api = { getNodes: () => [env.node], getNode: id => id === env.node.id ? env.node : undefined, getEdges: () => [], getViewport: () => env.viewport,
    getSelection: () => ({ nodeIds: ['child'], edgeIds: [] }), subscribeNative: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    updateNode: (...args) => report.events.push({ kind: 'write', args }), updateNodeData: (...args) => report.events.push({ kind: 'write', args }),
    deleteElements: args => report.events.push({ kind: 'delete', args }) };
  globalThis.__TEXT_ACTION_FIXTURE__ = env; window.__LCOS_NODE_LAB__ = { projectId: 'project', canvasId: 'canvas', currentCanvasId: 'canvas', api: env.api };
  globalThis.fetch = async (...args) => { report.requests.push(String(args[0])); throw Error('No network is allowed for an ordinary readonly note'); };
  app = await import(pathToFileURL(bundle)); await app.render();
  const state = document.querySelector('[data-native-first-state]'); assert.equal(state?.getAttribute('data-native-first-state'), 'readonly'); assert.equal(state.getAttribute('data-native-first-mode'), 'text');
  assert.ok(document.querySelector('[data-markdown-leaf]')?.textContent.includes('原子正文保持')); assert.ok(document.querySelector('[data-markdown-leaf]')?.textContent.includes('第二行'));
  assert.match(state.title, /只读.*编辑与导图尚未接入/); assert.equal(document.querySelectorAll('[data-original-generate-input]').length, 0);
  assert.equal(document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length, 0); assert.equal(document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length, 1);
  assert.deepEqual(report.requests, []); report.cases.push('Production pure data passes actual original o4→r4→e4; exact ordinary body appears readonly, no false loading/error, no JU generation or added view menu, zero Core/HTTP reads');
  const disabled = [...document.querySelectorAll('[data-original-tooltip]')].filter(element => /尚未接入/.test(element.getAttribute('data-original-tooltip') ?? ''));
  assert.equal(disabled.length, 3); assert.ok(disabled.every(element => element.querySelector('button')?.disabled));
  const readonlyEdit = disabled.find(element => /编辑与导图/.test(element.getAttribute('data-original-tooltip'))); assert.ok(readonlyEdit, 'Original edit item remains visible and disabled, with the reason');
  await app.doubleClick(document.querySelector('[data-testid="original-text-content"]'));
  let originalEdits = 0; assert.equal(app.LCOSRequestNativeTextEdit('child', () => originalEdits++), false); assert.equal(originalEdits, 0);
  assert.equal(report.events.some(event => ['generate','original-edit','write','viewer'].includes(event.kind)), false);
  report.cases.push('Original edit/library/background items remain visibly disabled with their original tooltip slot; double-click and original edit command cannot enter disconnected editing/generation, no replacement window');
  const copy = [...document.querySelectorAll('button')].find(element => element.textContent === '复制全文'); assert.ok(copy); await app.click(copy);
  assert.deepEqual(report.events.filter(event => event.kind === 'copy'), [{ kind: 'copy', value: body }]);
  assert.equal(document.querySelectorAll('[data-native-first-state="readonly"]').length, 1); assert.deepEqual(report.requests, []);
  report.cases.push('Original copy-all stays connected and receives the exact ordinary body while the same single original toolbar and readonly body persist');
  await app.update(() => { env.node = { ...env.node, data: { ...env.node.data, text: '更新后的原正文', content: '更新后的原正文' } }; [...listeners].forEach(listener => listener()); });
  assert.ok(document.querySelector('[data-markdown-leaf]').textContent.includes('更新后的原正文')); assert.deepEqual(report.requests, []);
  report.cases.push('Same original node receives a new saved body through its existing Canvas subscription without fetching Core, reopening a Viewer, changing source geometry, or retaining the old body');
  const longBody = Array.from({ length: 100 }, (_, index) => '这是原普通长文的第' + (index + 1) + '行，保留准确文字。').join('\n') + '\n正文末尾-REAL-END';
  await app.update(() => { env.node = { ...env.node, width: 220, height: 140, data: { ...env.node.data, text: longBody, content: longBody } }; env.viewport.zoom = .6;
    [...listeners].forEach(listener => listener()); });
  await app.render({ selected: true });
  const scrollOwner = document.querySelector('[data-testid="original-text-content"]');
  assert.equal(document.querySelector('[data-native-first-density]').getAttribute('data-native-first-density'), 'summary');
  assert.ok(scrollOwner.classList.contains('overflow-y-auto') && scrollOwner.classList.contains('nowheel'), 'Same original e4 remains the selected body scroll owner');
  assert.ok(document.querySelector('[data-markdown-leaf]').textContent.includes('正文末尾-REAL-END'), 'Selection reads the complete long body despite summary geometry');
  await app.click([...document.querySelectorAll('button')].find(element => element.textContent === '复制全文'));
  assert.deepEqual(report.events.filter(event => event.kind === 'copy').at(-1), { kind: 'copy', value: longBody });
  await app.render({ selected: false }); assert.equal(document.querySelector('[data-native-first-density]').getAttribute('data-native-first-density'), 'summary');
  assert.equal(document.querySelector('[data-markdown-leaf]').textContent.includes('正文末尾-REAL-END'), false, 'Unselected ordinary nodes retain original semantic summary');
  assert.ok(document.querySelector('[data-markdown-leaf]').textContent.endsWith('…'));
  assert.deepEqual(report.requests, []); assert.equal(report.events.some(event => ['generate','original-edit','write','viewer'].includes(event.kind)), false);
  report.cases.push('220×140 ordinary long text at summary zoom keeps complete original e4 body/copy under real selected props; original overflow-y-auto/nowheel remain, while deselection returns to the existing semantic excerpt. Actual wheel geometry is left to the real-page check');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  try { await app?.close(); } catch {} report.domText = document.body.textContent; await dom.happyDOM.abort(); dom.close(); delete globalThis.__TEXT_ACTION_FIXTURE__;
  for (const [key, descriptor] of Object.entries(prior)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  await fs.writeFile(path.join(output, 'component-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, report: path.join(output, 'component-report.json') }, null, 2));
}
process.exit(report.passed ? 0 : 1);
