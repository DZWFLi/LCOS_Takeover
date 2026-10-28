import { buildLcosNodeCommands, type LcosNodeCommandId } from '../../lcos/apps/web-gen2/src/interaction/nodeCommandModel';
import type { CollaborationDiagnosticsV1 } from '../../lcos/packages/contracts/src/collaboration-contract';
import type { CollaborationSessionEntry } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import type { NativeConversationViewRequest, NativeChatConversationSection } from './native-task-route';
import { nativeConversationRecoveryOperations } from './native-conversation-recovery-visibility';
import type { GlythThought } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythThought';

export type NativeGlythActionId = Extract<LcosNodeCommandId, 'open' | 'compose' | 'answer-input' | 'review-result'
  | 'view-progress' | 'recover-session' | 'session-diagnostics' | 'session-options' | 'cancel-work'>;
export interface NativeGlythAction {
  readonly id: NativeGlythActionId;
  readonly label: string;
  /** View actions only select an existing right-rail address. Compose still uses the original Composer owner. */
  readonly kind: 'view' | 'compose';
  readonly target: NativeConversationViewRequest;
}
export interface NativeGlythActions {
  readonly primary: NativeGlythAction;
  readonly more: readonly NativeGlythAction[];
  /** Status text, not disabled filler buttons or permission to run a command. */
  readonly unavailable: readonly { readonly id: NativeGlythActionId; readonly label: string; readonly reason: string }[];
}
export interface NativeGlythActionInput {
  readonly projectId: string;
  readonly conversationId: string;
  readonly entry?: CollaborationSessionEntry;
  /** Optional already-read data from the original diagnostics owner; this helper never fetches it. */
  readonly diagnostics?: {
    readonly status: 'loading' | 'ready' | 'error';
    readonly value?: Pick<CollaborationDiagnosticsV1, 'conversationId' | 'operations'>;
  };
}

const address = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const sectionByAction: Partial<Record<NativeGlythActionId, NativeChatConversationSection>> = {
  'answer-input': 'answer-input', 'review-result': 'review-result', 'view-progress': 'view-progress',
  'recover-session': 'recover-session', 'session-diagnostics': 'session-diagnostics',
  'session-options': 'session-options', 'cancel-work': 'cancel-work',
};
const actionIds = new Set<NativeGlythActionId>(['open', 'compose', ...Object.keys(sectionByAction) as NativeGlythActionId[]]);
const labels: Partial<Record<NativeGlythActionId, string>> = {
  open: '查看对话', 'session-diagnostics': '查看会话请求', 'session-options': '会话选项',
};

/** Pure presentation adapter over the original node command model, not another workflow.
 * Current projections own state/permission. Exact operation addresses are optional; absent or
 * ambiguous reads open the original section and let its reader resolve the current records.
 * No session creation, preparation, reconnect, send, recovery, cancellation, store or network. */
