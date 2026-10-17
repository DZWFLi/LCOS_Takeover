import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { CanvasHostBoundary } from './CanvasHostBoundary';
const mocks = vi.hoisted(() => ({ canvasId: 'canvas-a' }));
vi.mock('@/components/Panels/Canvas/Canvas', () => ({ Canvas: ({ shortcutsDisabled }: { shortcutsDisabled?: boolean }) =>
  <div data-native-canvas data-shortcuts-disabled={String(shortcutsDisabled)}><input aria-label="自由节点" /></div> }));
vi.mock('@/lcos/useLcosCanvasProps', () => ({ useLcosCanvasProps: () => ({}) }));
vi.mock('@/store/canvasStore', () => ({ default: (select: (state: typeof mocks) => unknown) => select(mocks) }));
vi.mock('@/store/canvasAttentionStore', () => ({ useTrackCanvasAttention: () => {} }));
vi.mock('../shell/lcosShellStore', () => ({ useLcosShellStore: (select: (state: object) => unknown) => select({}) }));
vi.mock('../ui/motion/useReducedSpatialMotion', () => ({ useReducedSpatialMotion: () => true }));
let host: HTMLDivElement; let root: Root;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { mocks.canvasId='canvas-a'; const state=useLcosReferenceStore.getState(); state.reset(); state.setProject('p');
  host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const store = () => useLcosReferenceStore.getState();
const cover = () => host.querySelector('[data-lcos-binding-initial-cover]');
const canvas = () => host.querySelector('[data-native-canvas]')!;
it('keeps the one canvas mounted but inaccessible until canonical identities resolve', async () => {
  await act(async () => root.render(<CanvasHostBoundary projectId="p" />));
  expect(cover()?.getAttribute('data-lcos-binding-initial-cover')).toBe('loading');
  expect((canvas().parentElement as HTMLElement).style.visibility).toBe('hidden');
  expect(canvas().getAttribute('data-shortcuts-disabled')).toBe('true');
  await act(async () => { store().beginNodeBindingRead('p','canvas-a');
    store().applyNodeBindings('p','canvas-a',[{spatialId:'b',entityType:'artifact',entityId:'a'}],'loading'); });
  expect(cover()).toBeNull(); expect(canvas().getAttribute('data-shortcuts-disabled')).toBe('false');
  expect(store().bindingReadStatus).toBe('loading');
  expect((canvas().parentElement as HTMLElement).style.visibility).toBe('visible');
});
it('an empty successful identity read immediately releases every freeform native node', async () => {
  await act(async () => { store().beginNodeBindingRead('p','canvas-a'); root.render(<CanvasHostBoundary projectId="p" />); });
  await act(async () => store().applyNodeBindings('p','canvas-a',[],'loading'));
  expect(cover()).toBeNull(); expect(host.querySelector('[aria-label="自由节点"]')).not.toBeNull();
});
it('shows a recoverable error and retries the existing owner, never an endless spinner', async () => {
  await act(async () => { store().beginNodeBindingRead('p','canvas-a'); root.render(<CanvasHostBoundary projectId="p" />); });
  await act(async () => store().failNodeBindingRead('p','canvas-a'));
  expect(cover()?.getAttribute('data-lcos-binding-initial-cover')).toBe('error');
  expect(host.querySelector('.skeleton-lines')).toBeNull(); expect(host.textContent).toContain('暂未开放画布');
  const version=store().bindingRefreshVersion;
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(store().bindingRefreshVersion).toBe(version+1);
  await act(async () => { store().beginNodeBindingRead('p','canvas-a'); store().applyNodeBindings('p','canvas-a',[],'ready'); });
  expect(cover()).toBeNull();
});
it('does not re-cover known identities during description retry; a new canvas waits for its own identities', async () => {
  await act(async () => { store().beginNodeBindingRead('p','canvas-a'); store().applyNodeBindings('p','canvas-a',[],'loading'); root.render(<CanvasHostBoundary projectId="p" />); });
  await act(async () => { store().failNodeBindingRead('p','canvas-a'); store().beginNodeBindingRead('p','canvas-a'); });
  expect(cover()).toBeNull();
  mocks.canvasId='canvas-b'; await act(async () => root.render(<CanvasHostBoundary projectId="p" />));
  expect(cover()).not.toBeNull();
  await act(async () => store().beginNodeBindingRead('p','canvas-b'));
  await act(async () => store().applyNodeBindings('p','canvas-a',[],'ready')); expect(cover()).not.toBeNull();
  await act(async () => store().applyNodeBindings('p','canvas-b',[],'ready')); expect(cover()).toBeNull();
});
it('does not gate the native Huabu chrome path on LCOS reads', async () => {
  await act(async () => root.render(<CanvasHostBoundary projectId="p" chromeMode="huabu" />));
  expect(cover()).toBeNull(); expect(canvas().getAttribute('data-shortcuts-disabled')).toBe('false');
});
