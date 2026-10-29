import type { DropPayload } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import type { DropAssemblyApplyIntent, DropCommitReceipt } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import type { NativeLibraryRelease, NativeLibraryMaterialPorts } from './native-library-material-dispatch';
import { withNativeLibraryDropRecovery } from './native-library-material-dispatch';
import { captureNativeNodeMaterialDrop, readNativeLibraryDropCapture, markNativeLibraryPlacementReceipt } from './native-library-drop';
import { receiveNativeLibraryMaterial } from './native-material-receive-client';
import { isNativeFileMaterial, nativeFileMaterialMetadata, sameNativeFileMaterialMetadata, type NativeFileMaterialMetadata } from './native-file-material';
import { nativeSurfaceForDropTargetId } from './native-surface-dock-drop';
import type { NativeCanvasNode } from './native-canvas-port';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
interface Material { artifactId: string; artifactViewId: string; revisionId: string; fileRecordId: string; title: string; size: {width:number;height:number}; file?: NativeFileMaterialMetadata }
interface Destination { canvasId: string; workspaceId: string; scopeId: string }
interface Ports extends NativeLibraryMaterialPorts { rootCanvas(surface: 'main'|'context'|'workflow'): string | undefined }

/** One explicit gesture uses the existing receive producer and receipt owner.
 * Source guard and destination address are separate; no second queue or Canvas. */
