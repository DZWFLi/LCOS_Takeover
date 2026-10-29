import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AssemblyItemView } from './AssemblyItemView';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('exposes the primary take action before opening extra actions', async () => {
  const take = vi.fn();
  await act(async () => root.render(
    <AssemblyItemView
      title="材料 A"
      primaryAction={<button type="button" data-primary-take onClick={take}>放入目标</button>}
      actions={<button type="button" data-secondary-action>打开预览</button>}
    >
      <div>材料预览</div>
    </AssemblyItemView>,
  ));

  const primary = host.querySelector<HTMLButtonElement>('[data-primary-take]');
  const more = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-more]');
  expect(primary).not.toBeNull();
  expect(primary?.closest('[data-lcos-assembly-actions]')).toBeNull();
  expect(more?.getAttribute('aria-expanded')).toBe('false');

  await act(async () => primary?.click());
  expect(take).toHaveBeenCalledTimes(1);
});

it('uses the existing drag threshold before treating a body double click as quick preview', async () => {
  const preview = vi.fn();
  await act(async () => root.render(<AssemblyItemView title="材料 A" onPreview={preview} actions={null}>
    <div>材料预览</div>
  </AssemblyItemView>));
  const body = host.querySelector<HTMLElement>('.lcos-assembly-item-object');
  await act(async () => {
    body?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 43, pointerType: 'mouse', button: 0, buttons: 1, clientX: 10, clientY: 10, bubbles: true }));
    body?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 43, pointerType: 'mouse', buttons: 1, clientX: 50, clientY: 50, bubbles: true }));
    body?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 43, pointerType: 'mouse', button: 0, clientX: 50, clientY: 50, bubbles: true }));
    body?.dispatchEvent(new MouseEvent('dblclick', { detail: 2, clientX: 50, clientY: 50, bubbles: true }));
  });
  expect(preview).not.toHaveBeenCalled();
  await act(async () => {
    body?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 44, pointerType: 'mouse', button: 0, buttons: 1, clientX: 20, clientY: 20, bubbles: true }));
    body?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 44, pointerType: 'mouse', button: 0, clientX: 20, clientY: 20, bubbles: true }));
    body?.dispatchEvent(new MouseEvent('dblclick', { detail: 2, clientX: 20, clientY: 20, bubbles: true }));
  });
  expect(preview).toHaveBeenCalledOnce();
});

it('opens from the caption or Enter without consuming selection and menu controls', async () => {
  const preview = vi.fn();
  const select = vi.fn();
  await act(async () => root.render(<AssemblyItemView title="材料 A" onPreview={preview}
    onSelect={select} actions={null}><div>缩略图</div></AssemblyItemView>));
  const row = host.querySelector<HTMLElement>('.lcos-assembly-item')!;
  await act(async () => row.querySelector('strong')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(preview).toHaveBeenCalledTimes(1);
  await act(async () => row.querySelector<HTMLInputElement>('input')?.click());
  expect(select).toHaveBeenCalledOnce();
  await act(async () => row.querySelector('label')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(preview).toHaveBeenCalledTimes(1);
  await act(async () => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect(preview).toHaveBeenCalledTimes(2);
  await act(async () => row.querySelector('[data-lcos-assembly-more]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(preview).toHaveBeenCalledTimes(2);
});
