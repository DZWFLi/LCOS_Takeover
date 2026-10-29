// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { describe, expect, it, vi } from 'vitest';

import { forwardAcpPermissionRequestToCore } from './provider-run-event-sink.js';

describe('forwardAcpPermissionRequestToCore', () => {
  it('normalizes an ACP permission_request with exact Run correlation', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await forwardAcpPermissionRequestToCore(
      'http://127.0.0.1:43121',
      'core-token',
      { lcosRunId: 'run-1', externalTaskId: 'task-1' },
      {
        requestId: 'permission-1',
        toolCall: { title: 'Write the approved draft' },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
        ],
      },
      fetcher,
    );

    expect(capturedUrl).toBe('http://127.0.0.1:43121/runtime/provider-events');
    expect(capturedInit?.headers).toMatchObject({ authorization: 'Bearer core-token' });
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      contractVersion: 'provider-run-event-v1',
      type: 'waiting_input',
      correlation: { lcosRunId: 'run-1', externalTaskId: 'task-1' },
      request: {
        requestId: 'permission-1',
        prompt: 'Write the approved draft',
        options: ['allow-once', 'deny'],
        allowFreeText: false,
      },
    });
  });

  it('fails closed when Core rejects the correlation', async () => {
    const fetcher = vi.fn(async () =>
      new Response('{"error":{"message":"Runtime result task correlation mismatch."}}', {
        status: 409,
      }),
    );

    await expect(
      forwardAcpPermissionRequestToCore(
        'http://127.0.0.1:43121',
        'core-token',
        { lcosRunId: 'run-1', externalTaskId: 'wrong-task' },
        {
          requestId: 'permission-1',
          toolCall: {},
          options: [{ optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
        },
        fetcher,
      ),
    ).rejects.toThrow('Local Core rejected ACP permission_request (409)');
  });

  it('rejects empty ACP request identifiers before any Core call', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    await expect(
      forwardAcpPermissionRequestToCore(
        'http://127.0.0.1:43121',
        'core-token',
        { lcosRunId: 'run-1', externalTaskId: 'task-1' },
        {
          requestId: '   ',
          toolCall: { title: 'Write' },
          options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
        },
        fetcher,
      ),
    ).rejects.toThrow('requires non-empty')
    expect(fetcher).not.toHaveBeenCalled()
  });
});
