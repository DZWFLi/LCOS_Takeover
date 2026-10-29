import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { createEmptyWorkspace, openTarget } from '@/store/previewWorkspace/model';
import { usePreviewWorkspaceStore } from '@/store/previewWorkspace/store';

import { NativeConversationProjectEntry } from './NativeConversationProjectEntry';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type * as ReactI18next from 'react-i18next';

const m = vi.hoisted(() => ({ list: vi.fn(), workspaces: vi.fn(), identity: vi.fn(), history: vi.fn(),
  create: vi.fn(), upload: vi.fn(), complete: vi.fn(), link: vi.fn(), refresh: vi.fn(), saved: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof ReactI18next>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/api/agent', () => ({ agentApi: { fetchHistory: m.history } }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({
  conversations: { listConnectedConversations: m.list, getIdentity: m.identity, createImportSession: m.create,
    uploadImportChunk: m.upload, completeImportSession: m.complete, linkSession: m.link, listSessions: m.saved }, projects: { getWorkspaces: m.workspaces },
}) }));
vi.mock('./collaborationSessionStore', () => ({ useCollaborationSessionStore: { getState: () => ({ refresh: m.refresh }) } }));

const connected = { id: 'connected-real', projectId: 'project-real', label: 'Real project session', provider: 'codex' };
const imported = { id: 'import-real', projectId: connected.projectId, title: 'Native snapshot', status: 'ready', messageCount: 2 };
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  useLcosShellStore.getState().clear(); useLcosShellStore.getState().setProject(connected.projectId);
  useLcosShellStore.getState().setActiveWorkspaceId('workspace-real');
  useCanvasStore.setState({ canvasId: 'canvas-native', nodes: [], worldReferences: {} });
  usePreviewWorkspaceStore.setState({ canvasId: 'canvas-native', workspace: openTarget(createEmptyWorkspace(),
    { kind: 'chat', canvasId: 'canvas-native', threadId: 'native-real' }).workspace });
  useChatStore.setState({ threadsById: {}, bindingByThread: {} });
  m.list.mockResolvedValue([connected]); m.workspaces.mockResolvedValue([{ id: 'workspace-real', projectId: connected.projectId, scopeId: 'scope-real' }]);
  m.identity.mockResolvedValue({ projectId: connected.projectId, connectedConversation: connected });
  m.saved.mockResolvedValue([]);
  m.history.mockResolvedValue({ threadId: 'native-real', messages: [{ role: 'user', content: 'Real request' }, { role: 'assistant', parts: [{ kind: 'text', text: 'Real response' }] }] });
  m.create.mockResolvedValue({ id: 'upload-real' }); m.upload.mockResolvedValue({ id: 'upload-real' });
  m.complete.mockResolvedValue({ session: imported, sections: [], matchedFileReferences: 0, ignoredDuplicateEvents: 0 });
  m.refresh.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); useCanvasStore.setState({ canvasId: undefined }); useLcosShellStore.getState().clear(); });
const clickText = async (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.trim() === text);
  expect(button).toBeDefined(); await act(async () => button?.click());
};

it('one save action archives, links the chosen session and opens it; failed linking retries the saved history', async () => {
  m.link.mockRejectedValueOnce(new Error('Link reply unavailable')).mockResolvedValue({ projectId: connected.projectId, connectedConversation: connected, conversationSession: imported });
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出');
  const select = document.querySelector<HTMLSelectElement>('[aria-label="关联的项目会话"]');
  expect(select).not.toBeNull();
  await act(async () => { if (select) { select.value = connected.id; select.dispatchEvent(new Event('change', { bubbles: true })); } });
  await clickText('保存并打开会话');
  expect(m.history).toHaveBeenCalledWith('native-real', 'canvas-native');
  expect(m.link).toHaveBeenCalledTimes(1);
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  expect(document.body.textContent).toContain('Link reply unavailable');
  expect(m.create).toHaveBeenCalledTimes(1);
  await clickText('继续保存并打开会话');
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.link).toHaveBeenLastCalledWith(connected.projectId, connected.id, imported.id, expect.any(AbortSignal));
  expect(m.refresh).toHaveBeenCalledWith(connected.projectId, connected.id);
  expect(useLcosShellStore.getState().windows).toEqual(expect.arrayContaining([expect.objectContaining({ bodyKey: 'conversation', target: connected.id })]));
  expect(useChatStore.getState().threadMap['canvas-native']).toBeUndefined();
});

it('does not archive a mismatched native history or silently create a Core receiver', async () => {
  m.history.mockResolvedValue({ threadId: 'another-thread', messages: [{ role: 'user', content: 'Wrong source' }] });
  await act(async () => root.render(<NativeConversationProjectEntry />)); await clickText('项目会话与产出'); await clickText('保存到项目');
  expect(document.body.textContent).toContain('另一条线程');
  expect(m.create).not.toHaveBeenCalled(); expect(m.link).not.toHaveBeenCalled();
});

