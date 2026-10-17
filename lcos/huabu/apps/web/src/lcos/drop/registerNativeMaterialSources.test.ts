import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { afterEach, expect, it } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { snapshotCanvasDropNodes } from './nativeCanvasDropGeometry';
import { registerNativeMaterialSources } from './registerNativeMaterialSources';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { resolveNativeMaterialSources } from './resolveNativeMaterialSources';

function fixture(){
  const node={id:'original-image',type:'image',selected:true,position:{x:240,y:320},style:{width:300,height:200},data:{src:'original-pixels.png'}};
  useLcosShellStore.getState().clear();useLcosShellStore.getState().setProject('project');
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('project');
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'original-canvas',nodes:[node],edges:[]});
  const reference={entityType:'artifact',entityId:'image-artifact',artifactViewId:'exact-view',revisionId:'exact-revision',mimeType:'image/png'};
  const resolved:Awaited<ReturnType<typeof resolveNativeMaterialSources>>={objects:[reference],claims:[],byNodeId:new Map([[node.id,{
    reference,sourceRef:{kind:'artifactView',id:'exact-view'},sourceRegistration:'original-image-carrier',
    descriptor:describeProjectedEntity({entityType:'artifact',entityId:'image-artifact',artifactKind:'image',title:'原图片',
      artifactViewId:'exact-view',artifactViewReferenceKind:'explicit_additional',presentedRevisionId:'exact-revision',fileRecordId:'original-file',mimeType:'image/png'})
  }]])};
  return {node,resolved};
}
afterEach(()=>{useLcosReferenceStore.getState().reset();useLcosShellStore.getState().clear();});

it('the production confirmation seam gives the original image its exact reference; the next gesture captures that identity without cloning or moving it',()=>{
  const f=fixture(),before=structuredClone(useCanvasStore.getState().nodes);
  registerNativeMaterialSources('project','original-canvas',f.resolved);
  const source=snapshotCanvasDropNodes([f.node.id],useCanvasStore.getState().nodes,useLcosReferenceStore.getState().nodeEntityRefs,'original-canvas');
  expect(source[0]?.reference).toMatchObject({entityType:'artifact',entityId:'image-artifact',artifactViewId:'exact-view',revisionId:'exact-revision'});
  expect(source[0]?.reference?.entityType).not.toBe('native-image');
  expect(useCanvasStore.getState().nodes).toEqual(before);
  expect(useCanvasStore.getState().nodes.filter(node=>node.selected).map(node=>node.id)).toEqual([f.node.id]);
});

it('does not overwrite another canonical identity or register a receipt into a changed project',()=>{
  const f=fixture();useLcosReferenceStore.getState().registerNodeEntity(f.node.id,{entityType:'artifact',entityId:'keep-existing'});
  expect(()=>registerNativeMaterialSources('project','original-canvas',f.resolved)).toThrow('未覆盖');
  expect(useLcosReferenceStore.getState().nodeEntityRefs.get(f.node.id)?.entityId).toBe('keep-existing');
  useLcosReferenceStore.getState().reset();useLcosShellStore.getState().setProject('another-project');
  expect(()=>registerNativeMaterialSources('project','original-canvas',f.resolved)).toThrow('未覆盖');
  expect(useLcosReferenceStore.getState().nodeEntityRefs.size).toBe(0);
});
