import { CoreProjectClient, HttpClient, describeProjectedEntity } from '@local-creative-os/web-gen2';
import { afterEach, expect, it, vi } from 'vitest';

import { DropCommitRouter } from './dropCommitRouter';
import { resolveDropIntent } from './dropIntentResolver';
import { snapshotCanvasDropNodes } from './nativeCanvasDropGeometry';
import { railwayAggregatePayload } from './railwayAssemblyDrop';
import { addWorkflowMethodDrop } from './workflowMethodDrop';
import { composerInputKey } from '../composer/composerInputJourney';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { takeWorkflowScopeMethodDraft } from '../surfaces/workflow/workflowMethodTake';

import type { DropCommitOwners } from './dropCommitRouter';
import type { DropComposerReferenceIntent } from './dropTypes';
import type { LcosComposerTarget } from '../shell/lcosShellStore';

const target: LcosComposerTarget = { nodeId: 'conversation:c', title: '现有会话', intent: 'continue', receiverConversationId: 'c',
  anchor: { x: 0, y: 0, width: 20, height: 20 } };
const graph = { project: { id: 'p' }, scopes: [{ id: 'wf', kind: 'workflow', name: '实际方法' }],
  artifactViews: [{ id: 'view-a', artifactId: 'a', revisionId: 'old' }],
  artifacts: [{ id: 'a', title: '材料', currentRevisionId: 'current' }],
  artifactRevisions: [{ id: 'old', artifactId: 'a', fileRecordId: 'f' }], fileRecords: [{ id: 'f', mimeType: 'text/markdown' }] };
const methods = [{ id: 'workflow-p', projectId: 'p', scopeId: 'wf', capability: 'workflow', version: 3,
  state: { memberViewIds: ['view-a'], workflowActions: [{ id: 'action-a', label: '核对', description: '阅读真实材料后对照', attachedViewIds: ['view-a'] }] } }];

function fixture(missingRevision = false) {
  useLcosReferenceStore.getState().reset();
  useLcosReferenceStore.getState().setProject('p');
  useLcosShellStore.setState({ projectId: 'p', composerOpen: true, composerTarget: target, composerPrompt: '原输入' });
  const fetcher = vi.fn<typeof fetch>(async (url) => new Response(JSON.stringify({ ok: true,
    value: String(url).endsWith('/graph') ? { ...graph, artifactRevisions: missingRevision ? [] : graph.artifactRevisions } : methods,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: fetcher });
  const session = { http, projects: new CoreProjectClient(http) };
  const payload = railwayAggregatePayload({ projectId: 'p', sourceRef: { kind: 'workflow', id: 'wf' },
    entityRef: { type: 'scope', id: 'wf' }, label: '实际方法', available: true }, 'p');
  if (!payload) throw new Error('Missing payload');
  const resolution = resolveDropIntent(payload, { targetId: 'composer', enabled: true,
    semantic: { kind: 'composer-reference', intent: 'continue', inputKey: composerInputKey(target) } });
  if (resolution.status !== 'ready' || resolution.intent.kind !== 'composer-reference') throw new Error('Missing method drop intent');
  const owners: DropCommitOwners = { projectId: 'p', applyAssembly: vi.fn(), addComposerReference: async (intent, signal) => {
    if (intent.sourceRef?.kind === 'workflow') await addWorkflowMethodDrop(session, 'p', intent, signal);
    else {
      const result = useLcosReferenceStore.getState().addEntitiesToDraft(intent.references ?? [intent.reference], 'continue');
      if (result.reason) throw new Error(result.reason);
    }
  } };
  return { session, intent: resolution.intent, owners, fetcher };
}

afterEach(() => { useLcosReferenceStore.getState().reset(); useLcosShellStore.setState({ composerPrompt: '', composerTarget: null }); });

it('drops the real Workflow scope through the existing owner, reads actual method DTOs, and appends to the same input without sending', async () => {
  const { intent, owners, fetcher } = fixture();
  const receipt = await new DropCommitRouter().commit(intent, 'drop-method', owners);
  expect(receipt).toMatchObject({ status: 'success', message: '工作流方法已加入当前输入，未发送' });
  expect(useLcosShellStore.getState().composerPrompt).toContain('原输入\n\n工作流方法：实际方法');
  expect(useLcosShellStore.getState().composerPrompt).toContain('来源 Scope：wf');
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityType: 'artifact', entityId: 'a', revisionId: 'old' }]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

it('takes an Assembly Workflow through the same real method reader, retaining the original near-field input', async () => {
  const { session, fetcher } = fixture();
  const inputKey = composerInputKey(target); if (!inputKey) throw new Error('Missing original input');
  await takeWorkflowScopeMethodDraft(session, 'p', 'wf', inputKey);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(useLcosShellStore.getState().composerPrompt).toContain('原输入\n\n工作流方法：实际方法');
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityId: 'a', revisionId: 'old' }]);
});

