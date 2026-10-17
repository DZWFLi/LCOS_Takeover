import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasShortcuts } from '@/hooks/shortcuts/useCanvasShortcuts';
import useCanvasStore from '@/store/canvasStore';

import { claimProjectText, createProjectText } from './projectTextCreation';
import { useLcosReferenceStore } from '../../lcosReferenceState';

import type { CanvasTextSnapshot } from '@local-creative-os/web-gen2';

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), structure: vi.fn() }));
vi.mock('../../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ artifacts: { readCanvasText: m.read, saveCanvasText: m.save } }) }));
const reply = (nodeId: string): CanvasTextSnapshot => ({ projectId: 'p-text', canvasId: 'canvas-text', spatialId: nodeId, artifactId: 'artifact-text',
  viewId: 'view-text', revisionId: 'revision-text', fileRecordId: 'file-text', title: 'Text', body: '' });
beforeEach(() => {
  m.read.mockReset(); m.save.mockReset(); m.structure.mockReset(); m.structure.mockResolvedValue(true); m.read.mockResolvedValue(null);
  useCanvasStore.getState()._setStateNoAutosave({ canvasId: 'canvas-text', nodes: [], edges: [], saveCanvas: m.structure });
  useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('p-text');
});
describe('project text creation through the existing carrier producer', () => {
  it('creates one native carrier and binds that same id before requesting the canonical inline editor', async () => {
    m.save.mockImplementation((_projectId: string, input: { spatialId: string }) => Promise.resolve(reply(input.spatialId)));
    const saved = await createProjectText({ projectId: 'p-text', canvasId: 'canvas-text', nodeType: 'note', position: { x: 200, y: 100 } });
    const nodes = useCanvasStore.getState().nodes;
    expect(nodes).toHaveLength(1); expect(nodes[0]?.id).toBe(saved.spatialId);
    expect(m.structure).toHaveBeenCalledOnce();
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get(saved.spatialId)).toMatchObject({ entityType: 'artifact', entityId: saved.artifactId,
      descriptor: { managed: true, currentRevisionId: saved.revisionId } });
    expect(useCanvasStore.getState().pendingInlineEditNodeId).toBe(saved.spatialId);
    expect(nodes[0]?.data.lcosProjectTextCreating).toBe(false);
    useCanvasStore.getState()._setStateNoAutosave({ canvasId: undefined });
  });
  it('native LCOS plain-text paste also creates a real identity before opening inline editing', async () => {
    m.save.mockImplementation((_projectId:string, sent:{spatialId:string;body:string})=>Promise.resolve({...reply(sent.spatialId),body:sent.body}));
    const Owner=()=>{useCanvasShortcuts({rfInstanceRef:{current:null},mousePositionRef:{current:{x:0,y:0}}},{chromeMode:'lcos'});return null;};
    const mount=document.createElement('div');document.body.appendChild(mount);const root=createRoot(mount);
    act(()=>root.render(createElement(Owner)));
    const event=new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{files:[],items:[],getData:(type:string)=>type==='text/plain'?'真实粘贴正文':''}});
    await act(async()=>{window.dispatchEvent(event);await new Promise((resolve)=>setTimeout(resolve,0));});
    const node=useCanvasStore.getState().nodes[0];if(!node)throw new Error('No pasted carrier');
    expect(m.save.mock.calls[0]?.[1].body).toBe('真实粘贴正文');
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get(node.id)?.entityId).toBe('artifact-text');
    expect(node.data.origin).toEqual({type:'user-pasted'});
    expect(useCanvasStore.getState().pendingInlineEditNodeId).toBe(node.id);
    act(()=>root.unmount());mount.remove();useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined});
  });
  it('keeps a failed creation carrier and checks a later confirmed reply without creating another node or revision', async () => {
    m.save.mockRejectedValue(new Error('Reply unknown'));
    await expect(createProjectText({ projectId: 'p-text', canvasId: 'canvas-text', position: { x: 0, y: 0 } })).rejects.toThrow('Reply unknown');
    const node = useCanvasStore.getState().nodes[0]; if (!node) throw new Error('Carrier lost');
    expect(node.data.lcosProjectTextCreateError).toBe('Reply unknown');
    expect(useLcosReferenceStore.getState().nodeEntityRefs.has(node.id)).toBe(false);
    m.read.mockResolvedValue(reply(node.id));
    await claimProjectText({ projectId: 'p-text', canvasId: 'canvas-text', nodeId: node.id, body: '' });
    expect(useCanvasStore.getState().nodes).toHaveLength(1); expect(m.save).toHaveBeenCalledTimes(1);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get(node.id)?.entityId).toBe('artifact-text');
    useCanvasStore.getState()._setStateNoAutosave({ canvasId: undefined });
  });
});

function deferredClaimResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

/** Use the production carrier owner; no second text node or fake binding. */
function nativeClaimInput(body: string) {
  useCanvasStore.getState().addNode({ nodeType: 'text', placementPoint: { x: 160, y: 120 }, data: {
    content: body, lcosProjectTextCreating: true,
  } });
  const node = useCanvasStore.getState().nodes[0];
  if (!node) throw new Error('Native text carrier was not created.');
  useCanvasStore.getState()._setStateNoAutosave({ pendingInlineEditNodeId: null });
  return { projectId: 'p-text', canvasId: 'canvas-text', nodeId: node.id, body };
}

describe('native text claim cancellation before and after canonical persistence', () => {
  afterEach(() => {
    useCanvasStore.getState()._setStateNoAutosave({ canvasId: undefined, pendingInlineEditNodeId: null });
  });

  it('does not save the canvas or PUT text when cancelled while reading the existing identity', async () => {
    const input = nativeClaimInput('等待读取时保留的原文');
    const read = deferredClaimResult<CanvasTextSnapshot | null>();
    const controller = new AbortController();
    m.read.mockReturnValue(read.promise);
    const task = claimProjectText(input, { signal: controller.signal });
    const rejected = expect(task).rejects.toThrow('取用现场或正文已变化');
    expect(m.read).toHaveBeenCalledWith('p-text', { canvasId: 'canvas-text', spatialId: input.nodeId }, controller.signal);
    controller.abort();
    read.resolve(null);
    await rejected;
    expect(m.structure).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe(input.body);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.has(input.nodeId)).toBe(false);
    expect(useCanvasStore.getState().pendingInlineEditNodeId).toBeNull();
  });

  it('does not PUT text after the active input changes while the original canvas is saving', async () => {
    const input = nativeClaimInput('画布保存等待中的原文');
    const saveCanvas = deferredClaimResult<boolean>();
    let inputKey = 'composer-before';
    m.structure.mockReturnValue(saveCanvas.promise);
    const task = claimProjectText(input, { isCurrent: () => inputKey === 'composer-before' });
    const rejected = expect(task).rejects.toThrow('取用现场或正文已变化');
    await vi.waitFor(() => expect(m.structure).toHaveBeenCalledOnce());
    inputKey = 'composer-after';
    saveCanvas.resolve(true);
    await rejected;
    expect(m.save).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe(input.body);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.has(input.nodeId)).toBe(false);
    expect(useCanvasStore.getState().pendingInlineEditNodeId).toBeNull();
  });

  it('does not write the captured old body when the real carrier text changes during the identity read', async () => {
    const input = nativeClaimInput('捕获时的旧正文');
    const read = deferredClaimResult<CanvasTextSnapshot | null>();
    m.read.mockReturnValue(read.promise);
    const task = claimProjectText(input, { isCurrent: () => true });
    const rejected = expect(task).rejects.toThrow('取用现场或正文已变化');
    useCanvasStore.getState()._setStateNoAutosave({ nodes: useCanvasStore.getState().nodes.map((node) =>
      node.id === input.nodeId ? { ...node, data: { ...node.data, content: '用户最新的正文' } } : node) });
    read.resolve(null);
    await rejected;
    expect(m.structure).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe('用户最新的正文');
    expect(useLcosReferenceStore.getState().nodeEntityRefs.has(input.nodeId)).toBe(false);
  });

  it('retains a confirmed PUT result and its original carrier binding after cancellation without opening inline editing', async () => {
    const input = nativeClaimInput('已发出保存并保留的正文');
    const saveText = deferredClaimResult<CanvasTextSnapshot>();
    const controller = new AbortController();
    m.save.mockReturnValue(saveText.promise);
    const task = claimProjectText(input, { signal: controller.signal });
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledOnce());
    expect(m.save).toHaveBeenCalledWith('p-text', { canvasId: 'canvas-text', spatialId: input.nodeId,
      body: input.body, expectedRevisionId: null });
    controller.abort();
    const confirmed = { ...reply(input.nodeId), body: input.body };
    saveText.resolve(confirmed);
    await expect(task).resolves.toEqual(confirmed);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]?.id).toBe(input.nodeId);
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe(input.body);
    expect(useCanvasStore.getState().nodes[0]?.data.lcosProjectTextCreating).toBe(false);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get(input.nodeId)).toMatchObject({
      entityType: 'artifact', entityId: confirmed.artifactId,
      descriptor: { artifactViewId: confirmed.viewId, currentRevisionId: confirmed.revisionId },
    });
    expect(useCanvasStore.getState().pendingInlineEditNodeId).toBeNull();
    expect(m.save).toHaveBeenCalledOnce();
  });
});
