import { afterEach, expect, it, vi } from 'vitest';

import { PointerRouterCore } from '@/handler/pointerRouter';
import useCanvasStore from '@/store/canvasStore';

import { createReferencePickRecognizer } from './lcosRecognizers';
import { useLcosReferenceStore } from './lcosReferenceState';
import { installReferenceClickSuppressor } from './referenceClickSuppressor';
import { referencePickOwnerKey } from './referencePickOwnership';
import { useLcosShellStore } from './shell/lcosShellStore';

import type { CanvasPointerRouterContext } from '@/handler/canvasPointerRouterContext';
import type { PointerRecognizer } from '@/handler/pointerRouter';

vi.mock('@/handler/canvasNodeAtPoint', () => ({ nodeIdAtScreenPoint: () => 'node-image' }));
const context = { interactivityLocked: false, explicitToolActive: false } as CanvasPointerRouterContext;
const savedCanvas = useCanvasStore.getState();
afterEach(() => {
  useCanvasStore.setState({ nodes: savedCanvas.nodes, canvasId: savedCanvas.canvasId });
  useLcosReferenceStore.getState().reset(); useLcosShellStore.getState().closeComposer();
  document.body.replaceChildren(); vi.restoreAllMocks();
});
function fixture(picking = false) {
  useCanvasStore.setState({ canvasId: 'canvas', nodes: [
    { id: 'node-image', type: 'image', data: {}, position: { x: 0, y: 0 }, selected: false },
    { id: 'node-selected', type: 'text', data: {}, position: { x: 300, y: 0 }, selected: true },
  ] });
  const refs = useLcosReferenceStore.getState(); refs.reset();
  refs.registerNodeEntity('node-image', { entityType: 'artifact', entityId: 'artifact-image' });
  const shell = useLcosShellStore.getState();
  shell.openComposer({ nodeId: 'existing-input', title: 'Existing task', anchor: { x: 0, y: 0, width: 10, height: 10 } });
  const current = useLcosShellStore.getState();
  if (picking) refs.setReferencePickOwner(referencePickOwnerKey(current.projectId, current.composerTarget) ?? null);
  const node = document.createElement('div'); node.className = 'react-flow__node'; node.dataset.id = 'node-image'; document.body.append(node);
  return { node, target: useLcosShellStore.getState().composerTarget };
}
function event(target: Element, overrides: Partial<PointerEvent> = {}): PointerEvent {
  return { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    clientX: 20, clientY: 20, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides } as PointerEvent;
}
function selectionOwner(selected: () => void): PointerRecognizer<PointerEvent, CanvasPointerRouterContext> {
  return { id: 'native-selection', canClaim: () => true, onDown: () => { selected(); return 'claim'; } };
}
it('a normal left press remains native selection and does not replace the existing input or add references', () => {
  const { node, target } = fixture(); const selected = vi.fn(() => useCanvasStore.getState().selectNodes(['node-image']));
  const router = new PointerRouterCore([createReferencePickRecognizer(), selectionOwner(selected)], () => context);
  router.handleDown(event(node)); router.handleUp(event(node));
  expect(selected).toHaveBeenCalledOnce();
  expect(useCanvasStore.getState().nodes.filter(item => item.selected).map(item => item.id)).toEqual(['node-image']);
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
});
it('explicit reference mode owns only the reference; its trailing click cannot select or open another input', () => {
  const { node, target } = fixture(true); const selected = vi.fn(); const trailingSelection = vi.fn();
  const dispose = installReferenceClickSuppressor(); document.addEventListener('click', trailingSelection);
  try {
    const router = new PointerRouterCore([createReferencePickRecognizer(), selectionOwner(selected)], () => context);
    router.handleDown(event(node)); router.handleUp(event(node));
    node.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true, cancelable: true, detail: 1 }));
    expect(selected).not.toHaveBeenCalled(); expect(trailingSelection).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes.filter(item => item.selected).map(item => item.id)).toEqual(['node-selected']);
    expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([{ entityType: 'artifact', entityId: 'artifact-image' }]);
    expect(useLcosShellStore.getState().composerTarget).toBe(target);
  } finally { document.removeEventListener('click', trailingSelection); dispose(); }
});
it.each(['react-flow__resize-control', 'react-flow__handle'])('reference mode yields the %s physical control to its native owner', (className) => {
  const { node } = fixture(true); const control = document.createElement('div'); control.className = className; node.append(control);
  const native = vi.fn(); const router = new PointerRouterCore([createReferencePickRecognizer(), selectionOwner(native)], () => context);
  router.handleDown(event(control)); router.handleUp(event(control));
  expect(native).toHaveBeenCalledOnce(); expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
});
it('explicit canvas tools keep the pointer even while reference mode is active', () => {
  const { node } = fixture(true);
  expect(createReferencePickRecognizer().canClaim(event(node), { ...context, explicitToolActive: true })).toBe(false);
});
it('Shift and Alt preserve selection and carry grammar in explicit reference mode', () => {
  const { node } = fixture(true); const recognizer = createReferencePickRecognizer();
  expect(recognizer.canClaim(event(node, { shiftKey: true }), context)).toBe(false);
  expect(recognizer.canClaim(event(node, { altKey: true }), context)).toBe(false);
  expect(recognizer.canClaim(event(node, { button: 2, buttons: 2 }), context)).toBe(false);
});
it('a previous input picker cannot commandeer a normal click after changing the input target', () => {
  const { node } = fixture(true); const recognizer = createReferencePickRecognizer();
  useLcosShellStore.getState().openComposer({ nodeId: 'new-input', title: 'New task', anchor: { x: 0, y: 0, width: 1, height: 1 } });
  expect(recognizer.canClaim(event(node), context)).toBe(false);
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
});
it('leaving explicit reference mode before release does not add a reference to that still-open input', () => {
  const { node, target } = fixture(true); const recognizer = createReferencePickRecognizer();
  expect(recognizer.canClaim(event(node), context)).toBe(true);
  recognizer.onDown(event(node), context);
  useLcosReferenceStore.getState().setReferencePickOwner(null);
  recognizer.onUp?.(event(node), context);
  expect(useLcosReferenceStore.getState().orderedNodeReferences()).toEqual([]);
  expect(useLcosShellStore.getState().composerTarget).toBe(target);
});
