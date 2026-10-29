import { expect, it, vi } from 'vitest';

import { resolveRailwayNativeTextSources } from './resolveRailwayNativeTextSources';

import type { RailwayNativeTextSourcePorts } from './resolveRailwayNativeTextSources';
import type { CanvasTextSnapshot, EntityRefLike, ProjectionBinding } from '@local-creative-os/web-gen2';
import type { Node } from '@xyflow/react';

const input = { projectId: 'p', canvasId: 'source-canvas', sourceRefs: [{ kind: 'artifactView' as const, id: 'png-view' }],
  nativeTextSources: [{ nodeId: 'original-note', nodeType: 'note' as const, body: '' }] };
function fixture() {
  let nodes: Node[] = [{ id: 'original-note', type: 'note', position: { x: 250, y: 160 },
    data: { origin: { type: 'ai-operate' }, label: '决策', content: '' } }];
  const refs = new Map<string, EntityRefLike>();
  let bindings: ProjectionBinding[] = [];
  let projectId = 'p', canvasId = 'source-canvas';
  const reply: CanvasTextSnapshot = { projectId, canvasId, spatialId: 'original-note', body: '',
    artifactId: 'new-native-text', viewId: 'new-native-view', revisionId: 'new-native-revision', fileRecordId: 'new-native-file', title: '文本' };
  const claimProducer = vi.fn<RailwayNativeTextSourcePorts['claimProducer']>(async request => {
    refs.set(request.nodeId, { entityType: 'artifact', entityId: reply.artifactId });
    return { ...reply, spatialId: request.nodeId, body: request.body };
  });
  const readBindings = vi.fn<RailwayNativeTextSourcePorts['readBindings']>(async () => bindings);
  const ports: RailwayNativeTextSourcePorts = { readCurrent: () => ({ projectId, canvasId, nodes, refs }), readBindings, claimProducer };
  return { ports, nodes: () => nodes, refs, reply, claimProducer, readBindings,
    updateNodes: (next: Node[]) => { nodes = next; }, bind: (next: ProjectionBinding[]) => { bindings = next; },
    changeScene: () => { projectId = 'other-project'; canvasId = 'other-canvas'; } };
}

it('registers the selected empty Native note at its original address without guessing the same-label artifact or creating another carrier', async () => {
  const f = fixture(); const original = structuredClone(f.nodes());
  const result = await resolveRailwayNativeTextSources(input, f.ports);
  expect(f.claimProducer).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', canvasId: 'source-canvas',
    nodeId: 'original-note', body: '', focus: false });
  expect(result.sourceRefs).toEqual([{ kind: 'artifactView', id: 'png-view' }, { kind: 'artifactView', id: 'new-native-view' }]);
  expect(result.capturedRevisionIdsBySource).toEqual({ 'new-native-view': 'new-native-revision' });
  expect(result.byNodeId.get('original-note')).toEqual({ sourceRef: { kind: 'artifactView', id: 'new-native-view' },
    reference: { entityType: 'artifact', entityId: 'new-native-text', artifactViewId: 'new-native-view', revisionId: 'new-native-revision' } });
  expect(f.nodes()).toEqual(original);
  expect(JSON.stringify(result)).not.toContain('artifact-decision');
});

it('preserves exact Native text whitespace and body rather than using its label as a new body', async () => {
  const f = fixture(); const body = '  # Real text\n\n真实正文\n';
  f.updateNodes([{ ...f.nodes()[0], id: 'text', type: 'text', position: { x: 40, y: 50 }, data: { label: '决策', content: body } }]);
  await resolveRailwayNativeTextSources({ ...input, nativeTextSources: [{ nodeId: 'text', nodeType: 'text', body }] }, f.ports);
  expect(f.claimProducer.mock.calls[0]?.[0].body).toBe(body);
  expect(f.nodes()[0]?.data.content).toBe(body);
});