export function createNativeSurfaceMaterialDispatcher(release: NativeLibraryRelease, payload: DropPayload,
  transactionId: string, ports: Ports) {
  return {
    async handle(intent: DropAssemblyApplyIntent, tx: string, signal?: AbortSignal): Promise<DropCommitReceipt | undefined> {
      const surface = nativeSurfaceForDropTargetId(intent.targetId);
      if (!surface) return undefined;
      const api = release.api, sourceCanvasId = release.canvasId, projectId = release.projectId;
      const targetCanvasId = ports.rootCanvas(surface);
      const targetRef = intent.targetRef;
      const failure = (message: string): DropCommitReceipt => ({status:'failed',transactionId:tx,targetId:intent.targetId,projectId,message});
      if (!api || !sourceCanvasId || !targetCanvasId || !api.findMaterialPlacement || !api.flushCanvas
        || tx !== transactionId || !['main','context','workflow'].includes(targetRef.kind) || targetRef.kind !== surface
        || intent.portalReceive || intent.railwayReceive || intent.railwayDestinationRef)
        return failure('这个现场的接收地址尚未就绪，原材料保留。');
      const current = (recovery = false, requestSignal?: AbortSignal) => {
        const now = ports.current(), target = ports.target(intent.targetId);
        return !requestSignal?.aborted && now.projectId === projectId && now.canvasId === sourceCanvasId
          && now.workspaceId === release.workspaceId && now.api === api && now.surface === release.surface
          && ports.rootCanvas(surface) === targetCanvasId
          && ports.gesture(payload, tx, intent.targetId, recovery) && target?.enabled === true
          && target.semantic.kind === 'spatial-membership' && same(target.semantic.targetRef,targetRef);
      };
      const get = async (address: string, recovery: boolean, requestSignal?: AbortSignal): Promise<Row> => {
        if (!current(recovery, requestSignal)) throw new Error('现场已变化，未改投其他位置。');
        const response = await fetch(address,{cache:'no-store',redirect:'error',signal:requestSignal});
        const envelope: unknown = await response.json(), value = row(envelope);
        if (!response.ok || !current(recovery, requestSignal)) throw new Error('接收记录暂时无法核对。');
        if (value.ok === true) return row(value.value);
        if (value.code === 0) return row(value.data);
        throw new Error('接收记录暂时无法核对。');
      };
      // Workspace responses can be an array inside the original envelope.
      const readWorkspaces = async (recovery: boolean, requestSignal?: AbortSignal): Promise<Row[]> => {
        if (!current(recovery,requestSignal)) throw new Error('现场已变化。');
        const response=await fetch('/api/lcos/core/projects/'+encodeURIComponent(projectId)+'/workspaces',{cache:'no-store',signal:requestSignal});
        const envelope=row(await response.json());
        if (!response.ok || envelope.ok !== true || !current(recovery,requestSignal)) throw new Error('目标现场暂不可读取。');
        return rows(envelope.value);
      };
      const library = readNativeLibraryDropCapture(payload);
      const requested = payload.kind === 'objects' ? payload.objects.map(item => ({
        entityId:item.entityId, artifactId:item.artifactId ?? item.entityId, artifactViewId:item.artifactViewId, revisionId:item.revisionId,
        entityType:item.entityType, title:item.displayLabel, mimeType:item.mimeType,
      })) : payload.kind === 'assembly' && library ? [{
        entityId:library.artifactId,artifactId:library.artifactId,artifactViewId:library.artifactViewId,revisionId:library.revisionId,
        entityType:'artifact',title:library.title,mimeType:payload.kind === 'assembly' ? payload.reference?.mimeType : undefined,
      }] : [];
      if (!requested.length || requested.some(item => item.entityType !== 'artifact' || item.entityId !== item.artifactId
        || !text(item.artifactId) || !text(item.artifactViewId) || !text(item.revisionId))
        || intent.sourceRefs.length !== new Set(requested.map(item=>item.artifactViewId)).size
        || intent.sourceRefs.some(ref=>ref.kind!=='artifactView'||!requested.some(item=>item.artifactViewId===ref.id)))
        return failure('这组对象还未完整接上现场投放，未拆开投递，原内容保留。');
      const fileSources = new Map<string, NativeFileMaterialMetadata>();
      const sourceCurrent = () => library !== null
        ? library.projectId === projectId && library.canvasId === sourceCanvasId && library.api === api
        : requested.every(item => api.getNodes().some(node => {
        const ref=row(node.data?.lcos_ref);
        return ref.artifactId===item.artifactId && ref.artifactViewId===item.artifactViewId && ref.revisionId===item.revisionId
          && (!fileSources.has(item.artifactViewId!) || sameNativeFileMaterialMetadata(node.data?.lcos_file_ref,fileSources.get(item.artifactViewId!)!));
      }));
      let materials: Material[], destination: Destination;
      try {
        const [graph, workspaces]=await Promise.all([get('/api/lcos/core/projects/'+encodeURIComponent(projectId)+'/graph',false,signal),readWorkspaces(false,signal)]);
        if (row(graph.project).id !== projectId || !sourceCurrent()) throw new Error('来源已变化，原内容保留。');
        const matches=workspaces.filter(w=>w.canvasId===targetCanvasId&&w.projectId===projectId&&w.preferredSurface===surface);
        const workspace=matches[0];
        if(matches.length!==1||!text(workspace?.id)||!text(workspace.scopeId)
          || targetRef.kind!=='main'&&workspace.scopeId!==targetRef.id) throw new Error('目标现场地址已变化。');
        destination={canvasId:targetCanvasId,workspaceId:workspace.id,scopeId:workspace.scopeId};
        materials=requested.map(item=>{
          const artifact=rows(graph.artifacts).find(a=>a.id===item.artifactId);
          const revision=rows(graph.artifactRevisions).find(r=>r.id===item.revisionId&&r.artifactId===item.artifactId);
          const file=rows(graph.fileRecords).find(f=>f.id===revision?.fileRecordId);
          const view=rows(graph.artifactViews).find(v=>v.id===item.artifactViewId&&v.artifactId===item.artifactId);
          if(!artifact||artifact.projectId!==projectId||artifact.archivedAt!==undefined
            || !['text','markdown','image'].includes(String(artifact.kind)) && !isNativeFileMaterial(artifact.kind)
            || !revision||!['current','superseded'].includes(String(revision.status))
            || !file||file.projectId!==projectId||file.availability!=='current'||!text(file.id)
            || !text(revision.contentHash)||file.observedHash!==revision.contentHash||!view
            || library !== null && file.id !== library.fileRecordId
            || item.mimeType !== undefined && item.mimeType.split(';',1)[0]!.trim().toLowerCase() !== String(file.mimeType).split(';',1)[0]!.trim().toLowerCase()
            || !rows(graph.scopes).some(scope=>scope.id===view.scopeId&&scope.projectId===projectId))
            throw new Error('所选材料的准确版本或原生呈现尚未就绪，未拆开投递。');
          const fileMetadata = isNativeFileMaterial(artifact.kind) ? nativeFileMaterialMetadata({
            artifact:{id:artifact.id,kind:artifact.kind},view:{id:item.artifactViewId},revision:{id:revision.id},
            file:{id:file.id,mimeType:file.mimeType,size:file.size},
          }) : undefined;
          if (fileMetadata && library === null) {
            fileSources.set(item.artifactViewId!,fileMetadata);
            if (!sourceCurrent()) throw new Error('原文件卡片的准确版本或格式已变化，未投递。');
          }
          return {artifactId:item.artifactId!,artifactViewId:item.artifactViewId!,revisionId:item.revisionId!,
            fileRecordId:file.id,title:text(item.title)?item.title:text(artifact.title)?artifact.title:'材料',
            size:{width:360,height:artifact.kind==='image'?240:280},...(fileMetadata?{file:fileMetadata}:{})};
        });
        materials=[...new Map(materials.map(m=>[JSON.stringify([m.artifactId,m.revisionId]),m])).values()];
        if (payload.kind==='objects') captureNativeNodeMaterialDrop(payload,{
          projectId,canvasId:sourceCanvasId,api,...materials[0]!,
          title:materials.length===1?materials[0]!.title:materials.length+' 项材料',
        });
      } catch(error) { return failure(error instanceof Error?error.message:'材料与现场暂时无法核对，未投递。'); }
      const confirmed = new Map<string,unknown>();
      const key=(m:Material)=>JSON.stringify([m.artifactId,m.revisionId]);
      const make=(status:DropCommitReceipt['status'],message:string):DropCommitReceipt=>markNativeLibraryPlacementReceipt({
        status,transactionId:tx,targetId:intent.targetId,projectId,message,
        canonicalReceipt:{destination,items:[...confirmed.values()]},
      },payload);
      const run=async(recovery:boolean,requestSignal?:AbortSignal):Promise<DropCommitReceipt>=>{
        const pending=(message:string)=>withNativeLibraryDropRecovery(make('partial',message),next=>run(true,next));
        if(!current(recovery,requestSignal)||!recovery&&!sourceCurrent()) return confirmed.size||recovery?pending('接收结果待核对，原材料保留。'):make('failed','来源或现场已变化，未投递。');
        try {
          if(!recovery&&await api.flushCanvas!(sourceCanvasId)!=='saved') return make('failed','原画布编辑尚未保存，材料保留。');
          for(const material of materials) {
            if(confirmed.has(key(material))) continue;
            const canvas=await get('/api/canvas/v1/canvases/'+encodeURIComponent(targetCanvasId),recovery,requestSignal);
            if (canvas.id !== targetCanvasId || canvas.workspace_id !== destination.workspaceId)
              throw new Error('目标画布响应身份不一致，未改投其他位置。');
            const nodes=rows(canvas.nodes);
            const existing=nodes.find(node=>{
              const data=row(node.data),ref=row(data.lcos_ref),membership=row(data.lcos_workspace_membership);
              return ref.version===1&&ref.artifactId===material.artifactId&&ref.revisionId===material.revisionId
                && membership.workspaceId===destination.workspaceId&&membership.viewId===ref.artifactViewId
                && (!material.file || sameNativeFileMaterialMetadata(data.lcos_file_ref,{...material.file,artifactViewId:String(ref.artifactViewId)}));
            });
            if(existing) { confirmed.set(key(material),{status:'already-present',node:existing}); continue; }
            const layout=nodes.map(node=>({...node,...(node.parent_id?{parentId:node.parent_id}:{})})) as NativeCanvasNode[];
            const position=api.findMaterialPlacement!(material.size,layout);
            if(!position) throw new Error('目标现场暂时无法确定空位。');
            const input={projectId,sourceCanvasId,canvasId:destination.canvasId,workspaceId:destination.workspaceId,...material,targetRef,position};
            const receive=async(readOnly:boolean)=>receiveNativeLibraryMaterial(input,{
              api,isCurrent:()=>current(recovery,requestSignal)&&(readOnly||sourceCurrent()),signal:requestSignal,readOnly,
            });
            let result=await receive(recovery);
            // Automatic inspection is GET-only. A missing response must never
            // replay the producer or ask the user to reconstruct its address.
            if(result.status==='unconfirmed'&&!recovery&&current(false,requestSignal)) result=await receive(true);
            if('message' in result)
              return result.status==='unconfirmed'||recovery||confirmed.size?pending(result.message):make('failed',result.message);
            const receivedData = row(row(result.canonicalReceipt.node).data);
            if (material.file && !sameNativeFileMaterialMetadata(receivedData.lcos_file_ref,{...material.file,artifactViewId:result.artifactViewId}))
              return pending('文件接收已提交，但原文件卡片的准确版本与格式尚未确认。');
            confirmed.set(key(material),result.canonicalReceipt);
          }
          return make('success','已放入 '+surface+'，源材料保留。');
        } catch(error) {
          return confirmed.size||recovery?pending('接收结果仍待核对，没有重复投递。'):make('failed',error instanceof Error?error.message:'接收暂未完成。');
        }
      };
      return run(false,signal);
    },
  };
}
