// Transient provenance on the one shipped Viewer request. No persisted window,
// draft, material, or independent navigation store is introduced.
const readingReturn = Symbol('native-library-reading-return');
export interface NativeLibraryReadingReturn {
  readonly projectId: string;
  readonly rootKind: string;
  readonly rootId: string;
  readonly current: () => boolean;
  readonly onReturn: () => void | Promise<void>;
  readonly onUse?: () => void;
  readonly onRelease?: (preserveOrigin: boolean) => void;
  closed: boolean;
  returning?: boolean;
}
type Address = { readonly projectId: string };
type Request = Address & { [readingReturn]?: NativeLibraryReadingReturn };
let active: NativeLibraryReadingReturn | undefined;
const leaseOf = (request: Address | undefined) => (request as Request | undefined)?.[readingReturn];
export function withNativeLibraryReadingReturn<T extends Address>(request: T, lease: NativeLibraryReadingReturn): T {
  if (active && active !== lease) cancelNativeLibraryReadingReturn(active, true);
  active = lease;
  return { ...request, [readingReturn]: lease };
}
export function inheritNativeLibraryReadingReturn<T extends Address>(source: Address, next: T): T {
  const lease = leaseOf(source);
  return lease ? { ...next, [readingReturn]: lease } : next;
}
export function nativeLibraryReadingReturnCurrent(request: Address): boolean {
  const lease = leaseOf(request);
  return !lease || active === lease && !lease.closed && lease.current();
}
export function nativeLibraryReadingRetains(projectId: string, kind: string, id: string): boolean {
  return !!active && !active.closed && active.projectId === projectId && active.rootKind === kind && active.rootId === id && active.current();
}
export function hasNativeLibraryReadingReturn(request: Address): boolean { return !!leaseOf(request); }
export function sameNativeLibraryReadingReturn(a: Address, b: Address): boolean { return leaseOf(a) === leaseOf(b); }
export function releaseNativeLibraryReadingReturn(request: Address, returning: boolean, used = false): boolean {
  const lease = leaseOf(request);
  if (!lease) return false;
  if (lease.returning) return true;
  const current = active === lease && !lease.closed && lease.current();
  if (used && current) lease.onUse?.();
  if (returning && current) {
    lease.returning = true;
    const result = lease.onReturn();
    if (result && typeof result.then === 'function') {
      void result.then(() => cancelNativeLibraryReadingReturn(lease), () => cancelNativeLibraryReadingReturn(lease));
      return true;
    }
  }
  cancelNativeLibraryReadingReturn(lease);
  return true;
}
export function cancelNativeLibraryReadingReturn(lease: NativeLibraryReadingReturn | undefined, preserveOrigin = false): void {
  const notify = !!lease && !lease.closed;
  if (lease) lease.closed = true;
  if (active === lease) active = undefined;
  if (notify) lease.onRelease?.(preserveOrigin || lease.returning === true);
}
