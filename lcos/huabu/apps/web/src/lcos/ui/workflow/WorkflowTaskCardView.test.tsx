import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { WorkflowTaskCardView } from './WorkflowTaskCardView';
import { ASSEMBLY_DRAG_MIME } from '../../drop/nativeAssemblyDrop';

import type { DragEvent, ReactNode } from 'react';
import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}

it('keeps preview and exact-worksite entry available without a draft-reference owner', async () => {
  const onPreview = vi.fn();
  const onEnter = vi.fn();
  const props = { title: '真实工作流', summary: '工作流 · 卡牌', onPreview, onEnter,
    entryAvailable: true, entryTargetLabel: '工作流现场 A' } as const;
  const el = await mount(<WorkflowTaskCardView {...props} state="静息" />);
  const card = el.querySelector<HTMLElement>('[data-lcos-workflow-task-card]');
  if (!card) throw new Error('TaskCard did not render');
  await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onPreview).toHaveBeenCalledOnce();
  expect(el.querySelector('[data-lcos-task-take]')).toBeNull();
  await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onEnter).toHaveBeenCalledOnce();

  await act(async () => root?.render(<WorkflowTaskCardView {...props} state="预览" />));
  const previewActions = [...el.querySelectorAll<HTMLButtonElement>('.lcos-workflow-card-preview button')];
  expect(previewActions.some((button) => button.textContent?.includes('加入当前草稿'))).toBe(false);
  const enter = previewActions.find((button) => button.textContent?.includes('工作流现场 A'));
  expect(enter?.disabled).toBe(false);
  await act(async () => enter?.click());
  expect(onEnter).toHaveBeenCalledTimes(2);
});

it('forwards native capture drag events and keeps DataTransfer available to the Assembly source', async () => {
  const setData = vi.fn();
  const onDragStartCapture = vi.fn((event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(ASSEMBLY_DRAG_MIME, '{"itemId":"wf1"}');
  });
  const onDragEndCapture = vi.fn();
  const el = await mount(<WorkflowTaskCardView title="真实工作流" state="静息" draggable
    onDragStartCapture={onDragStartCapture} onDragEndCapture={onDragEndCapture} />);
  const card = el.querySelector<HTMLElement>('[data-lcos-workflow-task-card]');
  if (!card) throw new Error('TaskCard did not render');
  expect(card.getAttribute('draggable')).toBe('true');

  const start = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(start, 'dataTransfer', { value: { effectAllowed: 'uninitialized', setData } });
  await act(async () => card.dispatchEvent(start));
  expect(onDragStartCapture).toHaveBeenCalledOnce();
  expect(setData).toHaveBeenCalledWith(ASSEMBLY_DRAG_MIME, '{"itemId":"wf1"}');

  const end = new Event('dragend', { bubbles: true, cancelable: true });
  await act(async () => card.dispatchEvent(end));
  expect(onDragEndCapture).toHaveBeenCalledOnce();
});

it('forwards pointer carry on the card while its explicit handle does not open preview', async () => {
  const onPointerDown = vi.fn(), onPreview = vi.fn(), onEnter = vi.fn();
  const el = await mount(<WorkflowTaskCardView title="真实工作流" state="静息" onPointerDown={onPointerDown}
    onPreview={onPreview} onEnter={onEnter} carryHandle={<button type="button" data-semantic-drop-handle
      onClick={event => event.stopPropagation()}>携带</button>} />);
  const handle = el.querySelector<HTMLElement>('[data-semantic-drop-handle]');
  await act(async () => {
    handle?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 41, button: 0, buttons: 1, bubbles: true }));
    handle?.click();
  });
  expect(onPointerDown).toHaveBeenCalledOnce();
  expect(onPointerDown.mock.calls[0]?.[0].target).toBe(handle);
  expect(onPreview).not.toHaveBeenCalled();
  expect(onEnter).not.toHaveBeenCalled();
});

it('does not treat an ordinary left drag tail click as preview or worksite entry', async () => {
  const onPreview = vi.fn(), onEnter = vi.fn();
  const el = await mount(<WorkflowTaskCardView title="真实工作流" state="静息" onPreview={onPreview} onEnter={onEnter} />);
  const card = el.querySelector<HTMLElement>('[data-lcos-workflow-task-card]');
  await act(async () => {
    card?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42, pointerType: 'mouse', button: 0, buttons: 1, clientX: 10, clientY: 10, bubbles: true }));
    card?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 42, pointerType: 'mouse', buttons: 1, clientX: 50, clientY: 50, bubbles: true }));
    card?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 42, pointerType: 'mouse', button: 0, buttons: 0, clientX: 50, clientY: 50, bubbles: true }));
    card?.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
    card?.dispatchEvent(new MouseEvent('dblclick', { detail: 2, clientX: 50, clientY: 50, bubbles: true, cancelable: true }));
  });
  expect(onPreview).not.toHaveBeenCalled();
  expect(onEnter).not.toHaveBeenCalled();
  await act(async () => card?.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true })));
  expect(onPreview).toHaveBeenCalledOnce();
});
