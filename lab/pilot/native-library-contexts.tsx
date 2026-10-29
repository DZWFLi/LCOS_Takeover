import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { ArrowLeft, ChevronRight, FileText, Layers } from 'lucide-react';
import type { WarehouseItemV1, WarehouseSnapshotV1, ProjectGraphSnapshot, PresentationViewV0, ConnectedConversationV1, RunCanvasProjection } from '../../lcos/packages/contracts/src/index.ts';
import type { Workspace } from '../../lcos/packages/domain/src/index.ts';
import { CoreAssemblyClient } from '../../lcos/apps/web-gen2/src/backend/assembly.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import { coreRequest } from '../../lcos/apps/web-gen2/src/backend/coreTypes.ts';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore.ts';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts';
import { prepareDraftReferences, runReferenceUnavailableReason } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts';
import { buildWorkflowMethodDraft, type WorkflowMethodDraft } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodDraft.ts';
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
import { nativeScopeReferenceViewEvent, type NativeScopeReferenceViewRequest } from './native-scope-reference-port';
import { openNativeLibraryMemberEntry, type NativeLibraryMemberAddress, type NativeLibraryMemberKind } from './native-library-member-entry';
import './native-assembly.css';
import { useNativeLibraryPreviewLayout } from './native-library-preview-layout';

type Kind = 'context' | 'workflow' | 'collection';
import { nativeLibraryEntry } from './native-library-entry';
import { nativeAssemblyItem } from './native-assembly-policy';
import { NativeLibraryScopePreviewTarget } from './native-library-scope-preview-target';
import { nativeLibraryScopeMembers, nativeLibraryMember, type NativeScopeMember } from './native-library-scope-members';
import { requestNativeNoteView, type NativeNoteViewRequest } from './native-note-viewer';
import { requestNativeConversationView, requestNativeTaskView, type NativeConversationViewRequest, type NativeTaskViewRequest } from './native-task-route';
import { readNativeConversationSelection, restoreNativeConversationSelection } from './native-conversation-selection';
import { nativeMaterialViewerAvailable, requestNativeMaterialView, type NativeMaterialViewRequest } from './native-material-viewer-port';
import { cancelNativeLibraryReadingReturn, withNativeLibraryReadingReturn, type NativeLibraryReadingReturn } from './native-library-reading-return';
export { nativeLibraryEntry, type NativeLibraryEntry } from './native-library-entry';
type OriginalProps = Record<string, any>;
type Page = { items: readonly WarehouseItemV1[]; loading: boolean; page: number; nextCursor?: string; total: number; failed?: boolean;
  source?: { projectId: string; canvasId: string; api: unknown; query: string } };
const blank = (): Page => ({ items: [], loading: true, page: 1, total: 0 });
const kinds: readonly Kind[] = ['context', 'workflow', 'collection'];
const label = (kind: Kind) => kind === 'context' ? '已保存上下文' : kind === 'workflow' ? '方法' : '集合';
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

type NativeLibraryInputNotice = (message: string, retry?: () => void) => void;
let libraryInputNoticeOwner: { projectId: string; canvasId: string; notify: NativeLibraryInputNotice } | null = null;
const notifyNativeLibraryInputReturn: NativeLibraryInputNotice = (message, retry) => {
  const canvas = useCanvasStore.getState(), projectId = useLcosShellStore.getState().projectId;
  if (libraryInputNoticeOwner?.projectId === projectId && libraryInputNoticeOwner.canvasId === canvas.canvasId)
    libraryInputNoticeOwner.notify(message, retry);
};
/** The original return owner remains retryable after its Library has closed.
 * This stores no draft and never restores a return address into another message. */
export async function returnNativeLibraryInputReturn(owner: NativeLibraryInputReturn | null, close: () => void,
  notify: NativeLibraryInputNotice = notifyNativeLibraryInputReturn, ports = inputReturnPorts): Promise<boolean> {
  if (!owner) return false;
  const same = () => {
    const shell = ports.shell(), canvas = ports.canvas(), target = shell.composerTarget;
    return shell.projectId === owner.projectId && composerInputKey(target) === owner.inputKey
      && target?.messageId === owner.messageId && target?.continuationOperationId === owner.continuationOperationId
      && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api;
  };
  if (!same()) { notify('原输入地址已变化，未返回其他消息。'); return false; }
  close();
  const restored = await restoreNativeLibraryInputReturn(owner, ports);
  if (restored) { if (libraryInputOrigin === owner) setLibraryInputOrigin(null); return true; }
  if (!same()) { notify('输入已切换，未把旧返回地址放进新消息。'); return false; }
  setLibraryInputOrigin(owner);
  notify('原输入暂未显示，草稿和返回位置保留。', () => { void returnNativeLibraryInputReturn(owner, close, notify, ports); });
  return false;
}

/** An explicit Composer-origin pick owns only the Library instance it opened.
 * Keep that close action with the Viewer operation, not whichever Library may
 * happen to be open after a version/source handoff or a delayed read. */
export function captureNativeLibraryInputUseReturn(input: NativeLibraryInputReturn | null): (() => Promise<boolean>) | undefined {
  const origin = libraryInputOrigin, list = libraryListOwner;
  if (!input || !origin || !list || origin.projectId !== input.projectId || origin.inputKey !== input.inputKey
    || origin.messageId !== input.messageId || origin.continuationOperationId !== input.continuationOperationId
    || origin.canvasId !== input.canvasId || origin.api !== input.api
    || list.projectId !== origin.projectId || list.canvasId !== origin.canvasId
    || typeof list.store.getState().close !== 'function') return undefined;
  const current = () => libraryInputOrigin === origin && libraryListOwner === list && sameScopeReferenceInput(origin);
  if (!current()) return undefined;
  return async () => {
    if (!current()) return false;
    return returnNativeLibraryInputReturn(origin, () => {
      if (!current()) return;
      const state = list.store.getState();
      if (typeof state.close === 'function') state.close();
    });
  };
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
  cancelNativeScopeReferenceView(detail?.canvasId, detail?.api);
  if (libraryInputOrigin?.canvasId === detail?.canvasId && libraryInputOrigin?.api === detail?.api) setLibraryInputOrigin(null);
  const origin = libraryMemberOrigin;
  if (origin?.address.canvasId === detail?.canvasId && origin.api === detail?.api && !origin.returning
    && libraryNavigation?.memberOrigin !== origin) releaseLibraryMemberOrigin(origin, false);
});
/** Only an explicit input-origin Library invocation changes the native Apply
 * action into a reference pick. A merely open Composer is not that intent. */
export function useNativeLibraryInputOrigin(): NativeLibraryInputReturn | null {
  return useSyncExternalStore(subscribeInputOrigin, () => libraryInputOrigin, () => null);
}

const sameScopeReferenceInput = (owner: NativeLibraryInputReturn) => {
  const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState(), target = shell.composerTarget;
  return shell.projectId === owner.projectId && composerInputKey(target) === owner.inputKey
    && target?.messageId === owner.messageId && target?.continuationOperationId === owner.continuationOperationId
    && canvas.status === 'ready' && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api;
};
type NativeScopeOpenOwner = { projectId: string; canvasId: string;
  openScope(scopeId: string, current: () => boolean, signal?: AbortSignal, expectedKind?: 'context' | 'workflow'): Promise<void>;
  openEntry(kind: NativeLibraryMemberKind, id: string, current: () => boolean, signal?: AbortSignal): Promise<void> };
type NativeScopeReferenceViewDetail = NativeScopeReferenceViewRequest & { readonly isCurrent?: () => boolean; resolve?(): void; reject?(error: Error): void };
export interface NativeScopeReferenceOpenPorts {
  capture(projectId: string): NativeLibraryInputReturn | null;
  current(owner: NativeLibraryInputReturn): boolean;
  openLibrary(owner: NativeLibraryInputReturn): void;
  list(): NativeScopeOpenOwner | null;
  frame(callback: FrameRequestCallback): number;
  timeoutMs?: number;
}
const scopeReferenceOpenPorts: NativeScopeReferenceOpenPorts = {
  capture: captureNativeLibraryInputReturn, current: sameScopeReferenceInput,
  openLibrary: owner => window.dispatchEvent(new CustomEvent('lcos-native-open-library', { detail: { projectId: owner.projectId, composerOriginKey: owner.inputKey } })),
  list: () => libraryListOwner, frame: callback => requestAnimationFrame(callback),
};
let openingScopeReference: { origin: NativeLibraryInputReturn; controller: AbortController } | null = null;
export function cancelNativeScopeReferenceView(canvasId: unknown, api: unknown): boolean {
  if (!openingScopeReference || openingScopeReference.origin.canvasId !== canvasId || openingScopeReference.origin.api !== api) return false;
  openingScopeReference.controller.abort(); return true;
}
/** One original chip request, original list and original row; no alternate page.
 * Its existing inspection AbortSignal also cancels a slow graph read. */
