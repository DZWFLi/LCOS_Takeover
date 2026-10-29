import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { moveLauncherSelection, rankLauncherActions } from './actionLauncher';
import { LcosActionLauncher } from './LcosActionLauncher';

import type { LcosLauncherAction } from './actionLauncher';

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.replaceChildren(); });
async function mount(readActions: () => readonly LcosLauncherAction[]) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<LcosActionLauncher projectId="p" readActions={readActions} />));
  return root;
}
async function key(target: EventTarget, key: string, ctrlKey = false, isComposing = false) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown',{ key, ctrlKey, isComposing, bubbles: true, cancelable: true })));
}
function input(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>('input[aria-label="查找操作"]'); if (!field) throw new Error('Launcher not open'); return field;
}
it('reuses title/keyword ranking and wraps keyboard selection, with no content search', () => {
  const actions = [{ id: 'fit', title: '查看全部画布', keywords: 'fit camera', run: () => {} },
    { id: 'settings', title: '打开设置', run: () => {} }];
  expect(rankLauncherActions(actions,'camera').map(item => item.id)).toEqual(['fit']);
  expect(rankLauncherActions(actions,'客户材料')).toEqual([]);
  expect(moveLauncherSelection(0,2,-1)).toBe(1); expect(moveLauncherSelection(1,2,1)).toBe(0);
});
it('CtrlK opens from an editor and Enter uses only the selected existing action', async () => {
  const first = vi.fn(), last = vi.fn();
  await mount(() => [{ id: 'first', title: '首个动作', run: first },{ id: 'last', title: '最后动作', run: last }]);
  const editor = document.createElement('textarea'); document.body.append(editor); editor.focus();
  await key(editor,'k',true); expect(document.querySelector('[data-lcos-action-launcher]')).not.toBeNull();
  await key(input(),'ArrowUp');
  expect(document.querySelector('[data-lcos-launcher-action="last"]')?.getAttribute('aria-selected')).toBe('true');
  await key(input(),'Enter',false,true);
  expect(first).not.toHaveBeenCalled(); expect(last).not.toHaveBeenCalled();
  await key(input(),'Enter'); expect(last).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
  expect(document.querySelector('[data-lcos-action-launcher]')).toBeNull();
});
it('Escape or outside press closes this layer and returns its original focus', async () => {
  await mount(() => []); const editor = document.createElement('textarea'); document.body.append(editor); editor.focus();
  await key(editor,'k',true); await key(input(),'Escape');
  expect(document.querySelector('[data-lcos-action-launcher]')).toBeNull(); expect(document.activeElement).toBe(editor);
  await key(editor,'k',true);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="返回画布"]')?.click());
  expect(document.querySelector('[data-lcos-action-launcher]')).toBeNull();
});
it('rechecks callable capability when it disappears while the launcher is open', async () => {
  const run = vi.fn(); let actions: readonly LcosLauncherAction[] = [{ id: 'save', title: '保存', run }];
  await mount(() => actions); await key(window,'k',true); actions = [];
  await act(async () => document.querySelector<HTMLButtonElement>('[data-lcos-launcher-action="save"]')?.click());
  expect(run).not.toHaveBeenCalled(); expect(document.querySelector('[data-lcos-action-launcher]')).toBeNull();
});
