import { expect, it, vi } from 'vitest';

import { resolveNativeMaterialSources } from './resolveNativeMaterialSources';
import { navigationGraph } from '../navigation/navigationFixtures';

import type { NativeMaterialSourcePorts } from './resolveNativeMaterialSources';
import type { CanvasTextSnapshot, DropPayload, EntityRefLike, ProjectionBinding } from '@local-creative-os/web-gen2';
import type { Node } from '@xyflow/react';

type DropObject = Extract<DropPayload, { kind: 'objects' }>['objects'][number];
const text: DropObject = { entityType: 'native-text', entityId: 'native-note', nativeText: { nodeType: 'note', body: '' } };
const image: DropObject = { entityType: 'native-image', entityId: 'native-image', nativeImage: { src: 'real-image.png', canvasId: 'source' } };
const canonical: DropObject = { entityType: 'artifact', entityId: 'existing', artifactViewId: 'historical-view', revisionId: 'old', mode: 'structure' };
function fixture() {
  let nodes: Node[] = [{ id: text.entityId, type: 'note', position: { x: 24, y: 32 }, data: { content: '', label: '决策', origin: { type: 'ai-operate' } } },
    { id: image.entityId, type: 'image', position: { x: 240, y: 320 }, style: { width: 300, height: 200 }, data: { src: 'real-image.png', label: '决策' } }];
  const refs = new Map<string, EntityRefLike>();
  let bindings: ProjectionBinding[] = [];
  let canvasId = 'source', projectId = 'p';
  let graph = navigationGraph({ scopes: [{ id: 'root', kind: 'root' }, { id: 'other-scope', kind: 'context' }],
    workspaces: [{ id: 'original-site', projectId: 'p', canvasId: 'source', scopeId: 'root', focusedViewIds: [] }],
    artifacts: [{ id: 'same-byte-image', projectId: 'p', kind: 'image', currentRevisionId: 'image-rev' }],
    artifactRevisions: [{ id: 'image-rev', artifactId: 'same-byte-image', fileRecordId: 'image-file', status: 'current' }],
    artifactViews: [{ id: 'image-view', artifactId: 'same-byte-image', revisionId: 'image-rev', scopeId: 'other-scope', referenceKind: 'primary' }],
  });
  const artifact = graph.artifacts[0], revision = graph.artifactRevisions[0], view = graph.artifactViews[0];
  if (!artifact || !revision || !view) throw new Error('Image fixture must contain its canonical identities.');
  const savedImage = { artifact,revision,view:{...view,scopeId:'root' as typeof view.scopeId},reused:true,
    binding:{projectId:'p',canvasId:'source',spatialKind:'node' as const,spatialId:image.entityId,entityType:'artifact' as const,entityId:String(artifact.id)} };
  const textReceipt: CanvasTextSnapshot = { projectId: 'p', canvasId: 'source', spatialId: text.entityId, body: '', title: '文本',
    artifactId: 'actual-native-note', viewId: 'native-note-view', revisionId: 'native-note-rev', fileRecordId: 'native-note-file' };
  const events: string[] = [];
  const claimText = vi.fn<NativeMaterialSourcePorts['claimText']>(async sent => {
    events.push('claim-text'); refs.set(sent.nodeId, { entityType: 'artifact', entityId: textReceipt.artifactId });
    return { ...textReceipt, body: sent.body, spatialId: sent.nodeId };
  });
  const readImage = vi.fn<NonNullable<NativeMaterialSourcePorts['readImage']>>(async () => {
    events.push('read-image'); return new File(['real-image-bytes'], 'native-image.png', { type: 'image/png' });
  });
  const importImage = vi.fn<NativeMaterialSourcePorts['importImage']>(async () => { events.push('import-image'); return savedImage; });
  const readBindings = vi.fn<NativeMaterialSourcePorts['readBindings']>(async () => bindings);
  const readProjectGraph = vi.fn<NativeMaterialSourcePorts['readProjectGraph']>(async () => graph);
  const ports: NativeMaterialSourcePorts = { readCurrent: () => ({ projectId, canvasId, nodes, refs }),
    claimText, readImage, importImage, readBindings, readProjectGraph };
  return { ports, refs, events, claimText, readImage, importImage, readBindings, readProjectGraph, savedImage, textReceipt,
    nodes: () => nodes, replaceNodes: (value: Node[]) => { nodes = value; },
    bind: (value: ProjectionBinding[]) => { bindings = value; }, graph: () => graph, setGraph: (value: typeof graph) => { graph = value; },
    changeScene: () => { projectId = 'other'; canvasId = 'other'; } };
}
const request = (objects: readonly DropObject[]) => ({ projectId: 'p', canvasId: 'source', objects });

