import { useEffect, useRef } from 'react';
import nativeCanvasStore from './native-canvas-port';
import { bindNativeNodeCarry, type NativeNodeCarryWorld } from './native-node-carry';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { advanceDropAtScreenPoint } from '../../lcos/huabu/apps/web/src/lcos/lcosRecognizers';
import { installReferenceClickSuppressor } from '../../lcos/huabu/apps/web/src/lcos/referenceClickSuppressor';
import { createNativeReferencePickAdapter } from './native-reference-pick';

function readWorld(): NativeNodeCarryWorld | null {
  const canvas = nativeCanvasStore.getState(), shell = useLcosShellStore.getState();
  const host = window.__LCOS_NODE_LAB__, api = canvas.rfInstance;
  const reference = useLcosReferenceStore.getState();
  const hostCanvasId = host?.currentCanvasId ?? host?.canvasId;
  if (canvas.status !== 'ready' || !canvas.canvasId || !shell.projectId || !api
    || host?.api !== api || hostCanvasId !== canvas.canvasId || host.projectId !== shell.projectId
    || !(canvas.canvasWrapper instanceof HTMLDivElement) || !canvas.canvasWrapper.isConnected
    || typeof api.screenToFlowPosition !== 'function') return null;
  const refs = reference.projectId === shell.projectId
    && (reference.bindingCanvasId === null || reference.bindingCanvasId === canvas.canvasId)
    ? reference.nodeEntityRefs : new Map();
  const interaction = (api as typeof api & { getPointerInteraction?(): NativeNodeCarryWorld['interaction'] }).getPointerInteraction?.();
  return { projectId: shell.projectId, canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId,
    api: api as NativeNodeCarryWorld['api'], wrapper: canvas.canvasWrapper,
    nodes: canvas.nodes, selectedNodeIds: canvas.selectedNodeIds, refs, interaction };
}

/** Mount beside the existing Drop overlay, inside the original React root.
 * Notices are supplied by TapNow's original toast; there is no new UI surface. */
export function NativeNodeCarryHost({ onNotice }: { readonly onNotice: (message: string) => void }): null {
  const notice = useRef(onNotice);
  notice.current = onNotice;
  useEffect(() => {
    const releaseClicks = installReferenceClickSuppressor();
    const referencePick = createNativeReferencePickAdapter({ world: readWorld, notice: message => notice.current(message) });
    const carry = bindNativeNodeCarry(window, {
      world: readWorld,
      referenceRecognizer: referencePick.recognizer,
      read: () => useLcosDropStore.getState(),
      begin: (payload, nodeId, nodeIds) => useLcosDropStore.getState().begin(payload, nodeId, nodeIds),
      advance: advanceDropAtScreenPoint,
      commit: () => useLcosDropStore.getState().commitAt(crypto.randomUUID()),
      cancel: () => useLcosDropStore.getState().cancel(),
      reject: message => notice.current(message),
    });
    const invalidate = () => { carry.invalidate(); referencePick.invalidate(); };
    const releaseCanvas = nativeCanvasStore.subscribe(invalidate);
    const releaseShell = useLcosShellStore.subscribe(invalidate);
    const releaseReferences = useLcosReferenceStore.subscribe(referencePick.invalidate);
    return () => { releaseCanvas(); releaseShell(); releaseReferences(); referencePick.dispose(); carry.dispose(); releaseClicks(); };
  }, []);
  return null;
}
