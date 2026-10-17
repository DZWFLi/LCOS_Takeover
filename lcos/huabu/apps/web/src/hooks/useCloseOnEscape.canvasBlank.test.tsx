import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { useCloseOnEscape } from './useCloseOnEscape';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Layer({ close, allow = true }: { close: () => void; allow?: boolean | (() => boolean) }) {
  useCloseOnEscape(true, close, { canvasBlank: allow }); return <div />;
}
async function gesture(pane: HTMLElement, moved = false, right = false) {
  const button = right ? 2 : 0;
  await act(async () => {
    pane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button, pointerId: 1, clientX: 20, clientY: 20 }));
    if (moved) pane.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button, pointerId: 1, clientX: 50, clientY: 50 }));
    pane.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button, pointerId: 1, clientX: moved ? 50 : 20, clientY: moved ? 50 : 20 }));
    pane.dispatchEvent(new MouseEvent('click', { bubbles: true, button }));
  });
}
async function fixture(run: (host: HTMLDivElement, root: ReturnType<typeof createRoot>, pane: HTMLDivElement) => Promise<void>) {
  const host = document.createElement('div'); const pane = document.createElement('div'); pane.className = 'react-flow__pane';
  document.body.append(host, pane); const root = createRoot(host);
  try { await run(host, root, pane); } finally { act(() => root.unmount()); host.remove(); pane.remove(); }
}
it('a plain canvas tap dismisses only the front layer', async () => fixture(async (_host, root, pane) => {
  const parent = vi.fn(); const child = vi.fn();
  await act(async () => root.render(<><Layer close={parent} /><Layer close={child} /></>));
  await gesture(pane); expect(child).toHaveBeenCalledTimes(1); expect(parent).not.toHaveBeenCalled();
}));
it('panning and right-button actions preserve the current layer', async () => fixture(async (_host, root, pane) => {
  const close = vi.fn(); await act(async () => root.render(<Layer close={close} />));
  await gesture(pane, true); await gesture(pane, false, true); expect(close).not.toHaveBeenCalled();
}));
it('a drop in progress cannot lose its receiver after pointerup', async () => fixture(async (_host, root, pane) => {
  let dropBusy = true; const close = vi.fn();
  await act(async () => root.render(<Layer close={close} allow={() => !dropBusy} />));
  await gesture(pane); expect(close).not.toHaveBeenCalled();
  dropBusy = false; await gesture(pane); expect(close).toHaveBeenCalledTimes(1);
}));
it('a higher native modal blocks dismissal of the worksite layer', async () => fixture(async (_host, root, pane) => {
  const parent = vi.fn(); const modal = vi.fn();
  await act(async () => root.render(<><Layer close={parent} /><Layer close={modal} allow={false} /></>));
  await gesture(pane); expect(parent).not.toHaveBeenCalled(); expect(modal).not.toHaveBeenCalled();
}));
it('releasing a drag from a foreground control over the canvas is not a blank tap', async () => fixture(async (host, root, pane) => {
  const close = vi.fn(); await act(async () => root.render(<Layer close={close} />));
  await act(async () => {
    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
    pane.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
    pane.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  });
  expect(close).not.toHaveBeenCalled();
}));
it('treats a Frame empty interior as background without dismissing on its controls', async () => fixture(async (_host, root, pane) => {
  const close = vi.fn(); await act(async () => root.render(<Layer close={close} />));
  pane.className = 'react-flow__node react-flow__node-frame';
  const blank = document.createElement('div'); const label = document.createElement('button');
  label.textContent = 'Frame'; pane.append(blank, label);
  await gesture(label); expect(close).not.toHaveBeenCalled();
  await gesture(blank); expect(close).toHaveBeenCalledTimes(1);
}));
