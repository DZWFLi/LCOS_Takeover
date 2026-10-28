import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
const copy = value => JSON.parse(JSON.stringify(value)), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve('output/智能体创建历史_20261023/原O8', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(output, { recursive: true });
const report = { passed: false, checks: [], modelCalls: 0, networkRequests: 0 };
try {
  const assets = path.resolve('reference/tapnow-installed/resources/web/assets'), file = 'page-Da_DfwiK.js', raw = fs.readFileSync(path.join(assets, file), 'utf8');
  const transformed = transformHistoryIntentScript(file, transformSurfaceDockScript(file, transformNodeBridgeScript(file, transformCutScript(file, raw))));
  const program = parseOriginalDonorScript(transformed, file), code = (source, ast, name) => {
    for (const row of ast.body) { if (row.type === 'FunctionDeclaration' && row.id.name === name) return source.slice(row.start, row.end);
      for (const item of row.declarations ?? []) if (item.id?.name === name) return source.slice(item.init.start, item.init.end); }
    throw new Error('Original declaration missing: ' + name);
  };
  const unlimited = fs.readFileSync(path.join(assets, 'UnlimitedModeToggle-D4wysAbz.js'), 'utf8'), unlimitedProgram = parseOriginalDonorScript(unlimited, 'UnlimitedModeToggle-D4wysAbz.js');
  let sequence = 0;
  const ctx = { assert, console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON, structuredClone, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'history-test-' + ++sequence }, xs: () => 'vendor-remap-' + ++sequence, ee: { IMAGE: 'image', VIDEO: 'video', PILE: 'pile' },
    ef: value => Number(value), F0: value => value !== null && typeof value === 'object', NN: Math.max, MN: Math.min, _c: () => Date.now(), kN: 'Expected a function', qp() {} };
  ctx.window = ctx; const sandbox = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('lab/startup-history-intent.js', 'utf8'), sandbox);
  for (const name of ['IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'j8', 'A8', 'D8', 'k8', 'PC']) ctx[name] = vm.runInContext('(' + code(transformed, program, name) + ')', sandbox);
  ctx.Ra = vm.runInContext('(' + code(unlimited, unlimitedProgram, 'PN') + ')', sandbox); ctx.O8 = vm.runInContext('(' + code(transformed, program, 'O8') + ')', sandbox);
  ctx.DC = vm.runInContext('(' + code(transformed, program, 'DC') + ')', sandbox);
  const positionExpressions = [];
  const walk = node => { if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression' && ['canvas_id','data','position','measured','type'].every(key => node.properties.some(p => p.key?.name === key))) {
      const id = node.properties.find(p => p.key?.name === 'id').value.object.name, value = node.properties.find(p => p.key?.name === 'position').value;
      positionExpressions.push(vm.runInContext('(' + id + '=>' + transformed.slice(value.start, value.end) + ')', sandbox));
    }
    for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); }
  }; walk(program); assert.equal(positionExpressions.length, 1);
  const harnessSource = fs.readFileSync('scripts/native-history-create-measurement-replay.test.mjs', 'utf8');
  vm.runInContext(harnessSource.slice(harnessSource.indexOf('function sameDeps('), harnessSource.indexOf('function applyOriginalNodeChanges(')) + '\nglobalThis.HookHarness=HookHarness;', sandbox);
  const base = { id: 'original-text', type: 'text', position: { x: 1, y: 2 }, data: { id: 'original-text', text: 'Keep the original body' } };
  const agent = { id: 'same-agent', type: 'lcos-conversation', position: { x: 400.123456, y: 100.654321 }, measured: { width: 121, height: 142 },
    width: 121, height: 142, data: { id: 'same-agent', title: 'Same conversation',
      lcosGlythAppearance: { shape: 'leaf', color: 'green', motion: 'curious' },
      lcos_conversation_ref: { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', connectedConversationId: 'conversation' },
      lcos_conversation_state: { isRunning: false, waitingReason: null, provider: 'codex' } } };
  let nodes = [base], edges = [], queueIdle = true, batches = [], hooks;
  const setNodes = next => { nodes = next; hooks.setArgs([nodes, edges, options]); };
  const batch = (nodeOperations, edgeOperations) => { batches.push(copy({ nodeOperations, edgeOperations })); return Promise.resolve({}); };
  batch.readExternalGeometryReadiness = () => ({ canvasId: 'canvas', idle: queueIdle });
  batch.acknowledgeExternalGeometry = input => input.canvasId === 'canvas' && queueIdle;
  const options = { enabled: true, debounceDelay: 1, maxHistorySize: 20, canvasId: 'canvas', setNodes,
    defaultOnNodesChange(changes) {
      let next = [...nodes];
      for (const change of changes) {
        if (change.type === 'remove') next = next.filter(node => node.id !== change.id);
        else if (change.type === 'add') next.push(copy(change.item));
        else if (change.type === 'replace') next = next.map(node => node.id === change.id ? copy(change.item) : node);
        else if (change.position) next = next.map(node => node.id === change.id ? { ...node, position: copy(change.position) } : node);
      }
      setNodes(next);
    }, defaultOnEdgesChange() {}, onBatchOperations: batch };
  hooks = new ctx.HookHarness(ctx.O8); ctx.l = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map(name => [name, (...args) => hooks[name](...args)]));
  ctx.__LCOS_NODE_LAB__ = { canvasId: 'canvas', projectId: 'project', api: {} };
  ctx.pp = value => value; // Only position serialization is under test here; UI verifies actual data serialization.
  assert.deepEqual(copy(ctx.PC(agent).position), agent.position);
  const task = { ...agent, type: 'lcos-execution', data: { id: agent.id, lcos_execution_ref: { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', entityType: 'run', entityId: 'run' } } };
  assert.deepEqual(copy(ctx.PC(task).position), agent.position);
  assert.deepEqual(copy(ctx.PC({ ...task, data: { ...task.data, lcos_execution_ref: { ...task.data.lcos_execution_ref, projectId: 'other' } } }).position), { x: 400.12, y: 100.65 });
  assert.deepEqual(copy(ctx.PC({ ...agent, type: 'text' }).position), { x: 400.12, y: 100.65 });
  report.checks.push('Original PC keeps precise same-owner agent/task projection coordinates so navigation measurement cannot move them; unrelated node types and foreign owners retain their original serializer.');
  let api = hooks.render([nodes, edges, options]);
  const settle = async () => { api = hooks.render([nodes, edges, options]); await sleep(10); api = hooks.render([nodes, edges, options]); };
  nodes = [{ ...base, position: { x: 21, y: 22 } }]; await settle();
  const before = copy(api.inspectNativeHistory({ canvasId: 'canvas', nodeId: 'same-agent' }));
  const receipt = { receiptKind: 'conversation-projection', ...agent.data.lcos_conversation_ref, nodes: [agent],
    operation: { version: 1, operationId: 'original-blank-new', kind: 'create', phase: 'apply' } };
  queueIdle = false; assert.equal(api.backfillNodeReceipt(receipt).ok, false); queueIdle = true;
  assert.equal(api.backfillNodeReceipt(receipt).ok, true); await settle();
  const created = copy(api.inspectNativeHistory({ canvasId: 'canvas', nodeId: 'same-agent' }));
  assert.equal(created.historySize, before.historySize + 1); assert.equal(created.currentIndex, before.currentIndex + 1);
  assert.deepEqual(created.undoTarget.nodes, []); assert.equal(created.currentEntry.operations.length, 1); assert.equal(batches.length, 0);
  assert.equal(api.backfillNodeReceipt(receipt).idempotent, true); await settle();
  assert.equal(api.inspectNativeHistory({ canvasId: 'canvas', nodeId: 'same-agent' }).historySize, created.historySize);
  assert.equal(api.backfillNodeReceipt({ ...receipt, operation: undefined }).ok, true); await settle();
  assert.deepEqual(copy(api.inspectNativeHistory({ canvasId: 'canvas', nodeId: 'same-agent' }).undoTarget.nodes), [],
    'A later ordinary conversation refresh must not insert the agent into pre-creation frames.');
  for (let index = 0; index < 2; index++) {
    api.undo(); await settle(); assert.ok(!nodes.some(node => node.id === agent.id));
    const undo = batches.at(-1).nodeOperations.find(op => op.operationType === 'delete');
    assert.equal(undo.id, agent.id); assert.equal(undo.lcos_operation.kind, 'create'); assert.equal(undo.lcos_operation.phase, 'undo');
    assert.deepEqual(undo.lcos_snapshot.data.lcos_conversation_ref, agent.data.lcos_conversation_ref);
    api.redo(); await settle(); const restored = nodes.find(node => node.id === agent.id); assert.ok(restored);
    assert.deepEqual(copy(restored.data), agent.data); assert.deepEqual(copy(restored.position), agent.position);
    const redo = batches.at(-1).nodeOperations.find(op => op.operationType === 'create');
    assert.deepEqual(redo.position, agent.position, 'Original serializer cannot round a restored drop position.');
    assert.deepEqual(copy(positionExpressions[0](redo)), agent.position, 'Actual original r6 payload cannot round the precise history position again.');
    assert.deepEqual(copy(positionExpressions[0]({ ...redo, lcos_operation: undefined })), { x: 400.12, y: 100.65 });
    assert.equal(redo.id, agent.id); assert.equal(redo.lcos_operation.operationId, 'original-blank-new');
    assert.equal(redo.lcos_operation.phase, 'redo'); assert.equal(redo.lcos_intent_unsupported, undefined);
    assert.equal(api.inspectNativeHistory({ canvasId: 'canvas', nodeId: 'same-agent' }).historySize, created.historySize);
  }
  assert.equal(batches.length, 4); assert.equal(nodes[0].data.text, base.data.text);
  report.checks.push('Actual original O8 appends one agent creation, leaves prior frames absent, and idempotent projection never adds a second history/save.');
  report.checks.push('Two original Undo/Redo cycles emit real native delete/create operations with the same carrier, same conversation reference and original operation ID; no remapped replacement agent or phantom history step.');
  report.history = created; report.batches = batches; report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, output, checks: report.checks, error: report.error }, null, 2));
