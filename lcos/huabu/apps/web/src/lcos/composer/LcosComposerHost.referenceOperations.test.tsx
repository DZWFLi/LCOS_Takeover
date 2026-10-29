import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ delegate: vi.fn(), send: vi.fn(), refresh: vi.fn(), retry: vi.fn() }));
vi.mock('@local-creative-os/web-gen2', async (importOriginal) => ({
  ...await importOriginal<typeof WebGen2>(),
  CoreCollaborationClient: class { delegate = mocks.delegate; send = mocks.send; },
}));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: {} }) }));
vi.mock('./useComposerContinuation', () => ({
  useComposerContinuation: () => ({ blockedReason: undefined, retry: mocks.retry, error: false }),
}));
vi.mock('../collaboration/useCollaborationSession', () => ({
  useCollaborationSession: () => ({
    status: 'ready',
    projection: { userState: 'ready', capabilities: { canResume: true, canBlankNew: true, canSelectedContext: true, canFork: false } },
  }),
}));
vi.mock('../collaboration/collaborationSessionStore', () => ({
  useCollaborationSessionStore: { getState: () => ({ refresh: mocks.refresh }) },
}));

import { LcosComposerHost } from './LcosComposerHost';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { referencePickOwnerKey } from '../referencePickOwnership';
import { useLcosShellStore, type LcosComposerTarget } from '../shell/lcosShellStore';

import type * as WebGen2 from '@local-creative-os/web-gen2';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const target: LcosComposerTarget = {
  nodeId: 'receiver', title: '原任务', intent: 'delegate', workspaceId: 'workspace',
  anchor: { x: 10, y: 10, width: 100, height: 100 },
};
const accepted = { ok: true, receipt: { command: 'delegate', runId: 'actual-run' } };
beforeEach(() => {
  mocks.delegate.mockReset(); mocks.send.mockReset(); mocks.refresh.mockReset();
  useLcosShellStore.getState().clear();
  useLcosReferenceStore.getState().reset();
  useLcosDropStore.getState().reset();
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined; host?.remove();
  useLcosReferenceStore.getState().reset(); useLcosShellStore.getState().clear();
  vi.restoreAllMocks();
});
async function mount(intent: 'delegate' | 'continue' = 'delegate') {
  const shell = useLcosShellStore.getState();
  shell.setProject('project');
  shell.openComposer(intent === 'delegate' ? target : {
    ...target, intent, receiverConversationId: 'conversation',
    continuationOperationId: 'operation', messageId: 'message',
  });
  shell.setComposerPrompt('原始输入');
  useLcosReferenceStore.getState().setProject('project');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(
    <LcosComposerHost projectId="project" workspaceId="workspace" anchor={null} inline open onClose={() => undefined} />,
  ));
  const owner = referencePickOwnerKey('project', useLcosShellStore.getState().composerTarget);
  if (!owner) throw new Error('Fixture requires an actual input owner.');
  return owner;
}
function submitKey() {
  const editor = host.querySelector('textarea');
  if (!editor) throw new Error('Actual Composer input missing.');
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
}
function submitButton() {
  const button = host.querySelector<HTMLButtonElement>('[aria-label="提交"]');
  if (!button) throw new Error('Actual Composer submit missing.');
  return button;
}
function operations(owner: string, kind: 'preparing' | 'sending') {
  return [...useLcosReferenceStore.getState().referenceInputOperations.values()]
    .filter((operation) => operation.owner === owner && operation.kind === kind);
}

