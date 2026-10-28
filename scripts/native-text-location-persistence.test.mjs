import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { nativeTextLocationPersistenceSources as owners, transformNativeTextLocationPersistenceSource as transform,
  withNativeTextLocationPersistenceSourceTransforms as compose } from '../lab/native-text-location-persistence-source-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const runtimeBase = path.join(root, '.runtime'); await fs.mkdir(runtimeBase, { recursive: true });
const runtime = await fs.mkdtemp(path.join(runtimeBase, 'text-location-persistence-'));
const output = path.join(root, 'output', '文本准确定位_R02_20261026', '持久来源专项', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, mode: 'actual transformed original restore/transfer/lineage functions + disposable real Core HTTP/SQLite',
  runtime, output, cases: [], sourceOwners: owners, requests: [], notices: [], receipts: [], models: 0, runs: 0,
  activeRuntimeTouched: false, originalSourcesModified: false, browserDragClaimed: false };
for (const key of Object.keys(process.env)) if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr');
const originalFetch = globalThis.fetch, oldStorage = globalThis.localStorage;
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
globalThis.__nativeTextPersistenceTest = { coreOrigin: '', notices: [], canvasId: 'surface-core-main' };
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const ports = process._getActiveHandles().filter(h => h instanceof Server && h.listening).map(h => h.address()?.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !ports.includes(Number(url.port)) || ['56311', '59932'].includes(url.port))
    throw new Error('Only the test-owned random Core loopback listener is allowed.');
  report.requests.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), path: url.pathname });
  return originalFetch(input, init);
};
let facade;
const readOriginal = async relative => {
  const file = path.join(root, relative), adopted = readCurrentGen2Resource(file);
  return adopted?.contents ?? fs.readFile(file, 'utf8');
};
const absoluteImports = (source, from) => source.replace(/((?:from\s*|import\s*)['"])(\.[^'"]+)(['"])/g,
  (_all, before, specifier, after) => before + path.resolve(path.dirname(from), specifier).replaceAll('\\', '/') + after);
