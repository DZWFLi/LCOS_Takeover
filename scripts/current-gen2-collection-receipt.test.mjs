import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root, resolveCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ownerPath = 'huabu/apps/web/src/lcos/drop/dropAssemblyReceipt.ts';
const copiedOwner = path.join(workspaceRoot, 'lcos', ownerPath);
const adoptedOwner = resolveCurrentGen2Resource(copiedOwner);
assert.equal(adoptedOwner?.resourcePath, ownerPath, 'receipt test must use the selected current Gen2 owner');
assert.equal(path.resolve(adoptedOwner.sourcePath), path.resolve(currentGen2Root, ownerPath));

const runtimeParent = path.join(workspaceRoot, '.runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeParent, 'current-gen2-collection-receipt-'));
const runtimeRootResolved = path.resolve(runtimeRoot);
try {
  const bundlePath = await buildPilotEntry(path.relative(workspaceRoot, copiedOwner).replaceAll('\\', '/'),
    path.join(runtimeRoot, 'dropAssemblyReceipt.mjs'), 'node');
  const provenance = JSON.parse(await fs.readFile(`${bundlePath}.sources.json`, 'utf8'));
  assert.ok(provenance.resources.some(resource => resource.resourcePath === ownerPath),
    'bundle provenance must record the current receipt source');
  const { assemblyDropReceipt, mergeAssemblyDropAttempt, dropSourceKey } =
    await import(pathToFileURL(bundlePath).href);

  const projectId = 'project-receipt-test';
  const collectionRef = { kind: 'collection', id: 'collection-a' };
  const noteRef = { kind: 'note', id: 'note-b' };
  const collectionKey = dropSourceKey(collectionRef);
  const noteKey = dropSourceKey(noteRef);
  const original = { kind: 'assembly-apply', targetId: 'main-canvas', targetRef: { kind: 'main' },
    sourceRefs: [collectionRef, noteRef], placementPoint: { x: 80, y: 120 } };
  const item = (sourceRef, status, channel) => ({ sourceRef, status, channel });
  const canonical = (id, results, schemaVersion = 1) => ({ schemaVersion, projectId: id, allApplied: true, results });
  const receipt = (intent, transactionId, results, id = projectId, schemaVersion = 1) =>
    assemblyDropReceipt(intent, transactionId, canonical(id, results, schemaVersion), projectId);
  const withIncompletePlacement = value => ({ ...value, status: 'partial',
    message: '接收已保存，位置未确认 · 当前布局保留', placementIncompleteSourceKeys: [collectionKey] });

  const collectionIntent = { ...original, sourceRefs: [collectionRef] };
  const coreApplied = receipt(collectionIntent, 'collection-applied', [item(collectionRef, 'applied', 'presentation-membership')]);
  assert.equal(coreApplied.status, 'success');
  const firstPlacementPartial = withIncompletePlacement(coreApplied);
  const firstMerge = mergeAssemblyDropAttempt(collectionIntent, collectionIntent, firstPlacementPartial);
  assert.equal(firstMerge.status, 'partial');
  assert.equal(firstMerge.message, firstPlacementPartial.message);
  assert.deepEqual(firstMerge.placementIncompleteSourceKeys, [collectionKey]);
  assert.deepEqual(firstMerge.retrySourceRefs, [], 'a positively-applied Collection is not a retry target');
  const repeatedMerge = mergeAssemblyDropAttempt(collectionIntent, collectionIntent, firstMerge, firstPlacementPartial);
  assert.equal(repeatedMerge.status, 'partial', 'repeat merge must not upgrade confirmed membership to full success');
  assert.equal(repeatedMerge.message, firstPlacementPartial.message);
  assert.deepEqual(repeatedMerge.retrySourceRefs, []);

  const initialMixed = receipt(original, 'mixed-first', [item(collectionRef, 'applied', 'presentation-membership'),
    item(noteRef, 'failed', 'error')]);
  const mixedPlacementPartial = withIncompletePlacement(initialMixed);
  assert.deepEqual(mixedPlacementPartial.retrySourceRefs, [noteRef]);
  const noteIntent = { ...original, sourceRefs: [noteRef] };
  const noteRetry = receipt(noteIntent, 'note-retry', [item(noteRef, 'applied', 'relation')]);
  const retainedPartial = mergeAssemblyDropAttempt(original, noteIntent, noteRetry, mixedPlacementPartial);
  assert.equal(retainedPartial.status, 'partial');
  assert.match(retainedPartial.message, /接收已保存，位置未确认/);
  assert.deepEqual(retainedPartial.placementIncompleteSourceKeys, [collectionKey]);
  assert.deepEqual(retainedPartial.retrySourceRefs, []);
  const confirmedPosition = { ...receipt(collectionIntent, 'position-confirmed',
    [item(collectionRef, 'skipped', 'already-member')]), placementIncompleteSourceKeys: [] };
  const fullyResolved = mergeAssemblyDropAttempt(original, collectionIntent, confirmedPosition, retainedPartial);
  assert.equal(fullyResolved.status, 'success');
  assert.deepEqual(fullyResolved.placementIncompleteSourceKeys, []);

  for (const [label, badCanonical] of [
    ['foreign project', canonical('another-project', [item(noteRef, 'applied', 'relation')])],
    ['malformed envelope', canonical(projectId, [item(noteRef, 'applied', 'relation')], 2)],
  ]) {
    const untrusted = assemblyDropReceipt(noteIntent, `bad-${label}`, badCanonical, projectId);
    assert.deepEqual(untrusted.unknownSourceKeys, [noteKey]);
    assert.deepEqual(untrusted.retrySourceRefs, []);
    const merged = mergeAssemblyDropAttempt(original, noteIntent, untrusted, mixedPlacementPartial);
    assert.equal(merged.status, 'partial');
    assert.deepEqual(merged.unknownSourceKeys, [noteKey]);
    assert.deepEqual(merged.placementIncompleteSourceKeys, [collectionKey]);
    assert.deepEqual(merged.retrySourceRefs, [], `${label} must not grant retry permission`);
  }

  console.log('PASS: current Gen2 Collection receipt merge (pure Node owner bundle; no Core, GUI, provider, or database)');
} finally {
  const runtimeParentResolved = path.resolve(runtimeParent);
  if (path.dirname(runtimeRootResolved) !== runtimeParentResolved
    || !path.basename(runtimeRootResolved).startsWith('current-gen2-collection-receipt-')) {
    throw new Error('Refusing cleanup outside this test-owned runtime directory');
  }
  await fs.rm(runtimeRootResolved, { recursive: true, force: true });
}
