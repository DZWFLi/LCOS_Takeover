import { describe, expect, it, vi } from 'vitest';

import { promptExistingAcpSession } from './continuation-prompt.js';

import type { AcpSessionEntry } from './session-registry.js';

function entry(
  prompt: (...args: unknown[]) => Promise<{ stopReason: string }>,
): AcpSessionEntry {
  return {
    agentletId: 'agentlet-1',
    threadId: 'thread-1',
    sessionId: 'native-1',
    selectionsReplay: Promise.resolve(),
    persistedToDisk: false,
    client: {
      prompt,
      resolvePermission: vi.fn(),
    },
  } as unknown as AcpSessionEntry;
}

describe('promptExistingAcpSession', () => {
  it('replays selections, aggregates agent text, and promotes first prompt persistence', async () => {
    const prompt = vi.fn(async (...args: unknown[]) => {
      const onUpdate = args[2] as (update: unknown) => void;
      onUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hello' },
      });
      onUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: ' world' },
      });
      return { stopReason: 'end_turn' };
    });
    const owner = entry(prompt);

    const receipt = await promptExistingAcpSession(owner, '继续');

    expect(receipt).toEqual({ text: 'hello world', stopReason: 'end_turn' });
    expect(owner.persistedToDisk).toBe(true);
    expect(prompt).toHaveBeenCalledWith(
      'native-1',
      [{ type: 'text', text: '继续' }],
      expect.any(Function),
      undefined,
      expect.any(Function),
    );
  });

  it('fails closed on permission requests instead of auto-allowing', async () => {
    const resolvePermission = vi.fn();
    const prompt = vi.fn(async (...args: unknown[]) => {
      const onPermission = args[4] as (request: { requestId: string }) => void;
      onPermission({ requestId: 'permission-1' });
      return { stopReason: 'cancelled' };
    });
    const owner = {
      ...entry(prompt),
      client: { prompt, resolvePermission },
    } as unknown as AcpSessionEntry;

    await promptExistingAcpSession(owner, '需要工具');

    expect(resolvePermission).toHaveBeenCalledWith('permission-1', {
      cancelled: true,
    });
  });

  it('surfaces the real ACP permission request to a correlated continuation owner', async () => {
    const request = {
      requestId: 'permission-1',
      toolCall: { title: 'Write the approved draft' },
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' as const }],
    };
    const prompt = vi.fn(async (...args: unknown[]) => {
      const onPermission = args[4] as (value: typeof request) => void;
      onPermission(request);
      return { stopReason: 'end_turn' };
    });
    const owner = entry(prompt);
    const onPermission = vi.fn();

    await promptExistingAcpSession(owner, '需要工具', undefined, undefined, onPermission);

    expect(onPermission).toHaveBeenCalledWith(request);
    expect(owner.client.resolvePermission).not.toHaveBeenCalled();
  });
});
