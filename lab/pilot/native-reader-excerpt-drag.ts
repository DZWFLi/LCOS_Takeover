import type { MaterialTransferPayloadV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import { normalizeNativeTextLocator } from './native-text-location';

export type NativeReaderExcerptDropResult = 'saved' | 'unconfirmed' | 'rejected' | 'stale' | 'owned';
export type NativeReaderExcerptDragResult = NativeReaderExcerptDropResult | 'cancelled';
type Ports = { payload: MaterialTransferPayloadV1; source: HTMLElement; current(): boolean;
  close(): boolean; finish(result: NativeReaderExcerptDragResult, current: boolean): void };
export type NativeReaderExcerptDrag = { viewerClosed(): void; dispose(): void };
type Active = NativeReaderExcerptDrag & { key: string; claim(): void; report(result: NativeReaderExcerptDropResult): void };
// One browser HTML drag has one original Reader owner. This is a temporary UI
// receipt callback, never material truth, a create queue or persistent state.
let active: Active | undefined;
function keyOf(payload: MaterialTransferPayloadV1): string | undefined {
  if (payload?.schemaVersion !== 1 || payload.kind !== 'material-transfer' || payload.content?.kind !== 'text'
    || typeof payload.capturedAt !== 'string') return;
  const source = payload.source, locator = normalizeNativeTextLocator(source?.locator);
  if (!source || !locator) return;
  return JSON.stringify([payload.capturedAt, source.projectId, source.artifactId, source.revisionId,
    source.viewId ?? null, source.fileRecordId ?? null, locator, payload.content.text]);
}
/** The existing receiver calls only after its real event/pane/source admission. */
export function claimNativeReaderExcerptDrop(payload: MaterialTransferPayloadV1): boolean {
  const key = keyOf(payload); if (!key || !active || active.key !== key) return false;
  active.claim(); return true;
}
/** A browser copy effect is not a saved create. Use the actual original queue
 * and canonical receipt result from the current receiver. */
export function reportNativeReaderExcerptDrop(payload: MaterialTransferPayloadV1, result: NativeReaderExcerptDropResult): boolean {
  const key = keyOf(payload); if (!key || !active || active.key !== key) return false;
  active.report(result); return true;
}
export function beginNativeReaderExcerptDrag(ports: Ports): NativeReaderExcerptDrag | undefined {
  const key = keyOf(ports.payload), view = ports.source.ownerDocument.defaultView;
  if (!key || !view || !ports.source.isConnected || !ports.current()) return;
  active?.dispose();
  let live = true, frame: number | undefined, requestedClose = false, closed = false, ended = false, claimed = false;
  let outcome: NativeReaderExcerptDropResult | undefined;
  const release = () => {
    if (!live) return; live = false; if (frame !== undefined) view.cancelAnimationFrame(frame);
    ports.source.removeEventListener('dragend', end);
    if (active === owner) active = undefined;
  };
  const settle = () => {
    if (!live || !ended || requestedClose && !closed || claimed && !outcome) return;
    const result = outcome ?? 'cancelled', current = ports.current(); release();
    ports.finish(result, current);
  };
  const end = (_event: Event) => { ended = true;
    // A quick cancelled gesture may finish before the scheduled original close.
    if (!requestedClose && frame !== undefined) { view.cancelAnimationFrame(frame); frame = undefined; }
    settle();
  };
  const owner: Active = { key,
    viewerClosed() { if (!live) return; closed = true; settle(); },
    claim() { if (live) claimed = true; },
    report(result) { if (!live) return; claimed = true; outcome = result; settle(); },
    dispose: release,
  };
  active = owner;
  // Keep the listener on the actual source itself: Chrome dispatches its real
  // dragend there even after the original closing animation unmounts it.
  ports.source.addEventListener('dragend', end, { once: true });
  frame = view.requestAnimationFrame(() => {
    frame = undefined; if (!live || !ports.current()) { release(); return; }
    requestedClose = ports.close();
    if (!requestedClose) { ended = true; settle(); }
  });
  return owner;
}
