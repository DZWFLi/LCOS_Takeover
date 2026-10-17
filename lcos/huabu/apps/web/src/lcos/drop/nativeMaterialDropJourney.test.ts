import { expect, it, vi } from 'vitest';

import { DropCommitRouter } from './dropCommitRouter';
import { resolveDropIntent } from './dropIntentResolver';
import { DropTargetRegistry } from './dropTargetRegistry';
import { snapshotCanvasDropNodes } from './nativeCanvasDropGeometry';
import { resolveNativeMaterialSources } from './resolveNativeMaterialSources';
import { navigationGraph } from '../navigation/navigationFixtures';

import type { DropCommitOwners } from './dropCommitRouter';
import type { DropIntent, DropTargetCandidate, DropTargetSemantic } from './dropTypes';
import type { NativeDropRef } from './nativeCanvasDropGeometry';
import type { NativeMaterialSourcePorts } from './resolveNativeMaterialSources';
import type { AssemblyApplyResultV1, RailwayReceiveOutcomeV1 } from '@local-creative-os/contracts';
import type { Node } from '@xyflow/react';

function journey(semantic: DropTargetSemantic) {
  const events: string[] = [];
  const nodes: Node[] = [
    { id: 'text', type: 'note', position: { x: 20, y: 40 }, data: { content: '', label: '决策' } },
    { id:'image',type:'image',position:{x:100,y:80},style:{width:300,height:200},data:{src:'original.png'} },
    { id: 'old', type: 'text', position: { x: 0, y: 0 }, data: {} },
  ];
  const refs = new Map<string, NativeDropRef>([['old', { entityType: 'artifact', entityId: 'historical-artifact',
    artifactViewId: 'historical-view', revisionId: 'historical-revision', mode: 'summary', mimeType: 'text/markdown' }]]);
  const graph = navigationGraph({ scopes: [{ id: 'root', kind: 'root' }],
    workspaces: [{ id: 'source-site', projectId: 'p', scopeId: 'root', canvasId: 'source', focusedViewIds: [] }],
    artifacts: [{ id: 'image-artifact', projectId: 'p', kind: 'image', currentRevisionId: 'image-revision' }],
    artifactRevisions: [{ id: 'image-revision', artifactId: 'image-artifact', fileRecordId: 'image-file', status: 'current' }],
    artifactViews: [{ id: 'image-view', artifactId: 'image-artifact', scopeId: 'root', revisionId: 'image-revision', referenceKind: 'primary' }],
  });
  const artifact = graph.artifacts[0], revision = graph.artifactRevisions[0], view = graph.artifactViews[0];
  if (!artifact || !revision || !view) throw new Error('Serialized image fixture missing.');
  const sourcePorts: NativeMaterialSourcePorts = {
    readCurrent: () => ({ projectId: 'p', canvasId: 'source', nodes, refs }),
    readBindings: vi.fn(async () => []), readProjectGraph: vi.fn(async () => graph),
    readImage: vi.fn(async () => { events.push('bytes'); return new File(['native-image'], 'original.png', { type: 'image/png' }); }),
    claimText: vi.fn(async sent => {
      events.push('claim'); refs.set(sent.nodeId, { entityType: 'artifact', entityId: 'text-artifact' });
      return { ...sent, spatialId: sent.nodeId, artifactId: 'text-artifact', viewId: 'text-view', revisionId: 'text-revision', fileRecordId: 'text-file', title: '文本' };
    }),
    importImage:vi.fn(async()=>{events.push('import');return {artifact,revision,view,reused:false,
      binding:{projectId:'p',canvasId:'source',spatialKind:'node' as const,spatialId:'image',entityType:'artifact' as const,entityId:String(artifact.id)}};}),
  };
  const registry = new DropTargetRegistry();
  const target = { targetId: 'receiver', enabled: true, semantic };
  const register = (candidate: DropTargetCandidate) => registry.register({ ...candidate, kind: 'canvas', label: 'same display name',
    rect: { left: 0, top: 0, width: 100, height: 100 }, priority: 1 });
  register(target);
  const objects = snapshotCanvasDropNodes(nodes.map(node => node.id), nodes, refs, 'source')
    .flatMap(node => node.reference ? [node.reference] : []);
  const resolution = resolveDropIntent({ kind: 'objects', objects }, registry.get(target.targetId) ?? target);
  if (resolution.status !== 'ready' || resolution.intent.kind !== 'prepare-material') throw new Error('Production capture must stage material preparation.');
  const preparedIntent = resolution.intent;
  const assemblyResult = (intent: Extract<DropIntent, { kind: 'assembly-apply' }>): AssemblyApplyResultV1 => ({
    schemaVersion: 1, projectId: 'p', allApplied: true,
    results: intent.sourceRefs.map(sourceRef => ({ sourceRef, status: 'applied', channel: intent.targetRef.kind === 'conversation' ? 'relation'
      : intent.targetRef.kind === 'workspace' || intent.targetRef.kind === 'scene' ? 'workspace-membership' : 'presentation-membership' })),
  });
  const prepareMaterials = vi.fn<NonNullable<DropCommitOwners['prepareMaterials']>>(async (intent, signal) => {
    events.push('prepare'); return (await resolveNativeMaterialSources({ projectId: 'p', canvasId: 'source', objects: intent.objects }, sourcePorts, signal)).objects;
  });
  const applyAssembly = vi.fn<DropCommitOwners['applyAssembly']>(async intent => { events.push('assembly'); return assemblyResult(intent); });
  const addComposerReference = vi.fn<DropCommitOwners['addComposerReference']>(async () => { events.push('composer'); });
  const addCollectionMember = vi.fn<NonNullable<DropCommitOwners['addCollectionMember']>>(async intent => {
    events.push('collection'); return { collectionId: intent.collectionId, memberRef: intent.memberRef, status: 'applied' };
  });
  const receiveRailway = vi.fn<NonNullable<DropCommitOwners['receiveRailway']>>(async (intent, operationId): Promise<RailwayReceiveOutcomeV1> => {
    events.push('rail'); const ref = intent.railwayDestinationRef;
    if (!ref || ref.kind !== 'worksite') throw new Error('Fixture must use the exact canonical worksite.');
    return { status: 'committed', operationId, destination: { key: 'worksite:destination', ref, label: 'destination', role: 'worksite',
      available: true, canvasId: intent.railwayCanvasId, accepts: ['artifactView', 'note'] }, result: assemblyResult(intent), spatial: { status: 'not_required' } };
  });
  const createRailwayView = vi.fn<NonNullable<DropCommitOwners['createRailwayView']>>(async intent => {
    events.push('new-view'); return { status: 'created', workspaceId: 'created-site', scopeId: 'delivery', name: '新现场', canvasId: 'created-canvas',
      applyReceipt: { schemaVersion: 1, projectId: 'p', allApplied: true, results: intent.sourceRefs.map(sourceRef => ({ sourceRef, status: 'applied', channel: 'workspace-membership' })) },
      railwaySnapshot: { schemaVersion: 1, projectId: 'p', order: { schemaVersion: 1, projectId: 'p', version: 2, updatedAt: '',
        orderedRefs: [{ kind: 'worksite', projectId: 'p', worksiteId: 'created-site' }] }, candidates: [], destinations: [], migrationRequired: false } };
  });
  const owners: DropCommitOwners = { projectId: 'p', readTarget: id => registry.get(id), prepareMaterials,
    applyAssembly, addComposerReference, addCollectionMember, receiveRailway, createRailwayView };
  const router = new DropCommitRouter();
  const commit = () => router.commit(preparedIntent, 'same-gesture', owners);
  return { commit, preparedIntent, owners, router, registry, register, target, events, sourcePorts, prepareMaterials,
    applyAssembly, addComposerReference, addCollectionMember, receiveRailway, createRailwayView, nodes, objects };
}
const expectedSources = [{ kind: 'artifactView', id: 'text-view' }, { kind: 'artifactView', id: 'image-view' }, { kind: 'artifactView', id: 'historical-view' }];

