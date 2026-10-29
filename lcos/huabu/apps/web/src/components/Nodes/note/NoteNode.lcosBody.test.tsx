import { act, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { NoteNode, type NoteNodeType } from './NoteNode';

import type { NodeProps } from '@xyflow/react';

const seam = vi.hoisted(() => ({ mode: 'lcos', body: undefined as ComponentType | undefined }));
vi.mock('@xyflow/react', () => ({ useStore: (selector: (s: unknown) => unknown) => selector({ transform: [0, 0, 1] }) }));
vi.mock('@/lcos-seam/nodeBodySlot', () => ({ useResolvedNodeBody: () => seam.body }));
vi.mock('@/lcos-seam/chromeModeSlot', () => ({ useCanvasChromeMode: () => seam.mode }));
vi.mock('@/components/Common/Loading', () => ({ Loading: () => <span /> }));
vi.mock('@/hooks/useNodeLOD', () => ({ useNodeLOD: () => 'full' }));
vi.mock('@/hooks/useNodeScale', () => ({ useNodeScale: () => 1 }));
vi.mock('./heightMemory', () => ({ useTrackNoteFixedHeight: () => undefined }));
vi.mock('./useAutoHeightInvariant', () => ({ useAutoHeightInvariant: () => undefined }));
vi.mock('../shared/height/useHeightMode', () => ({ useHeightMode: () => 'fixed' }));
vi.mock('../shared/height/commitQueue', () => ({ cancelMeasuredHeight: vi.fn(), proposeMeasuredHeight: vi.fn() }));
vi.mock('../shared/nodeHydrationScheduler', () => ({ useDeferredHydration: () => true }));
vi.mock('@/store/canvasStore', () => ({ default: (selector: (s: unknown) => unknown) => selector({ updateNodeData: vi.fn(), moveNoteBlockIntoNote: vi.fn(), canvasId: null }) }));
vi.mock('@/components/Milkdown', () => ({ MilkdownPreview: ({ markdown }: { markdown: string }) => <div className="ProseMirror">{markdown}</div> }));
vi.mock('../NodeWrapper', () => ({ NodeWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

it('removes native note padding only for an active LCOS body and restores native content on fallback', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const render = () => root.render(<NoteNode {...({ id: 'note-test', data: { type: 'note', content: '原生正文' }, selected: false } as unknown as NodeProps<NoteNodeType>)} />);
  try {
    seam.mode = 'lcos'; seam.body = () => <div data-custom-body>完整物种内容</div>;
    await act(async () => render());
    expect(host.querySelector('[data-note-content-host]')?.classList.contains('p-2')).toBe(false);
    expect(host.querySelector('[data-custom-body]')).not.toBeNull();
    seam.mode = 'huabu'; seam.body = () => <div data-other-host>其它宿主</div>;
    await act(async () => render());
    expect(host.querySelector('[data-note-content-host]')?.classList.contains('p-2')).toBe(true);
    expect(host.querySelector('[data-other-host]')).not.toBeNull();
    seam.mode = 'lcos'; seam.body = undefined;
    await act(async () => render());
    expect(host.querySelector('[data-note-content-host]')?.classList.contains('p-2')).toBe(true);
    expect(host.querySelector('.ProseMirror')?.textContent).toBe('原生正文');
    expect(host.querySelector('[data-custom-body]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});