import { describe, expect, it, vi } from 'vitest';

import { DropCommitRouter, type DropCommitOwners } from './dropCommitRouter';
import { resolveDropIntent } from './dropIntentResolver';
import { canCommitDropRelease } from './dropReleaseConsistency';

import type { DropRailwayNewViewIntent, DropTargetCandidate } from './dropTypes';

const target: DropTargetCandidate = { targetId: 'new:p', enabled: true,
  semantic: { kind: 'railway-new-view', projectId: 'p', sourceCanvasId: 'main-canvas', surface: 'main' } };
const material = { entityType: 'artifact', entityId: 'a', artifactViewId: 'v', revisionId: 'old-rev' };
const intent: DropRailwayNewViewIntent = { kind: 'railway-new-view', targetId: 'new:p', projectId: 'p',
  sourceCanvasId: 'main-canvas', surface: 'main', sourceRefs: [{ kind: 'artifactView', id: 'v' }],
  capturedRevisionIdsBySource: { v: 'old-rev' } };

describe('Rail new View interaction', () => {
  it('captures material identities/revisions and selected groups instead of rejecting ordinary material', () => {
    expect(resolveDropIntent({ kind: 'object', ...material }, target)).toEqual({ status: 'ready', intent });
    expect(resolveDropIntent({ kind: 'objects', objects: [material, { entityType: 'note', entityId: 'n' }, material] }, target))
      .toMatchObject({ status: 'ready', intent: { sourceRefs: [{ kind: 'artifactView', id: 'v' }, { kind: 'note', id: 'n' }] } });
  });
  it('retains T2 admission: existing aggregate spaces are pinned as themselves', () => {
    expect(resolveDropIntent({ kind: 'object', entityType: 'collection', entityId: 'col' }, target))
      .toMatchObject({ status: 'ready', intent: { kind: 'railway-bookmark', refs: [{ kind: 'spatial', entityType: 'collection', entityId: 'col' }] } });
  });
  it('stages genuine native text at its original carrier before both new View and conversation owners', () => {
    const native = { entityType: 'native-text', entityId: 'native-note', nativeText: { nodeType: 'note' as const, body: '' } };
    expect(resolveDropIntent({ kind: 'objects', objects: [material, native] }, target)).toMatchObject({ status: 'ready', intent: {
      kind: 'prepare-material', target, objects: [material, native],
    } });
    expect(resolveDropIntent({ kind: 'object', ...native }, { targetId: 'conversation', enabled: true,
      semantic: { kind: 'collaboration-reference', conversationId: 'c' } })).toMatchObject({ status: 'ready', intent: {
        kind: 'prepare-material', objects: [{ kind: 'object', ...native }],
      } });
  });
  it('does not silently create from a supported subset or conflicting revisions', () => {
    expect(resolveDropIntent({ kind: 'objects', objects: [material, { entityType: 'conversation', entityId: 'c' }] }, target).status).toBe('ineligible');
    expect(resolveDropIntent({ kind: 'objects', objects: [material, { ...material, revisionId: 'new-rev' }] }, target).status).toBe('ineligible');
    expect(resolveDropIntent({ kind: 'file', name: 'not-yet-imported.png' }, target).status).toBe('ineligible');
  });
  it('release cannot silently follow a changed source canvas', () => {
    const payload = { kind: 'object' as const, ...material };
    const state = { status: 'preview' as const, payload, carryAnchor: 'left' as const,
      destination: { targetId: intent.targetId, previewPoint: { x: 2, y: 2 } } };
    const before = { state, resolution: { status: 'ready' as const, intent } };
    const after = { state, resolution: { status: 'ready' as const, intent: { ...intent, sourceCanvasId: 'other' } } };
    expect(canCommitDropRelease(before, after)).toBe(false);
  });
  it('commits once and reports only the actual saved content plus Rail entry', async () => {
    const create = vi.fn().mockResolvedValue({ status: 'created', workspaceId: 'w', scopeId: 's', name: '现场 1', canvasId: 'new-canvas',
      applyReceipt: { schemaVersion: 1, projectId: 'p', allApplied: true, results: [{ sourceRef: intent.sourceRefs[0], status: 'applied', channel: 'workspace-membership' }] },
      railwaySnapshot: { projectId: 'p', order: { orderedRefs: [{ kind: 'worksite', projectId: 'p', worksiteId: 'w' }] } } });
    const owners: DropCommitOwners = { projectId: 'p', createRailwayView: create, applyAssembly: vi.fn(), addComposerReference: vi.fn() };
    const router = new DropCommitRouter();
    expect((await router.commit(intent, 'op', owners)).status).toBe('success');
    await router.commit(intent, 'op', owners);
    expect(create).toHaveBeenCalledTimes(1);
    create.mockResolvedValue({ status: 'partial', workspaceId: 'w2', scopeId: 's2', name: '现场 2', message: '画布连接待恢复' });
    expect(await router.commit(intent, 'op2', owners)).toMatchObject({ status: 'partial', message: '画布连接待恢复' });
  });
});
