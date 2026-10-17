import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(workspaceRoot, 'lab/pilot/native-text-ui.tsx');

describe('native text slot revision read effect', () => {
  it('refreshes read-only facts for a new receipt without remounting the stable entity key', async () => {
    const source = await readFile(sourcePath, 'utf8');
    const keyStart = source.indexOf('const key = JSON.stringify([');
    assert.notEqual(keyStart, -1, 'the slot keeps a stable identity key');
    const keyEnd = source.indexOf(']);', keyStart);
    assert.ok(keyEnd > keyStart, 'the stable key closes');
    const key = source.slice(keyStart, keyEnd + 3);
    assert.ok(key.includes('reference?.artifactViewId'));
    assert.doesNotMatch(key, /revisionId/, 'a revision receipt does not remount the ready body');

    const effectStart = source.indexOf('useEffect(() => {');
    const dependenciesStart = source.indexOf('  }, [projectId, canvas.canvasId, canvas.status, nodeId, key,', effectStart);
    assert.ok(dependenciesStart > effectStart, 'the Core facts read has the expected owner effect');
    const dependenciesEnd = source.indexOf(']);', dependenciesStart);
    assert.ok(dependenciesEnd > dependenciesStart, 'the read effect dependency list closes');
    const effect = source.slice(effectStart, dependenciesEnd + 3);
    const dependencies = source.slice(dependenciesStart, dependenciesEnd + 3);

    assert.ok(dependencies.includes('reference?.revisionId'),
      'a backfilled O8 revision starts a fresh existing Core read');
    assert.ok(effect.includes('liveReference.revisionId !== reference.revisionId'),
      'a late result cannot register facts for a revision no longer on the live node');
    assert.ok(effect.includes('nativeTextFacts({ projectId, canvasId, nodeId, reference, detail, text })'),
      'presentation facts continue to come from the paired Core detail and text read');
    assert.doesNotMatch(effect, /updateNodeData|saveCanvasText|saveNativeCanvasText/,
      'the revision refresh stays read-only');
  });
});
