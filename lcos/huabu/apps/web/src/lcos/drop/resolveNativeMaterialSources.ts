import { describeProjectedEntity } from '@local-creative-os/web-gen2';

import { getAbsolutePosition } from '@huabu/shared/canvas-engine';

import { readNativeImageMaterial, validateNativeImageMaterial } from './readNativeImageMaterial';
import { snapshotDraftReference } from '../composer/referenceSnapshot';
import { resolveRailwayNativeTextSources } from '../navigation/resolveRailwayNativeTextSources';

import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { RailwayNativeTextSourcePorts } from '../navigation/resolveRailwayNativeTextSources';
import type { CanvasTextSnapshot, DropPayload } from '@local-creative-os/web-gen2';

type DropObject = Extract<DropPayload, { kind: 'objects' }>['objects'][number];
export interface NativeMaterialSourcePorts extends Pick<RailwayNativeTextSourcePorts, 'readCurrent' | 'readBindings'> {
  readonly readProjectGraph: LcosCoreSession['projects']['getProjectGraph'];
  readonly claimText: RailwayNativeTextSourcePorts['claimProducer'];
  readonly importImage: LcosCoreSession['artifacts']['importCopiedFile'];
  readonly readImage?: typeof readNativeImageMaterial;
}

export interface NativeMaterialClaim {
  readonly nodeId: string; readonly artifactId: string; readonly viewId: string; readonly revisionId: string; readonly fileRecordId: string;
  readonly sourceRegistration: 'original-text-carrier' | 'original-image-carrier';
}
export interface ResolvedNativeMaterial {
  readonly reference: DropObject;
  readonly sourceRef: { readonly kind: 'artifactView'; readonly id: string };
  readonly sourceRegistration: NativeMaterialClaim['sourceRegistration'];
  readonly descriptor?: ReturnType<typeof describeProjectedEntity>;
}

/** One release's source preparation, shared by target owners. Canonical objects
 * remain untouched. Text claims the original carrier through its atomic owner;
 * images use Import Copy's atomic View/carrier claim, never the overwriting PUT. */