export async function openNativeScopeReferenceView(detail: NativeScopeReferenceViewDetail, ports = scopeReferenceOpenPorts): Promise<void> {
  const origin = detail && ports.capture(detail.projectId);
  if (!origin || origin.inputKey !== detail.composerOriginKey || origin.messageId !== detail.messageId
    || origin.continuationOperationId !== detail.continuationOperationId || !ports.current(origin))
    throw new UserError('原输入地址已变化，请重新打开。');
  if (detail.signal?.aborted) throw new DOMException('原引用查看已取消。', 'AbortError');
  openingScopeReference?.controller.abort();
  const controller = new AbortController(), token = { origin, controller }; openingScopeReference = token;
  let timedOut = false;
  const cancel = () => controller.abort();
  detail.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ports.timeoutMs ?? 12000);
  const current = () => openingScopeReference === token && !controller.signal.aborted && !detail.signal?.aborted
    && detail.isCurrent?.() !== false && ports.current(origin);
  try {
    await new Promise<void>((resolve, reject) => {
      const aborted = () => reject(timedOut ? new UserError('原资料库打开尚未确认，原输入保留；请重试。') : new DOMException('原引用查看已取消。', 'AbortError'));
      controller.signal.addEventListener('abort', aborted, { once: true });
      void (async () => {
        ports.openLibrary(origin);
        while (current()) {
          const owner = ports.list();
          if (owner?.projectId === origin.projectId && owner.canvasId === origin.canvasId) {
            await owner.openScope(detail.scopeId, current, controller.signal);
            if (!current()) throw new DOMException('输入已切换，本次查看已取消。', 'AbortError');
            return;
          }
          await new Promise<void>(next => ports.frame(() => next()));
        }
        throw new DOMException('原引用查看已取消。', 'AbortError');
      })().then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', aborted));
    });
  } finally {
    clearTimeout(timer); detail.signal?.removeEventListener('abort', cancel);
    if (openingScopeReference === token) openingScopeReference = null;
    controller.abort();
  }
}
if (typeof window !== 'undefined') window.addEventListener(nativeScopeReferenceViewEvent, event => {
  const detail = (event as CustomEvent<NativeScopeReferenceViewDetail>).detail;
  void openNativeScopeReferenceView(detail).then(() => detail.resolve?.(), error => detail?.reject?.(error instanceof Error ? error : new UserError('这份上下文暂时打不开，原输入保留。')));
});

/** Provenance for the existing Library root, not another reading lease. A child
 * Viewer owns its original single lease without consuming this Gallery Back. */
export interface NativeLibraryMemberSource {
  readonly title: string;
  current(): boolean;
  restore(): Promise<void>;
  release(preserve: boolean): void;
}
type LibraryMemberOrigin = { address: NativeLibraryMemberAddress; api: unknown; source: NativeLibraryMemberSource;
  transferred?: boolean; restored?: boolean; returning?: boolean; closed?: boolean };
let libraryMemberOrigin: LibraryMemberOrigin | null = null;
const memberOriginListeners = new Set<() => void>();
const publishMemberOrigin = (value: LibraryMemberOrigin | null) => { libraryMemberOrigin = value; memberOriginListeners.forEach(listener => listener()); };
function currentLibraryMemberOrigin(origin: LibraryMemberOrigin): boolean {
  const canvas = useCanvasStore.getState();
  return libraryMemberOrigin === origin && !origin.closed && useLcosShellStore.getState().projectId === origin.address.projectId
    && canvas.status === 'ready' && canvas.canvasId === origin.address.canvasId && canvas.rfInstance === origin.api
    && (origin.transferred === true || origin.restored === true || origin.source.current());
}
function releaseLibraryMemberOrigin(origin: LibraryMemberOrigin, preserve: boolean): void {
  if (origin.closed) return;
  origin.closed = true;
  if (libraryMemberOrigin === origin) publishMemberOrigin(null);
  origin.source.release(preserve);
}
export async function requestNativeLibraryMemberView(projectId: string,
  member: Extract<NativeScopeMember, { kind: 'scope' | 'collection' }>, source: NativeLibraryMemberSource, signal?: AbortSignal): Promise<void> {
  const canvas = useCanvasStore.getState(), kind = member.item.kind as NativeLibraryMemberKind;
  if (signal?.aborted || !source.current() || useLcosShellStore.getState().projectId !== projectId || canvas.status !== 'ready' || !canvas.canvasId || !canvas.rfInstance
    || !['context','workflow','collection'].includes(kind) || member.item.entityRef.type !== kind
    || (member.kind === 'collection') !== (kind === 'collection')) throw new UserError('原方法或现场已变化，请重新打开。');
  if (libraryMemberOrigin) releaseLibraryMemberOrigin(libraryMemberOrigin, true);
  const origin: LibraryMemberOrigin = { address: { projectId, canvasId: canvas.canvasId, kind, id: member.item.entityRef.id }, api: canvas.rfInstance, source };
  publishMemberOrigin(origin);
  try {
    await openNativeLibraryMemberEntry(origin.address, { current: () => currentLibraryMemberOrigin(origin) && (origin.transferred || !signal?.aborted),
      openLibrary: () => {
        // Opening the shipped Library replaces the originating Gallery tree.
        // Its already-validated return address now belongs to this Library;
        // Gallery cleanup is not a cancellation of the destination's read.
        origin.transferred = true;
        window.dispatchEvent(new CustomEvent('lcos-native-open-library', { detail: { projectId } }));
      }, list: () => libraryListOwner, frame: callback => requestAnimationFrame(callback) });
  } catch (error) {
    releaseLibraryMemberOrigin(origin, true);
    notifyNativeLibraryInputReturn(error instanceof UserError ? error.message : '原内容暂时打不开，原输入保留；可返回方法重试。', () => { void source.restore(); });
    throw error;
  }
}
async function returnLibraryMemberOrigin(origin: LibraryMemberOrigin, close: () => void): Promise<void> {
  if (!currentLibraryMemberOrigin(origin)) throw new UserError('原方法或现场已变化，未返回其他目标。');
  if (origin.returning) return;
  origin.returning = true;
  // Original Library close can unmount this row. Keep only its source address
  // until the existing Gallery owner has restored the exact method/member.
  origin.restored = true;
  close(); origin.source.release(true);
  try { await origin.source.restore(); releaseLibraryMemberOrigin(origin, true); }
  catch (error) { origin.returning = false; throw error; }
}

