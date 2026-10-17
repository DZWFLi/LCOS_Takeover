import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

const root = path.resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'output/原生文件Drop整合_20261017i/确版View真实Core审查', stamp);
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-text-view-audit-'));
await fs.mkdir(output, { recursive: true });
const originalFetch = globalThis.fetch;
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
globalThis.fetch = (address, options) => {
  const url = new URL(address instanceof Request ? address.url : String(address));
  const allowed = process._getActiveHandles().filter(handle => handle instanceof Server && handle.listening).some(handle => {
    const addr = handle.address(); return addr && typeof addr !== 'string' && ['127.0.0.1', '::1'].includes(addr.address)
      && url.port === String(addr.port) && ['127.0.0.1', '[::1]'].includes(url.hostname);
  });
  if (!allowed || ['56238', '56239'].includes(url.port)) throw Error('Audit refused an unowned endpoint.');
  return originalFetch(address, options);
};
const report = { at: new Date().toISOString(), output, temp, scope: 'real disposable Core, original primary text CAS producer and original material placement/projector; actual exact Viewer resolver; no browser/candidate/raw SQL/model',
  candidateRequests: 0, rawSql: false, models: 0, passed: false, findings: [] };
let facade;
try {
  const relative = file => path.relative(temp, path.join(root, file)).replaceAll('\\', '/');
  const entry = path.join(temp, 'fixture.ts'), bundle = path.join(temp, 'fixture.mjs');
  await fs.writeFile(entry, [
    `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`,
    `export {resolveNativeMaterialVersion} from ${JSON.stringify(relative('lab/pilot/native-material-viewer-read.ts'))};`,
  ].join('\n'));
  await buildPilotEntry(path.relative(root, entry), bundle, 'node', { coreCollectionTitle: true, coreColorPin: true, coreWorkspaceMembership: true });
  const module = await import(pathToFileURL(bundle).href);
  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19916',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { repository, projectId } = facade.core;
  const call = async (method, url, body) => {
    const response = await facade.handle({ method, url, body }); assert.ok(response, method + ' ' + url); return response;
  };
  const ok = async (method, url, body) => {
    const response = await call(method, url, body); assert.equal(response.status, 200, JSON.stringify(response));
    return response.body.value ?? response.body.data;
  };
  const canvas = id => ok('GET', '/api/canvas/v1/canvases/' + id);
  const primaryCanvas = await canvas('surface-core-main');
  const node = primaryCanvas.nodes.find(row => row.id === 'surface-main-text'); assert.ok(node);
  const originalRef = structuredClone(node.data.lcos_ref), originalBody = node.data.text;
  const workspace = repository.getWorkspaces(projectId).find(row => row.canvasId === 'surface-core-context'); assert.ok(workspace);
  const input = { projectId, workspaceId: String(workspace.id), artifactId: originalRef.artifactId,
    revisionId: originalRef.revisionId, fileRecordId: String(repository.getArtifactRevision(originalRef.revisionId).fileRecordId) };
  const placePath = '/api/lcos/canvases/surface-core-context/materials:place';
  const placed = await ok('POST', placePath, input);
  assert.equal(placed.state, 'present'); assert.equal(placed.node.data.text, originalBody);
  const additionalBefore = structuredClone(repository.getArtifactView(placed.artifact_view_id));
  assert.equal(additionalBefore.referenceKind, 'explicit_additional'); assert.equal(String(additionalBefore.revisionId), originalRef.revisionId);
  const before = { primaryRef: originalRef, additional: additionalBefore, placedRef: placed.node.data.lcos_ref, originalBody };
  const editedBody = originalBody + '\n\n独立审查：原 primary 保存出的新正文；确版额外位置不应被当作它的新版本。';
  const edit = await ok('PUT', `/api/lcos/core/projects/${projectId}/curation/canvas-text`, {
    canvasId: primaryCanvas.id, spatialId: node.id, artifactId: originalRef.artifactId,
    expectedRevisionId: originalRef.revisionId, body: editedBody,
  });
  const artifactAfter = repository.getArtifact(input.artifactId), additionalAfter = repository.getArtifactView(placed.artifact_view_id);
  const primaryAfter = repository.getArtifactView(originalRef.artifactViewId);
  assert.notEqual(String(artifactAfter.currentRevisionId), input.revisionId);
  assert.equal(String(primaryAfter.revisionId), String(artifactAfter.currentRevisionId));
  assert.equal(String(additionalAfter.revisionId), String(artifactAfter.currentRevisionId), 'record the actual all-Views-follow-Current implementation');
  const oldFile = repository.getFileRecord(input.fileRecordId), immutableOldBody = await fs.readFile(oldFile.observedPath, 'utf8');
  assert.equal(immutableOldBody, originalBody);
  const reread = await canvas('surface-core-context'), currentCarrier = reread.nodes.find(row => row.id === placed.node.id);
  assert.ok(currentCarrier); assert.equal(currentCarrier.data.lcos_ref.revisionId, String(artifactAfter.currentRevisionId));
  assert.equal(currentCarrier.data.text, editedBody);
  const inspectOld = await call('GET', placePath + '?' + new URLSearchParams(input));
  assert.equal(inspectOld.status, 409); assert.equal(inspectOld.body.error?.code ?? inspectOld.body.code, 'MATERIAL_VIEW_ID_CONFLICT');
  const graph = await ok('GET', `/api/lcos/core/projects/${projectId}/graph`);
  const detail = await ok('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(input.artifactId));
  const revisions = await ok('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(input.artifactId) + '/revisions');
  const request = { projectId, artifactId: input.artifactId, artifactViewId: placed.artifact_view_id, revisionId: input.revisionId };
  let exactViewReadError;
  try { module.resolveNativeMaterialVersion(request, detail, revisions, graph); } catch (error) { exactViewReadError = error.message; }
  assert.match(exactViewReadError ?? '', /所选视图与版本不一致/);
  const revisionOnly = module.resolveNativeMaterialVersion({ ...request, artifactViewId: undefined }, detail, revisions, graph);
  assert.equal(revisionOnly.revisionId, input.revisionId); assert.equal(revisionOnly.fileRecordId, input.fileRecordId);
  const metadata = readCurrentGen2Resource(path.join(root, 'lcos/apps/local-core/src/metadata-repository.ts')).contents;
  assert.ok(metadata.includes('view 的 revision 指针必须跟随 current'));
  report.before = before;
  report.after = { edit, artifactCurrentRevisionId: artifactAfter.currentRevisionId, primary: primaryAfter, additional: additionalAfter,
    carrierRef: currentCarrier.data.lcos_ref, carrierBody: currentCarrier.data.text, oldFileRecordStillReadable: true,
    oldImmutableBody: immutableOldBody, inspectOld, exactViewReadError, revisionOnly };
  report.findings = [
    'Domain referenceKind distinguishes occurrence roles; the legacy managed-text commit explicitly advances every View to Current. explicit_additional alone is not a global immutable contract.',
    'The native placement producer explicitly pins a chosen revision and encodes revision in its View PK; a later legitimate primary edit mutates that View to a different revision.',
    'The saved additional carrier rereads as the new text, old placement recovery returns MATERIAL_VIEW_ID_CONFLICT, and exact View+old-revision Reader refuses instead of silently substituting Current.',
    'The old ArtifactRevision and immutable FileRecord remain readable by explicit revision without View; no data loss of the old bytes was observed.',
  ];
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await facade?.close(); globalThis.fetch = originalFetch;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, passed: report.passed, findings: report.findings, error: report.error }, null, 2));
}
