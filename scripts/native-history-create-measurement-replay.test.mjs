import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const reportPath = new URL('../.runtime/native-gen1-branch/2026-10-14T02-43-30-825Z.json', import.meta.url);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const canvasId = 'surface-core-context';
const nodeId = report.createdNodeId;
const pageFilename = 'page-Da_DfwiK.js';
const pagePath = new URL('../reference/tapnow-installed/resources/web/assets/' + pageFilename, import.meta.url);
const pageSource = fs.readFileSync(pagePath, 'utf8');
const debouncePath = new URL('../reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', import.meta.url);
const debounceSource = fs.readFileSync(debouncePath, 'utf8');

function babelParser() {
  const require = createRequire(import.meta.url);
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const cachedParser = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find(file => fs.existsSync(file))
    : undefined;
  if (cachedParser) return require(cachedParser).babelParse;

  const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
  if (!fs.existsSync(store)) throw new Error('Installed Babel parser unavailable; no download attempted.');
  const installed = fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'));
  if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.');
  const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'));
  return (source, filename) => babel.parse(source, { sourceType: 'module', sourceFilename: filename });
}

const parse = babelParser();
function parseProgram(source, filename) {
  return parse(source, filename, true).program;
}

function binding(program, name) {
  const matches = [];
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name) {
      matches.push({ kind: 'function', node: declaration });
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        if (item.id?.type === 'Identifier' && item.id.name === name) matches.push({ kind: 'variable', node: item.init });
      }
    }
  }
  assert.equal(matches.length, 1, `Expected one installed vendor binding for ${name}; found ${matches.length}.`);
  return matches[0];
}

function codeOf(source, entry) {
  return source.slice(entry.node.start, entry.node.end);
}

