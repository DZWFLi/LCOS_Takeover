export type NativeLibraryMemberKind = 'context' | 'workflow' | 'collection';

export interface NativeLibraryMemberAddress {
  readonly projectId: string;
  readonly canvasId: string;
  readonly kind: NativeLibraryMemberKind;
  readonly id: string;
}

export interface NativeLibraryMemberEntryPorts {
  current(): boolean;
  openLibrary(): void;
  list(): {
    readonly projectId: string;
    readonly canvasId: string;
    openEntry(kind: NativeLibraryMemberKind, id: string, current: () => boolean, signal: AbortSignal): Promise<void>;
  } | null;
  frame(callback: () => void): unknown;
  timeoutMs?: number;
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const cancelled = () => new DOMException('原内容入口已取消。', 'AbortError');

/** Wait for the existing Library and open one exact original entry. All
 * ownership belongs to this call; a late result cannot revive an old entry. */
export async function openNativeLibraryMemberEntry(address: NativeLibraryMemberAddress,
  ports: NativeLibraryMemberEntryPorts, signal?: AbortSignal): Promise<void> {
  if (!address || !nonEmpty(address.projectId) || !nonEmpty(address.canvasId) || !nonEmpty(address.id)
    || !['context', 'workflow', 'collection'].includes(address.kind))
    throw new Error('内容来源尚未确认，请重新打开。');

  const { projectId, canvasId, kind, id } = address;
  if (signal?.aborted || !ports.current()) throw cancelled();

  const controller = new AbortController();
  let settled = false, timedOut = false;
  const current = () => !settled && !controller.signal.aborted && !signal?.aborted && ports.current();
  const ensureCurrent = () => {
    if (current()) return;
    controller.abort();
    throw cancelled();
  };
  const cancel = () => controller.abort();
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = () => rejectAbort(timedOut
    ? new Error('原资料库打开尚未确认，返回位置保留；请重试。') : cancelled());
  const interruption = new Promise<never>((_, reject) => { rejectAbort = reject; });
  controller.signal.addEventListener('abort', aborted, { once: true });
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ports.timeoutMs ?? 12000);

  const opening = async () => {
    ensureCurrent();
    ports.openLibrary();
    ensureCurrent();
    while (current()) {
      const owner = ports.list();
      ensureCurrent();
      if (owner?.projectId === projectId && owner.canvasId === canvasId) {
        await owner.openEntry(kind, id, current, controller.signal);
        ensureCurrent();
        return;
      }
      await new Promise<void>(resolve => ports.frame(resolve));
      ensureCurrent();
    }
    ensureCurrent();
  };

  try {
    // An original entry may be awaiting a read that does not settle on abort.
    // Race the read rather than waiting for it to acknowledge cancellation.
    await Promise.race([opening(), interruption]);
  } finally {
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', aborted);
    controller.abort();
  }
}