it('prepares one canonical identity per native source while preserving existing exact references, their order and the original carriers', async () => {
  const f = fixture(); const original = structuredClone(f.nodes());
  const aggregate: DropObject = { entityType: 'scope', entityId: 'workflow', sourceRef: { kind: 'workflow', id: 'workflow' } };
  const sameIdCanonical: DropObject = { ...canonical, entityId: image.entityId };
  const result = await resolveNativeMaterialSources(request([canonical, text, aggregate, image, sameIdCanonical]), f.ports);
  expect(result.objects[0]).toBe(canonical); expect(result.objects[2]).toBe(aggregate); expect(result.objects[4]).toBe(sameIdCanonical);
  expect(result.objects[1]).toEqual({ entityType: 'artifact', entityId: 'actual-native-note', artifactViewId: 'native-note-view', revisionId: 'native-note-rev', mimeType: 'text/markdown' });
  expect(result.objects[3]).toEqual({ entityType: 'artifact', entityId: 'same-byte-image', artifactViewId: 'image-view', revisionId: 'image-rev', mimeType: 'image/png' });
  expect(f.claimText).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', canvasId: 'source', nodeId: text.entityId, body: '', focus: false });
  expect(f.events).toEqual(['read-image', 'claim-text', 'import-image']);
  expect(f.importImage.mock.calls[0]?.[1]).toMatchObject({scopeId:'root',position:{x:240,y:320},
    nativeCarrier:{canvasId:'source',spatialId:image.entityId,size:{width:300,height:200}}});
  expect(f.graph().artifactViews[0]?.scopeId).toBe('other-scope');
  expect(result.claims.map(claim => claim.sourceRegistration)).toEqual(['original-text-carrier','original-image-carrier']);
  expect(result.byNodeId.get(image.entityId)?.descriptor).toMatchObject({artifactViewId:'image-view',presentedRevisionId:'image-rev',fileRecordId:'image-file'});
  expect(result.byNodeId.get(image.entityId)?.reference).toBe(result.objects[3]);
  expect(f.nodes()).toEqual(original);
  expect(f.refs.has(image.entityId)).toBe(false);
});

it('does no source lookup or writes when every object already has canonical identity', async () => {
  const f = fixture(); const objects = [canonical];
  expect((await resolveNativeMaterialSources(request(objects), f.ports)).objects).toBe(objects);
  expect(f.readProjectGraph).not.toHaveBeenCalled(); expect(f.readBindings).not.toHaveBeenCalled(); expect(f.claimText).not.toHaveBeenCalled();
});

it('prevalidates all native carriers and all image bytes before any registration', async () => {
  for (const objects of [[text, { ...image, nativeImage: { src: 'replacement.png', canvasId: 'source' } }],
    [text, { entityType: 'native-shape', entityId: 'shape' }], [text, text]]) {
    const f = fixture(); await expect(resolveNativeMaterialSources(request(objects), f.ports)).rejects.toThrow();
    expect(f.claimText).not.toHaveBeenCalled(); expect(f.importImage).not.toHaveBeenCalled();
  }
  const f = fixture(); f.readImage.mockRejectedValue(new Error('image bytes missing'));
  await expect(resolveNativeMaterialSources(request([text, image]), f.ports)).rejects.toThrow('image bytes missing');
  expect(f.claimText).not.toHaveBeenCalled(); expect(f.importImage).not.toHaveBeenCalled();
  const wrongMime = fixture(); wrongMime.readImage.mockResolvedValue(new File(['prose'], 'image.png', { type: 'text/plain' }));
  await expect(resolveNativeMaterialSources(request([text, image]), wrongMime.ports)).rejects.toThrow('类型');
  expect(wrongMime.claimText).not.toHaveBeenCalled();
});

