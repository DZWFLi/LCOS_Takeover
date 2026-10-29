/** Open an existing Scope in the original Library; this owns no window, draft or content. */
export interface NativeScopeReferenceViewRequest {
  readonly projectId: string;
  readonly scopeId: string;
  readonly title?: string;
  readonly composerOriginKey: string;
  readonly messageId?: string;
  readonly continuationOperationId?: string;
  /** The original Composer inspection request owns cancellation. */
  readonly signal?: AbortSignal;
}
export const nativeScopeReferenceViewEvent = 'lcos-native-open-scope-reference';
export function requestNativeScopeReferenceView(target: NativeScopeReferenceViewRequest): Promise<void> {
  if (!target || ['projectId', 'scopeId', 'composerOriginKey'].some(key => {
    const value = target[key as keyof NativeScopeReferenceViewRequest];
    return typeof value !== 'string' || !value.trim();
  }) || ['messageId', 'continuationOperationId'].some(key => {
    const value = target[key as keyof NativeScopeReferenceViewRequest];
    return value !== undefined && (typeof value !== 'string' || !value.trim());
  }) || target.title !== undefined && typeof target.title !== 'string') {
    throw new Error('这份内容的范围和原输入地址尚未确认。');
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false, timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { target.signal?.removeEventListener('abort', abort); if (timeout !== undefined) clearTimeout(timeout); };
    const accepted = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const failed = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const abort = () => failed(new DOMException('原输入已改看其他引用，未继续打开旧 Scope。', 'AbortError'));
    if (target.signal?.aborted) { abort(); return; }
    target.signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => failed(new Error('原库打开尚未确认，请重试；原输入和引用保留。')), 15_000);
    try { window.dispatchEvent(new CustomEvent(nativeScopeReferenceViewEvent, { detail: { ...target, isCurrent: () => !settled && !target.signal?.aborted, resolve: accepted, reject: failed } })); }
    catch (error) { failed(error); }
  });
}

