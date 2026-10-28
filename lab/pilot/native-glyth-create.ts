import { connectNativeLiveContinuation } from './native-live-continuation';
import type { GlythAppearance } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/glythAppearance';

export interface NativeGlythCreation {
  projectId: string; canvasId: string; workspaceId: string; provider: string; operationId: string;
  position: { x: number; y: number }; appearance: GlythAppearance;
  submitted?: boolean; conversationId?: string; placementSent?: boolean;
}
export type NativeGlythCreationResult = { status: 'placed'; conversationId: string; nodeId: string }
  | { status: 'unconfirmed' | 'recoverable' | 'unavailable'; message: string };

/** UI keeps only the existing operation identity and the user's placement
 * intent. Core remains the owner of creation, native connection and recovery. */
export async function advanceNativeGlythCreation(ticket: NativeGlythCreation, ports: {
  client: any; isCurrent(): boolean; changed(): void;
  inspect(conversationId: string): Promise<{ id: string } | undefined>;
  place(conversationId: string): Promise<void>;
}, options: { verifyOnly?: boolean } = {}): Promise<NativeGlythCreationResult> {
  const current = () => { if (!ports.isCurrent()) throw new DOMException('Original creation target changed.', 'AbortError'); };
  try {
    current();
    const existing = await ports.client.get(ticket.projectId, ticket.operationId); current();
    if (!existing) {
      if (options.verifyOnly || ticket.submitted) return { status: 'unconfirmed', message: '暂未读到创建结果，原请求已保留，请稍后核对。' };
      ticket.submitted = true; ports.changed();
      await ports.client.submit(ticket.projectId, { operationId: ticket.operationId, mode: 'blank_new',
        contextInheritance: 'none', checkout: 'shared', provider: ticket.provider }); current();
    }
    const result = await connectNativeLiveContinuation({ projectId: ticket.projectId, sourceConversationId: null,
      operationId: ticket.operationId, action: 'blank_new' }, { client: ports.client, isCurrent: ports.isCurrent }, options);
    current();
    if (result.status !== 'ready') return { status: result.status === 'pending' ? 'unconfirmed' : result.status, message: result.message };
    if (ticket.conversationId && ticket.conversationId !== result.conversationId) throw new Error('Original conversation identity changed.');
    ticket.conversationId = result.conversationId; ports.changed();
    const existingNode = await ports.inspect(result.conversationId); current();
    if (existingNode) return { status: 'placed', conversationId: result.conversationId, nodeId: existingNode.id };
    if (options.verifyOnly) return { status: 'recoverable', message: '会话已建立，可以继续放到原落点。' };
    ticket.placementSent = true; ports.changed();
    await ports.place(result.conversationId); current();
    const node = await ports.inspect(result.conversationId); current();
    if (!node) return { status: 'unconfirmed', message: '会话已建立，画布位置尚待核对；不会重新创建会话。' };
    return { status: 'placed', conversationId: result.conversationId, nodeId: node.id };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    current();
    return { status: error?.code === 'GLYTH_APPEARANCE_USED' ? 'recoverable' : 'unconfirmed',
      message: error?.code === 'GLYTH_APPEARANCE_USED' ? '形象刚被使用了，换个形象后继续放置这位智能体。'
        : ticket.conversationId ? '会话已建立，画布结果尚待核对；不会重新创建。' : '创建结果尚未确认，请核对原请求；不会重复创建。' };
  }
}
