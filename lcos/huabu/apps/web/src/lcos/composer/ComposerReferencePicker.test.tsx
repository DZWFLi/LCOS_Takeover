import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { ComposerReferencePicker } from './ComposerReferencePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  useLcosReferenceStore.getState().reset();
  useCanvasStore.setState({ nodes: [] });
});

it('navigates actual references by keyboard, skips included items and adds without moving nodes', async () => {
  const nodes = ['a', 'b', 'c'].map((id, index) => ({
    id, type: 'note', position: { x: 20 + index * 100, y: 40 }, data: { title: '对象 ' + id },
  }));
  useCanvasStore.setState({ nodes });
  const refs = useLcosReferenceStore.getState();
  refs.setProject('project-a');
  for (const node of nodes) refs.registerNodeEntity(node.id, { entityType: 'artifact', entityId: node.id });
  refs.addEntityToDraft({ entityType: 'artifact', entityId: 'b' });
  const picked = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return <ComposerReferencePicker open={open} onOpenChange={setOpen} disabled={false} onPicked={picked} />;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Host />));
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  expect(items).toHaveLength(3);
  expect(items[1].disabled).toBe(true);
  items[0].focus();
  await act(async () => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(items[2]);
  await act(async () => items[2].click());
  expect(picked).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs.map((ref) => ref.entityId)).toEqual(['b', 'c']);
  expect(useCanvasStore.getState().nodes).toEqual(nodes);
});

it('consumes Escape in the picker and returns focus without closing its Composer owner', async () => {
  const outerEscape = vi.fn();
  window.addEventListener('keydown', outerEscape);
  try {
    const picked = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return <ComposerReferencePicker open={open} onOpenChange={setOpen} disabled={false} onPicked={picked} />;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Host />));
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(picked).toHaveBeenCalledOnce();
    expect(outerEscape).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', outerEscape);
  }
});
