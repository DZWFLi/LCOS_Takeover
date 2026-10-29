import { useEffect } from 'react';
import type { JSX } from 'react';

import { LcosHostOverlay } from '../../lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx';
import useCanvasStore from '../../lcos/huabu/apps/web/src/store/canvasStore.ts';
import { isDropPointExposed } from '../../lcos/huabu/apps/web/src/lcos/drop/dropOcclusion.ts';
import { rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';

import type { DropRect, DropTargetRegistration } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes.ts';

export interface NativeConversationDropReference {
  readonly projectId: string;
  readonly connectedConversationId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
}

export interface NativeConversationDropIdentity {
  readonly projectId: string | null;
  readonly canvasId: string | null;
  readonly workspaceId: string | null;
}

export interface NativeConversationDropTargetInput {
  readonly nodeId: string;
  readonly label: string;
  readonly reference: NativeConversationDropReference;
  readonly current: NativeConversationDropIdentity;
  readonly sessionReady: boolean;
  readonly rect: DropRect;
  readonly readRect: () => DropRect | undefined;
  readonly acceptsPoint: (point: { readonly x: number; readonly y: number }) => boolean;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validRect(rect: DropRect): boolean {
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0;
}

/**
 * Build only the existing ephemeral Semantic Drop receiver descriptor. Core
 * identity comes from the serialized binding; geometry/readRect comes from the
 * live original Canvas node DOM, never from a guessed center or a second store.
 */
export function createNativeConversationDropTarget(
  input: NativeConversationDropTargetInput,
): DropTargetRegistration | undefined {
  const { nodeId, label, reference, current, rect, readRect, acceptsPoint } = input;
  if (!nonEmpty(nodeId) || !nonEmpty(label)
    || !nonEmpty(reference.projectId) || !nonEmpty(reference.connectedConversationId)
    || !nonEmpty(reference.canvasId) || !nonEmpty(reference.workspaceId)
    || !validRect(rect)) return undefined;

  const identityMatches = current.projectId === reference.projectId
    && current.canvasId === reference.canvasId
    && current.workspaceId === reference.workspaceId;
  const enabled = identityMatches && input.sessionReady;
  const ineligibleReason = !identityMatches
    ? '当前 Core 项目、Canvas 或 Workspace 与该会话绑定不一致'
    : !input.sessionReady ? '该会话的 Core 状态尚未就绪，暂不可接收引用' : undefined;

  return {
    targetId: `glyth:${nodeId}`,
    nodeId,
    kind: 'collaboration-reference',
    label: `会话上下文 · ${label}`,
    rect,
    readRect,
    acceptsPoint,
    priority: 20,
    enabled,
    ...(ineligibleReason === undefined ? {} : { ineligibleReason }),
    semantic: { kind: 'collaboration-reference', conversationId: reference.connectedConversationId },
  };
}

interface NativeConversationDropTargetProps {
  readonly elementRef: { readonly current: HTMLElement | null };
  readonly nodeId?: string;
  readonly label: string;
  readonly reference?: NativeConversationDropReference;
  readonly sessionReady: boolean;
}

/** Register the actual native Glyth node as a target in LCOS's single registry. */
export function NativeConversationDropTarget({
  elementRef,
  nodeId,
  label,
  reference,
  sessionReady,
}: NativeConversationDropTargetProps): null {
  const canvasStatus = useCanvasStore((state) => state.status);
  const canvasId = useCanvasStore((state) => state.canvasId);
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const registerTarget = useLcosDropStore((state) => state.registerTarget);

  useEffect(() => {
    const element = elementRef.current;
    if (!nodeId || !reference || !element || !element.isConnected || canvasStatus !== 'ready') return;

    let release: (() => void) | undefined;
    const readRect = (): DropRect | undefined => {
      const live = elementRef.current;
      if (!live?.isConnected) return undefined;
      const currentRect = rectFromDomRect(live.getBoundingClientRect());
      return validRect(currentRect) ? currentRect : undefined;
    };
    const publish = (): void => {
      const liveRect = readRect();
      if (!liveRect) return;
      release?.();
      const target = createNativeConversationDropTarget({
        nodeId,
        label,
        reference,
        current: { projectId: shellProjectId, canvasId, workspaceId: activeWorkspaceId },
        sessionReady,
        rect: liveRect,
        readRect,
        acceptsPoint: (point) => {
          const live = elementRef.current;
          return live !== null && isDropPointExposed(live, point);
        },
      });
      if (target) release = registerTarget(target);
    };

    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(element);
    window.addEventListener('resize', publish);
    window.addEventListener('scroll', publish, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      window.removeEventListener('scroll', publish, true);
      release?.();
    };
  }, [elementRef, nodeId, label, reference?.projectId, reference?.connectedConversationId,
    reference?.canvasId, reference?.workspaceId, sessionReady, canvasStatus, canvasId,
    shellProjectId, activeWorkspaceId, registerTarget]);

  return null;
}

/** The existing unique overlay/commit owner, mounted in the same React root. */
export function NativeConversationDropHost(): JSX.Element {
  return <LcosHostOverlay />;
}
