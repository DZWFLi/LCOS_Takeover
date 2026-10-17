import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { CollectionMembersMenu } from './CollectionMembersMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('arranges only through an explicit member menu action and keeps semantic removal separate', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const arrange = vi.fn(() => true), remove = vi.fn(), refresh = vi.fn();
  try {
    act(() => root.render(<CollectionMembersMenu title="素材" members={[]} status="ready"
      refresh={refresh} remove={remove} onArrange={arrange} />));
    expect(arrange).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('[data-lcos-collection-members-open]')?.click());
    expect(arrange).not.toHaveBeenCalled();
    const button = document.querySelector<HTMLButtonElement>('[data-lcos-collection-arrange]');
    expect(button?.textContent).toBe('排列画布成员');
    await act(async () => button?.click());
    expect(arrange).toHaveBeenCalledExactlyOnceWith();
    expect(document.querySelector('[data-lcos-collection-member-notice]')?.textContent).toContain('可撤销');
    expect(remove).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('reports real member-read failures and never claims a layout was repaired', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const arrange = vi.fn(async () => { throw new Error('Core members unavailable'); });
  const remove = vi.fn(), refresh = vi.fn();
  try {
    act(() => root.render(<CollectionMembersMenu title="素材" members={[]} status="ready" refresh={refresh} remove={remove} onArrange={arrange} />));
    act(() => host.querySelector<HTMLButtonElement>('[data-lcos-collection-members-open]')?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-lcos-collection-arrange]')?.click());
    expect(document.querySelector('[data-lcos-collection-member-notice]')?.textContent).toContain('成员暂未读到');
    expect(document.querySelector('[data-lcos-collection-member-notice]')?.textContent).not.toContain('已排好');
    expect(remove).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); host.remove(); }
});