export async function resolveNativeMaterialSources(input: {
  readonly projectId: string; readonly canvasId: string; readonly objects: readonly DropObject[];
}, ports: NativeMaterialSourcePorts, signal?: AbortSignal, isCurrent?: () => boolean): Promise<{
  readonly objects: readonly DropObject[];
  readonly byNodeId: ReadonlyMap<string, ResolvedNativeMaterial>;
  readonly claims: readonly NativeMaterialClaim[];
}> {
  const current = () => {
    const snapshot = ports.readCurrent();
    if (signal?.aborted || isCurrent?.() === false || !input.projectId.trim() || !input.canvasId.trim()
      || snapshot.projectId !== input.projectId || snapshot.canvasId !== input.canvasId)
      throw new Error('原取用现场已变化，未登记到其他项目或画布。');
    return snapshot;
  };
  current();
  const natives = input.objects.filter(object => object.entityType.startsWith('native-'));
  const byNodeId = new Map<string, ResolvedNativeMaterial>();
  const claims: NativeMaterialClaim[] = [];
  if (!natives.length) return { objects: input.objects, byNodeId, claims };
  if (natives.some(object => !object.entityId.trim()) || new Set(natives.map(object => object.entityId)).size !== natives.length)
    throw new Error('整组原生材料身份缺失或重复，未重复登记。');
  const originals = new Map<string, string>();
  const verifyNative = (object: DropObject, allowOwnClaim = false) => {
    const snapshot = current();
    const matches = snapshot.nodes.filter(node => node.id === object.entityId);
    const node = matches.length === 1 ? matches[0] : undefined;
    const nativeImage = object.nativeImage;
    if (!node || node.data.contentMissing === true || node.data.artifactMissing === true
      || object.entityType === 'native-text' && (!object.nativeText || node.type !== object.nativeText.nodeType
        || !['note', 'text'].includes(node.type) || typeof node.data.content !== 'string' || node.data.content !== object.nativeText.body)
      || object.entityType === 'native-image' && (!nativeImage || nativeImage.canvasId !== input.canvasId || node.type !== 'image'
        || typeof node.data.src !== 'string' || node.data.src !== nativeImage.src || !nativeImage.src.trim())
      || !['native-text', 'native-image'].includes(object.entityType) || object.sourceRef)
      throw new Error('整组未登记：原生材料类型、真实内容或源地址已改变。');
    const ref = snapshot.refs.get(object.entityId);
    const address = ref ? snapshotDraftReference(ref) : undefined;
    const adopted = byNodeId.get(object.entityId)?.reference;
    if (ref && !(allowOwnClaim && adopted && ref.entityType === 'artifact' && ref.entityId === adopted.entityId
      && (!address?.artifactViewId || address.artifactViewId === adopted.artifactViewId)
      && (!address?.revisionId || address.revisionId === adopted.revisionId)))
      throw new Error('原节点已有其他正式身份，未重新登记或改绑。');
    const absolute = getAbsolutePosition([...snapshot.nodes], node.id);
    const geometry = JSON.stringify([node.position, node.parentId, absolute, node.width, node.height, node.style?.width, node.style?.height]);
    const original = originals.get(node.id);
    if (original !== undefined && original !== geometry) throw new Error('原材料位置或大小已改变，未接着投递旧快照。');
    originals.set(node.id, geometry);
  };
  const checkUnbound = async (objects: readonly DropObject[]) => {
    objects.forEach(object => verifyNative(object));
    const bindings = await ports.readBindings();
    objects.forEach(object => {
      verifyNative(object);
      if (bindings.some(binding => binding.projectId === input.projectId && binding.canvasId === input.canvasId
        && binding.spatialKind === 'node' && binding.spatialId === object.entityId))
        throw new Error('原节点已有正式材料绑定，请刷新后取用；未抢占原载体。');
    });
  };
  // Complete-batch validation and image byte preparation precede every write.
  await checkUnbound(natives);
  const graph = await ports.readProjectGraph(input.projectId);
  current();
  const sites = graph?.workspaces.filter(site => site.canvasId === input.canvasId) ?? [];
  const site = sites.length === 1 ? sites[0] : undefined;
  if (!graph || String(graph.project.id) !== input.projectId || !site || String(site.projectId) !== input.projectId
    || !graph.scopes.some(scope => scope.id === site.scopeId))
    throw new Error('原画布尚未对应唯一项目工作现场，未登记到猜测的 Scope。');
  const imageFiles = new Map<string, File>();
  for (const object of natives) {
    verifyNative(object);
    if (object.entityType === 'native-image' && object.nativeImage) {
      const file = await (ports.readImage ?? readNativeImageMaterial)(object.nativeImage, signal);
      verifyNative(object);
      validateNativeImageMaterial(file);
      imageFiles.set(object.entityId, file);
    }
  }
  await checkUnbound(natives);
  for (let index = 0; index < natives.length; index++) {
    const object = natives[index];
    await checkUnbound(natives.slice(index));
    if (object.entityType === 'native-text' && object.nativeText) {
      let textReceipt: CanvasTextSnapshot | undefined;
      const resolved = await resolveRailwayNativeTextSources({ projectId: input.projectId, canvasId: input.canvasId,
        sourceRefs: [], nativeTextSources: [{ nodeId: object.entityId, ...object.nativeText }] }, {
        readCurrent: ports.readCurrent, readBindings: ports.readBindings, claimProducer: async sent => {
          textReceipt = await ports.claimText(sent);
          return textReceipt;
        },
      }, signal, isCurrent);
      const text = resolved.byNodeId.get(object.entityId);
      if (!text || !textReceipt) throw new Error('原文本材料身份未确认。');
      const reference: DropObject = { ...text.reference, mimeType: 'text/markdown', ...(object.mode ? { mode: object.mode } : {}) };
      byNodeId.set(object.entityId, { reference, sourceRef: text.sourceRef, sourceRegistration: 'original-text-carrier' });
      verifyNative(object, true);
      // The original helper checked this exact atomic producer receipt;
      // keep its IDs, not another graph read's newer revision.
      claims.push({ nodeId: object.entityId, artifactId: reference.entityId, viewId: text.sourceRef.id,
        revisionId: textReceipt.revisionId, fileRecordId: textReceipt.fileRecordId, sourceRegistration: 'original-text-carrier' });
    } else {
      const file = imageFiles.get(object.entityId);
      if (!file) throw new Error('原图片字节尚未准备，未替换成文本。');
      const node = current().nodes.find((item) => item.id === object.entityId);
      if (!node) throw new Error('原图片节点已不存在。');
      const position = getAbsolutePosition([...current().nodes],node.id);
      const width = [node.style?.width,node.width,node.measured?.width].map(Number).find(value=>Number.isFinite(value)&&value>0);
      const height = [node.style?.height,node.height,node.measured?.height].map(Number).find(value=>Number.isFinite(value)&&value>0);
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || width===undefined || height===undefined)
        throw new Error('原图片尺寸尚未确认，未另建替代节点。');
      const label=typeof node.data.label==='string'?node.data.label.trim():'';
      const extension=file.name.slice(file.name.lastIndexOf('.'));
      const namedFile=label?new File([file],label.toLowerCase().endsWith(extension.toLowerCase())?label:label+extension,{type:file.type}):file;
      const saved = await ports.importImage(input.projectId, { file:namedFile, scopeId: String(site.scopeId),
        importRequestId: `native-image-${crypto.randomUUID()}`, position,
        nativeCarrier: { canvasId:input.canvasId,spatialId:object.entityId,size:{width,height} } }, signal);
      const artifactId = String(saved.artifact.id), viewId = String(saved.view.id), revisionId = String(saved.revision.id);
      if (!artifactId.trim() || !viewId.trim() || !revisionId.trim() || !String(saved.revision.fileRecordId).trim()
        || String(saved.artifact.projectId) !== input.projectId || saved.artifact.kind !== 'image' || saved.artifact.archivedAt !== undefined
        || String(saved.revision.artifactId) !== artifactId || String(saved.view.artifactId) !== artifactId
        || String(saved.view.revisionId) !== revisionId || saved.revision.status === 'draft')
        throw new Error('图片保存结果尚未确认，未继续投递。原图片保留。');
      if (String(saved.view.scopeId) !== String(site.scopeId)
        || saved.binding?.projectId !== input.projectId || saved.binding.canvasId !== input.canvasId
        || saved.binding.spatialKind !== 'node' || saved.binding.spatialId !== object.entityId
        || !(saved.binding.entityType === 'artifact' && saved.binding.entityId === artifactId
          || saved.binding.entityType === 'view' && saved.binding.entityId === viewId))
        throw new Error('图片材料已保存，但原图片的项目引用未确认，未继续投递。');
      const reference: DropObject = { entityType: 'artifact', entityId: artifactId, artifactViewId: viewId,
        revisionId, mimeType: file.type, ...(object.mode ? { mode: object.mode } : {}) };
      byNodeId.set(object.entityId, { reference, sourceRef: { kind: 'artifactView', id: viewId }, sourceRegistration: 'original-image-carrier',
        descriptor:describeProjectedEntity({entityType:'artifact',entityId:artifactId,title:saved.artifact.title,artifactKind:'image',
          availability:saved.artifact.availability,managed:saved.artifact.managed,currentRevisionId:String(saved.artifact.currentRevisionId),
          presentedRevisionId:revisionId,revisionStatus:saved.revision.status,artifactViewId:viewId,artifactViewReferenceKind:saved.view.referenceKind,
          fileRecordId:String(saved.revision.fileRecordId),mimeType:file.type}) });
      verifyNative(object,true);
      claims.push({ nodeId: object.entityId, artifactId, viewId, revisionId, fileRecordId: String(saved.revision.fileRecordId),
        sourceRegistration: 'original-image-carrier' });
    }
    // Own text adoption may add its binding; every original body/src/geometry
    // still comes from the live source, never from a destination projection.
    natives.slice(0, index + 1).forEach(native => verifyNative(native, true));
  }
  current();
  return { objects: input.objects.map(object => object.entityType.startsWith('native-') ? byNodeId.get(object.entityId)?.reference ?? object : object), byNodeId, claims };
}
