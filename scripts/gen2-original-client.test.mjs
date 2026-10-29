import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { prepareGen2ClientModules } from '../lab/gen2-client-build.mjs';
import { createExplicitFixtureFetch } from '../lab/adoption/fixture-fetch.mjs';
import { createGen2FeatureSource } from '../lab/adapters/gen2-feature-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = await prepareGen2ClientModules(await mkdtemp(path.join(root, '.runtime', 'gen2-original-clients-')));
const { HttpClient } = await import(pathToFileURL(path.join(build.outputDirectory, 'client.js')));
const { CoreProjectClient } = await import(pathToFileURL(path.join(build.outputDirectory, 'projects.js')));
const { CoreArtifactClient } = await import(pathToFileURL(path.join(build.outputDirectory, 'artifacts.js')));
function fixture() {
  const transport = createExplicitFixtureFetch({ baseUrl: 'http://127.0.0.1:17877/__fixture_gen2',
    imageBlob: new Blob(['synthetic image bytes'], { type: 'image/png' }),
    draftImageBlob: new Blob(['synthetic draft bytes'], { type: 'image/png' }) });
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:17877/__fixture_gen2', fetch: transport.fetch });
  return { transport, source: createGen2FeatureSource({ projectClient: new CoreProjectClient(http), artifactClient: new CoreArtifactClient(http) }) };
}
test('original Gen2 classes, not rewritten clients, execute exact read routes under explicit fixture responses', async () => {
  const { transport, source } = fixture();
  const projects = await source.listProjects();
  assert.equal(projects[0].projectId, 'fixture-project-one');
  assert.equal(Object.hasOwn(projects[0], 'rootPath'), false);
  const preview = await source.loadPreview({ projectId: projects[0].projectId, artifactId: 'fixture-artifact-image' });
  assert.equal(preview.sourceIdentity.revisionId, 'fixture-revision-current');
  assert.equal(preview.sourceIdentity.fileRecordId, 'fixture-file-current');
  assert.equal(await preview.blob.text(), 'synthetic image bytes');
  assert.ok(transport.calls.every(call => call.method === 'GET'));
  assert.ok(transport.calls.some(call => call.route === '/projects/fixture-project-one/artifacts?lifecycle=active'));
  assert.ok(transport.calls.some(call => call.route === '/artifacts/fixture-artifact-image/revisions'));
  assert.ok(transport.calls.some(call => call.route === '/projects/fixture-project-one/file-records/fixture-file-current/content'));
});
test('original Gen2 content reader preserves explicitly selected revision and safe text', async () => {
  const { source } = fixture();
  const draft = await source.loadPreview({ projectId: 'fixture-project-one', artifactId: 'fixture-artifact-image', revisionId: 'fixture-revision-newer' });
  assert.equal(draft.sourceIdentity.fileRecordId, 'fixture-file-newer');
  const text = await source.loadPreview({ projectId: 'fixture-project-one', artifactId: 'fixture-artifact-text' });
  assert.equal(text.kind, 'text'); assert.ok(text.text.includes('<script>'));
});
test('fixture boundary rejects unknown URLs and non-GET without any real-network fallback', async () => {
  const { transport, source } = fixture();
  await assert.rejects(transport.fetch('https://app.tapnow.ai/projects'), /no network fallback/);
  const response = await transport.fetch('http://127.0.0.1:17877/__fixture_gen2/projects', { method: 'POST' });
  assert.equal(response.status, 501);
  const before = transport.calls.length;
  await assert.rejects(source.applyAdjustment(), error => error.status === 501);
  assert.equal(transport.calls.length, before);
});
