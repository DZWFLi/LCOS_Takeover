import assert from 'node:assert/strict';
import test from 'node:test';
import { createGen2FeatureSource, Gen2FeatureSourceError } from '../lab/adapters/gen2-feature-source.mjs';

const projects = [{ id: 'project-one', name: '项目一', rootPath: 'C:/private/project-one' }];
const artifacts = [{
  id: 'artifact-one', projectId: 'project-one', title: '当前版本文档',
  kind: 'markdown', availability: 'available', currentRevisionId: 'revision-current',
}];
const revisions = {
  'artifact-one': [
    { id: 'revision-newer', artifactId: 'artifact-one', fileRecordId: 'file-newer', status: 'draft', createdAt: '2026-10-13T03:00:00Z' },
    { id: 'revision-current', artifactId: 'artifact-one', fileRecordId: 'file-current', status: 'current', createdAt: '2026-10-13T02:00:00Z' },
  ],
};

function makeClients({
  projectRows = projects, artifactRows = artifacts, revisionRows = revisions, contentByKey = {},
  returnCrossProjectArtifacts = false,
} = {}) {
  const calls = [];
  return {
    calls,
    projectClient: { async listProjects() { calls.push(['listProjects']); return projectRows; } },
    artifactClient: {
      async listArtifacts(projectId, lifecycle) {
        calls.push(['listArtifacts', projectId, lifecycle]);
        return returnCrossProjectArtifacts ? artifactRows : artifactRows.filter((item) => item.projectId === projectId);
      },
      async listArtifactRevisions(artifactId) {
        calls.push(['listArtifactRevisions', artifactId]);
        return revisionRows[artifactId] ?? [];
      },
      async getFileRecordContent(projectId, fileRecordId) {
        calls.push(['getFileRecordContent', projectId, fileRecordId]);
        return contentByKey[projectId + ':' + fileRecordId];
      },
    },
  };
}
const sourceFor = (options = {}) => {
  const clients = makeClients(options);
  return { clients, source: createGen2FeatureSource(clients) };
};
const hasCode = (code) => (error) => error instanceof Gen2FeatureSourceError && error.code === code;

test('metadata distinguishes injected client methods from an unprobed runtime', () => {
  const { source } = sourceFor();
  assert.equal(source.metadata.mode, 'injected-gen2-clients');
  assert.equal(source.metadata.source, 'injected-gen2-clients');
  assert.equal(source.metadata.readOnly, true);
  assert.equal(source.metadata.runtimeStatus, 'not-probed');
  assert.equal(source.metadata.availableMethods.getFileRecordContent, true);
});

test('unconfigured source reports unavailable without fixture fallback', async () => {
  const source = createGen2FeatureSource();
  assert.equal(source.metadata.mode, 'unconfigured');
  assert.equal(source.metadata.source, 'unconfigured');
  await assert.rejects(source.listProjects(), hasCode('SOURCE_UNAVAILABLE'));
});

test('project picker preserves identity but excludes local rootPath', async () => {
  const { source } = sourceFor();
  assert.deepEqual(await source.listProjects(), [{ projectId: 'project-one', name: '项目一' }]);
});

test('asset rows match currentRevisionId exactly rather than newest timestamp', async () => {
  const { source } = sourceFor();
  const [asset] = await source.listAssets('project-one');
  assert.equal(asset.projectId, 'project-one');
  assert.equal(asset.artifactId, 'artifact-one');
  assert.equal(asset.currentRevisionId, 'revision-current');
  assert.equal(asset.currentFileRecordId, 'file-current');
  assert.equal(asset.currentRevisionAvailable, true);
  assert.equal(asset.revisions[0].revisionId, 'revision-newer');
});

test('preview returns four source identity fields and current text bytes', async () => {
  const { source } = sourceFor({
    contentByKey: { 'project-one:file-current': new Blob(['hello from Core'], { type: 'text/markdown; charset=utf-8' }) },
  });
  const preview = await source.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' });
  assert.deepEqual(preview.sourceIdentity, {
    projectId: 'project-one', artifactId: 'artifact-one', revisionId: 'revision-current', fileRecordId: 'file-current',
  });
  assert.equal(preview.title, '当前版本文档');
  assert.equal(preview.mimeType, 'text/markdown');
  assert.equal(preview.kind, 'text');
  assert.equal(preview.text, 'hello from Core');
});

