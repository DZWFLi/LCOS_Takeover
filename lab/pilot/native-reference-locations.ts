import { sameDraftReference, type CoreEntityRefLike } from '../../lcos/huabu/apps/web/src/lcos/referenceBridge';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership';
import { normalizeNativeTextLocations, normalizeNativeTextLocator, nativeTextLocatorGroup, nativeTextLocationKey,
  type NativeTextSingleLocator, type NativeTextSourceLocator } from './native-text-location';

type Row = Record<string, any>;
export interface NativeReferenceLocationFields { readonly sourceLocations?: readonly NativeTextSingleLocator[] }
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** GUI metadata only. A malformed payload cannot smuggle unchecked positions
 * into a valid semantic material reference or replace previously valid ones. */
export function nativeReferenceLocationFields(value: unknown): NativeReferenceLocationFields {
  const locations = record(value) ? normalizeNativeTextLocations(value.sourceLocations) : undefined;
  return locations?.length ? { sourceLocations: locations } : {};
}
export function normalizeNativeReferenceLocationFields<T extends object>(ref: T): T {
  if (!Object.hasOwn(ref, 'sourceLocations')) return ref;
  const normalized = nativeReferenceLocationFields(ref), value = { ...ref } as Row;
  delete value.sourceLocations;
  return { ...value, ...normalized } as T;
}
export function withNativeReferenceSourceLocation<T extends object>(ref: T, locator: unknown): T & NativeReferenceLocationFields {
  const normalized = normalizeNativeTextLocator(locator);
  const incoming = normalized ? 'locations' in normalized ? normalized.selected ? [normalized.selected] : normalized.locations : [normalized] : [];
  const old = nativeReferenceLocationFields(ref).sourceLocations ?? [];
  const sourceLocations = normalizeNativeTextLocations([...old, ...incoming]);
  return { ...normalizeNativeReferenceLocationFields(ref), ...(sourceLocations?.length ? { sourceLocations } : {}) };
}
/** The first semantic reference/address remains the owner. Only additional
 * validated positions are merged, in their observed order. */
export function mergeNativeReferenceLocations<T extends CoreEntityRefLike>(current: T, incoming: CoreEntityRefLike): T {
  if (!sameDraftReference(current, incoming)) return current;
  const before = nativeReferenceLocationFields(current).sourceLocations ?? [];
  const extra = nativeReferenceLocationFields(incoming).sourceLocations ?? [];
  const merged = normalizeNativeTextLocations([...before, ...extra]) ?? [];
  if (merged.length === before.length && merged.every((location, index) => nativeTextLocationKey(location) === nativeTextLocationKey(before[index]!))) return current;
  return { ...current, ...(merged.length ? { sourceLocations: merged } : {}) };
}
export function mergeNativeDraftReferenceLocations<T extends CoreEntityRefLike, D extends { readonly orderedEntityRefs: readonly T[] }>(draft: D, incoming: T): D {
  const index = draft.orderedEntityRefs.findIndex(ref => sameDraftReference(ref, incoming));
  if (index < 0) return draft;
  const before = draft.orderedEntityRefs[index]!, after = mergeNativeReferenceLocations(before, incoming);
  return after === before ? draft : { ...draft, orderedEntityRefs: draft.orderedEntityRefs.map((ref, at) => at === index ? after : ref) };
}
export function nativeReferenceSourceLocator(ref: unknown): NativeTextSourceLocator | undefined {
  const locations = nativeReferenceLocationFields(ref).sourceLocations;
  return locations?.length ? nativeTextLocatorGroup(locations) : undefined;
}

export interface NativeReferenceInspectExpected {
  readonly projectId: string;
  readonly inputKey?: string;
  readonly messageId?: string;
  readonly continuationOperationId?: string;
  readonly open: boolean;
}
export interface NativeReferenceInspectPorts {
  shell(): Row;
  canvas(): Row;
  references(): Row;
  snapshotReference(ref: CoreEntityRefLike): CoreEntityRefLike;
  subscribeShell(listener: () => void): () => void;
  subscribeCanvas(listener: () => void): () => void;
  subscribeReferences(listener: () => void): () => void;
  isRenderedCurrent(): boolean;
  readGraph(projectId: string, signal: AbortSignal): Promise<Row>;
  onBeforeRead(): void;
  /** Existing mixed-Scope Library route, retained only when that original
   * caller is present in the composed Composer source. Same lifetime above. */
  scopeUnavailableReason?(ref: CoreEntityRefLike): string | undefined;
  openScope?(request: { projectId: string; scopeId: string; title: string; composerOriginKey: string;
    messageId?: string; continuationOperationId?: string; signal: AbortSignal }): Promise<void>;
  /** Preserve an already-adopted native Viewer route and exact View identity. */
  openMaterial?(request: { projectId: string; artifactId: string; revisionId: string; title: string; composerOriginKey: string;
    artifactViewId?: string; sourceLocator?: NativeTextSourceLocator }): void;
}
const address = (ref: Row) => JSON.stringify([ref.entityType, ref.entityId, ref.artifactId, ref.artifactViewId, ref.revisionId, ref.mode, ref.presentationId,
  ...(nativeReferenceLocationFields(ref).sourceLocations ?? []).map(nativeTextLocationKey)]);