/** These identifiers address transient native list rows, never Core entities. */
export const nativeLibraryCategoryId = (projectId: string, kind: Kind): string => `lcos-library-category:${encodeURIComponent(projectId)}:${kind}`;

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
  const expandedRef = useRef(expanded); expandedRef.current = expanded;
  useEffect(() => {
    if (!projectId) return;
    const value = { projectId, canvasId, store: NativeLibraryStore, read: () => expandedRef.current, expand: (ids: readonly string[]) => setExpanded([...ids]),
      openScope: async (scopeId: string, isCurrent: () => boolean, signal?: AbortSignal, expectedKind?: 'context' | 'workflow') => {
        const current = () => !signal?.aborted && libraryListOwner === value && isCurrent();
        const graph = await coreRequest<ProjectGraphSnapshot | undefined>(session.http, 'GET', `/projects/${encodeURIComponent(projectId)}/graph`, { signal });
        const scopes = graph?.scopes.filter(scope => String(scope.id) === scopeId && String(scope.projectId) === projectId
          && (scope.kind === 'context' || scope.kind === 'workflow') && (!expectedKind || scope.kind === expectedKind)) ?? [];
        if (!current() || !graph || String(graph.project.id) !== projectId || scopes.length !== 1) throw new UserError('这份内容已变化，请回到原输入重新打开。');
        const kind = scopes[0].kind as 'context' | 'workflow';
        const state = NativeLibraryStore.getState() as any;
        if (typeof state.setActiveSpace !== 'function' || typeof state.setSearchKeyword !== 'function' || typeof state.open !== 'function')
          throw new UserError('原资料库暂未就绪，原输入保留。');
        if (state.activeSpace !== 'SPACE_TYPE_PRIVATE') await state.setActiveSpace('SPACE_TYPE_PRIVATE');
        if (!current()) throw new UserError('输入已切换，本次查看已取消。');
        state.setSearchKeyword(scopes[0].name); state.open();
        setExpanded(ids => [...new Set([...ids, nativeLibraryCategoryId(projectId, kind)])]);
        const until = Date.now() + 12000;
        while (current() && Date.now() < until) {
          const page = latest.current[kind], source = page.source;
          const row = libraryRowOwners.get(JSON.stringify([projectId, kind, scopeId]));
          if (row?.canvasId === canvasId && !page.loading && !page.failed && source?.projectId === projectId && source.canvasId === canvasId
            && source.api === useCanvasStore.getState().rfInstance && source.query === scopes[0].name) { row.open(); return; }
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        throw new UserError('这份内容暂未在原资料库读出，原输入保留；请重新打开。');
      },
      openEntry: async (kind: NativeLibraryMemberKind, id: string, isCurrent: () => boolean, signal?: AbortSignal) => {
        if (kind !== 'collection') { await value.openScope(id, isCurrent, signal, kind); return; }
        const current = () => !signal?.aborted && libraryListOwner === value && isCurrent();
        const graph = await coreRequest<ProjectGraphSnapshot | undefined>(session.http, 'GET', `/projects/${encodeURIComponent(projectId)}/graph`, { signal });
        const rows = graph?.collections?.filter(row => String(row.id) === id && String(row.projectId) === projectId) ?? [];
        if (!current() || String(graph?.project.id) !== projectId || rows.length !== 1) throw new UserError('这份集合已变化，请重新打开原方法。');
        const state = NativeLibraryStore.getState() as any;
        if (typeof state.setActiveSpace !== 'function' || typeof state.setSearchKeyword !== 'function' || typeof state.open !== 'function')
          throw new UserError('原资料库暂未就绪，原输入保留。');
        if (state.activeSpace !== 'SPACE_TYPE_PRIVATE') await state.setActiveSpace('SPACE_TYPE_PRIVATE');
        if (!current()) throw new UserError('原入口已变化，本次查看已取消。');
        state.setSearchKeyword(rows[0].title); state.open();
        setExpanded(ids => [...new Set([...ids, nativeLibraryCategoryId(projectId, kind)])]);
        const until = Date.now() + 12000;
        while (current() && Date.now() < until) {
          const page = latest.current[kind], source = page.source;
          const row = libraryRowOwners.get(JSON.stringify([projectId, kind, id]));
          if (row?.canvasId === canvasId && !page.loading && !page.failed && source?.projectId === projectId && source.canvasId === canvasId
            && source.api === useCanvasStore.getState().rfInstance && source.query === rows[0].title) { row.open(); return; }
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        throw new UserError('这份集合暂未在原资料库读出，原输入保留；请重新打开。');
      },
    };
    libraryListOwner = value;
    return () => { if (libraryListOwner === value) libraryListOwner = null; };
  }, [projectId, canvasId, NativeLibraryStore, session]);
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

/** Keep the whole canonical Scope as one reference. The original submit path
 * resolves every nested member atomically; the Library never flattens it. */
export function nativeLibraryContextReferences(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot,
  presentations: readonly PresentationViewV0[]): readonly LcosNodeEntityRef[] {
  exactContext(projectId, item, graph, presentations);
  return [{ entityType: 'scope', entityId: item.entityRef.id, displayLabel: item.title }];
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
    const materialName=(id:string)=>graph.artifacts.find(a=>a.id===graph.artifactViews.find(v=>String(v.id)===id)?.artifactId)?.title||'暂不可用的材料';
    const kindName=(kind:string)=>({'condition':'条件分支','parallel-split':'分头进行','parallel-join':'汇合结果','reference':'材料说明'}[kind]??'结构说明');
    for (const action of actions) text.push(`步骤：${action.label}${action.description?.trim() ? `\n${action.description}` : ''}${action.attachedViewIds.length?`\n使用材料：${action.attachedViewIds.map(materialName).join('、')}`:''}`);
    for (const edge of presentation.state.workflowActionEdges ?? []) text.push(`步骤连接：${actionNames.get(edge.fromActionId) || '未命名步骤'} → ${actionNames.get(edge.toActionId) || '未命名步骤'}${edge.label ? `（${edge.label}）` : ''}`);
    for (const operator of Object.values(operators)) {
      text.push(`${kindName(operator.kind)}${operator.label ? `：${operator.label}` : ''}`);
      for (const branch of operator.branches ?? []) text.push(`分支：${branch.label}${branch.predicateText ? `；条件说明：${branch.predicateText}` : ''}${branch.targetViewId ? `；使用材料：${materialName(branch.targetViewId)}` : ''}`);
    }
  }
  return text.join('\n\n');
}

type NavigationOwner = { projectId: string; canvasId: string; disabled: boolean; onSelect: (target: { id: string }) => Promise<unknown> | unknown };
let navigationOwner: NavigationOwner | null = null;
type BrowseFrame = { detail: unknown; key: string; focus?: string; scroll?: number };
let libraryListOwner: NativeScopeOpenOwner & { store: NativeLibraryPlacementStore; read(): readonly string[]; expand(ids: readonly string[]): void } | null = null;
const libraryRowOwners = new Map<string,{canvasId:string;open():void}>();
/** Only original Popover placement eligibility. Domain entry/return
 * registration below remains Scope/Collection-only; a Core material keeps its
 * exact existing Assembly producer, pinned read and native TS action. */
export function nativeLibraryUsesResponsivePreview(asset: unknown, projectId?: string): boolean {
  if (nativeLibraryEntry({ asset }, projectId)) return true;
  if (!nonEmpty(projectId)) return false;
  try { nativeAssemblyItem({ asset }, projectId); return true; } catch { return false; }
}
/** Register the existing Zp C(true) callback. A return opens rather than
 * toggles the original row, without a synthetic click or an alternate page. */
export function LCOSUseNativeLibraryRowOwner(asset: unknown, open: () => void) {
  const projectId=useLcosShellStore(state=>state.projectId),canvasId=useCanvasStore(state=>state.canvasId);
  const entry=nativeLibraryEntry({asset},projectId??undefined);
  const responsive=nativeLibraryUsesResponsivePreview(asset,projectId??undefined);
  const [narrow, setNarrow] = useState(() => responsive && typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    if (!responsive) return;
    let active = true;
    const media = window.matchMedia('(max-width: 700px)'), update = () => { if (active) setNarrow(media.matches); };
    update(); media.addEventListener('change', update);
    return () => { active = false; media.removeEventListener('change', update); };
  }, [responsive]);
  useEffect(()=>{
    if(!entry||!canvasId)return;
    const key=JSON.stringify([entry.projectId,entry.item.kind,entry.item.entityRef.id]),owner={canvasId,open};
    libraryRowOwners.set(key,owner);
    return()=>{if(libraryRowOwners.get(key)===owner)libraryRowOwners.delete(key);};
  },[entry?.projectId,entry?.item.kind,entry?.item.entityRef.id,canvasId,open]);
  return responsive ? narrow ? 'bottom' : 'right' : undefined;
}

/** Presentation eligibility shares the exact existing Core address check;
 * only the currently open original row can observe notice placement. */
export function LCOSUseNativeLibraryPreviewLayout(asset: unknown, open: boolean) {
  const projectId = useLcosShellStore(state => state.projectId), canvas = useCanvasStore(state => state);
  const eligible = nativeLibraryUsesResponsivePreview(asset, projectId ?? undefined);
  const layout = useNativeLibraryPreviewLayout(eligible && open, { projectId, canvasId: canvas.canvasId, api: canvas.rfInstance });
  return eligible ? layout : undefined;
}

type LibraryNavigation = { projectId: string; source: Workspace; destination: Workspace; root: { kind: string; id: string; title: string };
  path: readonly BrowseFrame[]; query: string; activeSpace: unknown; store?: NativeLibraryPlacementStore;
  returnToSource?:()=>Promise<void>;
  restoreComposerFocus?:boolean;
  priorReturn?:LibraryNavigation;
  memberOrigin?: LibraryMemberOrigin;
  expanded: readonly string[]; listScroll: number;
  input: NativeLibraryInputReturn | null; caret: ReturnType<typeof useLcosShellStore.getState>['composerCaret'];
  conversation: ReturnType<typeof readNativeConversationSelection>; inputTouched?: boolean;
  restoringWork?: boolean;
  notify?: (message:string)=>void;
  viewport: { x: number; y: number; zoom: number }; phase: 'visiting' | 'returning' | 'restoring'; error?: string };
