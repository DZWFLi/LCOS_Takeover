import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'live-core-test-' + Date.now());
await mkdir(runtimeRoot, { recursive: true });
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const compiled = await buildPilotEntry('lab/pilot/core-service.ts', path.join(runtimeRoot, 'core-service.mjs'));
const { startCorePilot } = await import(pathToFileURL(compiled).href);
const report = { coreImplementation: 'copied actual Local Core', mode: 'real-http-new-synthetic-project', originalUserDatabaseOpened: false, cases: [] };
let pilot;
const request = async (method, route, body) => {
  const response = await fetch(pilot.origin + route, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};
try {
  pilot = await startCorePilot({ runtimeRoot });
  assert.equal((await request('GET', '/health')).status, 200); report.cases.push('actual loopback TCP server');
  const route = '/projects/' + pilot.projectId + '/curation/canvas-text';
  const first = await request('PUT', route, { canvasId: pilot.canvasId, spatialId: 'pilot-text-node', expectedRevisionId: null, body: '# 原节点接真实 Core\n\n第一稿' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const original = first.body.value;
  assert.equal(await readFile(pilot.repository.getFileRecord(original.fileRecordId).observedPath, 'utf8'), original.body); report.cases.push('real HTTP creates registered Markdown bytes and native binding');
  const second = await request('PUT', route, { canvasId: pilot.canvasId, spatialId: 'pilot-text-node', artifactId: original.artifactId, expectedRevisionId: original.revisionId, body: '## 第二稿\n\n**已修改**' });
  assert.equal(second.status, 200, JSON.stringify(second.body)); assert.notEqual(second.body.value.revisionId, original.revisionId); report.cases.push('real HTTP revision update');
  const stale = await request('PUT', route, { canvasId: pilot.canvasId, spatialId: 'pilot-text-node', artifactId: original.artifactId, expectedRevisionId: original.revisionId, body: '过期写入不应覆盖' });
  assert.equal(stale.status, 409); report.cases.push('stale revision rejected without overwrite');
  const query = '?canvasId=' + pilot.canvasId + '&spatialId=pilot-text-node';
  assert.equal((await request('GET', route + query)).body.value.body, second.body.value.body);
  const image = pilot.repository.getArtifacts(pilot.projectId).find(a => a.kind === 'image');
  const revision = pilot.repository.getArtifactRevision(String(image.currentRevisionId));
  const response = await fetch(pilot.origin + '/projects/' + pilot.projectId + '/file-records/' + revision.fileRecordId + '/content');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(pilot.repository.getFileRecord(String(revision.fileRecordId)).observedPath)); report.cases.push('actual registered local image bytes over HTTP');
  await pilot.close(); pilot = await startCorePilot({ runtimeRoot });
  const restored = await request('GET', '/projects/' + pilot.projectId + '/curation/canvas-text' + query);
  assert.equal(restored.body.value.revisionId, second.body.value.revisionId); assert.equal(restored.body.value.body, second.body.value.body); report.cases.push('server and SQLite reopen preserve exact revision body');
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; process.exitCode = 1; }
finally { if (pilot) await pilot.close(); await writeFile(path.join(root, 'evidence', 'live-core-pilot.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