it('refuses local, persisted, foreign or asynchronously changed source identity before writes', async () => {
  const local = fixture(); local.refs.set(image.entityId, { entityType: 'artifact', entityId: 'artifact-decision' });
  await expect(resolveNativeMaterialSources(request([text, image]), local.ports)).rejects.toThrow('其他正式身份');
  expect(local.claimText).not.toHaveBeenCalled();
  const persisted = fixture(); persisted.bind([{ projectId: 'p', canvasId: 'source', spatialKind: 'node', spatialId: image.entityId, entityType: 'view', entityId: 'foreign-view' }]);
  await expect(resolveNativeMaterialSources(request([text, image]), persisted.ports)).rejects.toThrow('正式材料绑定');
  expect(persisted.claimText).not.toHaveBeenCalled();
  const changed = fixture(); changed.readImage.mockImplementation(async () => {
    changed.replaceNodes(changed.nodes().map(node => node.id === text.entityId ? { ...node, data: { content: 'changed body' } } : node));
    return new File(['x'], 'real.png', { type: 'image/png' });
  });
  await expect(resolveNativeMaterialSources(request([text, image]), changed.ports)).rejects.toThrow('真实内容');
  expect(changed.claimText).not.toHaveBeenCalled();
});

it('rejects ambiguous worksite, missing scope, another source canvas, missing sidecar or changed geometry', async () => {
  for (const graph of [navigationGraph(), navigationGraph({ scopes: [{ id: 'root', kind: 'root' }], workspaces: [
    { id: 'one', projectId: 'p', canvasId: 'source', scopeId: 'root' }, { id: 'two', projectId: 'p', canvasId: 'source', scopeId: 'root' }] })]) {
    const f = fixture(); f.setGraph(graph); await expect(resolveNativeMaterialSources(request([text, image]), f.ports)).rejects.toThrow('唯一项目');
    expect(f.claimText).not.toHaveBeenCalled();
  }
  const foreign = fixture(); await expect(resolveNativeMaterialSources(request([{ ...image, nativeImage: { src: 'real-image.png', canvasId: 'other' } }]), foreign.ports)).rejects.toThrow();
  const missing = fixture(); missing.replaceNodes(missing.nodes().map(node => ({ ...node, data: { ...node.data, artifactMissing: true } })));
  await expect(resolveNativeMaterialSources(request([image]), missing.ports)).rejects.toThrow();
  const moved = fixture(); moved.readImage.mockImplementation(async () => {
    moved.replaceNodes(moved.nodes().map(node => ({ ...node, position: { x: node.position.x + 1, y: node.position.y } })));
    return new File(['x'], 'actual.png', { type: 'image/png' });
  });
  await expect(resolveNativeMaterialSources(request([image]), moved.ports)).rejects.toThrow('位置或大小');
  expect(moved.importImage).not.toHaveBeenCalled();
});

it('reuses the confirmed canonical source after claiming; stale native payload cannot import the same carrier again', async () => {
  const f = fixture();
  f.importImage.mockImplementation(async () => {f.bind([f.savedImage.binding]);return f.savedImage;});
  const first = await resolveNativeMaterialSources(request([image]), f.ports);
  await expect(resolveNativeMaterialSources(request([image]),f.ports)).rejects.toThrow('正式材料绑定');
  const second = await resolveNativeMaterialSources(request(first.objects), f.ports);
  expect(second.objects).toEqual(first.objects);
  expect(f.importImage).toHaveBeenCalledTimes(1);
  expect(f.refs.has(image.entityId)).toBe(false);
  expect(f.nodes()[1]?.data.src).toBe('real-image.png');
  expect(f.nodes()[1]?.position).toEqual({ x: 240, y: 320 });
});

