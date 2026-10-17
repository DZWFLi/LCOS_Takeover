import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.runtime', 'native-saved-context-workspaces-' + Date.now(), 'model.mjs');
await buildPilotEntry('lab/pilot/native-saved-context-workspaces.ts', output);
const { readNativeSavedContextWorkspaces: read } = await import(pathToFileURL(output).href);
const rows = [
  { id: 'w1', projectId: 'project', scopeId: 'context-scope', name: 'Current', canvasId: 'canvas-current' },
  { id: 'w2', projectId: 'project', scopeId: 'context-scope', name: 'Other view of same scope', canvasId: 'canvas-other' },
  { id: 'w3', projectId: 'project', scopeId: 'no-canvas-scope', name: 'Not projected yet' },
];
const result = read('project', 'canvas-current', rows);
assert.equal(result.workspaces, rows, 'canonical records are retained, not rebuilt into a second Workspace truth');
assert.equal(result.current, rows[0]);
assert.equal(result.workspaces[1].scopeId, result.current.scopeId, 'shared Scope does not imply a duplicate Workspace');
assert.equal(result.workspaces[2].canvasId, undefined, 'unmapped destinations stay explicitly unavailable');
for (const input of [null, {}, [], [...rows, { ...rows[0] }], rows.map((row, index) => index ? row : { ...row, projectId: 'foreign' }),
  rows.map((row, index) => index === 1 ? { ...row, canvasId: 'canvas-current' } : row),
  rows.map((row, index) => index === 0 ? { ...row, scopeId: '' } : row)]) {
  assert.throws(() => read('project', 'canvas-current', input));
}
assert.throws(() => read('project', 'unknown', rows));
assert.throws(() => read('', 'canvas-current', rows));
console.log('PASS: canonical Workspace/Canvas mapping, same-Scope multiple worksites, unmapped targets, and foreign/ambiguous response rejection; not a GUI proof.');
