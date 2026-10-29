import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRailwayPointerReorder } from './railwayPointerReorder';

import type { RailwayPointerReorderPort, RailwayReorderItem } from './railwayPointerReorder';
import type { PointerEvent as ReactPointerEvent } from 'react';

const disposals: (() => void)[] = [];
function pointer(type: string, x: number, y: number, extra: Partial<PointerEvent> = {}): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 7, pointerType: 'mouse', isPrimary: true,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, ...extra }).map(([key, value]) => [key, { value }])));
  return event as PointerEvent;
}
function harness() {
  const events = new EventTarget();
  const elements = ['a', 'b', 'c'].map(key => { const element = document.createElement('button'); element.dataset.key = key; document.body.append(element); return element; });
  let current = true;
  let items: RailwayReorderItem[] = elements.map((element, index) => {
    const key = element.dataset.key;
    if (!key) throw new Error('Fixture destination key missing');
    return { key,element,readRect: () => ({ left:0,top:index*42,width:36,height:36 }) };
  });
  const elementAt = (index:number) => {
    const element=elements[index];
    if (!element) throw new Error('Fixture destination element missing');
    return element;
  };
  for (const element of elements) {
    element.setPointerCapture = vi.fn(); element.hasPointerCapture = vi.fn(() => true);
    element.releasePointerCapture = vi.fn(() => events.dispatchEvent(pointer('lostpointercapture', 10, 110)));
  }
  const port: RailwayPointerReorderPort = { items: () => items, isCurrent: () => current,
    onStart: vi.fn(), onUpdate: vi.fn(), onFinish: vi.fn() };
  const controller = createRailwayPointerReorder(port, events, new EventTarget());
  disposals.push(controller.dispose);
  const down = (key = 'a', extra: Partial<PointerEvent> = {}) => controller.onPointerDown(pointer('pointerdown', 10, 10, extra) as unknown as ReactPointerEvent<HTMLElement>, key);
  const move = (x: number, y: number, extra: Partial<PointerEvent> = {}) => events.dispatchEvent(pointer('pointermove', x, y, extra));
  const up = (x = 10, y = 110) => events.dispatchEvent(pointer('pointerup', x, y));
  return { events, port, controller, elements, elementAt, down, move, up, change: () => { current = false; },
    replaceItems: (next: RailwayReorderItem[]) => { items = next; }, items: () => items };
}
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Rail pointer reorder keeps click tolerance and native input ownership', () => {
  it.each([1, 3, 4])('%ipx stays a click without capture, preview or save', distance => {
    const h = harness(); expect(h.down()).toBe(true); h.move(10 + distance, 10); h.up(10 + distance, 10);
    expect(h.elementAt(0).setPointerCapture).not.toHaveBeenCalled();
    expect(h.port.onStart).not.toHaveBeenCalled(); expect(h.port.onUpdate).not.toHaveBeenCalled();
    expect(h.port.onFinish).not.toHaveBeenCalled(); expect(h.controller.consumeClick('a')).toBe(false);
  });
  it('5px starts capture once and keeps a no-op release free of writes', () => {
    const h = harness(); h.down(); h.move(15, 10); h.move(16, 10); h.up(16, 10);
    expect(h.elementAt(0).setPointerCapture).toHaveBeenCalledTimes(1);
    expect(h.port.onStart).toHaveBeenCalledExactlyOnceWith('a');
    expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(h.controller.consumeClick('other')).toBe(false);
    expect(h.controller.consumeClick('a')).toBe(true); expect(h.controller.consumeClick('a')).toBe(false);
  });
  it.each([{ button: 2 }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isPrimary: false }])('does not claim another trigger %j', extra => {
    const h = harness(); expect(h.down('a', extra)).toBe(false); h.move(10, 110); h.up();
    expect(h.port.onFinish).not.toHaveBeenCalled();
  });
  it('cannot reorder a candidate that the stored-only host does not supply', () => {
    const h = harness(); expect(h.down('candidate')).toBe(false); h.move(10, 110); h.up();
    expect(h.port.onStart).not.toHaveBeenCalled();
  });
});

describe('Rail reorder supplies relative intent and neighbouring slot shifts', () => {
  it('moves a after c with both neighbours yielding one slot and one release callback', () => {
    const h = harness(); h.down(); h.move(10, 110);
    expect(h.port.onUpdate).toHaveBeenLastCalledWith({ key: 'a', targetKey: 'c', where: 'after', fromIndex: 0, toIndex: 2,
      pointer: { x: 10, y: 110 }, shifts: [{ key: 'b', x: 0, y: -42 }, { key: 'c', x: 0, y: -42 }] });
    h.up(); h.up();
    expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith({ key: 'a', targetKey: 'c', where: 'after' });
    expect(h.elementAt(0).releasePointerCapture).toHaveBeenCalledTimes(1);
  });
  it('re-reads the target rect at release and uses its current middle line', () => {
    const h = harness(); h.down(); h.move(10, 110);
    h.replaceItems(h.items().map(item => item.key === 'c' ? { ...item, readRect: () => ({ left: 0, top: 105, width: 36, height: 36 }) } : item));
    h.up();
    expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith({ key: 'a', targetKey: 'c', where: 'before' });
  });
  it('uses actual two-column slots for neighbour motion', () => {
    const h = harness(); h.replaceItems(h.items().map((item, index) => ({ ...item,
      readRect: () => ({ left: (index % 2) * 42, top: Math.floor(index / 2) * 42, width: 36, height: 36 }) })));
    h.down(); h.move(10, 70);
    expect(h.port.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ toIndex: 2,
      shifts: [{ key: 'b', x: -42, y: 0 }, { key: 'c', x: 42, y: -42 }] }));
  });
  it('leaving the Rail never commits an unrelated nearest destination', () => {
    const h = harness(); h.down(); h.move(10, 110); h.up(300, 110);
    expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});

describe('interrupted Rail gestures never save', () => {
  it.each(['pointercancel', 'lostpointercapture', 'blur', 'escape', 'dispose', 'explicit', 'removed', 'stale', 'modifier'])('cancels on %s and ignores later release', reason => {
    const h = harness(); h.down(); h.move(10, 110);
    if (reason === 'escape') h.events.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    else if (reason === 'dispose') h.controller.dispose();
    else if (reason === 'explicit') h.controller.cancel();
    else if (reason === 'removed') { h.elementAt(0).remove(); h.move(10, 110); }
    else if (reason === 'stale') { h.change(); h.move(10, 110); }
    else if (reason === 'modifier') h.move(10, 110, { altKey: true });
    else h.events.dispatchEvent(reason === 'blur' ? new Event('blur') : pointer(reason, 10, 110));
    h.up(); expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  it('source replacement and stored topology changes cancel instead of reinterpreting order', () => {
    const h = harness(); h.down(); h.move(10, 110); h.replaceItems(h.items().slice(0, 2)); h.up();
    expect(h.port.onFinish).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  it('dispose removes all listeners, and click suppression expires after 300ms', () => {
    const h = harness(); h.down(); h.move(10, 110); h.up(); vi.advanceTimersByTime(300);
    expect(h.controller.consumeClick('a')).toBe(false);
    h.controller.dispose(); const calls = vi.mocked(h.port.onUpdate).mock.calls.length; h.move(10, 70); h.up();
    expect(h.port.onUpdate).toHaveBeenCalledTimes(calls);
  });
});