function objectCallback(root, propertyName, source, label) {
  const matches = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectProperty'
      && (node.key?.name === propertyName || node.key?.value === propertyName)
      && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.value?.type)) {
      matches.push(node.value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(root);
  assert.equal(matches.length, 1, `Expected one ${label}.${propertyName} callback; found ${matches.length}.`);
  return source.slice(matches[0].start, matches[0].end);
}

function sameDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

class HookHarness {
  constructor(hook) {
    this.hook = hook;
    this.slots = [];
    this.cursor = 0;
    this.pendingEffects = [];
    this.dirty = false;
    this.args = [];
    this.output = undefined;
  }

  useState(initial) {
    const slot = this.slot('state');
    if (!slot.initialized) {
      slot.value = typeof initial === 'function' ? initial() : initial;
      slot.initialized = true;
    }
    if (!slot.setter) {
      slot.setter = next => {
        slot.value = typeof next === 'function' ? next(slot.value) : next;
        this.dirty = true;
      };
    }
    return [slot.value, slot.setter];
  }

  useRef(initial) {
    const slot = this.slot('ref');
    if (!slot.initialized) {
      slot.value = { current: initial };
      slot.initialized = true;
    }
    return slot.value;
  }

  useMemo(factory, deps) {
    const slot = this.slot('memo');
    if (!slot.initialized || !sameDeps(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
      slot.initialized = true;
    }
    return slot.value;
  }

  useCallback(callback, deps) { return this.useMemo(() => callback, deps); }

  useEffect(effect, deps) {
    const slot = this.slot('effect');
    if (!slot.initialized || deps === undefined || !sameDeps(slot.deps, deps)) {
      slot.initialized = true;
      slot.nextEffect = effect;
      slot.nextDeps = deps;
      this.pendingEffects.push(slot);
    }
  }

  slot(kind) {
    const index = this.cursor++;
    let slot = this.slots[index];
    if (!slot) this.slots[index] = slot = { kind, initialized: false };
    assert.equal(slot.kind, kind, `Original O8 hook order changed at slot ${index}.`);
    return slot;
  }

  render(args = this.args) {
    this.args = args;
    for (let pass = 0; pass < 12; pass += 1) {
      this.dirty = false;
      this.cursor = 0;
      this.pendingEffects = [];
      this.output = this.hook(...this.args);
      const effects = this.pendingEffects;
      for (const slot of effects) {
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.deps = slot.nextDeps;
        slot.cleanup = slot.nextEffect();
      }
      if (!this.dirty) return this.output;
    }
    throw new Error('The minimal React hook harness did not settle after O8 state updates.');
  }

  setArgs(args) { this.args = args; }
}

function applyOriginalNodeChanges(current, changes, applyNodeChange) {
  let nodes = [...current];
  for (const change of changes) {
    if (change.type === 'remove') nodes = nodes.filter(node => node.id !== change.id);
    else if (change.type === 'add') nodes.push(change.item);
    else if (change.type === 'replace') nodes = nodes.map(node => node.id === change.id ? change.item : node);
    else if (typeof applyNodeChange === 'function' && change.id !== undefined) {
      nodes = nodes.map(node => {
        if (node.id !== change.id) return node;
        const next = { ...node };
        applyNodeChange(change, next);
        return next;
      });
    }
  }
  return nodes;
}

function inspect(api, targetId) {
  return JSON.parse(JSON.stringify(api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId: targetId })));
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function nativeNodeFromReport(record) {
  const geometry = record.geometry;
  const node = { id: record.id, type: record.type, data: structuredClone(record.data), position: structuredClone(geometry.position) };
  if (Number.isFinite(geometry.width)) node.width = geometry.width;
  if (Number.isFinite(geometry.height)) node.height = geometry.height;
  if (geometry.measured && typeof geometry.measured === 'object') node.measured = structuredClone(geometry.measured);
  if (geometry.style && typeof geometry.style === 'object') node.style = structuredClone(geometry.style);
  if (record.parentId !== null && record.parentId !== undefined) node.parentId = record.parentId;
  return node;
}

assert.equal(report.runState, 'failed');
assert.equal(report.createCommitted, true, 'Use the original report’s committed create, not a newly generated node or fresh Canvas.');
assert.equal(report.failureStage, 'undo-armed');
assert.equal(report.source.initialNodes.length, report.source.initialCanvasNodeCount);
assert.equal(report.source.initialNodes.length, 9);
assert.equal(report.createReceipt.nodeId, nodeId);
assert.deepEqual(report.create.nativeBatch.request.node.measured, report.createReceipt.measured);
assert.equal(report.createReceipt.measured.width, 250);
assert.equal(report.createReceipt.measured.height, 250);
assert.deepEqual(report.createOperation, report.create.nativeBatch.operation);

const observedMeasureWrite = report.network.blockedWrites.find(row => row.requestSummary?.actions?.some(action =>
  action.action === 'update' && action.updates?.some(update => update.id === nodeId
    && update.measured?.width === report.createReceipt.measured.width
    && update.measured?.height === report.createReceipt.measured.height)));
assert.ok(observedMeasureWrite, 'The committed branch report must contain the actual post-create measured update.');
assert.equal(observedMeasureWrite.requestSummary.canvas_id, canvasId);
assert.equal(observedMeasureWrite.requestSummary.actions[0].action, 'update');
assert.deepEqual(observedMeasureWrite.requestSummary.actions[0].updates[0], {
  id: nodeId, measured: report.createReceipt.measured,
});
assert.equal(observedMeasureWrite.reason, 'No lifecycle write is armed (stage=create-routed).');
const observedUndoMeasureRetries = report.network.blockedWrites.filter(row =>
  row.reason === 'Expected the original explicit create/undo history operation.'
  && row.requestSummary?.actions?.some(action => action.action === 'update'
    && action.updates?.some(update => update.id === nodeId
      && update.measured?.width === report.createReceipt.measured.width
      && update.measured?.height === report.createReceipt.measured.height)));
assert.ok(observedUndoMeasureRetries.length > 0, 'The report must preserve the same-ID measured updates rejected during undo.');

const transformed = transformHistoryIntentScript(pageFilename,
  transformSurfaceDockScript(pageFilename,
    transformNodeBridgeScript(pageFilename,
      transformCutScript(pageFilename, pageSource))));
assert.ok(transformed.startsWith('/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */'));
const program = parseProgram(transformed, pageFilename);
const o8Binding = binding(program, 'O8');
const tcBinding = binding(program, 'TC');
const r8Binding = binding(program, 'R8');
const pcBinding = binding(program, 'PC');
assert.equal(o8Binding.kind, 'function');
assert.match(codeOf(transformed, tcBinding), /e\.width!==t\.width\|\|e\.height!==t\.height/);
assert.doesNotMatch(codeOf(transformed, tcBinding), /\.measured/,
  'O8’s equality owner compares ReactFlow width/height, not the serialized measured alias.');
assert.match(codeOf(transformed, r8Binding), /TC\(i,o\)/);
assert.match(codeOf(transformed, pcBinding), /e\.dimensions&&\{measured:e\.dimensions\}/,
  'Original PC maps a dimensions change to the request’s measured field.');

const debounceProgram = parseProgram(debounceSource, 'UnlimitedModeToggle-D4wysAbz.js');
const debounceBinding = binding(debounceProgram, 'PN');
const reactFlowBindings = new Map(['Fb', 'Ux', 'Gu', '_f', 'Ur'].map(name => [name, binding(debounceProgram, name)]));
const nodeResizerBinding = binding(debounceProgram, 'jE');
const nodeResizerOnChange = objectCallback(nodeResizerBinding.node, 'onChange', debounceSource, 'ReactFlow NodeResizer jE');
const nodeResizerOnEnd = objectCallback(nodeResizerBinding.node, 'onEnd', debounceSource, 'ReactFlow NodeResizer jE');
const flowChangeCode = name => codeOf(debounceSource, reactFlowBindings.get(name));
const autoMeasureCode = flowChangeCode('Ux');
const applyNodeChangeCode = flowChangeCode('Fb');
assert.match(autoMeasureCode, /dimensions:g/);
assert.doesNotMatch(autoMeasureCode, /resizing|setAttributes/,
  'Installed automatic Ux measurements carry dimensions only; they do not set explicit node width/height.');
assert.match(applyNodeChangeCode, /t\.measured=\{\.\.\.e\.dimensions\}/);
assert.match(applyNodeChangeCode, /e\.setAttributes&&/);
assert.match(nodeResizerOnChange, /resizing:!0/);
assert.match(nodeResizerOnChange, /setAttributes:f\?f==="horizontal"\?"width":"height":!0/);
assert.match(nodeResizerOnEnd, /resizing:!1/);
const pageProgram = parseProgram(pageSource, pageFilename);
const debounceImport = pageProgram.body.flatMap(statement => statement.type === 'ImportDeclaration' ? statement.specifiers : [])
  .filter(specifier => specifier.local.name === 'Ra' && specifier.imported?.name === 'bS');
assert.equal(debounceImport.length, 1, 'O8’s original Ra debounce import must stay source-bound.');

const extracted = new Map();
for (const name of ['IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'A8', 'D8', 'j8', 'k8', 'PC']) {
  const entry = binding(program, name);
  extracted.set(name, codeOf(transformed, entry));
}
const debounceCode = codeOf(debounceSource, debounceBinding);

async function replay({ mode }) {
  const includeCounterfactualWidthHeight = mode === 'counterfactual-explicit-width-height';
  const sourceFaithfulAutomatic = mode === 'source-faithful-automatic-measurement';
  const sourceFaithfulManual = mode === 'source-faithful-manual-resize';
  const captures = { nodeChanges: [], batches: [] };
  const seedNodes = report.source.initialNodes.map(nativeNodeFromReport);
  let liveNodes = seedNodes;
  const edges = [];
  const sandbox = {
    console,
    Date,
    Promise,
    Map,
    Set,
    WeakMap,
    Object,
    Array,
    Math,
    Number,
    String,
    Boolean,
    JSON,
    structuredClone,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => report.createOperation.operationId },
    getComputedStyle: () => ({ transform: 'matrix(1,0,0,1,0,0)' }),
    DOMMatrixReadOnly: class DOMMatrixReadOnly { constructor() { this.m22 = 1; } },
    // These enum sentinels are unreachable branches for the reported text node.
    ee: { IMAGE: 'image', VIDEO: 'video', PILE: 'pile' },
    // PN receives no options object from O8. Only its default debounce path executes;
    // these helpers model the unused lodash option guards, not history behavior.
    ef: value => typeof value === 'number' ? value : Number(value),
    F0: value => value !== null && typeof value === 'object',
    NN: Math.max,
    MN: Math.min,
    _c: () => Date.now(),
    kN: 'Expected a function',
    qp() {},
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8'), context,
    { filename: 'startup-history-intent.js' });

  for (const name of ['IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'j8', 'A8', 'D8', 'k8', 'PC']) {
    sandbox[name] = vm.runInContext('(' + extracted.get(name) + ')', context, { filename: `vendor-${name}` });
  }
  sandbox.Ra = vm.runInContext('(' + debounceCode + ')', context, { filename: 'vendor-native-debounce-PN' });
  sandbox.O8 = vm.runInContext('(' + codeOf(transformed, o8Binding) + ')', context, { filename: 'vendor-O8-history-hook' });
  for (const name of reactFlowBindings.keys()) {
    sandbox[name] = vm.runInContext('(' + flowChangeCode(name) + ')', context, { filename: `vendor-ReactFlow-${name}` });
  }

  let harness;
  const setNodes = next => {
    liveNodes = next;
    harness.setArgs([liveNodes, edges, options]);
  };
  const options = {
    enabled: true,
    maxHistorySize: 20,
    debounceDelay: 1000,
    defaultOnNodesChange(changes) {
      captures.nodeChanges.push(changes.map(change => ({ type: change.type, id: change.id, item: change.item })));
      setNodes(applyOriginalNodeChanges(liveNodes, changes, sandbox.Fb));
    },
    defaultOnEdgesChange() {},
    onBatchOperations(nodeOperations, edgeOperations) {
      captures.batches.push({ nodeOperations, edgeOperations });
      return Promise.resolve({});
    },
    canvasId,
    setNodes,
  };
  harness = new HookHarness(sandbox.O8);
  sandbox.l = {
    useState: (...args) => harness.useState(...args),
    useRef: (...args) => harness.useRef(...args),
    useMemo: (...args) => harness.useMemo(...args),
    useCallback: (...args) => harness.useCallback(...args),
    useEffect: (...args) => harness.useEffect(...args),
  };

  let api = harness.render([liveNodes, edges, options]);
  assert.equal(inspect(api, nodeId).currentIndex, 0, 'This is the old report’s reconstructed starting input, not a fresh-page claim.');

  const requestNode = structuredClone(report.create.nativeBatch.request.node);
  const initialMeasured = sourceFaithfulAutomatic ? { width: 0, height: 0 } : requestNode.measured;
  const newNode = {
    id: requestNode.id,
    type: requestNode.type,
    position: requestNode.position,
    measured: initialMeasured,
    data: requestNode.data,
  };
  const addChange = { type: 'add', item: newNode };
  sandbox.__LCOS_NATIVE_INTENT__.tagChanges([addChange], id => liveNodes.find(node => node.id === id), canvasId);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.__LCOS_NATIVE_INTENT__.metadata(addChange).lcos_operation)),
    report.createOperation, 'The replay uses the exact original operation id/kind/phase from the committed report.');
  liveNodes = [...liveNodes, newNode];
  api = harness.render([liveNodes, edges, options]);
  let state = inspect(api, nodeId);
  assert.equal(state.currentIndex, 1, 'The original O8 create-count transition flushes one lifecycle snapshot.');
  assert.equal(state.currentEntry.operations[0].operation.operationId, report.createOperation.operationId);
  assert.equal(state.currentEntry.operations[0].operation.kind, 'create');

  if (includeCounterfactualWidthHeight) {
    const pcWire = sandbox.PC({ id: nodeId, type: requestNode.type, dimensions: observedMeasureWrite.requestSummary.actions[0].updates[0].measured });
    assert.deepEqual(JSON.parse(JSON.stringify(pcWire)), {
      id: nodeId, type: requestNode.type, measured: report.createReceipt.measured,
    }, 'The measured request is inverted through the actual PC dimensions→measured serializer.');

    // COUNTERFACTUAL ONLY: this deliberately writes PC's measured wire payload into
    // local width/height. Installed ReactFlow Ux→Fb auto-measurement does not do that.
    liveNodes = liveNodes.map(node => node.id === nodeId
      ? { ...node, width: pcWire.measured.width, height: pcWire.measured.height }
      : node);
    api = harness.render([liveNodes, edges, options]);
    await delay(1100); // let the vendor PN debounce (O8 default 1000ms) settle naturally
    api = harness.render([liveNodes, edges, options]);
    state = inspect(api, nodeId);
    assert.equal(state.currentIndex, 2, 'Counterfactual explicit width/height changes are visible to the original O8 comparator.');
    assert.equal(state.historySize, 3);
    assert.deepEqual(state.currentEntry.nodes[0], {
      id: nodeId, type: requestNode.type, position: requestNode.position,
      width: 250, height: 250, measured: { width: 250, height: 250 },
    });
    assert.deepEqual(state.currentEntry.operations, [], 'Geometry-only O8 snapshot has no explicit lifecycle operation.');
    assert.equal(state.undoTarget.operations[0].operation.operationId, report.createOperation.operationId,
      'The create operation remains on the prior O8 entry; it is not guessed from the node’s last ref.');
  } else if (sourceFaithfulAutomatic) {
    const element = {
      offsetWidth: report.createReceipt.measured.width,
      offsetHeight: report.createReceipt.measured.height,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: report.createReceipt.measured.width,
        height: report.createReceipt.measured.height }),
    };
    const internalNode = {
      ...newNode,
      measured: { width: 0, height: 0 },
      internals: { positionAbsolute: { x: 0, y: 0 }, handleBounds: null },
    };
    const nodeLookup = new Map([[nodeId, internalNode]]);
    const root = { querySelector: selector => selector === '.xyflow__viewport' ? {} : null };
    const update = sandbox.Ux(new Map([[nodeId, { id: nodeId, nodeElement: element, force: true }]]),
      nodeLookup, new Map(), root, [0, 0], undefined, 'auto');
    assert.equal(update.updatedInternals, true);
    assert.equal(update.changes.length, 1);
    const automaticChange = update.changes[0];
    assert.deepEqual(JSON.parse(JSON.stringify(automaticChange)), {
      id: nodeId, type: 'dimensions', dimensions: report.createReceipt.measured,
    }, 'The actual ReactFlow Ux producer emits dimensions without resizing/setAttributes.');
    liveNodes = applyOriginalNodeChanges(liveNodes, [automaticChange], sandbox.Fb);
    assert.deepEqual(JSON.parse(JSON.stringify(liveNodes.find(node => node.id === nodeId).measured)), report.createReceipt.measured);
    assert.equal(liveNodes.find(node => node.id === nodeId).width, undefined);
    assert.equal(liveNodes.find(node => node.id === nodeId).height, undefined);
    api = harness.render([liveNodes, edges, options]);
    await delay(1100);
    api = harness.render([liveNodes, edges, options]);
    state = inspect(api, nodeId);
    assert.equal(state.currentIndex, 1, 'Actual Ux→Fb automatic measured-only change does not advance original O8 history.');
    assert.equal(state.historySize, 2);
    assert.equal(state.currentEntry.nodes[0].width, null);
    assert.equal(state.currentEntry.nodes[0].height, null);
    assert.deepEqual(state.currentEntry.nodes[0].measured, { width: 0, height: 0 },
      'O8 still points at the create snapshot; the live node alone now has measured dimensions.');
    assert.equal(state.currentEntry.operations[0].operation.operationId, report.createOperation.operationId);
  } else if (sourceFaithfulManual) {
    const events = [];
    const nodeLookup = new Map([[nodeId, { ...newNode, measured: { ...report.createReceipt.measured } }]]);
    sandbox.v = nodeId;
    sandbox.f = undefined;
    sandbox.x = { getState: () => ({
      triggerNodeChanges: changes => events.push(changes),
      nodeLookup,
      parentLookup: new Map(),
      nodeOrigin: [0, 0],
    }) };
    const onChange = vm.runInContext('(' + nodeResizerOnChange + ')', context, { filename: 'vendor-NodeResizer-onChange' });
    const onEnd = vm.runInContext('(' + nodeResizerOnEnd + ')', context, { filename: 'vendor-NodeResizer-onEnd' });
    onChange({ x: newNode.position.x, y: newNode.position.y, width: 300, height: 280 }, []);
    onEnd({ width: 300, height: 280 });
    const changingResize = events[0].find(change => change.type === 'dimensions');
    const endedResize = events[1].find(change => change.type === 'dimensions');
    assert.deepEqual(JSON.parse(JSON.stringify(changingResize)), {
      id: nodeId, type: 'dimensions', resizing: true, setAttributes: true,
      dimensions: { width: 300, height: 280 },
    }, 'The actual NodeResizer onChange callback sets explicit width/height and marks the active drag.');
    assert.deepEqual(JSON.parse(JSON.stringify(endedResize)), {
      id: nodeId, type: 'dimensions', resizing: false, dimensions: { width: 300, height: 280 },
    }, 'The actual NodeResizer onEnd callback emits its separate terminal dimensions event.');
    liveNodes = applyOriginalNodeChanges(liveNodes, events[0], sandbox.Fb);
    api = harness.render([liveNodes, edges, options]);
    liveNodes = applyOriginalNodeChanges(liveNodes, events[1], sandbox.Fb);
    api = harness.render([liveNodes, edges, options]);
    await delay(1100);
    api = harness.render([liveNodes, edges, options]);
    state = inspect(api, nodeId);
    assert.equal(state.currentIndex, 2, 'Explicit NodeResizer setAttributes width/height creates a separate original O8 frame.');
    assert.equal(state.historySize, 3);
    assert.equal(state.currentEntry.nodes[0].width, 300);
    assert.equal(state.currentEntry.nodes[0].height, 280);
    assert.deepEqual(state.currentEntry.operations, [], 'A resize frame does not inherit the original create lifecycle intent.');
    assert.equal(state.undoTarget.operations[0].operation.operationId, report.createOperation.operationId);
  }

  const receipt = report.createReceipt;
  const receiptResult = api.backfillNodeReceipt({ canvasId, nodeId, ref: receipt.reference,
    operation: report.createOperation, data: receipt.data });
  assert.deepEqual(JSON.parse(JSON.stringify(receiptResult)), { ok: true }, 'Canonical create receipt uses the existing O8 receipt-only setter.');
  api = harness.render([liveNodes, edges, options]);
  await delay(10); // allow O8’s own suppression resetter; no state or timer is fabricated here
  api = harness.render([liveNodes, edges, options]);
  const beforeUndo = inspect(api, nodeId);
  if (includeCounterfactualWidthHeight) {
    assert.equal(beforeUndo.currentIndex, 2, 'Receipt backfill must not replace or suppress the counterfactual explicit-width/height frame.');
    assert.deepEqual(beforeUndo.currentEntry.operations, []);
  } else if (sourceFaithfulManual) {
    assert.equal(beforeUndo.currentIndex, 2, 'Receipt backfill must not replace or suppress the manual-resize frame.');
    assert.deepEqual(beforeUndo.currentEntry.operations, []);
  } else {
    assert.equal(beforeUndo.currentIndex, 1);
    assert.equal(beforeUndo.currentEntry.operations[0].operation.operationId, report.createOperation.operationId);
  }

  const undo = sandbox.__LCOS_NATIVE_INTENT__.wrapHistory('undo', api.undo, canvasId);
  undo();
  api = harness.render([liveNodes, edges, options]);
  const replayed = inspect(api, nodeId);
  const nodeOps = captures.batches.at(-1)?.nodeOperations ?? [];
  const relevant = nodeOps.filter(item => item.id === nodeId);
  assert.equal(relevant.length, 1, 'The original O8 undo must emit one native change for the branch NodeID.');

  if (includeCounterfactualWidthHeight) {
    const originalUndoSerializer = sandbox.PC({ id: relevant[0].id, type: relevant[0].type,
      ...(relevant[0].dimensions === undefined ? {} : { dimensions: relevant[0].dimensions }) });
    const postUndoMeasurementSerializer = sandbox.PC({ id: nodeId, type: requestNode.type,
      dimensions: report.createReceipt.measured });
    assert.equal(originalUndoSerializer.measured, undefined,
      'The exact O8 M8 replacement targets the pre-measurement snapshot; the report’s later measured=250 wire is a separate dimensions serialization.');
    assert.deepEqual(JSON.parse(JSON.stringify(postUndoMeasurementSerializer)), {
      id: nodeId, type: requestNode.type, measured: report.createReceipt.measured,
    }, 'The observed post-undo 250×250 update is reproduced by the original PC serializer, not inferred as a lifecycle delete.');
    assert.equal(observedUndoMeasureRetries.every(row => row.requestSummary.actions[0].updates[0].id === nodeId), true,
      'Repeated same-ID POSTs remain transport retry evidence, not additional history gestures.');
    assert.equal(beforeUndo.currentEntry.index, 2);
    assert.equal(relevant[0].operationType, 'update', 'Undo leaves the measured snapshot for the prior create snapshot; it does not delete the carrier.');
    assert.equal(relevant[0].lcos_operation, undefined, 'Original history metadata is absent on this geometry-only entry; fail closed, never infer create.');
    assert.equal(replayed.currentIndex, 1);
    assert.equal(replayed.currentEntry.nodes[0].width, null);
    assert.equal(replayed.currentEntry.operations[0].operation.operationId, report.createOperation.operationId);
    return { mode: 'counterfactual-explicit-width-height-after-measured-wire', counterfactual: true,
      historyBeforeUndo: beforeUndo.historySize,
      currentIndexBeforeUndo: beforeUndo.currentIndex, undoTargetIndex: beforeUndo.undoTarget.index,
      undoOperationType: relevant[0].operationType, undoOperationMetadata: null,
      o8UndoDimensions: relevant[0].dimensions ?? null,
      o8UndoWireMeasured: originalUndoSerializer.measured ?? null,
      reportedPostUndoMeasuredWire: postUndoMeasurementSerializer.measured,
      repeatedSameIdBlockedPosts: observedUndoMeasureRetries.length,
      originalOperationIdOnUndoTarget: beforeUndo.undoTarget.operations[0].operation.operationId,
      nativeIdPreserved: relevant[0].id === nodeId };
  }

  if (sourceFaithfulManual) {
    assert.equal(relevant.length, 1);
    assert.equal(relevant[0].operationType, 'update', 'Undo of the manual resize is an update, not node deletion.');
    assert.equal(relevant[0].lcos_operation, undefined, 'The resize update does not borrow the earlier create operation.');
    assert.equal(replayed.currentIndex, 1);
    assert.equal(replayed.currentEntry.nodes[0].width, null);
    assert.equal(replayed.currentEntry.nodes[0].height, null);
    assert.equal(liveNodes.some(node => node.id === nodeId), true, 'Undoing resize retains the created node.');
    return { mode: 'source-faithful-manual-resize', historyBeforeUndo: beforeUndo.historySize,
      currentIndexBeforeUndo: beforeUndo.currentIndex, undoOperationType: relevant[0].operationType,
      undoOperationMetadata: null, undoTargetIndex: beforeUndo.undoTarget.index,
      widthAfterUndo: replayed.currentEntry.nodes[0].width,
      heightAfterUndo: replayed.currentEntry.nodes[0].height,
      nodeRetained: liveNodes.some(node => node.id === nodeId) };
  }

  if (sourceFaithfulAutomatic) {
    assert.equal(relevant.length, 1);
    assert.equal(relevant[0].operationType, 'delete');
    assert.equal(relevant[0].lcos_operation.kind, 'create');
    assert.equal(relevant[0].lcos_operation.phase, 'undo');
    assert.equal(relevant[0].lcos_operation.operationId, report.createOperation.operationId);
    assert.equal(replayed.currentIndex, 0);
    return { mode: 'source-faithful-automatic-measured-only', historyBeforeUndo: beforeUndo.historySize,
      currentIndexBeforeUndo: beforeUndo.currentIndex, undoOperationType: relevant[0].operationType,
      undoOperation: relevant[0].lcos_operation, nativeIdPreserved: relevant[0].id === nodeId };
  }

  assert.equal(relevant[0].operationType, 'delete', 'Without the extra measurement frame, O8 selects its original create entry for undo.');
  assert.equal(relevant[0].lcos_operation.kind, 'create');
  assert.equal(relevant[0].lcos_operation.phase, 'undo');
  assert.equal(relevant[0].lcos_operation.operationId, report.createOperation.operationId);
  assert.equal(replayed.currentIndex, 0);
  assert.equal(replayed.currentEntry.nodes.length, 0);
  return { mode: 'same-report-input-without-measurement-control', historyBeforeUndo: beforeUndo.historySize,
    currentIndexBeforeUndo: beforeUndo.currentIndex, undoOperationType: relevant[0].operationType,
    undoOperation: relevant[0].lcos_operation, nativeIdPreserved: relevant[0].id === nodeId };
}