it('takes a Workflow from the real canvas snapshot through the same method owner, retaining the displayed material revision and original input', async () => {
  const { owners, fetcher } = fixture();
  const nodes = snapshotCanvasDropNodes(['wf-node'], [{ id: 'wf-node', type: 'text', data: {}, position: { x: 1, y: 2 } }],
    new Map([['wf-node', { entityType: 'scope', entityId: 'wf', descriptor: describeProjectedEntity({
      entityType: 'scope', entityId: 'wf', sourceKind: 'workflow', title: '名字不决定方法类别',
    }) }]]));
  const reference = nodes[0]?.reference;
  if (!reference) throw new Error('Missing canvas reference');
  const resolution = resolveDropIntent({ kind: 'objects', objects: [reference] }, { targetId: 'composer', enabled: true,
    semantic: { kind: 'composer-reference', intent: 'continue', inputKey: composerInputKey(target) } });
  if (resolution.status !== 'ready') throw new Error('Method was not admitted');
  const receipt = await new DropCommitRouter().commit(resolution.intent, 'canvas-method', owners);
  expect(receipt).toMatchObject({ status: 'success', message: '工作流方法已加入当前输入，未发送' });
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
  expect(useLcosShellStore.getState().composerPrompt).toContain('原输入\n\n工作流方法：实际方法');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityType: 'artifact', entityId: 'a', revisionId: 'old' }]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});
it('does not append a late Assembly method after its original message changes', async () => {
  const { session } = fixture(); const before = useLcosReferenceStore.getState().draft;
  const inputKey = composerInputKey(target); if (!inputKey) throw new Error('Missing original input');
  const pending = takeWorkflowScopeMethodDraft(session, 'p', 'wf', inputKey);
  useLcosShellStore.setState({ composerTarget: { ...target, messageId: 'new-message' }, composerPrompt: '下一条' });
  await expect(pending).rejects.toThrow('原消息已改变');
  expect(useLcosShellStore.getState().composerPrompt).toBe('下一条');
  expect(useLcosReferenceStore.getState().draft).toBe(before);
});

it('keeps the complete original draft on missing method material revision, without a fake success or Current substitution', async () => {
  const { intent, owners } = fixture(true);
  const before = useLcosReferenceStore.getState().draft;
  const receipt = await new DropCommitRouter().commit(intent, 'missing-method', owners);
  expect(receipt).toMatchObject({ status: 'failed', message: expect.stringContaining('view-a') });
  expect(useLcosShellStore.getState().composerPrompt).toBe('原输入');
  expect(useLcosReferenceStore.getState().draft).toBe(before);
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
});

it('does not put a late method response into a newly selected receiver', async () => {
  const { intent, owners } = fixture();
  const receipt = new DropCommitRouter().commit(intent, 'changed-input', owners);
  const next = { ...target, receiverConversationId: 'other' };
  useLcosShellStore.setState({ composerTarget: next, composerPrompt: '另一个任务' });
  expect(await receipt).toMatchObject({ status: 'failed', message: expect.stringContaining('输入目标已改变') });
  expect(useLcosShellStore.getState().composerPrompt).toBe('另一个任务');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toHaveLength(0);
});

it('keeps ordinary material reference drops on the existing path and does not read Workflow methods', async () => {
  const { owners, fetcher } = fixture();
  const ordinary: DropComposerReferenceIntent = { kind: 'composer-reference', targetId: 'composer',
    reference: { entityType: 'artifact', entityId: 'ordinary', revisionId: 'ordinary-revision' } };
  expect(await new DropCommitRouter().commit(ordinary, 'ordinary-drop', owners)).toMatchObject({ status: 'success', message: '已加入引用' });
  expect(useLcosShellStore.getState().composerPrompt).toBe('原输入');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityId: 'ordinary', revisionId: 'ordinary-revision' }]);
  expect(fetcher).not.toHaveBeenCalled();
});
