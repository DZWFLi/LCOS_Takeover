import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import type { WarehouseItemV1, WarehouseSnapshotV1, ProjectGraphSnapshot, PresentationViewV0 } from '../../lcos/packages/contracts/src/index.ts';
import type { Workspace } from '../../lcos/packages/domain/src/index.ts';
import { CoreAssemblyClient } from '../../lcos/apps/web-gen2/src/backend/assembly.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore.ts';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts';
import { prepareDraftReferences, runReferenceUnavailableReason } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts';
import { buildWorkflowMethodDraft, readWorkflowScopeMethodDraft, type WorkflowMethodDraft } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodDraft.ts';
import { appendWorkflowMethodDraft } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodTake.ts';
import { workspaceTargetsForItem } from '../../lcos/huabu/apps/web/src/lcos/navigation/workspaceTargets.ts';
import { reviewAssemblyApply } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview.ts';
import type { LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { createNativeContextReferencePort } from './native-context-reference.ts';
import { readSelectedCanvasNodes } from './native-material-actions.tsx';
import { isNativeSavedContextOwnerCurrent } from './native-saved-context-owner.ts';
import { collectionPreviewMembers, type CoreCollectionMembersSnapshot } from '../../lcos/apps/web-gen2/src/backend/collections.ts';
import { placeNativeLibraryCollection, readNativeLibraryCollectionProjection, isNativeLibraryCollectionCarrier,
  type NativeLibraryCollectionPlacementResult, type NativeLibraryCollectionProjection } from './native-library-collection-placement';
import { locateNativeMaterialNodes } from './native-material-placement-client';
import { NativeLibraryPlacementProvider, useNativeLibraryPlacementStore, useNativeLibraryPlacementAttempt,
  nativeLibraryPlacementAddress, beginNativeLibraryPlacementAttempt, settleNativeLibraryPlacementAttempt,
  type NativeLibraryPlacementStore } from './native-library-placement-state';
import useCanvasStore from './native-canvas-port.ts';
import './native-assembly.css';

type Kind = 'context' | 'workflow' | 'collection';
export interface NativeLibraryEntry { readonly projectId: string; readonly item: WarehouseItemV1 }
type OriginalProps = Record<string, any>;
type Page = { items: readonly WarehouseItemV1[]; loading: boolean; page: number; nextCursor?: string; total: number; failed?: boolean;
  source?: { projectId: string; canvasId: string; api: unknown; query: string } };
const blank = (): Page => ({ items: [], loading: true, page: 1, total: 0 });
const kinds: readonly Kind[] = ['context', 'workflow', 'collection'];
const label = (kind: Kind) => kind === 'context' ? '已保存上下文' : kind === 'workflow' ? '方法' : '集合';
const record = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
class UserError extends Error {}

type InputShell = Pick<ReturnType<typeof useLcosShellStore.getState>, 'projectId' | 'composerTarget' | 'composerPrompt'
  | 'composerCaret' | 'rememberComposerCaret' | 'resumeComposer'>;
export interface NativeLibraryInputReturnPorts {
  shell(): InputShell;
  canvas(): { canvasId: string | null; rfInstance: unknown };
  editor(nodeId: string): HTMLTextAreaElement | null;
  open(): void;
  frame(callback: FrameRequestCallback): number;
}
export interface NativeLibraryInputReturn {
  readonly projectId: string;
  readonly inputKey: string;
  readonly nodeId: string;
  readonly messageId?: string;
  readonly continuationOperationId?: string;
  readonly canvasId: string | null;
  readonly api: unknown;
}
const inputReturnPorts: NativeLibraryInputReturnPorts = {
  shell: () => useLcosShellStore.getState(),
  canvas: () => useCanvasStore.getState(),
  editor: nodeId => [...document.querySelectorAll<HTMLTextAreaElement>('[data-lcos-composer-target] textarea[data-lcos-composer-input]')]
    .find(editor => editor.closest('[data-lcos-composer-target]')?.getAttribute('data-lcos-composer-target') === nodeId) ?? null,
  open: () => window.dispatchEvent(new CustomEvent('lcos-native-open-conversation')),
  frame: callback => requestAnimationFrame(callback),
};

/** A return address, not another draft. Capture the actual original editor's
 * caret while the original input is still owned; never copy its text back. */
export function captureNativeLibraryInputReturn(projectId: string, ports = inputReturnPorts): NativeLibraryInputReturn | null {
  const shell = ports.shell(), target = shell.composerTarget, inputKey = composerInputKey(target);
  if (shell.projectId !== projectId || !target || !inputKey) return null;
  const editor = ports.editor(target.nodeId), canvas = ports.canvas();
  if (editor?.isConnected && editor.value === shell.composerPrompt) shell.rememberComposerCaret({
    projectId, targetKey: inputKey, text: editor.value, start: editor.selectionStart, end: editor.selectionEnd,
  });
  return { projectId, inputKey, nodeId: target.nodeId, messageId: target.messageId,
    continuationOperationId: target.continuationOperationId, canvasId: canvas.canvasId, api: canvas.rfInstance };
}

/** Reopen only the same input and let its original editor keep the latest draft
 * and caret. The native rail can publish its textarea after the Popover closes. */
export async function restoreNativeLibraryInputReturn(owner: NativeLibraryInputReturn | null,
  ports = inputReturnPorts): Promise<boolean> {
  if (!owner) return false;
  const same = () => {
    const shell = ports.shell(), canvas = ports.canvas(), target = shell.composerTarget;
    return shell.projectId === owner.projectId && composerInputKey(target) === owner.inputKey
      && target?.messageId === owner.messageId && target?.continuationOperationId === owner.continuationOperationId
      && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api;
  };
  if (!same()) return false;
  ports.open();
  if (!same() || !ports.shell().resumeComposer(owner.inputKey)) return false;
  return new Promise(resolve => {
    let frames = 0, settled = false;
    const finish = (value: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish(false), 1200);
    const focus = () => {
      if (settled) return;
      if (!same()) { finish(false); return; }
      const editor = ports.editor(owner.nodeId);
      if (editor?.isConnected && !editor.closest('[hidden], [inert]') && editor.getClientRects().length) {
        const shell = ports.shell(), caret = shell.composerCaret;
        editor.focus({ preventScroll: true });
        // A newer selection or edited draft wins over anything captured before
        // the read. Never set textarea.value, even when a method appended text.
        if (caret?.projectId === owner.projectId && caret.targetKey === owner.inputKey
          && caret.text === shell.composerPrompt && editor.value === caret.text)
          editor.setSelectionRange(caret.start, caret.end);
        finish(true); return;
      }
      if (++frames >= 60) { finish(false); return; }
      ports.frame(focus);
    };
    ports.frame(focus);
  });
}

let libraryInputOrigin: NativeLibraryInputReturn | null = null;
const originListeners = new Set<() => void>();
const subscribeInputOrigin = (listener: () => void) => { originListeners.add(listener); return () => { originListeners.delete(listener); }; };
function setLibraryInputOrigin(value: NativeLibraryInputReturn | null) {
  libraryInputOrigin = value; originListeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') window.addEventListener('lcos-native-open-library', event => {
  const detail = (event as CustomEvent).detail;
  const projectId = useLcosShellStore.getState().projectId;
  const origin = projectId && detail?.projectId === projectId ? captureNativeLibraryInputReturn(projectId) : null;
  setLibraryInputOrigin(origin?.inputKey === detail?.composerOriginKey ? origin : null);
});
if (typeof window !== 'undefined') window.addEventListener('lcos-native-library-closed', event => {
  const detail = (event as CustomEvent).detail;
  if (libraryInputOrigin?.canvasId === detail?.canvasId && libraryInputOrigin?.api === detail?.api) setLibraryInputOrigin(null);
});
/** Only an explicit input-origin Library invocation changes the native Apply
 * action into a reference pick. A merely open Composer is not that intent. */
