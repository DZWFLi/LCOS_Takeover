import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { nativeMaterialPeekSource, transformNativeMaterialPeek, restoreNativeMaterialPeekForComparison } from '../lab/native-material-peek-transform.mjs';
test('Peek retains the existing static SVG but cannot start the old loader, persist a viewport, or invent positions', async () => {
  const original = await readFile(new URL('../' + nativeMaterialPeekSource, import.meta.url), 'utf8');
  const source = transformNativeMaterialPeek(original);
  assert.notEqual(source, original);
  assert.equal(transformNativeMaterialPeek(source), source);
  assert.equal(restoreNativeMaterialPeekForComparison(source, original), original);
  assert.doesNotMatch(source, /useSpacePreviewScene|workspaceStore|localStorage|ReactFlow|setViewport/);
  assert.match(source, /scene\.canvasId !== canvasId/);
  assert.match(source, /viewBox=\{`\$\{scene\.bounds\.x\}/);
  assert.match(source, /data-native-peek-target/);
  assert.throws(() => transformNativeMaterialPeek(original.replace('const byId =', 'const byId =').replace('canvasId, true', 'canvasId, false')));
  assert.throws(() => restoreNativeMaterialPeekForComparison(source + '\n// changed', original));
});
