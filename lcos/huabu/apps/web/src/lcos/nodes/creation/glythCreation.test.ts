import { beforeEach, expect, it, vi } from 'vitest';
import useCanvasStore from '@/store/canvasStore';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { createGlythAtPoint } from './glythCreation';
const compose = vi.hoisted(() => vi.fn());
vi.mock('@/components/Nodes/question/questionCompose', () => ({
  createQuestionNodeAndCompose: compose,
}));
beforeEach(() => {
  compose.mockReset();
  useCanvasStore.setState({
    canvasId: 'canvas-agent',
    nodes: [],
    addNode: vi.fn(),
  });
  useLcosShellStore.setState({ projectId: 'p-agent' });
});
it('creates via the existing native factory and places the exact staged appearance in its own node', () => {
  compose.mockImplementation((opts) => {
    opts.addNode({
      id: 'node-agent',
      nodeType: 'question',
      placementPoint: opts.placementPoint,
      data: { threadId: 'thread-real', content: '' },
    });
    return { nodeId: 'node-agent', threadId: 'thread-real' };
  });
  const appearance = { shape: 'cloud', color: 'cyan', motion: 'idle' as const };
  expect(
    createGlythAtPoint({
      projectId: 'p-agent',
      canvasId: 'canvas-agent',
      position: { x: 32, y: 48 },
      appearance,
    }),
  ).toEqual({ nodeId: 'node-agent', threadId: 'thread-real' });
  expect(useCanvasStore.getState().addNode).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      nodeType: 'question',
      placementPoint: { x: 32, y: 48 },
      data: expect.objectContaining({
        threadId: 'thread-real',
        lcosGlythAppearance: appearance,
      }),
    }),
  );
});
it('does not create an agent in a canvas that changed during placement', () => {
  expect(() =>
    createGlythAtPoint({
      projectId: 'p-old',
      canvasId: 'canvas-agent',
      position: { x: 0, y: 0 },
      appearance: { shape: 'blob', color: 'black', motion: 'idle' },
    }),
  ).toThrow('现场已切换');
  expect(compose).not.toHaveBeenCalled();
});
it('rejects an appearance occupied since keyboard placement was staged', () => {
  const appearance = { shape: 'cloud', color: 'cyan', motion: 'idle' as const };
  useCanvasStore.setState({
    nodes: [
      {
        id: 'existing-agent',
        type: 'question',
        position: { x: 0, y: 0 },
        data: {
          content: '',
          threadId: 'thread-existing',
          lcosGlythAppearance: appearance,
        },
      },
    ],
  });
  expect(() =>
    createGlythAtPoint({
      projectId: 'p-agent',
      canvasId: 'canvas-agent',
      position: { x: 0, y: 0 },
      appearance,
    }),
  ).toThrow('这个形象刚被使用了');
  expect(compose).not.toHaveBeenCalled();
});
