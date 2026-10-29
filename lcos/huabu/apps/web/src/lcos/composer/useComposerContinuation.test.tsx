import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readDiagnostics: vi.fn(), refresh: vi.fn(),
  entry: { status: 'ready', projection: { capabilities: { canSend: true }, capabilityReasons: {} } },
}));
vi.mock('@local-creative-os/web-gen2', () => ({ CoreCollaborationClient: class { readDiagnostics = mocks.readDiagnostics; } }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: {} }) }));
vi.mock('../collaboration/useCollaborationSession', () => ({ useCollaborationSession: () => mocks.entry }));
vi.mock('../collaboration/collaborationSessionStore', () => ({
  useCollaborationSessionStore: { getState: () => ({ refresh: mocks.refresh }) },
}));

import { selectConfirmedSendOperation } from './confirmedConversationOperation';
import { useComposerContinuation } from './useComposerContinuation';
import { useLcosShellStore, type LcosComposerTarget } from '../shell/lcosShellStore';

import type { CollaborationDiagnosticsV1 } from '@local-creative-os/contracts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let current: ReturnType<typeof useComposerContinuation>;
const target = (id: string): LcosComposerTarget => ({
  nodeId: 'node-' + id, title: id, anchor: { x: 1, y: 1, width: 100, height: 100 },
  intent: 'continue', receiverConversationId: id,
});
const diagnostics = (id: string, cancel = 'none', status = 'projected') => ({
  conversationId: id, operations: [{
    operationId: 'operation-' + id, connectedConversationId: id, status, cancel,
    externalEvidence: { externalSessionId: 'external-' + id },
  }],
}) as unknown as CollaborationDiagnosticsV1;
function Host() {
  const shellTarget = useLcosShellStore((state) => state.composerTarget);
  current = useComposerContinuation('project', shellTarget, true);
  return <div>{current.blockedReason}</div>;
}
async function mount(id = 'a') {
  const shell = useLcosShellStore.getState();
  shell.setProject('project'); shell.openComposer(target(id)); shell.setComposerPrompt('保留草稿');
  const host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Host />));
}
beforeEach(() => {
  mocks.readDiagnostics.mockReset(); mocks.refresh.mockReset();
  mocks.entry = { status: 'ready', projection: { capabilities: { canSend: true }, capabilityReasons: {} } };
  useLcosShellStore.getState().clear();
});
afterEach(() => {
  if (root) act(() => root!.unmount()); root = undefined;
  document.body.replaceChildren(); useLcosShellStore.getState().clear();
});

it('prepares the same nearfield draft using only the confirmed matching operation', async () => {
  mocks.readDiagnostics.mockResolvedValue(diagnostics('a'));
  await mount();
  const shell = useLcosShellStore.getState();
  expect(shell.composerTarget).toMatchObject({ nodeId: 'node-a', continuationOperationId: 'operation-a' });
  expect(shell.composerTarget?.messageId).toBeTruthy();
  expect(shell.composerPrompt).toBe('保留草稿');
  expect(shell.windows).toHaveLength(0);
  expect(current.blockedReason).toBeUndefined();
});

it('distinguishes a failed diagnostics read from no operation and retries in place', async () => {
  mocks.readDiagnostics.mockResolvedValueOnce(undefined).mockResolvedValue(diagnostics('a'));
  await mount();
  expect(current.error).toBe(true);
  expect(current.blockedReason).toContain('请重试');
  expect(useLcosShellStore.getState().composerTarget?.continuationOperationId).toBeUndefined();
  await act(async () => current.retry());
  expect(mocks.refresh).toHaveBeenCalledWith('project', 'a');
  expect(current.blockedReason).toBeUndefined();
  expect(useLcosShellStore.getState().composerPrompt).toBe('保留草稿');
});

it('ignores a previous receiver read after selecting a different Glyth', async () => {
  let finish!: (value: CollaborationDiagnosticsV1) => void;
  mocks.readDiagnostics.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValue(diagnostics('b'));
  await mount();
  await act(async () => useLcosShellStore.getState().openComposer(target('b')));
  await act(async () => finish(diagnostics('a')));
  expect(useLcosShellStore.getState().composerTarget).toMatchObject({
    receiverConversationId: 'b', continuationOperationId: 'operation-b',
  });
});

it('never invents sendability for cancellation, unknown result or another receiver', () => {
  for (const cancel of ['requested', 'confirmed', 'outcome_unknown']) {
    expect(selectConfirmedSendOperation(diagnostics('a', cancel), 'a')).toBeUndefined();
  }
  for (const state of ['outcome_unknown', 'recovering', 'cancelled']) {
    expect(selectConfirmedSendOperation(diagnostics('a', 'none', state), 'a')).toBeUndefined();
  }
  expect(selectConfirmedSendOperation(diagnostics('a'), 'b')).toBeUndefined();
  expect(selectConfirmedSendOperation(diagnostics('a'), 'a', 'other-operation')).toBeUndefined();
});

it('replaces the entry-time blocked reason only after live send capability and operation are confirmed', async () => {
  mocks.readDiagnostics.mockResolvedValue(diagnostics('a'));
  const shell = useLcosShellStore.getState();
  shell.setProject('project');
  shell.openComposer({ ...target('a'), receiverBlockedReason: '旧的离线提示', continuationOperationId: 'operation-a', messageId: 'message-a' });
  const host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root!.render(<Host />));
  expect(useLcosShellStore.getState().composerTarget?.receiverBlockedReason).toBeUndefined();
  expect(useLcosShellStore.getState().composerTarget?.messageId).toBe('message-a');
  expect(current.blockedReason).toBeUndefined();
});