export function useNativeLibraryInputOrigin(): NativeLibraryInputReturn | null {
  return useSyncExternalStore(subscribeInputOrigin, () => libraryInputOrigin, () => null);
}

/** These identifiers address transient native list rows, never Core entities. */
export const nativeLibraryCategoryId = (projectId: string, kind: Kind): string => `lcos-library-category:${encodeURIComponent(projectId)}:${kind}`;

export function nativeLibraryEntry(detail: unknown, projectId?: string): NativeLibraryEntry | undefined {
  const entry = record(detail) && record(detail.asset) ? detail.asset.lcos_library_entry : undefined;
  if (!record(entry) || !nonEmpty(entry.projectId) || projectId !== undefined && entry.projectId !== projectId) return undefined;
  const item = entry.item;
  if (!record(item) || item.schemaVersion !== 1 || !kinds.includes(item.kind) || typeof item.title !== 'string'
    || !record(item.entityRef) || item.entityRef.type !== item.kind || !nonEmpty(item.entityRef.id)
    || typeof item.usageCount !== 'number' || !Number.isFinite(item.usageCount)) return undefined;
  return entry as NativeLibraryEntry;
}

export function nativeLibraryEntryAssets(projectId: string, kind: Kind, items: readonly WarehouseItemV1[]): readonly OriginalProps[] {
  if (!nonEmpty(projectId) || !kinds.includes(kind) || !Array.isArray(items)) throw new UserError('列表暂时无法读取，请重新读取。');
  const seen = new Set<string>();
  return items.map(item => {
    const entry = nativeLibraryEntry({ asset: { lcos_library_entry: { projectId, item } } }, projectId);
    if (!entry || item.kind !== kind || seen.has(item.entityRef.id)) throw new UserError('列表身份尚未确认，请重新读取。');
    seen.add(item.entityRef.id);
    return { id: `lcos-library-entry:${kind}:${item.entityRef.id}`, name: item.title, asset_type: 4,
      folder_id: nativeLibraryCategoryId(projectId, kind), space_type: 'SPACE_TYPE_PRIVATE',
      source_url: '', thumbnail_url: '', content: item.title, created_at: '',
      lcos_library_entry: entry };
  });
}

/** Native tF search consumes detail envelopes; folder rows consume assets. */
export function nativeLibraryEntrySearchResults(projectId: string, kind: Kind, items: readonly WarehouseItemV1[]): readonly OriginalProps[] {
  return nativeLibraryEntryAssets(projectId, kind, items).map(asset => ({ asset, folder_name: label(kind), folder_display_path: label(kind) }));
}

function readPage(snapshot: WarehouseSnapshotV1, projectId: string, kind: Kind, previous?: Page): Page {
  if (snapshot?.schemaVersion !== 1 || snapshot.projectId !== projectId || !Array.isArray(snapshot.items)
    || snapshot.nextCursor !== undefined && !nonEmpty(snapshot.nextCursor)) throw new UserError('列表暂时无法读取，请重新读取。');
  nativeLibraryEntryAssets(projectId, kind, snapshot.items);
  const items = [...(previous?.items ?? []), ...snapshot.items];
  nativeLibraryEntryAssets(projectId, kind, items);
  if (snapshot.nextCursor && previous?.nextCursor === snapshot.nextCursor) throw new UserError('列表更新尚未确认，请重新读取。');
  return { items, loading: false, nextCursor: snapshot.nextCursor, page: (previous?.page ?? 0) + 1, total: snapshot.totalApprox };
}

/** Same original sF owns folder layout, search results and virtual scrolling.
 * Read props extend the folders; transient placement state stays in that same
 * original Library store, surviving the original row/Library close operation. */
