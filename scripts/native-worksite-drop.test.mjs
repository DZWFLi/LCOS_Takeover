import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeParent = path.join(workspaceRoot, '.runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeParent, 'native-worksite-drop-'));
const runtimeRootResolved = path.resolve(runtimeRoot);

try {
  // One temporary entry ensures both the new adapter and its selected current
  // Gen2 pure owners are compiled into the same Node module graph.
  const testOwnersPath = path.join(runtimeRoot, 'owners.ts');
  await fs.writeFile(testOwnersPath, [
    "export { nativeWorksiteDropTarget } from '../../lab/pilot/native-worksite-drop.ts';",
    "export { buildSurfaceCanvasMap } from '../../lcos/huabu/apps/web/src/lcos/app/useLcosWorksite.ts';",
  ].join('\n'));
  const bundlePath = await buildPilotEntry(path.relative(workspaceRoot, testOwnersPath).replaceAll('\\', '/'),
    path.join(runtimeRoot, 'native-worksite-drop-owners.mjs'), 'browser');
  const provenance = JSON.parse(await fs.readFile(`${bundlePath}.sources.json`, 'utf8'));
  const selected = new Set(provenance.resources.map(resource => resource.resourcePath));
  for (const source of [
    'huabu/apps/web/src/lcos/app/useLcosWorksite.ts',
    'huabu/apps/web/src/lcos/drop/PortalDropWorkspaceContext.tsx',
    'huabu/apps/web/src/lcos/shell/surfaceDockDrop.ts',
  ]) assert.ok(selected.has(source), `bundle must use selected current owner ${source}`);
  const { nativeWorksiteDropTarget, buildSurfaceCanvasMap } = await import(pathToFileURL(bundlePath).href);

  const projectId = 'project-worksite-drop';
  const rootScopeId = 'scope-root';
  const rootScope = { id: rootScopeId, projectId, kind: 'root', parentScopeId: null, containerViewId: null };
  const workspace = (id, scopeId, preferredSurface, canvasId, ownerProjectId = projectId) => ({
    id, projectId: ownerProjectId, scopeId, preferredSurface, canvasId, name: id,
  });
  const rootWorkspaces = [
    workspace('root-main', rootScopeId, 'main', 'canvas-main'),
    workspace('root-context', rootScopeId, 'context', 'canvas-context'),
    workspace('root-workflow', rootScopeId, 'workflow', 'canvas-workflow'),
  ];
  const graph = (scopes, workspaces) => ({ schemaVersion: 1, project: { id: projectId }, scopes, workspaces });
  const rootsFrom = value => {
    if (value.project.id !== projectId || value.workspaces.some(row => row.projectId !== projectId)) return {};
    const roots = value.scopes.filter(scope => scope.kind === 'root' && scope.projectId === value.project.id);
    return roots.length === 1 ? buildSurfaceCanvasMap(value.workspaces, String(roots[0].id)) : {};
  };
  const contextFor = workspaces => ({ projectId, workspaces: workspaces.map(row => ({
    id: String(row.id), scopeId: String(row.scopeId), name: row.name,
    preferredSurface: row.preferredSurface, ...(row.canvasId === undefined ? {} : { canvasId: row.canvasId }),
  })) });
  const targetFor = (row, workspaces, surfaceCanvasId, context = contextFor(workspaces), overrides = {}) =>
    nativeWorksiteDropTarget({ projectId, canvasId: row.canvasId ?? null,
      activeSurface: row.preferredSurface, activeWorkspaceId: row.id,
      surfaceCanvasId, context, ...overrides });

  const threeSurfaceGraph = graph([rootScope], rootWorkspaces);
  const roots = rootsFrom(threeSurfaceGraph);
  assert.deepEqual(roots, { main: 'canvas-main', context: 'canvas-context', workflow: 'canvas-workflow' });
  assert.deepEqual(targetFor(rootWorkspaces[0], rootWorkspaces, roots), { kind: 'main' });
  assert.deepEqual(targetFor(rootWorkspaces[1], rootWorkspaces, roots), { kind: 'context', id: rootScopeId });
  assert.deepEqual(targetFor(rootWorkspaces[2], rootWorkspaces, roots), { kind: 'workflow', id: rootScopeId });

  const workflowChildren = [workspace('child-workflow-a', 'scope-workflow-a', 'workflow', 'canvas-child-a'),
    workspace('child-workflow-b', 'scope-workflow-b', 'workflow', 'canvas-child-b')];
  const rootAndChildren = [...rootWorkspaces, ...workflowChildren];
  const rootAndChildrenMap = rootsFrom(graph([rootScope, { id: 'scope-workflow-a', projectId, kind: 'workflow' },
    { id: 'scope-workflow-b', projectId, kind: 'workflow' }], rootAndChildren));
  assert.deepEqual(rootAndChildrenMap, roots, 'same-surface child workspaces must not pollute the root map');
  assert.deepEqual(targetFor(rootWorkspaces[2], rootAndChildren, rootAndChildrenMap), { kind: 'workflow', id: rootScopeId });
  for (const child of workflowChildren) {
    assert.deepEqual(targetFor(child, rootAndChildren, rootAndChildrenMap), { kind: 'workspace', id: child.id });
  }

  const onlyChild = workflowChildren[0];
  const onlyChildMap = rootsFrom(graph([rootScope, { id: onlyChild.scopeId, projectId, kind: 'workflow' }], [onlyChild]));
  assert.deepEqual(onlyChildMap, {});
  assert.equal(targetFor(onlyChild, [onlyChild], onlyChildMap), undefined,
    'a lone child with preferredSurface=workflow is not evidence of a root Workflow');

  const duplicateRootContext = [...rootWorkspaces, workspace('root-context-duplicate', rootScopeId, 'context', 'canvas-context-2')];
  const duplicateMap = rootsFrom(graph([rootScope], duplicateRootContext));
  assert.equal(duplicateMap.context, undefined, 'duplicate root candidates must not select the first row');
  assert.equal(targetFor(duplicateRootContext[1], duplicateRootContext, duplicateMap), undefined);
  assert.equal(targetFor(rootWorkspaces[1], rootWorkspaces, {}), undefined, 'missing root map stays unresolved');
  assert.equal(targetFor(rootWorkspaces[1], rootWorkspaces, roots, null), undefined, 'unready Portal context stays unresolved');
  assert.equal(targetFor(rootWorkspaces[1], rootWorkspaces, roots, contextFor(rootWorkspaces), { projectId: 'foreign-project' }), undefined);
  assert.equal(targetFor(rootWorkspaces[1], rootWorkspaces, roots, contextFor(rootWorkspaces), { activeWorkspaceId: 'other-workspace' }), undefined);

  const duplicateCanvas = [...rootWorkspaces, workspace('alias-context', 'scope-child', 'context', 'canvas-context')];
  assert.equal(targetFor(rootWorkspaces[1], duplicateCanvas, roots), undefined, 'duplicate Canvas bindings are ambiguous');
  const unknownSurface = workspace('unknown-child', 'scope-child', 'unknown', 'canvas-unknown');
  assert.equal(targetFor(unknownSurface, [...rootWorkspaces, unknownSurface], roots), undefined);
  const foreignRows = rootWorkspaces.map(row => ({ ...row, projectId: 'foreign-project' }));
  assert.deepEqual(rootsFrom(graph([rootScope], foreignRows)), {}, 'foreign workspace rows cannot enter the root map');
  assert.equal(targetFor(rootWorkspaces[1], foreignRows, roots, { projectId: 'foreign-project', workspaces: contextFor(foreignRows).workspaces }), undefined);

  console.log(`PASS: native worksite drop target resolver (current owners from ${currentGen2Root}; browser-target build imported in Node; no GUI/Core/provider)`);
} finally {
  const runtimeParentResolved = path.resolve(runtimeParent);
  if (path.dirname(runtimeRootResolved) !== runtimeParentResolved
    || !path.basename(runtimeRootResolved).startsWith('native-worksite-drop-')) {
    throw new Error('Refusing cleanup outside this test-owned runtime directory');
  }
  await fs.rm(runtimeRootResolved, { recursive: true, force: true });
}
