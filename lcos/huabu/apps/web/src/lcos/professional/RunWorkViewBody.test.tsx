import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RunReview } from '@local-creative-os/contracts';

import { RunWorkViewBody } from './RunWorkViewBody';

const m = vi.hoisted(() => ({ read: vi.fn(), recipe: vi.fn(), act: vi.fn(), cancel: vi.fn(),
  changed: undefined as undefined | (() => void), unwatch: vi.fn() }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ runs: {
  readRunReview: m.read, readRecipe: m.recipe, actOnRun: m.act, cancelRun: m.cancel,
} }) }));
vi.mock('../collaboration/collaborationSessionStore', () => ({ useCollaborationSessionStore: { getState: () => ({
  watchProjectChanges: (_project: string, listener: () => void) => { m.changed = listener; return m.unwatch; },
}) } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function review(summary = '正在处理'): RunReview {
  return { run: { id: 'run-a', projectId: 'project-a', instruction: '整理已有材料', status: 'running', shortSummary: summary },
    dispatch: { runId: 'run-a', status: 'dispatched' }, returns: [], presentationPhase: 'running',
    capabilities: { accept: { enabled: false }, reject: { enabled: false }, retry: { enabled: false } },
  } as unknown as RunReview;
}
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockReset().mockResolvedValue(review());
  m.recipe.mockReset().mockResolvedValue({ runId: 'run-a', projectId: 'project-a', orderedReferences: [] });
  m.cancel.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount() { await act(async () => root.render(<RunWorkViewBody projectId="project-a" runId="run-a" />)); }
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text); }

it('reads and follows project updates without dispatching, syncing or cancelling on behalf of the user', async () => {
  await mount();
  expect(host.textContent).toContain('正在处理');
  m.read.mockResolvedValue(review('新结果已返回'));
  await act(async () => m.changed?.());
  expect(host.textContent).toContain('新结果已返回');
  expect(m.read).toHaveBeenCalledTimes(2);
  expect(m.act).not.toHaveBeenCalled(); expect(m.cancel).not.toHaveBeenCalled();
  expect(button('核对状态')).toBeUndefined();
  expect(button('同步执行状态')).toBeUndefined();
});

it('keeps failed reads recoverable through the same read-only owner', async () => {
  m.read.mockRejectedValueOnce(new Error('读取连接中断'));
  await mount();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('读取连接中断');
  await act(async () => button('重试读取')?.click());
  expect(host.textContent).toContain('整理已有材料');
  expect(m.read).toHaveBeenCalledTimes(2); expect(m.act).not.toHaveBeenCalled();
});

it('preserves stop confirmation and blocks repetition when its receipt is unknown', async () => {
  m.cancel.mockRejectedValue(new Error('停止回执未确认'));
  await mount();
  await act(async () => button('停止任务')?.click());
  expect(m.cancel).not.toHaveBeenCalled();
  await act(async () => button('确认停止')?.click());
  expect(m.cancel).toHaveBeenCalledTimes(1);
  await act(async () => m.changed?.());
  expect(button('停止任务')?.disabled).toBe(true);
  await act(async () => button('停止任务')?.click());
  expect(m.cancel).toHaveBeenCalledTimes(1);
  await act(async () => button('重新核对操作结果')?.click());
  expect(button('停止任务')?.disabled).toBe(false);
  expect(m.cancel).toHaveBeenCalledTimes(1);
});
