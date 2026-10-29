import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { resolveNativeMaterialSources } from './resolveNativeMaterialSources';

/** Consume only confirmed original-image receipts into the existing reference
 * owner. The native nodes, pixels, geometry, selection and history stay native. */
export function registerNativeMaterialSources(projectId:string,canvasId:string,
  resolved:Awaited<ReturnType<typeof resolveNativeMaterialSources>>):void {
  const current=()=>useLcosShellStore.getState().projectId===projectId && useLcosReferenceStore.getState().projectId===projectId
    && useCanvasStore.getState().canvasId===canvasId;
  const images=[...resolved.byNodeId].filter(([,entry])=>entry.sourceRegistration==='original-image-carrier');
  for(const [nodeId,entry] of images){
    const node=useCanvasStore.getState().nodes.find(item=>item.id===nodeId),existing=useLcosReferenceStore.getState().nodeEntityRefs.get(nodeId);
    if(!current() || node?.type!=='image' || !entry.descriptor || !entry.descriptor.artifactViewId
      || existing && (existing.entityType!=='artifact' || existing.entityId!==entry.reference.entityId
        || existing.descriptor?.artifactViewId && existing.descriptor.artifactViewId!==entry.descriptor.artifactViewId
        || existing.descriptor?.presentedRevisionId && existing.descriptor.presentedRevisionId!==entry.descriptor.presentedRevisionId))
      throw new Error('图片已保存，但原节点或现场已变化，未覆盖现有材料身份。');
  }
  for(const [nodeId,entry] of images){
    if(!current())throw new Error('图片原现场已切换，未把身份登记到新现场。');
    useLcosReferenceStore.getState().registerNodeEntity(nodeId,{entityType:'artifact',entityId:entry.reference.entityId,descriptor:entry.descriptor});
  }
}
