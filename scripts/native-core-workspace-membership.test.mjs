import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { createNativeCoreWorkspaceMembershipTransforms } from '../lab/native-core-workspace-membership-transform.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime');
await fs.mkdir(runtimeRoot, { recursive: true });
const temp = await fs.mkdtemp(path.join(runtimeRoot, 'workspace-member-condition-'));
const stamp = new Date().toISOString().replaceAll(':', '-');
const evidence = path.join(root, 'output/原生文件Drop整合_20261017i/Workspace成员条件真实Core', stamp);
await fs.mkdir(evidence, { recursive: true });
const report = { passed: false, mode: 'actual transformed Core HTTP routes + original MutationSafety + actual disposable SQLite transaction',
  cases: [], requests: [], modelsExecuted: false, rawSql: false, candidateTouched: false,
  writes: ['isolated synthetic Workspace membership changes and their original ChangeSets'],
  boundary: 'Race timing is controlled at the real transaction entry; this is not an OS multiprocess scheduling test. Identical four-field ABA is not distinguishable.' };
const originalFetch = globalThis.fetch;
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
const ownOrigins = () => new Set(process._getActiveHandles().filter(handle => handle instanceof Server && handle.listening).flatMap(handle => {
  const address = handle.address();
  return address && typeof address !== 'string' && ['127.0.0.1', '::1'].includes(address.address)
    ? [`http://${address.address === '::1' ? '[::1]' : address.address}:${address.port}`] : [];
}));
globalThis.fetch = (input, options) => {
  const address = new URL(input instanceof Request ? input.url : String(input));
  if (!ownOrigins().has(address.origin) || ['56238', '56239', '17879', '17880', '17881'].includes(address.port))
    throw new Error('Workspace condition test refused an unowned endpoint.');
  return originalFetch(input, options);
};
let facade;
try {
  const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
  for (const [file, transform] of Object.entries(createNativeCoreWorkspaceMembershipTransforms())) {
    const sourcePath = path.join(root, file), source = readCurrentGen2Resource(sourcePath)?.contents ?? await fs.readFile(sourcePath, 'utf8');
    const result = transform(source, { sourcePath });
    assert.equal(transform(result, { sourcePath }), result);
    assert.equal(ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics.length, 0);
    assert.throws(() => transform(source, { sourcePath: path.join(root, 'not-the-source.ts') }), /exact Core sourcePath/);
    if (file.endsWith('mutation-safety-service.ts')) {
      const before = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const after = ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const methods = ast => {
        const found = []; const visit = node => {
          if (ts.isMethodDeclaration(node) && ['addWorkspaceMember', 'removeWorkspaceMember'].includes(node.name.getText(ast))) found.push(node);
          ts.forEachChild(node, visit);
        }; visit(ast); return found;
      };
      for (const method of methods(before)) {
        const changed = methods(after).find(node => node.name.getText(after) === method.name.getText(before));
        const unchangedFallback = changed.body.statements.slice(1).map(node => node.getText(after));
        assert.deepEqual(unchangedFallback, [...method.body.statements].map(node => node.getText(before)), 'ordinary original owner statement sequence remains exact');
      }
      assert.throws(() => transform(source.replace('addWorkspaceMember(input:', 'addWorkspaceMemberDrift(input:'), { sourcePath }), /Both actual original/);
    }
    report.cases.push({ name: 'exact original AST transform: ' + file, parse: true, idempotent: true });
  }
  await assert.rejects(buildPilotEntry('lab/pilot/native-workspace-membership.ts', path.join(temp, 'forbidden.mjs'), 'browser',
    { coreWorkspaceMembership: true }), /Node\/Core-only/);
  report.cases.push({ name: 'Node-only registration refuses browser membership transform' });

  const fixture = path.join(temp, 'fixture.ts');
  const relative = file => path.relative(temp, path.join(root, file)).replaceAll('\\', '/');
  await fs.writeFile(fixture, [
    `export {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`,
    `export {MutationSafetyService} from ${JSON.stringify(relative('lcos/apps/local-core/src/mutation-safety-service.ts'))};`,
    `export {PresentationApplicationService} from ${JSON.stringify(relative('lcos/apps/local-core/src/presentation-application-service.ts'))};`,
  ].join('\n'));
  const bundle = path.join(temp, 'fixture.mjs');
  await buildPilotEntry(path.relative(root, fixture), bundle, 'node', { coreCollectionTitle: true, coreWorkspaceMembership: true });
  const module = await import(pathToFileURL(bundle));
  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19917',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { repository, projectId, origin } = facade.core;
  report.coreOrigin = origin;
  const workspaces = repository.getWorkspaces(projectId);
  const workspace = workspaces.find(row => row.canvasId === 'surface-core-main');
  assert.ok(workspace);
  const workspaceId = String(workspace.id);
  const initial = repository.listWorkspaceMembers(workspaceId);
  assert.ok(initial.length >= 1, 'owned facade has synthetic members');
  const viewId = String(initial[0].artifactViewId);
  const one = () => repository.listWorkspaceMembers(workspaceId).find(row => String(row.artifactViewId) === viewId);
  const expected = row => ({ workspaceId, viewId, addedAt: row.addedAt, addedBy: row.addedBy });
  const memberUrl = `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(viewId)}`;
  const membersUrl = `/workspaces/${encodeURIComponent(workspaceId)}/members`;
  const snapshot = () => structuredClone({ graph: repository.get(projectId),
    memberships: repository.listProjectWorkspaceMemberships(projectId), changeSets: repository.listMutationChangeSets(projectId, 500),
    presentations: repository.listPresentationViews(projectId) });
  const request = async (method, url, body, condition) => {
    const headers = { ...(body ? { 'content-type': 'application/json' } : {}),
      ...(condition === undefined ? {} : { 'x-lcos-expected-workspace-member': typeof condition === 'string' ? condition : encodeURIComponent(JSON.stringify(condition)) }) };
    const response = await fetch(origin + url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    report.requests.push({ method, url, status: response.status, conditional: condition !== undefined, ...(value.ok === false ? { failure: value.error } : {}) });
    return { status: response.status, body: value };
  };
  const rejectWithoutWrite = async (name, method, url, body, condition, status) => {
    const before = snapshot();
    const reply = await request(method, url, body, condition);
    assert.equal(reply.status, status, JSON.stringify(reply));
    assert.deepEqual(snapshot(), before, name + ': exact graph/membership/ChangeSet/Presentation unchanged');
    report.cases.push({ name, status, writes: 0 });
  };
  const changeCount = () => repository.listMutationChangeSets(projectId, 500).length;

  const old = expected(one()), beforeRemove = changeCount();
  assert.equal((await request('DELETE', memberUrl, undefined, old)).status, 200);
  assert.equal(one(), undefined); assert.equal(changeCount(), beforeRemove + 1);
  assert.equal(repository.listMutationChangeSets(projectId, 1)[0].changes[0].type, 'workspace_membership_remove');
  report.cases.push({ name: 'correct exact row DELETE commits original removal and one original ChangeSet' });
  await rejectWithoutWrite('removed row cannot be removed again using old expectation', 'DELETE', memberUrl, undefined, old, 409);
  const absent = { workspaceId, viewId, absent: true }, beforeAdd = changeCount();
  assert.equal((await request('POST', membersUrl, { viewIds: [viewId], addedBy: 'agent' }, absent)).status, 200);
  assert.equal(one().addedBy, 'agent'); assert.equal(changeCount(), beforeAdd + 1);
  assert.equal(repository.listMutationChangeSets(projectId, 1)[0].changes[0].type, 'workspace_membership_add');
  report.cases.push({ name: 'exact absence POST commits original add and one original ChangeSet' });
  await rejectWithoutWrite('absence POST rejects existing member without new ChangeSet', 'POST', membersUrl, { viewIds: [viewId] }, absent, 409);
  await rejectWithoutWrite('old DELETE snapshot cannot remove later re-added same-key row', 'DELETE', memberUrl, undefined, old, 409);
  await rejectWithoutWrite('same timestamp wrong addedBy rejected', 'DELETE', memberUrl, undefined, { ...expected(one()), addedBy: 'import' }, 409);
  await rejectWithoutWrite('wrong timestamp rejected', 'DELETE', memberUrl, undefined, { ...expected(one()), addedAt: '2000-01-01T00:00:00.000Z' }, 409);

  for (const [label, method, url, body, condition] of [
    ['malformed URI', 'DELETE', memberUrl, undefined, '%E0%A4%A'],
    ['malformed JSON', 'DELETE', memberUrl, undefined, encodeURIComponent('{')],
    ['array header', 'DELETE', memberUrl, undefined, []],
    ['extra field', 'DELETE', memberUrl, undefined, { ...expected(one()), extra: true }],
    ['foreign Workspace', 'DELETE', memberUrl, undefined, { ...expected(one()), workspaceId: 'foreign' }],
    ['foreign View', 'DELETE', memberUrl, undefined, { ...expected(one()), viewId: 'foreign' }],
    ['invalid actor', 'DELETE', memberUrl, undefined, { ...expected(one()), addedBy: 'robot' }],
    ['false absence', 'POST', membersUrl, { viewIds: [viewId] }, { ...absent, absent: false }],
    ['multiple Views with single condition', 'POST', membersUrl, { viewIds: [viewId, viewId] }, absent],
    ['DELETE-shaped POST condition', 'POST', membersUrl, { viewIds: [viewId] }, expected(one())],
  ]) await rejectWithoutWrite(label, method, url, body, condition, 400);

  let before = snapshot();
  assert.equal((await request('POST', membersUrl, { viewIds: [viewId] })).status, 200);
  assert.deepEqual(snapshot(), before, 'original no-header repeated add stays idempotent');
  assert.equal((await request('DELETE', memberUrl)).status, 200);
  before = snapshot(); assert.equal((await request('DELETE', memberUrl)).status, 200); assert.deepEqual(snapshot(), before);
  assert.equal((await request('POST', membersUrl, { viewIds: [viewId], addedBy: 'user' })).status, 200);
  report.cases.push({ name: 'ordinary no-header add/remove and original absent/present idempotence preserved' });

  const producer = new module.MutationSafetyService(repository, new module.PresentationApplicationService(repository, repository));
  const originalMutation = repository.runCurationMutation.bind(repository);
  let race = false, raceSnapshot, racedRow, transactionBuilders = 0;
  repository.runCurationMutation = input => {
    if (typeof input === 'function') transactionBuilders++;
    if (race && typeof input === 'function') {
      race = false;
      producer.removeWorkspaceMember({ projectId, workspaceId, viewId, actorKind: 'web' });
      producer.addWorkspaceMember({ projectId, workspaceId, viewId, addedBy: 'run', actorKind: 'web' });
      racedRow = expected(one()); raceSnapshot = snapshot();
    }
    return originalMutation(input);
  };
  try {
    const beforeRace = expected(one()); race = true;
    const reply = await request('DELETE', memberUrl, undefined, beforeRace);
    assert.equal(reply.status, 409, JSON.stringify(reply)); assert.ok(transactionBuilders >= 1);
    assert.equal(one().addedBy, 'run'); assert.deepEqual(expected(one()), racedRow);
    assert.deepEqual(snapshot(), raceSnapshot, 'after competing real commits, rejected target causes zero additional writes');
    report.cases.push({ name: 'actual producer delete/re-add immediately before original BEGIN: in-transaction comparison rejects stale DELETE',
      before: beforeRace, competingRow: racedRow, targetStatus: reply.status, targetWrites: 0 });

    // Start absent; a competing real add wins before the target transaction.
    producer.removeWorkspaceMember({ projectId, workspaceId, viewId, actorKind: 'web' });
    race = true;
    const addRace = await request('POST', membersUrl, { viewIds: [viewId], addedBy: 'agent' }, absent);
    assert.equal(addRace.status, 409, JSON.stringify(addRace)); assert.equal(one().addedBy, 'run');
    assert.deepEqual(snapshot(), raceSnapshot, 'existing winner not replaced and no target ChangeSet');
    report.cases.push({ name: 'competing actual add before original BEGIN beats conditional absence POST', targetStatus: 409, targetWrites: 0 });
  } finally { repository.runCurationMutation = originalMutation; }

  // Force the existing ChangeSet write to fail after membership mutation. The
  // original repository must roll back both writes, including the member row.
  const originalCreate = repository.createMutationChangeSet.bind(repository), beforeRollback = snapshot();
  let sawOriginalChangeSet = false;
  repository.createMutationChangeSet = (...args) => { sawOriginalChangeSet = true; throw new Error('Synthetic original ChangeSet persistence failure'); };
  try {
    const failed = await request('DELETE', memberUrl, undefined, expected(one()));
    assert.equal(failed.status, 409, JSON.stringify(failed)); assert.equal(sawOriginalChangeSet, true);
    assert.deepEqual(snapshot(), beforeRollback, 'original rollback restores exact membership, graph, ChangeSets and Presentations');
  } finally { repository.createMutationChangeSet = originalCreate; }
  report.cases.push({ name: 'original ChangeSet persistence error rolls back actual membership transaction', writes: 0 });
  report.finalMembers = repository.listProjectWorkspaceMemberships(projectId);
  report.originalTransactionBuildersObserved = transactionBuilders;
  report.passed = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await facade?.close(); globalThis.fetch = originalFetch;
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  const target = path.resolve(temp);
  if (!target.startsWith(path.resolve(runtimeRoot) + path.sep)) throw new Error('Unexpected isolated runtime directory.');
  await fs.rm(target, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, evidence, ...(report.error ? { error: report.error } : {}) }, null, 2));
}
