import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Set(process.argv.slice(2));
if (!flags.has('--deployed') || !flags.has('--save-synthetic-workflow-method')) {
  console.error('not-started: requires --deployed --save-synthetic-workflow-method; saves only an explicitly authored synthetic method, never a Run.');
  process.exitCode = 2;
} else {
  await run();
}

async function run() {
  const origin = 'http://127.0.0.1:17881';
  const projectId = 'disposable-surface-core-facade';
  const scopeId = 'scope-surface-core-workflow';
  const presentationId = `presentation:workflow:${scopeId}`;
  const prefix = `/api/lcos/core/projects/${projectId}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(root, '.runtime', 'workflow-method-prepare', `${stamp}.json`);
  const report = { at: new Date().toISOString(), passed: false, projectId, scopeId, presentationId,
    definition: 'Manually authored synthetic text-only method for real Core/GUI integration tests; no generated output or execution.',
    admittedWrites: 0, mayHaveCommitted: false, alreadyPresentReadOnly: false, failure: null, reportPath };
  async function json(route, core = true) {
    const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store' });
    assert.equal(response.status, 200, `${route}: HTTP ${response.status}`);
    const payload = await response.json();
    assert.equal(core ? payload.ok : payload.code, core ? true : 0);
    return core ? payload.value : payload.data;
  }
  async function readState() {
    const [graph, presentations, runs, ...canvases] = await Promise.all([
      json(`${prefix}/graph`), json(`${prefix}/presentations`), json(`${prefix}/runs`),
      ...['main', 'context', 'workflow'].map(key => json(`/api/canvas/v1/canvases/surface-core-${key}`, false)),
    ]);
    return { graph, presentations, runs, canvases };
  }
  try {
    const health = await fetch(origin + '/health', { redirect: 'error' }).then(response => response.json());
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress');
    assert.equal(health.bind, '127.0.0.1');
    assert.equal(health.cloudBackendConnected, false);
    const before = await readState();
    assert.equal(before.graph.project.id, projectId);
    assert.equal(before.graph.scopes.filter(scope => scope.id === scopeId && scope.kind === 'workflow').length, 1);
    const textNodes = before.canvases[2].nodes.filter(node => node.id === 'surface-workflow-text' && node.type === 'text');
    assert.equal(textNodes.length, 1);
    const ref = textNodes[0].data.lcos_ref;
    assert.equal(ref.entityType, 'artifact');
    const view = before.graph.artifactViews.find(row => row.id === ref.artifactViewId);
    const artifact = before.graph.artifacts.find(row => row.id === ref.artifactId);
    const revision = before.graph.artifactRevisions.find(row => row.id === ref.revisionId);
    const file = before.graph.fileRecords.find(row => row.id === revision?.fileRecordId);
    assert.ok(view && artifact && revision && file);
    assert.equal(artifact.projectId, projectId);
    assert.equal(view.artifactId, artifact.id);
    assert.equal(view.revisionId, revision.id);
    assert.ok(['text/plain', 'text/markdown'].includes(file.mimeType));
    const state = {
      memberViewIds: [ref.artifactViewId], hiddenViewIds: [], positions: {},
      hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [],
      pinnedViewIds: [], emphasisByViewId: {}, workflowOperators: {},
      workflowActions: [
        { id: 'read-project-text', label: '读取项目文字', description: '读取已引用的项目文字；不修改原文件。',
          attachedViewIds: [ref.artifactViewId], x: 0, y: 0 },
        { id: 'draft-next-step', label: '整理下一步', description: '根据文字整理下一步建议；这份合成方法只用于草稿接入验收，尚未运行。',
          attachedViewIds: [], x: 320, y: 0 },
      ],
      workflowActionEdges: [{ id: 'read-then-draft', fromActionId: 'read-project-text', toActionId: 'draft-next-step', label: '阅读后整理' }],
    };
    report.materialReference = { artifactId: artifact.id, viewId: view.id, revisionId: revision.id, fileRecordId: file.id };
    const existing = before.presentations.filter(row => row.id === presentationId);
    assert.ok(existing.length <= 1);
    if (existing.length) {
      assert.equal(existing[0].projectId, projectId);
      assert.equal(existing[0].scopeId, scopeId);
      assert.equal(existing[0].capability, 'workflow');
      assert.deepEqual(existing[0].state, state, 'Existing method differs; it is preserved, never overwritten for a test.');
      report.alreadyPresentReadOnly = true;
    } else {
      const now = new Date().toISOString();
      const contract = { schemaVersion: 0, id: presentationId, projectId, scopeId, capability: 'workflow', renderer: 'workflow',
        state, version: 0, updatedBy: 'agent', createdAt: now, updatedAt: now };
      report.admittedWrites = 1;
      report.mayHaveCommitted = true;
      const response = await fetch(`${origin}${prefix}/presentations/${encodeURIComponent(presentationId)}`, {
        method: 'PUT', redirect: 'error', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contract, expectedVersion: 0 }),
      });
      const payload = await response.json();
      report.receipt = { status: response.status, ok: payload.ok, error: payload.error, version: payload.value?.version };
      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.value.id, presentationId);
      assert.equal(payload.value.version, 0, 'Existing Core first-insert version semantics must be retained.');
      assert.deepEqual(payload.value.state, state);
    }
    const after = await readState();
    assert.deepEqual(after.graph, before.graph, 'Method authoring must not mutate Project Graph or materials.');
    assert.deepEqual(after.canvases, before.canvases, 'Method authoring must not create or alter Canvas carriers.');
    assert.deepEqual(after.runs, before.runs, 'Saving a method is not Run creation or dispatch.');
    const saved = after.presentations.filter(row => row.id === presentationId);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].scopeId, scopeId);
    assert.equal(saved[0].capability, 'workflow');
    assert.deepEqual(saved[0].state, state);
    assert.deepEqual(after.presentations.filter(row => row.id !== presentationId), before.presentations.filter(row => row.id !== presentationId),
      'Existing Saved Context Presentation must remain exact.');
    report.final = { version: saved[0].version, actions: state.workflowActions.length, edges: state.workflowActionEdges.length,
      memberViewIds: saved[0].state.memberViewIds, projectGraphAndCanvasesUnchanged: true, runsUnchanged: true,
      otherPresentationsUnchanged: true, providerExecution: false };
    report.passed = true;
  } catch (error) {
    report.failure = String(error.stack ?? error);
  } finally {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
