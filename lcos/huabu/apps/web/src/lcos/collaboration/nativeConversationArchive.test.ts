import { describe, expect, it, vi } from 'vitest';

import { createEmptyWorkspace, openTarget } from '@/store/previewWorkspace/model';

import { activeNativeConversation, archiveNativeConversation, nativeHistoryJsonl } from './nativeConversationArchive';

import type { ChatHistoryResponse } from '@huabu/shared';
import type { ConversationSessionV1 } from '@local-creative-os/contracts';
import type { Node } from '@xyflow/react';

const address = { threadId: 'native-real', ownerCanvasId: 'canvas-native' };
const history: ChatHistoryResponse = { threadId: address.threadId, messages: [
  { role: 'user', content: 'Actual request' },
  { role: 'assistant', parts: [{ kind: 'text', text: 'Actual reply' },
    { kind: 'tool', variant: 'generic', title: 'Read source', toolCallId: 'call-real', status: 'completed' },
    { kind: 'thinking', text: 'Hidden native reasoning' }] },
  { role: 'status', status: 'interrupted', detail: 'User stopped' },
] };
const session: ConversationSessionV1 = { schemaVersion: 1, id: 'import-real', projectId: 'project-real', provider: 'huabu', sourceKind: 'manual',
  title: 'Native history', messageCount: 4, sectionCount: 1, status: 'ready', originMeta: { nativeThread: address }, createdAt: '2026-10-08', updatedAt: '2026-10-08' };

describe('native history → explicit canonical archive', () => {
  it('reads only the exact active native chat/question owner and ignores normal previews', () => {
    const workspace = openTarget(createEmptyWorkspace(), { kind: 'chat', canvasId: address.ownerCanvasId, threadId: address.threadId }).workspace;
    expect(activeNativeConversation(workspace, address.ownerCanvasId, [], {})).toEqual(address);
    expect(activeNativeConversation(workspace, 'another-canvas', [], {})).toBeUndefined();
    const question: Node = { id: 'question-real', type: 'question', position: { x: 0, y: 0 }, data: { threadId: 'question-thread' } };
    const nodeWorkspace = openTarget(createEmptyWorkspace(), { kind: 'node', canvasId: address.ownerCanvasId, nodeId: question.id }).workspace;
    expect(activeNativeConversation(nodeWorkspace, address.ownerCanvasId, [question], {})).toEqual({ threadId: 'question-thread', ownerCanvasId: address.ownerCanvasId });
    expect(activeNativeConversation(nodeWorkspace, address.ownerCanvasId, [{ ...question, type: 'text' }], {})).toBeUndefined();
  });
  it('preserves actual history/order/tool status and provenance without inventing receiver identity or timestamps', () => {
    const raw = nativeHistoryJsonl(address, { kind: 'external', profileId: 'profile-real', alias: 'My Agent' }, history);
    const events = raw.trim().split('\n').map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
    expect(events[0]?.payload.nativeThread).toEqual({ ...address, binding: { kind: 'external', profileId: 'profile-real', alias: 'My Agent' } });
    expect(events[0]?.payload.originalTimestampsAvailable).toBe(false);
    expect(events[1]?.payload.message).toBe('Actual request');
    expect(events[2]?.payload.message).toBe('Actual reply');
    expect(events[3]?.payload.nativeTool).toMatchObject({ toolCallId: 'call-real', status: 'completed' });
    expect(events[4]?.payload.content).toBe('User stopped');
    expect(raw).not.toContain('Hidden native reasoning');
    expect(raw).not.toContain('connectedConversationId'); expect(raw).not.toContain('timestamp');
    expect(() => nativeHistoryJsonl(address, { kind: 'internal' }, { ...history, threadId: 'wrong-thread' })).toThrow('另一条线程');
    expect(() => nativeHistoryJsonl(address, { kind: 'internal' }, { threadId: address.threadId, messages: [] })).toThrow('没有历史消息');
  });
  it('uses the existing byte import APIs in order and never registers or selects a receiver', async () => {
    const client = { createImportSession: vi.fn().mockResolvedValue({ id: 'upload-real' }), uploadImportChunk: vi.fn().mockResolvedValue({ id: 'upload-real' }),
      completeImportSession: vi.fn().mockResolvedValue({ session, sections: [], matchedFileReferences: 0, ignoredDuplicateEvents: 0 }),
      linkSession: vi.fn(), setActiveReceiver: vi.fn() };
    const result = await archiveNativeConversation(client, { projectId: session.projectId, scopeId: 'scope-real', workspaceId: 'workspace-real', title: session.title,
      address, binding: { kind: 'internal' }, history }, new AbortController().signal);
    expect(client.createImportSession).toHaveBeenCalledWith(session.projectId, expect.objectContaining({ sourceKind: 'manual', scopeId: 'scope-real', workspaceId: 'workspace-real' }), expect.any(AbortSignal));
    const uploaded = client.uploadImportChunk.mock.calls[0]?.[3] as Blob;
    expect(await uploaded.text()).toContain('Actual reply');
    expect(client.completeImportSession).toHaveBeenCalledWith(session.projectId, 'upload-real', { expectedChunks: 1 }, expect.any(AbortSignal));
    expect(result.session.id).toBe(session.id); expect(client.linkSession).not.toHaveBeenCalled(); expect(client.setActiveReceiver).not.toHaveBeenCalled();
  });
  it('stops before complete when the operation is cancelled after chunk upload', async () => {
    const controller = new AbortController();
    const client = { createImportSession: vi.fn().mockResolvedValue({ id: 'upload-real' }),
      uploadImportChunk: vi.fn().mockImplementation(() => { controller.abort(); return Promise.resolve({ id: 'upload-real' }); }), completeImportSession: vi.fn() };
    await expect(archiveNativeConversation(client, { projectId: session.projectId, scopeId: 'scope-real', workspaceId: 'workspace-real', title: session.title,
      address, binding: { kind: 'internal' }, history }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.completeImportSession).not.toHaveBeenCalled();
  });
});