it('prepares real Native snapshot sources once, then adds all canonical members through the Collection owner without claiming batch atomicity', async () => {
  const f = journey({ kind: 'collection-membership', collectionId: 'real-collection' });
  const [first, duplicate] = await Promise.all([f.commit(), f.commit()]);
  expect(first.status).toBe('success'); expect(duplicate).toBe(first);
  expect(f.prepareMaterials).toHaveBeenCalledTimes(1); expect(f.sourcePorts.claimText).toHaveBeenCalledTimes(1);
  expect(f.sourcePorts.importImage).toHaveBeenCalledTimes(1);
  expect(f.addCollectionMember.mock.calls.map(([intent]) => intent.memberRef)).toEqual([
    { type: 'artifact', id: 'text-artifact' }, { type: 'artifact', id: 'image-artifact' }, { type: 'artifact', id: 'historical-artifact' }]);
  expect(f.events).toEqual(['prepare', 'bytes', 'claim', 'import', 'collection', 'collection', 'collection']);
  expect(f.applyAssembly).not.toHaveBeenCalled();
});

it('keeps the same exact historical revision/mode in the Composer reference draft after Native preparation', async () => {
  const f = journey({ kind: 'composer-reference', inputKey: 'existing-draft', intent: 'continue' });
  expect((await f.commit()).status).toBe('success');
  const submitted = f.addComposerReference.mock.calls[0]?.[0];
  expect(submitted).toMatchObject({ inputKey: 'existing-draft', intent: 'continue', references: [
    { entityType: 'artifact', entityId: 'text-artifact', artifactViewId: 'text-view', revisionId: 'text-revision' },
    { entityType: 'artifact', entityId: 'image-artifact', artifactViewId: 'image-view', revisionId: 'image-revision', mimeType: 'image/png' },
    { entityType: 'artifact', entityId: 'historical-artifact', artifactViewId: 'historical-view', revisionId: 'historical-revision', mode: 'summary' },
  ] });
  expect(f.events.at(-1)).toBe('composer'); expect(f.applyAssembly).not.toHaveBeenCalled();
});

