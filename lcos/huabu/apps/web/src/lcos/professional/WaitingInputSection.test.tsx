import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { WaitingInputSection } from './WaitingInputSection';

import type { CoreCollaborationClient } from '@local-creative-os/web-gen2';

function pending(question: string) { return { pendingInputId: 'input', runId: 'run', question, options: ['是', '否'], allowFreeText: true }; }
describe('Waiting input identity', () => {
  it('ignores an old conversation answer request and aborts it after switching', async () => {
    let finish!: (value: ReturnType<typeof pending>) => void;
    const readPendingInput = vi.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(pending('当前会话的问题'));
    const collaboration = { readPendingInput } as unknown as CoreCollaborationClient;
    const host = document.createElement('div'); const root = createRoot(host);
    try {
      await act(async () => root.render(<WaitingInputSection collaboration={collaboration} projectId="p" conversationId="old" />));
      await act(async () => root.render(<WaitingInputSection collaboration={collaboration} projectId="p" conversationId="new" />));
      expect((readPendingInput.mock.calls[0]?.[2] as AbortSignal).aborted).toBe(true);
      await act(async () => finish(pending('过期问题')));
      expect(host.textContent).toContain('当前会话的问题');
      expect(host.textContent).not.toContain('过期问题');
    } finally { await act(async () => root.unmount()); }
  });
  it('offers retry after a failed read and exposes option selection accurately', async () => {
    const readPendingInput = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(pending('选一个'));
    const collaboration = { readPendingInput } as unknown as CoreCollaborationClient;
    const host = document.createElement('div'); const root = createRoot(host);
    try {
      await act(async () => root.render(<WaitingInputSection collaboration={collaboration} projectId="p" conversationId="c" />));
      const retry = host.querySelector('button');
      expect(retry?.textContent).toBe('重试读取问题');
      await act(async () => retry?.click());
      const option = host.querySelector<HTMLButtonElement>('[data-lcos-waiting-option]');
      expect(option?.getAttribute('aria-pressed')).toBe('false');
      await act(async () => option?.click());
      expect(option?.getAttribute('aria-pressed')).toBe('true');
    } finally { await act(async () => root.unmount()); }
  });
});
