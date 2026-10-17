import { ReactFlowProvider } from '@xyflow/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsUiStore } from '@/store/settingsUiStore';
import { useToolStore } from '@/store/toolStore';

import { LcosCanvasCreationMenu } from './LcosCanvasCreationMenu';

import type * as ReactI18next from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof ReactI18next>(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useInputMode', () => ({ useIsNotMouse: () => false }));

let root: Root;
let host: HTMLDivElement;
let toolsHost: HTMLDivElement;
const onToolChange = vi.fn();
const press = (key: string, target: HTMLElement | Window = window, extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  act(() => target.dispatchEvent(event));
  return event;
};
beforeEach(() => {
  onToolChange.mockReset();
  useToolStore.getState().setPendingNodeType(null);
  useSettingsUiStore.getState().close();
  toolsHost = document.createElement('div'); toolsHost.dataset.lcosCreationToolsHost = 'true'; document.body.append(toolsHost);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<ReactFlowProvider><LcosCanvasCreationMenu activeTool="select" onToolChange={onToolChange} /></ReactFlowProvider>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); toolsHost.remove(); });

describe('LCOS native creation tools', () => {
  it('routes every creation shortcut to the existing pending placement state', () => {
    for (const [key, type] of [['1', 'note'], ['2', 'text'], ['3', 'frame'], ['4', 'sketch'], ['a', 'question']] as const) {
      expect(press(key).defaultPrevented).toBe(true);
      expect(useToolStore.getState().pendingNodeType).toBe(type);
      expect(onToolChange).toHaveBeenLastCalledWith('select');
      press(key); expect(useToolStore.getState().pendingNodeType).toBeNull();
    }
  });
  it('resets an eraser to drawing and clears placement before pan/select/lasso', () => {
    useToolStore.getState().setSketchDraft({ mode: 'erase' });
    press('4'); expect(useToolStore.getState().sketchDraft.mode).toBe('draw');
    for (const [key, tool] of [['p', 'pan'], ['s', 'select'], ['l', 'lasso']] as const) {
      press('1'); press(key);
      expect(useToolStore.getState().pendingNodeType).toBeNull();
      expect(onToolChange).toHaveBeenLastCalledWith(tool);
    }
  });
  it('keeps typing, composition, modifiers and global modal keys out of placement', () => {
    const input = document.createElement('textarea'); host.appendChild(input);
    expect(press('1', input).defaultPrevented).toBe(false);
    press('1', window, { isComposing: true }); press('1', window, { ctrlKey: true });
    expect(useToolStore.getState().pendingNodeType).toBeNull();
    act(() => useSettingsUiStore.getState().open()); press('1');
    expect(useToolStore.getState().pendingNodeType).toBeNull();
  });
  it('uses the same placement action from the compact menu and cleans listeners on unmount', () => {
    const createText = document.querySelector<HTMLButtonElement>('[data-lcos-create-type="text"]');
    expect(createText).not.toBeNull(); act(() => createText?.click());
    expect(useToolStore.getState().pendingNodeType).toBe('text');
    expect(document.querySelector('[data-lcos-create-type="text"]')).toBeNull();
    act(() => root.render(null)); press('1');
    expect(useToolStore.getState().pendingNodeType).toBe('text');
  });
});

// Canvas/command ownership tests use a visual stub; real wave paint is checked in Chrome.
vi.mock('../../ui/materials/SpectralMaterial', () => ({ SpectralMaterial: ({ children }: { children: import('react').ReactNode }) => <div>{children}</div> }));