it('uses the exact durable Glyth, spatial, Canvas and Dock receiver after preparation, with one existing Assembly batch per gesture', async () => {
  const targets: readonly DropTargetSemantic[] = [
    { kind: 'collaboration-reference', conversationId: 'connected-glyth' },
    { kind: 'spatial-membership', targetRef: { kind: 'context', id: 'saved-context' } },
    { kind: 'canvas', targetRef: { kind: 'workspace', id: 'canvas-site' } },
    { kind: 'canvas', targetRef: { kind: 'main' } },
  ];
  for (const semantic of targets) {
    const f = journey(semantic); expect((await f.commit()).status).toBe('success');
    expect(f.applyAssembly).toHaveBeenCalledTimes(1);
    expect(f.applyAssembly.mock.calls[0]?.[0]).toMatchObject({ sourceRefs: expectedSources,
      targetRef: semantic.kind === 'collaboration-reference' ? { kind: 'conversation', id: 'connected-glyth' } : 'targetRef' in semantic ? semantic.targetRef : undefined });
    expect(f.events.at(-1)).toBe('assembly'); expect(f.addComposerReference).not.toHaveBeenCalled();
  }
});

it('uses the canonical Rail receive owner and original destination after source preparation', async () => {
  const destinationRef = { kind: 'worksite' as const, projectId: 'p', worksiteId: 'destination-site' };
  const f = journey({ kind: 'railway-receive', targetRef: { kind: 'workspace', id: 'destination-site' },
    destinationRef, canvasId: 'destination-canvas', orderVersion: 7, accepts: ['artifactView', 'note'] });
  expect((await f.commit()).status).toBe('success');
  expect(f.receiveRailway).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sourceRefs: expectedSources,
    railwayDestinationRef: destinationRef, railwayCanvasId: 'destination-canvas', railwayOrderVersion: 7 }), 'railway-receive:same-gesture', undefined);
  expect(f.applyAssembly).not.toHaveBeenCalled(); expect(f.events.at(-1)).toBe('rail');
});

