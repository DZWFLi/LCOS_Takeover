import { afterEach, beforeEach, expect, it } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createNativeCanvasDropHost } from './nativeCanvasDropHost';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { Node, NodeChange } from '@xyflow/react';

let host: ReturnType<typeof createNativeCanvasDropHost> | undefined;
const node: Node = { id: 'material-one', type: 'note', data: {}, position: { x: 40, y: 80 }, selected: true };
beforeEach(() => {
  useLcosDropStore.getState().reset();
  useLcosShellStore.setState({ projectId: 'p' });
  useLcosReferenceStore.getState().reset();
  useLcosReferenceStore.getState().setProject('p');
  useLcosReferenceStore.getState().beginNodeBindingRead('p', 'canvas-one');
  useLcosReferenceStore.getState().registerNodeEntity(node.id, { entityType: 'note', entityId: 'note-one' });
  useCanvasStore.setState({ canvasId: 'canvas-one', isLoading: false, nodes: [node] });
  useLcosDropStore.getState().registerTarget({
    targetId: 'conversation:two', kind: 'collaboration-reference', label: '已有会话',
    enabled: true, priority: 20, rect: { left: 300, top: 180, width: 100, height: 100 },
    semantic: { kind: 'collaboration-reference', conversationId: 'conversation-two' },
  });
  host = createNativeCanvasDropHost('p');
});
afterEach(() => { host?.dispose(); host = undefined; useLcosDropStore.getState().reset(); });

it('a normal RF left move over an eligible receiver stays with native geometry and never acquires a semantic payload', () => {
  const start = new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 80, clientY: 120 });
  const overReceiver = new MouseEvent('mousemove', { buttons: 1, clientX: 330, clientY: 210 });
  const release = new MouseEvent('mouseup', { button: 0, clientX: 330, clientY: 210 });
  host?.onStart(start, node, [node]);
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(host?.onMove(overReceiver, node, [node])).toBe(false);
  const changes: NodeChange[] = [{ id: node.id, type: 'position', position: { x: 250, y: 170 }, dragging: true }];
  expect(host?.filterChanges(changes)).toEqual(changes);
  expect(host?.onStop(release, node, [node])).toBe(false);
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(useLcosDropStore.getState().nativeSource).toBeNull();
});