export function LCOSNativeLibraryContexts({ NativeLibrary, NativeLibraryStore, originalProps, canvasId, activeSpace }: {
  NativeLibrary: ComponentType<any>; NativeLibraryStore: NativeLibraryPlacementStore; originalProps: OriginalProps; canvasId: string; activeSpace?: string;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const canvas = useCanvasStore(state => state);
  const session = useMemo(() => createLcosCoreSession(), []);
  const assembly = useMemo(() => new CoreAssemblyClient(session.http), [session]);
  const [pages, setPages] = useState<Record<Kind, Page>>({ context: blank(), workflow: blank(), collection: blank() });
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [readKey, setReadKey] = useState(0);
  const query = String(originalProps.searchKeyword ?? '');
  const generation = useRef(0);
  const pending = useRef(new Set<Kind>());
  const latest = useRef(pages); latest.current = pages;
  const owner = nonEmpty(projectId) && canvas.status === 'ready' && canvas.canvasId === canvasId;
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    pending.current.clear();
    // A project invalidation must not unmount the open native row/Popover while
    // its own confirmed Add action is reading back the canonical membership.
    setPages(current => Object.fromEntries(kinds.map(kind => {
      const page = current[kind];
      const same = page.source?.projectId === projectId && page.source.canvasId === canvasId
        && page.source.api === canvas.rfInstance && page.source.query === query;
      return [kind, same ? { ...page, loading: true, failed: false } : blank()];
    })) as Record<Kind, Page>);
    if (!owner || !projectId) return () => controller.abort();
    for (const kind of kinds) {
      pending.current.add(kind);
      void assembly.queryWarehouse(projectId, { kinds: [kind], search: query, limit: 100 }, controller.signal)
        .then(snapshot => { if (version === generation.current && !controller.signal.aborted) {
          const page = { ...readPage(snapshot, projectId, kind), source: { projectId, canvasId, api: canvas.rfInstance, query } };
          setPages(current => ({ ...current, [kind]: page }));
        } }).catch(() => { if (version === generation.current && !controller.signal.aborted)
          setPages(current => ({ ...current, [kind]: { ...blank(), loading: false, failed: true,
            source: { projectId, canvasId, api: canvas.rfInstance, query } } }));
        }).finally(() => { if (version === generation.current) pending.current.delete(kind); });
    }
    return () => { generation.current += 1; controller.abort(); };
  }, [projectId, canvasId, canvas.rfInstance, owner, query, readKey, assembly]);
  useEffect(() => { setExpanded([]); }, [projectId]);
  useEffect(() => projectId ? useCollaborationSessionStore.getState().watchProjectChanges(projectId,
    () => setReadKey(value => value + 1)) : undefined, [projectId]);
  const category = (id: string): Kind | undefined => projectId ? kinds.find(kind => nativeLibraryCategoryId(projectId, kind) === id) : undefined;
  const loadMore = async (kind: Kind) => {
    const current = latest.current[kind];
    if (!owner || !projectId || pending.current.has(kind) || !current.nextCursor) return;
    const version = generation.current;
    pending.current.add(kind);
    setPages(value => ({ ...value, [kind]: { ...value[kind], loading: true, failed: false } }));
    try {
      const snapshot = await assembly.queryWarehouse(projectId, { kinds: [kind], search: query, limit: 100, cursor: current.nextCursor });
      if (version === generation.current) {
        const page = { ...readPage(snapshot, projectId, kind, current), source: { projectId, canvasId, api: canvas.rfInstance, query } };
        setPages(value => ({ ...value, [kind]: page }));
      }
    } catch { if (version === generation.current) setPages(value => ({ ...value, [kind]: { ...current, loading: false, failed: true } })); }
    finally { if (version === generation.current) pending.current.delete(kind); }
  };
  const pageFor = (kind: Kind) => {
    const page = pages[kind];
    return page.source?.projectId === projectId && page.source.canvasId === canvasId && page.source.api === canvas.rfInstance
      && page.source.query === query ? page : { ...blank(), failed: page.failed };
  };
  const assets = Object.fromEntries(kinds.map(kind => [kind, projectId && owner ? nativeLibraryEntryAssets(projectId, kind, pageFor(kind).items) : []])) as Record<Kind, readonly OriginalProps[]>;
  const visible = owner && nonEmpty(projectId) && activeSpace !== 'SPACE_TYPE_TEAM';
  const props = visible ? { ...originalProps,
    roots: [...originalProps.roots, ...kinds.map(kind => ({ id: nativeLibraryCategoryId(projectId!, kind), name: label(kind), children: [],
      parent_id: '0', space_type: 'SPACE_TYPE_PRIVATE', asset_count: pageFor(kind).total, lcos_library_folder: true }))],
    expandedFolderIds: [...originalProps.expandedFolderIds, ...expanded],
    searchResults: [...(originalProps.searchResults ?? []), ...kinds.flatMap(kind => nativeLibraryEntrySearchResults(projectId!, kind, pageFor(kind).items))],
    searchLoading: originalProps.searchLoading || kinds.some(kind => pageFor(kind).loading && pageFor(kind).items.length === 0),
    searchHasMore: originalProps.searchHasMore || kinds.some(kind => pageFor(kind).nextCursor),
    onLoadMoreSearch: () => { if (originalProps.searchHasMore) originalProps.onLoadMoreSearch?.(); kinds.forEach(kind => { void loadMore(kind); }); },
    getFolderAssetsState: (id: string) => { const kind = category(id); return kind ? { assets: assets[kind], loading: pageFor(kind).loading,
      loaded: !pageFor(kind).loading, pagination: { page: pageFor(kind).page, has_next: !!pageFor(kind).nextCursor } } : originalProps.getFolderAssetsState(id); },
    onToggleExpand: (id: string, force?: boolean) => { if (!category(id)) return originalProps.onToggleExpand(id, force);
      setExpanded(value => (force ?? !value.includes(id)) ? [...new Set([...value, id])] : value.filter(entry => entry !== id)); },
    onFetchAssets: (id: string, page?: number) => { const kind = category(id); if (!kind) return originalProps.onFetchAssets(id, page);
      if ((page ?? 1) > pages[kind].page) void loadMore(kind); },
  } : originalProps;
  return <NativeLibraryPlacementProvider store={NativeLibraryStore}><div className="flex h-full min-h-0 flex-col" data-lcos-native-library-contexts>
    <div className="min-h-0 flex-1"><NativeLibrary {...props} /></div>
    {visible && kinds.some(kind => pages[kind].failed) && <button type="button" role="status"
      className="shrink-0 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-black/5"
      onClick={() => setReadKey(value => value + 1)}>部分内容暂时打不开，点此重新读取</button>}
  </div></NativeLibraryPlacementProvider>;
}

