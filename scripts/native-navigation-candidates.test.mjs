import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), base = path.join(root, '.runtime');
await fs.mkdir(base, { recursive: true }); const runtime = await fs.mkdtemp(path.join(base, 'native-navigation-candidates-'));
const saved = new Map(Object.entries(process.env).filter(([key]) => /^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)));
for (const key of saved.keys()) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr');
let facade; const upstream = globalThis.fetch, cases = [];
globalThis.fetch = (input, init) => {
  const source = input instanceof Request ? input.url : String(input);
  const address = source.startsWith('/api/lcos/core/') ? facade.core.origin + source.slice('/api/lcos/core'.length) : source;
  const url = new URL(address);
  const owned = process._getActiveHandles().some(handle => {
    if (!(handle instanceof Server) || !handle.listening) return false;
    const a = handle.address(); return a && typeof a !== 'string' && ['127.0.0.1', '::1'].includes(a.address) && String(a.port) === url.port;
  });
  if (!owned || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Candidate fixture refused unowned network.');
  return upstream(address, init);
};
try {
  const rel = file => path.relative(runtime, path.join(root, file)).replaceAll('\\', '/');
  const entry = path.join(runtime, 'fixture.ts');
  await fs.writeFile(entry, `export * from ${JSON.stringify(rel('lab/pilot/native-navigation-candidates.ts'))};\nexport {readNativeNavigationFacts} from ${JSON.stringify(rel('lab/pilot/native-navigation-markers.ts'))};\nexport {startSurfaceCoreFacade} from ${JSON.stringify(rel('lab/pilot/surface-core-facade.ts'))};`);
  const output = await buildPilotEntry(path.relative(root, entry), path.join(runtime, 'fixture.mjs'), 'node', {
    coreCollectionTitle: true, coreColorPin: true, coreWorkspaceMembership: true, coreWorkflowCollectionMembers: true, coreMixedScopeContext: true,
  });
  const module = await import(pathToFileURL(output).href);
  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(runtime, 'owned'), publicOrigin: 'http://127.0.0.1:19974',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const repository = facade.core.repository, projectId = facade.core.projectId, prefix = '/api/lcos/core/projects/' + projectId;
  const call = async (method, url, body, status = 200) => {
    const result = await facade.handle({ method, url, body }); assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body.value ?? result.body.data;
  };
  const canvas = id => call('GET', '/api/canvas/v1/canvases/' + id);
  const first = await canvas('surface-core-main'), source = first.nodes.find(node => node.type === 'text' && node.data?.lcos_ref); assert.ok(source);
  const ref = source.data.lcos_ref, revision = repository.getArtifactRevision(ref.revisionId);
  const initialGraph = repository.get(projectId), mainWorkspace = initialGraph.workspaces.find(row => row.canvasId === first.id);
  const contextWorkspace = initialGraph.workspaces.find(row => row.canvasId === 'surface-core-context');
  const duplicate = await call('POST', '/api/canvas/v1/canvases/' + first.id + '/nodes:batchActions', {
    canvas_id: first.id, lcos_operation: { version: 1, kind: 'duplicate-view', phase: 'apply', operationId: 'candidate-second-main-view' },
    actions: [{ action: 'create', creates: [{ id: 'candidate-second-main', type: source.type, position: { x: 900, y: 500 }, measured: source.measured, data: source.data }] }],
  });
  const mainCopy = duplicate.lifecycle_results[0].nodes[0];
  const place = workspace => call('POST', '/api/lcos/canvases/' + workspace.canvasId + '/materials:place', {
    projectId, workspaceId: workspace.id, artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId, fileRecordId: revision.fileRecordId,
  });
  await place(contextWorkspace);
  const scopeId = 'scope-candidate-child', workspaceId = 'workspace:' + scopeId;
  const beforeMethod = repository.get(projectId);
  await call('PUT', prefix + '/workflow/methods/' + scopeId, { create: true, name: '候选原现场验证', expectedGraphVersion: beforeMethod.graphVersion,
    presentations: [{ id: 'presentation:workflow:' + scopeId, expectedVersion: 0, memberViewIds: [ref.artifactViewId],
      workflowActions: [{ id: 'inspect', label: '只读查看', attachedViewIds: [ref.artifactViewId], x: 0, y: 0 }], workflowActionEdges: [], workflowOperators: {} }] });
  const childScope = repository.getScopes(projectId).find(row => row.id === scopeId), rootScope = repository.getScopes(projectId).find(row => row.kind === 'root');
  assert.ok(childScope && rootScope);
  if (childScope.parentScopeId !== rootScope.id) repository.applyMutations({ baseVersion: repository.get(projectId).graphVersion,
    ops: [{ type: 'upsert_scope', scope: { ...childScope, parentScopeId: rootScope.id } }] }, projectId);
  const opened = await call('POST', '/api/lcos/workflow/' + scopeId + '/workspace:open', { workspaceId });
  const childWorkspace = repository.getWorkspaces(projectId).find(row => row.id === workspaceId); assert.ok(childWorkspace);
  await place(childWorkspace);
  const run = (await call('POST', prefix + '/runs', { instruction: '候选核查仅登记，不派发', outputIntent: 'analyze', workspaceId, requestedProvider: 'workbuddy' }, 201)).review;
  assert.equal(run.run.status, 'created'); assert.equal(run.dispatch.status, 'planned'); assert.equal(run.dispatch.attemptCount, 0);
  await call('POST', '/api/lcos/canvases/' + opened.canvasId + '/execution:reconcile', {});
  const scene = { projectId, canvasId: first.id, workspaceId: mainWorkspace.id, surfaceRef: 'main', api: {} };
  const facts = await module.readNativeNavigationFacts(scene);
  const artifactTarget = { projectId, kind: 'entity', id: ref.artifactId };
  const canvasIds = module.nativeNavigationCandidateCanvasIds(artifactTarget, facts);
  assert.ok([first.id, contextWorkspace.canvasId, childWorkspace.canvasId].every(id => canvasIds.includes(id)));
  const evidence = await Promise.all([...new Set([...canvasIds, childWorkspace.canvasId])].map(async canvasId => ({ canvasId, nodes: (await canvas(canvasId)).nodes })));
  const before = { graph: repository.get(projectId), execution: repository.getProjectExecutionProjection(projectId),
    bindings: repository.getProjectionBindings(projectId), spaces: await Promise.all(evidence.map(row => facade.spatial.read(row.canvasId))), markers: repository.listSpatialMarkerIntents(projectId) };
  const all = module.nativeNavigationCandidates(artifactTarget, facts, evidence);
  assert.equal(all.status, 'ready'); assert.equal(all.complete, true, JSON.stringify(all.rejected)); assert.ok(all.candidates.length >= 4);
  assert.ok(all.candidates.some(row => row.nodeId === source.id)); assert.ok(all.candidates.some(row => row.nodeId === mainCopy.nodeId));
  assert.ok(all.candidates.every(row => row.kind === 'node' && row.nodeTargetRef.kind === 'view' && !Object.hasOwn(row, 'position') && !Object.hasOwn(row, 'size')));
  assert.ok(all.candidates.every(row => row.workspace === facts.graph.workspaces.find(workspace => workspace.id === row.workspaceId)));
  const child = all.candidates.find(row => row.workspaceId === workspaceId); assert.ok(child);
  assert.deepEqual(child.scopeTrail.map(scope => scope.id), [rootScope.id, scopeId]);
  const exactView = module.nativeNavigationCandidates({ projectId, kind: 'view', id: mainCopy.lcos_ref.artifactViewId }, facts, evidence);
  assert.equal(exactView.status, 'ready'); assert.equal(exactView.complete, true); assert.deepEqual(exactView.candidates.map(row => row.nodeId), [mainCopy.nodeId]);
  assert.deepEqual(exactView.rejected, [], 'the normal other View behind the Artifact binding is skipped, not marked corrupt');
  const otherViewHidden = structuredClone(evidence); otherViewHidden.find(row => row.canvasId === first.id).nodes.find(row => row.id === source.id).hidden = true;
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'view', id: mainCopy.lcos_ref.artifactViewId }, facts, otherViewHidden).complete, true, 'a legitimate other View stays irrelevant even while hidden');
  cases.push('real Core creates additional Main View, cross-surface placements and true child worksite; exact GET refs/bindings list every Artifact occurrence, while exact View excludes other legitimate Views; full parentScopeId chain and original Workspace retained without candidate geometry');

  const surface = module.nativeNavigationCandidates({ projectId, kind: 'surface', id: 'workspace:' + workspaceId }, facts, evidence);
  assert.equal(surface.status, 'ready'); assert.equal(surface.candidates.length, 1); assert.equal(surface.candidates[0].kind, 'surface');
  assert.equal(surface.candidates[0].nodeId, undefined); assert.equal(surface.candidates[0].workspaceId, workspaceId);
  const typedSurfaceCollision = { ...facts, graph: { ...facts.graph, runs: [...facts.graph.runs, { id: scopeId, projectId }] } };
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'surface', id: 'scope:' + scopeId }, typedSurfaceCollision, evidence).status, 'ready', 'a typed scope surface does not become an untyped Run entity');
  const runResult = module.nativeNavigationCandidates({ projectId, kind: 'entity', id: run.run.id }, facts, evidence);
  assert.equal(runResult.status, 'ready'); assert.equal(runResult.candidates.length, 1); assert.equal(runResult.candidates[0].workspaceId, workspaceId);
  const optionalUnavailable = { ...facts, availability: { runs: false, conversations: false }, graph: { ...facts.graph, runs: [], connectedConversations: [] } };
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'entity', id: run.run.id }, optionalUnavailable, evidence).status, 'unavailable');
  assert.equal(module.nativeNavigationCandidates(artifactTarget, optionalUnavailable, evidence).status, 'ready');
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'surface', id: 'workspace:' + workspaceId }, optionalUnavailable, evidence).status, 'ready');
  cases.push('surface candidates enter only the exact original worksite without fabricated node; actual planned Run carrier supported, optional Run/Conversation read failure is unavailable and leaves materials/surfaces usable');

  const marker = sourceSurfaceRef => ({ id: 'pure-marker', projectId, targetRef: artifactTarget, scope: 'local', sourceSurfaceRef, createdAt: '2026-10-26', updatedAt: '2026-10-26' });
  const filter = value => all.candidates.filter(candidate => module.nativeNavigationMarkerApplies(value, candidate, facts));
  assert.ok(filter(marker('main')).every(candidate => candidate.workspaceId === mainWorkspace.id));
  assert.equal(filter(marker('main')).length, all.candidates.filter(row => row.workspaceId === mainWorkspace.id).length);
  assert.deepEqual(filter(marker('workspace:' + workspaceId)).map(row => row.workspaceId), [workspaceId]);
  assert.deepEqual(filter(marker('scope:' + scopeId)).map(row => row.workspaceId), [workspaceId]);
  assert.equal(filter(marker('assembly')).length, 0); assert.equal(filter(marker('conversation:unproven-conversation')).length, 0);
  assert.equal(filter({ ...marker('main'), scope: 'cross-surface' }).length, all.candidates.length);
  const conversationFacts = { ...facts, graph: { ...facts.graph, connectedConversations: [{ id: 'known-conversation', projectId }] } };
  const conversationCandidate = { ...child, surfaceRef: 'conversation:known-conversation' };
  assert.equal(module.nativeNavigationMarkerApplies(marker('conversation:known-conversation'), child, conversationFacts), false, 'a conversation icon/workspace is not proof of its subcanvas');
  assert.equal(module.nativeNavigationMarkerApplies(marker('conversation:known-conversation'), conversationCandidate, conversationFacts), true, 'only explicit original-scene evidence admits a conversation surface');
  assert.equal(module.nativeNavigationMarkerApplies({ ...marker('main'), projectId: 'foreign' }, all.candidates[0], facts), false);
  cases.push('local source filters use exact Main/root, Workspace, Scope and witnessed Conversation surface identities; Assembly/unknown surfaces do not alias to Main; only same-project cross-surface markers include all occurrences');

  const missingBinding = module.nativeNavigationCandidates(artifactTarget, { ...facts, bindings: [] }, evidence);
  assert.equal(missingBinding.status, 'unplaced'); assert.equal(missingBinding.reason, 'binding-missing');
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'entity', id: 'missing-entity' }, facts, evidence).status, 'missing');
  const archived = structuredClone(facts); archived.graph.artifacts.find(row => row.id === ref.artifactId).archivedAt = '2026-10-26';
  const archivedResult = module.nativeNavigationCandidates(artifactTarget, archived, evidence); assert.equal(archivedResult.status, 'missing'); assert.equal(archivedResult.reason, 'target-archived');
  const broken = structuredClone(facts); broken.graph.scopes.find(row => row.id === scopeId).parentScopeId = 'missing-parent';
  assert.equal(module.nativeNavigationCandidates({ projectId, kind: 'surface', id: 'workspace:' + workspaceId }, broken, evidence).reason, 'scope-chain-incomplete');
  const childOnlyTarget = { projectId, kind: 'surface', id: 'workspace:' + workspaceId };
  assert.equal(module.nativeNavigationCandidates(childOnlyTarget, facts, [{ canvasId: opened.canvasId, error: 'read failed' }]).reason, 'canvas-read-failed');
  const partial = module.nativeNavigationCandidates(artifactTarget, facts, evidence.map(row => row.canvasId === opened.canvasId ? { canvasId: row.canvasId, available: false } : row));
  assert.equal(partial.status, 'ready'); assert.equal(partial.complete, false); assert.ok(partial.rejected.some(row => row.reason === 'canvas-read-failed'));
  const dirty = structuredClone(evidence); dirty.find(row => row.canvasId === first.id).nodes.find(row => row.id === source.id).data.lcos_ref.revisionId = 'wrong-revision';
  assert.ok(module.nativeNavigationCandidates(artifactTarget, facts, dirty).rejected.some(row => row.nodeId === source.id && row.reason === 'binding-carrier-mismatch'));
  const duplicateBinding = { ...facts, bindings: [...facts.bindings, facts.bindings.find(row => row.spatialId === source.id)] };
  assert.ok(module.nativeNavigationCandidates(artifactTarget, duplicateBinding, evidence).rejected.some(row => row.nodeId === source.id && row.reason === 'binding-carrier-mismatch'));
  const missingParent = structuredClone(evidence); missingParent.find(row => row.canvasId === first.id).nodes.find(row => row.id === source.id).parentId = 'missing-native-parent';
  assert.ok(module.nativeNavigationCandidates(artifactTarget, facts, missingParent).rejected.some(row => row.nodeId === source.id && row.reason === 'node-geometry-unavailable'));
  cases.push('deleted/archived target, missing binding, failed/partial canvas read, incomplete parent Scope chain and genuine corrupt/duplicate bindings stay distinct; partial candidates remain usable without invented positions');
  assert.deepEqual(repository.get(projectId), before.graph); assert.deepEqual(repository.getProjectExecutionProjection(projectId), before.execution);
  assert.deepEqual(repository.getProjectionBindings(projectId), before.bindings); assert.deepEqual(repository.listSpatialMarkerIntents(projectId), before.markers);
  assert.deepEqual(await Promise.all(evidence.map(row => facade.spatial.read(row.canvasId))), before.spaces);
  console.log(JSON.stringify({ passed: true, cases, runtime: 'disposable real Core/Huabu only; pure candidate resolution does no writes; no model dispatch/browser/active runtime' }, null, 2));
} finally {
  await facade?.close(); globalThis.fetch = upstream;
  for (const key of Object.keys(process.env)) if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)) delete process.env[key];
  for (const [key, value] of saved) process.env[key] = value;
  const absolute = path.resolve(runtime); if (!absolute.startsWith(path.resolve(base) + path.sep)) throw Error('Unexpected candidate fixture path.');
  await fs.rm(absolute, { recursive: true, force: true });
}
