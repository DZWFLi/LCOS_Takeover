import type { LcosWindow } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { normalizeWindowRegion, removeRegionWindow, type WindowRegionInput } from '../../lcos/huabu/apps/web/src/lcos/shell/windowRegionTopology';
import type { NativeMaterialViewRequest } from './native-material-viewer-port';
import type { NativeMaterialVersion } from './native-material-viewer-read';
import type { NativeMaterialViewerRuntime } from './native-material-viewer-types';

// Transient provenance on existing restored UI addresses, never serialized.
const restoredReader = Symbol('native-restored-reader');
const recoveryRequest = Symbol('native-reader-recovery-request');
type RestoredWindow = LcosWindow & { [restoredReader]?: true };
export type RecoveryState = ReturnType<NativeMaterialViewerRuntime['getState']>;
export interface NativeReaderRecoveryLease {
  readonly projectId: string;
  readonly source: LcosWindow;
  readonly canvasId: string;
  readonly api: unknown;
  readonly isCurrent: () => boolean;
  readonly onClosed: () => void;
  readonly onStatus: (status: 'loading' | 'error' | 'open', message?: string) => void;
  cancelled: boolean;
  accepted: boolean;
  closed: boolean;
  ready?: { key: number; projectId: string; artifactId: string; revisionId: string; fileRecordId: string };
}
type Request = NativeMaterialViewRequest & { [recoveryRequest]?: NativeReaderRecoveryLease };
type Presentation = Record<string, any>;

/** setProject remains the only layout restore owner. No address is removed. */
export function markNativeReaderRestoreCandidates(windows: readonly LcosWindow[]): readonly LcosWindow[] {
  if (!windows.some(row => row.bodyKey === 'reader' && !(row as RestoredWindow)[restoredReader])) return windows;
  return windows.map(row => row.bodyKey === 'reader' && !(row as RestoredWindow)[restoredReader]
    ? { ...row, [restoredReader]: true as const } : row);
}
export function isNativeReaderRestoreCandidate(window: LcosWindow | undefined): boolean {
  return !!window && window.bodyKey === 'reader' && (window as RestoredWindow)[restoredReader] === true;
}
export function nativeReaderRecoveryRequest(target: NativeMaterialViewRequest, lease: NativeReaderRecoveryLease): NativeMaterialViewRequest {
  return { ...target, [recoveryRequest]: lease } as Request;
}
export function inheritNativeReaderRecovery(target: NativeMaterialViewRequest, next: NativeMaterialViewRequest): NativeMaterialViewRequest {
  const lease = (target as Request)[recoveryRequest];
  return lease ? nativeReaderRecoveryRequest(next, lease) : next;
}
const leaseOf = (target: NativeMaterialViewRequest | undefined): NativeReaderRecoveryLease | undefined => (target as Request | undefined)?.[recoveryRequest];
export function nativeReaderRecoveryCurrent(target: NativeMaterialViewRequest): boolean {
  const lease = leaseOf(target);
  return !lease || !lease.cancelled && !lease.closed && lease.isCurrent();
}
/** Only the successful resolver/bytes/decode path can create the ready proof. */
export function readyNativeReaderRecovery(target: NativeMaterialViewRequest, version: NativeMaterialVersion, key: number): void {
  const lease = leaseOf(target);
  if (!lease || !nativeReaderRecoveryCurrent(target)) return;
  if (version.projectId !== target.projectId || version.artifactId !== target.artifactId
    || target.revisionId !== undefined && version.revisionId !== target.revisionId || !version.fileRecordId) return;
  lease.ready = { key, projectId: version.projectId, artifactId: version.artifactId,
    revisionId: version.revisionId, fileRecordId: version.fileRecordId };
}
export function attachNativeReaderRecovery(value: Presentation, target: NativeMaterialViewRequest | undefined): Presentation {
  const lease = leaseOf(target);
  return lease ? { ...value, lcosControlled: { ...value.lcosControlled, readerRecovery: lease } } : value;
}
export function failNativeReaderRecovery(target: NativeMaterialViewRequest): void {
  const lease = leaseOf(target);
  if (lease && nativeReaderRecoveryCurrent(target)) lease.onStatus('error', '所选阅读地址暂未接管，原版本和返回位置仍保留。');
}
function stateLease(state: RecoveryState): NativeReaderRecoveryLease | undefined {
  return (state.session as Presentation | null)?.lcosControlled?.readerRecovery;
}
export function nativeReaderRecoveryIsOpen(state: RecoveryState, lease: NativeReaderRecoveryLease): boolean {
  return stateLease(state) === lease && state.phase === 'open' && !!lease.ready
    && state.session?.lcosControlled?.requestKey === lease.ready.key && !lease.cancelled && !lease.closed && lease.isCurrent();
}
/** Observe the original wa owner; an emitted request/initial loading is not ack. */
export function observeNativeReaderRecovery(target: NativeMaterialViewRequest, state: RecoveryState): void {
  const lease = leaseOf(target);
  if (lease && !lease.accepted && nativeReaderRecoveryIsOpen(state, lease)) {
    lease.accepted = true; lease.onStatus('open');
  }
}
/** Only an actual accepted wa session closing consumes its source address.
 * The callback is the original Stage close(reader), preserving its return owner. */
export function closeNativeReaderRecovery(target: NativeMaterialViewRequest): boolean {
  const lease = leaseOf(target);
  if (!lease) return false;
  if (lease.closed) return true;
  if (lease.accepted && !lease.cancelled && lease.isCurrent()) {
    lease.closed = true; lease.onClosed();
  } else if (!lease.cancelled && lease.isCurrent()) {
    lease.onStatus('error', '材料尚未接管，原阅读地址保留；可以重新打开同一版本。');
  }
  return true;
}

/** Presentation projection only. The shell/layout record remains unchanged
 * and therefore still restores after reload or same-tab project switching. */
export function nativeReaderRecoveryLayout(projectId: string, windows: readonly LcosWindow[], regions: readonly WindowRegionInput[], state: RecoveryState) {
  const lease = stateLease(state);
  const owned = lease && lease.projectId === projectId && isNativeReaderRestoreCandidate(lease.source)
    && windows.find(row => row.id === lease.source.id) === lease.source
    && !lease.cancelled && !lease.closed && lease.isCurrent()
    && (nativeReaderRecoveryIsOpen(state, lease) || lease.accepted && ['opening', 'open', 'closing'].includes(state.phase));
  if (!owned) return { windows, windowRegions: regions };
  return { windows: windows.filter(row => row !== lease.source), windowRegions: regions.map(normalizeWindowRegion)
    .map(region => removeRegionWindow(region, lease.source.id)).filter((region): region is NonNullable<typeof region> => !!region) };
}