/** Original chip inspect, with exact original input/Canvas lifetime. Only
 * reads existing facts and calls the original shell.openReader destination. */
export async function inspectNativeReferenceLocation(ref: CoreEntityRefLike, title: string, expected: NativeReferenceInspectExpected,
  controller: AbortController, ports: NativeReferenceInspectPorts): Promise<boolean> {
  const canvas = ports.canvas(), shell = ports.shell(), references = ports.references();
  const api = canvas.rfInstance, canvasId = canvas.canvasId, workspace = shell.activeWorkspaceId, surface = shell.activeSurface;
  const surfaceCanvasId = shell.surfaceCanvasId?.[surface], captured = normalizeNativeReferenceLocationFields(ref);
  const capturedAddress = address(captured);
  const current = () => {
    const live = ports.shell(), currentCanvas = ports.canvas(), refs = ports.references();
    const owner = referencePickOwnerKey(live.projectId, live.composerTarget);
    const sending = owner !== undefined && [...(refs.referenceInputOperations?.values() ?? [])].some((operation: Row) => operation.owner === owner
      && operation.kind === 'sending' && (operation.inputKey === undefined || operation.inputKey === expected.inputKey));
    return !controller.signal.aborted && ports.isRenderedCurrent() && expected.open && live.composerOpen
      && live.projectId === expected.projectId && refs.projectId === expected.projectId
      && composerInputKey(live.composerTarget) === expected.inputKey
      && live.composerTarget?.messageId === expected.messageId && live.composerTarget?.continuationOperationId === expected.continuationOperationId
      && currentCanvas.status === 'ready' && currentCanvas.canvasId === canvasId && currentCanvas.rfInstance === api
      && live.activeWorkspaceId === workspace && live.activeSurface === surface && live.surfaceCanvasId?.[surface] === surfaceCanvasId
      && !sending && (refs.draft?.orderedEntityRefs ?? []).some((candidate: Row) => {
        const visible = ports.snapshotReference(candidate);
        return sameDraftReference(visible, captured) && address(visible) === capturedAddress;
      });
  };
  if (!text(expected.projectId) || !text(expected.inputKey) || canvas.status !== 'ready' || !text(canvasId) || !api
    || references.projectId !== expected.projectId || !current()) return false;
  const cancelIfChanged = () => { if (!current()) controller.abort(); };
  const releases = [ports.subscribeShell(cancelIfChanged), ports.subscribeCanvas(cancelIfChanged), ports.subscribeReferences(cancelIfChanged)];
  try {
    if (!current()) return false;
    ports.onBeforeRead();
    if (ref.entityType === 'scope') {
      const unavailable = ports.scopeUnavailableReason?.(ref);
      if (unavailable) throw new Error(unavailable);
      if (!ports.openScope) throw new Error('这份内容的原资料库入口尚未接通，原输入和引用保留。');
      if (!current()) return false;
      await ports.openScope({ projectId: expected.projectId, scopeId: ref.entityId, title, composerOriginKey: expected.inputKey!, signal: controller.signal,
        ...(expected.messageId === undefined ? {} : { messageId: expected.messageId }),
        ...(expected.continuationOperationId === undefined ? {} : { continuationOperationId: expected.continuationOperationId }) });
      return current();
    }
    let artifactId = ref.entityType === 'artifact' ? ref.entityId : ref.artifactId, revisionId = ref.revisionId;
    if (!artifactId || !revisionId) {
      const graph = await ports.readGraph(expected.projectId, controller.signal);
      if (!current()) return false;
      const viewId = ['view', 'artifactView'].includes(ref.entityType) ? ref.entityId : ref.artifactViewId;
      const view = viewId ? graph?.artifactViews?.find((candidate: Row) => String(candidate.id) === viewId) : undefined;
      if (viewId && (!view || artifactId && String(view.artifactId) !== artifactId)) throw new Error('原引用暂不可读取，未替换为其他材料。');
      artifactId = artifactId ?? (view ? String(view.artifactId) : undefined);
      const artifact = graph?.artifacts?.find((candidate: Row) => String(candidate.id) === artifactId);
      if (!artifact || String(artifact.projectId) !== expected.projectId) throw new Error('原引用不属于当前项目。');
      // Resolving View→Artifact may not replace an explicitly selected old
      // Revision with that View's newer display version.
      revisionId = revisionId ?? (view?.revisionId ? String(view.revisionId) : artifact.currentRevisionId ? String(artifact.currentRevisionId) : undefined);
    }
    if (!current()) return false;
    if (!artifactId || !revisionId) throw new Error('原引用没有可读版本，未打开最新版替代。');
    const sourceLocator = nativeReferenceSourceLocator(captured);
    const artifactViewId = ['view', 'artifactView'].includes(ref.entityType) ? ref.entityId : ref.artifactViewId;
    if (ports.openMaterial) ports.openMaterial({ projectId: expected.projectId, artifactId, revisionId, title, composerOriginKey: expected.inputKey!,
      ...(artifactViewId ? { artifactViewId } : {}), ...(sourceLocator ? { sourceLocator } : {}) });
    else ports.shell().openReader(title, artifactId, { revisionId, composerOriginKey: expected.inputKey, ...(sourceLocator ? { sourceLocator } : {}) });
    return true;
  } catch (error) {
    if (!current()) return false;
    throw error;
  } finally { releases.forEach(release => release()); }
}
