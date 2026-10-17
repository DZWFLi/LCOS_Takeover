import type { DropPayload, SemanticDropState } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import { ASSEMBLY_DRAG_MIME } from '../../lcos/huabu/apps/web/src/lcos/drop/nativeAssemblyDrop';
import { assemblyDraftReferenceOf, assemblySourceRefOf } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef';
import { nativeAssemblyItem } from './native-assembly-policy';
import type { DropCommitReceipt } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';

export type NativeLibraryAssemblyPayload = Extract<DropPayload, { kind: 'assembly' }>;
export interface NativeLibraryDropOrigin { projectId: string; canvasId: string; api: object }
export interface NativeLibraryDropCapture extends NativeLibraryDropOrigin {
  artifactId: string; artifactViewId: string; revisionId: string; fileRecordId: string; title: string;
  startScreenPoint: { x: number; y: number };
}
interface DragEventLike {
  readonly clientX: number; readonly clientY: number;
  readonly dataTransfer: { effectAllowed: string; setData(type: string, value: string): void };
  preventDefault(): void; stopPropagation(): void; stopImmediatePropagation?(): void;
  readonly nativeEvent?: { stopImmediatePropagation?(): void };
}
export interface NativeLibraryDropPort {
  readOrigin(): NativeLibraryDropOrigin | null;
  read(): { state: SemanticDropState };
  acquire(payload: NativeLibraryAssemblyPayload): void;
  cancel(): void;
  notice(message: string): void;
}
const captureKey = Symbol('native-library-drop-source');
type CapturedPayload = NativeLibraryAssemblyPayload & { [captureKey]?: NativeLibraryDropCapture };
const placementReceiptKey = Symbol('native-library-drop-placement-receipt');
interface PlacementReceiptProof {
  payload: CapturedPayload; source: NativeLibraryDropCapture; transactionId: string; targetId: string; projectId: string;
}
type PlacementReceipt = DropCommitReceipt & { [placementReceiptKey]?: PlacementReceiptProof };
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Malformed LCOS rows must never degrade into the original URL factory. */
export function isNativeCoreLibraryAsset(asset: unknown): boolean {
  return record(asset) && ('lcos_projection' in asset || 'lcos_library_entry' in asset);
}
const consume = (event: Pick<DragEventLike, 'preventDefault' | 'stopPropagation' | 'stopImmediatePropagation' | 'nativeEvent'>) => {
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); event.nativeEvent?.stopImmediatePropagation?.();
};
const sameOrigin = (a: NativeLibraryDropOrigin, b: NativeLibraryDropOrigin | null) => b !== null
  && a.projectId === b.projectId && a.canvasId === b.canvasId && a.api === b.api;

/** One source snapshot attached to the existing gesture payload, no second
 * Map/store/history. It is not authorization: the commit dispatcher must still
 * verify its original API/scene and exact Core Graph at RELEASE time. */
export function readNativeLibraryDropCapture(payload: unknown): NativeLibraryDropCapture | null {
  const captured = (payload as CapturedPayload | null)?.[captureKey];
  return captured ? { ...captured, startScreenPoint: { ...captured.startScreenPoint } } : null;
}

/** A real native material result is not an Assembly item list. Bind its
 * presentation receipt to this exact original payload; do not serialize it or
 * turn unknown into the generic Assembly retry path. Core remains the proof
 * of the actual placement, supplied by the caller before it marks a result. */
export function markNativeLibraryPlacementReceipt<T extends DropCommitReceipt>(receipt: T, payload: unknown): T {
  const source = (payload as CapturedPayload | null)?.[captureKey];
  if (!source || receipt.projectId !== source.projectId || !nonEmpty(receipt.transactionId) || !nonEmpty(receipt.targetId)
    || receipt.retrySourceRefs?.length) throw new Error('Native material receipt does not belong to this original gesture.');
  return { ...receipt, [placementReceiptKey]: { payload: payload as CapturedPayload, source, transactionId: receipt.transactionId,
    targetId: receipt.targetId, projectId: receipt.projectId } };
}

export function isNativeLibraryPlacementReceipt(receipt: DropCommitReceipt, payload: unknown): boolean {
  const proof = (receipt as PlacementReceipt)[placementReceiptKey], source = (payload as CapturedPayload | null)?.[captureKey];
  return !!proof && !!source && proof.payload === payload && proof.source === source && proof.projectId === source.projectId
    && receipt.projectId === proof.projectId && receipt.transactionId === proof.transactionId
    && receipt.targetId === proof.targetId && !receipt.retrySourceRefs?.length;
}