let libraryNavigation: LibraryNavigation | null = null;
if(typeof window!=='undefined')for(const type of ['pointerdown','keydown','beforeinput'])window.addEventListener(type,event=>{
  const value=libraryNavigation,target=event.target;
  if(value&&value.phase==='restoring'&&target instanceof Element&&sameNavigationScene(value,String(value.source.canvasId))){
    if(target.closest('textarea[data-lcos-composer-input]'))value.inputTouched=true;
    if(event.isTrusted&&!target.closest('[data-testid="canvas-header-logo-button"]'))publishNavigation(null);
  }
},true);
const navigationListeners = new Set<() => void>();
const publishNavigation = (value: LibraryNavigation | null) => { libraryNavigation = value; navigationListeners.forEach(listener => listener()); };
const sameNavigationScene = (value: LibraryNavigation, canvasId: string) => useLcosShellStore.getState().projectId === value.projectId
  && useCanvasStore.getState().status === 'ready' && useCanvasStore.getState().canvasId === canvasId;
/** Keep an arrival failure on the existing Back frame even when the destination
 * workspace/API has not mounted. No selection or input is replayed here. */
export function reportNativeWorkspaceNavigationError(projectId:string,sourceCanvasId:string,destinationCanvasId:string,
  root:{kind:string;id:string},message:string):boolean {
  const value=libraryNavigation;
  if(!value||value.phase!=='visiting'||value.projectId!==projectId
    ||value.source.canvasId!==sourceCanvasId||value.destination.canvasId!==destinationCanvasId
    ||value.root.kind!==root.kind||value.root.id!==root.id||!nonEmpty(message)
    ||useLcosShellStore.getState().projectId!==projectId||useCanvasStore.getState().canvasId!==destinationCanvasId)return false;
  publishNavigation({...value,error:message});
  notifyNativeLibraryInputReturn(message);
  return true;
}
export function nativeLibraryNavigationRetains(projectId:string,kind:string,id:string):boolean {
  const value=libraryNavigation;return !!value&&value.phase==='restoring'&&!value.error&&value.projectId===projectId&&value.root.kind===kind&&value.root.id===id
    &&sameNavigationScene(value,String(value.source.canvasId));
}
export function nativeWorkspaceSourceRestoring(projectId:string,canvasId:string,root?:{kind:string;id:string}):boolean {
  const value=libraryNavigation;return !!value&&value.phase==='restoring'&&!value.error&&!!value.returnToSource
    &&value.projectId===projectId&&value.source.canvasId===canvasId&&(!root||value.root.kind===root.kind&&value.root.id===root.id)&&sameNavigationScene(value,canvasId);
}
async function restoreOriginalLibrary(value: LibraryNavigation) {
  if (libraryNavigation !== value || !sameNavigationScene(value, String(value.source.canvasId))) return;
  if(value.input){
    await new Promise<void>((resolve,reject)=>{let frames=0;const restore=()=>{
      if(libraryNavigation!==value||!sameNavigationScene(value,String(value.source.canvasId))){resolve();return;}
      const shell=useLcosShellStore.getState(),input=value.input!;
      if(composerInputKey(shell.composerTarget)!==input.inputKey||shell.activeWorkspaceId!==String(value.source.id)){
        if(shell.activeWorkspaceId===String(value.source.id)&&shell.composerTarget?.workspaceId===String(value.source.id)) {resolve();return;}
        if(++frames>180){reject(new UserError('已回到原现场，原输入地址还未就绪；返回位置保留。'));return;}requestAnimationFrame(restore);return;
      }
      if(shell.composerTarget?.messageId!==input.messageId||shell.composerTarget?.continuationOperationId!==input.continuationOperationId){resolve();return;}
      restoreNativeConversationSelection(value.conversation,value.projectId,String(value.source.canvasId));
      const liveCaret=shell.composerCaret;
      const hasCurrentCaret=liveCaret?.projectId===value.projectId&&liveCaret.targetKey===input.inputKey&&liveCaret.text===shell.composerPrompt
        &&Number.isInteger(liveCaret.start)&&Number.isInteger(liveCaret.end)&&liveCaret.start>=0&&liveCaret.end>=liveCaret.start&&liveCaret.end<=shell.composerPrompt.length;
      if(!value.inputTouched&&!hasCurrentCaret&&value.caret?.projectId===value.projectId&&value.caret.text===shell.composerPrompt
        &&value.caret.targetKey===input.inputKey)shell.rememberComposerCaret(value.caret);
      if(value.restoreComposerFocus!==false)useLcosShellStore.getState().resumeComposer(input.inputKey);resolve();
    };restore();});
  }
  if(libraryNavigation!==value||!sameNavigationScene(value,String(value.source.canvasId)))return;
  if(value.returnToSource){await value.returnToSource();consumeNativeWorkspaceReturn(value);return;}
  const store=value.store;
  if(!store)throw new UserError('原库返回位置不可读取。');
  const state = store.getState() as any;
  if (value.memberOrigin && !value.memberOrigin.closed) {
    value.memberOrigin.api = useCanvasStore.getState().rfInstance;
    value.memberOrigin.restored = true;
    publishMemberOrigin(value.memberOrigin);
  }
  if (typeof state.open !== 'function' || typeof state.setSearchKeyword !== 'function') throw new UserError('原库暂未就绪，返回位置仍保留。');
  if (state.activeSpace !== value.activeSpace) {
    if (typeof state.setActiveSpace !== 'function') throw new UserError('原库分类暂未就绪，返回位置仍保留。');
    await state.setActiveSpace(value.activeSpace);
  }
  if (libraryNavigation !== value || !sameNavigationScene(value, String(value.source.canvasId))) return;
  store.getState().setSearchKeyword instanceof Function && (store.getState().setSearchKeyword as (value: string) => void)(value.query);
  (store.getState().open as () => void)();
  const address = JSON.stringify([value.projectId, value.root.kind, value.root.id]);
  await new Promise<void>((resolve, reject) => {
    let frames = 0;
    const find = () => {
      if (libraryNavigation !== value || !sameNavigationScene(value, String(value.source.canvasId))) { resolve(); return; }
      if (libraryListOwner?.projectId === value.projectId && libraryListOwner.canvasId === value.source.canvasId) {
        const current = libraryListOwner.read();
        if (value.expanded.some(id => !current.includes(id))) libraryListOwner.expand([...new Set([...current,...value.expanded])]);
      }
      const scroller = [...document.querySelectorAll<HTMLElement>('[data-library-view="library"] *')].find(element=>element.scrollHeight>element.clientHeight+1&&/auto|scroll/.test(getComputedStyle(element).overflowY));
      if (scroller && Math.abs(scroller.scrollTop-value.listScroll)>1) scroller.scrollTop=value.listScroll;
      const row = libraryRowOwners.get(address);
      if (row?.canvasId===value.source.canvasId) {
        row.open();
        resolve(); return;
      }
      if (++frames > 180) { reject(new UserError('已回到原现场，但原库条目暂未读出；返回位置仍保留，可重试。')); return; }
      requestAnimationFrame(find);
    };
    requestAnimationFrame(find);
  });
}