it.each(['delegate', 'continue'] as const)('the actual %s Composer waits for every pending reference, then sends without changing the draft', async (intent) => {
  const pending = deferred<typeof accepted>();
  (intent === 'delegate' ? mocks.delegate : mocks.send).mockReturnValue(pending.promise);
  const owner = await mount(intent);
  let first!: symbol; let second!: symbol;
  await act(async () => {
    first = useLcosReferenceStore.getState().beginReferenceInputOperation(owner, 'preparing');
    second = useLcosReferenceStore.getState().beginReferenceInputOperation(owner, 'preparing');
  });
  expect(submitButton().disabled).toBe(true);
  expect(submitButton().title).toBe('正在准备材料引用…');
  expect(host.querySelector('[data-lcos-reference-preparing]')?.textContent).toBe('正在准备材料引用…');
  await act(async () => { submitButton().click(); submitKey(); });
  expect(mocks.delegate).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  expect(useLcosShellStore.getState().composerPrompt).toBe('原始输入');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toEqual([]);
  await act(async () => useLcosReferenceStore.getState().finishReferenceInputOperation(first));
  expect(submitButton().disabled).toBe(true);
  await act(async () => useLcosReferenceStore.getState().finishReferenceInputOperation(second));
  expect(submitButton().disabled).toBe(false);
  expect(host.querySelector('[data-lcos-reference-preparing]')).toBeNull();
  await act(async () => {
    submitKey();
    expect(operations(owner, 'sending')).toHaveLength(1);
  });
  expect(intent === 'delegate' ? mocks.delegate : mocks.send).toHaveBeenCalledTimes(1);
  expect(intent === 'delegate' ? mocks.send : mocks.delegate).not.toHaveBeenCalled();
  expect(operations(owner, 'sending')).toHaveLength(1);
  await act(async () => pending.resolve(accepted));
  expect(operations(owner, 'sending')).toEqual([]);
});

it('checks live pending references before a shortcut even when React has not rendered the preparing state', async () => {
  const owner = await mount();
  await act(async () => {
    const token = useLcosReferenceStore.getState().beginReferenceInputOperation(owner, 'preparing');
    submitKey();
    useLcosReferenceStore.getState().finishReferenceInputOperation(token);
  });
  expect(mocks.delegate).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  expect(useLcosShellStore.getState().composerPrompt).toBe('原始输入');
});

it.each(['failure', 'rejection'] as const)('releases only its sending operation after %s and preserves original retry input', async (outcome) => {
  const pending = deferred<unknown>(); mocks.delegate.mockReturnValue(pending.promise);
  const owner = await mount();
  await act(async () => submitKey());
  expect(operations(owner, 'sending')).toHaveLength(1);
  let other!: symbol;
  await act(async () => { other = useLcosReferenceStore.getState().beginReferenceInputOperation('other-input', 'preparing'); });
  await act(async () => {
    if (outcome === 'failure') pending.resolve({ ok: false, error: { userMessage: '真实失败' } });
    else pending.reject(new Error('真实失败'));
  });
  expect(operations(owner, 'sending')).toEqual([]);
  expect(operations('other-input', 'preparing')).toHaveLength(1);
  expect(useLcosShellStore.getState().composerPrompt).toBe('原始输入');
  expect(host.textContent).toContain('真实失败');
  expect(submitButton().disabled).toBe(false);
  await act(async () => useLcosReferenceStore.getState().finishReferenceInputOperation(other));
});

it('pending work for another input cannot disable the current Composer', async () => {
  const pending = deferred<typeof accepted>(); mocks.delegate.mockReturnValue(pending.promise);
  const owner = await mount();
  let other!: symbol;
  await act(async () => { other = useLcosReferenceStore.getState().beginReferenceInputOperation('another-receiver', 'preparing'); });
  expect(submitButton().disabled).toBe(false);
  await act(async () => submitKey());
  expect(mocks.delegate).toHaveBeenCalledTimes(1);
  expect(operations(owner, 'sending')).toHaveLength(1);
  await act(async () => pending.resolve(accepted));
  expect(operations('another-receiver', 'preparing')).toHaveLength(1);
  await act(async () => useLcosReferenceStore.getState().finishReferenceInputOperation(other));
});

it('project switch discards transient work and an old completion cannot release the new project operation', () => {
  const references = useLcosReferenceStore.getState();
  references.setProject('one');
  const old = references.beginReferenceInputOperation('one-input', 'sending');
  references.setProject('two');
  expect(useLcosReferenceStore.getState().referenceInputOperations.size).toBe(0);
  const current = references.beginReferenceInputOperation('two-input', 'preparing');
  references.finishReferenceInputOperation(old);
  expect(useLcosReferenceStore.getState().referenceInputOperations.has(current)).toBe(true);
  references.reset();
  expect(useLcosReferenceStore.getState().referenceInputOperations.size).toBe(0);
});