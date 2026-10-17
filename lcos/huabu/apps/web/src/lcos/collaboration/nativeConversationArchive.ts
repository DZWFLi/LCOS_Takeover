import { conversationViewForNode } from '@/store/conversationOwner';
import { activeTabOfGroup } from '@/store/previewWorkspace/model';

import type { CanvasPreviewWorkspace } from '@/store/previewWorkspace/model';
import type { AgentBinding, ChatHistoryResponse, ResolvedWorldReference } from '@huabu/shared';
import type { CompleteConversationImportResultV1, ConnectedConversationV1, ConversationSessionV1 } from '@local-creative-os/contracts';
import type { CoreConversationClient } from '@local-creative-os/web-gen2';
import type { Node } from '@xyflow/react';

export interface NativeConversationAddress {
  readonly threadId: string;
  readonly ownerCanvasId: string;
}

/** Recover saved snapshots by their canonical native address. A title/date is
 * presentation only; already linked sessions are not pending save candidates. */
export function savedNativeConversationHistories(projectId: string, address: NativeConversationAddress,
  sessions: readonly ConversationSessionV1[], connected: readonly ConnectedConversationV1[]): ConversationSessionV1[] {
  const linked = new Set(connected.filter((item) => item.projectId === projectId).map((item) => item.conversationSessionId));
  return sessions.filter((item) => {
    const meta = item.originMeta;
    const native = meta.nativeThread;
    return item.projectId === projectId && item.status === 'ready' && !linked.has(item.id)
      && meta.exportKind === 'native-visible-history-snapshot' && meta.model_provider === 'huabu'
      && typeof native === 'object' && native !== null && !Array.isArray(native)
      && 'threadId' in native && native.threadId === address.threadId
      && 'ownerCanvasId' in native && native.ownerCanvasId === address.ownerCanvasId;
  });
}

/** Exactly the native active Preview target. No current-canvas thread guesses,
 * provider/title/time matching or fabricated connectedConversationId. */
export function activeNativeConversation(workspace: CanvasPreviewWorkspace, canvasId: string,
  nodes: readonly Node[], references: Readonly<Record<string, ResolvedWorldReference>>): NativeConversationAddress | undefined {
  const target = activeTabOfGroup(workspace, workspace.activeGroupId)?.target;
  if (!target || target.canvasId !== canvasId) return undefined;
  if (target.kind === 'chat') return { threadId: target.threadId, ownerCanvasId: target.canvasId };
  const node = nodes.find((candidate) => candidate.id === target.nodeId);
  if (!node) return undefined;
  const reference = references[node.id];
  const referencedOwner = reference?.kind === 'nodeRef' ? reference.source : undefined;
  if (node.type === 'nodeRef' && referencedOwner?.type === 'question' && !referencedOwner.threadId) return undefined;
  const view = conversationViewForNode(node, canvasId, references[node.id]);
  return view ? { threadId: view.conversationOwner.threadId, ownerCanvasId: view.conversationOwner.canvasId } : undefined;
}

/** Transform a verified native history response into the already supported
 * manual JSONL format. Source parts remain verbatim in the archived payload.
 * Native history does not provide timestamps; never invent original dates. */
export function nativeHistoryJsonl(address: NativeConversationAddress, binding: AgentBinding | undefined, history: ChatHistoryResponse): string {
  if (history.threadId !== address.threadId) throw new Error('原生历史回执属于另一条线程，没有归档。');
  if (history.messages.length === 0) throw new Error('当前原生线程还没有历史消息。');
  const events: object[] = [{ type: 'session_meta', payload: { model_provider: 'huabu',
    nativeThread: { ...address, ...(binding ? { binding } : {}) }, exportKind: 'native-visible-history-snapshot', originalTimestampsAvailable: false, hiddenThinkingIncluded: false } }];
  history.messages.forEach((message, turn) => {
    if (message.role === 'user') {
      events.push({ type: 'event_msg', payload: { type: 'user_message', message: message.content, nativeTurn: turn, nativeMessage: message } });
    } else if (message.role === 'status') {
      events.push({ type: 'event_msg', payload: { type: `native_${message.status}`, content: message.detail ?? message.status, nativeTurn: turn, nativeMessage: message } });
    } else {
      // Keep message/part ordering. Text is the real assistant text; every other
      // part remains an event, and tool status remains the reported native status.
      message.parts.forEach((part, index) => {
        if (part.kind === 'text') events.push({ type: 'event_msg', payload: { type: 'agent_message', message: part.text,
          nativeTurn: turn, nativePart: index, nativePartContent: part,
          ...(index === 0 ? { attachments: message.attachments, selectedNodeIds: message.selectedNodeIds } : {}) } });
        else if (part.kind === 'tool') events.push({ type: 'event_msg', payload: { type: 'tool_call',
          name: 'toolName' in part ? part.toolName : part.variant, content: part.title, nativeTurn: turn, nativePart: index, nativeTool: part } });
        else if (part.kind !== 'thinking') events.push({ type: 'event_msg', payload: { type: `native_${part.kind}`,
          content: JSON.stringify(part), nativeTurn: turn, nativePart: index, nativePartContent: part } });
      });
    }
  });
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

/** Snapshot archival only. Caller separately performs explicit linkSession,
 * so an import is never treated as a receiver registration or Run receipt. */
export async function archiveNativeConversation(client: Pick<CoreConversationClient, 'createImportSession' | 'uploadImportChunk' | 'completeImportSession'>,
  input: { readonly projectId: string; readonly scopeId: string; readonly workspaceId: string; readonly title: string;
    readonly address: NativeConversationAddress; readonly binding?: AgentBinding; readonly history: ChatHistoryResponse }, signal: AbortSignal): Promise<CompleteConversationImportResultV1> {
  const source = new Blob([nativeHistoryJsonl(input.address, input.binding, input.history)], { type: 'application/x-ndjson' });
  if (signal.aborted) throw new DOMException('Archive cancelled', 'AbortError');
  const upload = await client.createImportSession(input.projectId, { sourceKind: 'manual', title: input.title,
    sourceFileName: 'huabu-native-history.jsonl', expectedBytes: source.size, scopeId: input.scopeId, workspaceId: input.workspaceId }, signal);
  // Existing Core route body limit is 4 MiB. Byte slices rejoin before parsing.
  const chunkBytes = 4 * 1024 * 1024;
  const count = Math.ceil(source.size / chunkBytes);
  for (let index = 0; index < count; index += 1) {
    if (signal.aborted) throw new DOMException('Archive cancelled', 'AbortError');
    await client.uploadImportChunk(input.projectId, upload.id, index, source.slice(index * chunkBytes, (index + 1) * chunkBytes), signal);
  }
  if (signal.aborted) throw new DOMException('Archive cancelled', 'AbortError');
  const result = await client.completeImportSession(input.projectId, upload.id, { expectedChunks: count }, signal);
  if (result.session.projectId !== input.projectId || result.session.status !== 'ready') throw new Error('归档回执与当前项目不一致或尚未就绪。');
  return result;
}
