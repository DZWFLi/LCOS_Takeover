import { expect, it } from 'vitest';

import { workflowCardDropPayload } from './workflowCardPayload';
import { resolveDropIntent } from '../../drop/dropIntentResolver';

import type { WorkflowHandCard } from './WorkflowCardPool';

const card: WorkflowHandCard = { cardId: 'workflow:wf', entityType: 'workflow', entityId: 'wf', title: '方法现场',
  source: 'warehouse', lane: 'task', conversationReceiver: false, meta: '工作流', previewFacts: [],
  assemblySourceRef: { kind: 'workflow', id: 'wf' }, workspaceTargetRef: { kind: 'workflow', entityRef: { type: 'workflow', id: 'wf' } } };

it('uses the same Scope payload as Railway and the existing semantic drop consumer', () => {
  const payload = workflowCardDropPayload(card, 'p');
  expect(payload).toMatchObject({ kind: 'assembly', itemId: 'wf', sourceRef: { kind: 'workflow', id: 'wf' },
    entityRef: { type: 'scope', id: 'wf' }, reference: { entityType: 'scope', entityId: 'wf', displayLabel: '方法现场' } });
  if (!payload) throw new Error('Missing payload');
  expect(resolveDropIntent(payload, { targetId: 'railway', kind: 'railway-bookmark', label: '导航', priority: 1,
    enabled: true, rect: { left: 0, top: 0, width: 100, height: 100 }, semantic: { kind: 'railway-bookmark', projectId: 'p' } })).toMatchObject({
    status: 'ready', intent: { kind: 'railway-bookmark', refs: [{ kind: 'spatial', entityType: 'scope', entityId: 'wf' }] },
  });
});

it('does not relabel an Artifact or unrelated carrier as canonical Scope merely because the card looks like Workflow', () => {
  expect(workflowCardDropPayload({ ...card, entityType: 'artifact' }, 'p')).toBeUndefined();
  expect(workflowCardDropPayload({ ...card, assemblySourceRef: { kind: 'workflow', id: 'other' } }, 'p')).toBeUndefined();
});
