import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackendCompat } from '../lab/backend-compat.mjs';
import { validateCoreOrigin } from '../lab/adapters/core-read.mjs';

const fixtureAdapter = () => createBackendCompat({ fixtureMode: true });
const request = (handler, path, method = 'GET') => {
  const url = new URL(path, 'http://127.0.0.1');
  return handler({ method, pathname: url.pathname, url });
};

test('compat status labels fixtures synthetic and all capabilities read-only', async () => {
  const result = await request(fixtureAdapter(), '/api/compat/status');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.mode, 'fixture');
  assert.equal(result.body.data.core_connected, false);
  assert.equal(result.body.data.read_only, true);
  assert.equal(result.body.data.canvas_runtime_connected, false);
  assert.equal(result.body.data.content_bytes_connected, false);
  assert.equal(result.body.data.mutations_connected, false);
});

test('Canvas catalog projects project folders only, without claiming a native canvas', async () => {
  const result = await request(fixtureAdapter(), '/api/canvas/v1/canvases?scope=personal&keyword=%E6%A8%A1%E6%8B%9F&limit=10');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.total, 2);
  assert.equal(result.body.data.canvases.length, 2);
  for (const canvas of result.body.data.canvases) {
    assert.equal(canvas.type, 'canvas');
    assert.equal(canvas.lcos_projection.catalog_only, true);
    assert.equal(canvas.lcos_projection.navigation_supported, false);
    assert.equal('rootPath' in canvas, false);
    assert.equal('nodes' in canvas, false);
    assert.equal('connections' in canvas, false);
  }
});

test('Library folders are a read-only projection of LCOS projects and active artifact counts', async () => {
  const result = await request(fixtureAdapter(), '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders');
  assert.equal(result.status, 200);
  const first = result.body.data.folders.find(folder => folder.id === 'lcos-project:fixture-project-one');
  const second = result.body.data.folders.find(folder => folder.id === 'lcos-project:fixture-project-two');
  assert.equal(first.name, '夺舍计划 · 模拟材料');
  assert.equal(first.asset_count, 2);
  assert.equal(first.lcos_projection.catalog_only, true);
  assert.equal(first.lcos_projection.read_only, true);
  assert.equal(second.asset_count, 0);
});

test('asset metadata follows currentRevisionId, not the newest revision timestamp', async () => {
  const result = await request(fixtureAdapter(),
    '/api/library/v1/folders/lcos-project%3Afixture-project-one/assets?page=1&page_size=20');
  assert.equal(result.status, 200);
  const current = result.body.data.assets.find(asset => asset.id === 'fixture-artifact-image');
  assert.equal(current.lcos_projection.current_revision_id, 'fixture-revision-current');
  assert.equal(current.lcos_projection.file_record_id, 'fixture-file-current');
  assert.equal(current.lcos_projection.current_revision_available, true);
  assert.equal(current.lcos_projection.content_available, false);
  assert.equal(current.lcos_projection.metadata_only, true);
  assert.equal(current.source_url, '');
  assert.equal(current.thumbnail_url, '');
  assert.equal(current.content, '');

  const missing = result.body.data.assets.find(asset => asset.id === 'fixture-artifact-markdown');
  assert.equal(missing.lcos_projection.current_revision_id, null);
  assert.equal(missing.lcos_projection.file_record_id, null);
  assert.equal(missing.lcos_projection.current_revision_available, false);
  assert.equal(missing.lcos_projection.availability, 'missing');
});

test('asset search returns metadata with bounded pagination', async () => {
  const result = await request(fixtureAdapter(),
    '/api/library/v1/assets:search?keyword=%E5%90%88%E6%88%90&page=1&page_size=1');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.items.length, 1);
  assert.equal(result.body.data.items[0].asset.id, 'fixture-artifact-image');
  assert.equal(result.body.data.items[0].folder_id, 'lcos-project:fixture-project-one');
  assert.deepEqual(result.body.data.pagination, { page: 1, page_size: 1, total: 2, has_next: true });
});

test('writes under supported paths and status are explicitly rejected', async () => {
  const handler = fixtureAdapter();
  for (const [path, method] of [
    ['/api/library/v1/folders/lcos-project%3Afixture-project-one/assets', 'POST'],
    ['/api/canvas/v1/canvases', 'DELETE'],
    ['/api/compat/status', 'PUT']
  ]) {
    const result = await request(handler, path, method);
    assert.equal(result.status, 501);
    assert.equal(result.body.error.code, 'ACTION_NOT_IMPLEMENTED');
  }
});

test('unowned API namespaces are left to the host server', async () => {
  const handler = fixtureAdapter();
  assert.equal(await request(handler, '/api/tapies/v1/tasks'), null);
  assert.equal(await request(handler, '/api/agent-gateway/v1/sessions'), null);
});

test('missing Core returns 503 and never falls back to synthetic fixtures', async () => {
  const result = await request(createBackendCompat(), '/api/canvas/v1/canvases');
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'CORE_UNAVAILABLE');
  assert.equal(result.body.lcos_adapter.mode, 'unavailable');
  assert.equal(result.body.lcos_adapter.source, 'unconfigured');
  assert.equal(result.body.lcos_adapter.core_connected, false);
});

test('Core origin must be explicit and loopback-only', () => {
  assert.equal(validateCoreOrigin('http://127.0.0.1:43991'), 'http://127.0.0.1:43991');
  assert.throws(() => validateCoreOrigin('http://example.test:43121'), TypeError);
  assert.throws(() => validateCoreOrigin('http://127.0.0.1'), TypeError);
  assert.throws(() => createBackendCompat({
    coreOrigin: 'http://127.0.0.1:43991',
    fixtureMode: true
  }), TypeError);
});
