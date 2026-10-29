// Query hooks share the shipped ReactFlow provider. No provider, store, Canvas,
// mutable snapshot or history is created by this compatibility module.
// Verified donor exports: l -> ce (useContext Ja + original selector hook),
// cK -> we (the same Ja store API), e -> dr (the same Canvas query API).
import { l as originalUseStore } from '/assets/UnlimitedModeToggle-D4wysAbz.js';

export { originalUseStore as useStore };
export { cK as useStoreApi, e as useReactFlow } from '/assets/UnlimitedModeToggle-D4wysAbz.js';
// XD is the original text carrier factory; the shipped page imports b_ as fi.
// Keep its IDs, defaults and policy reads. Creation is still queued by the
// original Canvas API, never by this query/factory shim.
export { b_ as createOriginalTextCarrier } from '/assets/UnlimitedModeToggle-D4wysAbz.js';
// One shipped upload manager for Canvas, Library and the controlled Composer.
// Uploading alone does not create a Canvas carrier or send a conversation.
export { ai as useOriginalFileUploadManager } from '/assets/course-api-base-url-CifxI1ia.js';

const viewport = state => ({ x: state.transform[0], y: state.transform[1], zoom: state.transform[2] });
const equalViewport = (left, right) => left.x === right.x && left.y === right.y && left.zoom === right.zoom;

export function useViewport() {
  return originalUseStore(viewport, equalViewport);
}
