export { LCOSNativeLibraryPreviewRetain } from './native-library-preview-retain';
export { LCOSNativeSearchDocuments, LCOSNativeSearchFilter, LCOSNativeSearchFilters, LCOSNativeSearchSummary } from './native-canvas-search';
export { LCOSNativeSearchLocateVisible } from './native-canvas-search-locate';
export { LCOSUseNativeWorkflowTemplates, LCOSUseNativeWorkflowGallery, LCOSNativeWorkflowPreview, LCOSUseNativeWorkflowRailSide, LCOSUseNativeWorkflowRailOwner, LCOSUseNativeWorkflowGalleryOwner, LCOSNativeWorkflowRetainsPopover } from './native-workflow-templates';
export { LCOSUseNativeWorkflowEditForm, LCOSNativeWorkflowEditFields } from './native-workflow-method-editor';
export { NativeGalleryMemberCarry } from './native-gallery-member-carry';
export { NativePileDropTarget } from './native-pile-drop-target';
export { LCOSUseNativeNavigationNode, LCOSUseNativeNavigationVisibility } from './native-navigation-state';
export { LCOSUseNativeNodeComposer } from './native-node-composer';
export { LCOSNativeNavigationDirectoryEntry } from './native-navigation-directory';
export { setNavigationDirectoryOpen as LCOSOpenNativeNavigationDirectory } from './native-navigation-directory-state';
import { NativeNavigationHost } from './native-navigation-ui';
import { NativeGlythThoughtMaterial } from './native-glyth-thought-material';
import { NativeGlythThoughtDetail } from './native-glyth-thought-detail';
import { resolveNativeGlythActions, resolveNativeGlythThoughtTarget, type NativeGlythAction } from './native-glyth-actions';
import { requestNativeConversationView } from './native-task-route';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { useEffect, useRef } from 'react';
import type { ComponentType, DragEvent, JSX } from 'react';
import type { GlythThought } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythThought';

import './native-glyth-node-layout.css';
import { NativeGlythCreationHost } from './native-glyth-creation-ui';
export { LCOSNativeGlythCreationSlot } from './native-glyth-creation-ui';
import { readGlythAppearance } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/glythAppearance';
import './native-lcos-token-adapter.css';

export { LCOSNativeTextBodySlot, LCOSRequestNativeTextEdit } from './native-text-ui.tsx';
export * from './native-file-upload';
export { LCOSUseNativeMaterialExcerptDrop } from './native-material-excerpt-drop';
export { restoreNativeMaterialExcerptReceiptLocator } from './native-material-excerpt-receipt';
export { LCOSNativeAssemblyOpen, LCOSNativeAssemblyTools } from './native-assembly-ui.tsx';
export { LCOSNativeDefaultTextPlacement } from './native-default-text-placement';
export { LCOSNativeLibraryDragStart, LCOSNativeLibraryDropFallback } from './native-library-drop-ui';
export { NativeTiptapAutosaveStatus } from './native-tiptap-autosave-status';
export { LCOSUseNativeImageTitle } from './native-material-metadata.tsx';
export { LCOSExecutionNode, LCOSResultMaterialNode } from './native-execution-ui.tsx';
export { LCOSCollectionNode } from './native-collection-ui.tsx';
export { inspectNativeCollectionLanding } from './native-collection-placement.ts';
export { LCOSNativeLibraryContexts, LCOSNativeLibraryContextDetail, LCOSNativeLibraryNavigationOwner } from './native-library-contexts';
export { LCOSUseNativeLibraryNavigationBack } from './native-library-contexts';
export { LCOSUseNativeLibraryRowOwner, LCOSUseNativeLibraryPreviewLayout } from './native-library-contexts';
export { LCOSUseNativeHistoryActions, LCOSOpenNativeHistoryVersion } from './native-history-actions';
export { NativeColorPinProvider as LCOSNativeColorPinProvider, LCOSUseNativeColorPinNode, LCOSUseNativeColorPinEnabled,
  LCOSUseNativeColorPinChoices, LCOSUseNativeColorPinCommands, LCOSUseNativeColorPinGroups,
  LCOSNativeColorPinChoice, NativeColorPinNodeStatus } from './native-colorpin-port';
