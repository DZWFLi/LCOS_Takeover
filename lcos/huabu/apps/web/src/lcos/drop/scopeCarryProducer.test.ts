import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { expect, it } from 'vitest';

import { resolveDropIntent } from './dropIntentResolver';
import { sameCanvasDropNode, snapshotCanvasDropNodes } from './nativeCanvasDropGeometry';
import { railwayAggregatePayload } from './railwayAssemblyDrop';
import { workflowCardDropPayload } from '../surfaces/workflow/workflowCardPayload';

import type { DropTargetCandidate } from './dropTypes';
import type { NativeDropRef } from './nativeCanvasDropGeometry';
import type { DropPayload } from '@local-creative-os/web-gen2';

const node = { id: 'node', type: 'text', data: {}, position: { x: 40, y: 20 } };
const composer: DropTargetCandidate = { targetId: 'composer', enabled: true,
  semantic: { kind: 'composer-reference', intent: 'continue', inputKey: 'original-input' } };
const receiver: DropTargetCandidate = { targetId: 'glyth', enabled: true,
  semantic: { kind: 'collaboration-reference', conversationId: 'connected' } };
const collection: DropTargetCandidate = { targetId: 'collection', enabled: true,
  semantic: { kind: 'collection-membership', collectionId: 'target-collection' } };
const portal: DropTargetCandidate = { targetId: 'portal', enabled: true,
  semantic: { kind: 'portal-receive', targetRef: { kind: 'workspace', id: 'destination' },
    destinationRef: { kind: 'worksite', projectId: 'p', worksiteId: 'destination' }, canvasId: 'destination-canvas' } };

function captured(kind: 'context' | 'workflow', overrides: Partial<NativeDropRef> = {}) {
  const ref: NativeDropRef = { entityType: 'scope', entityId: 'scope',
    descriptor: describeProjectedEntity({ entityType: 'scope', entityId: 'scope', title: 'A misleading scene label', sourceKind: kind }),
    ...overrides };
  const snapshot = snapshotCanvasDropNodes(['node'], [node], new Map([['node', ref]]))[0];
  if (!snapshot?.reference) throw new Error('Missing captured reference');
  return { snapshot, payload: { kind: 'objects', objects: [snapshot.reference] } satisfies DropPayload };
}

for (const kind of ['context', 'workflow'] as const) it(`keeps the exact ${kind} source through the real canvas snapshot and the Rail receiver path`, () => {
  const { payload } = captured(kind);
  const rail = railwayAggregatePayload({ projectId: 'p', sourceRef: { kind, id: 'scope' },
    entityRef: { type: 'scope', id: 'scope' }, label: 'Different title', available: true }, 'p');
  if (!rail) throw new Error('Missing Rail payload');
  const expected = { status: 'ready', intent: { kind: 'assembly-apply', targetRef: { kind: 'conversation', id: 'connected' },
    sourceRefs: [{ kind, id: 'scope' }] } };
  expect(resolveDropIntent(payload, receiver)).toMatchObject(expected);
  expect(resolveDropIntent(rail, receiver)).toMatchObject(expected);
  for (const producer of [payload, rail]) {
    expect(resolveDropIntent(producer, collection)).toMatchObject({ status: 'ready',
      intent: { kind: 'collection-membership', memberRef: { type: 'scope', id: 'scope' } } });
    // Restoring aggregate identity does not broaden Portal's admitted material types.
    expect(resolveDropIntent(producer, portal).status).toBe('ineligible');
  }
});

it('gives the same Workflow method intent from canvas, Rail and real hand-card producers', () => {
  const canvas = captured('workflow').payload;
  const rail = railwayAggregatePayload({ projectId: 'p', sourceRef: { kind: 'workflow', id: 'scope' },
    entityRef: { type: 'scope', id: 'scope' }, label: 'Rail title', available: true }, 'p');
  const card = workflowCardDropPayload({ cardId: 'card', entityType: 'workflow', entityId: 'scope', title: 'Card title',
    meta: '', source: 'warehouse', lane: 'task', conversationReceiver: false, previewFacts: [],
    assemblySourceRef: { kind: 'workflow', id: 'scope' },
    workspaceTargetRef: { kind: 'workflow', entityRef: { type: 'workflow', id: 'scope' } } }, 'p');
  for (const payload of [canvas, rail, card]) {
    if (!payload) throw new Error('Missing producer payload');
    expect(resolveDropIntent(payload, composer)).toMatchObject({ status: 'ready', intent: {
      kind: 'composer-reference', sourceRef: { kind: 'workflow', id: 'scope' },
      reference: { entityType: 'scope', entityId: 'scope' }, inputKey: 'original-input', intent: 'continue' } });
    expect(resolveDropIntent(payload, receiver)).toMatchObject({ status: 'ready', intent: {
      kind: 'assembly-apply', targetRef: { kind: 'conversation', id: 'connected' },
      sourceRefs: [{ kind: 'workflow', id: 'scope' }] } });
    expect(resolveDropIntent(payload, collection)).toMatchObject({ status: 'ready', intent: {
      kind: 'collection-membership', memberRef: { type: 'scope', id: 'scope' } } });
    expect(resolveDropIntent(payload, portal).status).toBe('ineligible');
  }
});

