import assert from 'node:assert/strict';
import { nativeTextFacts, nativeTextWorldSize, readNativeTextReference } from '../lab/pilot/native-text-policy.ts';

const reference = { version: 1, entityType: 'artifact', entityId: 'artifact-text', artifactId: 'artifact-text', artifactViewId: 'view-text', revisionId: 'old-dto-revision' };
assert.deepEqual(readNativeTextReference(reference), reference);
assert.equal(readNativeTextReference({ ...reference, entityId: 'node-spatial' }), undefined);
assert.equal(readNativeTextReference({ ...reference, version: 2 }), undefined);
assert.equal(readNativeTextReference({ ...reference, artifactViewId: '' }), undefined);
const viewReference = { ...reference, entityType: 'view', entityId: 'view-text' };
assert.deepEqual(readNativeTextReference(viewReference), viewReference);
assert.equal(readNativeTextReference({ ...viewReference, entityId: 'artifact-text' }), undefined);

const text = { projectId: 'project', canvasId: 'canvas', spatialId: 'node-spatial', artifactId: 'artifact-text',
  viewId: 'view-text', revisionId: 'revision-current', fileRecordId: 'file-current', body: '# 正文\n\n原文', title: '材料' };
const detail = { artifact: { id: 'artifact-text', projectId: 'project', managed: true, kind: 'markdown',
  currentRevisionId: 'revision-current', availability: 'available' }, revisions: [] };
const input = { projectId: 'project', canvasId: 'canvas', nodeId: 'node-spatial', reference, text, detail };
const facts = nativeTextFacts(input);
assert.equal(facts.currentRevisionId, text.revisionId, 'Core readback, not stale DTO receipt, determines the presentation revision');
assert.equal(facts.preview, text.body);
for (const patch of [{ projectId: 'foreign' }, { canvasId: 'other' }, { nodeId: 'other' }, { text: null },
  { text: { ...text, artifactId: 'other' } }, { text: { ...text, viewId: 'other' } },
  { reference: viewReference }, { detail: { ...detail, artifact: { ...detail.artifact, projectId: 'foreign' } } },
  { detail: { ...detail, artifact: { ...detail.artifact, managed: false } } },
  { detail: { ...detail, artifact: { ...detail.artifact, archivedAt: 'now' } } },
  { detail: { ...detail, artifact: { ...detail.artifact, kind: 'image' } } },
  { detail: { ...detail, artifact: { ...detail.artifact, currentRevisionId: 'raced-new-revision' } } }]) {
  assert.throws(() => nativeTextFacts({ ...input, ...patch }), /未另建正文/);
}
assert.deepEqual(nativeTextWorldSize({ measured: { width: 244, height: 150 }, style: { width: 500, height: 500 } }), { width: 244, height: 150 });
assert.deepEqual(nativeTextWorldSize({ measured: { width: 244, height: 150 } }, 410, 280), { width: 410, height: 280 });
assert.deepEqual(nativeTextWorldSize({ width: NaN, height: -1 }, Infinity, 0), { width: 300, height: 200 });
console.log(JSON.stringify({ passed: true, scope: 'exact primary Core text presentation identity and original world-size input; not GUI acceptance' }));