const relative = file => path.relative(runtime, path.join(root, file)).replaceAll('\\', '/');
try {
  const sources = {};
  for (const [kind, owner] of Object.entries(owners)) {
    const source = await readOriginal(owner), file = path.join(root, owner), adapted = transform(source, { sourcePath: file });
    assert.equal(transform(adapted, { sourcePath: file }), adapted);
    assert.throws(() => transform(source, { sourcePath: path.join(root, 'lab/not-the-original.ts') }), /exact original/);
    assert.throws(() => transform(source.replace(kind === 'window' ? 'function readSourceLocator' : kind === 'lineage' ? 'function readerSourceLocator' : 'function materialSourceAnchor', 'function changedOwner'), { sourcePath: file }), /seam changed/);
    sources[kind] = absoluteImports(adapted, file);
    await fs.writeFile(path.join(runtime, kind + '.ts'), sources[kind]);
  }
  let previousCalls = 0;
  const combined = compose({ [owners.lineage]: source => { previousCalls++; return source + '\n// previous transform preserved\n'; } });
  assert.match(combined[owners.lineage](await readOriginal(owners.lineage), { sourcePath: path.join(root, owners.lineage) }), /previous transform preserved/);
  assert.equal(previousCalls, 1);
  report.cases.push('exact three original owners, drift refusal, composition and idempotence; original files stay read-only');

  // The complete original material producer runs. Only unrelated browser
  // transports are ports here; parser, client, relation transaction, stores
  // and all current/source/version guards remain the actual adopted code.
  const stubs = path.join(runtime, 'browser-ports.ts');
  await fs.writeFile(stubs, `
export const toast=(message:string,options?:unknown)=>globalThis.__nativeTextPersistenceTest.notices.push({message,options});
export default {getState:()=>({canvasId:globalThis.__nativeTextPersistenceTest.canvasId})};
export const canReadHuabuPayload=()=>false;
export const getHuabuPayload=()=>{throw new Error('Unexpected native Huabu payload branch')};
export const receiveCanvasUrlDrop=()=>false;
export const createProjectText=()=>{throw new Error('Unexpected native note branch')};
`);
  const sessionOwner = 'lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
  const sessionSource = absoluteImports(await readOriginal(sessionOwner), path.join(root, sessionOwner))
    .replace('import.meta.env', '({LCOS_CORE_URL:globalThis.__nativeTextPersistenceTest.coreOrigin,LCOS_CORE_TOKEN:""})');
  await fs.writeFile(path.join(runtime, 'session.ts'), sessionSource);
  let ingress = sources.ingress;
  for (const name of ['@/components/Common/Toast', '@/store/canvasStore', '@/utils/io/dragDrop',
    path.resolve(root, 'lcos/huabu/apps/web/src/lcos/drop/canvasUrlIngress').replaceAll('\\', '/'),
    path.resolve(root, 'lcos/huabu/apps/web/src/lcos/nodes/creation/projectTextCreation').replaceAll('\\', '/')])
    ingress = ingress.replaceAll(name, stubs.replaceAll('\\', '/'));
  ingress = ingress.replaceAll(path.resolve(root, 'lcos/huabu/apps/web/src/lcos/app/lcosCoreClient').replaceAll('\\', '/'), path.join(runtime, 'session').replaceAll('\\', '/'));
  await fs.writeFile(path.join(runtime, 'ingress.ts'), ingress);
  const entry = path.join(runtime, 'fixture.ts');
  await fs.writeFile(entry, [
    `export * from './window'; export * from './lineage'; export * from './ingress'; export * from './session';`,
    `export * from ${JSON.stringify(relative('lab/pilot/native-text-location-persistence.ts'))};`,
    `export {normalizeNativeTextLocator} from ${JSON.stringify(relative('lab/pilot/native-text-location.ts'))};`,
    `export {useLcosShellStore as shell} from ${JSON.stringify(relative('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'))};`,
    `export {useLcosReferenceStore as references} from ${JSON.stringify(relative('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'))};`,
    `export {LCOS_MATERIAL_TRANSFER_MIME as materialMime,serializeMaterialTransfer} from ${JSON.stringify(relative('lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer.ts'))};`,
    `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`,
    `export {SqliteMetadataRepository} from ${JSON.stringify(relative('lcos/apps/local-core/src/metadata-repository.ts'))};`,
  ].join('\n'));
  const bundle = await buildPilotEntry(path.relative(root, entry), path.join(runtime, 'fixture.mjs'), 'node',
    { coreWorkspaceMembership: true, coreCollectionTitle: true });
  const api = await import(pathToFileURL(bundle));
  const text = '开头\n重复句子🙂\n中间\n重复句子🙂\n末尾';
  const quote = '重复句子🙂', firstStart = text.indexOf(quote), secondStart = text.lastIndexOf(quote);
  const a = { kind: 'selection', label: '第一处', textRange: { start: firstStart, end: firstStart + quote.length, quote } };
  const b = { kind: 'selection', label: '第二处', textRange: { start: secondStart, end: secondStart + quote.length, quote } };
  const legacyLine = { kind: 'lines', start: 1, end: 3, label: '原文行' };
  const mixed = { kind: 'selection', label: '多处', locations: [a, legacyLine, b, a], selected: b };
  const normalizedMixed = api.normalizeNativeTextLocator(mixed);
  for (const locator of [a, b, mixed, { kind: 'selection', locations: [a, b] }, { kind: 'selection', locations: [legacyLine, { kind: 'page', pageNumber: 2 }, { kind: 'slide', slideNumber: 3 }] }]) {
    const encoded = api.materialSourceAnchor({ source: { locator } });
    assert.ok(encoded.startsWith('text-selection:'));
    assert.deepEqual(api.readerSourceLocator(encoded), api.normalizeNativeTextLocator(locator));
  }
  assert.equal(normalizedMixed.locations.length, 3); assert.deepEqual(normalizedMixed.selected, b);
  const legacy = [[{ kind: 'page', pageNumber: 2 }, 'pdf:p2'], [{ kind: 'slide', slideNumber: 3 }, 'pptx:s3'],
    [legacyLine, 'text:l2-l4'], [{ kind: 'selection', label: '章：😀' }, 'section:章：😀'], [{ kind: 'selection' }, undefined]];
  for (const [locator, expected] of legacy) assert.equal(api.materialSourceAnchor({ source: { locator } }), expected);
  assert.deepEqual(api.readerSourceLocator('pdf:p2'), { kind: 'page', pageNumber: 2, label: '第 2 页' });
  assert.deepEqual(api.readerSourceLocator('pptx:s3'), { kind: 'slide', slideNumber: 3, label: '第 3 页' });
  assert.deepEqual(api.readerSourceLocator('text:l2-l4'), { kind: 'lines', start: 1, end: 3, label: '第 2–4 行' });
  assert.deepEqual(api.readerSourceLocator('section:章：😀'), { kind: 'selection', label: '章：😀' });
  assert.equal(api.materialSourceAnchor({ source: {} }), undefined);
  for (const anchor of ['text-selection:{', 'text-selection:{"kind":"page","pageNumber":2}', 'text-selection:{"kind":"selection","textRange":{"start":0,"end":3,"quote":"x"}}', 'pdf:p0', 'text:l4-l2', 'section: ']) assert.equal(api.readerSourceLocator(anchor), undefined);
  report.cases.push('real original encoder/decoder preserve UTF16 repeat positions and mixed legacy/range group + chosen member; old anchor bytes/labels unchanged; invalid new prefix never falls through');

  const key = 'lcos.professional-window-layout.v1.restore-project';
  const window = { id: 'reader', bodyKey: 'reader', title: '确版阅读', target: 'historical-artifact', active: true,
    readerRevisionId: 'historical-revision', readerSource: { surface: 'main', nodeId: 'source-node' }, sourceLocator: mixed,
    composerOriginKey: 'ephemeral-input', returnToWindowId: 'ephemeral-return', accountToken: 'synthetic-unknown-field' };
  const region = { id: 'reader-region', layout: 'floating', windowIds: ['reader'], activeWindowId: 'reader', rect: { x: 10, y: 20, width: 700, height: 600 } };
  api.writeProfessionalWindowLayout('restore-project', [window], [region]);
  const restored = api.readProfessionalWindowLayout('restore-project'); assert.ok(restored);
  assert.deepEqual(restored.windows[0].sourceLocator, normalizedMixed);
  assert.equal(restored.windows[0].readerRevisionId, 'historical-revision'); assert.deepEqual(restored.windows[0].readerSource, window.readerSource);
  for (const ephemeral of ['composerOriginKey', 'returnToWindowId', 'accountToken']) assert.equal(restored.windows[0][ephemeral], undefined);
  assert.equal(api.readProfessionalWindowLayout('another-project'), undefined);
  const validSnapshot = storage.get(key);
  const invalid = [
    { kind: 'selection', textRange: { start: 1, end: 3, quote: 'x' } },
    { kind: 'selection', locations: [a, b], selected: { ...b, textRange: { ...b.textRange, start: 50, end: 50 + quote.length } } },
    { kind: 'selection', locations: [{ kind: 'selection', locations: [a] }] },
    { kind: 'future-position', textRange: a.textRange },
    { kind: 'selection', textRange: null },
  ];
  for (const locator of invalid) {
    const raw = JSON.parse(validSnapshot); raw.windows[0].sourceLocator = locator; storage.set(key, JSON.stringify(raw));
    assert.equal(api.readProfessionalWindowLayout('restore-project'), undefined, 'supplied invalid coordinate rejects restore, never becomes a generic Reader');
    assert.throws(() => api.materialSourceAnchor({ source: { locator } }), /来源位置尚未确认/);
  }
  storage.set(key, validSnapshot);
  report.cases.push('actual original layout writer/reader retain normalized locator, exact revision and return source; original project/region validation and ephemeral/account omission remain; invalid locator refuses whole restore');

  facade = await api.startSurfaceCoreFacade({ runtimeRoot: path.join(runtime, 'owned'), publicOrigin: 'http://127.0.0.1:19964', fullIntegration: true,
    nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { repository, origin, projectId, databasePath } = facade.core;
  globalThis.__nativeTextPersistenceTest.coreOrigin = origin;
  const workspace = repository.getWorkspaces(projectId).find(row => row.canvasId === 'surface-core-main'); assert.ok(workspace);
  api.shell.setState({ projectId, activeSurface: 'main', activeWorkspaceId: String(workspace.id) });
  const session = api.createLcosCoreSession();
  const source = await session.artifacts.createTextArtifact(projectId, { title: '两处相同句子的确版来源', body: text,
    scopeId: String(workspace.scopeId), workspaceId: String(workspace.id), x: 32, y: 40 });
  const sourceFile = repository.getFileRecord(source.fileRecordId); assert.ok(sourceFile);
  const sourceBytes = await (await session.artifacts.getFileRecordContent(projectId, source.fileRecordId)).text(); assert.equal(sourceBytes, text);
  const initialRuns = repository.getProjectExecutionProjection(projectId).runs; assert.equal(initialRuns.length, 0);
  const originalNodes = await facade.handle({ method: 'GET', url: '/api/canvas/v1/canvases/surface-core-main' });
  const oldGraph = await session.projects.getProjectGraph(projectId), initialOldArtifacts = structuredClone(oldGraph.artifacts);
  const graph = () => session.projects.getProjectGraph(projectId);
  const waitNotice = async count => {
    const until = Date.now() + 8000;
    while (globalThis.__nativeTextPersistenceTest.notices.length === count && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(globalThis.__nativeTextPersistenceTest.notices.length > count, 'original async producer finished with an honest UI notice');
    return globalThis.__nativeTextPersistenceTest.notices.at(-1);
  };
  const transfer = payload => ({ files: [], items: [], types: [api.materialMime], getData: kind => kind === api.materialMime ? api.serializeMaterialTransfer(payload) : '' });
  const drop = async (parent, locator, body, title = '确版来源') => {
    const before = await graph(), count = globalThis.__nativeTextPersistenceTest.notices.length;
    const payload = { schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(),
      source: { projectId, title, artifactId: parent.artifactId, revisionId: parent.revisionId, fileRecordId: parent.fileRecordId, locator }, content: { kind: 'text', text: body } };
    assert.equal(api.receiveCanvasMaterialDrop(projectId, transfer(payload), { x: 90, y: 110 }), true);
    const notice = await waitNotice(count), after = await graph();
    const created = after.artifacts.filter(row => !before.artifacts.some(old => old.id === row.id));
    return { before, after, created, notice };
  };
  const first = await drop(source, mixed, quote + '\n' + quote);
  assert.equal(first.created.length, 1, JSON.stringify(first.notice)); assert.doesNotMatch(first.notice.message, /尚未确认|未完成/);
  const child = first.created[0], childRevision = repository.getArtifactRevision(String(child.currentRevisionId));
  const relation = first.after.relations.find(row => row.sourceEntityId === child.id && row.targetEntityId === source.artifactId && row.kind === 'reference'); assert.ok(relation);
  const evidence = relation.evidenceRefs.find(row => row.id === source.artifactId); assert.equal(evidence.revisionId, source.revisionId);
  assert.deepEqual(api.readerSourceLocator(evidence.sourceAnchor), normalizedMixed);
  const lineages = api.readerLineageEntries(projectId, String(child.id), first.after); assert.equal(lineages.length, 1);
  assert.deepEqual(lineages[0].locator, normalizedMixed); assert.equal(lineages[0].revisionId, source.revisionId); assert.equal(lineages[0].unavailableReason, undefined);
  report.receipts.push({ child: String(child.id), source: source.artifactId, revision: source.revisionId, relation: String(relation.id), anchor: evidence.sourceAnchor });
  report.cases.push('complete original structured material drop → actual Core text producer → original createRelation/putRelation transactions → exact mixed locator readerLineage; no substitute producer or SQL writes');

  const childBody = await (await session.artifacts.getFileRecordContent(projectId, String(childRevision.fileRecordId))).text();
  const childSelected = { kind: 'selection', textRange: { start: childBody.lastIndexOf(quote), end: childBody.lastIndexOf(quote) + quote.length, quote } };
  const second = await drop({ artifactId: String(child.id), revisionId: String(childRevision.id), fileRecordId: String(childRevision.fileRecordId) }, childSelected, quote, '第一代摘录');
  assert.equal(second.created.length, 1); assert.doesNotMatch(second.notice.message, /尚未确认|未完成/);
  const secondChild = second.created[0], secondLineage = api.readerLineageEntries(projectId, String(secondChild.id), second.after);
  assert.equal(secondLineage.length, 1); assert.equal(secondLineage[0].artifactId, child.id); assert.equal(secondLineage[0].revisionId, childRevision.id);
  assert.deepEqual(secondLineage[0].locator, childSelected);
  assert.deepEqual(api.readerLineageEntries(projectId, String(child.id), second.after)[0].locator, normalizedMixed);
  const secondRelation = second.after.relations.find(row => row.id === secondLineage[0].relationId);
  report.receipts.push({ child: String(secondChild.id), source: String(child.id), revision: String(childRevision.id), relation: String(secondRelation.id), anchor: secondRelation.evidenceRefs[0].sourceAnchor });
  report.cases.push('real second derived material records its own exact parent revision/offset; parent retains original mixed positions, repeated quote never defaults to first match');

  for (const locator of invalid) {
    const failed = await drop(source, locator, '非法位置不得生成这份摘录');
    assert.equal(failed.created.length, 0); assert.match(failed.notice.message, /来源位置尚未确认/);
    assert.deepEqual(failed.after, failed.before, 'invalid coordinate rejects before child/Core relation/View/file write');
  }
  const corrupt = structuredClone(second.after); const badRelation = corrupt.relations.find(row => row.id === relation.id);
  badRelation.evidenceRefs[0].sourceAnchor = 'text-selection:{"kind":"selection","locations":[]}';
  const unavailable = api.readerLineageEntries(projectId, String(child.id), corrupt)[0];
  assert.match(unavailable.unavailableReason, /位置不可识别/); assert.equal(unavailable.locator, undefined); assert.equal(unavailable.revisionId, source.revisionId);
  assert.throws(() => api.readerLineageEntries('wrong-project', String(child.id), second.after), /来源项目尚未核对/);
  const missingRevision = structuredClone(second.after); missingRevision.artifactRevisions = missingRevision.artifactRevisions.filter(row => row.id !== source.revisionId);
  assert.match(api.readerLineageEntries(projectId, String(child.id), missingRevision)[0].unavailableReason, /版本已缺失/);
  assert.equal(await (await session.artifacts.getFileRecordContent(projectId, source.fileRecordId)).text(), sourceBytes);
  assert.deepEqual(repository.getProjectExecutionProjection(projectId).runs, initialRuns);
  const finalGraph = await graph();
  for (const old of initialOldArtifacts) assert.deepEqual(finalGraph.artifacts.find(row => row.id === old.id), old);
  const finalNodes = await facade.handle({ method: 'GET', url: '/api/canvas/v1/canvases/surface-core-main' });
  assert.deepEqual(finalNodes.body, originalNodes.body, 'canonical derivation does not replace/move original native saved canvas');
  report.cases.push('five malformed new coordinates produce no child/View/File/relation; malformed persisted anchor and missing revision stay unavailable; original sources/bytes/native nodes/runs remain exact');

  const expected = report.receipts.map(receipt => ({ ...receipt }));
  await facade.close(); facade = undefined;
  const reopened = new api.SqliteMetadataRepository(databasePath, { disposableOnly: true });
  try {
    for (const receipt of expected) {
      const row = reopened.getRelation(receipt.relation); assert.ok(row);
      const fromDisk = row.evidenceRefs.find(item => item.id === receipt.source && item.revisionId === receipt.revision);
      assert.equal(fromDisk.sourceAnchor, receipt.anchor);
      assert.deepEqual(api.readerSourceLocator(fromDisk.sourceAnchor), receipt.child === String(child.id) ? normalizedMixed : childSelected);
    }
    assert.equal(reopened.getProjectExecutionProjection(projectId).runs.length, 0);
  } finally { reopened.close(); }
  report.cases.push('closed original Core and reopened its owned SQLite file: both exact sourceAnchor receipts survive, no memory-only persistence claim');
  report.notices = globalThis.__nativeTextPersistenceTest.notices;
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await facade?.close(); globalThis.fetch = originalFetch;
  if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  delete globalThis.__nativeTextPersistenceTest;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, report: path.join(output, 'report.json'), error: report.error?.message }));
}
