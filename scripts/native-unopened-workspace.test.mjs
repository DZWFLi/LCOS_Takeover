import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = process.cwd(), runtimeParent = path.join(root, '.runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeParent, 'isolated-unopened-workspace-'));
assert.ok(path.resolve(runtimeRoot).startsWith(path.resolve(runtimeParent) + path.sep));
const output = path.join(root, 'output/混合Scope取用_20261022/未打开工作集投影', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, runtimeRoot, originalUserDatabaseOpened: false, remoteProviderRequests: 0, cases: [], coreWrites: [] };
let facade;
const env = ['LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_RECOVERY_TRANSPORT'];
const oldEnv = Object.fromEntries(env.map(key => [key, process.env[key]]));
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const publicOrigin = 'http://127.0.0.1:17879';
const native = async pathname => facade.handle({ method: 'GET', pathname: new URL(pathname, publicOrigin).pathname, url: publicOrigin + pathname });
async function core(pathname, method = 'GET', body) {
  const response = await fetch(facade.core.origin + pathname, { method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
  const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); assert.equal(value.ok, true, JSON.stringify(value)); return value.value;
}
const ids = rows => rows.map(row => row.id).sort();
try {
  // Optional before evidence is read-only against the explicitly authorized old
  // local bundle. All mutations below go to this test's new disposable Core.
  if (process.argv.includes('--capture-before')) {
    report.before = [];
    for (const pathname of ['/api/canvas/v1/canvases?limit=100&offset=0', '/api/surface-core/status']) {
      const response = await fetch('http://127.0.0.1:56311' + pathname, { signal: AbortSignal.timeout(8000) });
      report.before.push({ pathname, status: response.status, body: await response.json() });
    }
    await fs.writeFile(path.join(output, '实际旧bundle只读证据.json'), JSON.stringify(report.before, null, 2));
  }
  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'), 'node',
    { coreWorkspaceMembership: true, coreMixedScopeContext: true });
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry));
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin });
  const projectId = facade.core.projectId;
  const workspaceRoute = `/projects/${encodeURIComponent(projectId)}/workspaces`;
  const original = await core(workspaceRoute);
  assert.equal(original.length, 3); assert.equal(facade.workspaces.length, 3);
  const base = original.find(workspace => workspace.preferredSurface === 'context'); assert.ok(base);
  const { canvasId: _canvasId, ...withoutCanvas } = base;
  const unopened = { ...withoutCanvas, id: 'workspace-unopened-regression', name: '合法未打开工作集 · 原成员保留', preferredSurface: 'context', updatedAt: new Date().toISOString() };
  assert.equal(Object.hasOwn(unopened, 'canvasId'), false);
  const initialCanvas = await native('/api/canvas/v1/canvases?limit=100&offset=0');
  assert.equal(initialCanvas.status, 200, JSON.stringify(initialCanvas.body));
  const initialOwners = initialCanvas.body.data.canvases.map(row => ({ id: row.id, workspaceId: row.workspace_id, surface: row.preferred_surface })).sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(initialOwners.length, 3);
  const created = await core(workspaceRoute, 'POST', unopened);
  report.coreWrites.push({ method: 'POST', pathname: workspaceRoute, id: created.id, canvasIdAbsent: !Object.hasOwn(created, 'canvasId') });
  assert.equal(created.id, unopened.id); assert.equal(created.canvasId, undefined);
  let actualWorkspaces = await core(workspaceRoute);
  assert.equal(actualWorkspaces.length, 4);
  assert.equal(actualWorkspaces.filter(row => row.id === unopened.id).length, 1);
  assert.equal(actualWorkspaces.find(row => row.id === unopened.id).canvasId, undefined);
  assert.equal(actualWorkspaces.filter(row => row.preferredSurface === 'context').length, 2);
  report.cases.push('Original Core HTTP POST creates a legitimate fourth working set with no canvasId and duplicate preferredSurface; Core GET retains it without SQL or fake Canvas.');

  async function verifyProjection(phase) {
    const listed = await native('/api/canvas/v1/canvases?limit=100&offset=0');
    assert.equal(listed.status, 200, JSON.stringify(listed.body)); assert.equal(listed.body.data.total, 3);
    const owners = listed.body.data.canvases.map(row => ({ id: row.id, workspaceId: row.workspace_id, surface: row.preferred_surface })).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(owners, initialOwners, `${phase}: do not fabricate an unopened workspace Canvas or replace any real owner.`);
    const status = await native('/api/surface-core/status'); assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.data.core.connected, true);
    assert.equal(status.body.data.surfaces.length, 3); assert.equal(status.body.data.workspaces.length, 3); assert.equal(facade.workspaces.length, 3);
    assert.deepEqual(status.body.data.workspaces.map(row => row.canvasId).sort(), initialOwners.map(row => row.id).sort());
    assert.deepEqual(status.body.data.surfaces.map(row => row.workspaceId).sort(), ids(original));
    assert.deepEqual(status.body.data.surfaces.map(row => row.preferredSurface).sort(), ['context', 'main', 'workflow']);
    for (const owner of owners) {
      const detail = await native('/api/canvas/v1/canvases/' + encodeURIComponent(owner.id));
      assert.equal(detail.status, 200, JSON.stringify(detail.body)); assert.equal(detail.body.data.id, owner.id); assert.equal(detail.body.data.workspace_id, owner.workspaceId);
    }
    return { phase, owners, statusWorkspaces: status.body.data.workspaces, surfaceCount: status.body.data.surfaces.length };
  }
  report.afterCreate = await verifyProjection('after legitimate unopened working set creation');
  report.cases.push('Facade Canvas list and status retain exactly the original three real Canvas owners; undefined Canvas paths and duplicate preferredSurface do not fail the whole list.');
  await facade.close(); facade = undefined;
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin });
  actualWorkspaces = await core(workspaceRoute);
  assert.equal(actualWorkspaces.length, 4); assert.equal(actualWorkspaces.find(row => row.id === unopened.id).canvasId, undefined);
  report.afterRestart = await verifyProjection('after same isolated facade restart');
  assert.deepEqual(ids(actualWorkspaces.filter(row => row.canvasId)), ids(original));
  report.cases.push('A real facade/Core/storage restart keeps the four canonical working sets and the same three Canvas/surface owners; the unopened set remains unopened.');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await facade?.close();
  for (const key of env) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, error: report.error, report: path.join(output, 'report.json') }, null, 2));