export { useNativeColorPinBar as LCOSUseNativeColorPinBar, useNativeColorPinNames as LCOSUseNativeColorPinNames,
  useNativeColorPinMenuActions as LCOSUseNativeColorPinMenuActions, useNativeColorPinLocate as LCOSUseNativeColorPinLocate,
  NativeColorPinMenuStatus as LCOSColorPinMenuStatus, nativeColorPinClearDescription as LCOSColorPinClearDescription,
  useNativeColorPinDownloads as LCOSUseNativeColorPinDownloads } from './native-colorpin-menu';
export { readCollapsedFrames, writeCollapsedFrames } from '../../lcos/huabu/apps/web/src/store/canvasCollapsedFrames.ts';

import type { ConnectedConversationV1 } from '../../lcos/packages/contracts/src/receiver.ts';
import type { RuntimeProviderStatus } from '../../lcos/packages/contracts/src/index.ts';
import { LcosButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx';
import { GlythBodyView } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/GlythBodyView.tsx';
import { useCollaborationSession } from '../../lcos/huabu/apps/web/src/lcos/collaboration/useCollaborationSession.ts';
import { resolveGlythThought } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythThought.ts';
import { glythSessionLabel } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythInteraction.ts';
import useCanvasStore from '../../lcos/huabu/apps/web/src/store/canvasStore.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { NativeConversationDropHost, NativeConversationDropTarget } from './native-conversation-drop.tsx';
import { NativeNodeCarryHost } from './native-node-carry-host';
import { NativeSurfaceDockDropTargets } from './native-surface-dock-drop';
import { LCOSProfessionalHost as OriginalLCOSProfessionalHost } from './native-professional-host.tsx';
import { NativeMaterialNavigationNotice } from './native-material-rail-ui';
import { useNativeConversationSelection } from './native-chat-ui';
import { NativeComposerProvider, type NativeComposerParts } from './native-composer-view';
import { NativeMaterialViewerHost } from './native-material-viewer';
import { NativeReaderRecoveryProvider } from './native-reader-recovery';
import type { NativeMaterialViewerParts, NativeMaterialViewerRuntime } from './native-material-viewer-types';
import { NativeDropNoticeProvider, type NativeDropNotice } from './native-library-drop-feedback';

export function LCOSProfessionalHost({ NativeComposerParts, NativeViewerRuntime, NativeViewerParts, NativeDropNotice }: {
  NativeComposerParts?: NativeComposerParts; NativeViewerRuntime?: NativeMaterialViewerRuntime; NativeViewerParts?: NativeMaterialViewerParts; NativeDropNotice?: NativeDropNotice;
}): JSX.Element | null {
  const host = <OriginalLCOSProfessionalHost>
    <NativeGlythCreationHost />
    <NativeConversationDropHost />
    <NativeSurfaceDockDropTargets />
    <NativeNodeCarryHost onNotice={message => NativeDropNotice?.({ title: message })} />
    {NativeViewerParts && <NativeNavigationHost parts={NativeViewerParts} />}
    {NativeViewerRuntime && NativeViewerParts && <NativeMaterialViewerHost runtime={NativeViewerRuntime} parts={NativeViewerParts} />}
    {(import.meta.env as Record<string, unknown>).LCOS_NATIVE_RAIL_PILOT === true && <NativeMaterialNavigationNotice />}
  </OriginalLCOSProfessionalHost>;
  const withReaderRecovery = NativeViewerRuntime ? <NativeReaderRecoveryProvider runtime={NativeViewerRuntime}>{host}</NativeReaderRecoveryProvider> : host;
  const withComposer = NativeComposerParts ? <NativeComposerProvider parts={NativeComposerParts}>{withReaderRecovery}</NativeComposerProvider> : withReaderRecovery;
  return <NativeDropNoticeProvider notice={NativeDropNotice}>{withComposer}</NativeDropNoticeProvider>;
}

export interface LcosConversationReference {
  readonly projectId: string;
  readonly connectedConversationId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
}

export interface LcosConversationContextDrop {
  readonly reference: LcosConversationReference;
  readonly dataTransfer: DataTransfer;
}

export interface LCOSConnectedConversationPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export interface LCOSConversationNodeProps {
  readonly id?: string;
  readonly selected?: boolean;
  readonly dragging?: boolean;
  readonly NativePopover?: ComponentType<any>;
  readonly NativeButton?: ComponentType<any>;
  readonly data?: Record<string, unknown> & {
    readonly lcos_conversation_ref?: unknown;
    readonly label?: string;
    readonly title?: string;
    readonly onContextDrop?: (input: LcosConversationContextDrop) => void;
  };
  readonly onContextDrop?: (input: LcosConversationContextDrop) => void;
}

export type ConnectedPanelState =
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable'; readonly message: string; readonly projectId?: string; readonly providers?: readonly RuntimeProviderStatus[] }
  | {
    readonly status: 'ready' | 'partial';
    readonly projectId: string;
    readonly conversations: readonly ConnectedConversationV1[];
    readonly providers?: readonly RuntimeProviderStatus[];
    readonly warnings: readonly string[];
    readonly hiddenPending: number;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readReference(value: unknown): LcosConversationReference | undefined {
  if (!isRecord(value)
    || !nonEmptyString(value.projectId)
    || !nonEmptyString(value.connectedConversationId)
    || !nonEmptyString(value.canvasId)
    || !nonEmptyString(value.workspaceId)) return undefined;
  return {
    projectId: value.projectId,
    connectedConversationId: value.connectedConversationId,
    canvasId: value.canvasId,
    workspaceId: value.workspaceId,
  };
}

function coreErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const error = payload.error;
    if (isRecord(error) && nonEmptyString(error.message)) return error.message;
    if (nonEmptyString(payload.message)) return payload.message;
  }
  if (status === 404) return 'Core 中没有找到这个已连接会话。';
  if (status === 503) return 'Core 协作读取服务当前不可用或未配置。';
  return `Core 读取失败（HTTP ${status}）。`;
}