it('does not infer Scope category from a title, species or mismatched descriptor identity', () => {
  for (const descriptor of [undefined,
    describeProjectedEntity({ entityType: 'scope', entityId: 'other', title: 'Workflow', sourceKind: 'workflow' }),
    describeProjectedEntity({ entityType: 'artifact', entityId: 'scope', title: 'Workflow', sourceKind: 'workflow' }),
    describeProjectedEntity({ entityType: 'scope', entityId: 'scope', title: 'Workflow', sourceKind: 'collection' })]) {
    const { payload, snapshot } = captured('workflow', { descriptor });
    expect(snapshot.reference?.sourceRef).toBeUndefined();
    expect(resolveDropIntent(payload, receiver).status).toBe('ineligible');
    expect(resolveDropIntent(payload, composer).status).toBe('ineligible');
  }
});

it('keeps Context and canonical Collection membership distinct from Workflow method and legacy Scope Apply', () => {
  expect(resolveDropIntent(captured('context').payload, composer).status).toBe('ineligible');
  const railCollection = railwayAggregatePayload({ projectId: 'p', sourceRef: { kind: 'collection', id: 'canonical' },
    entityRef: { type: 'collection', id: 'canonical' }, label: 'Workflow', available: true }, 'p');
  if (!railCollection) throw new Error('Missing canonical Collection');
  const canvasCollection: DropPayload = { kind: 'objects', objects: [{ entityType: 'collection', entityId: 'canonical' }] };
  for (const payload of [canvasCollection, railCollection]) {
    expect(resolveDropIntent(payload, receiver).status).toBe('ineligible');
    expect(resolveDropIntent(payload, composer).status).toBe('ineligible');
    expect(resolveDropIntent(payload, collection)).toMatchObject({ status: 'ready',
      intent: { memberRef: { type: 'collection', id: 'canonical' } } });
  }
});

it('rejects a mismatched sourceRef before accepting even canonical membership or a bookmark', () => {
  const payload: DropPayload = { kind: 'objects', objects: [{ entityType: 'scope', entityId: 'scope',
    sourceRef: { kind: 'workflow', id: 'different' } }] };
  for (const target of [composer, receiver, collection, portal, { targetId: 'bookmark', enabled: true,
    semantic: { kind: 'railway-bookmark', projectId: 'p' } } satisfies DropTargetCandidate])
    expect(resolveDropIntent(payload, target).status).toBe('ineligible');
});

it('notices a source category rebind and keeps the earlier snapshot unchanged', () => {
  const before = captured('workflow').snapshot;
  const after = captured('context').snapshot;
  expect(sameCanvasDropNode(before, after)).toBe(false);
  expect(before.reference?.sourceRef).toEqual({ kind: 'workflow', id: 'scope' });
  expect(before.position).toEqual(node.position);
});

it('rejects mixed or multiple Workflow method selections instead of dropping later references', () => {
  const reference = captured('workflow').snapshot.reference;
  if (!reference) throw new Error('Missing reference');
  for (const other of [{ entityType: 'artifact', entityId: 'material', artifactViewId: 'view' },
    { entityType: 'scope', entityId: 'second', sourceRef: { kind: 'workflow' as const, id: 'second' } }]) {
    expect(resolveDropIntent({ kind: 'objects', objects: [reference, other] }, composer)).toMatchObject({
      status: 'ineligible', reason: expect.stringContaining('整组选中对象未加入输入') });
  }
  expect(resolveDropIntent({ kind: 'objects', objects: [reference, reference] }, composer)).toMatchObject({
    status: 'ready', intent: { sourceRef: { kind: 'workflow', id: 'scope' } } });
});
