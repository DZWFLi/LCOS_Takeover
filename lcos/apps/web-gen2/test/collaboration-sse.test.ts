import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CoreCollaborationClient } from '../src/backend/collaboration.js';
import { HttpClient } from '../src/backend/client.js';

const BASE = 'http://core.test';
const encoder = new TextEncoder();

interface ControlledStream {
  readonly response: Response;
  readonly push: (chunk: string) => void;
  readonly close: () => void;
}

function controlledResponse(initial: readonly string[] = [], hold = false): ControlledStream {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let ended = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      for (const chunk of initial) controller.enqueue(encoder.encode(chunk));
      if (!hold) {
        controller.close();
        ended = true;
      }
    },
    cancel() { ended = true; },
  });
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } }),
    push: (chunk) => {
      if (!ended) streamController?.enqueue(encoder.encode(chunk));
    },
    close: () => {
      if (ended) return;
      ended = true;
      streamController?.close();
    },
  };
}

function frame(event: string, value: unknown, id?: number): string {
  return `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify({ ok: true, value })}\n\n`;
}

function projectEvent(projectSeq: number, type: string, runtimeId = 'runtime-a'): Record<string, unknown> {
  return {
    runtimeId,
    projectId: 'p-1',
    projectSeq,
    channel: type.startsWith('run') ? 'run' : type.startsWith('continuity') ? 'continuity' : 'mutation',
    type,
    timestamp: `2026-09-29T00:00:${String(projectSeq).padStart(2, '0')}.000Z`,
    payload: {},
  };
}

function snapshot(currentSeq: number, runtimeId = 'runtime-a'): Record<string, unknown> {
  return { runtimeId, projectId: 'p-1', currentSeq, presentations: [], workStates: [] };
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('SSE reconnect resumes from accepted snapshot/runtime cursor and keeps bearer auth', async () => {
  const calls: Array<{ url: string; authorization: string | null; signal: AbortSignal }> = [];
  let held: ControlledStream | undefined;
  let secondSignal: AbortSignal | undefined;
  const http = new HttpClient({
    baseUrl: BASE,
    token: 'local-token',
    fetch: async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const signal = init?.signal as AbortSignal;
      calls.push({ url, authorization: headers.get('authorization'), signal });
      if (calls.length === 1) {
        const payload = `: ping\r\n\r\nevent: snapshot\r\ndata: {"ok":true,\r\ndata: "value":${JSON.stringify(snapshot(4))}}\r\n\r\n`;
        const middle = Math.floor(payload.length / 2);
        return controlledResponse([payload.slice(0, middle), payload.slice(middle)]).response;
      }
      const replay = {
        kind: 'replay', runtimeId: 'runtime-a', currentSeq: 5,
        events: [projectEvent(5, 'run.changed')],
      };
      held = controlledResponse([
        frame('replay', replay),
        frame('project-event', projectEvent(6, 'work_state.changed'), 6),
      ], true);
      secondSignal = signal;
      return held.response;
    },
  });
  const client = new CoreCollaborationClient(http);
  const received: string[] = [];
  const projectEvents: number[] = [];
  const unsubscribe = client.subscribe('p-1', 'c-1', (event) => received.push(event.kind), {
    onProjectEvent: (event) => projectEvents.push(event.projectSeq),
  });
  assert.ok(unsubscribe);

  await waitFor(() => calls.length >= 2 && projectEvents.length === 2, 'replayed and live project events');
  assert.equal(calls[0]?.url, `${BASE}/projects/p-1/events`);
  assert.match(calls[1]?.url ?? '', /lastSeenProjectSeq=4/);
  assert.match(calls[1]?.url ?? '', /runtimeId=runtime-a/);
  assert.deepEqual(calls.map((call) => call.authorization), ['Bearer local-token', 'Bearer local-token']);
  assert.deepEqual(projectEvents, [5, 6]);
  assert.deepEqual(received, ['session.changed', 'session.changed', 'timeline.appended', 'session.changed']);

  unsubscribe();
  assert.equal(secondSignal?.aborted, true);
  held?.close();
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(calls.length, 2, 'unsubscribe must prevent another reconnect');
});