async function readCoreValue<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/lcos/core${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Core 返回了无法读取的响应（HTTP ${response.status}）。`);
  }
  if (!response.ok || !isRecord(payload) || payload.ok !== true || !('value' in payload)) {
    throw new Error(coreErrorMessage(payload, response.status));
  }
  return payload.value as T;
}

function currentNodeLab(): { readonly canvasId?: unknown; readonly currentCanvasId?: unknown; readonly projectId?: unknown } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { __LCOS_NODE_LAB__?: {
    readonly canvasId?: unknown;
    readonly currentCanvasId?: unknown;
    readonly projectId?: unknown;
  } }).__LCOS_NODE_LAB__;
}

function currentCanvasId(): string | undefined {
  const host = currentNodeLab();
  const value = nonEmptyString(host?.currentCanvasId) ? host.currentCanvasId : host?.canvasId;
  return nonEmptyString(value) ? value : undefined;
}

function errorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    if (isRecord(payload.error) && nonEmptyString(payload.error.message)) return payload.error.message;
    if (nonEmptyString(payload.message)) return payload.message;
    if (nonEmptyString(payload.msg)) return payload.msg;
  }
  return `读取失败（HTTP ${status}）。`;
}

async function readJsonResponse(path: string, signal: AbortSignal, init?: RequestInit): Promise<{ readonly response: Response; readonly payload: unknown }> {
  const response = await fetch(path, { ...init, signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`本地服务返回了无法读取的响应（HTTP ${response.status}）。`);
  }
  return { response, payload };
}

async function readTapNowData(path: string, signal: AbortSignal): Promise<unknown> {
  const { response, payload } = await readJsonResponse(path, signal);
  if (!response.ok || !isRecord(payload) || payload.code !== 0 || !('data' in payload)) {
    throw new Error(errorMessage(payload, response.status));
  }
  return payload.data;
}

async function readRuntimeProviders(signal: AbortSignal): Promise<readonly RuntimeProviderStatus[]> {
  const value = await readCoreValue<unknown>('/runtime/providers', signal);
  const statuses = ['ready', 'busy', 'offline', 'manual'];
  if (!Array.isArray(value) || value.some((provider) => !isRecord(provider)
    || !['codex', 'workbuddy', 'auto'].includes(String(provider.provider))
    || !statuses.includes(String(provider.availability)))) {
    throw new Error('Core Provider 状态结构不完整。');
  }
  return value as readonly RuntimeProviderStatus[];
}

async function resolveProjectId(signal: AbortSignal): Promise<string> {
  const nodeLabProjectId = currentNodeLab()?.projectId;
  if (nonEmptyString(nodeLabProjectId)) return nodeLabProjectId;
  const status = await readTapNowData('/api/surface-core/status', signal);
  if (!isRecord(status) || !nonEmptyString(status.projectId)) {
    throw new Error('本地 Core 状态没有提供当前项目身份。');
  }
  return status.projectId;
}

function isConnectedConversation(value: unknown, projectId: string): value is ConnectedConversationV1 {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.projectId === projectId
    && nonEmptyString(value.id)
    && (value.provider === 'codex' || value.provider === 'workbuddy')
    // Core-created continuation sessions have no Run executor; the original contract permits an empty string.
    && typeof value.executorId === 'string'
    && nonEmptyString(value.conversationRef)
    && nonEmptyString(value.label)
    && typeof value.isRunning === 'boolean'
    && (value.waitingReason === null || typeof value.waitingReason === 'string')
    && nonEmptyString(value.lastActiveAt)
    && (value.workspaceRef === null || typeof value.workspaceRef === 'string')
    && (value.branchRef === null || typeof value.branchRef === 'string')
    && nonEmptyString(value.createdAt)
    && nonEmptyString(value.updatedAt);
}

async function readConnectedConversations(projectId: string, signal: AbortSignal): Promise<{
  readonly conversations: readonly ConnectedConversationV1[];
  readonly hiddenPending: number;
}> {
  const value = await readCoreValue<unknown>(
    `/projects/${encodeURIComponent(projectId)}/connected-conversations`, signal,
  );
  if (!Array.isArray(value) || value.some((conversation) => !isConnectedConversation(conversation, projectId))) {
    throw new Error('Core ConnectedConversation 列表结构不完整或项目身份不匹配。');
  }
  const conversations: ConnectedConversationV1[] = [];
  let hiddenPending = 0;
  for (const conversation of value as readonly ConnectedConversationV1[]) {
    if (conversation.conversationRef.startsWith('pending-')) {
      hiddenPending += 1;
      continue;
    }
    conversations.push(conversation);
  }
  return { conversations, hiddenPending };
}

function reasonOf(result: PromiseSettledResult<unknown>, label: string): string | undefined {
  if (result.status === 'fulfilled') return undefined;
  return `${label}：${result.reason instanceof Error ? result.reason.message : '暂时不可用'}`;
}

export async function loadConnectedPanel(signal: AbortSignal): Promise<ConnectedPanelState> {
  const [projectResult, providerResult] = await Promise.allSettled([
    resolveProjectId(signal),
    readRuntimeProviders(signal),
  ] as const);
  if (signal.aborted) return { status: 'pending' };
  const providers = providerResult.status === 'fulfilled' ? providerResult.value : undefined;
  const providerWarning = reasonOf(providerResult, 'Provider 状态');
  if (projectResult.status === 'rejected') {
    return {
      status: 'unavailable',
      message: projectResult.reason instanceof Error ? projectResult.reason.message : '无法确认当前 Core 项目。',
      ...(providers === undefined ? {} : { providers }),
    };
  }

  const projectId = projectResult.value;
  const conversationsResult = await Promise.allSettled([
    readConnectedConversations(projectId, signal),
  ] as const).then(([result]) => result);
  if (signal.aborted) return { status: 'pending' };
  if (conversationsResult.status === 'rejected') {
    return {
      status: 'unavailable',
      message: conversationsResult.reason instanceof Error ? conversationsResult.reason.message : '无法读取已登记会话。',
      projectId,
      ...(providers === undefined ? {} : { providers }),
    };
  }

  const warnings = providerWarning === undefined ? [] : [providerWarning];
  return {
    status: warnings.length === 0 ? 'ready' : 'partial',
    projectId,
    conversations: conversationsResult.value.conversations,
    hiddenPending: conversationsResult.value.hiddenPending,
    ...(providers === undefined ? {} : { providers }),
    warnings,
  };
}

function providerLabel(provider: RuntimeProviderStatus['provider']): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'workbuddy') return 'WorkBuddy';
  return '自动选择';
}

function availabilityLabel(availability: RuntimeProviderStatus['availability']): string {
  if (availability === 'ready') return '可用';
  if (availability === 'busy') return '忙碌';
  if (availability === 'offline') return '离线';
  return '需手动确认';
}

function conversationStatus(conversation: ConnectedConversationV1): string {
  if (conversation.waitingReason !== null) return `Core记录：等待输入 · ${conversation.waitingReason}`;
  if (conversation.isRunning) return 'Core记录：进行中';
  return 'Core记录：已登记';
}

function providerForConversation(
  providers: readonly RuntimeProviderStatus[] | undefined,
  provider: ConnectedConversationV1['provider'],
): RuntimeProviderStatus | undefined {
  return providers?.find((status) => status.provider === provider);
}

interface PlacementNotice {
  readonly connectedConversationId: string;
  readonly status: 'pending' | 'error' | 'confirmed';
  readonly message?: string;
}

export async function placeConnectedConversation(
  projectId: string,
  canvasId: string,
  conversation: ConnectedConversationV1,
): Promise<void> {
  const { response, payload } = await readJsonResponse(
    `/api/lcos/canvases/${encodeURIComponent(canvasId)}/conversations:reconcile`,
    new AbortController().signal,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ connectedConversationId: conversation.id }),
    },
  );
  if (!response.ok || !isRecord(payload) || payload.code !== 0 || !isRecord(payload.data)) {
    throw new Error(errorMessage(payload, response.status));
  }
  const data = payload.data;
  if (data.canvas_id !== canvasId || data.provider_execution_started !== false || !Array.isArray(data.bindings)) {
    throw new Error('Huabu 返回值没有确认当前画布投影，或未确认零 Provider 执行。');
  }
  const bindingConfirmed = data.bindings.some((binding) => isRecord(binding)
    && binding.projectId === projectId
    && binding.canvasId === canvasId
    && binding.spatialKind === 'node'
    && binding.entityType === 'conversation'
    && binding.entityId === conversation.id
    && nonEmptyString(binding.spatialId));
  if (!bindingConfirmed) throw new Error('Huabu 回执未确认该会话节点的真实 binding。');
}

function ConversationNodeInstance({
  id,
  selected = false,
  dragging = false,
  data = {},
  reference,
  dropCallback,
  NativePopover,
  NativeButton,
}: LCOSConversationNodeProps & {
  readonly reference: LcosConversationReference | undefined;
  readonly dropCallback: ((input: LcosConversationContextDrop) => void) | undefined;
}): JSX.Element {
  const rawTitle = data.title ?? data.label;
  const title = typeof rawTitle === 'string' && rawTitle.trim()
    ? rawTitle.trim()
    : reference ? '协作者' : '会话暂不可用';
  const entry = useCollaborationSession(reference?.projectId, reference?.connectedConversationId);
  const projection = entry?.status === 'ready' ? entry.projection : undefined;
  const thought = resolveGlythThought(projection, entry?.timeline, entry?.timelineStatus);
  const nearfield=reference?resolveNativeGlythActions({projectId:reference.projectId,conversationId:reference.connectedConversationId,entry}):undefined;
  const userState = projection?.userState;
  const pose = userState === 'thinking' ? 'listening'
    : userState === 'working' ? 'working'
      : userState === 'needs_user' ? 'curious' : 'idle';
  const canvas = useCanvasStore((state) => state);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const currentNode = canvas.nodes.find(node => node.id === id);
  const thoughtDetailSuppressed = !reference || !currentNode || currentNode.hidden === true || dragging
    || shellProjectId !== reference.projectId || canvas.status !== 'ready' || canvas.canvasId !== reference.canvasId
    || !canvas.rfInstance || typeof window === 'undefined' || window.__LCOS_NODE_LAB__?.api !== canvas.rfInstance
    || JSON.stringify(currentNode.data?.lcos_conversation_ref) !== JSON.stringify(data.lcos_conversation_ref);
  const nativeSelection = useNativeConversationSelection();
  const dropTargetRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number }>();
  const appearance = readGlythAppearance(data.lcosGlythAppearance);
  const isOpen = !!reference && nativeSelection?.projectId === reference.projectId
    && nativeSelection.connectedConversationId === reference.connectedConversationId;

  useEffect(() => {
    if (id === undefined || reference === undefined
      || referenceProjectId !== reference.projectId
      || canvas.status !== 'ready' || canvas.canvasId !== reference.canvasId) return;
    // The serialized Core/Huabu node DTO carries the binding resolved from the
    // existing ProjectionBinding. Cache only that real identity for existing
    // readers; selection is intentionally never promoted into draft references.
    useLcosReferenceStore.getState().registerNodeEntity(id, {
      entityType: 'conversation',
      entityId: reference.connectedConversationId,
    });
  }, [id, reference?.projectId, reference?.connectedConversationId, reference?.canvasId,
    referenceProjectId, canvas.status, canvas.canvasId]);

  const openWorkView = (): void => {
    const shell = useLcosShellStore.getState();
    const live=useCanvasStore.getState();
    if(!reference||live.status!=='ready'||live.canvasId!==reference.canvasId||!live.nodes.some(node=>node.id===id
      &&JSON.stringify(node.data?.lcos_conversation_ref)===JSON.stringify(data.lcos_conversation_ref)))return;
    if (reference && shell.projectId === reference.projectId
      && shell.activeWorkspaceId !== reference.workspaceId) {
      shell.setActiveWorkspaceId(reference.workspaceId);
    }
    if (reference && shell.projectId === reference.projectId) requestNativeConversationView({projectId:reference.projectId,conversationId:reference.connectedConversationId});
  };
  const openStateAction=(action:NativeGlythAction):void=>{
    if(!reference||useLcosShellStore.getState().projectId!==reference.projectId)return;
    const live=useCanvasStore.getState(),actual=live.nodes.find(node=>node.id===id);
    if(live.status!=='ready'||live.canvasId!==reference.canvasId||!actual
      ||JSON.stringify(actual.data?.lcos_conversation_ref)!==JSON.stringify(data.lcos_conversation_ref))return;
    const fresh=useCollaborationSessionStore.getState().entries.get(reference.projectId+':'+reference.connectedConversationId);
    const actions=resolveNativeGlythActions({projectId:reference.projectId,conversationId:reference.connectedConversationId,entry:fresh});
    const available=actions&&[actions.primary,...actions.more].find(row=>row.id===action.id);
    if(available)requestNativeConversationView(available.target);
  };
  const openThoughtProcess = (displayed?: GlythThought): void => {
    if (!reference || useLcosShellStore.getState().projectId !== reference.projectId) return;
    const live = useCanvasStore.getState(), actual = live.nodes.find(node => node.id === id);
    if (live.status !== 'ready' || live.canvasId !== reference.canvasId || live.rfInstance !== canvas.rfInstance
      || !actual || actual.hidden === true
      || JSON.stringify(actual.data?.lcos_conversation_ref) !== JSON.stringify(data.lcos_conversation_ref)) return;
    const target = displayed ? resolveNativeGlythThoughtTarget({ projectId: reference.projectId,
      conversationId: reference.connectedConversationId }, displayed)
      : { projectId: reference.projectId, conversationId: reference.connectedConversationId };
    if (target) requestNativeConversationView(target);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!reference || !dropCallback) return;
    event.preventDefault();
    event.stopPropagation();
    dropCallback({ reference, dataTransfer: event.dataTransfer });
  };

  const stateLabel = reference === undefined
    ? '会话暂不可用'
    : entry?.status === 'error' ? '状态读取失败'
      : entry?.status === 'ready' ? glythSessionLabel(projection, entry.status) : '正在连接…';

  return (
    <div
      ref={dropTargetRef}
      className="lcos-conversation-node-shell"
      data-lcos-node-kind="conversation"
      data-native-glyth-appearance={appearance ? `${appearance.shape}/${appearance.color}/${appearance.motion}` : undefined}
      data-lcos-node-id={id}
      data-lcos-native-conversation-drop-target={id}
      data-lcos-node-selected={selected || undefined}
      data-lcos-conversation-reference-status={reference ? entry?.status ?? 'loading' : 'unbound'}
      aria-busy={entry?.status === 'loading' || undefined}
      onDragOver={(event) => { if (dropCallback && reference) event.preventDefault(); }}
      onDrop={handleDrop}
      onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
      onClick={event => { const start = pointerStart.current; pointerStart.current = undefined;
        if (event.target instanceof Element && event.target.closest('button')) return;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) openWorkView(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 230 }}
    >
      <NativeGlythThoughtMaterial thought={thought} selected={selected} layout={appearance?'object':'row'}
        suppressed={!reference||shellProjectId!==reference.projectId||canvas.status!=='ready'||canvas.canvasId!==reference.canvasId
          ||entry?.status!=='ready'||canvas.nodes.find(node=>node.id===id)?.hidden===true}/>
      <NativeConversationDropTarget
        elementRef={dropTargetRef}
        nodeId={id}
        label={title}
        reference={reference}
        sessionReady={entry?.status === 'ready'}
      />
      <GlythBodyView
        appearance={appearance}
        pose={pose}
        {...(userState === undefined ? {} : { userState })}
        selected={selected}
        size={appearance ? 72 : 44}
        left={0}
        top={0}
      />
      <div style={{ minWidth: 0 }}>
        <LcosButton
          appearance="custom"
          variant="secondary"
          size="sm"
          className="nodrag"
          data-native-glyth-open={id}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={(event) => { event.stopPropagation(); openWorkView(); }}
          style={{ maxWidth: 270, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {title}
        </LcosButton>
        <div className="native-glyth-status" aria-live="polite" style={{ marginTop: 4, fontSize: 12, opacity: 0.78 }}>
          {nearfield&&nearfield.primary.id!=='open'?<LcosButton appearance="custom" variant="secondary" size="sm"
            className="native-glyth-state-action nodrag" data-native-glyth-primary={nearfield.primary.id}
            aria-label={`${nearfield.primary.label} · ${title}`} title={`${nearfield.primary.label}${thought?.text?`：${thought.text}`:''}`}
            onClick={event=>{event.stopPropagation();openStateAction(nearfield.primary);}}>
            <span>{thought?.text??nearfield.primary.label}</span><span aria-hidden="true">↗</span>
          </LcosButton>:<span className="native-glyth-summary">{thought?.text??stateLabel}</span>}
          {id && reference && NativePopover && NativeButton && <NativeGlythThoughtDetail thought={thought}
            identity={{ projectId: reference.projectId, conversationId: reference.connectedConversationId,
              canvasId: reference.canvasId, nodeId: id }}
            NativePopover={NativePopover} NativeButton={NativeButton} onOpenProcess={openThoughtProcess}
            suppressed={thoughtDetailSuppressed} />}
          {shellProjectId && reference && shellProjectId !== reference.projectId ? ' · 项目身份不匹配' : ''}
        </div>
      </div>
    </div>
  );
}

export function LCOSConversationNode(props: LCOSConversationNodeProps): JSX.Element {
  const reference = readReference(props.data?.lcos_conversation_ref);
  const dropCallback = props.onContextDrop ?? props.data?.onContextDrop;
  const key = reference
    ? [reference.projectId, reference.connectedConversationId, reference.canvasId, reference.workspaceId].join('|')
    : 'unlinked';
  return <ConversationNodeInstance key={key} {...props} reference={reference} dropCallback={dropCallback} />;
}

export { NativeCoreChatPanel as LCOSConnectedConversationPanel } from './native-chat-ui';
// The separate native text entry must use this mounted Viewer owner instead
// of bundling a second material-viewer-port singleton.
export { requestNativeMaterialView, nativeMaterialViewerAvailable } from './native-material-viewer-port';
export { hasNativeMindMapDraft } from './native-mindmap-editing';
export { LCOSNativeMemberBody } from './native-member-ui';
export { LCOSUseNativeFrameTitleEditor } from './native-frame-title';
