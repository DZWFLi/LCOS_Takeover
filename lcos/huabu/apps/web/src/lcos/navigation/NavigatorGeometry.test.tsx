import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LcosNavigatorIslandView } from '../ui/families/LcosNavigatorIslandView';
import { NavigationHudProvider, useNavigationHudSlot } from './NavigationHudSlot';
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.replaceChildren(); });
it.each([[0,96],[1,140],[3,184],[20,184]])('uses true hug width including the operations entry for %s pins and exposes real overflow', async (count, width) => {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);
  const activate = vi.fn();
  await act(async () => root.render(<LcosNavigatorIslandView state={count ? '彩色标' : '静息'} onCreatePin={() => {}}
    onActivatePin={activate} pins={Array.from({ length: count }, (_, i) => ({ id: String(i), label: `组 ${i}`, tone: 'violet' as const }))} />));
  expect(container.querySelector<HTMLElement>('[data-lcos-family]')!.style.width).toBe(`${width}px`);
  expect(container.querySelector('[data-lcos-nav-part="pin-add"]')).toBeNull();
  if (count === 20) {
    await act(async () => container.querySelector<HTMLButtonElement>('[data-lcos-nav-part="overflow"]')!.click());
    expect(container.querySelectorAll('[data-lcos-pin-overflow] button')).toHaveLength(19);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-lcos-pin-overflow] button')!.click());
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  }
});
it('shares one presentation slot and does not close a different active slot', async () => {
  const container = document.createElement('div'); const root = createRoot(container); roots.push(root);
  let slot: ReturnType<typeof useNavigationHudSlot> | undefined;
  function Probe() { slot = useNavigationHudSlot(); return <span>{slot.active}</span>; }
  await act(async () => root.render(<NavigationHudProvider><Probe /></NavigationHudProvider>));
  await act(async () => slot!.activate('search'));
  await act(async () => slot!.activate('pin'));
  await act(async () => slot!.close('search'));
  expect(container.textContent).toBe('pin');
});
