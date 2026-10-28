import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'output/普通Frame子文字只读_20261028', new Date().toISOString().replace(/[:.]/g, '-'));
const temp = await fs.mkdtemp(path.join(root, '.runtime/ordinary-node-content-')); await fs.mkdir(out, { recursive: true });
const report = { passed: false, scope: 'Execute production pure projection/readonly recognizer with original NodeContent shape; no Core, browser, active workspace, HTTP, model or persistence writes.', cases: [] };
try {
  const file = await buildPilotEntry('lab/pilot/native-ordinary-node-content.ts', path.join(temp, 'content.mjs'));
  const { projectNativeOrdinaryNodeContent: project, isNativeOrdinaryTextReadonly: readonly } = await import(pathToFileURL(file));
  const projectId = 'project', canvasId = 'canvas', workspace = { id: 'workspace', projectId, canvasId };
  const node = { id: 'child', type: 'note', parentId: 'nested-frame', position: { x: 17.25, y: 28.75 }, measured: { width: 220, height: 140 },
    data: { locked: false, color_pins: ['F4A14B'], lcos_gui_navigation_pin: true, lcos_gui_emphasis: false } };
  const text = '原子正文保持\n第二行\n\n**格式** 与 emoji 👋🏽\t末尾  \n';
  const source = { nodeId: node.id, type: 'note', label: '原子标题', content: text };
  const fresh = () => structuredClone({ projectId, canvasId, node, nodes: [node], workspaces: [workspace], bindings: [], content: { canvasId, record: source } });
  const original = fresh(), before = structuredClone(original), value = project(original);
  assert.deepEqual(value, { nodeId: 'child', canvasId, workspaceId: workspace.id,
    data: { id: 'child', title: '原子标题', text, content: text, type: 'pure', lcos_ordinary_text_readonly: true } });
  assert.deepEqual(original, before); assert.equal(readonly(value.data, node.id), true);
  assert.equal(Object.hasOwn(value.data, 'lcos_ref'), false); assert.equal(Object.hasOwn(value.data, 'position'), false); assert.equal(Object.hasOwn(value.data, 'parentId'), false);
  report.cases.push('Exact original note record supplies title and byte-for-byte JS text including newlines/inline Markdown/emoji/whitespace; pure readonly data only, zero geometry/parent/GUI/source mutation or fabricated Core ref');
  for (const [label, content] of [[null, ''], ['', ' \n\t'], ['零', '0']]) {
    const input = fresh(); input.content.record.label = label; input.content.record.content = content;
    const data = project(input).data; assert.equal(data.title, label ?? ''); assert.equal(data.text, content); assert.equal(readonly(data, node.id), true);
  }
  report.cases.push('Empty/null label and genuine empty/whitespace body remain exact; no invented unnamed title, first-line inference or stringify of missing content');
  const fail = (label, mutate, code) => {
    const input = fresh(); mutate(input); const saved = structuredClone(input);
    assert.throws(() => project(input), error => error.code === code && error.status >= 400, label); assert.deepEqual(input, saved, label + ' no mutation');
  };
  for (const [label, mutate] of [['duplicate id', x => x.nodes.push(structuredClone(x.node))], ['wrong data id', x => x.node.data.id = 'other'],
    ['blank id', x => x.node.id = ' '], ['foreign canvas', x => x.node.canvas_id = 'other'], ['foreign source canvas property', x => x.node.canvasId = 'other'],
    ['invalid data', x => x.node.data = []]]) fail(label, mutate, 'ORDINARY_NODE_CONTENT_IDENTITY_MISMATCH');
  for (const [label, mutate] of [['missing workspace', x => x.workspaces = []], ['ambiguous workspace', x => x.workspaces.push({ ...workspace, id: 'other' })],
    ['foreign project', x => x.workspaces[0].projectId = 'foreign'], ['missing workspace id', x => x.workspaces[0].id = '']])
    fail(label, mutate, 'ORDINARY_NODE_CONTENT_WORKSPACE_MISMATCH');
  report.cases.push('Duplicate/replaced spatial identity, invalid data, foreign Canvas and missing/ambiguous/foreign Workspace reject without touching stored layout');
  for (const [label, mutate, code] of [['missing record', x => x.content = null, 'UNAVAILABLE'], ['cross-canvas read', x => x.content.canvasId = 'foreign', 'UNAVAILABLE'],
    ['wrong record id', x => x.content.record.nodeId = 'other', 'RECORD_MISMATCH'], ['wrong record type', x => x.content.record.type = 'text', 'RECORD_MISMATCH'],
    ['missing body', x => delete x.content.record.content, 'RECORD_INVALID'], ['object body', x => x.content.record.content = {}, 'RECORD_INVALID'],
    ['object label', x => x.content.record.label = {}, 'RECORD_INVALID'], ['source-backed record', x => x.content.record.src = 'file.md', 'RECORD_INVALID']])
    fail(label, mutate, 'ORDINARY_NODE_CONTENT_' + code);
  report.cases.push('Missing or other-Space read, wrong original record id/type, non-string/missing body and source-backed records fail explicitly instead of falling back to guessed text');
  const fields = ['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_member_ref','lcos_result_ref','lcos_file_ref',
    'lcos_method_member_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection'];
  for (const key of fields) for (const damaged of [null, undefined, {}]) {
    const input = fresh(); input.node.data[key] = damaged; assert.equal(project(input), undefined, key + ' cannot downgrade');
    assert.equal(readonly({ ...value.data, [key]: damaged }, node.id), false);
  }
  for (const ownerProject of [projectId, 'foreign']) { const input = fresh(); input.bindings.push({ projectId: ownerProject, canvasId, spatialKind: 'node', spatialId: node.id, entityType: 'view', entityId: 'existing' }); assert.equal(project(input), undefined); }
  const typed = fresh(); typed.node.type = 'frame'; assert.equal(project(typed), undefined);
  report.cases.push('Every reserved reference presence, including null/undefined/damaged forms, and every current spatial binding stays outside ordinary; canonical/frame paths are not reclassified');
  for (const patch of [{ id: 'other' }, { type: 'generate' }, { lcos_ordinary_text_readonly: false }, { title: null }, { text: null }, { content: 'different' }])
    assert.equal(readonly({ ...value.data, ...patch }, node.id), false);
  assert.equal(readonly(value.data, ''), false); assert.equal(readonly(null, node.id), false);
  report.cases.push('Frontend readonly recognition needs the exact node, pure discriminator and intact source text/title; it cannot bless a damaged or canonical carrier');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, report: path.join(out, 'report.json') }, null, 2));
