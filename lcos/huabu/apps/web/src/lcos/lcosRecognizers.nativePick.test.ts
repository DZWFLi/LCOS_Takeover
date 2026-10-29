import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { prepareNativeReferencePick } from './composer/prepareNativeReferencePick';
import { createReferencePickRecognizer } from './lcosRecognizers';
import { useLcosReferenceStore } from './lcosReferenceState';
import { navigationGraph } from './navigation/navigationFixtures';
import { referencePickOwnerKey } from './referencePickOwnership';
import { useLcosShellStore } from './shell/lcosShellStore';

import type { NativeMaterialSourcePorts } from './drop/resolveNativeMaterialSources';
import type { CanvasPointerRouterContext } from '@/handler/canvasPointerRouterContext';
import type { Node } from '@xyflow/react';

const hit = vi.hoisted(() => ({ id: 'source' }));
vi.mock('@/handler/canvasNodeAtPoint', () => ({ nodeIdAtScreenPoint: () => hit.id }));
const context = { interactivityLocked: false, explicitToolActive: false } as CanvasPointerRouterContext;
const savedCanvas = useCanvasStore.getState();
const target = { nodeId: 'receiver', title: '当前输入', anchor: { x: 0, y: 0, width: 10, height: 10 } };
function event(extra: Partial<PointerEvent> = {}): PointerEvent {
  return { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, ctrlKey: true, metaKey: false,
    shiftKey: false, altKey: false, clientX: 20, clientY: 20, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra } as PointerEvent;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  hit.id = 'source';
  useLcosReferenceStore.getState().reset();
  useLcosReferenceStore.getState().setProject('p');
  useLcosShellStore.setState({ projectId: 'p' });
  useLcosShellStore.getState().openComposer(target);
});
afterEach(() => {
  useCanvasStore.setState(savedCanvas);
  useLcosReferenceStore.getState().reset();
  useLcosShellStore.getState().closeComposer();
  vi.restoreAllMocks();
});
function fixture(type: 'image' | 'text' = 'image') {
  const node: Node = { id: 'source', type, position: { x: 80, y: 90 }, style: { width: 240, height: 160 }, selected: false,
    data: type === 'image' ? { src: 'real-image.png', label: '原图' } : { content: '原始正文', label: '原文' } };
  useCanvasStore.setState({ canvasId: 'canvas', nodes: [node,
    { id: 'selected', type: 'text', position: { x: 400, y: 60 }, selected: true, data: { content: '保留选择' } }] });
  const graph = navigationGraph({ scopes: [{ id: 'root', kind: 'root' }],
    workspaces: [{ id: 'site', projectId: 'p', canvasId: 'canvas', scopeId: 'root' }],
    artifacts: [{ id: 'real-artifact', projectId: 'p', kind: 'image', title: '原图', currentRevisionId: 'real-revision' }],
    artifactRevisions: [{ id: 'real-revision', artifactId: 'real-artifact', fileRecordId: 'real-file', status: 'current' }],
    artifactViews: [{ id: 'real-view', artifactId: 'real-artifact', revisionId: 'real-revision', scopeId: 'root', referenceKind: 'primary' }] });
  const artifact = graph.artifacts[0], revision = graph.artifactRevisions[0], view = graph.artifactViews[0];
  if (!artifact || !revision || !view) throw new Error('Missing fixture material');
  const receipt = { artifact, revision, view, reused: false,
    binding: { projectId: 'p', canvasId: 'canvas', spatialKind: 'node' as const, spatialId: 'source', entityType: 'artifact' as const, entityId: 'real-artifact' } };
  const importImage = vi.fn<NativeMaterialSourcePorts['importImage']>().mockResolvedValue(receipt);
  const readImage = vi.fn<NonNullable<NativeMaterialSourcePorts['readImage']>>().mockResolvedValue(new File(['image bytes'], 'image.png', { type: 'image/png' }));
  const readProjectGraph = vi.fn<NativeMaterialSourcePorts['readProjectGraph']>().mockResolvedValue(graph);
  const claimText = vi.fn<NativeMaterialSourcePorts['claimText']>(async input => {
    const result = { projectId: 'p', canvasId: 'canvas', spatialId: input.nodeId, artifactId: 'text-artifact', viewId: 'text-view',
      revisionId: 'text-revision', fileRecordId: 'text-file', title: '原文', body: input.body };
    useLcosReferenceStore.getState().registerNodeEntity(input.nodeId, { entityType: 'artifact', entityId: result.artifactId,
      descriptor: describeProjectedEntity({ entityType: 'artifact', entityId: result.artifactId, title: result.title,
        artifactKind: 'markdown', currentRevisionId: result.revisionId, presentedRevisionId: result.revisionId,
        artifactViewId: result.viewId, fileRecordId: result.fileRecordId }) });
    return result;
  });
  const ports: NativeMaterialSourcePorts = {
    readCurrent: () => ({ projectId: useLcosShellStore.getState().projectId, canvasId: useCanvasStore.getState().canvasId,
      nodes: useCanvasStore.getState().nodes, refs: useLcosReferenceStore.getState().nodeEntityRefs }),
    readBindings: async () => [], readProjectGraph, claimText, importImage, readImage,
  };
  const prepare = vi.fn((input: Parameters<typeof prepareNativeReferencePick>[0]) => prepareNativeReferencePick(input, ports));
  const recognizer = createReferencePickRecognizer(prepare);
  const click = () => { recognizer.onDown(event(), context); recognizer.onUp?.(event(), context); };
  return { node, receipt, graph, importImage, readImage, readProjectGraph, claimText, prepare, recognizer, click };
}

