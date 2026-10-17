import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFileUploadScript as transform, restoreNativeFileUploadScriptForComparison as restore } from '../lab/native-file-upload-transform.mjs';
import { LCOSNativeFileUploadReceipt } from '../lab/native-file-upload-receipt.mjs';

const root = path.resolve(import.meta.dirname, '..'), temp = path.join(root, '.runtime/file-ingress-' + Date.now());
await fs.mkdir(temp, { recursive: true });
const dep = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const originals = {}, compiled = {}, bindings = {};
for (const name of ['page-Da_DfwiK.js', 'course-api-base-url-CifxI1ia.js', 'index-BAQXnPag.js', 'UnlimitedModeToggle-D4wysAbz.js']) {
  originals[name] = await fs.readFile(path.join(assets, name), 'utf8');
  compiled[name] = ['page-Da_DfwiK.js', 'index-BAQXnPag.js'].includes(name) ? transform(name, originals[name]) : originals[name];
  if (compiled[name] !== originals[name]) {
    assert.equal(restore(name, compiled[name]), originals[name], name + ' exact restore');
    assert.equal(transform(name, compiled[name]), compiled[name], name + ' idempotent');
  }
  const ast = parse(compiled[name], name), map = new Map();
  for (const node of ast.body) {
    if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) map.set(node.id.name, node);
    for (const value of node.declarations ?? []) if (value.id?.type === 'Identifier') map.set(value.id.name, value);
  }
  bindings[name] = map;
}
const text = (file, name) => { const node = bindings[file].get(name); assert.ok(node, name);
  return (node.type === 'VariableDeclarator' ? 'const ' : '') + compiled[file].slice(node.start, node.end) + ';'; };
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node)) {
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
} };
const callback = (owner, name) => { let result; walk(owner, node => { if (node.type === 'VariableDeclarator' && node.id?.name === name
  && node.init?.callee?.property?.name === 'useCallback') result = node.init.arguments[0]; }); assert.ok(result, name); return result; };
const entry = path.join(temp, 'ports.ts'), bundle = path.join(temp, 'ports.mjs');
await fs.writeFile(entry, 'export * from ' + JSON.stringify(path.join(root, 'lab/pilot/native-file-upload.tsx')) + ';');
await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'unused-shared-viewer-port', setup(build) {
    build.onResolve({ filter: /^\/lcos\/agent-ui\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const nativeMaterialViewerAvailable=()=>false;export const requestNativeMaterialView=()=>{throw Error("not used")}', loader: 'js' }));
    build.onResolve({ filter: /^[^./][^:]*$/ }, args => { try { return { path: dep.resolve(args.path) }; } catch {} });
  } }] });
const previousWindow = globalThis.window, report = { passed: false,
  scope: 'source-extracted original _E/n7/o7/r7/J9/XD + EO + Jir/Mor + jF Ee/jt + original mO readers; explicit controlled network/transfer leaf ports, zero candidate/Core writes', cases: [] };