it('creates a content-bearing New View from the prepared exact refs and frozen revisions through its existing owner', async () => {
  const f = journey({ kind: 'railway-new-view', projectId: 'p', sourceCanvasId: 'source', surface: 'main' });
  expect((await f.commit()).status).toBe('success');
  expect(f.createRailwayView.mock.calls[0]?.[0]).toMatchObject({ sourceRefs: expectedSources,
    capturedRevisionIdsBySource: { 'text-view': 'text-revision', 'image-view': 'image-revision', 'historical-view': 'historical-revision' } });
  expect(f.applyAssembly).not.toHaveBeenCalled(); expect(f.events.at(-1)).toBe('new-view');
});

it('checks the same live registration before preparation and after its await, never follows a renamed or replaced receiver', async () => {
  const before = journey({ kind: 'collection-membership', collectionId: 'original' });
  before.register({ ...before.target, semantic: { kind: 'collection-membership', collectionId: 'replacement' } });
  expect(await before.commit()).toMatchObject({ status: 'failed', message: '接收位置已变化，未登记或投递' });
  expect(before.prepareMaterials).not.toHaveBeenCalled(); expect(before.addCollectionMember).not.toHaveBeenCalled();
  for (const change of ['semantic', 'disabled', 'unmounted'] as const) {
    const after = journey({ kind: 'collection-membership', collectionId: 'original' });
    const prepare = after.owners.prepareMaterials;
    if (!prepare) throw new Error('Fixture preparation owner missing.');
    after.prepareMaterials.mockImplementationOnce(async (intent, signal) => {
      const objects = (await resolveNativeMaterialSources({ projectId: 'p', canvasId: 'source', objects: intent.objects }, after.sourcePorts, signal)).objects;
      if (change === 'unmounted') after.registry.unregister(after.target.targetId);
      else after.register({ ...after.target, enabled: change !== 'disabled', semantic: change === 'semantic'
        ? { kind: 'collection-membership', collectionId: 'replacement' } : after.target.semantic });
      return objects;
    });
    expect(await after.commit()).toMatchObject({ status: 'failed', message: '材料已接入项目，接收位置已变化；未投到别处' });
    expect(after.addCollectionMember).not.toHaveBeenCalled();
  }
});

it('keeps partial Collection receipts honest and does not repeat source preparation after a member failure', async () => {
  const f = journey({ kind: 'collection-membership', collectionId: 'real-collection' });
  f.addCollectionMember.mockImplementation(async intent => ({ collectionId: intent.collectionId, memberRef: intent.memberRef,
    status: intent.memberRef.id === 'image-artifact' ? 'not-member' : 'applied' }));
  const result = await f.commit();
  expect(result.status).toBe('partial');
  expect(result.collectionItems?.map(item => item.status)).toEqual(['success', 'failed', 'success']);
  expect(await f.commit()).toBe(result); expect(f.prepareMaterials).toHaveBeenCalledTimes(1);
});

it('preserves aggregate source kind during mixed material preparation, while true Collection never becomes legacy Scope Apply', async () => {
  const f = journey({ kind: 'canvas', targetRef: { kind: 'main' } });
  const context = { entityType: 'scope', entityId: 'context-source', sourceRef: { kind: 'context' as const, id: 'context-source' } };
  const resolution = resolveDropIntent({ kind: 'objects', objects: [context, ...f.objects] }, f.target);
  if (resolution.status !== 'ready') throw new Error(resolution.reason);
  expect((await f.router.commit(resolution.intent, 'mixed-context', f.owners)).status).toBe('success');
  expect(f.applyAssembly.mock.calls[0]?.[0].sourceRefs[0]).toEqual({ kind: 'context', id: 'context-source' });
  expect(resolveDropIntent({ kind: 'objects', objects: [{ entityType: 'collection', entityId: 'real-collection',
    sourceRef: { kind: 'collection', id: 'real-collection' } }, ...f.objects] }, f.target)).toMatchObject({ status: 'ineligible' });
});