it('rejects a receipt that saved bytes but did not bind the exact original image carrier', async () => {
  const missing = fixture();missing.importImage.mockResolvedValue({...missing.savedImage,binding:undefined});
  await expect(resolveNativeMaterialSources(request([image]),missing.ports)).rejects.toThrow('图片材料已保存');
  const wrong = fixture();wrong.importImage.mockResolvedValue({...wrong.savedImage,binding:{...wrong.savedImage.binding,spatialId:'another-node'}});
  await expect(resolveNativeMaterialSources(request([image]),wrong.ports)).rejects.toThrow('图片材料已保存');
});
it('accepts its own confirmed image reference when the normal projection refresh reaches the original carrier before the import reply',async()=>{
  const f=fixture();f.importImage.mockImplementation(async()=>{
    f.refs.set(image.entityId,{entityType:'artifact',entityId:String(f.savedImage.artifact.id)});return f.savedImage;
  });
  const result=await resolveNativeMaterialSources(request([image]),f.ports);
  expect(result.claims[0]?.sourceRegistration).toBe('original-image-carrier');
  expect(result.objects[0]?.entityId).toBe(f.savedImage.artifact.id);
});
it('uses the measured size of a native auto-height image and does not invent dimensions before it is measured',async()=>{
  const f=fixture();f.replaceNodes(f.nodes().map(node=>node.id===image.entityId?{...node,style:{width:300,height:'auto'},measured:{width:300,height:200}}:node));
  await resolveNativeMaterialSources(request([image]),f.ports);
  expect(f.importImage.mock.calls[0]?.[1].nativeCarrier?.size).toEqual({width:300,height:200});
  const missing=fixture();missing.replaceNodes(missing.nodes().map(node=>node.id===image.entityId?{...node,style:{width:300,height:'auto'}}:node));
  await expect(resolveNativeMaterialSources(request([image]),missing.ports)).rejects.toThrow('尺寸尚未确认');
  expect(missing.importImage).not.toHaveBeenCalled();
});
it('keeps the native visible image name as the imported filename without changing its bytes or using the title as identity',async()=>{
  const f=fixture();await resolveNativeMaterialSources(request([image]),f.ports);
  const uploaded=f.importImage.mock.calls[0]?.[1].file;
  expect(uploaded?.name).toBe('决策.png');expect(uploaded?.type).toBe('image/png');
  expect(await uploaded?.text()).toBe('real-image-bytes');
  expect(f.nodes()[1]?.data.label).toBe('决策');
});

it('rejects malformed producer replies and unknown results without retry or false target success', async () => {
  const badText = fixture(); badText.claimText.mockResolvedValue({ ...badText.textReceipt, body: 'title guessed as body' });
  await expect(resolveNativeMaterialSources(request([text]), badText.ports)).rejects.toThrow('回执');
  const badImage = fixture();
  const wrongView = navigationGraph({ artifactViews: [{ ...badImage.savedImage.view, revisionId: 'wrong-revision' }] }).artifactViews[0];
  if (!wrongView) throw new Error('Malformed receipt fixture must contain its View.');
  badImage.importImage.mockResolvedValue({ ...badImage.savedImage, view: wrongView });
  await expect(resolveNativeMaterialSources(request([image]), badImage.ports)).rejects.toThrow('保存结果尚未确认');
  const unknown = fixture(); unknown.importImage.mockRejectedValue(new Error('Outcome unknown'));
  await expect(resolveNativeMaterialSources(request([text, image]), unknown.ports)).rejects.toThrow('Outcome unknown');
  expect(unknown.claimText).toHaveBeenCalledTimes(1); expect(unknown.importImage).toHaveBeenCalledTimes(1);
});

it('honors project/canvas changes, cancellation and caller geometry signals before writing', async () => {
  const changed = fixture(); changed.readImage.mockImplementation(async () => { changed.changeScene(); return new File(['x'], 'actual.png', { type: 'image/png' }); });
  await expect(resolveNativeMaterialSources(request([text, image]), changed.ports)).rejects.toThrow('现场已变化');
  expect(changed.claimText).not.toHaveBeenCalled();
  const cancelled = fixture(); const controller = new AbortController(); controller.abort();
  await expect(resolveNativeMaterialSources(request([image]), cancelled.ports, controller.signal)).rejects.toThrow('现场已变化');
  expect(cancelled.readImage).not.toHaveBeenCalled();
  await expect(resolveNativeMaterialSources(request([text]), fixture().ports, undefined, () => false)).rejects.toThrow('现场已变化');
});
