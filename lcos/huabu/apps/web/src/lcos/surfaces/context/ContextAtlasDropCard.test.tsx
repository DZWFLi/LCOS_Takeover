import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ContextAtlasDropCard } from './ContextAtlasDropCard';
import { useLcosDropStore } from '../../lcosDropState';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { useLcosDropStore.getState().reset(); vi.restoreAllMocks(); });

it('registers only exposed present Atlas cards and reads moving geometry at hit-test time', () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const item: WarehouseItemV1 = { schemaVersion: 1, kind: 'context', entityRef: { type: 'context', id: 'exact-scope' }, title: '研究', usageCount: 0 };
  let left = 20;
  const exposed = vi.fn<(x: number, y: number) => Element[]>();
  const previous = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: exposed });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    left, top: 20, width: 80, height: 80, x: left, y: 20, right: left + 80, bottom: 100, toJSON: () => ({}),
  }));
  const render = (present: boolean) => act(() => root.render(<ContextAtlasDropCard projectId="project" item={item}
    present={present} onPointerDown={() => {}}><div data-lcos-context-collection>卡片</div></ContextAtlasDropCard>));
  try {
    render(true);
    const card = host.querySelector<HTMLElement>('[data-lcos-context-collection]');
    if (!card) throw new Error('Atlas卡片未挂载');
    exposed.mockReturnValue([card]);
    const store = useLcosDropStore.getState();
    expect(store.targetAt({ x: 40, y: 40 })?.semantic)
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'context', id: 'exact-scope' } });
    left = 120;
    expect(store.targetAt({ x: 40, y: 40 })).toBeUndefined();
    expect(store.targetAt({ x: 140, y: 40 })?.targetId).toBe('atlas:project:context:exact-scope');
    const cover = document.createElement('div'); document.body.append(cover);
    exposed.mockReturnValue([cover, card]);
    expect(store.targetAt({ x: 140, y: 40 })).toBeUndefined();
    cover.remove();
    render(false);
    expect(store.targets()).toHaveLength(0);
  } finally {
    act(() => root.unmount()); host.remove();
    if (previous) Object.defineProperty(document, 'elementsFromPoint', previous);
    else Reflect.deleteProperty(document, 'elementsFromPoint');
  }
});

it('catches the explicit carry handle before an existing action footer stops pointer bubbling', () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const observe = vi.fn();
  const item: WarehouseItemV1 = { schemaVersion: 1, kind: 'collection', entityRef: { type: 'collection', id: 'c' }, title: '集合', usageCount: 0 };
  try {
    act(() => root.render(<ContextAtlasDropCard projectId="project" item={item} present onPointerDown={observe}>
      <div onPointerDown={(event) => event.stopPropagation()}><button data-semantic-drop-handle type="button">拿取</button></div>
    </ContextAtlasDropCard>));
    act(() => host.querySelector('button')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0]?.[0].target.hasAttribute('data-semantic-drop-handle')).toBe(true);
  } finally { act(() => root.unmount()); host.remove(); }
});
