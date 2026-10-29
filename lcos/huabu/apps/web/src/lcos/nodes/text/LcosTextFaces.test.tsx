import { ReactFlowProvider } from '@xyflow/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { LcosTextFaces } from './LcosTextFaces';

import type * as ReactI18next from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof ReactI18next>(),
  useTranslation: () => ({ t: (key: string) => key }) }));
const body = '# Main\n## Branch\n### Child\n\nCanonical paragraph';
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  useCanvasStore.setState({ canvasId: undefined, nodes: [{ id: 'text-a', type: 'note', position: { x: 50, y: 50 }, data: { content: body } }], edges: [] });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<ReactFlowProvider><LcosTextFaces nodeId="text-a" markdown={body} title="Main" density="reading"><div>Canonical paragraph</div></LcosTextFaces></ReactFlowProvider>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const mode = (value: string) => act(() => host.querySelector<HTMLButtonElement>(`[data-lcos-text-face-mode="${value}"]`)?.click());

describe('same canonical body, three presentation faces', () => {
  it('shares collapses between outline and mindmap without editing text, changing ids or moving the node', () => {
    mode('outline');
    expect(host.querySelector('[role="tree"]')?.textContent).toContain('Child');
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="折叠 Branch"]')?.click());
    expect(host.querySelector('[role="tree"]')?.textContent).not.toContain('Child');
    mode('mindmap'); expect(host.querySelector('.lcos-text-mindmap')?.textContent).not.toContain('Child');
    act(() => host.querySelector<HTMLButtonElement>('.lcos-text-mindmap button[aria-label="展开 Branch"]')?.click());
    expect(host.querySelector('.lcos-text-mindmap')?.textContent).toContain('Child');
    mode('text'); expect(host.textContent).toContain('Canonical paragraph');
    const current = useCanvasStore.getState().nodes[0];
    if (!current) throw new Error('The source node was removed');
    expect(current.id).toBe('text-a'); expect(current.position).toEqual({ x: 50, y: 50 }); expect(current.data.content).toBe(body);
    expect(current.data.lcosTextCollapsedIds).toEqual([]);
  });
  it('keeps rendering the updated canonical body instead of retaining another text copy', () => {
    mode('outline');
    act(() => root.render(<ReactFlowProvider><LcosTextFaces nodeId="text-a" markdown="# Changed\n## New section" title="Changed" density="reading"><div>New body</div></LcosTextFaces></ReactFlowProvider>));
    expect(host.querySelector('[role="tree"]')?.textContent).toContain('New section');
    expect(host.querySelector('[role="tree"]')?.textContent).not.toContain('Branch');
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe(body);
  });
});