test('SSE sequence gap discards stale cursor and accepts the replacement runtime snapshot', async () => {
  const urls: string[] = [];
  let replacement: ControlledStream | undefined;
  const http = new HttpClient({
    baseUrl: BASE,
    fetch: async (input) => {
      urls.push(String(input));
      if (urls.length === 1) return controlledResponse([frame('snapshot', snapshot(5))]).response;
      if (urls.length === 2) {
        return controlledResponse([frame('project-event', projectEvent(7, 'run.changed'), 7)]).response;
      }
      replacement = controlledResponse([frame('snapshot', snapshot(1, 'runtime-b'))], true);
      return replacement.response;
    },
  });
  const client = new CoreCollaborationClient(http);
  let invalidations = 0;
  const unsubscribe = client.subscribe('p-1', '*', () => { invalidations += 1; });
  assert.ok(unsubscribe);

  await waitFor(() => urls.length >= 3 && invalidations >= 2, 'snapshot recovery after sequence gap');
  assert.match(urls[1] ?? '', /lastSeenProjectSeq=5/);
  assert.match(urls[1] ?? '', /runtimeId=runtime-a/);
  assert.equal(urls[2], `${BASE}/projects/p-1/events`, 'gap recovery must request a fresh snapshot without stale cursor');

  unsubscribe();
  replacement?.close();
});

test('SSE unsubscribe aborts a live response and clears a pending retry', async () => {
  const calls: Array<{ signal: AbortSignal }> = [];
  const http = new HttpClient({
    baseUrl: BASE,
    fetch: async (_input, init) => {
      calls.push({ signal: init?.signal as AbortSignal });
      return controlledResponse([], true).response;
    },
  });
  const client = new CoreCollaborationClient(http);
  const unsubscribe = client.subscribe('p-1', '*', () => undefined);
  assert.ok(unsubscribe);
  await waitFor(() => calls.length === 1, 'first SSE request');
  unsubscribe();
  assert.equal(calls[0]?.signal.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(calls.length, 1, 'aborting a live stream must not schedule a retry');
});

test('offline-open SSE is aborted; online forces one cursorless snapshot and recovery invalidation', async () => {
  const listeners = new Map<string, Set<EventListener>>();
  const previousAdd = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
  const previousRemove = Object.getOwnPropertyDescriptor(globalThis, 'removeEventListener');
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: (type: string, callback: EventListener) => {
    const bucket = listeners.get(type) ?? new Set<EventListener>(); bucket.add(callback); listeners.set(type, bucket);
  } });
  Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: (type: string, callback: EventListener) => {
    listeners.get(type)?.delete(callback);
  } });
  const dispatchConnectivity = (type: string): void => {
    for (const callback of listeners.get(type) ?? []) callback(new Event(type));
  };
  try {
    const calls: Array<{ url: string; signal: AbortSignal }> = [];
    let oldStream: ControlledStream | undefined;
    let resumedStream: ControlledStream | undefined;
    const http = new HttpClient({
      baseUrl: BASE,
      fetch: async (input, init) => {
        const url = String(input);
        const signal = init?.signal as AbortSignal;
        calls.push({ url, signal });
        if (calls.length === 1) {
          oldStream = controlledResponse([frame('snapshot', snapshot(10))], true);
          return oldStream.response;
        }
        resumedStream = controlledResponse([frame('snapshot', snapshot(11))], true);
        return resumedStream.response;
      },
    });
    const client = new CoreCollaborationClient(http);
    let sessionRefreshes = 0;
    let archiveAndHostRecoveries = 0;
    const unsubscribe = client.subscribe('p-1', '*', (event) => {
      if (event.kind === 'session.changed') sessionRefreshes += 1;
    }, { onProjectRecovery: () => { archiveAndHostRecoveries += 1; } });
    assert.ok(unsubscribe);
    await waitFor(() => calls.length === 1 && archiveAndHostRecoveries === 1, 'initial snapshot');

    dispatchConnectivity('offline');
    await waitFor(() => calls[0]?.signal.aborted === true, 'offline abort of still-open SSE');
    dispatchConnectivity('online');
    await waitFor(() => calls.length === 2 && archiveAndHostRecoveries === 2, 'online snapshot recovery');
    assert.equal(calls[1]?.url, `${BASE}/projects/p-1/events`, 'online recovery must discard the cursor');
    assert.equal(calls[0]?.signal.aborted, true, 'the old open stream must be stopped before recovery');
    assert.equal(sessionRefreshes, 2);
    assert.equal(archiveAndHostRecoveries, 2, 'recovery invalidation is delivered once per snapshot');

    unsubscribe();
    assert.equal(listeners.get('offline')?.size ?? 0, 0, 'unsubscribe removes offline listener');
    assert.equal(listeners.get('online')?.size ?? 0, 0, 'unsubscribe removes online listener');
    resumedStream?.close();
    oldStream?.close();
  } finally {
    if (previousAdd === undefined) Reflect.deleteProperty(globalThis, 'addEventListener');
    else Object.defineProperty(globalThis, 'addEventListener', previousAdd);
    if (previousRemove === undefined) Reflect.deleteProperty(globalThis, 'removeEventListener');
    else Object.defineProperty(globalThis, 'removeEventListener', previousRemove);
  }
});
