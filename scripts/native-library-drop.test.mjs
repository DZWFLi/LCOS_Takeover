import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeLibraryDropScript as transform, restoreNativeLibraryDropScriptForComparison as restore } from '../lab/native-library-drop-transform.mjs';
import { transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), file = 'page-Da_DfwiK.js', temp = path.join(root, '.runtime', 'native-library-drop-' + Date.now());
await fs.mkdir(temp, { recursive: true });
const original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', file), 'utf8');
const transformed = transform(file, original), outputDir = path.join(root, 'output/原生文本整合_20261017e');
const report = { passed: false, scope: 'unwired original Ko source patch + actual acquisition/store/native transport; not candidate, real Core or producer dispatch',
  candidateWrites: 0, coreWrites: 0, models: 0, cases: [] };
const entry = path.join(temp, 'entry.ts'), bundle = path.join(temp, 'entry.mjs');
await fs.writeFile(entry, `export * from ${JSON.stringify(path.join(root, 'lab/pilot/native-library-drop.ts'))};
export {useLcosDropStore} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/lcosDropState.ts'))};
export {bindNativeAssemblyDropEvents,ASSEMBLY_DRAG_MIME} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/nativeAssemblyDrop.ts'))};
export {resolveDropIntent} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver.ts'))};`);
let restoreFetch;
try {
  assert.notEqual(transformed, original); assert.equal(transform(file, transformed), transformed);
  assert.equal(restore(file, transformed, original), original); assert.equal(transform('unrelated.js', 'unchanged'), 'unchanged');
  const prior = transformNativeAssemblyLibraryScript(file, original), combined = transform(file, prior);
  assert.equal(restore(file, combined, prior), prior, 'composition keeps actual Assembly/TS patch byte-identical');
  const find = (source, name) => { const program = parse(source, file), node = program.body.flatMap(n => n.declarations ?? []).find(n => n.id?.name === name);
    assert.ok(node, name); return source.slice(node.start, node.end); };
  for (const name of ['TS', 'IS', 'CU']) assert.equal(find(transformed, name), find(original, name));
  report.cases.push('original AST/idempotence/exact restore; existing Library transform composes; original TS/IS/CU byte-identical');
  await buildPilotEntry(path.relative(root, entry), bundle);
  const sources = JSON.parse(await fs.readFile(bundle + '.sources.json', 'utf8'));
  report.selectedResolverSource = sources.resources.find(row => row.resourcePath.endsWith('/drop/dropIntentResolver.ts'));
  assert.ok(report.selectedResolverSource?.sourcePath.includes('LCOS_GEN2_GUI_RECOVERY_20260926'), 'test the actual currently selected resolver, not old copied logic');
  restoreFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('This acquisition test must never call Core or network.'); };
  const app = await import(pathToFileURL(bundle));
  const dependency = createRequire(path.join(installedRoot, 'package.json')), esbuild = dependency('esbuild');
  const source = await fs.readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts'), 'utf8');
  const acquisition = (await esbuild.transform(source.slice(source.indexOf('export function acquireDrop('), source.indexOf('\n/**', source.indexOf('export function acquireDrop('))), { loader: 'ts', format: 'cjs' })).code;
  const acquireModule = { exports: {} }; new Function('module', 'exports', 'useLcosDropStore', acquisition)(acquireModule, acquireModule.exports, app.useLcosDropStore);
  const acquire = acquireModule.exports.acquireDrop;
  const origin = { projectId: 'project', canvasId: 'canvas', api: {} }, messages = [], writes = [];
  const port = { readOrigin: () => origin, read: () => app.useLcosDropStore.getState(), acquire,
    cancel: () => app.useLcosDropStore.getState().cancel(), notice: message => messages.push(message) };
  const asset = { id: 'artifact', name: '准确原材料', source_url: 'http://127.0.0.1/not-an-import', asset_type: 1,
    lcos_projection: { project_id: 'project', artifact_id: 'artifact', presented_revision_id: 'selected-r1', current_revision_id: 'newer-r9',
      artifact_view_id: 'existing-view', file_record_id: 'selected-file', content_available: true, referenceable: true,
      assembly_item: { kind: 'artifact', title: '准确原材料', entityRef: { type: 'artifact', id: 'artifact', viewId: 'existing-view' },
        presentedRevisionId: 'selected-r1', mimeType: 'image/png' } } };
  const event = () => { const data = new Map(), trace = []; return { clientX: 250, clientY: 200, trace, data,
    dataTransfer: { setData: (type, value) => { data.set(type, value); trace.push(['setData', type, value]); }, set effectAllowed(value) { trace.push(['effectAllowed', value]); },
      get effectAllowed() { return trace.findLast(x => x[0] === 'effectAllowed')?.[1]; }, getData: type => data.get(type) ?? '', get types() { return [...data.keys()]; } },
    preventDefault: () => trace.push(['preventDefault']), stopPropagation: () => trace.push(['stopPropagation']), stopImmediatePropagation: () => trace.push(['stopImmediatePropagation']) }; };
  const start = event(); start.dataTransfer.setData('application/x-library-asset', JSON.stringify(asset));
  assert.equal(app.beginNativeLibraryAssemblyDrop(start, asset, port), 'started');
  const state = app.useLcosDropStore.getState().state, payload = state.payload;
  assert.equal(state.status, 'tracking'); assert.equal(payload.sourceRef.kind, 'artifactView'); assert.equal(payload.sourceRef.id, 'existing-view');
  assert.equal(payload.reference.revisionId, 'selected-r1'); assert.equal(payload.reference.artifactViewId, 'existing-view');
  assert.equal(start.data.get('application/x-library-asset'), JSON.stringify(asset)); assert.equal(start.dataTransfer.effectAllowed, 'copyMove');
  const wire = JSON.parse(start.data.get(app.ASSEMBLY_DRAG_MIME)); assert.equal(wire.reference.revisionId, 'selected-r1');
  assert.ok(!start.data.get(app.ASSEMBLY_DRAG_MIME).includes('newer-r9')); assert.ok(!JSON.stringify(payload).includes('startScreenPoint'));
  const captured = app.readNativeLibraryDropCapture(payload); assert.equal(captured.api, origin.api); assert.equal(captured.fileRecordId, 'selected-file');
  asset.lcos_projection.presented_revision_id = 'mutated'; captured.startScreenPoint.x = 999;
  assert.equal(app.readNativeLibraryDropCapture(payload).revisionId, 'selected-r1'); assert.equal(app.readNativeLibraryDropCapture(payload).startScreenPoint.x, 250);
  asset.lcos_projection.presented_revision_id = 'selected-r1';
  report.cases.push('actual acquireDrop calls existing Zustand store; Ko retained; existing Assembly MIME; selected revision/View/FileRecord + same original API captured without second store or wire API');
  const candidate = semantic => ({ targetId: 'receiver', enabled: true, semantic });
  for (const targetRef of [{ kind: 'workspace', id: 'workspace' }, { kind: 'context', id: 'context' }, { kind: 'workflow', id: 'workflow' }]) {
    const resolution = app.resolveDropIntent(payload, candidate({ kind: 'canvas', targetRef }));
    assert.equal(resolution.status, 'ready'); assert.deepEqual(resolution.intent.targetRef, targetRef);
    assert.deepEqual(resolution.intent.sourceRefs, [{ kind: 'artifactView', id: 'existing-view' }]);
  }
  const composer = app.resolveDropIntent(payload, candidate({ kind: 'composer-reference', inputKey: 'original-input', intent: 'delegate' }));
  assert.equal(composer.intent.kind, 'composer-reference'); assert.equal(composer.intent.reference.revisionId, 'selected-r1'); assert.equal(composer.intent.inputKey, 'original-input');
  const conversation = app.resolveDropIntent(payload, candidate({ kind: 'collaboration-reference', conversationId: 'connected-conversation' }));
  assert.equal(conversation.intent.kind, 'assembly-apply'); assert.deepEqual(conversation.intent.targetRef, { kind: 'conversation', id: 'connected-conversation' });
  report.cases.push('actual selected resolver preserves Workspace/root Context/Workflow targets and distinct Composer reference versus Glyth durable context; no target coerced to workspace');
  const nativeWindow = new EventTarget(); let commits = 0, cancelled = 0, target = candidate({ kind: 'canvas', targetRef: { kind: 'workspace', id: 'workspace' } });
  app.useLcosDropStore.getState().setBounds({ left: 0, right: 1000, top: 0, bottom: 800 });
  const release = app.bindNativeAssemblyDropEvents(nativeWindow, {
    read: () => app.useLcosDropStore.getState(),
    advance: e => {
      const store = app.useLcosDropStore.getState(), live = store.state;
      if (!('payload' in live)) return false;
      const resolution = app.resolveDropIntent(live.payload, target), screen = { x: e.clientX, y: e.clientY };
      store.advance(screen, true, Date.now(), { targetId: target.targetId, previewPoint: screen }, resolution, { x: 400, y: 500 }, screen); return true;
    },
    commit: () => { commits++; app.useLcosDropStore.getState().commitAt('one-real-gesture'); },
    cancel: () => { cancelled++; app.useLcosDropStore.getState().cancel(); },
  });
  const nativeEvent = type => { const e = new Event(type, { cancelable: true }); Object.assign(e, { clientX: 800, clientY: 700, dataTransfer: start.dataTransfer }); return e; };
  const over = nativeEvent('dragover'); nativeWindow.dispatchEvent(over); assert.equal(over.defaultPrevented, true);
  const dropEvent = nativeEvent('drop'); nativeWindow.dispatchEvent(dropEvent); assert.equal(dropEvent.defaultPrevented, true); assert.equal(commits, 1);
  assert.equal(app.useLcosDropStore.getState().state.status, 'committing');
  assert.deepEqual(app.useLcosDropStore.getState().resolution.intent.placementPoint, { x: 400, y: 500 });
  nativeWindow.dispatchEvent(nativeEvent('drop')); nativeWindow.dispatchEvent(nativeEvent('dragend')); assert.equal(commits, 1, 'duplicate drop/dragend never replays a committed gesture');
  const busy = event(); assert.equal(app.beginNativeLibraryAssemblyDrop(busy, asset, port), 'rejected');
  assert.equal(app.useLcosDropStore.getState().state.payload, payload, 'unknown committing owner is never replaced by a second drag');
  app.useLcosDropStore.getState().reset();
  const seedGesture = () => { assert.equal(app.beginNativeLibraryAssemblyDrop(event(), asset, port), 'started'); app.useLcosDropStore.getState().setBounds({ left: 0, right: 1000, top: 0, bottom: 800 }); };
  seedGesture(); nativeWindow.dispatchEvent(nativeEvent('dragover'));
  target = { ...target, targetId: 'different-receiver' }; nativeWindow.dispatchEvent(nativeEvent('drop'));
  assert.equal(app.useLcosDropStore.getState().state.status, 'idle'); assert.equal(commits, 1, 'release retarget cancels instead of redirecting silently');
  seedGesture(); const escape = new Event('keydown'); Object.assign(escape, { key: 'Escape' }); nativeWindow.dispatchEvent(escape);
  assert.equal(app.useLcosDropStore.getState().state.status, 'idle'); assert.ok(cancelled >= 2); release();
  report.cases.push('actual native Assembly capture consumes/drop-advances once, same store resolver placement; duplicate/dragend cannot replay unknown committing gesture; busy source, release retarget and Escape cancel safely');
  app.useLcosDropStore.getState().reset();
  const wrongScene = event(), priorSetData = wrongScene.dataTransfer.setData;
  wrongScene.dataTransfer.setData = (...args) => { priorSetData(...args); origin.canvasId = 'other-canvas'; };
  assert.equal(app.beginNativeLibraryAssemblyDrop(wrongScene, asset, port), 'rejected');
  assert.equal(app.useLcosDropStore.getState().state.status, 'idle'); origin.canvasId = 'canvas';
  assert.equal(app.beginNativeLibraryAssemblyDrop(event(), asset, { ...port, acquire: payload => { acquire(payload); throw new Error('Original acquisition observer failed'); } }), 'rejected');
  assert.equal(app.useLcosDropStore.getState().state.status, 'idle', 'failed own acquisition cancels only its existing in-flight payload');
  report.cases.push('source origin is captured by value before DataTransfer callback; scene race rejects; own failed acquisition cancels existing ephemeral gesture without replacing committed state');
  for (const invalid of [{ ...asset, lcos_projection: null }, { ...asset, lcos_projection: { ...asset.lcos_projection, project_id: 'foreign' } },
    { ...asset, lcos_projection: { ...asset.lcos_projection, artifact_view_id: null,
      assembly_item: { ...asset.lcos_projection.assembly_item, entityRef: { type: 'artifact', id: 'artifact' } } } },
    { name: '方法', lcos_library_entry: { projectId: 'project', item: {} } }]) {
    const attempt = event(); assert.equal(app.beginNativeLibraryAssemblyDrop(attempt, invalid, port), 'rejected');
    assert.ok(attempt.trace.some(row => row[0] === 'preventDefault')); assert.equal(app.useLcosDropStore.getState().state.status, 'idle');
  }
  const legacy = event(); assert.equal(app.beginNativeLibraryAssemblyDrop(legacy, { id: 'vendor', source_url: 'vendor-url' }, port), 'legacy'); assert.deepEqual(legacy.trace, []);
  assert.equal(app.rejectNativeLibraryDropFallback(event(), { id: 'vendor' }, message => messages.push(message)), false);
  const rejected = event(); assert.equal(app.rejectNativeLibraryDropFallback(rejected, { lcos_projection: null }, message => messages.push(message)), true);
  assert.ok(rejected.trace.some(row => row[0] === 'stopImmediatePropagation')); assert.ok(messages.every(text => !/selected-file|existing-view|foreign|http/i.test(text)));
  report.cases.push('malformed Core/project mismatch/historical noView/context category rejected and consumed, no Current or URL fallback; nonLCOS untouched and no user ID disclosure');
  // Execute the actual transformed original callbacks; only their existing
  // React/DOM/geometry leaves are supplied here.
  const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(x => walk(x, visit)); else if (value?.type) walk(value, visit); };
  const extract = (text, which) => { const p = parse(text, file), found = []; walk(p, n => {
    if (n.type === 'ArrowFunctionExpression' && (which === 'start' ? text.slice(n.start, n.end).includes('setData(Ko') : text.slice(n.start, n.end).includes('const yt=jk(hs)'))
      && (which !== 'start' || n.params[0]?.name === 'W') && (which !== 'drop' || n.params[0]?.name === 'ht')) found.push(n);
  }); assert.equal(found.length, 1, which); return text.slice(found[0].start, found[0].end); };
  const originalStart = extract(original, 'start'), nextStart = extract(transformed, 'start');
  const executeStart = (code, row) => { const input = event(), events = [], scope = {
    e: row, Ko: 'application/x-library-asset', R: () => events.push('clear-hover'), C: value => events.push(['hover-open', value]), k: value => events.push(['drag-style', value]),
    LCOSNativeLibraryDragStart: (event, asset) => app.beginNativeLibraryAssemblyDrop(event, asset, port), se: { error: message => messages.push(message) } };
    new Function('scope', 'with(scope){return(' + code + ')}')(scope)(input); return { input, events }; };
  const legacyRow = { id: 'vendor', source_url: 'vendor-url' };
  const beforeLegacy = executeStart(originalStart, legacyRow), afterLegacy = executeStart(nextStart, legacyRow);
  assert.deepEqual(afterLegacy.events, beforeLegacy.events); assert.deepEqual(afterLegacy.input.trace, beforeLegacy.input.trace);
  const coreStart = executeStart(nextStart, asset); assert.deepEqual(coreStart.events, ['clear-hover', ['hover-open', false], ['drag-style', true]]);
  assert.equal(coreStart.input.dataTransfer.effectAllowed, 'copyMove'); assert.equal(coreStart.input.data.get('application/x-library-asset'), JSON.stringify(asset));
  app.useLcosDropStore.getState().reset();
  const dropFn = extract(transformed, 'drop'); let nativeFactoryCalls = 0, originalParserCalls = 0;
  const dropped = event(); dropped.dataTransfer.setData('application/x-library-asset', JSON.stringify(asset));
  const drop = new Function('scope', 'with(scope){return(' + dropFn + ')}')({ Ko: 'application/x-library-asset', ot: () => false, jk: raw => { originalParserCalls++; return JSON.parse(raw); },
    o: p => p, Qe: () => { nativeFactoryCalls++; return {}; }, Te: value => writes.push(value), se: { error: message => messages.push(message) },
    LCOSNativeLibraryDropFallback: app.rejectNativeLibraryDropFallback });
  drop(dropped); assert.equal(nativeFactoryCalls, 0); assert.deepEqual(writes, []); assert.equal(originalParserCalls, 0);
  const malformed = event(); malformed.dataTransfer.setData('application/x-library-asset', JSON.stringify({ lcos_projection: null }));
  drop(malformed); assert.equal(nativeFactoryCalls, 0); assert.equal(originalParserCalls, 0, 'even invalid Core names/types are consumed before stock jk can discard their marker');
  report.cases.push('actual Zp.j executes original Ko/hover/drag styling and exact nonCore trace; actual jF.rt Core fallback cannot call Qe/Te');
  report.passed = true;
} catch (error) { report.failure = String(error.stack ?? error); process.exitCode = 1; }
finally { if (restoreFetch) globalThis.fetch = restoreFetch; await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, '原库Ko未接入口补丁测试.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
