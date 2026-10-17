import { expect, it } from 'vitest';

import { planNativeCanvasLanding, snapshotCanvasDropNodes } from './nativeCanvasDropGeometry';

import type { DropCollectionMembershipIntent, DropCommitReceipt } from './dropTypes';
import type { NativeCanvasDropSource } from './nativeCanvasDrop';
import type { NativeDropRef } from './nativeCanvasDropGeometry';
import type { DropPayload } from '@local-creative-os/web-gen2';
import type { Node } from '@xyflow/react';

function fixture() {
  const scope = { projectId: 'p', canvasId: 'source' };
  const nodes: Node[] = [
    { id: 'image', type: 'image', position: { x: 10, y: 20 }, data: { src: 'actual.png' } },
    { id: 'text', type: 'note', position: { x: 30, y: 40 }, data: { content: '' } },
    { id: 'frame', type: 'frame', position: { x: 500, y: 500 }, data: { lcosCollectionId: 'collection' } },
  ];
  const refs = new Map<string, NativeDropRef>();
  const original = snapshotCanvasDropNodes(['image', 'text'], nodes, refs, 'source');
  const source: NativeCanvasDropSource = { scope, nodes: original, landing: { frameId: 'frame', framePosition: { x: 500, y: 500 },
    collectionId: 'collection', nodes: original.map(node => ({ ...node, absolutePosition: node.nodeId === 'image' ? { x: 600, y: 550 } : { x: 650, y: 600 } })) } };
  const prepared = new Map<string, Extract<DropPayload, { kind: 'objects' }>['objects'][number]>([
    ['image', { entityType: 'artifact', entityId: 'image-artifact', artifactViewId: 'image-view', revisionId: 'image-revision' }],
    ['text', { entityType: 'artifact', entityId: 'text-artifact', artifactViewId: 'text-view', revisionId: 'text-revision' }],
  ]);
  const intent: DropCollectionMembershipIntent = { kind: 'collection-membership', targetId: 'collection-body', collectionId: 'collection',
    memberRef: { type: 'artifact', id: 'image-artifact' }, memberRefs: [{ type: 'artifact', id: 'image-artifact' }, { type: 'artifact', id: 'text-artifact' }] };
  const receipt: DropCommitReceipt = { transactionId: 'gesture', targetId: 'collection-body', status: 'success', collectionItems: [
    { memberRef: { type: 'artifact', id: 'image-artifact' }, status: 'success', canonicalReceipt: { collectionId: 'collection', memberRef: { type: 'artifact', id: 'image-artifact' }, status: 'applied' } },
    { memberRef: { type: 'artifact', id: 'text-artifact' }, status: 'success', canonicalReceipt: { collectionId: 'collection', memberRef: { type: 'artifact', id: 'text-artifact' }, status: 'already-member' } },
  ] };
  const textClaim = prepared.get('text');
  if (!textClaim) throw new Error('Expected exact text claim fixture.');
  refs.set('text', textClaim);
  return { nodes, refs, source, prepared, intent, receipt, scope,
    plan: () => planNativeCanvasLanding(source, intent, receipt, scope, nodes, refs, new Set(), prepared) };
}

it('uses canonical receipt identities to land an unbound image and its exact adopted text without inventing an image binding', () => {
  const f = fixture();
  expect(f.plan()).toEqual({ skipped: false, items: [
    { nodeId: 'image', position: { x: 600, y: 550 } }, { nodeId: 'text', position: { x: 650, y: 600 } },
  ] });
  expect(f.refs.has('image')).toBe(false);
  expect(f.nodes[0]?.data.src).toBe('actual.png');
  expect(f.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  expect(f.nodes[1]?.data.content).toBe('');
});

it('refuses a foreign text identity, another View/revision or changed body even when the membership receipt was successful', () => {
  for (const change of ['artifact', 'view', 'revision', 'body'] as const) {
    const f = fixture();
    const own = f.prepared.get('text');
    if (!own) throw new Error('Text fixture missing.');
    if (change === 'body') {
      const node = f.nodes.find(candidate => candidate.id === 'text');
      if (!node) throw new Error('Text fixture node missing.');
      node.data = { ...node.data, content: 'new user body' };
    } else f.refs.set('text', { ...own, ...(change === 'artifact' ? { entityId: 'foreign-artifact' }
      : change === 'view' ? { artifactViewId: 'foreign-view' } : { revisionId: 'newer-revision' }) });
    expect(f.plan()).toEqual({ skipped: true, items: [{ nodeId: 'image', position: { x: 600, y: 550 } }] });
  }
});

it('keeps the raw image identity and byte address as the source authority instead of accepting any new bound artifact', () => {
  for (const change of ['src', 'bound'] as const) {
    const f = fixture();
    if (change === 'src') {
      const node = f.nodes.find(candidate => candidate.id === 'image');
      if (!node) throw new Error('Image fixture node missing.');
      node.data = { ...node.data, src: 'new-user-image.png' };
    } else {
      const prepared = f.prepared.get('image');
      if (!prepared) throw new Error('Image identity fixture missing.');
      f.refs.set('image', prepared);
    }
    expect(f.plan()).toEqual({ skipped: true, items: [{ nodeId: 'text', position: { x: 650, y: 600 } }] });
  }
});

it('does not overwrite changed source pose, dragging, lock or moved Collection frame after preparation', () => {
  for (const change of ['pose', 'dragging', 'locked', 'frame'] as const) {
    const f = fixture(); const node = f.nodes.find(candidate => candidate.id === (change === 'frame' ? 'frame' : 'text'));
    if (!node) throw new Error('Native fixture node missing.');
    if (change === 'pose' || change === 'frame') node.position = { ...node.position, x: node.position.x + 20 };
    if (change === 'dragging') node.dragging = true;
    if (change === 'locked') node.data = { ...node.data, locked: true };
    const plan = f.plan();
    expect(plan.skipped).toBe(true);
    expect(plan.items).toEqual(change === 'frame' ? [] : [{ nodeId: 'image', position: { x: 600, y: 550 } }]);
  }
});

it('places only individually confirmed members from a partial batch and never guesses a member from another receipt', () => {
  const f = fixture();
  const imageItem = f.receipt.collectionItems?.[0];
  if (!imageItem) throw new Error('Membership fixture missing.');
  const partial: DropCommitReceipt = { ...f.receipt, status: 'partial', collectionItems: [
    { ...imageItem, status: 'failed' },
    { memberRef: { type: 'artifact', id: 'text-artifact' }, status: 'success', canonicalReceipt: {
      collectionId: 'collection', memberRef: { type: 'artifact', id: 'text-artifact' }, status: 'applied' } },
  ] };
  expect(planNativeCanvasLanding(f.source, f.intent, partial, f.scope, f.nodes, f.refs, new Set(), f.prepared))
    .toEqual({ skipped: false, items: [{ nodeId: 'text', position: { x: 650, y: 600 } }] });
  const wrong: DropCommitReceipt = { ...partial, collectionItems: [{ ...imageItem, canonicalReceipt: {
    collectionId: 'other', memberRef: imageItem.memberRef, status: 'applied' } }] };
  expect(planNativeCanvasLanding(f.source, f.intent, wrong, f.scope, f.nodes, f.refs, new Set(), f.prepared).items).toEqual([]);
});
