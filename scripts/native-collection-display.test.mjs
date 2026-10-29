import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime');
await fs.mkdir(runtimeBase, { recursive: true });
const runtime = await fs.mkdtemp(path.join(runtimeBase, 'native-collection-display-'));
try {
  const output = path.join(runtime, 'original-collapse.mjs');
  await buildPilotEntry('lcos/huabu/apps/web/src/store/canvasCollapsedFrames.ts', output);
  const original = await import(pathToFileURL(output).href);
  const source = await fs.readFile(path.join(root, 'lab/startup-node-bridge.js'), 'utf8');
  const start = source.indexOf('const collectionDisplayPreferences =');
  const end = source.indexOf('const sensitive =', start);
  assert.ok(start >= 0 && end > start);
  const storageValues = new Map([['huabu:canvas:canvas-a:collapsed-frames', JSON.stringify(['frame-a', 'missing-frame'])]]);
  const writes = [];
  const storage = { getItem: key => storageValues.get(key) ?? null,
    setItem: (key, value) => { writes.push({ key, value }); storageValues.set(key, value); } };
  let renderSignals = 0;
  const display = new Function('React', 'readCollapsedFrames', 'writeCollapsedFrames',
    source.slice(start, end).replaceAll('export function ', 'function ')
      + '\nreturn { project: useLCOSCollectionDisplayProjection, toggle: toggleCollectionDisplay };')({
      useSyncExternalStore(subscribe, snapshot) { subscribe(() => { renderSignals++; }); return snapshot(); },
      useMemo: compute => compute(),
    }, (canvasId, nodes) => original.readCollapsedFrames(canvasId, nodes, storage),
    (canvasId, ids) => original.writeCollapsedFrames(canvasId, ids, storage));
  const nodes = [
    { id: 'owner', type: 'lcos-collection', position: { x: 5, y: 10 },
      data: { lcos_collection_ref: { collectionId: 'collection-a' } } },
    { id: 'frame-a', type: 'group', position: { x: 40, y: 10 },
      data: { lcosCollectionId: 'collection-a', lcosCollectionNodeId: 'owner' } },
    { id: 'text', type: 'text', parentId: 'frame-a', position: { x: 20, y: 30 }, data: { content: 'exact body' } },
    { id: 'nested', type: 'group', parentId: 'frame-a', position: { x: 50, y: 90 }, data: {} },
    { id: 'image', type: 'image', parentId: 'nested', position: { x: 3, y: 4 }, data: { src: '/exact-file' } },
    { id: 'unrelated', type: 'text', position: { x: 400, y: 50 }, data: { content: 'outside' } },
    { id: 'already-hidden', type: 'text', hidden: true, position: { x: 440, y: 50 }, data: {} },
  ];
  const before = structuredClone(nodes);
  assert.deepEqual(display.project([], 'canvas-a'), []);
  const folded = display.project(nodes, 'canvas-a');
  for (const id of ['frame-a', 'text', 'nested', 'image']) assert.equal(folded.find(node => node.id === id).hidden, true);
  assert.equal(folded.find(node => node.id === 'owner').hidden, undefined);
  assert.equal(folded.find(node => node.id === 'unrelated').hidden, undefined);
  assert.deepEqual(nodes, before, 'Display projection never mutates source geometry, data or parents.');
  assert.deepEqual(writes, [], 'Read/load does not author a persistence change.');
  assert.equal(display.toggle('canvas-a', 'frame-a'), false);
  assert.equal(display.project(nodes, 'canvas-a'), nodes, 'Reopen returns the original unmodified node array.');
  assert.equal(display.project(nodes, 'canvas-a').find(node => node.id === 'already-hidden').hidden, true);
  assert.deepEqual(writes, [{ key: 'huabu:canvas:canvas-a:collapsed-frames', value: '[]' }]);
  assert.ok(renderSignals > 0);
  assert.equal(display.toggle('canvas-a', 'frame-a'), true);
  assert.equal(display.project(nodes, 'canvas-b'), nodes, 'Collapse state does not cross Canvas addresses.');
  const falseOwner = nodes.map(node => node.id === 'owner'
    ? { ...node, data: { lcos_collection_ref: { collectionId: 'other' } } } : node);
  assert.equal(display.project(falseOwner, 'canvas-a'), falseOwner, 'A mismatched Collection owner cannot hide siblings.');
  assert.deepEqual(nodes, before);
  console.log(JSON.stringify({ passed: true,
    scope: 'source-executed display-only projection with actual current Gen2 preference reader/writer; not GUI or O8 acceptance',
    cases: ['defer preference load until live nodes arrive', 'hide only exact Collection frame and descendants',
      'keep owner, unrelated and independently hidden nodes', 'reopen original nodes without geometry/data mutation',
      'original per-Canvas localStorage writer only', 'foreign Collection owner cannot hide nodes'] }, null, 2));
} finally {
  const relative = path.relative(runtimeBase, runtime);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unexpected test runtime containment.');
  await fs.rm(runtime, { recursive: true, force: true });
}
