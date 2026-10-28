import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CanvasSyncEvent } from '../../lcos/huabu/packages/shared/src/types/api/canvas-sync.ts';
import { subscribeCanvasUpdates } from '../../lcos/huabu/apps/server/src/modules/canvas/canvas-sync.ts';

export interface NativeCanvasOwner { projectId: string; workspaceId: string; canvasId: string }
export interface NativeCanvasSyncOptions {
  resolveCanvas(canvasId: string): NativeCanvasOwner | undefined | Promise<NativeCanvasOwner | undefined>;
  readSnapshot(canvasId: string, options?: { signal: AbortSignal }): Promise<{ version: number }>;
  maxBufferedBytes?: number;
  heartbeatMs?: number;
}
const validId = (id: string) => !!id && !/[\\/\u0000-\u001f]/.test(id);
const sameOwner = (a: NativeCanvasOwner, b?: NativeCanvasOwner) => !!b && a.projectId === b.projectId
  && a.workspaceId === b.workspaceId && a.canvasId === b.canvasId;

/** The original Huabu publisher remains the only event source. HTTP auth is
 * owned by the caller, before this exact local Canvas route is dispatched. */
export function createNativeCanvasSyncStream(options: NativeCanvasSyncOptions) {
  const maxBytes = options.maxBufferedBytes ?? 1_048_576;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64 || !Number.isFinite(heartbeatMs) || heartbeatMs <= 0)
    throw new TypeError('Invalid Canvas stream resource limits.');
  const connections = new Set<() => void>();
  let disposed = false;
  const json = (res: ServerResponse, status: number, code: string, message: string) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: { code, message } }));
  };
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const match = /^\/api\/canvas\/([^/]+)\/sync\/stream$/.exec(url.pathname);
    if (!match) return false;
    if (req.method !== 'GET') { json(res, 405, 'METHOD_NOT_ALLOWED', 'Canvas sync requires GET.'); return true; }
    let canvasId: string;
    try { canvasId = decodeURIComponent(match[1]!); } catch { json(res, 400, 'INVALID_CANVAS_ID', 'Invalid Canvas identifier.'); return true; }
    if (!validId(canvasId)) { json(res, 400, 'INVALID_CANVAS_ID', 'Invalid Canvas identifier.'); return true; }
    if (disposed) { json(res, 503, 'CANVAS_SYNC_CLOSED', 'Canvas sync is closed.'); return true; }
    const owner = await options.resolveCanvas(canvasId);
    if (!owner || owner.canvasId !== canvasId || !validId(owner.projectId) || !validId(owner.workspaceId)) {
      json(res, 404, 'CANVAS_NOT_REGISTERED', 'This Canvas is not an opened project workspace.'); return true;
    }
    if (disposed) { json(res, 503, 'CANVAS_SYNC_CLOSED', 'Canvas sync is closed.'); return true; }
    if (req.aborted || res.destroyed || res.writableEnded) return true;
    let closed = false, ready = false, blocked = false, bytes = 0;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const queue: string[] = [];
    const controller = new AbortController();
    function close() {
      if (closed) return;
      closed = true;
      controller.abort();
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      queue.length = 0; bytes = 0;
      connections.delete(close);
      req.off('aborted', close);
      res.off('close', close); res.off('error', close); res.off('drain', drain);
      if (!res.destroyed && !res.writableEnded) res.end();
    }
    function overflow() {
      if (!res.headersSent) json(res, 503, 'CANVAS_SYNC_BACKPRESSURE', 'Canvas changed too quickly; reconnect to read the current snapshot.');
      close();
    }
    function flush() {
      if (closed || !ready || blocked) return;
      while (queue.length && !blocked && !closed) {
        const frame = queue.shift()!; bytes -= Buffer.byteLength(frame);
        try { blocked = !res.write(frame); } catch { close(); }
      }
    }
    function drain() { blocked = false; flush(); }
    function enqueue(frame: string, first = false) {
      if (closed) return;
      const size = Buffer.byteLength(frame);
      if (bytes + size + (res.writableLength || 0) > maxBytes) { overflow(); return; }
      if (first) queue.unshift(frame); else queue.push(frame);
      bytes += size; flush();
    }
    const frame = (event: CanvasSyncEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    req.on('aborted', close);
    res.on('close', close); res.on('error', close); res.on('drain', drain);
    connections.add(close);
    // Subscribe first: writes committed during the baseline read are buffered,
    // never silently lost or delivered before its original snapshot event.
    unsubscribe = subscribeCanvasUpdates(canvasId, event => enqueue(frame(event)));
    try {
      const snapshot = await options.readSnapshot(canvasId, { signal: controller.signal });
      if (closed) return true;
      const currentOwner = await options.resolveCanvas(canvasId);
      if (closed) return true;
      if (!sameOwner(owner, currentOwner)) { json(res, 409, 'CANVAS_OWNER_CHANGED', 'The opened Canvas workspace changed.'); close(); return true; }
      if (!Number.isSafeInteger(snapshot?.version) || snapshot.version < 0) throw new Error('Invalid original Canvas version.');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.();
      enqueue(frame({ type: 'snapshot', data: { version: snapshot.version } }), true);
      ready = true; flush();
      if (!closed) {
        heartbeat = setInterval(() => {
          if (closed || blocked || queue.length) return;
          try { blocked = !res.write(': ping\n\n'); } catch { close(); }
        }, heartbeatMs);
        heartbeat.unref?.();
      }
    } catch {
      if (!closed) {
        if (!res.headersSent) json(res, 503, 'CANVAS_SNAPSHOT_UNAVAILABLE', 'The current Canvas snapshot could not be read.');
        close();
      }
    }
    return true;
  }
  return { handle, dispose() { disposed = true; for (const close of [...connections]) close(); } };
}