it('prevalidates the complete native batch and never registers a supported subset when one carrier is missing or changed', async () => {
  const f = fixture();
  await expect(resolveRailwayNativeTextSources({ ...input, nativeTextSources: [...input.nativeTextSources,
    { nodeId: 'missing', nodeType: 'text', body: 'Unknown' }] }, f.ports)).rejects.toThrow('整组未登记');
  expect(f.claimProducer).not.toHaveBeenCalled();
  f.updateNodes([{ ...f.nodes()[0], id: 'original-note', position: { x: 250, y: 160 }, data: { content: 'new body' } }]);
  await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('整组未登记');
  expect(f.claimProducer).not.toHaveBeenCalled();
});

it('does not adopt already-bound local or persisted identities, including a binding missed by the local ref cache', async () => {
  const local = fixture(); local.refs.set('original-note', { entityType: 'artifact', entityId: 'foreign-material' });
  await expect(resolveRailwayNativeTextSources(input, local.ports)).rejects.toThrow('已有材料身份');
  expect(local.claimProducer).not.toHaveBeenCalled();
  const persistent = fixture(); persistent.bind([{ projectId: 'p', canvasId: 'source-canvas', spatialKind: 'node',
    spatialId: 'original-note', entityType: 'artifact', entityId: 'artifact-decision' }]);
  await expect(resolveRailwayNativeTextSources(input, persistent.ports)).rejects.toThrow('正式材料绑定');
  expect(persistent.claimProducer).not.toHaveBeenCalled();
});

it('rechecks both binding and current body after the asynchronous binding read before invoking the producer', async () => {
  const f = fixture();
  f.readBindings.mockImplementationOnce(async () => [])
    .mockImplementationOnce(async () => [{ projectId: 'p', canvasId: 'source-canvas', spatialKind: 'node',
      spatialId: 'original-note', entityType: 'artifact', entityId: 'new-owner' }]);
  await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('正式材料绑定');
  expect(f.claimProducer).not.toHaveBeenCalled();
});

it('refuses missing sidecar content, image carriers and unsupported ordinary sources before adopting any text', async () => {
  for (const node of [{ id: 'original-note', type: 'note', position: { x: 0, y: 0 }, data: { content: '', contentMissing: true } },
    { id: 'original-note', type: 'image', position: { x: 0, y: 0 }, data: { content: '' } }]) {
    const f = fixture(); f.updateNodes([node]);
    await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('整组未登记');
    expect(f.claimProducer).not.toHaveBeenCalled();
  }
  const f = fixture();
  await expect(resolveRailwayNativeTextSources({ ...input, sourceRefs: [{ kind: 'workflow', id: 'method' }] }, f.ports))
    .rejects.toThrow('未登记任何原生文本');
  expect(f.claimProducer).not.toHaveBeenCalled();
});

it('does not accept a different address, body or foreign replacement after claim and does not automatically repeat a failed claim', async () => {
  for (const extra of [{ canvasId: 'other' }, { spatialId: 'other' }, { body: 'not captured' }]) {
    const f = fixture(); f.claimProducer.mockResolvedValue({ ...f.reply, ...extra });
    await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('回执或节点身份未确认');
    expect(f.claimProducer).toHaveBeenCalledTimes(1);
  }
  const f = fixture(); f.claimProducer.mockRejectedValue(new Error('Lost response'));
  await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('Lost response');
  expect(f.claimProducer).toHaveBeenCalledTimes(1);
});

it('stops when project/canvas or cancellation changes without writing into another scene', async () => {
  const f = fixture(); f.readBindings.mockImplementation(async () => { f.changeScene(); return []; });
  await expect(resolveRailwayNativeTextSources(input, f.ports)).rejects.toThrow('现场已变化');
  expect(f.claimProducer).not.toHaveBeenCalled();
  const cancelled = fixture(); const controller = new AbortController(); controller.abort();
  await expect(resolveRailwayNativeTextSources(input, cancelled.ports, controller.signal)).rejects.toThrow('现场已变化');
  expect(cancelled.claimProducer).not.toHaveBeenCalled();
});
