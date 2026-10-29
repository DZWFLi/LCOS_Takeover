import { describe, expect, it } from 'vitest';

import { resolveWorkflowCardEntry, toWorkflowHandCards, workflowComposerTarget } from './WorkflowCardPool';
import { isWorkflowCardItem, isWorkflowMaterialItem, isWorkflowReceiverItem } from './workflowCardSemantics';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';

function item(kind: WarehouseItemV1['kind']): WarehouseItemV1 {
  return {
    schemaVersion: 1,
    entityRef: { type: kind, id: `${kind}-1` },
    kind,
    title: kind,
    usageCount: 0,
  };
}

function workspace(id: string, scopeId: string, canvasId?: string): Workspace {
  return {
    id: id as Workspace['id'],
    projectId: 'project-1' as Workspace['projectId'],
    scopeId: scopeId as Workspace['scopeId'],
    name: id,
    intent: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    focusedViewIds: [],
    visibleLayers: ['core'],
    contextPolicy: 'selection-only',
    ...(canvasId === undefined ? {} : { canvasId }),
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

const actionAnchor = { x: 48, y: 64, width: 120, height: 36 };

describe('Workflow card pool UX semantics', () => {
  it('reserves TaskCard semantics for workflow while separating material and receiver lanes', () => {
    expect(isWorkflowCardItem(item('workflow'))).toBe(true);
    expect(isWorkflowCardItem(item('artifact'))).toBe(false);
    expect(isWorkflowCardItem(item('conversation'))).toBe(false);
    expect(isWorkflowCardItem(item('scene'))).toBe(false);
    expect(isWorkflowMaterialItem(item('artifact'))).toBe(true);
    expect(isWorkflowMaterialItem(item('context'))).toBe(true);
    expect(isWorkflowReceiverItem(item('conversation'))).toBe(true);
  });

  it('keeps only workflows even when the warehouse contains material and receivers', () => {
    const cards = toWorkflowHandCards([item('workflow'), item('artifact'), item('conversation'), item('context')]);
    expect(cards.map(card => card.entityType)).toEqual(['workflow']);
    const card = cards[0]!;
    expect(workflowComposerTarget(card, 'workspace-workflow', actionAnchor).receiverBlockedReason).toContain('Glyth');
    expect(workflowComposerTarget(card, 'workspace-workflow', actionAnchor, 'current-session').receiverConversationId).toBe('current-session');
  });

  it('surfaces only real warehouse provenance and usage facts in the preview model', () => {
    const source = {
      ...item('workflow'),
      updatedAt: '2026-09-28T10:00:00.000Z',
      usageCount: 3,
      provenance: { origin: 'run-return' as const, birthRunId: 'run-1' },
      relationHint: { neighborCount: 2, topKinds: ['artifact'] },
    };
    expect(toWorkflowHandCards([source])[0]?.previewFacts).toEqual([
      '来源：运行结果', '项目内已使用 3 次', '最近更新：2026-09-28T10:00:00.000Z', '关联 2 项',
    ]);
    expect(toWorkflowHandCards([item('workflow')])[0]?.previewFacts).toEqual([]);
  });

  it('enters only the single exact workflow scope target and never resolves skills or titles as workspaces', () => {
    const workflow = toWorkflowHandCards([item('workflow')])[0]!;
    expect(resolveWorkflowCardEntry(workflow, [workspace('workspace-1', 'workflow-1', 'canvas-1')])).toMatchObject({
      status: 'ready',
      targetSurface: 'workflow',
      targetWorkspace: { id: 'workspace-1', canvasId: 'canvas-1' },
    });
    expect(resolveWorkflowCardEntry(workflow, [])).toMatchObject({ status: 'unavailable', code: 'target_missing' });
    expect(resolveWorkflowCardEntry(workflow, [workspace('workspace-1', 'workflow-1')])).toMatchObject({ status: 'unavailable', code: 'canvas_missing' });
    expect(resolveWorkflowCardEntry(workflow, [
      workspace('workspace-1', 'workflow-1', 'canvas-1'),
      workspace('workspace-2', 'workflow-1', 'canvas-2'),
    ])).toMatchObject({ status: 'unavailable', code: 'target_ambiguous' });
    expect(resolveWorkflowCardEntry(workflow, [
      workspace('missing', 'workflow-1'),
      workspace('ready', 'workflow-1', 'ready-canvas'),
    ])).toMatchObject({ status: 'ready', targetWorkspace: { id: 'ready', canvasId: 'ready-canvas' } });

  });
});

it('preserves a canonical artifact ref on a workflow projection instead of replacing it with the visual kind', () => {
  const original = { ...item('workflow'), entityRef: { type: 'artifact', id: 'source-workflow' } } as WarehouseItemV1;
  const card = toWorkflowHandCards([original])[0]!;
  expect(card.entityType).toBe('artifact');
  expect(card.entityId).toBe('source-workflow');
  expect(card.workspaceTargetRef?.kind).toBe('workflow');
  expect(workflowComposerTarget(card, null, actionAnchor).nodeId).toBe('artifact:source-workflow');
});