it('first Ctrl image pick prepares only on release and toggles the confirmed original View without changing source, selection or input', async () => {
  const f = fixture(), before = structuredClone(useCanvasStore.getState().nodes), originalTarget = useLcosShellStore.getState().composerTarget;
  f.recognizer.onDown(event(), context);
  expect(f.prepare).not.toHaveBeenCalled();
  f.recognizer.onUp?.(event(), context);
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(1));
  expect(useLcosReferenceStore.getState().orderedNodeReferences()[0]).toMatchObject({
    entityType: 'artifact', entityId: 'real-artifact', artifactViewId: 'real-view', revisionId: 'real-revision', mimeType: 'image/png' });
  expect(useCanvasStore.getState().nodes).toEqual(before);
  expect(useLcosShellStore.getState().composerTarget).toBe(originalTarget);
  f.click();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(f.importImage).toHaveBeenCalledTimes(1);
});
it('first native text pick uses its actual body and the existing carrier claim, with no placeholder identity or editor focus', async () => {
  const f = fixture('text'), before = structuredClone(useCanvasStore.getState().nodes);
  f.click();
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(1));
  expect(f.claimText).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', canvasId: 'canvas', nodeId: 'source', body: '原始正文', focus: false });
  expect(useLcosReferenceStore.getState().orderedNodeReferences()[0]).toMatchObject({ entityId: 'text-artifact',
    artifactViewId: 'text-view', revisionId: 'text-revision', mimeType: 'text/markdown' });
  expect(useCanvasStore.getState().nodes).toEqual(before);
  expect(f.importImage).not.toHaveBeenCalled();
});
it('Ctrl drag and pointer cancellation never start a material write', () => {
  const f = fixture();
  f.recognizer.onDown(event(), context);
  f.recognizer.onMove?.(event({ clientX: 60 }), context);
  f.recognizer.onUp?.(event({ clientX: 60 }), context);
  f.recognizer.onDown(event(), context); f.recognizer.onCancel?.(event(), context);
  expect(f.prepare).not.toHaveBeenCalled();
});
it('body edits between press and release cancel the captured source instead of claiming the newer or stale text', () => {
  const f = fixture('text');
  f.recognizer.onDown(event(), context);
  useCanvasStore.setState({ nodes: useCanvasStore.getState().nodes.map(node => node.id === 'source' ? { ...node, data: { ...node.data, content: '新正文' } } : node) });
  f.recognizer.onUp?.(event(), context);
  expect(f.prepare).not.toHaveBeenCalled();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
});
it('closing and reopening the same input during a read cancels permanently and never writes after that switch', async () => {
  const f = fixture(), pending = deferred<typeof f.graph>();
  f.readProjectGraph.mockReturnValueOnce(pending.promise);
  f.click();
  await vi.waitFor(() => expect(f.readProjectGraph).toHaveBeenCalledOnce());
  useLcosShellStore.getState().closeComposer(); useLcosShellStore.getState().openComposer(target);
  pending.resolve(f.graph);
  await vi.waitFor(() => expect(f.prepare.mock.results[0]?.value).toBeDefined());
  await expect(f.prepare.mock.results[0]?.value).rejects.toThrow('现场已变化');
  expect(f.importImage).not.toHaveBeenCalled();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
});
it('switching input after upload begins preserves the saved outcome but does not attach it to the new draft', async () => {
  const f = fixture(), pending = deferred<typeof f.receipt>(), original = structuredClone(useCanvasStore.getState().nodes);
  f.importImage.mockReturnValueOnce(pending.promise);
  f.click();
  await vi.waitFor(() => expect(f.importImage).toHaveBeenCalledOnce());
  useLcosShellStore.getState().openComposer({ ...target, nodeId: 'other-receiver' });
  pending.resolve(f.receipt);
  await expect(f.prepare.mock.results[0]?.value).rejects.toThrow('现场已变化');
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(useCanvasStore.getState().nodes).toEqual(original);
  expect(useLcosShellStore.getState().composerTarget?.nodeId).toBe('other-receiver');
  expect(f.importImage).toHaveBeenCalledTimes(1);
});
it('repeated click while preparing cannot duplicate an import or invert the pending first pick', async () => {
  const f = fixture(), pending = deferred<typeof f.receipt>();
  f.importImage.mockReturnValueOnce(pending.promise);
  f.click();
  await vi.waitFor(() => expect(f.importImage).toHaveBeenCalledOnce());
  f.click();
  expect(f.prepare).toHaveBeenCalledTimes(1);
  pending.resolve(f.receipt);
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(1));
  expect(f.importImage).toHaveBeenCalledTimes(1);
});
it('a saved file without a confirmed original carrier binding keeps the input and does not advertise a usable reference', async () => {
  const f = fixture(), before = structuredClone(useCanvasStore.getState().nodes);
  f.importImage.mockResolvedValueOnce({ ...f.receipt, binding: undefined });
  f.click();
  await vi.waitFor(() => expect(f.prepare.mock.results[0]?.value).toBeDefined());
  await expect(f.prepare.mock.results[0]?.value).rejects.toThrow('材料已保存');
  expect(useLcosReferenceStore.getState().nodeEntityRefs.has('source')).toBe(false);
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(useCanvasStore.getState().nodes).toEqual(before);
});
it('keeps user pick order when a slow unbound image precedes an already-bound material', async () => {
  const f = fixture(), pending = deferred<typeof f.receipt>();
  const second: Node = { id: 'second', type: 'text', position: { x: 600, y: 60 }, data: { content: '正文二' } };
  useCanvasStore.setState({ nodes: [...useCanvasStore.getState().nodes, second] });
  useLcosReferenceStore.getState().registerNodeEntity('second', { entityType: 'artifact', entityId: 'artifact-second',
    artifactViewId: 'view-second', revisionId: 'revision-second' });
  f.importImage.mockReturnValueOnce(pending.promise);
  f.click();
  await vi.waitFor(() => expect(f.importImage).toHaveBeenCalledOnce());
  hit.id = 'second'; f.click();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(useLcosReferenceStore.getState().referenceInputOperations.size).toBe(2);
  pending.resolve(f.receipt);
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(2));
  expect(useLcosReferenceStore.getState().orderedNodeReferences().map(ref => ref.entityId)).toEqual(['real-artifact', 'artifact-second']);
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().referenceInputOperations.size).toBe(0));
});
it('serializes two different first native picks in click order without placeholder references or duplicate sources', async () => {
  const f = fixture(), pending = deferred<typeof f.receipt>();
  useCanvasStore.setState({ nodes: [...useCanvasStore.getState().nodes, { ...f.node, id: 'second', position: { x: 600, y: 60 } }] });
  const secondArtifact = { ...f.receipt.artifact, id: 'artifact-second' as typeof f.receipt.artifact.id,
    currentRevisionId: 'revision-second' as typeof f.receipt.revision.id };
  const secondReceipt = { ...f.receipt, artifact: secondArtifact,
    revision: { ...f.receipt.revision, id: secondArtifact.currentRevisionId, artifactId: secondArtifact.id },
    view: { ...f.receipt.view, id: 'view-second' as typeof f.receipt.view.id, artifactId: secondArtifact.id, revisionId: secondArtifact.currentRevisionId },
    binding: { ...f.receipt.binding, spatialId: 'second', entityId: String(secondArtifact.id) } };
  f.importImage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(secondReceipt);
  f.click();
  hit.id = 'second'; f.click();
  await vi.waitFor(() => expect(f.importImage).toHaveBeenCalledOnce());
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  pending.resolve(f.receipt);
  await expect(f.prepare.mock.results[0]?.value).resolves.toMatchObject({artifactViewId:'real-view'});
  await vi.waitFor(() => expect(f.prepare).toHaveBeenCalledTimes(2));
  await expect(f.prepare.mock.results[1]?.value).resolves.toMatchObject({artifactViewId:'view-second'});
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(2));
  expect(useLcosReferenceStore.getState().orderedNodeReferences().map(ref => ref.artifactViewId)).toEqual(['real-view', 'view-second']);
  expect(f.importImage.mock.calls.map(call => call[1].nativeCarrier?.spatialId)).toEqual(['source', 'second']);
});
it('a current sending owner blocks both native preparation and reference mutation until that send finishes', async () => {
  const f = fixture();
  const shell = useLcosShellStore.getState();
  const owner = referencePickOwnerKey(shell.projectId, shell.composerTarget);
  if (!owner) throw new Error('No input owner');
  const token = useLcosReferenceStore.getState().beginReferenceInputOperation(owner, 'sending');
  f.click();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  useLcosReferenceStore.getState().finishReferenceInputOperation(token);
  f.click();
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(1));
});
it('the same receiver advancing to another message cancels a pending first pick before any write', async () => {
  const f = fixture(), pending = deferred<typeof f.graph>();
  useLcosShellStore.getState().openComposer({ ...target, intent: 'continue', receiverConversationId: 'conversation',
    continuationOperationId: 'operation', messageId: 'message-one' });
  f.readProjectGraph.mockReturnValueOnce(pending.promise);
  f.click();
  await vi.waitFor(() => expect(f.readProjectGraph).toHaveBeenCalledOnce());
  const currentTarget = useLcosShellStore.getState().composerTarget;
  if (!currentTarget) throw new Error('No continuation input');
  useLcosShellStore.getState().clearSubmittedComposerPrompt('p', currentTarget, useLcosShellStore.getState().composerPrompt);
  pending.resolve(f.graph);
  await expect(f.prepare.mock.results[0]?.value).rejects.toThrow('现场已变化');
  expect(f.importImage).not.toHaveBeenCalled();
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
});

