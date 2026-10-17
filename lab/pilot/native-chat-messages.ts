import type { CollaborationTimelineItemV1 } from '../../lcos/packages/contracts/src/collaboration-contract.ts';

/** The shipped TapNow U5/uv message shape, restricted to canonical text messages.
 * This is a render projection only: no native cloud session, Run or optimistic
 * assistant reply is created by this adapter. */
export interface NativeChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly sentAt: number;
  readonly runId?: string;
  readonly contents: readonly [{ readonly type: 'text'; readonly content: string }];
}

export type NativeChatTimelineOrderEntry =
  | { readonly kind: 'message'; readonly itemId: string; readonly messageId: string; readonly messageIndex: number }
  | { readonly kind: 'activity'; readonly itemId: string; readonly activityIndex: number };

export interface NativeChatMessagesProjection {
  readonly ok: true;
  readonly messages: readonly NativeChatMessage[];
  /** Keep actual event kinds and refs for the native frame's activity slot.
   * A progress/approval/result item must never masquerade as an agent reply. */
  readonly activities: readonly CollaborationTimelineItemV1[];
  /** Core already orders the projection. Do not sort by a lossy timestamp or
   * partition activities away from the messages they describe. */
  readonly order: readonly NativeChatTimelineOrderEntry[];
}

export interface NativeChatMessagesProjectionError {
  readonly ok: false;
  readonly error: {
    readonly code: 'invalid_timeline' | 'invalid_item' | 'unsupported_kind'
      | 'missing_message_body' | 'duplicate_identity';
    readonly itemIndex?: number;
    readonly message: string;
  };
}

const timelineKinds = new Set<CollaborationTimelineItemV1['kind']>([
  'user_message', 'agent_message', 'work_started', 'progress', 'input_required',
  'approval_required', 'result_returned', 'result_adopted', 'error', 'recovered', 'system_note',
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validRefs(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  return ['runId', 'returnId', 'continuationOperationId', 'messageId']
    .every(key => value[key] === undefined || identity(value[key]));
}

function failure(code: NativeChatMessagesProjectionError['error']['code'], itemIndex?: number): NativeChatMessagesProjectionError {
  return { ok: false, error: { code, ...(itemIndex === undefined ? {} : { itemIndex }),
    message: '这段对话记录暂时无法显示，原记录保留。' } };
}

/** Convert the existing Core timeline into original TapNow U5 props.
 * No title fallback: Core's title can be a truncated first line, not the full
 * conversation body. Malformed data stays an explicit read failure instead of
 * appearing as a successful empty conversation. */
export function projectNativeChatMessages(timeline: unknown): NativeChatMessagesProjection | NativeChatMessagesProjectionError {
  if (!Array.isArray(timeline)) return failure('invalid_timeline');
  const messages: NativeChatMessage[] = [];
  const activities: CollaborationTimelineItemV1[] = [];
  const order: NativeChatTimelineOrderEntry[] = [];
  const itemIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const [itemIndex, value] of timeline.entries()) {
    if (!record(value) || value.schemaVersion !== 1 || !identity(value.itemId)
      || typeof value.kind !== 'string' || typeof value.title !== 'string'
      || typeof value.occurredAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.occurredAt)
      || !Number.isFinite(Date.parse(value.occurredAt))
      || (value.body !== undefined && typeof value.body !== 'string')
      || !validRefs(value.refs)) {
      return failure('invalid_item', itemIndex);
    }
    if (!timelineKinds.has(value.kind as CollaborationTimelineItemV1['kind'])) return failure('unsupported_kind', itemIndex);
    if (itemIds.has(value.itemId)) return failure('duplicate_identity', itemIndex);
    itemIds.add(value.itemId);

    const item = value as unknown as CollaborationTimelineItemV1;
    if (item.kind !== 'user_message' && item.kind !== 'agent_message') {
      order.push({ kind: 'activity', itemId: item.itemId, activityIndex: activities.length });
      activities.push(item);
      continue;
    }
    if (typeof item.body !== 'string') return failure('missing_message_body', itemIndex);
    const messageId = item.refs?.messageId ?? item.itemId;
    if (messageIds.has(messageId)) return failure('duplicate_identity', itemIndex);
    messageIds.add(messageId);
    order.push({ kind: 'message', itemId: item.itemId, messageId, messageIndex: messages.length });
    messages.push({ id: messageId, role: item.kind === 'user_message' ? 'user' : 'assistant',
      sentAt: Date.parse(item.occurredAt),
      ...(item.refs?.runId === undefined ? {} : { runId: item.refs.runId }),
      contents: [{ type: 'text', content: item.body }] });
  }
  return { ok: true, messages, activities, order };
}