export function resolveNativeGlythActions(input: NativeGlythActionInput): NativeGlythActions | undefined {
  if (!address(input.projectId) || !address(input.conversationId)) return undefined;
  const candidate = input.entry?.status === 'ready' ? input.entry.projection : undefined;
  const projection = candidate?.projectId === input.projectId && candidate.conversationId === input.conversationId
    ? candidate : undefined;
  // Glyth uses the existing native note carrier's conversation command family. Canvas
  // geometry/appearance commands are deliberately left with the original toolbar.
  const commands = buildLcosNodeCommands({ nodeType: 'note', entityType: 'conversation', entityId: input.conversationId,
    capabilities: [], referenced: false, ...(projection ? { conversation: projection } : {}) })
    .filter(command => actionIds.has(command.id as NativeGlythActionId));
  const value = input.diagnostics?.status === 'ready' && input.diagnostics.value?.conversationId === input.conversationId
    ? input.diagnostics.value : undefined;
  const attention = value ? nativeConversationRecoveryOperations(value.operations, input) : [];
  // Do not arbitrarily pick the newest request: several unresolved requests remain a list.
  const exactOperation = attention.length === 1 && address(attention[0].operationId) ? attention[0] : undefined;
  const adapt = (command: typeof commands[number]): NativeGlythAction => {
    const id = command.id as NativeGlythActionId;
    const section = sectionByAction[id];
    return { id, label: labels[id] ?? command.label, kind: id === 'compose' ? 'compose' : 'view',
      target: { projectId: input.projectId, conversationId: input.conversationId,
        ...(section ? { section } : {}),
        ...(id === 'recover-session' && exactOperation ? { continuationOperationId: exactOperation.operationId } : {}),
      } };
  };
  const available = commands.filter(command => command.disabledReason === undefined);
  // A disconnected ready/done conversation may have no failed journal request.
  // Reuse its existing options entry, where the original continuation owner offers
  // reconnection; do not mistake canRecover for an operation or reconnect here.
  const resumeOptions = projection && (projection.userState === 'ready' || projection.userState === 'done')
    && projection.capabilities.canSend === false && projection.capabilities.canResume === true
    && commands.some(command => command.id === 'compose' && command.disabledReason !== undefined)
    ? available.find(command => command.id === 'session-options') : undefined;
  const primary = resumeOptions ?? available.find(command => command.primary !== false);
  // The original valid conversation identity always has its read-only open action.
  if (!primary) return undefined;
  return { primary: resumeOptions ? { ...adapt(primary), label: '重新连接…' } : adapt(primary),
    more: available.filter(command => command !== primary).map(adapt),
    unavailable: commands.filter(command => command.disabledReason !== undefined).map(command => ({
      id: command.id as NativeGlythActionId, label: command.label, reason: command.disabledReason!,
    })),
  };
}

/** The original Core timeline is already ordered. A retained/error timeline or a
 * previous Run cannot supply current progress, and an activity is never a message. */
export function resolveNativeGlythProgressItemId(
  input: Pick<NativeGlythActionInput, 'projectId' | 'conversationId' | 'entry'>,
  exact?: { readonly itemId: string; readonly runId: string },
): string | undefined {
  const { entry } = input;
  if (!address(input.projectId) || !address(input.conversationId) || entry?.status !== 'ready'
    || entry.timelineStatus !== 'ready' || entry.projection?.projectId !== input.projectId
    || entry.projection.conversationId !== input.conversationId) return undefined;
  if (exact) {
    if (!address(exact.itemId) || !address(exact.runId)) return undefined;
    const matches = (entry.timeline ?? []).filter(item => item.itemId === exact.itemId);
    const item = matches.length === 1 ? matches[0] : undefined;
    return item && item.refs?.runId === exact.runId
      && item.kind !== 'user_message' && item.kind !== 'agent_message' ? item.itemId : undefined;
  }
  const runId = entry.projection.activity.activeRunId;
  if (!address(runId)) return undefined;
  let itemId: string | undefined;
  for (const item of entry.timeline ?? []) {
    if ((item.kind === 'progress' || item.kind === 'work_started') && item.refs?.runId === runId && address(item.itemId)) {
      itemId = item.itemId;
    }
  }
  return itemId;
}

/** A short-lived display row keeps its own public source address even when
 * newer progress arrives. Reading it must not jump to a different latest row. */
export function resolveNativeGlythThoughtTarget(
  input: Pick<NativeGlythActionInput, 'projectId' | 'conversationId'>,
  thought: GlythThought,
): NativeConversationViewRequest | undefined {
  if (!address(input.projectId) || !address(input.conversationId) || !thought) return undefined;
  let scope: unknown;
  try { scope = JSON.parse(thought.scope); } catch { return undefined; }
  if (!Array.isArray(scope) || scope.length !== 3 || scope[0] !== input.projectId || scope[1] !== input.conversationId
    || scope[2] !== null && !address(scope[2])) return undefined;
  const target = { projectId: input.projectId, conversationId: input.conversationId };
  if (thought.sourceItemId !== undefined) {
    if (!address(thought.sourceItemId) || !address(scope[2])) return undefined;
    return { ...target, section: 'view-progress', progressItemId: thought.sourceItemId, progressRunId: scope[2] };
  }
  return target;
}