test('an explicitly selected revision from the same artifact can be previewed', async () => {
  const { source } = sourceFor({
    contentByKey: { 'project-one:file-newer': new Blob(['draft'], { type: 'text/plain' }) },
  });
  const preview = await source.loadPreview({
    projectId: 'project-one', artifactId: 'artifact-one', revisionId: 'revision-newer',
  });
  assert.equal(preview.sourceIdentity.revisionId, 'revision-newer');
  assert.equal(preview.sourceIdentity.fileRecordId, 'file-newer');
  assert.equal(preview.text, 'draft');
});

test('missing current pointer remains visible in the list and fails preview honestly', async () => {
  const { source } = sourceFor({ artifactRows: [{ ...artifacts[0], currentRevisionId: 'revision-missing' }] });
  const [asset] = await source.listAssets('project-one');
  assert.equal(asset.currentRevisionAvailable, false);
  assert.equal(asset.currentFileRecordId, null);
  await assert.rejects(source.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' }), hasCode('CURRENT_REVISION_UNAVAILABLE'));
});

test('wrong artifact revisions and cross-project artifacts are rejected', async () => {
  const wrongRevision = sourceFor({
    revisionRows: { 'artifact-one': [{ id: 'revision-other', artifactId: 'artifact-two', fileRecordId: 'file-other' }] },
  }).source;
  await assert.rejects(wrongRevision.listAssets('project-one'), hasCode('WRONG_ARTIFACT_REVISION'));

  const crossProject = sourceFor({
    artifactRows: [{ ...artifacts[0], projectId: 'project-two' }], returnCrossProjectArtifacts: true,
  }).source;
  await assert.rejects(crossProject.listAssets('project-one'), hasCode('CROSS_PROJECT_ARTIFACT'));
});

test('unknown project and revision not belonging to selected artifact are rejected', async () => {
  const { source } = sourceFor();
  await assert.rejects(source.listAssets('missing-project'), hasCode('PROJECT_NOT_FOUND'));
  await assert.rejects(
    source.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one', revisionId: 'revision-from-other-artifact' }),
    hasCode('REVISION_NOT_FOUND_FOR_ARTIFACT'),
  );
});

test('missing bytes and unsupported MIME types are rejected', async () => {
  const { source: missing } = sourceFor();
  await assert.rejects(missing.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' }), hasCode('PREVIEW_CONTENT_UNAVAILABLE'));
  const { source: unsupported } = sourceFor({
    contentByKey: { 'project-one:file-current': new Blob(['gif'], { type: 'image/gif' }) },
  });
  await assert.rejects(unsupported.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' }), hasCode('UNSUPPORTED_PREVIEW_MIME'));
});

test('PNG, JPEG, WebP, plain text, and Markdown are supported', async () => {
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown']) {
    const { source } = sourceFor({ contentByKey: { 'project-one:file-current': new Blob(['payload'], { type: mimeType }) } });
    const preview = await source.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' });
    assert.equal(preview.mimeType, mimeType);
    assert.equal(preview.kind, mimeType.startsWith('image/') ? 'image' : 'text');
  }
});

test('oversized preview content is rejected before a payload is returned', async () => {
  const clients = makeClients({ contentByKey: { 'project-one:file-current': new Blob(['four'], { type: 'text/plain' }) } });
  const source = createGen2FeatureSource({ ...clients, maxPreviewBytes: 3 });
  await assert.rejects(source.loadPreview({ projectId: 'project-one', artifactId: 'artifact-one' }), hasCode('PREVIEW_TOO_LARGE'));
});

test('apply reports 501 and performs no canonical write', async () => {
  const { clients, source } = sourceFor();
  await assert.rejects(source.applyAdjustment({ params: { exposure: 0.2 } }), (error) => {
    assert.equal(error.code, 'ACTION_NOT_IMPLEMENTED');
    assert.equal(error.status, 501);
    return true;
  });
  assert.deepEqual(clients.calls, []);
});