function exactScope(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot) {
  const scopes = graph.scopes.filter(scope => String(scope.id) === item.entityRef.id && String(scope.projectId) === projectId && scope.kind === item.kind);
  if (String(graph.project.id) !== projectId || scopes.length !== 1) throw new UserError('这份内容已变化，请重新打开。');
  return scopes[0];
}
function exactContext(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot, presentations: readonly PresentationViewV0[]) {
  exactScope(projectId, item, graph);
  const matches = presentations.filter(view => view.projectId === projectId && view.scopeId === item.entityRef.id
    && view.capability === 'context' && view.id === `presentation:context:${item.entityRef.id}`);
  if (item.kind !== 'context' || matches.length !== 1) throw new UserError('这份上下文暂时无法读取，请重新打开。');
  return matches[0];
}

/** Expand actual saved material members. Unsupported entity members are not
 * silently omitted, and a missing historical file never falls back to Current. */
export function nativeLibraryContextReferences(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot,
  presentations: readonly PresentationViewV0[]): readonly LcosNodeEntityRef[] {
  const presentation = exactContext(projectId, item, graph, presentations);
  const entityMembers = presentation.state.memberEntityRefs ?? [];
  if (entityMembers.some(ref => ref.type !== 'view')) throw new UserError('这份上下文含暂不能随消息引用的内容，请进入现场使用；原输入保留。');
  const ids = [...new Set([...presentation.state.memberViewIds, ...entityMembers.map(ref => ref.id)])];
  if (!ids.length) throw new UserError('这份上下文还没有可引用的材料。');
  return ids.map(id => {
    const views = graph.artifactViews.filter(view => String(view.id) === id);
    const view = views.length === 1 ? views[0] : undefined;
    const artifacts = graph.artifacts.filter(artifact => String(artifact.id) === String(view?.artifactId) && String(artifact.projectId) === projectId);
    const artifact = artifacts.length === 1 ? artifacts[0] : undefined;
    const revisionId = view?.revisionId ?? artifact?.currentRevisionId;
    const revisions = graph.artifactRevisions.filter(revision => String(revision.id) === String(revisionId) && String(revision.artifactId) === String(artifact?.id));
    const revision = revisions.length === 1 ? revisions[0] : undefined;
    const files = graph.fileRecords.filter(file => String(file.id) === String(revision?.fileRecordId));
    if (!view || !artifact || !revision || files.length !== 1) throw new UserError('上下文中有材料版本暂不可读取，未换用其他版本；原输入保留。');
    return { entityType: 'artifact', entityId: String(artifact.id), artifactViewId: id, revisionId: String(revision.id),
      mimeType: files[0].mimeType, displayLabel: artifact.title };
  });
}

/** Present semantic method fields directly. Do not regex-strip arbitrary user
 * descriptions: they may themselves contain a literal “来源 Project：…” line. */
export function nativeLibraryMethodText(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot,
  presentations: readonly PresentationViewV0[]): string {
  const scope = exactScope(projectId, item, graph);
  const text = [`工作流方法：${scope.name}`];
  for (const presentation of presentations.filter(view => view.projectId === projectId && view.scopeId === item.entityRef.id && view.capability === 'workflow')) {
    const actions = presentation.state.workflowActions ?? [];
    const operators = presentation.state.workflowOperators ?? {};
    const actionNames = new Map(actions.map(action => [action.id, action.label]));
    for (const action of actions) text.push(`动作：${action.label}${action.description?.trim() ? `\n${action.description}` : ''}`);
    for (const edge of presentation.state.workflowActionEdges ?? []) text.push(`动作连接：${actionNames.get(edge.fromActionId) ?? edge.fromActionId} → ${actionNames.get(edge.toActionId) ?? edge.toActionId}${edge.label ? `（${edge.label}）` : ''}`);
    for (const [id, operator] of Object.entries(operators)) {
      text.push(`结构标记：${operator.label || id} · ${operator.kind}`);
      for (const branch of operator.branches ?? []) text.push(`分支：${branch.label}${branch.predicateText ? `；条件说明：${branch.predicateText}` : ''}${branch.targetViewId ? '；使用已绑定材料' : ''}`);
    }
  }
  return text.join('\n\n');
}