it('a canceled old input read cannot block first pick in another input', async () => {
  const f = fixture(), pending = deferred<typeof f.graph>();
  useCanvasStore.setState({ nodes: [...useCanvasStore.getState().nodes, { ...f.node, id: 'second', position: { x: 600, y: 60 } }] });
  f.readProjectGraph.mockReturnValueOnce(pending.promise);
  f.importImage.mockResolvedValueOnce({ ...f.receipt, binding: { ...f.receipt.binding, spatialId: 'second' } });
  f.click();
  await vi.waitFor(() => expect(f.readProjectGraph).toHaveBeenCalledOnce());
  useLcosShellStore.getState().openComposer({ ...target, nodeId: 'new-input' });
  hit.id = 'second'; f.click();
  await vi.waitFor(() => expect(f.importImage).toHaveBeenCalledOnce());
  expect(f.importImage.mock.calls[0]?.[1].nativeCarrier?.spatialId).toBe('second');
  await vi.waitFor(() => expect(useLcosReferenceStore.getState().orderedNodeReferences()).toHaveLength(1));
  pending.resolve(f.graph);
  await expect(f.prepare.mock.results[0]?.value).rejects.toThrow('现场已变化');
  expect(f.importImage).toHaveBeenCalledTimes(1);
  expect(useLcosShellStore.getState().composerTarget?.nodeId).toBe('new-input');
});
