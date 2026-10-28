import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { nativeLibraryScopePreviewRegistration, nativeLibraryScopePreviewTargetId, type NativeLibraryScopeAddress } from './native-library-scope-preview-drop';

/** The original Library Popover remains the only preview. This wrapper only
 * registers its visible body with the original Drop registry and reloads that
 * same preview after a matching membership receipt. */
export function NativeLibraryScopePreviewTarget({ projectId, target, title, canvasId, api, ready, onRefresh, children }: {
  readonly projectId: string;
  readonly target: NativeLibraryScopeAddress;
  readonly title: string;
  readonly canvasId: string | null;
  readonly api: object | null;
  readonly ready: boolean;
  readonly onRefresh: () => void;
  readonly children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null), refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useLayoutEffect(() => {
    const host = element.current;
    if (!host) return;
    const current = () => {
      const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
      return ready && !!api && !!canvasId && host.isConnected && canvas.status === 'ready'
        && canvas.canvasId === canvasId && canvas.rfInstance === api && shell.projectId === projectId;
    };
    return useLcosDropStore.getState().registerTarget(nativeLibraryScopePreviewRegistration(host, projectId, target, title, current));
  }, [projectId, target.kind, target.id, title, canvasId, api, ready]);
  useEffect(() => {
    const targetId = nativeLibraryScopePreviewTargetId(projectId, target);
    let previous = useLcosDropStore.getState().feedback?.receipt;
    // Observe the existing settled receipt, including read-only recovery. Do
    // not reload/disable this receiver while its Router is still committing.
    return useLcosDropStore.subscribe(state => {
      const receipt = state.feedback?.receipt;
      if (receipt === previous) return;
      previous = receipt;
      if (!receipt || state.state.status === 'committing' || receipt.projectId !== projectId
        || receipt.targetId !== targetId || state.feedback?.originalIntent.intent.targetId !== targetId) return;
      const canvas = useCanvasStore.getState();
      if (useLcosShellStore.getState().projectId === projectId && canvas.canvasId === canvasId && canvas.rfInstance === api)
        refresh.current();
    });
  }, [projectId, target.kind, target.id, canvasId, api]);
  return <div ref={element} className="w-full" data-native-library-scope-drop-target={target.id}
    data-native-library-scope-drop-kind={target.kind}>{children}</div>;
}
