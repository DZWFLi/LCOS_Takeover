import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root = process.cwd(), runtime = path.join(root, '.runtime');
const temp = await fs.mkdtemp(path.join(runtime, 'scope-members-test-'));
const report = { passed: false, checks: [], realBrowserVerified: false, writes: 0 };
try {
  await buildPilotEntry('lab/pilot/native-library-scope-members.ts', path.join(temp, 'members.mjs'), 'node');
  await buildPilotEntry('lab/pilot/native-library-reading-return.ts', path.join(temp, 'return.mjs'), 'node');
  const { nativeLibraryScopeMembers: members, nativeLibraryMember: member } = await import(pathToFileURL(path.join(temp, 'members.mjs')));
  const returns = await import(pathToFileURL(path.join(temp, 'return.mjs')));
  const item = { schemaVersion: 1, kind: 'context', entityRef: { type: 'context', id: 'context' }, title: '资料', usageCount: 0 };
  const graph = { project: { id: 'project' }, scopes: [{ id: 'context', projectId: 'project', kind: 'context', name: '资料' },
    { id: 'workflow', projectId: 'project', kind: 'workflow', name: '方法', updatedAt: '2026-10-22' }],
    artifactViews: [{ id: 'view', scopeId: 'context', artifactId: 'artifact', revisionId: 'old' }],
    artifacts: [{ id: 'artifact', projectId: 'project', title: '旧版正文', currentRevisionId: 'new' }],
    artifactRevisions: [{ id: 'old', artifactId: 'artifact', fileRecordId: 'file' }], fileRecords: [{ id: 'file', projectId: 'project' }] };
  const presentation = { id: 'presentation:context:context', projectId: 'project', scopeId: 'context', capability: 'context',
    state: { memberViewIds: ['view'], memberEntityRefs: [{ type: 'view', id: 'view' }, { type: 'scope', id: 'workflow' }, { type: 'note', id: 'note' }] } };
  const before = JSON.stringify({ graph, presentation });
  let result = members('project', item, graph, [presentation], []);
  assert.deepEqual(result.map(row => row.kind), ['material', 'scope', 'unavailable']);
  assert.equal(result[0].target.revisionId, 'old'); assert.equal(result[0].target.artifactViewId, 'view');
  assert.equal(result[1].item.kind, 'workflow'); assert.equal(result[1].item.entityRef.id, 'workflow');
  assert.equal(result[2].kind, 'unavailable'); assert.equal(JSON.stringify({ graph, presentation }), before);
  report.checks.push('Exact historical View, deduped member, whole Scope identity and visible unsupported member; no truth mutation');
  for (const mutate of [g => g.artifactViews.splice(0), g => g.artifactViews.push({ ...g.artifactViews[0] }),
    g => { g.artifactViews[0].revisionId = undefined; }, g => g.artifactRevisions.splice(0),
    g => { g.fileRecords[0].projectId = 'foreign'; }, g => { g.artifacts[0].projectId = 'foreign'; }, g => { g.artifactViews[0].scopeId = 'foreign'; }]) {
    const broken = structuredClone(graph); mutate(broken); assert.equal(members('project', item, broken, [presentation], [])[0].kind, 'unavailable');
  }
  assert.throws(() => members('foreign', item, graph, [presentation], []));
  assert.throws(() => members('project', item, graph, [presentation, presentation], []));
  report.checks.push('Missing/duplicate View, missing revision/file and foreign project refuse individually; never Current fallback');
  const workflow = { ...item, kind: 'workflow', entityRef: { type: 'workflow', id: 'workflow' } };
  const method = { projectId: 'project', scopeId: 'workflow', capability: 'workflow', state: { memberViewIds: ['operator'],
    workflowActions: [{ attachedViewIds: ['view'] }], workflowOperators: { operator: { branches: [{ targetViewId: 'view' }] } } } };
  assert.deepEqual(members('project', workflow, graph, [method], []).map(row => row.key), [JSON.stringify(['view', 'view'])]);
  report.checks.push('Workflow references include step attachments and branch targets; structural operators are not fake materials');
  const nested=structuredClone(graph);nested.notes=[{id:'note',projectId:'project',body:'原附注正文',updatedAt:'2026-10-22'}];
  nested.collections=[{id:'collection',projectId:'project',title:'集合',updatedAt:'2026-10-22'}];nested.artifacts[0].currentRevisionId='old';
  const sites=[{id:'workspace',projectId:'project',name:'现场',canvasId:'canvas',scopeId:'context'}],conversations=[{id:'conversation',projectId:'project',label:'原会话'}];
  const resolve=(type,id)=>member('project',{type,id},nested,sites,conversations);
  assert.equal(resolve('note','note').noteId,'note');assert.equal(resolve('note','note').updatedAt,'2026-10-22');
  assert.equal(resolve('collection','collection').item.kind,'collection');assert.equal(resolve('conversation','conversation').conversationId,'conversation');
  assert.equal(resolve('workspace','workspace').workspace.canvasId,'canvas');
  const currentArtifact=resolve('artifact','artifact');assert.equal(currentArtifact.target.revisionId,'old');assert.equal(currentArtifact.target.artifactViewId,undefined);
  for(const [type,id] of [['note','absent'],['collection','absent'],['conversation','absent'],['workspace','absent'],['run','unsupported']])assert.equal(resolve(type,id).kind,'unavailable');
  assert.equal(member('project',{type:'conversation',id:'conversation'},nested,sites,[{...conversations[0],projectId:'foreign'}]).kind,'unavailable');
  report.checks.push('Canonical Collection, Note, Conversation and Workspace have distinct real addresses; canonical Artifact current differs from pinned Scope View');
  const run = { id: 'run-exact', projectId: 'project', title: '  原任务  ', status: 'created',
    pendingReturnCount: 0, pendingArtifactIds: [], createdAt: '2026-10-22', updatedAt: '2026-10-22' };
  const resolveRun = (id, runs = []) => member('project', { type: 'run', id }, nested, sites, conversations, runs);
  const runBefore = JSON.stringify({ nested, sites, conversations, run });
  assert.deepEqual(resolveRun('run-exact', [run]), { key: JSON.stringify(['run', 'run-exact']), title: '原任务', kind: 'run', runId: 'run-exact' });
  assert.equal(resolveRun('run-exact').kind, 'unavailable');
  assert.equal(resolveRun('missing', [run]).kind, 'unavailable');
  assert.equal(resolveRun('run-exact', [{ ...run, projectId: 'foreign' }]).kind, 'unavailable');
  assert.equal(resolveRun('run-exact', [run, { ...run }]).kind, 'unavailable');
  assert.equal(resolveRun('run-exact', [run, { ...run, projectId: 'foreign' }]).kind, 'unavailable');
  assert.equal(resolveRun('missing', [{ ...run, title: 'missing' }]).kind, 'unavailable', 'A similar title never substitutes another Run address.');
  report.checks.push('Run resolves one exact project-owned identity; absent, foreign and duplicate identities remain visible unavailable without task substitution');
  for (const title of ['', '  \t\n ']) assert.equal(resolveRun('run-exact', [{ ...run, title }]).title, '任务');
  const unreadRun = resolveRun('run-exact', null);
  assert.equal(unreadRun.kind, 'unavailable'); assert.equal(unreadRun.key, JSON.stringify(['run', 'run-exact']));
  assert.match(unreadRun.reason, /重新读取/); assert.match(unreadRun.reason, /原成员保留/);
  report.checks.push('Blank Run titles retain a visible task label; a failed Run read retains the exact member with retry guidance');
  const withRun = { ...presentation, state: { memberViewIds: ['view'], memberEntityRefs: [
    { type: 'run', id: 'run-exact' }, { type: 'note', id: 'note' }, { type: 'conversation', id: 'conversation' }, { type: 'run', id: 'run-exact' }] } };
  const withRunBefore = JSON.stringify(withRun);
  const scopeRuns = members('project', item, nested, [withRun], sites, conversations, [run]);
  assert.deepEqual(scopeRuns.map(row => row.kind), ['material', 'run', 'note', 'conversation']);
  assert.equal(scopeRuns[1].runId, 'run-exact'); assert.equal(scopeRuns[1].title, '原任务');
  const failedRuns = members('project', item, nested, [withRun], sites, conversations, null);
  assert.deepEqual(failedRuns.map(row => row.kind), ['material', 'unavailable', 'note', 'conversation']);
  assert.equal(failedRuns[1].key, scopeRuns[1].key); assert.deepEqual(failedRuns.filter((_, index) => index !== 1), scopeRuns.filter((_, index) => index !== 1));
  assert.equal(members('project', item, nested, [withRun], sites, conversations)[1].kind, 'unavailable');
  report.checks.push('Scope forwards Run projection and dedupes exact references; Run read failure leaves materials, notes and conversations intact');
  const completeRuns = Array.from({ length: 102 }, (_, index) => ({ ...run, id: `run-${index + 1}`, title: `任务 ${index + 1}` }));
  for (const id of ['run-21', 'run-101', 'run-102']) {
    const resolved = resolveRun(id, completeRuns); assert.equal(resolved.kind, 'run'); assert.equal(resolved.runId, id);
  }
  const tailScope = { ...withRun, state: { memberViewIds: [], memberEntityRefs: [{ type: 'run', id: 'run-102' }] } };
  assert.equal(members('project', item, nested, [tailScope], sites, conversations, completeRuns)[0].runId, 'run-102');
  assert.equal(JSON.stringify({ nested, sites, conversations, run }), runBefore); assert.equal(JSON.stringify(withRun), withRunBefore);
  report.checks.push('Complete projection resolves Run members beyond 20 and 100 detail rows, including Scope tail members, without mutating source facts');
  let live = true, count = 0;
  const lease = { projectId: 'project', rootKind: 'context', rootId: 'context', current: () => live, onReturn: () => count++, closed: false };
  const request = returns.withNativeLibraryReadingReturn({ projectId: 'project', artifactId: 'artifact' }, lease);
  assert.equal(returns.nativeLibraryReadingRetains('project', 'context', 'context'), true);
  assert.equal(returns.nativeLibraryReadingRetains('project', 'workflow', 'workflow'), false);
  const next = returns.inheritNativeLibraryReadingReturn(request, { projectId: 'project', artifactId: 'source' });
  assert.equal(returns.sameNativeLibraryReadingReturn(request, next), true);
  assert.equal(returns.releaseNativeLibraryReadingReturn(next, true), true); assert.equal(count, 1);
  returns.releaseNativeLibraryReadingReturn(request, true); assert.equal(count, 1);
  assert.equal(returns.nativeLibraryReadingRetains('project', 'context', 'context'), false);
  const staleLease = { ...lease, closed: false };
  const stale = returns.withNativeLibraryReadingReturn({ projectId: 'project', artifactId: 'artifact' }, staleLease);
  live = false; assert.equal(returns.nativeLibraryReadingReturnCurrent(stale), false);
  returns.releaseNativeLibraryReadingReturn(stale, true); assert.equal(count, 1);
  report.checks.push('Origin-only return ownership follows lineage; close is idempotent, stale/unmounted origin never receives return');
  live = true; let used = 0;
  const useLease = { ...lease, closed: false, returning: false, onUse: () => used++ };
  const useRequest = returns.withNativeLibraryReadingReturn({ projectId: 'project', artifactId: 'artifact' }, useLease);
  returns.releaseNativeLibraryReadingReturn(useRequest, false, true); returns.releaseNativeLibraryReadingReturn(useRequest, false, true);
  assert.equal(used, 1); assert.equal(count, 1); report.checks.push('Explicit citation leaves the preview once and returns to original input, separate from browsing Back');
  let finish;
  const pending = { ...lease, closed: false, returning: false, onReturn: () => new Promise(resolve => { finish = resolve; }) };
  const pendingRequest = returns.withNativeLibraryReadingReturn({ projectId: 'project', artifactId: 'artifact' }, pending);
  returns.releaseNativeLibraryReadingReturn(pendingRequest, true);
  const newer = { ...lease, closed: false, returning: false };
  returns.withNativeLibraryReadingReturn({ projectId: 'project', artifactId: 'artifact' }, newer);
  finish(); await Promise.resolve();
  assert.equal(returns.nativeLibraryReadingRetains('project', 'context', 'context'), true);
  returns.cancelNativeLibraryReadingReturn(newer); report.checks.push('Delayed exit of an old read cannot cancel a newer originating Viewer return');
  let released = 0;
  const suspended = { ...lease, closed: false, returning: false, onRelease: () => released++ };
  const suspendedRequest = returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'run-exact' }, suspended);
  returns.releaseNativeLibraryReadingReturn(suspendedRequest, false); returns.releaseNativeLibraryReadingReturn(suspendedRequest, false);
  assert.equal(released, 1, 'Closing a task releases the suspended original preview exactly once.');
  const replaced = { ...lease, closed: false, returning: false, onRelease: () => released++ };
  returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'run-exact' }, replaced);
  const replacement = { ...lease, closed: false, returning: false };
  returns.withNativeLibraryReadingReturn({ projectId: 'project', conversationId: 'next' }, replacement);
  assert.equal(released, 2, 'A newer reading owner cleans up the old hidden source preview.');
  assert.equal(returns.nativeLibraryReadingRetains('project', 'context', 'context'), true);
  returns.cancelNativeLibraryReadingReturn(replacement);
  report.checks.push('Task close and newer reading ownership release source-preview suspension once, without cancelling the newer return');
  const originOutcomes = [];
  const returnedSource = { ...lease, closed: false, returning: false, onReturn: () => {}, onRelease: preserve => originOutcomes.push(preserve) };
  const returnedRequest = returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'run-exact' }, returnedSource);
  returns.releaseNativeLibraryReadingReturn(returnedRequest, true);
  const cancelledSource = { ...lease, closed: false, returning: false, onRelease: preserve => originOutcomes.push(preserve) };
  const cancelledRequest = returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'run-exact' }, cancelledSource);
  returns.releaseNativeLibraryReadingReturn(cancelledRequest, false);
  const replacedSource = { ...lease, closed: false, returning: false, onRelease: preserve => originOutcomes.push(preserve) };
  returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'run-exact' }, replacedSource);
  const newSource = { ...lease, closed: false, returning: false };
  returns.withNativeLibraryReadingReturn({ projectId: 'project', runId: 'new-run' }, newSource);
  assert.deepEqual(originOutcomes, [true, false, true], 'Back restores, cancellation closes, and supersession cannot close the newly opening source.');
  returns.cancelNativeLibraryReadingReturn(newSource);
  report.checks.push('Original source distinguishes Back restoration from destination cancellation; a new reading keeps its source intact');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  const out = path.join(root, 'output/Scope逐项查看_20261022/成员与回程独立验证'); await fs.mkdir(out, { recursive: true });
  const evidence = path.join(out, new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  await fs.writeFile(evidence, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, evidence }, null, 2));
  const relative = path.relative(runtime, temp); assert.ok(relative.startsWith('scope-members-test-') && !relative.includes(path.sep));
  await fs.rm(temp, { recursive: true, force: true });
}
