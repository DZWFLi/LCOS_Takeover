import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
const stripped = source.replace(/^import .+;\r?\n/gm, '').replaceAll('export function ', 'function ');
const hookSlots = [];
let hookIndex = 0;
let rawApi = { getNodes: () => [], getEdges: () => [], getViewport: () => ({ x: 0, y: 0, zoom: 1 }) };
const rawStore = { subscribe: () => () => {} };
let connects = 0;
let disconnects = 0;
let connected;
const calls = [];
globalThis.window = { __LCOS_NODE_BRIDGE_HOST__: { connect(value) {
  connects++; connected = value; return () => { disconnects++; };
} } };
const same = (left, right) => left?.length === right.length && right.every((value, index) => Object.is(left[index], value));
const React = {
  useRef(value) { const index = hookIndex++; return hookSlots[index] ??= { current: value }; },
  useMemo(factory, deps) {
    const index = hookIndex++;
    if (!same(hookSlots[index]?.deps, deps)) hookSlots[index] = { deps, value: factory() };
    return hookSlots[index].value;
  },
  useEffect(effect, deps) {
    const index = hookIndex++;
    if (!same(hookSlots[index]?.deps, deps)) {
      hookSlots[index]?.cleanup?.(); hookSlots[index] = { deps, cleanup: effect() };
    }
  },
};
const module = new Function('useCanvasApi', 'useNativeFlowStoreApi', 'React', stripped + '\nreturn { LCOSOriginalNodeBridge };')(
  () => rawApi, () => rawStore, React);
function render(props) { hookIndex = 0; module.LCOSOriginalNodeBridge(props); }
render({ canvasId: 'canvas-a', undo: () => calls.push('undo-old'), redo: () => calls.push('redo-old'), backfillNodeReceipt: () => calls.push('receipt-old') });
const firstFacade = connected.api;
firstFacade.undo();
render({ canvasId: 'canvas-a', undo: () => calls.push('undo-new'), redo: () => calls.push('redo-new'), backfillNodeReceipt: () => calls.push('receipt-new') });
assert.equal(connected.api, firstFacade, 'history callbacks do not replace a genuine same-owner API facade');
assert.equal(connects, 1);
assert.equal(disconnects, 0);
firstFacade.undo(); firstFacade.redo(); firstFacade.backfillNodeReceipt({ nodeId: 'same-node' });
assert.deepEqual(calls, ['undo-old', 'undo-new', 'redo-new', 'receipt-new'], 'current original history callbacks, not stale captured callbacks, execute');
rawApi = { ...rawApi };
render({ canvasId: 'canvas-a', undo: () => calls.push('undo-second-owner') });
assert.notEqual(connected.api, firstFacade, 'a genuine API owner change retains the stale-owner protection boundary');
assert.equal(connects, 2); assert.equal(disconnects, 1);
render({ canvasId: 'canvas-b' });
assert.equal(connected.canvasId, 'canvas-b');
assert.equal(connects, 3); assert.equal(disconnects, 2, 'scene change reconnects even with the same underlying API');
delete globalThis.window;
console.log(JSON.stringify({ passed: true, scope: 'native bridge hook lifecycle and callback delegation; not real GUI save proof',
  cases: ['stable facade for history-only updates', 'latest undo/redo/receipt callbacks', 'new API and scene changes reconnect normally'] }));
