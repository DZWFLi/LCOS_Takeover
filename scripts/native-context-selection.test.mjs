import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime');
await mkdir(runtimeBase, { recursive: true });
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-context-selection-'));
const report = { mode: 'current-huabu-selection-capture', passed: false, cases: [] };

try {
  const entry = path.join(runtimeRoot, 'native-material-actions.mjs');
  await buildPilotEntry('lab/pilot/native-material-actions.tsx', entry, 'node');
  const { readSelectedCanvasNodes } = await import(pathToFileURL(entry).href);
  const imageRef = { version: 1, entityType: 'view', entityId: 'core-view-image', artifactId: 'core-artifact-image',
    artifactViewId: 'core-view-image', revisionId: 'core-revision-image' };
  const textRef = { version: 1, entityType: 'artifact', entityId: 'core-artifact-text', artifactId: 'core-artifact-text',
    artifactViewId: 'core-view-text', revisionId: 'core-revision-text' };
  const snapshot = {
    status: 'ready', canvasId: 'surface-core-workflow',
    selectedNodeIds: ['huabu-image-node', 'huabu-text-node'],
    nodes: [
      { id: 'huabu-image-node', type: 'image', data: { lcos_ref: imageRef, label: '合成图片' } },
      { id: 'huabu-unselected-node', type: 'text', selected: true, data: { lcos_ref: { ...textRef, artifactViewId: 'not-selected' } } },
      { id: 'huabu-text-node', type: 'text', selected: false, data: { lcos_ref: textRef, label: '合成文案' } },
    ],
  };

  const captured = readSelectedCanvasNodes(snapshot);
  assert.equal(captured.status, 'ready');
  assert.deepEqual(captured.nodes.map(node => node.nodeId), ['huabu-image-node', 'huabu-text-node']);
  assert.deepEqual(captured.nodes.map(node => node.data?.lcos_ref), [imageRef, textRef]);
  assert.notEqual(captured.nodes[0].nodeId, captured.nodes[0].data?.lcos_ref?.artifactViewId,
    'Huabu spatial node identity must remain separate from Core ArtifactView identity.');
  assert.equal(captured.labelsByViewId.get('core-view-image'), '合成图片');
  assert.equal(captured.labelsByViewId.get('core-view-text'), '合成文案');
  assert.equal(captured.labelsByViewId.has('not-selected'), false,
    'The current store selection IDs, not the node selected flag or full node list, determine the selection.');
  report.cases.push('readSelectedCanvasNodes maps only the current Huabu getSelection IDs and preserves exact persisted lcos_ref identities');

  assert.match(readSelectedCanvasNodes({ ...snapshot, selectedNodeIds: [] }).message, /先在原画布选中/);
  assert.match(readSelectedCanvasNodes({ ...snapshot, selectedNodeIds: ['gone-node'] }).message, /已从当前 Canvas 快照消失/);
  assert.match(readSelectedCanvasNodes({ ...snapshot, selectedNodeIds: ['huabu-image-node', 'huabu-image-node'] }).message, /重复节点身份/);
  report.cases.push('empty, missing, and duplicate live selection IDs fail closed before Core preview/apply');
  report.passed = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  throw error;
} finally {
  await rm(runtimeRoot, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