type NavigationOwner = { projectId: string; canvasId: string; disabled: boolean; onSelect: (target: { id: string }) => Promise<unknown> | unknown };
let navigationOwner: NavigationOwner | null = null;
/** An ephemeral reference to the original header Ke; no router or scene truth. */
export function LCOSNativeLibraryNavigationOwner({ canvasId, onSelect, disabled }: {
  canvasId: string; onSelect: NavigationOwner['onSelect']; disabled: boolean;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  useEffect(() => {
    if (!projectId) return;
    const owner = { projectId, canvasId, onSelect, disabled };
    navigationOwner = owner;
    return () => { if (navigationOwner === owner) navigationOwner = null; };
  }, [projectId, canvasId, onSelect, disabled]);
  return null;
}

type NavigationPorts = {
  owner: () => NavigationOwner | null;
  getState: () => { status: string; canvasId: string | null };
  subscribe: (callback: () => void) => () => void;
  projectId: () => string | null;
  timeoutMs?: number;
};
/** Selection remains original Ke; the adapter observes arrival without ever
 * issuing a route, geometry write or alternate automatic retry. */
export async function navigateNativeLibraryWorkspace(projectId: string, sourceCanvasId: string, target: Workspace,
  ports: NavigationPorts = { owner: () => navigationOwner, getState: useCanvasStore.getState, subscribe: useCanvasStore.subscribe,
    projectId: () => useLcosShellStore.getState().projectId }): Promise<void> {
  const owner = ports.owner();
  if (!owner || owner.projectId !== projectId || owner.canvasId !== sourceCanvasId || owner.disabled || !target.canvasId)
    throw new UserError('现场暂时不能切换，请稍后再试。');
  if (String(target.projectId) !== projectId || !nonEmpty(sourceCanvasId) || ports.projectId() !== projectId
    || ports.getState().status !== 'ready' || ports.getState().canvasId !== sourceCanvasId)
    throw new UserError('现场身份已变化，没有切换到其他项目。');
  if (target.canvasId === sourceCanvasId) return;
  let release = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const arrival = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => { release(); clearTimeout(timer); error ? reject(error) : resolve(); };
    const check = () => {
      const state = ports.getState();
      if (ports.projectId() !== projectId) return finish(new UserError('项目已切换，未继续打开旧现场。'));
      if (state.status === 'ready' && state.canvasId === target.canvasId) finish();
      else if (state.status === 'ready' && state.canvasId !== sourceCanvasId) finish(new UserError('已切往其他现场，未拉回旧目标。'));
    };
    release = ports.subscribe(check);
    timer = setTimeout(() => finish(new UserError('原现场切换尚未确认，请保留当前编辑后重试。')), ports.timeoutMs ?? 10000);
  });
  void arrival.catch(() => {});
  try { await Promise.race([Promise.resolve(owner.onSelect({ id: target.canvasId })), arrival]); await arrival; }
  finally { release(); clearTimeout(timer!); }
}

type DetailModel = { graph: ProjectGraphSnapshot; presentations: readonly PresentationViewV0[]; workspaces: readonly Workspace[];
  method?: WorkflowMethodDraft; contextReady?: boolean; version: string };
const buttonClass = 'flex h-9 w-full items-center justify-center rounded-lg border border-border bg-foreground/5 px-3 text-sm font-medium transition-colors hover:bg-foreground/10 disabled:opacity-40';

