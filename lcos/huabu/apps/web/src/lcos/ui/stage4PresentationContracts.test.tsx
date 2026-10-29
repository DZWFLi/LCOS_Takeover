import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { ContextCollectionView } from './context/ContextCollectionView';
import { PortalPreviewView } from './professional/PortalPreviewView';
import { WorkflowTaskCardView } from './workflow/WorkflowTaskCardView';

import type { ReactElement } from 'react';

async function render(element: ReactElement): Promise<{ host: HTMLDivElement; unmount: () => void }> {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, unmount: () => root.unmount() };
}

describe('Stage4 presentation adapters keep the production family contract', () => {
  it('keeps Atlas identity selectors while organization remains explicitly unspecified', async () => {
    const view = await render(
      <ContextCollectionView title="Context A" organization="未指定" legacyAtlasKind="collection" />,
    );
    const root = view.host.querySelector('[data-lcos-family="collection-surface"]');
    expect(root?.getAttribute('data-lcos-organize')).toBe('未指定');
    expect(root?.getAttribute('data-lcos-rendition')).toBe('总览');
    expect(root?.getAttribute('data-lcos-atlas-card')).toBe('collection');
    view.unmount();
  });

  it('keeps Workflow task identity and delegates take to the existing caller', async () => {
    const onUse = vi.fn();
    const view = await render(
      <WorkflowTaskCardView
        title="Workflow A"
        state="草稿中"
        legacyWorkflowKind="workflow"
        onUse={onUse}
      />,
    );
    const root = view.host.querySelector('[data-lcos-family="task-card"]');
    expect(root?.getAttribute('data-lcos-variant')).toBe('草稿中');
    expect(root?.getAttribute('data-lcos-workflow-card')).toBe('workflow');
    await act(async () => view.host.querySelector<HTMLButtonElement>('[data-lcos-task-take]')?.click());
    expect(onUse).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('keeps Portal state identity and delegates retry without owning preview truth', async () => {
    const onRetry = vi.fn();
    const view = await render(
      <PortalPreviewView state="预览失败" title="Portal A" onRetry={onRetry} />,
    );
    const root = view.host.querySelector('[data-lcos-family="portal-preview"]');
    expect(root?.getAttribute('data-lcos-variant')).toBe('预览失败');
    await act(async () => [...view.host.querySelectorAll('button')].find((button) => button.textContent === '重试')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
    view.unmount();
  });
});