try {
  const api = {}, originalHost = { projectId: 'project', canvasId: 'canvas', currentCanvasId: 'canvas', api };
  globalThis.window = { __LCOS_NODE_LAB__: originalHost };
  const ports = await import(pathToFileURL(bundle).href);
  const page = 'page-Da_DfwiK.js', course = 'course-api-base-url-CifxI1ia.js', index = 'index-BAQXnPag.js', unlimited = 'UnlimitedModeToggle-D4wysAbz.js';
  const events = [], additions = [], messages = [], reads = [];
  const hooks = { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: task => task(), useCallback: task => task };
  const file = { name: 'manual.pdf', type: 'application/pdf', size: 1024 };
  const receipt = { file_id: 'upload-1', file_name: file.name, mime_type: file.type, url: 'http://127.0.0.1/api/conversation/storage/uploads/upload-1', file_size: file.size,
    fileRecordId: 'file-record', artifact_kind: 'pdf', lcos_ref: { version: 1, entityType: 'artifact', entityId: 'artifact', artifactId: 'artifact', artifactViewId: 'primary-view', revisionId: 'revision' } };
  let completeWait = null, nextResult = null;
  const gateway = { Post: pathname => ({ send: async () => { events.push({ kind: 'POST', pathname }); return { code: 0, data: { file_id: 'upload-1', upload_strategy: 'single_put', headers: {}, upload_url: 'http://127.0.0.1/staging' } }; } }),
    Put: pathname => ({ send: async () => { events.push({ kind: 'PUT-complete', pathname }); if (completeWait) await completeWait; return { code: 0, data: receipt }; } }) };
  const transfer = { prepareForNewBatch: () => events.push({ kind: 'original-transfer-prepare' }), open: () => events.push({ kind: 'original-transfer-open' }), upsertItems: items => events.push({ kind: 'original-transfer-items', count: items.length }) };
  const base = { ...ports, d: hooks, l: hooks, LCOSNativeFileUploadReceipt, cl: x => x, Xir: gateway,
    bP: { createUpload: '/api/files/upload-urls', completeUpload: id => '/api/files/upload-urls/' + id + '/complete' },
    Zir: error => { throw error; }, wxt: { error: () => {} }, jl: Error, R7e: async () => 'original-existing-hash',
    Ei: () => {}, aor: () => 'original-checkpoint', _or: () => false, Zz: { partSize: 1024 }, Ug: (_file, status) => ({ file: _file, taskId: 'task', status, loaded: 0, total: _file.size, percentage: 0 }),
    gor: async ({ options }) => { if (options?.signal?.aborted) throw Error('canceled'); events.push({ kind: 'original-single-put' }); }, l4e: () => {},
    nN: id => 'http://127.0.0.1/api/conversation/storage/uploads/' + id,
    LK: (_e, options) => options ?? {}, BK: () => ({ success: true, results: [], errors: [] }), FK: () => 'batch', cm: () => {}, SO: () => false,
    O_: { getState: () => transfer }, OK: value => value,
  };
  const uploader = new Function('controls', 'with(controls){' + ['Jir', 'Zrt', 'Mor'].map(name => text(index, name)).join('\n') + 'return new Mor(new Jir(Xir),R7e)}')(base);
  const EO = new Function('controls', 'with(controls){' + text(course, 'jK') + text(course, 'EO') + 'return EO}')(Object.assign(base, {
    O4: async (files, options) => {
      options.onChange({ files: files.map(item => ({ taskId: 'task', file: item, status: 'uploading', percentage: 50 })) });
      if (nextResult) return nextResult;
      const results = await Promise.all(files.map(async item => ({ file: item, result: await uploader.upload(item, {}, () => {}) })));
      return { success: true, results, errors: [] };
    },
  }));
  base.dw = () => EO();
  const factory = new Function('controls', 'with(controls){' + text(unlimited, 'XD') + 'return XD}')(Object.assign(base, {
    Ru: { getState: () => ({ mergedPolicy: { canvasMeta: { ignoreLocalRuntimeCache: true } } }) }, SM: 'original-model', Wa: { 'original-model': {} },
    kM: () => ({}), ie: { TEXT: 'text' }, Pu: () => 'file-node', sd: { GENERATE: 'generate' }, zp: { getState: () => ({ selectedNodeCount: 0 }) }, ar: { height: 200, width: 300 },
  }));
  const uploadControls = Object.assign(base, {
    $e: () => ({ addNodes: nodes => additions.push(...nodes) }), he: () => ({ t: key => key }), No: () => ({ upload: true, nodes: { allowedCreateTypes: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO'] } }),
    l7: () => ({ current: true }), Nj: ['image', 'video', 'audio', 'world'], Rs: () => {}, hh: () => [], fh: () => [],
    tx: () => 'image/*', Ej: () => {}, Ij: originalFile => ({ valid: originalFile.type.startsWith('image/'), mediaType: 'image' }),
    rT: (allowed, type) => allowed.includes(type), ft: () => { throw Error('policy blocked'); }, Tj: item => item,
    nt: { canvas: { trackCanvasFileUploadClicked: () => {} } }, se: { error: message => messages.push(message) },
    fi: factory, _j: () => undefined, Vi: () => {}, t7: () => {}, s7: error => error.message,
    Z9: () => ({ type: 'image', data: { originalImageFactory: true } }),
  });
  const ingress = new Function('controls', 'with(controls){' + ['Sb', 'n7', 'i7', 'o7', 'r7', 'a7', '$9', 'Fl', 'J9', '_E'].map(name => text(page, name)).join('\n') + 'return _E()}')(uploadControls);
  const point = { x: 321, y: 654, zoom: 0.75 };
  await ingress.handleFileSelect([file], point, 'drag2canvas');
  assert.equal(events.filter(value => value.kind === 'POST').length, 1); assert.equal(events.filter(value => value.kind === 'PUT-complete').length, 1);
  assert.equal(additions.length, 1); assert.equal(additions[0].type, 'text'); assert.deepEqual(additions[0].position, point);
  assert.equal(additions[0].data.lcos_upload_url, receipt.url); assert.equal(additions[0].data.lcos_ref, undefined);
  assert.equal(additions[0].data.lcos_file_ref.revisionId, receipt.lcos_ref.revisionId);
  assert.ok(events.some(value => value.kind === 'original-transfer-open'));
  report.cases.push('actual _E → EO/Jir/Mor single PUT completion receipt → original XD/create, exact release point and no source lcos_ref supplied');
  const count = additions.length;
  let resume; completeWait = new Promise(resolve => { resume = resolve; });
  const old = ingress.handleFileSelect([file], point, 'ctrl_v'); await new Promise(resolve => setTimeout(resolve, 0));
  window.__LCOS_NODE_LAB__ = { ...originalHost, currentCanvasId: 'other' }; resume(); await old; completeWait = null;
  assert.equal(additions.length, count); window.__LCOS_NODE_LAB__ = originalHost;
  report.cases.push('upload completion after Canvas switch preserves manager result and issues zero addNodes');
  assert.deepEqual(ports.LCOSNativeFileUploadTypes({ allowedTypes: ['image'] }, ['image']), ['image']);
  assert.equal(ports.LCOSNativeFileUploadValidate(file, ['image'], () => 'original-image-only'), 'original-image-only');
  assert.equal(ports.LCOSNativeFileUploadValidate({ name: 'x.exe', size: 10 }, ['text'], () => 'unsupported'), 'unsupported');
  const bad = { ...receipt, file_size: receipt.file_size + 1 };
  const ordinary = { success: true, fileInfo: { file_id: receipt.file_id, file_name: file.name, mime_type: file.type, url: receipt.url, file_size: file.size } };
  assert.equal(LCOSNativeFileUploadReceipt(ordinary, bad, file), ordinary);
  assert.equal(ports.LCOSNativeFileUploadNode(file, ordinary, point, factory, () => 'bad-url-fallback'), null);
  report.cases.push('restricted original picker preserved; unsupported extension/wrong receipt/missing Core receipt never turn URL into file or image');
  // Construct the actual original mO store. Only the network leaf and normal
  // cache helpers are controlled; fetchFolderAssets/fetchFolders are unmodified.
  const originalSpaceEnum = new Function('let $e;' + text(unlimited, '$e').replace('const $e=', '$e=') + 'return $e')();
  assert.equal(originalSpaceEnum.SPACE_TYPE_PRIVATE, 1);
  assert.equal(typeof originalSpaceEnum.SPACE_TYPE_PRIVATE, 'number');
  let state;
  const store = new Function('controls', 'with(controls){' + text(unlimited, 'mO') + 'return mO}')(Object.assign(base, {
    tn: initializer => { const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
      state = initializer(set, () => state); return { getState: () => state }; },
    $e: originalSpaceEnum, zh: new Map(), jh: 50, yh: (folder, filter) => folder + ':' + (filter ?? ''), KC: () => 1, Fh: () => false,
    Nr: row => row, sa: () => null,
    ve: { listFolderTree: async params => { reads.push({ kind: 'original-tree', params }); return { data: { folders: [{ id: 'lcos-project:project', name: 'project' }] } }; },
      listFolderAssets: async params => { reads.push({ kind: 'original-assets', params }); return { data: { assets: [{ id: 'artifact', name: 'manual.pdf' }] } }; } },
  }));
  const inputElement = { value: 'fakepath', click: () => events.push({ kind: 'original-input-click' }) };
  const choice = { current: null }, input = { current: inputElement }, notice = { success: value => messages.push(value), error: value => messages.push(value) };
  const libraryNode = bindings[page].get('jF');
  const chooseNode = callback(libraryNode, 'Ee'), inputNode = callback(libraryNode, 'jt');
  const library = new Function('controls', 'with(controls){return {choose:' + compiled[page].slice(chooseNode.start, chooseNode.end)
    + ',input:' + compiled[page].slice(inputNode.start, inputNode.end) + '}}')(Object.assign(base, { xe: choice, fe: input, y: originalSpaceEnum.SPACE_TYPE_PRIVATE, $e: originalSpaceEnum, wt: store,
    se: notice, We: EO().uploadFiles, N: store.getState().fetchFolderAssets,
    U: () => { throw Error('LCOS import must not open cloud destination form'); }, Ed: { saveAssets: () => { throw Error('no cloud saveAssets'); } },
  }));
  library.choose(); assert.equal(choice.current.folderId, 'lcos-project:project');
  assert.ok(events.some(value => value.kind === 'original-input-click'));
  await library.input({ target: { files: [file] } });
  assert.deepEqual(reads.map(value => value.kind), ['original-assets', 'original-tree']);
  assert.equal(store.getState().folderAssets['lcos-project:project:'].assets[0].id, 'artifact');
  assert.equal(additions.length, count); assert.ok(messages.includes('已上传到项目材料。'));
  report.cases.push('actual jF Ee/jt → original EO upload → actual mO fetchFolderAssets/fetchFolders refresh, zero cloud saveAssets/Canvas writes');
  const clicks = events.filter(value => value.kind === 'original-input-click').length;
  state.activeSpace = originalSpaceEnum.SPACE_TYPE_TEAM;
  assert.equal(ports.LCOSNativeFileLibraryChoose(choice, input, state.activeSpace, store, notice, originalSpaceEnum.SPACE_TYPE_PRIVATE), true);
  assert.equal(events.filter(value => value.kind === 'original-input-click').length, clicks);
  state.activeSpace = originalSpaceEnum.SPACE_TYPE_PRIVATE;
  assert.equal(ports.LCOSNativeFileLibraryChoose(choice, { current: null }, state.activeSpace, store, notice, originalSpaceEnum.SPACE_TYPE_PRIVATE), true);
  assert.equal(events.filter(value => value.kind === 'original-input-click').length, clicks);
  report.cases.push('real donor numeric enum initializes the original private Library; original input click works, Team and missing input remain rejected');
  reads.length = 0; library.choose();
  completeWait = new Promise(resolve => { resume = resolve; });
  const late = library.input({ target: { files: [file] } }); await new Promise(resolve => setTimeout(resolve, 0));
  window.__LCOS_NODE_LAB__ = { ...originalHost, api: {} }; resume(); await late; completeWait = null;
  assert.equal(reads.length, 0); window.__LCOS_NODE_LAB__ = originalHost;
  report.cases.push('late Library completion after same-place API replacement never refreshes a different owner');
  const globalNode = bindings[page].get('c7'), globalCalls = [];
  const pasteNode = callback(globalNode, 'f'), dropNode = callback(globalNode, 'x');
  const globalHandlers = new Function('controls', 'with(controls){return {paste:' + compiled[page].slice(pasteNode.start, pasteNode.end)
    + ',drop:' + compiled[page].slice(dropNode.start, dropNode.end) + '}}')(Object.assign(base, { c: () => {}, u: () => false,
    i: () => globalCalls.push('deselect'), s: value => value, t: () => 1, ul: () => false,
    n: () => ({ x: 0, y: 0, zoom: 1 }), ns: value => value,
    h: async (files, position, source) => globalCalls.push({ files: [...files], position, source }), o: key => key,
  }));
  for (const targetName of ['Composer', 'Library', 'input', 'textarea', 'contenteditable']) {
    let prevented = false, stopped = false;
    const event = { target: { closest: () => ({ targetName }) }, dataTransfer: { files: [file] }, clipboardData: { files: [file] },
      preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; }, clientX: 123, clientY: 456 };
    await globalHandlers.drop(event); await globalHandlers.paste(event);
    assert.equal(prevented, false); assert.equal(stopped, false); assert.equal(globalCalls.length, 0);
  }
  const event = { target: { closest: () => null }, dataTransfer: { files: [file] }, preventDefault() {}, stopPropagation() {}, clientX: 123, clientY: 456 };
  await globalHandlers.drop(event);
  assert.equal(globalCalls.length, 2); assert.equal(globalCalls[0], 'deselect');
  assert.deepEqual(globalCalls[1].position, { x: 123, y: 456, zoom: 1 });
  report.cases.push('actual c7 paste/drop callbacks leave Composer/Library/input/editor events untouched before preventDefault/deselect/upload; plain Canvas still receives exact release point');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; throw error;
} finally {
  globalThis.window = previousWindow;
  const output = path.join(root, 'output/原生文件Drop整合_20261017i/原上传前门与真实回调回归.json');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report }));
}
process.exit(report.passed ? 0 : 1);
