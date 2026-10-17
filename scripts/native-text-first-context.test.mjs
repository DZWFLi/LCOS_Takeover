import assert from 'node:assert/strict';
import { canSaveNativeTextDraft, nativeTextPendingMatchesContext, nativeTextSnapshotMatchesContext }
  from '../lab/pilot/native-text-first-policy.ts';

const base = { projectId: 'p', canvasId: 'a', spatialId: 'n', artifactId: 'material', viewId: 'v', revisionId: 'r', fileRecordId: 'f', title: 'Text', body: 'Unsaved draft belongs to canvas a' };
const reference = { version: 1, entityType: 'artifact', entityId: 'material', artifactId: 'material', artifactViewId: 'v', revisionId: 'r' };
const current = { projectId: 'p', canvasId: 'a', nodeId: 'n', reference };
assert.equal(canSaveNativeTextDraft(base, current), true);
// Same canonical material and revision, different working occurrence: no draft transfer.
for (const patch of [{ projectId: 'other' }, { canvasId: 'b' }, { nodeId: 'other' }]) {
  assert.equal(canSaveNativeTextDraft(base, { ...current, ...patch }), false);
}
for (const patch of [{ entityType: 'view', entityId: 'v' }, { artifactViewId: 'other' }, { revisionId: 'new' }, { entityId: 'other' }]) {
  assert.equal(canSaveNativeTextDraft(base, { ...current, reference: { ...reference, ...patch } }), false);
}
assert.equal(base.body, 'Unsaved draft belongs to canvas a');

// A confirmed save may advance the revision while staying on the same exact occurrence.
assert.equal(nativeTextSnapshotMatchesContext({ ...base, revisionId: 'r2' }, current), true);
for (const patch of [{ projectId: 'other' }, { canvasId: 'b' }, { spatialId: 'other' },
  { artifactId: 'other-material' }, { viewId: 'other-view' }]) {
  assert.equal(nativeTextSnapshotMatchesContext({ ...base, ...patch, revisionId: 'r2' }, current), false);
}
assert.equal(nativeTextSnapshotMatchesContext({ ...base, revisionId: 'r2' }, {
  ...current, reference: { ...reference, entityType: 'view', entityId: 'v' },
}), false);

const pending = { canvasId: 'a', nodeId: 'n', artifactId: 'material' };
assert.equal(nativeTextPendingMatchesContext(pending, current), true);
for (const patch of [{ canvasId: 'b' }, { nodeId: 'other' }, { artifactId: 'other-material' }]) {
  assert.equal(nativeTextPendingMatchesContext({ ...pending, ...patch }, current), false);
}
assert.equal(nativeTextPendingMatchesContext(pending, {
  ...current, reference: { ...reference, entityType: 'view', entityId: 'v' },
}), false);
console.log(JSON.stringify({ passed: true, scope: 'draft occurrence/revision, advanced-revision receipt identity, and recoverable pending scene ownership' }));
