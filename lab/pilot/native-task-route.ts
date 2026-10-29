import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';

/** UI addresses only. Run and Conversation facts remain in their Core readers. */
export type NativeChatRoute = { readonly page: 'conversation' }
  | { readonly page: 'tasks'; readonly returnTo: NativeChatRoute }
  | { readonly page: 'task'; readonly runId: string; readonly returnTo: NativeChatRoute };
export const nativeChatConversationRoute: NativeChatRoute = { page: 'conversation' };
export type NativeChatConversationSection = 'answer-input' | 'review-result' | 'view-progress' | 'recover-session'
  | 'session-diagnostics' | 'session-options' | 'cancel-work';
export function isNativeChatConversationSection(value: unknown): value is NativeChatConversationSection {
  return typeof value === 'string' && ['answer-input', 'review-result', 'view-progress', 'recover-session',
    'session-diagnostics', 'session-options', 'cancel-work'].includes(value);
}
export function nativeChatTaskRoute(route: NativeChatRoute, runId: string, sourceRunId?: string): NativeChatRoute {
  if (!address(runId) || sourceRunId !== undefined && !address(sourceRunId)) throw new TypeError('An exact Run address is required.');
  if (route.page === 'task' && route.runId === runId) return route;
  let returnTo = route;
  if (sourceRunId !== undefined && sourceRunId !== runId) {
    let existing: NativeChatRoute | undefined;
    for (let cursor = route; cursor.page !== 'conversation'; cursor = cursor.returnTo) {
      if (cursor.page === 'task' && cursor.runId === sourceRunId) { existing = cursor; break; }
    }
    // Reuse the original source route and its more precise return path. This
    // is navigation only; it neither recreates the retry nor moves old forms.
    returnTo = existing ?? nativeChatTaskRoute(route, sourceRunId);
  }
  return { page: 'task', runId, returnTo };
}
export function nativeChatBackRoute(route: NativeChatRoute): NativeChatRoute {
  return route.page === 'conversation' ? route : route.returnTo;
}

type DispatchPorts = { projectId(): string | null; dispatch(event: Event): boolean };
const defaultPorts = (): DispatchPorts => ({ projectId: () => useLcosShellStore.getState().projectId,
  dispatch: event => window.dispatchEvent(event) });
const address = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function request(type: string, detail: { projectId: string; runId?: string; conversationId?: string; section?: NativeChatConversationSection }, ports: DispatchPorts) {
  if (!address(detail.projectId) || ports.projectId() !== detail.projectId
    || !address(detail.runId ?? detail.conversationId)) return false;
  ports.dispatch(new CustomEvent(type, { detail }));
  ports.dispatch(new CustomEvent('lcos-native-open-conversation'));
  return true;
}
export interface NativeTaskViewRequest { projectId: string; runId: string; sourceRunId?: string }
export function requestNativeTaskView(target: NativeTaskViewRequest, ports = defaultPorts()): boolean {
  if (!target || target.sourceRunId !== undefined && !address(target.sourceRunId)) return false;
  return request('lcos-native-open-task', target, ports);
}
export interface NativeConversationViewRequest {
  projectId: string; conversationId: string; section?: NativeChatConversationSection;
  continuationOperationId?: string; messageId?: string;
  /** Exact public activity selected in a Glyth detail. Never a latest-item hint. */
  progressItemId?: string; progressRunId?: string;
}
export interface NativeCurrentComposerViewRequest {
  projectId:string;canvasId:string;inputKey:string;messageId?:string;continuationOperationId?:string;
}
/** Return to the already-owned input, without selecting another receiver. */
export function requestNativeCurrentComposerInput(target:NativeCurrentComposerViewRequest,ports=defaultPorts()):boolean {
  if(!target||ports.projectId()!==target.projectId||![target.projectId,target.canvasId,target.inputKey].every(address)
    ||[target.messageId,target.continuationOperationId].some(value=>value!==undefined&&!address(value)))return false;
  ports.dispatch(new CustomEvent('lcos-native-show-current-input',{detail:target}));
  ports.dispatch(new CustomEvent('lcos-native-open-conversation'));return true;
}
/** Selecting an address never registers, reconnects, sends or creates a session. */
export function requestNativeConversationView(target: NativeConversationViewRequest, ports = defaultPorts()): boolean {
  if (!target || target.section !== undefined && !isNativeChatConversationSection(target.section)
    || [target.continuationOperationId, target.messageId, target.progressItemId, target.progressRunId].some(value => value !== undefined && !address(value))
    || (target.progressItemId !== undefined || target.progressRunId !== undefined)
      && (target.section !== 'view-progress' || !address(target.progressItemId) || !address(target.progressRunId))) return false;
  return request('lcos-native-select-conversation', target, ports);
}

/** Inline input must leave higher native Popovers/menus and IME to their owners. */
export function nativeChatHasHigherTransient(documentRef: Document = document): boolean {
  return [...documentRef.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-radix-popper-content-wrapper], details[open]')]
    .some(element => element.getClientRects().length > 0 && !element.closest('[inert],[aria-hidden="true"]'));
}