/** Called by the original row AFTER it writes Ko and before its original
 * hover/drag styling. The Ko JSON and drag image remain owned by that row. */
export function beginNativeLibraryAssemblyDrop(event: DragEventLike, asset: unknown, port: NativeLibraryDropPort): 'legacy' | 'started' | 'rejected' {
  if (!isNativeCoreLibraryAsset(asset)) return 'legacy';
  const reject = (message: string) => { consume(event); port.notice(message); return 'rejected' as const; };
  const liveOrigin = port.readOrigin();
  const origin = liveOrigin ? { projectId: liveOrigin.projectId, canvasId: liveOrigin.canvasId, api: liveOrigin.api } : null;
  if (!origin || !nonEmpty(origin.projectId) || !nonEmpty(origin.canvasId) || !origin.api
    || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))
    return reject('当前项目或画布尚未就绪，材料保留；请稍后再拖动。');
  let item: ReturnType<typeof nativeAssemblyItem>;
  try { item = nativeAssemblyItem({ asset }, origin.projectId); }
  catch { return reject('材料的准确版本暂时无法核对，原内容保留；请重读材料后再拖动。'); }
  const sourceRef = assemblySourceRefOf(item), reference = assemblyDraftReferenceOf(item);
  if (sourceRef?.kind !== 'artifactView' || !reference || !nonEmpty(item.entityRef.viewId))
    return reject('这个版本暂时不能拖放，仍可查看或加入本次引用。');
  const state = port.read().state;
  if (state.status !== 'idle' && state.status !== 'failed')
    return reject('上一项拖放尚未结束，当前材料保留；请先完成或取消。');
  const value = asset as Record<string, any>, projection = value.lcos_projection;
  const title = typeof item.title === 'string' ? item.title : typeof value.name === 'string' ? value.name : '材料';
  const capture: NativeLibraryDropCapture = { ...origin, artifactId: item.entityRef.id, artifactViewId: sourceRef.id,
    revisionId: item.presentedRevisionId!, fileRecordId: projection.file_record_id, title,
    startScreenPoint: { x: event.clientX, y: event.clientY } };
  const payload: CapturedPayload = { kind: 'assembly', itemId: item.entityRef.id, sourceRef: { ...sourceRef },
    entityRef: { type: 'artifact', id: item.entityRef.id }, reference: { ...reference, artifactId: item.entityRef.id,
      artifactViewId: sourceRef.id, revisionId: item.presentedRevisionId!, displayLabel: title }, [captureKey]: capture };
  try {
    event.dataTransfer.setData(ASSEMBLY_DRAG_MIME, JSON.stringify({ itemId: payload.itemId, sourceRef: payload.sourceRef,
      entityRef: payload.entityRef, reference: payload.reference }));
    if (!sameOrigin(origin, port.readOrigin())) return reject('现场已经切换，本次拖放已取消，材料没有移动。');
    port.acquire(payload);
    const current = port.read().state;
    if (!('payload' in current) || current.payload !== payload) return reject('拖放入口尚未接好，原材料保留，请稍后重试。');
    // Existing native Assembly receiver uses copy. Preserve native Ko's move
    // compatibility as well, without changing its image or row selection.
    event.dataTransfer.effectAllowed = 'copyMove';
    return 'started';
  } catch {
    const current = port.read().state;
    if ('payload' in current && current.payload === payload && ['tracking', 'dwell', 'preview'].includes(current.status)) port.cancel();
    return reject('拖放入口暂时无法准备，原材料保留，请稍后重试。');
  }
}

/** Safety net in the original document drop. The existing window capture
 * owns real commits. Core data reaching here was not admitted there, so it is
 * consumed and reported, never passed to original Qe/Te URL import. */
export function rejectNativeLibraryDropFallback(event: Pick<DragEventLike, 'preventDefault' | 'stopPropagation' | 'stopImmediatePropagation' | 'nativeEvent'>,
  asset: unknown, notice: (message: string) => void): boolean {
  let source = asset;
  if (typeof source === 'string') { try { source = JSON.parse(source); } catch { return false; } }
  if (!isNativeCoreLibraryAsset(source)) return false;
  consume(event); notice('这次材料拖放尚未确认，原材料和布局保留；请返回材料重试。'); return true;
}
