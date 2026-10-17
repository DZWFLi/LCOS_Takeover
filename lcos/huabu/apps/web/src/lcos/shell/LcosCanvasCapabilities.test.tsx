import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePanelStore } from '@/store/panelStore';
import { useSettingsUiStore } from '@/store/settingsUiStore';

import { LcosCanvasCapabilities } from './LcosCanvasCapabilities';
import { useLcosShellStore } from './lcosShellStore';

const m = vi.hoisted(() => ({ canvas: { canvasId: 'canvas-main' }, openChat: vi.fn(), viewport: { width: 1200, height: 900 } }));
vi.mock('@/store/canvasStore', () => ({ default: Object.assign(
  (selector: (state: typeof m.canvas) => unknown) => selector(m.canvas), { getState: () => m.canvas },
) }));
vi.mock('@/store/previewWorkspace/actions', () => ({ openChat: m.openChat }));
vi.mock('../navigation/useHudViewport', () => ({ useHudViewport: () => m.viewport }));
vi.mock('../navigation/useAvoidingHudPosition', () => ({ useAvoidingHudPosition: () => ({ ref: { current: null }, rect: { x: 1088, y: 24 } }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  m.canvas.canvasId = 'canvas-main';
  m.viewport.width = 1200;
  useLcosShellStore.getState().clear(); useLcosShellStore.getState().setProject('p');
  usePanelStore.setState({ isRightCollapsed: true, rightPanelAnchorNodeId: null, focusChatInputRequest: null });
  useSettingsUiStore.getState().close();
  m.openChat.mockImplementation(() => usePanelStore.getState().requestOpenRightPanel());
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
async function mount() { await act(async () => root.render(<LcosCanvasCapabilities projectId="p" />)); }

it('keeps Settings visible without creating a chat while merely loading a worksite', async () => {
  await mount();
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  expect(m.openChat).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-settings-entry]')?.click());
  expect(useSettingsUiStore.getState().isOpen).toBe(true);
});
it('consumes an existing native node-preview request into a single docked window', async () => {
  await mount();
  await act(async () => usePanelStore.getState().requestOpenRightPanel('pdf-node'));
  const initial = useLcosShellStore.getState();
  expect(initial.windows).toHaveLength(1);
  expect(initial.windows[0]?.bodyKey).toBe('native-workspace');
  expect(initial.windowRegions[0]).toMatchObject({ layout: 'docked-right', dockWidth: 480 });
  await act(async () => usePanelStore.getState().requestOpenRightPanel('web-node'));
  expect(useLcosShellStore.getState().windows.map(window => window.id)).toEqual(initial.windows.map(window => window.id));
});
it('closes without reopening itself and accepts a subsequent native request', async () => {
  await mount();
  await act(async () => usePanelStore.getState().requestOpenRightPanel('question-node'));
  const windowId = useLcosShellStore.getState().windows[0]?.id;
  if (!windowId) throw new Error('native window missing');
  await act(async () => useLcosShellStore.getState().closeWindow(windowId));
  expect(usePanelStore.getState().isRightCollapsed).toBe(true);
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  await act(async () => usePanelStore.getState().requestOpenRightPanel('question-node'));
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
});
it('reuses Huabu openChat and preserves the same window across worksite switches', async () => {
  await mount();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-native-chat-entry]')?.click());
  expect(m.openChat).toHaveBeenCalledTimes(1);
  const id = useLcosShellStore.getState().windows[0]?.id;
  m.canvas.canvasId = 'canvas-context'; await mount();
  m.canvas.canvasId = 'canvas-workflow'; await mount();
  expect(useLcosShellStore.getState().windows.map(window => window.id)).toEqual([id]);
});
it('reopens the existing assistant when compact layout hides it behind the reader', async () => {
  m.viewport.width = 896;
  await mount();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-native-chat-entry]')?.click());
  const assistantId = useLcosShellStore.getState().windows[0]!.id;
  await act(async () => useLcosShellStore.getState().openReader('正文', 'material-a'));
  const entry = host.querySelector<HTMLButtonElement>('[data-lcos-native-chat-entry]')!;
  expect(entry.getAttribute('aria-expanded')).toBe('false');
  await act(async () => entry.click());
  expect(useLcosShellStore.getState().windows.filter(window => window.bodyKey === 'native-workspace').map(window => window.id)).toEqual([assistantId]);
  expect(entry.getAttribute('aria-expanded')).toBe('true');
  await act(async () => entry.click());
  expect(useLcosShellStore.getState().windows.some(window => window.id === assistantId)).toBe(false);
});
it('does not let the previous project listener open a window in a different project', async () => {
  await mount();
  await act(async () => useLcosShellStore.getState().setProject('other'));
  await act(async () => usePanelStore.getState().requestOpenRightPanel('old-question'));
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
});

it('CtrlK launches only real capabilities and uses the existing camera/settings owners', async () => {
  await mount();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{ key: 'k', ctrlKey: true, bubbles: true, cancelable: true })));
  expect(document.querySelector('[data-lcos-launcher-action="save"]')).toBeNull(); // No save method in this real-capability test port.
  await act(async () => document.querySelector<HTMLButtonElement>('[data-lcos-launcher-action="fit"]')?.click());
  expect(useLcosShellStore.getState().cameraRequest?.kind).toBe('fit');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{ key: 'k', ctrlKey: true, bubbles: true, cancelable: true })));
  await act(async () => document.querySelector<HTMLButtonElement>('[data-lcos-launcher-action="settings"]')?.click());
  expect(useSettingsUiStore.getState().isOpen).toBe(true); expect(m.openChat).not.toHaveBeenCalled();
});

// Canvas/command ownership tests use a visual stub; real wave paint is checked in Chrome.
vi.mock('../ui/materials/SpectralMaterial', () => ({ SpectralMaterial: ({ children }: { children: import('react').ReactNode }) => <div>{children}</div> }));
