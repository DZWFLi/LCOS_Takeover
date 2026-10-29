import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useCanvasStore from '@/store/canvasStore';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import {
  appearanceKey,
  type GlythAppearance,
} from '../../ui/glyth/glythAppearance';
import { GlythCreationSlot } from './GlythCreationSlot';
const m = vi.hoisted(() => ({
  created: vi.fn(),
  done: vi.fn(),
  occupied: [] as GlythAppearance[],
}));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({
      x: x - 10,
      y: y - 20,
    }),
  }),
}));
vi.mock('./glythCreation', () => ({
  occupiedGlythAppearances: () => m.occupied,
  createGlythAtPoint: (input: unknown) => m.created(input),
}));
vi.mock('../../ui/glyth/GlythBodyView', () => ({
  GlythBodyView: () => <svg />,
}));
vi.mock('../../ui/materials/SpectralMaterial', () => ({
  SpectralMaterial: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
let host: HTMLDivElement,
  canvas: HTMLDivElement,
  pane: HTMLDivElement,
  root: Root;
function transfer() {
  return {
    types: [] as string[],
    effectAllowed: '',
    dropEffect: '',
    setData(type: string) {
      this.types.push(type);
    },
    setDragImage: vi.fn(),
  };
}
async function drag(
  target: Element,
  type: string,
  data: ReturnType<typeof transfer>,
) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, {
    dataTransfer: { value: data },
    clientX: { value: 150 },
    clientY: { value: 100 },
  });
  await act(async () => target.dispatchEvent(e));
  return e;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  m.created.mockReset();
  m.done.mockReset();
  m.occupied = [];
  useCanvasStore.setState({ canvasId: 'canvas-test', nodes: [] });
  useLcosShellStore.setState({ projectId: 'project-test' });
  host = document.createElement('div');
  canvas = document.createElement('div');
  canvas.className = 'react-flow';
  pane = document.createElement('div');
  pane.className = 'react-flow__pane';
  canvas.append(pane);
  document.body.append(host, canvas);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <GlythCreationSlot
        canvasElement={() => canvas}
        disabled={false}
        onCreated={m.done}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  canvas.remove();
  vi.unstubAllGlobals();
});
it('refreshes only the staged visual, without creating a node or conversation', async () => {
  const before = host
    .querySelector('[data-lcos-glyth-candidate]')!
    .getAttribute('data-lcos-glyth-candidate');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="刷新智能体形象"]')!
      .click(),
  );
  expect(
    host
      .querySelector('[data-lcos-glyth-candidate]')!
      .getAttribute('data-lcos-glyth-candidate'),
  ).not.toBe(before);
  expect(m.created).not.toHaveBeenCalled();
});
it('releases outside the canvas without creating, and cannot resurrect the expired drag', async () => {
  const dt = transfer();
  await drag(host.querySelector('[draggable]')!, 'dragstart', dt);
  await drag(document.body, 'drop', dt);
  await drag(pane, 'drop', dt);
  expect(m.created).not.toHaveBeenCalled();
});
it('drops once at native world coordinates and preserves the exact preview appearance', async () => {
  const body = host.querySelector('[draggable]')!;
  const preview = body.getAttribute('data-lcos-glyth-candidate');
  const dt = transfer();
  await drag(body, 'dragstart', dt);
  expect((await drag(pane, 'dragover', dt)).defaultPrevented).toBe(true);
  await drag(pane, 'drop', dt);
  await drag(pane, 'drop', dt);
  expect(m.created).toHaveBeenCalledOnce();
  const input = m.created.mock.calls[0]![0] as {
    appearance: GlythAppearance;
    position: { x: number; y: number };
  };
  expect(appearanceKey(input.appearance)).toBe(preview);
  expect(input.position).toEqual({ x: 140, y: 80 });
  expect(m.done).toHaveBeenCalledOnce();
});
it('rejects an appearance that became occupied while the user was dragging', async () => {
  const body = host.querySelector('[draggable]')!,
    dt = transfer();
  await drag(body, 'dragstart', dt);
  const [shape, color, motion] = body
    .getAttribute('data-lcos-glyth-candidate')!
    .split('/');
  m.occupied = [
    { shape: shape!, color: color!, motion: motion as 'idle' | 'curious' },
  ];
  await drag(pane, 'drop', dt);
  expect(m.created).not.toHaveBeenCalled();
  expect(host.textContent).toContain('刚被使用');
});