/** Temporary return address projected onto the existing native header Back. */
export function LCOSUseNativeLibraryNavigationBack(canvasId: string, notify?: NativeLibraryInputNotice) {
  const value = useSyncExternalStore(listener => { navigationListeners.add(listener); return () => { navigationListeners.delete(listener); }; }, () => libraryNavigation, () => null);
  const projectId = useLcosShellStore(state => state.projectId);
  useEffect(() => {
    if (!projectId || !notify) return;
    const owner = { projectId, canvasId, notify }; libraryInputNoticeOwner = owner;
    return () => { if (libraryInputNoticeOwner === owner) libraryInputNoticeOwner = null; };
  }, [projectId, canvasId, notify]);
  if (!value || value.projectId !== projectId || value.destination.canvasId !== canvasId) return null;
  return { title: value.error ?? (value.phase === 'returning' ? '正在返回原内容…' : value.phase === 'restoring' ? '恢复原库位置' : `返回 ${value.root.title}`),
    busy: value.phase === 'returning', icon: <ArrowLeft size={20} strokeWidth={1.5} />,
    onBack: () => { if (libraryNavigation !== value || value.phase === 'returning' || value.restoringWork) return;
      void (async () => {
        if (value.phase === 'restoring') { publishNavigation({...value,error:undefined,restoringWork:false}); return; }
        const session = createLcosCoreSession(), rows = await session.projects.getWorkspaces(value.projectId);
        if (libraryNavigation !== value || !sameNavigationScene(value, canvasId)) return;
        const source = rows.filter(row => String(row.id) === String(value.source.id) && row.canvasId === value.source.canvasId && String(row.projectId) === value.projectId);
        if (source.length !== 1) throw new UserError('原现场地址已变化，返回位置保留；请重新读取。');
        const returning = { ...value, phase: 'returning' as const, error: undefined, notify }; publishNavigation(returning);
        await navigateNativeLibraryWorkspace(value.projectId, canvasId, source[0]);
        if (libraryNavigation !== returning || !sameNavigationScene(value, String(source[0].canvasId))) return;
        await useCanvasStore.getState().setViewport(value.viewport, { duration: 0 });
        const restoring = { ...returning, phase: 'restoring' as const, destination: source[0] }; publishNavigation(restoring);
      })().catch(error => { const live = libraryNavigation;
        if (live?.projectId === value.projectId && live.root.id === value.root.id) {
          const message=error instanceof UserError ? error.message : '暂时无法返回原内容，位置仍保留；请重试。';
          publishNavigation({ ...live, phase: live.phase === 'restoring' ? 'restoring' : 'visiting',error:message });notify?.(message);
        } });
    } };
}
/** An ephemeral reference to the original header Ke; no router or scene truth. */
export function LCOSNativeLibraryNavigationOwner({ canvasId, onSelect, disabled }: {
  canvasId: string; onSelect: NavigationOwner['onSelect']; disabled: boolean;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const status = useCanvasStore(state => state.status);
  const returning = useSyncExternalStore(listener=>{navigationListeners.add(listener);return()=>{navigationListeners.delete(listener);};},()=>libraryNavigation,()=>null);
  useEffect(()=>{
    const value=libraryNavigation;if(!value)return;
    const allowed=value.phase==='restoring'?[value.source.canvasId]:[value.source.canvasId,value.destination.canvasId];
    const liveProject=useLcosShellStore.getState().projectId,liveCanvas=useCanvasStore.getState();
    if(liveProject&&(value.projectId!==liveProject||liveCanvas.status==='ready'&&!allowed.includes(String(liveCanvas.canvasId))))publishNavigation(null);
  },[projectId,canvasId,status,returning]);
  useEffect(() => {
    if (!projectId) return;
    const owner = { projectId, canvasId, onSelect, disabled };
    navigationOwner = owner;
    return () => { if (navigationOwner === owner) navigationOwner = null; };
  }, [projectId, canvasId, onSelect, disabled]);
  useEffect(()=>{
    if(!returning||returning.phase!=='restoring'||returning.projectId!==projectId||returning.source.canvasId!==canvasId
      ||status!=='ready'||disabled||returning.restoringWork||returning.error)return;
    returning.restoringWork=true;
    void restoreOriginalLibrary(returning).catch(error=>{
      if(libraryNavigation===returning){const message=error instanceof UserError?error.message:'原库位置暂未恢复，请重试。';
        publishNavigation({...returning,restoringWork:false,error:message});returning.notify?.(message);}
    }).finally(()=>{returning.restoringWork=false;});
  },[returning,projectId,canvasId,status,disabled]);
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

/** Other original pages use the same header return owner; only their source
 * restoration callback differs from the Library row restoration. */
function consumeNativeWorkspaceReturn(value:LibraryNavigation){
  if(libraryNavigation!==value)return;
  if(!sameNavigationScene(value,String(value.source.canvasId))){publishNavigation(null);return;}
  const prior=value.priorReturn;
  publishNavigation(prior&&prior.projectId===value.projectId&&prior.phase==='visiting'
    &&prior.destination.id===value.source.id&&prior.destination.canvasId===value.source.canvasId?prior:null);
}
export async function enterNativeWorkspaceWithReturn(projectId:string,target:Workspace,root:{kind:string;id:string;title:string},restore:()=>Promise<void>,
  options?:{preservePriorReturn?:boolean;isCurrent?:()=>boolean;restoreComposerFocus?:boolean}){
  const canvas=useCanvasStore.getState(),session=createLcosCoreSession();
  if(!canvas.canvasId||!canvas.rfInstance||canvas.status!=='ready')throw new UserError('当前现场尚未就绪。');
  const canvasId=canvas.canvasId,api=canvas.rfInstance,rows=await session.projects.getWorkspaces(projectId);
  if(options?.isCurrent?.()===false||useCanvasStore.getState().canvasId!==canvasId||useCanvasStore.getState().rfInstance!==api||useLcosShellStore.getState().projectId!==projectId)throw new UserError('现场已切换，没有拉回旧目标。');
  const source=rows.filter(w=>w.canvasId===canvasId),dest=rows.filter(w=>w.id===target.id&&w.scopeId===target.scopeId&&w.canvasId===target.canvasId);
  if(source.length!==1||dest.length!==1)throw new UserError('现场地址已变化，请重新读取。');
  if(target.canvasId===canvasId)return;
  const prior=libraryNavigation;
  const priorReturn=options?.preservePriorReturn&&prior?.projectId===projectId&&prior.phase==='visiting'
    &&prior.destination.canvasId===canvasId&&prior.destination.id===source[0].id?prior:undefined;
  const value:LibraryNavigation={projectId,source:source[0],destination:dest[0],root,path:[],query:'',activeSpace:undefined,expanded:[],listScroll:0,
    input:captureNativeLibraryInputReturn(projectId),caret:useLcosShellStore.getState().composerCaret,conversation:readNativeConversationSelection(),
    viewport:api.getViewport(),phase:'visiting',returnToSource:restore,priorReturn,restoreComposerFocus:options?.restoreComposerFocus};
  publishNavigation(value);
  try{await navigateNativeLibraryWorkspace(projectId,canvasId,dest[0]);}catch(error){
    if(libraryNavigation===value){if(sameNavigationScene(value,canvasId)&&options?.isCurrent?.()!==false)consumeNativeWorkspaceReturn(value);else publishNavigation(null);}throw error}
}

/** The complete, lightweight Run projection avoids the paged review list.
 * A failed Run read leaves other members usable and the Run ref visible. */
async function readNativeLibraryRuns(session: ReturnType<typeof createLcosCoreSession>, projectId: string, signal?: AbortSignal): Promise<readonly RunCanvasProjection[] | null> {
  try {
    const value = await session.runs.readExecutionProjection(projectId, signal);
    return value.projectId === projectId && Array.isArray(value.runs) ? value.runs : null;
  } catch { return null; }
}

type DetailModel = { graph: ProjectGraphSnapshot; presentations: readonly PresentationViewV0[]; workspaces: readonly Workspace[]; conversations: readonly ConnectedConversationV1[]; runs: readonly RunCanvasProjection[] | null;
  method?: WorkflowMethodDraft; contextReady?: boolean; version: string };
const buttonClass = 'flex h-9 w-full items-center justify-center rounded-lg border border-border bg-foreground/5 px-3 text-sm font-medium transition-colors hover:bg-foreground/10 disabled:opacity-40';

/** The original row Popover and TS preview remain the only detail surface. */
export function LCOSNativeLibraryContextDetail({ detail, NativePreview, onClose }: {
  detail: unknown; NativePreview: ComponentType<any>; onClose?: () => void;
}) {
  const projectId = useLcosShellStore(state => state.projectId);
  const entry = nativeLibraryEntry(detail, projectId ?? undefined);
  const canvas = useCanvasStore(state => state);
  const [trail, setTrail] = useState<BrowseFrame[]>(() => {
    const value = libraryNavigation;
    return value?.phase === 'restoring' && value.projectId === projectId && value.source.canvasId === canvas.canvasId
      && value.root.kind === entry?.item.kind && value.root.id === entry.item.entityRef.id ? [...value.path] : [];
  });
  const libraryStore = useNativeLibraryPlacementStore();
  const origin = useSyncExternalStore(listener => { memberOriginListeners.add(listener); return () => { memberOriginListeners.delete(listener); }; }, () => libraryMemberOrigin, () => null);
  const methodOrigin = origin && origin.address.projectId === projectId && origin.address.canvasId === canvas.canvasId
    && origin.address.kind === entry?.item.kind && origin.address.id === entry.item.entityRef.id ? origin : null;
  const returnToMethod = methodOrigin ? () => {
    const close = () => { onClose?.(); const state = libraryStore?.getState() as any; if (typeof state?.close === 'function') state.close(); };
    const back = () => { void returnLibraryMemberOrigin(methodOrigin, close).catch(error => notifyNativeLibraryInputReturn(
      error instanceof UserError ? error.message : '原方法位置暂未恢复，可重试返回；原输入保留。', back)); };
    back();
  } : undefined;
  const inputOrigin = useNativeLibraryInputOrigin();
  const returnToInput = inputOrigin && sameScopeReferenceInput(inputOrigin) ? () => {
    void returnNativeLibraryInputReturn(inputOrigin, () => {
      onClose?.();
      const state = libraryStore?.getState() as any;
      if (typeof state?.close === 'function') state.close();
    });
  } : undefined;
  const navigationRestore = useSyncExternalStore(listener => { navigationListeners.add(listener); return () => { navigationListeners.delete(listener); }; }, () => libraryNavigation, () => null);
  const rootKey = JSON.stringify([projectId, entry?.item.kind, entry?.item.entityRef.id, canvas.canvasId]);
  const root = useRef<HTMLDivElement>(null), reading = useRef<NativeLibraryReadingReturn>();
  const [panelReading, setPanelReading] = useState(false);
  useLayoutEffect(() => {
    if (!panelReading) return;
    // Suspend the existing source flyout while its destination owns the
    // screen. Keep the same mounted path; do not stack it over a narrow rail.
    const surface = root.current?.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
    if (!surface) return;
    const hidden = surface.hidden; surface.hidden = true;
    return () => { surface.hidden = hidden; };
  }, [panelReading]);
  const restore = useRef<{ focus?: string; scroll?: number }>(trail.at(-1));
  const path = trail[0]?.key === rootKey ? trail : [{ detail, key: rootKey }];
  const active = path.at(-1)!;
  useEffect(() => {
    if (navigationRestore?.phase !== 'restoring' || navigationRestore.error || navigationRestore.projectId !== projectId || navigationRestore.source.canvasId !== canvas.canvasId
      || navigationRestore.root.kind !== entry?.item.kind || navigationRestore.root.id !== entry.item.entityRef.id) return;
    restore.current = navigationRestore.path.at(-1); setTrail([...navigationRestore.path]);
  }, [navigationRestore, rootKey]);
  useEffect(() => () => cancelNativeLibraryReadingReturn(reading.current), [rootKey, canvas.rfInstance]);
  useEffect(() => () => {
    if (methodOrigin && !methodOrigin.returning && libraryNavigation?.memberOrigin !== methodOrigin)
      releaseLibraryMemberOrigin(methodOrigin, false);
  }, [methodOrigin, rootKey, canvas.rfInstance]);
  const restorePosition = () => {
    const wanted = restore.current;
    if (!wanted) return;
    requestAnimationFrame(() => {
      if (restore.current !== wanted) return;
      const body = root.current?.querySelector<HTMLElement>('.native-library-content-body');
      const button = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-native-scope-member]') ?? [])]
        .find(button => button.dataset.nativeScopeMember === wanted.focus);
      if (!body || wanted.focus && !button) return;
      if (wanted.scroll !== undefined) body.scrollTop = wanted.scroll;
      (button ?? root.current?.querySelector<HTMLButtonElement>('[data-native-scope-back]'))?.focus({ preventScroll: true });
      restore.current = undefined;
      const returning = libraryNavigation;
      if (returning?.phase === 'restoring' && returning.projectId === projectId && returning.source.canvasId === canvas.canvasId
        && returning.root.id === entry?.item.entityRef.id && !returning.error) {
        let stable=0,frames=0;
        const settle=()=>{
          if(libraryNavigation!==returning||!root.current?.isConnected)return;
          if(!button?.isConnected)return;
          if(document.activeElement===button)stable++;else{stable=0;button.focus({preventScroll:true});}
          if(stable>=2){publishNavigation(null);return;}
          if(++frames>120){publishNavigation({...returning,error:'已回到原内容，焦点暂未稳定；可重试恢复。'});return;}
          requestAnimationFrame(settle);
        };requestAnimationFrame(settle);
      }
    });
  };
  useLayoutEffect(restorePosition);
  const remember = (key: string) => ({ focus: key, scroll: root.current?.querySelector('.native-library-content-body')?.scrollTop });
  const enterMember = (member: Extract<NativeScopeMember, { kind: 'scope' | 'collection' }>) => {
    const key = JSON.stringify([projectId, member.item.kind, member.item.entityRef.id, canvas.canvasId]);
    const ancestor = path.findIndex(frame => frame.key === key);
    if (ancestor >= 0) { restore.current = path[ancestor]; setTrail(path.slice(0, ancestor + 1)); return; }
    setTrail([...path.slice(0, -1), { ...active, ...remember(member.key) },
      { key, detail: { asset: { lcos_library_entry: { projectId, item: member.item }, name: member.title, asset_type: 4 } } }]);
  };
  const readMember = (target: NativeMaterialViewRequest | NativeNoteViewRequest | NativeConversationViewRequest | NativeTaskViewRequest, key: string,
    restoreConversation?: () => void) => {
    if (!entry || !projectId || ('artifactId' in target || 'noteId' in target) && !nativeMaterialViewerAvailable()) throw new UserError('阅读器暂未就绪，请稍后再打开。');
    const captured = { canvasId: canvas.canvasId, api: canvas.rfInstance, focus: remember(key) };
    const lease: NativeLibraryReadingReturn = { projectId, rootKind: entry.item.kind, rootId: entry.item.entityRef.id, closed: false,
      current: () => !lease.closed && reading.current === lease && !!root.current?.isConnected && useLcosShellStore.getState().projectId === projectId
        && useCanvasStore.getState().canvasId === captured.canvasId && useCanvasStore.getState().rfInstance === captured.api,
      onUse: () => onClose?.(),
      onRelease: preserveOrigin => {
        setPanelReading(false);
        // Back restores this source. Closing the destination or choosing a
        // different conversation ends the preview instead of overlaying it.
        if (!preserveOrigin && root.current?.isConnected) onClose?.();
      },
      // wa can clear its session while its queued opening/exit and focus
      // cleanup still run. Retain this same Popover until the original Viewer
      // is gone and the original member has focus; do not race its animation.
      onReturn: () => new Promise<void>(resolve => {
        setPanelReading(false); restoreConversation?.();
        let frames = 0;
        const finish = () => {
          if (!lease.current() || ++frames > 120) { resolve(); return; }
          if (document.querySelector('[data-media-viewer]')) { requestAnimationFrame(finish); return; }
          restore.current = captured.focus; setTrail([...path]);
          requestAnimationFrame(() => { if (lease.current()) restorePosition(); requestAnimationFrame(resolve); });
        };
        requestAnimationFrame(finish);
      }),
    };
    cancelNativeLibraryReadingReturn(reading.current, true); restore.current = undefined; reading.current = lease;
    setPanelReading('runId' in target || 'conversationId' in target);
    try {
      if ('artifactId' in target) requestNativeMaterialView(withNativeLibraryReadingReturn(target, lease));
      else if ('noteId' in target) requestNativeNoteView(withNativeLibraryReadingReturn(target, lease));
      else if ('runId' in target) { if (!requestNativeTaskView(withNativeLibraryReadingReturn(target, lease))) throw new UserError('原任务暂时无法打开。'); }
      else if (!requestNativeConversationView(withNativeLibraryReadingReturn(target, lease))) throw new UserError('原对话暂时无法打开。');
    }
    catch (error) { cancelNativeLibraryReadingReturn(lease); throw error; }
  };
  const openMember = async (member: NativeScopeMember) => {
    if (member.kind === 'scope' || member.kind === 'collection') enterMember(member);
    else if (member.kind === 'material') readMember(member.target, member.key);
    else if (member.kind === 'note') readMember({ projectId: projectId!, noteId: member.noteId, updatedAt: member.updatedAt, title: member.title }, member.key);
    else if (member.kind === 'conversation' || member.kind === 'run') {
      const previous = readNativeConversationSelection();
      const origin = captureNativeLibraryInputReturn(projectId!);
      readMember(member.kind === 'run' ? { projectId: projectId!, runId: member.runId } : { projectId: projectId!, conversationId: member.conversationId }, member.key, () => {
        restoreNativeConversationSelection(previous, projectId!, canvas.canvasId!);
        if (origin && composerInputKey(useLcosShellStore.getState().composerTarget) === origin.inputKey) useLcosShellStore.getState().resumeComposer(origin.inputKey);
      });
    } else if (member.kind === 'workspace') {
      if (!projectId || !canvas.canvasId || !canvas.viewport || !libraryStore || !entry) throw new UserError('原现场返回地址尚未就绪，请稍后再试。');
      const session = createLcosCoreSession(), workspaces = await session.projects.getWorkspaces(projectId);
      if (!root.current?.isConnected || useLcosShellStore.getState().projectId !== projectId
        || useCanvasStore.getState().canvasId !== canvas.canvasId || useCanvasStore.getState().rfInstance !== canvas.rfInstance)
        throw new UserError('原现场或内容已切换，未进入旧目标。');
      const source = workspaces.filter(row => String(row.projectId) === projectId && row.canvasId === canvas.canvasId);
      const targets = workspaces.filter(row => String(row.projectId) === projectId && String(row.id) === String(member.workspace.id) && row.canvasId === member.workspace.canvasId);
      if (source.length !== 1 || targets.length !== 1) throw new UserError('现场身份已变化，未切换到其他内容。');
      if (targets[0].canvasId === canvas.canvasId) return;
      const query = libraryStore.getState().searchKeyword;
      if (typeof query !== 'string') throw new UserError('原库返回位置尚未确认。');
      const value: LibraryNavigation = { projectId, source: source[0], destination: targets[0], root: {kind: entry.item.kind,id: entry.item.entityRef.id,title:entry.item.title},
        memberOrigin: methodOrigin ?? undefined,
        path: [...path.slice(0,-1),{...active,...remember(member.key)}], query, activeSpace:libraryStore.getState().activeSpace, store:libraryStore,
        expanded: libraryListOwner?.projectId===projectId&&libraryListOwner.canvasId===canvas.canvasId?[...libraryListOwner.read()]:[],
        listScroll:[...document.querySelectorAll<HTMLElement>('[data-library-view="library"] *')].find(element=>element.scrollHeight>element.clientHeight+1&&/auto|scroll/.test(getComputedStyle(element).overflowY))?.scrollTop??0,
        input:captureNativeLibraryInputReturn(projectId),caret:useLcosShellStore.getState().composerCaret,conversation:readNativeConversationSelection(),
        viewport: canvas.rfInstance!.getViewport(), phase:'visiting' };
      publishNavigation(value);
      try { await navigateNativeLibraryWorkspace(projectId,canvas.canvasId,targets[0]); }
      catch(error) { if(libraryNavigation===value) publishNavigation(null); throw error; }
    }
    else throw new UserError(member.reason);
  };
  const back = path.length > 1 ? () => { restore.current = path.at(-2); setTrail(path.slice(0, -1)); } : undefined;
  const Detail = nativeLibraryEntry(active.detail)?.item.kind === 'collection' ? LCOSNativeLibraryCollectionDetail : NativeLibraryScopeDetail;
  return <div ref={root} data-native-library-browse-root={JSON.stringify([projectId, entry?.item.kind, entry?.item.entityRef.id])} data-native-library-method-origin={methodOrigin ? true : undefined}><Detail
    key={active.key} detail={active.detail} NativePreview={NativePreview} onClose={onClose} onBack={back ?? returnToMethod ?? returnToInput}
    parentTitle={path.length > 1 ? nativeLibraryEntry(path.at(-2)!.detail)?.item.title : methodOrigin ? methodOrigin.source.title : returnToInput ? '当前输入' : undefined}
    onOpenMember={openMember} onReady={restorePosition} /></div>;
}

function NativeLibraryScopeDetail({ detail, NativePreview, onClose, onBack, parentTitle, onOpenMember, onReady }: {
  detail: unknown; NativePreview: ComponentType<any>; onClose?: () => void;
  onBack?: () => void; parentTitle?: string;
  onOpenMember(member: NativeScopeMember): Promise<void>;
  onReady(): void;
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
    const [graph, presentations, workspaces, conversations, runs] = await Promise.all([session.projects.getProjectGraph(projectId),
      session.projects.listPresentations(projectId, signal), session.projects.getWorkspaces(projectId, signal), session.conversations.listConnectedConversations(projectId, signal), readNativeLibraryRuns(session, projectId, signal)]);
    if (!graph) throw new UserError('内容暂时无法读取，请重新打开。');
    exactScope(projectId, entry.item, graph);
    if (workspaces.some(workspace => String(workspace.projectId) !== projectId)) throw new UserError('现场身份尚未确认，请重新打开。');
    const contextRows = presentations.filter(view => view.projectId === projectId && view.scopeId === entry.item.entityRef.id
      && view.capability === 'context' && view.id === `presentation:context:${entry.item.entityRef.id}`);
    const relevant = entry.item.kind === 'context' ? contextRows.length === 0 ? [] : [exactContext(projectId, entry.item, graph, presentations)]
      : presentations.filter(view => view.projectId === projectId && view.scopeId === entry.item.entityRef.id && view.capability === 'workflow');
    if (entry.item.kind === 'workflow' || relevant.length) nativeLibraryScopeMembers(projectId, entry.item, graph, presentations, workspaces, conversations, runs);
    return { graph, presentations, workspaces, conversations, runs,
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
  useLayoutEffect(() => { if (model) onReady(); }, [model, onReady]);

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
        if (reason) throw new UserError('当前对话暂不能使用其中部分材料，可先逐项查看；原输入保留。');
        const result = useLcosReferenceStore.getState().addEntitiesToDraft(prepared.references, before.intent);
        if (result.reason) throw new UserError('引用尚未加入，原输入保留。');
        onClose?.();
        await restoreNativeLibraryInputReturn(returnInput);
        return '已加入当前对话';
      }
      // load() already built and validated this method from the same fresh
      // graph/Presentation read; do not read a second, potentially newer copy.
      const method = value.method;
      if (method?.status !== 'ready') throw new UserError('这份方法还没有可取用的步骤，可以先查看关联材料。');
      if (model?.method?.status !== 'ready' || method.prompt !== model.method.prompt
        || JSON.stringify(method.references) !== JSON.stringify(model.method.references))
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
    await onOpenMember({ key: JSON.stringify(['workspace',String(exact[0].id)]), title: exact[0].name, kind: 'workspace', workspace: exact[0] });
    return '已进入现场';
  });
  const openMember = (member: NativeScopeMember) => act(async version => {
    const value = await fresh(version);
    const exact = nativeLibraryScopeMembers(projectId, item!, value.graph, value.presentations, value.workspaces, value.conversations, value.runs).find(row => row.key === member.key);
    if (exact?.kind === 'unavailable') throw new UserError(exact.reason);
    if (!exact || JSON.stringify(exact) !== JSON.stringify(member)) throw new UserError('这项内容已变化，请重新读取后再打开。');
    await onOpenMember(exact);
    return '';
  });
  const memberList = () => {
    const members = nativeLibraryScopeMembers(projectId, item!, model!.graph, model!.presentations, model!.workspaces, model!.conversations, model!.runs);
    return <div className="native-scope-members" data-native-scope-members>
      <div className="native-scope-section-label">{context ? '包含内容' : '关联材料'}<span>{members.length}</span></div>
      {members.length ? <ul>{members.map(member => <li key={member.key}>
        {member.kind === 'unavailable' ? <div className="native-scope-unavailable"><FileText size={16} /><span>{member.title}<small>{member.reason}</small></span></div>
          : <button type="button" data-native-scope-member={member.key} aria-label={`${['scope','collection','workspace','conversation','run'].includes(member.kind) ? '进入' : '查看'} ${member.title}`}
            disabled={busy} onClick={() => { void openMember(member); }}>
            {member.kind === 'scope' || member.kind === 'collection' ? <Layers size={16} /> : <FileText size={16} />}<span>{member.title}
              <small>{member.kind === 'scope' || member.kind === 'collection' ? label(member.item.kind as Kind) : member.kind === 'material' ? '查看所存版本'
                : member.kind === 'run' ? '打开原任务' : member.kind === 'conversation' ? '打开原对话' : member.kind === 'workspace' ? '进入原现场' : '查看附注'}</small></span><ChevronRight size={14} />
          </button>}
      </li>)}</ul> : <p className="text-xs text-muted-foreground">还没有加入内容</p>}
    </div>;
  };
  let body;
  const methodArchived=!!model&&item?.kind==='workflow'&&!!(model.graph.scopes.find(scope=>String(scope.id)===item.entityRef.id) as {archivedAt?:string}|undefined)?.archivedAt;
  if (!model) body = <div className="w-full p-4 text-sm text-muted-foreground">{failed ? '内容暂时打不开' : '正在读取…'}</div>;
  else if (!context) body = <div className="w-full p-3 text-sm leading-6" data-native-library-method-preview>
    {methodArchived&&<p role="status">已从方法库移除；内容与关联材料仍保留，可在方法库的“已移除”中恢复。</p>}
    <div className="whitespace-pre-wrap">{model.method?.status === 'ready' ? nativeLibraryMethodText(projectId, item!, model.graph, model.presentations) : '还没有保存方法步骤'}</div>{memberList()}</div>;
  else if (!model.contextReady) body = <div className="w-full p-4 text-sm text-muted-foreground" data-native-library-context-preview>
    已保存内容暂时无法读取，可先加入画布选中的材料后重新核对。</div>;
  else {
    body = <div className="w-full p-3 text-sm leading-6" data-native-library-context-preview>
      {memberList()}</div>;
  }
  return <NativePreview detail={detail} contentVariant="content" bodySlot={<NativeLibraryScopePreviewTarget
    projectId={projectId} target={{ kind: context ? 'context' : 'workflow', id: item!.entityRef.id }} title={item!.title}
    canvasId={canvas.canvasId} api={canvas.rfInstance} ready={!!model && !busy && !methodArchived}
    onRefresh={() => setReadKey(value => value + 1)}>{onBack && <button type="button" data-native-scope-back className="native-scope-back" onClick={onBack} title={parentTitle}>
      <ArrowLeft size={14} /><span>返回 {parentTitle}</span></button>}{body}</NativeLibraryScopePreviewTarget>} metaSlot={<div className="flex flex-col gap-0.5">
    <div className="truncate text-sm font-medium leading-5">{item!.title}</div><div className="text-xs text-muted-foreground">{label(item!.kind as Kind)}</div>
  </div>} actionsSlot={<div className="flex flex-col gap-1.5" data-native-library-entry-actions>
    <button type="button" className={buttonClass} onClick={() => { void useContent(); }} disabled={busy || !model || methodArchived || context && !model.contextReady}>{context ? '用于当前对话' : methodArchived ? '恢复后可使用' : '使用方法'}</button>
    {context && <button type="button" className={buttonClass} onClick={() => { void addSelection(); }} disabled={busy || !model}>加入当前选区</button>}
    {targets.map(target => <button type="button" key={String(target.id)} data-native-scope-member={JSON.stringify(['workspace',String(target.id)])} className={buttonClass} onClick={() => { void enter(target); }} disabled={busy}>
      {targets.length === 1 ? '进入现场' : `进入 ${target.name}`}</button>)}
    {message && <p role={failed ? 'alert' : 'status'} className="text-xs leading-5">{message}</p>}
    {(failed || model?.runs === null && model.presentations.some(view => view.scopeId === item!.entityRef.id && (view.state.memberEntityRefs ?? []).some(ref => String(ref.type) === 'run')) || !model && message) && <button type="button" className={buttonClass} onClick={() => setReadKey(value => value + 1)} disabled={busy}>重新读取</button>}
  </div>} />;
}

