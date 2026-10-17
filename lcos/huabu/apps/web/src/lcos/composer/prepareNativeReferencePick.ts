import useCanvasStore from '@/store/canvasStore';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { registerNativeMaterialSources } from '../drop/registerNativeMaterialSources';
import { resolveNativeMaterialSources } from '../drop/resolveNativeMaterialSources';
import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { claimProjectText } from '../nodes/creation/projectTextCreation';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { NativeMaterialSourcePorts } from '../drop/resolveNativeMaterialSources';
import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { DropPayload } from '@local-creative-os/web-gen2';

type DropObject = Extract<DropPayload, { kind: 'objects' }>['objects'][number];
export interface NativeReferencePickRequest {
  readonly projectId: string;
  readonly canvasId: string;
  readonly source: DropObject;
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
}
export type NativeReferencePickPreparation = (input: NativeReferencePickRequest) => Promise<LcosNodeEntityRef>;

/** Reference pick uses the same original-carrier producer as Drop. It never
 * creates a replacement node or inserts a draft before a confirmed receipt. */
export async function prepareNativeReferencePick(input: NativeReferencePickRequest,
  ports?: NativeMaterialSourcePorts): Promise<LcosNodeEntityRef> {
  const host = ports ? null : useLcosHostStore.getState().host;
  if (!ports && (!host || host.projectId !== input.projectId)) throw new Error('材料来源现场尚未就绪，原内容与输入保留。');
  const sourcePorts: NativeMaterialSourcePorts = ports ?? (() => {
    if (!host) throw new Error('材料来源现场尚未就绪，原内容与输入保留。');
    const session = createLcosCoreSession();
    return {
      readCurrent: () => ({ projectId: useLcosShellStore.getState().projectId, canvasId: useCanvasStore.getState().canvasId,
        nodes: useCanvasStore.getState().nodes, refs: useLcosReferenceStore.getState().nodeEntityRefs }),
      readBindings: () => host.bindings.list(),
      readProjectGraph: id => session.projects.getProjectGraph(id),
      claimText: sent => claimProjectText(sent, { signal: input.signal, isCurrent: input.isCurrent }),
      importImage: (id, sent, signal) => session.artifacts.importCopiedFile(id, sent, signal),
    };
  })();
  let result: Awaited<ReturnType<typeof resolveNativeMaterialSources>>;
  try {
    result = await resolveNativeMaterialSources({ projectId: input.projectId, canvasId: input.canvasId,
      objects: [input.source] }, sourcePorts, input.signal, input.isCurrent);
  } finally {
    // A write can finish before an input is closed or a reply is lost. Refresh
    // the original owner even on failure; this is invalidation, not success UI.
    host?.notifyMutationSuccess();
    useLcosReferenceStore.getState().requestNodeBindingRefresh();
  }
  if (input.signal.aborted || !input.isCurrent()) throw new Error('输入或现场已改变，本次点取已取消；已保存材料保留。');
  registerNativeMaterialSources(input.projectId, input.canvasId, result);
  const reference = result.byNodeId.get(input.source.entityId)?.reference;
  if (!reference || reference.entityType !== 'artifact' || !reference.artifactViewId || !reference.revisionId)
    throw new Error('原材料引用尚未确认，未改动当前输入。');
  return reference;
}