/** The original row Popover and TS preview remain the only detail surface. */
export function LCOSNativeLibraryContextDetail({ detail, NativePreview, onClose }: {
  detail: unknown; NativePreview: ComponentType<any>; onClose?: () => void;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const entry = nativeLibraryEntry(detail, projectId ?? undefined);
  return entry?.item.kind === 'collection'
    ? <LCOSNativeLibraryCollectionDetail detail={detail} NativePreview={NativePreview} />
    : <NativeLibraryScopeDetail detail={detail} NativePreview={NativePreview} onClose={onClose} />;
}

function NativeLibraryScopeDetail({ detail, NativePreview, onClose }: {
  detail: unknown; NativePreview: ComponentType<any>; onClose?: () => void;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const canvas = useCanvasStore(state => state);
  const entry = nativeLibraryEntry(detail, projectId ?? undefined);
  const session = useMemo(() => createLcosCoreSession(), []);
  const [model, setModel] = useState<DetailModel | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readKey, setReadKey] = useState(0);
  const generation = useRef(0);
  const item = entry?.item;
  const load = async (signal?: AbortSignal): Promise<DetailModel> => {
    if (!entry || !projectId || entry.projectId !== projectId) throw new UserError('这份内容的来源尚未确认，请重新打开。');
    const [graph, presentations, workspaces] = await Promise.all([session.projects.getProjectGraph(projectId),
      session.projects.listPresentations(projectId, signal), session.projects.getWorkspaces(projectId, signal)]);
    if (!graph) throw new UserError('内容暂时无法读取，请重新打开。');
    exactScope(projectId, entry.item, graph);
    if (workspaces.some(workspace => String(workspace.projectId) !== projectId)) throw new UserError('现场身份尚未确认，请重新打开。');
    const contextRows = presentations.filter(view => view.projectId === projectId && view.scopeId === entry.item.entityRef.id
      && view.capability === 'context' && view.id === `presentation:context:${entry.item.entityRef.id}`);
    const relevant = entry.item.kind === 'context' ? contextRows.length === 0 ? [] : [exactContext(projectId, entry.item, graph, presentations)]
      : presentations.filter(view => view.projectId === projectId && view.scopeId === entry.item.entityRef.id && view.capability === 'workflow');
    return { graph, presentations, workspaces,
      contextReady: entry.item.kind === 'context' ? relevant.length === 1 : undefined,
      method: entry.item.kind === 'workflow' ? buildWorkflowMethodDraft(projectId, entry.item.entityRef.id, graph, presentations) : undefined,
      version: JSON.stringify(relevant.map(view => [view.id, view.version])) };
  };
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setModel(null); setMessage(''); setFailed(false); setBusy(false);
    void load(controller.signal).then(value => { if (version === generation.current && !controller.signal.aborted) setModel(value); })
      .catch(() => { if (version === generation.current && !controller.signal.aborted) { setFailed(true); setMessage('内容暂时打不开，点此重新读取。'); } });
    return () => { generation.current += 1; controller.abort(); };
  }, [projectId, item?.kind, item?.entityRef.id, canvas.canvasId, canvas.rfInstance, session, readKey]);

  if (!entry || !projectId) return <div role="alert" className="p-3 text-sm">内容来源尚未确认，请重新打开。</div>;
  const context = item!.kind === 'context';
  const captured = { projectId, canvasId: canvas.canvasId, rfInstance: canvas.rfInstance };
  const current = (version: number) => {
    const live = useCanvasStore.getState();
    return isNativeSavedContextOwnerCurrent(captured, { projectId: useLcosShellStore.getState().projectId ?? '',
      canvasId: live.canvasId, rfInstance: live.rfInstance }, window.__LCOS_NODE_LAB__?.api, version, generation.current)
      && useLcosReferenceStore.getState().projectId === projectId;
  };
  const act = async (task: (version: number) => Promise<string>) => {
    if (busy || !model) return;
    const version = generation.current;
    if (!current(version)) { setFailed(true); setMessage('现场已变化，请重新打开内容。'); return; }
    setBusy(true); setFailed(false); setMessage('');
    try { const message = await task(version); if (current(version)) setMessage(message); }
    catch (error) { if (current(version)) { setFailed(true); setMessage(error instanceof UserError ? error.message : '操作尚未确认，原输入和内容保留，请重新读取后重试。'); } }
    finally { if (current(version)) setBusy(false); }
  };
  const fresh = async (version: number) => {
    const value = await load();
    if (!current(version)) throw new UserError('现场或内容已切换，未操作其他目标。');
    if (value.version !== model?.version) throw new UserError('内容已更新，请重新读取后再使用；原输入保留。');
    return value;
  };
  const useContent = () => act(async version => {
    const shell = useLcosShellStore.getState(), before = shell.composerTarget;
    const returnInput = captureNativeLibraryInputReturn(projectId);
    const inputKey = composerInputKey(before), owner = referencePickOwnerKey(projectId, before);
    if (!inputKey || !owner || !before) throw new UserError('先打开要使用这些内容的对话输入。');
    const sameInput = () => current(version) && composerInputKey(useLcosShellStore.getState().composerTarget) === inputKey
      && useLcosShellStore.getState().composerTarget?.messageId === before.messageId
      && useLcosShellStore.getState().composerTarget?.continuationOperationId === before.continuationOperationId
      && ![...useLcosReferenceStore.getState().referenceInputOperations.values()]
        .some(operation => operation.owner === owner && operation.kind === 'sending');
    const refs = useLcosReferenceStore.getState();
    if ([...refs.referenceInputOperations.values()].some(operation => operation.owner === owner && operation.kind === 'sending'))
      throw new UserError('这条消息正在发送，请稍后再加入内容。');
    const token = refs.beginReferenceInputOperation(owner, 'preparing');
    try {
      const value = await fresh(version);
      if (!sameInput()) throw new UserError('原输入已变化，未加入其他消息。');
      if (context) {
        const references = nativeLibraryContextReferences(projectId, item!, value.graph, value.presentations);
        const prepared = prepareDraftReferences(references, before.intent);
        if (!prepared.ok) throw new UserError(prepared.reason);
        const reason = before.intent === 'continue' ? undefined : prepared.references.map(runReferenceUnavailableReason).find(Boolean);
        if (reason) throw new UserError('当前对话暂不能使用其中部分材料，原输入保留；可进入现场查看。');
        const result = useLcosReferenceStore.getState().addEntitiesToDraft(prepared.references, before.intent);
        if (result.reason) throw new UserError('引用尚未加入，原输入保留。');
        onClose?.();
        await restoreNativeLibraryInputReturn(returnInput);
        return '已加入当前对话';
      }
      const method = await readWorkflowScopeMethodDraft(session, projectId, item!.entityRef.id);
      if (!sameInput()) throw new UserError('原输入已变化，未加入其他消息。');
      if (method.status !== 'ready') throw new UserError('这份方法还没有可取用的步骤，可以先进入现场。');
      if (value.method?.status !== 'ready' || method.prompt !== value.method.prompt
        || JSON.stringify(method.references) !== JSON.stringify(value.method.references))
        throw new UserError('方法已更新，请重新读取后再使用；原输入保留。');
      appendWorkflowMethodDraft({ ...method, prompt: nativeLibraryMethodText(projectId, item!, value.graph, value.presentations) }, projectId, inputKey);
      onClose?.();
      await restoreNativeLibraryInputReturn(returnInput);
      return '方法已加入当前输入';
    } finally { useLcosReferenceStore.getState().finishReferenceInputOperation(token); }
  });
  const addSelection = () => act(async version => {
    const selected = readSelectedCanvasNodes(useCanvasStore.getState());
    if (selected.status !== 'ready') throw new UserError('先在画布选中要加入的图片或文字。');
    const port = createNativeContextReferencePort({ http: new HttpClient({ baseUrl: `${window.location.origin}/api/lcos/core` }), projectId });
    const preview = await port.preview({ projectId, selectedNodes: selected.nodes, target: { projectId, kind: 'context', id: item!.entityRef.id } });
    if (!current(version)) throw new UserError('现场已切换，没有提交到其他目标。');
    if (preview.status !== 'ready') throw new UserError('选区中有内容暂不能加入，请只选择已保存的图片或文字。');
    let result;
    try { result = await port.apply(preview); }
    catch { throw new UserError('加入结果尚未确认，请重新读取后核对；不会自动重复加入。'); }
    const reviewed = reviewAssemblyApply(preview.request, result);
    const readback = await load();
    if (!current(version)) throw new UserError('现场已切换，请回到原上下文核对结果。');
    const presentation = exactContext(projectId, item!, readback.graph, readback.presentations);
    const memberIds = new Set(presentation.state.memberViewIds);
    const confirmed = reviewed.result.results.filter(row => (row.status === 'applied' || row.channel === 'already-member')
      && row.sourceRef.kind === 'artifactView' && memberIds.has(row.sourceRef.id));
    setModel(readback);
    if (confirmed.length !== preview.request.sourceRefs.length) throw new UserError('部分材料尚未确认加入，已加入内容保留；请重新读取后核对。');
    return '选中的材料已在上下文中';
  });
  const targets = model ? workspaceTargetsForItem(item!, model.workspaces).filter(workspace => workspace.canvasId) : [];
  const enter = (target: Workspace) => act(async version => {
    const value = await fresh(version);
    const exact = workspaceTargetsForItem(item!, value.workspaces).filter(workspace => String(workspace.id) === String(target.id)
      && workspace.canvasId === target.canvasId && String(workspace.scopeId) === String(target.scopeId));
    if (exact.length !== 1 || !canvas.canvasId) throw new UserError('这个现场已变化，请重新读取后再进入。');
    await navigateNativeLibraryWorkspace(projectId, canvas.canvasId, exact[0]);
    return '已进入现场';
  });
  let body;
  if (!model) body = <div className="w-full p-4 text-sm text-muted-foreground">{failed ? '内容暂时打不开' : '正在读取…'}</div>;
  else if (!context) body = <div className="w-full whitespace-pre-wrap p-3 text-sm leading-6" data-native-library-method-preview>
    {model.method?.status === 'ready' ? nativeLibraryMethodText(projectId, item!, model.graph, model.presentations) : '还没有保存方法步骤，可进入现场继续整理。'}</div>;
  else if (!model.contextReady) body = <div className="w-full p-4 text-sm text-muted-foreground" data-native-library-context-preview>
    已保存内容暂时无法读取，可先加入画布选中的材料后重新核对。</div>;
  else {
    const presentation = exactContext(projectId, item!, model.graph, model.presentations);
    const members = presentation.state.memberViewIds.map(id => {
      const view = model.graph.artifactViews.find(view => String(view.id) === id);
      return model.graph.artifacts.find(artifact => String(artifact.id) === String(view?.artifactId))?.title ?? '原材料暂不可读取';
    });
    const entityMembers = presentation.state.memberEntityRefs ?? [];
    body = <div className="w-full p-3 text-sm leading-6" data-native-library-context-preview>
      {members.length + entityMembers.length ? <><ul>{members.map((title, index) => <li key={index}>{title}</li>)}</ul>
        {entityMembers.length > 0 && <p className="text-muted-foreground">另有 {entityMembers.length} 项关联内容，可进入现场查看</p>}</> : '还没有加入内容'}</div>;
  }
  return <NativePreview detail={detail} contentVariant="content" bodySlot={body} metaSlot={<div className="flex flex-col gap-0.5">
    <div className="truncate text-sm font-medium leading-5">{item!.title}</div><div className="text-xs text-muted-foreground">{label(item!.kind as Kind)}</div>
  </div>} actionsSlot={<div className="flex flex-col gap-1.5" data-native-library-entry-actions>
    <button type="button" className={buttonClass} onClick={() => { void useContent(); }} disabled={busy || !model || context && !model.contextReady}>{context ? '用于当前对话' : '使用方法'}</button>
    {context && <button type="button" className={buttonClass} onClick={() => { void addSelection(); }} disabled={busy || !model}>加入当前选区</button>}
    {targets.map(target => <button type="button" key={String(target.id)} className={buttonClass} onClick={() => { void enter(target); }} disabled={busy}>
      {targets.length === 1 ? '进入现场' : `进入 ${target.name}`}</button>)}
    {model && targets.length === 0 && <p className="text-xs text-muted-foreground">还没有可进入的现场</p>}
    {message && <p role={failed ? 'alert' : 'status'} className="text-xs leading-5">{message}</p>}
    {(failed || !model && message) && <button type="button" className={buttonClass} onClick={() => setReadKey(value => value + 1)} disabled={busy}>重新读取</button>}
  </div>} />;
}