const counterfactualNoExtraStateChange = await replay({ mode: 'no-extra-state-change' });
const counterfactualWidthHeight = await replay({ mode: 'counterfactual-explicit-width-height' });
const automaticMeasurementReplay = await replay({ mode: 'source-faithful-automatic-measurement' });
const manualResizeReplay = await replay({ mode: 'source-faithful-manual-resize' });
assert.equal(counterfactualNoExtraStateChange.undoOperationType, 'delete');
assert.equal(counterfactualWidthHeight.undoOperationType, 'update');
assert.equal(counterfactualWidthHeight.counterfactual, true);
assert.equal(counterfactualWidthHeight.currentIndexBeforeUndo, counterfactualNoExtraStateChange.currentIndexBeforeUndo + 1);
assert.equal(counterfactualWidthHeight.originalOperationIdOnUndoTarget, report.createOperation.operationId);
assert.equal(automaticMeasurementReplay.undoOperationType, 'delete');
assert.equal(automaticMeasurementReplay.currentIndexBeforeUndo, counterfactualNoExtraStateChange.currentIndexBeforeUndo);
assert.equal(manualResizeReplay.undoOperationType, 'update');
assert.equal(manualResizeReplay.nodeRetained, true);

console.log('PASS: executed installed TapNow O8 and ReactFlow Ux/Fb/NodeResizer callbacks in a no-network VM; auto measured-only leaves O8 index unchanged, explicit manual dimensions create a separate frame.');
console.log(JSON.stringify({
  scope: 'Source-executable in-memory replay only; no live Canvas, Core, creation, deletion, or physical keyboard input.',
  evidence: {
    report: '.runtime/native-gen1-branch/2026-10-14T02-43-30-825Z.json',
    initialNativeNodes: report.source.initialNodes.length,
    createdNodeId: nodeId,
    createOperationId: report.createOperation.operationId,
    observedPostCreateMeasured: report.createReceipt.measured,
    observedUndoWasBlockedUpdate: true,
  },
  owner: { hook: 'O8', equality: 'R8 → TC(width,height)',
    serializer: 'PC(dimensions → measured)', debounce: 'vendor PN imported as Ra; 1000ms O8 default' },
  sourceAssertions: {
    automatic: 'Executed original ReactFlow Ux→Fb: dimensions change updates only node.measured; original O8 TC/R8 adds no entry.',
    manual: 'Executed the original NodeResizer jE onChange/onEnd callbacks and Fb: setAttributes writes width/height; original O8 adds one independent resize entry, whose undo retains the node.',
    sources: {
      flowHelpers: 'UnlimitedModeToggle-D4wysAbz.js Ux ~49.4k, Fb ~82.1k, NodeResizer jE ~152.9k–155.3k',
      tapnowHistory: 'page-Da_DfwiK.js TC/R8/O8 ~716.9k–721.8k, PC/y0 ~738.1k, dimension persistence switch ~751.2k',
    },
  },
  replays: [counterfactualNoExtraStateChange, counterfactualWidthHeight, automaticMeasurementReplay, manualResizeReplay],
  limitation: 'The old browser report contains the committed IDs/Core receipt/request, projected initial node geometry/data, and blocked measured updates, but not raw ReactFlow nodes or that page’s private O8 entry array. The legacy measured-wire replay deliberately copied measured into width/height and is now labeled counterfactual; its PASS does not show pure automatic measurement stealing Undo. The source-faithful Ux/Fb VM proves only that a measured-only change is ignored by this O8 comparator, while manual NodeResizer width/height changes form a separate frame. The true cause of the historical blocked update still requires observing that page’s actual O8 frame.',
}, null, 2));
