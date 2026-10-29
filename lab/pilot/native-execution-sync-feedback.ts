import type { NativeDropNotice } from './native-library-drop-feedback';
import type { NativeExecutionProjectionSyncState } from './native-execution-sync';

interface FeedbackPort {
  isCurrent(): boolean;
  retry(): void;
}
/** A renderer adapter for one original synchronization owner, not a scheduler
 * or a second sync state. The original controller owns all actual work. */
export function createNativeExecutionSyncFeedbackController(notice: NativeDropNotice, port: FeedbackPort) {
  let id: string | number | undefined, visible = false, disposed = false, invalid = false;
  let state: NativeExecutionProjectionSyncState | undefined, lastKey: string | undefined;
  let actionOwner: object | undefined, retryPending = false;
  const remove = () => {
    if (visible && id !== undefined) notice.dismiss(id);
    visible = false; lastKey = undefined; actionOwner = undefined; retryPending = false;
  };
  const current = () => !disposed && !invalid && port.isCurrent();
  const validate = () => {
    if (current()) return true;
    invalid = true; remove(); return false;
  };
  const publish = () => {
    if (!validate() || !state) return;
    if (state.status === 'ready') { remove(); return; }
    const busy = state.status === 'syncing' || retryPending;
    const title = busy ? '正在更新画布中的任务…' : '画布中的任务暂时无法更新，已有内容保留。';
    const retryable = state.status === 'blocked' && !busy;
    const key = JSON.stringify([title, retryable]);
    if (visible && key === lastKey) return;
    lastKey = key;
    const held = retryable ? {} : undefined; actionOwner = held;
    id = notice({ id, title, duration: 0, dismissible: false,
      action: held ? { label: '重试更新', onClick: event => {
        event?.preventDefault();
        if (!validate() || actionOwner !== held || state?.status !== 'blocked' || retryPending) return;
        retryPending = true; publish();
        // The exact original callback requests its ordinary debounced retry.
        // This adapter neither runs a producer nor retries automatically.
        try { port.retry(); }
        catch {
          if (validate()) { retryPending = false; lastKey = undefined; publish(); }
        }
      } } : undefined });
    visible = true;
  };
  return {
    update(next: NativeExecutionProjectionSyncState) {
      if (!validate()) return;
      state = next; retryPending = false; publish();
    },
    invalidate() { validate(); },
    dispose() { if (disposed) return; remove(); disposed = true; },
  };
}