/** Canonical Collections are not legacy Scopes. Keep their members and first
 * placement in the same original Zp → TS Popover, never a Collection window. */
function LCOSNativeLibraryCollectionDetail({ detail, NativePreview }: {
  detail: unknown; NativePreview: ComponentType<any>;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const canvas = useCanvasStore(state => state);
  const entry = nativeLibraryEntry(detail, projectId ?? undefined);
  const collectionId = entry?.item.kind === 'collection' ? entry.item.entityRef.id : undefined;
  const inputOrigin = useNativeLibraryInputOrigin();
  const session = useMemo(() => createLcosCoreSession(), []);
  const [members, setMembers] = useState<CoreCollectionMembersSnapshot | null>(null);
  const [projection, setProjection] = useState<NativeLibraryCollectionProjection | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [localBusy, setBusy] = useState(false);
  const [localNeedsCheck, setNeedsCheck] = useState(false);
  const placementStore = useNativeLibraryPlacementStore();
  const placementAddress = projectId && workspaceId && canvas.canvasId && collectionId
    ? nativeLibraryPlacementAddress({ projectId, workspaceId, canvasId: canvas.canvasId, source: { kind: 'collection', collectionId } }) : null;
  const placementAttempt = useNativeLibraryPlacementAttempt(placementStore, placementAddress);
  const busy = localBusy || placementAttempt?.status === 'pending';
  const needsCheck = localNeedsCheck || !!placementAttempt;
  const [readKey, setReadKey] = useState(0);
  const generation = useRef(0), inFlight = useRef(false);
  const [placed, setPlaced] = useState<Extract<NativeLibraryCollectionPlacementResult, { nodeId: string }> | null>(null);
  const captured = { projectId, canvasId: canvas.canvasId, workspaceId, api: canvas.rfInstance };
  const current = (version: number) => {
    const shell = useLcosShellStore.getState(), live = useCanvasStore.getState();
    return version === generation.current && !!projectId && !!workspaceId && !!canvas.canvasId && !!canvas.rfInstance
      && shell.projectId === projectId && shell.activeWorkspaceId === workspaceId
      && shell.surfaceCanvasId[shell.activeSurface] === canvas.canvasId
      && live.status === 'ready' && live.canvasId === canvas.canvasId && live.rfInstance === canvas.rfInstance
      && window.__LCOS_NODE_LAB__?.api === canvas.rfInstance;
  };
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    setMembers(null); setProjection(null); setMessage(''); setFailed(false);
    if (projectId && collectionId && workspaceId && canvas.canvasId && canvas.rfInstance && current(version)) {
      void Promise.all([session.collections.members(projectId, collectionId, controller.signal),
        readNativeLibraryCollectionProjection({ projectId, collectionId, workspaceId, canvasId: canvas.canvasId }, controller.signal)])
        .then(([value, landing]) => {
          if (!controller.signal.aborted && current(version)) {
            setMembers(value); setProjection(landing);
            if (landing.state === 'partial') setNeedsCheck(true);
          }
        }).catch(() => { if (!controller.signal.aborted && current(version)) { setFailed(true); setMessage('集合暂时打不开，请重新读取。'); } });
    }
    return () => { generation.current += 1; controller.abort(); };
  }, [projectId, collectionId, workspaceId, canvas.canvasId, canvas.rfInstance, readKey, session]);
  // A different original scene is a different intent. A mere preview reread
  // cannot clear an unknown placement and turn it into another POST.
  useEffect(() => { setPlaced(null); setNeedsCheck(false); setBusy(false); inFlight.current = false; },
    [projectId, collectionId, workspaceId, canvas.canvasId, canvas.rfInstance]);
  if (!entry || !projectId || !collectionId) return <div role="alert" className="p-3 text-sm">集合来源尚未确认，请重新打开。</div>;
  const liveId = placed?.nodeId ?? (projection?.state === 'present' ? projection.node?.id : undefined);
  const onCanvas = typeof liveId === 'string' && canvas.nodes.some(node => node.id === liveId
    && isNativeLibraryCollectionCarrier(node, { projectId, canvasId: canvas.canvasId ?? '', workspaceId: workspaceId ?? '', collectionId }));
  const place = async (readOnly: boolean) => {
    const version = generation.current;
    if (inFlight.current || !members || !workspaceId || !canvas.canvasId || !canvas.rfInstance || !current(version)) return;
    const operation = beginNativeLibraryPlacementAttempt(placementStore, placementAddress, readOnly || needsCheck);
    if (!operation) return;
    inFlight.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await placeNativeLibraryCollection({ projectId, canvasId: canvas.canvasId, workspaceId, collectionId }, {
        api: canvas.rfInstance, isCurrent: () => current(version), readOnly: operation.readOnly,
      });
      settleNativeLibraryPlacementAttempt(placementStore, placementAddress, operation, result.status);
      if (!current(version)) return;
      if (result.status === 'placed' || result.status === 'already-present') {
        setPlaced(result); setNeedsCheck(false); setMessage(result.outsideVisible ? '已放到画布，可点击定位查看。' : '集合已在画布中');
      } else {
        if (result.status === 'unconfirmed' || operation.readOnly) setNeedsCheck(true);
        setFailed(true); setMessage(result.message);
      }
    } catch {
      settleNativeLibraryPlacementAttempt(placementStore, placementAddress, operation, 'unconfirmed');
      if (current(version)) { setNeedsCheck(true); setFailed(true); setMessage('放置结果暂未确认，请核对；集合内容保留。'); }
    } finally { if (current(version)) { inFlight.current = false; setBusy(false); } }
  };
  const locate = async () => {
    const version = generation.current;
    if (inFlight.current || !onCanvas || !liveId || !captured.api || !current(version)) return;
    inFlight.current = true; setBusy(true);
    try {
      const located = await locateNativeMaterialNodes([liveId], { api: captured.api, isCurrent: () => current(version) });
      if (current(version)) { setFailed(!located); setMessage(located ? '' : '暂时无法定位，集合内容保留，请稍后再试。'); }
    } finally { if (current(version)) { inFlight.current = false; setBusy(false); } }
  };
  const previews = members ? collectionPreviewMembers(members) : [];
  const body = <div className="w-full p-3 text-sm leading-6" data-native-library-collection-preview>
    {!members ? failed ? '集合暂时打不开' : '正在读取…' : previews.length ? <ul className="space-y-1">
      {previews.map(member => <li key={JSON.stringify([member.type, member.id])}>
        <span>{member.label}</span>{member.availability !== 'available' && <span className="ml-2 text-xs text-muted-foreground">暂不可读取</span>}
      </li>)}
    </ul> : '还没有加入内容'}
  </div>;
  return <NativePreview detail={detail} contentVariant="content" bodySlot={body}
    metaSlot={<div className="flex flex-col gap-0.5"><div className="truncate text-sm font-medium leading-5">{members?.collection.title ?? entry.item.title}</div>
      <div className="text-xs text-muted-foreground">集合{members ? ` · ${members.members.length} 项` : ''}</div></div>}
    actionsSlot={<div className="flex flex-col gap-1.5" data-native-library-collection-actions>
      {needsCheck ? <button type="button" className={buttonClass} disabled={busy || !members} onClick={() => { void place(true); }}>核对放置结果</button>
        : onCanvas ? <button type="button" className={buttonClass} disabled={busy} onClick={() => { void locate(); }}>定位到画布</button>
          : <button type="button" className={buttonClass} disabled={busy || !members || !projection} onClick={() => { void place(false); }}>放到画布</button>}
      {inputOrigin?.projectId === projectId && <p className="text-xs leading-5 text-muted-foreground">请打开集合中的材料后引用；当前输入保留。</p>}
      {message && <p role={failed ? 'alert' : 'status'} className="text-xs leading-5">{message}</p>}
      {failed && !needsCheck && <button type="button" className={buttonClass} disabled={busy} onClick={() => setReadKey(value => value + 1)}>重新读取</button>}
    </div>} />;
}