/** Canonical Collections are not legacy Scopes. Keep their members and first
 * placement in the same original Zp → TS Popover, never a Collection window. */
function LCOSNativeLibraryCollectionDetail({ detail, NativePreview, onBack, parentTitle, onOpenMember, onReady }: {
  detail: unknown; NativePreview: ComponentType<any>;
  onClose?: () => void; onBack?: () => void; parentTitle?: string;
  onOpenMember?: (member: NativeScopeMember) => Promise<void>; onReady?: () => void;
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
  const [content, setContent] = useState<{ graph: ProjectGraphSnapshot; workspaces: readonly Workspace[]; conversations: readonly ConnectedConversationV1[]; runs: readonly RunCanvasProjection[] | null } | null>(null);
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
    setMembers(null); setProjection(null); setContent(null); setMessage(''); setFailed(false);
    if (projectId && collectionId && workspaceId && canvas.canvasId && canvas.rfInstance && current(version)) {
      void Promise.all([session.collections.members(projectId, collectionId, controller.signal),
        readNativeLibraryCollectionProjection({ projectId, collectionId, workspaceId, canvasId: canvas.canvasId }, controller.signal),
        onOpenMember ? Promise.all([session.projects.getProjectGraph(projectId), session.projects.getWorkspaces(projectId, controller.signal),
          session.conversations.listConnectedConversations(projectId, controller.signal), readNativeLibraryRuns(session, projectId, controller.signal)]) : undefined])
        .then(([value, landing, reads]) => {
          if (!controller.signal.aborted && current(version)) {
            setMembers(value); setProjection(landing);
            if (reads?.[0] && String(reads[0].project.id) === projectId) setContent({ graph: reads[0], workspaces: reads[1], conversations: reads[2], runs: reads[3] });
            if (landing.state === 'partial') setNeedsCheck(true);
          }
        }).catch(() => { if (!controller.signal.aborted && current(version)) { setFailed(true); setMessage('集合暂时打不开，请重新读取。'); } });
    }
    return () => { generation.current += 1; controller.abort(); };
  }, [projectId, collectionId, workspaceId, canvas.canvasId, canvas.rfInstance, readKey, session]);
  useEffect(() => { if (members) onReady?.(); }, [members, onReady]);
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
      if (!('message' in result)) {
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
  const open = async (member: NativeScopeMember) => {
    const version = generation.current;
    if (!onOpenMember || !current(version) || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const [fresh, graph, workspaces, conversations, runs] = await Promise.all([session.collections.members(projectId, collectionId),
        session.projects.getProjectGraph(projectId), session.projects.getWorkspaces(projectId), session.conversations.listConnectedConversations(projectId), readNativeLibraryRuns(session, projectId)]);
      if (!current(version)) return;
      if (!graph || !fresh.members.some(row => JSON.stringify([row.memberRef.type,row.memberRef.id]) === member.key)) throw new UserError('集合成员已变化，请重新读取。');
      const ref = JSON.parse(member.key) as [string,string], exact = nativeLibraryMember(projectId,{type:ref[0],id:ref[1]},graph,workspaces,conversations,runs);
      if (exact.kind === 'unavailable') throw new UserError(exact.reason);
      if (JSON.stringify(exact) !== JSON.stringify(member)) throw new UserError('这项内容已更新，请重新读取后再打开。');
      await onOpenMember(exact);
    } catch(error) { if(current(version)){setFailed(true);setMessage(error instanceof UserError?error.message:'原成员暂时打不开，请重新读取；集合保留。');} }
    finally { if(current(version)){inFlight.current=false;setBusy(false);} }
  };
  const rows = content && members ? members.members.map(row => nativeLibraryMember(projectId,row.memberRef,content.graph,content.workspaces,content.conversations,content.runs)) : null;
  const body = <div className="w-full p-3 text-sm leading-6" data-native-library-collection-preview>
    {onBack && <button type="button" data-native-scope-back className="native-scope-back" onClick={onBack}><ArrowLeft size={14}/><span>返回 {parentTitle}</span></button>}
    {rows ? <div className="native-scope-members"><ul>{rows.map(member=><li key={member.key}>{member.kind==='unavailable'
      ? <div className="native-scope-unavailable"><FileText size={16}/><span>{member.title}<small>{member.reason}</small></span></div>
      : <button type="button" data-native-scope-member={member.key} aria-label={`${['scope','collection','workspace','conversation','run'].includes(member.kind)?'进入':'查看'} ${member.title}`}
        disabled={busy} onClick={()=>{void open(member);}}><FileText size={16}/><span>{member.title}</span><ChevronRight size={14}/></button>}</li>)}</ul>
      {!rows.length&&<p>还没有加入内容</p>}</div>
    : !members ? failed ? '集合暂时打不开' : '正在读取…' : previews.length ? <ul className="space-y-1">
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
      {(failed || content?.runs === null && members?.members.some(row => row.memberRef.type === 'run')) && !needsCheck && <button type="button" className={buttonClass} disabled={busy} onClick={() => setReadKey(value => value + 1)}>重新读取</button>}
    </div>} />;
}