async function chooseConnected() {
  const select = document.querySelector<HTMLSelectElement>('[aria-label="关联的项目会话"]');
  if (!select) throw new Error('save destination must remain available');
  await act(async () => { select.value = connected.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

it('keeps saving history without a receiver and later links that same saved history', async () => {
  m.link.mockResolvedValue({ projectId: connected.projectId, connectedConversation: connected, conversationSession: imported });
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出');
  await clickText('保存到项目');
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.link).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('已保存 2 条历史到项目');
  await chooseConnected();
  await clickText('继续保存并打开会话');
  expect(m.history).toHaveBeenCalledTimes(1);
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.link).toHaveBeenCalledWith(connected.projectId, connected.id, imported.id, expect.any(AbortSignal));
});

it('does not import into a new workspace when the user changes it while history is loading', async () => {
  let resolveHistory: ((history: unknown) => void) | undefined;
  const history = m.history.getMockImplementation()?.();
  m.history.mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出'); await chooseConnected();
  await clickText('保存并打开会话');
  await act(async () => {
    useLcosShellStore.getState().setActiveWorkspaceId('workspace-other');
    resolveHistory?.(await history);
  });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.link).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('当前会话或现场已切换');
});

it('keeps a completed archive when workspace changes before linking and reuses it after returning', async () => {
  let resolveArchive: ((result: unknown) => void) | undefined;
  m.complete.mockReturnValue(new Promise((resolve) => { resolveArchive = resolve; }));
  m.link.mockResolvedValue({ projectId: connected.projectId, connectedConversation: connected, conversationSession: imported });
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出'); await chooseConnected(); await clickText('保存并打开会话');
  await act(async () => {
    useLcosShellStore.getState().setActiveWorkspaceId('workspace-other');
    resolveArchive?.({ session: imported, sections: [], matchedFileReferences: 0, ignoredDuplicateEvents: 0 });
  });
  expect(m.link).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('已保存 2 条记录');
  await act(async () => useLcosShellStore.getState().setActiveWorkspaceId('workspace-real'));
  await clickText('继续保存并打开会话');
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.complete).toHaveBeenCalledTimes(1);
  expect(m.link).toHaveBeenCalledTimes(1);
});

it('keeps saved history and reports a mismatched link receipt without opening an unrelated conversation', async () => {
  m.link.mockResolvedValue({ projectId: connected.projectId, connectedConversation: { ...connected, id: 'wrong-target' }, conversationSession: imported });
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出'); await chooseConnected(); await clickText('保存并打开会话');
  expect(document.body.textContent).toContain('关联回执与选择的会话或历史不一致');
  expect(document.body.textContent).toContain('已保存 2 条记录');
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  expect(m.create).toHaveBeenCalledTimes(1);
});

it('after remounting, explicitly resumes only the saved history with this exact native owner', async () => {
  const metadata = { model_provider: 'huabu', exportKind: 'native-visible-history-snapshot', nativeThread: { threadId: 'native-real', ownerCanvasId: 'canvas-native' } };
  m.saved.mockResolvedValue([
    { ...imported, originMeta: metadata, createdAt: '2026-10-13T00:00:00Z' },
    { ...imported, id: 'another-owner', originMeta: { ...metadata, nativeThread: { threadId: 'native-real', ownerCanvasId: 'canvas-other' } } },
    { ...imported, id: 'already-linked', originMeta: metadata },
  ]);
  m.list.mockResolvedValue([connected, { ...connected, id: 'other-connected', conversationSessionId: 'already-linked' }]);
  m.link.mockResolvedValue({ projectId: connected.projectId, connectedConversation: connected, conversationSession: imported });
  await act(async () => root.render(<NativeConversationProjectEntry />));
  await clickText('项目会话与产出'); await chooseConnected();
  const histories = document.querySelector<HTMLSelectElement>('[aria-label="使用已保存的历史"]');
  if (!histories) throw new Error('saved native history recovery must be available');
  expect([...histories.options].map((item) => item.value)).toEqual(['', imported.id]);
  expect(histories.value).toBe('');
  await act(async () => { histories.value = imported.id; histories.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('关联已保存历史并打开');
  expect(m.history).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.link).toHaveBeenCalledWith(connected.projectId, connected.id, imported.id, expect.any(AbortSignal));
  expect(useLcosShellStore.getState().windows).toEqual(expect.arrayContaining([expect.objectContaining({ bodyKey: 'conversation', target: connected.id })]));
});
