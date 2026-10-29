import { railwayStableKeyV1 } from '@local-creative-os/contracts';
import { expect, it } from 'vitest';

import { railwaySpatialProjection } from './railwaySpatialProjection';

import type { RailwayDestinationV1, RailwaySnapshotV1 } from '@local-creative-os/contracts';


function worksite(id: string): RailwayDestinationV1 {
  const ref = { kind: 'worksite' as const, projectId: 'p', worksiteId: id };
  return { key: railwayStableKeyV1(ref), ref, role: 'worksite', label: id,
    workspaceId: id, surface: 'context', canvasId: `canvas-${id}`, available: true, accepts: [] };
}
function snapshot(destinations: RailwayDestinationV1[], candidates: RailwayDestinationV1[]): RailwaySnapshotV1 {
  return { schemaVersion: 1, migrationRequired: false, projectId: 'p', destinations, candidates, order: { schemaVersion: 1,
    projectId: 'p', orderedRefs: destinations.map(item => item.ref), version: 1, updatedAt: 'now' } };
}

it('exposes concrete existing workspaces without requiring them to be pinned first', () => {
  const fixed = worksite('fixed'); const child = worksite('child');
  const input = snapshot([fixed], [child]);
  expect(railwaySpatialProjection(input, 'p')).toEqual([fixed, child]);
  expect(input.order.orderedRefs).toEqual([fixed.ref]);
});
it('keeps canonical order and does not duplicate an already visible workspace', () => {
  const a = worksite('a'); const b = worksite('b');
  expect(railwaySpatialProjection(snapshot([b, a], [{ ...b, label: 'old' }]), 'p')).toEqual([b, a]);
});
function spatial(entityType: 'scope' | 'collection', id: string): RailwayDestinationV1 {
  const ref = { kind:'spatial' as const,projectId:'p',entityType,entityId:id };
  return { key:railwayStableKeyV1(ref),ref,role:'spatial',label:id,available:true,accepts:[] };
}
function receiver(id: string): RailwayDestinationV1 {
  const ref = { kind:'receiver_conversation' as const,projectId:'p',connectedConversationId:id };
  return { key:railwayStableKeyV1(ref),ref,role:'receiver',label:id,available:true,accepts:[] };
}
it('leaves Surface switching to its Dock and requires explicit pinning of real Scope and Collection refs', () => {
  const child = worksite('child');
  const rootRef = { kind: 'surface_root' as const, projectId: 'p', surface: 'main' as const };
  const root: RailwayDestinationV1 = { key: railwayStableKeyV1(rootRef), ref: rootRef,
    role: 'surface', label: 'Main', surface: 'main', canvasId: 'root', available: true, accepts: [] };
  const collection=spatial('collection','real-collection');const context=spatial('scope','context-block');
  const workflow=spatial('scope','workflow-block');
  const input=snapshot([root],[child,collection,context,workflow]);
  expect(railwaySpatialProjection(input,'p')).toEqual([child]);
  expect(input.order.orderedRefs).toEqual([root.ref]);
  const pinned=snapshot([workflow,collection,context],[child,collection,context,workflow]);
  expect(railwaySpatialProjection(pinned,'p')).toEqual([workflow,collection,context,child]);
  expect(pinned.order.orderedRefs).toEqual([workflow.ref,collection.ref,context.ref]);
});
it('automatically exposes existing conversations while preserving stored identity/order and unavailable spatial entries',()=>{
  const chat=receiver('connected-chat');const fixed={...spatial('collection','fixed'),available:false,reason:'原材料暂不可读'};
  const input=snapshot([fixed],[chat,chat,spatial('collection','unpinned')]);
  expect(railwaySpatialProjection(input,'p')).toEqual([fixed,chat]);
  expect(input.order.orderedRefs).toEqual([fixed.ref]);
  expect(railwaySpatialProjection(snapshot([chat],[{...chat,label:'candidate old'}]),'p')).toEqual([chat]);
});
it('does not lift foreign, unavailable, key-corrupt or mismatched workspace/conversation candidates', () => {
  const child=worksite('child');const chat=receiver('chat');
  const foreignRef={...child.ref,projectId:'foreign'};
  expect(railwaySpatialProjection(snapshot([], [
    {...child,workspaceId:'other'}, {...child,key:'wrong-key'}, {...child,available:false}, {...child,canvasId:undefined},
    {...child,key:railwayStableKeyV1(foreignRef),ref:foreignRef}, {...chat,key:'wrong-chat'}, {...chat,available:false},
    {...chat,role:'spatial'}, receiver(''),
  ]),'p')).toEqual([]);
  expect(railwaySpatialProjection(snapshot([worksite('local')],[child]),'other-project')).toEqual([]);
  expect(railwaySpatialProjection(snapshot([{...child,key:railwayStableKeyV1(foreignRef),ref:foreignRef}],[]),'p')).toEqual([]);
});
