import { isDeepStrictEqual } from 'node:util';

type Request = { method?: string; pathname?: string; url?: string | URL; body?: unknown };
type Result = { status: number; body: unknown };
type Entry = { requestId: string; canvasId: string; wireBody: unknown; bytes: number;
  pending: boolean; unavailable: boolean; result?: Result; promise?: Promise<Result> };

const tokenPattern = /^surface-native-batch-[A-Za-z0-9-]{3,120}$/;
const fail = (status: number, code: string) => ({ status, body: { ok: false, error: { code } } });
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** A bounded copy of the actual in-process HTTP result, not a material or
 * operation journal. It never rebuilds success from a matching text body. */
export function createNativeTextResponseCache({ execute, ownsCanvas, maxEntries = 32, maxBytes = 16 * 1024 * 1024 }: {
  execute(request: Request): Promise<Result>;
  ownsCanvas(canvasId: string): boolean;
  maxEntries?: number; maxBytes?: number;
}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1024)
    throw new TypeError('A bounded transport cache is required.');
  const entries = new Map<string, Entry>();
  let bytes = 0;
  const key = (canvasId: string, requestId: string) => JSON.stringify([canvasId, requestId]);
  const evict = (keep?: Entry) => {
    for (const [id, entry] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      if (entry === keep || entry.pending) continue;
      entries.delete(id); bytes -= entry.bytes;
    }
  };
  return {
    handle(request: Request): Result | Promise<Result> | null {
      const url = request.url instanceof URL ? request.url : new URL(request.url ?? request.pathname ?? '/', 'http://127.0.0.1');
      const route = request.pathname ?? url.pathname;
      const read = /^\/api\/lcos\/canvases\/([^/]+)\/text-save-receipts\/([^/]+)$/.exec(route);
      if (read) {
        if ((request.method ?? 'GET').toUpperCase() !== 'GET') return fail(405, 'TEXT_RECEIPT_READ_ONLY');
        let canvasId: string, requestId: string;
        try { canvasId = decodeURIComponent(read[1]!); requestId = decodeURIComponent(read[2]!); }
        catch { return fail(400, 'TEXT_RECEIPT_ADDRESS_INVALID'); }
        if (!tokenPattern.test(requestId) || !ownsCanvas(canvasId)) return fail(404, 'TEXT_RECEIPT_NOT_FOUND');
        const entry = entries.get(key(canvasId, requestId));
        if (!entry || entry.unavailable) return fail(404, 'TEXT_RECEIPT_NOT_FOUND');
        if (entry.pending) return fail(202, 'TEXT_RECEIPT_PENDING');
        if (!entry.result) return fail(404, 'TEXT_RECEIPT_NOT_FOUND');
        return { status: 200, body: { ok: true, value: structuredClone({ requestId, canvasId,
          wireBody: entry.wireBody, status: entry.result.status, body: entry.result.body }) } };
      }
      const batch = /^\/api\/canvas\/v1\/canvases\/([^/]+)\/nodes:batchActions$/.exec(route);
      const token = url.searchParams.get('lcos_text_save_request');
      if (!batch || request.method?.toUpperCase() !== 'POST' || token === null) return null;
      let canvasId: string;
      try { canvasId = decodeURIComponent(batch[1]!); } catch { return fail(400, 'TEXT_RECEIPT_ADDRESS_INVALID'); }
      if (!tokenPattern.test(token)) return fail(400, 'TEXT_RECEIPT_TOKEN_INVALID');
      if (!ownsCanvas(canvasId)) return fail(404, 'TEXT_RECEIPT_NOT_FOUND');
      const body = request.body;
      if (!record(body) || body.canvas_id !== canvasId || !record(body.lcos_expected_revisions)
        || !Array.isArray(body.actions) || !body.actions.some(action => record(action) && action.action === 'update'
          && Array.isArray(action.updates) && action.updates.some(update => record(update)
            && typeof update.id === 'string' && typeof body.lcos_expected_revisions[update.id] === 'string'
            && record(update.data) && typeof update.data.text === 'string')))
        return fail(400, 'TEXT_RECEIPT_REQUEST_INVALID');
      const id = key(canvasId, token), previous = entries.get(id);
      if (previous) {
        if (previous.unavailable || !isDeepStrictEqual(previous.wireBody, body)) return fail(409, 'TEXT_RECEIPT_TOKEN_REUSED');
        if (!previous.pending && !previous.result) return fail(409, 'TEXT_RECEIPT_RESULT_UNAVAILABLE');
        return previous.pending ? previous.promise!.then(result => structuredClone(result)) : structuredClone(previous.result!);
      }
      const wireBody = structuredClone(body), initialBytes = size(wireBody);
      if (initialBytes > maxBytes) return fail(413, 'TEXT_RECEIPT_REQUEST_TOO_LARGE');
      if (entries.size >= maxEntries || bytes + initialBytes > maxBytes) {
        // Completed entries can be forgotten, never an in-flight promise whose
        // repeated token would otherwise execute the same writer again.
        for (const [oldId, old] of entries) {
          if (old.pending) continue;
          entries.delete(oldId); bytes -= old.bytes;
          if (entries.size < maxEntries && bytes + initialBytes <= maxBytes) break;
        }
      }
      if (entries.size >= maxEntries || bytes + initialBytes > maxBytes) return fail(503, 'TEXT_RECEIPT_CAPACITY_BUSY');
      const entry: Entry = { requestId: token, canvasId, wireBody, pending: true, unavailable: false,
        bytes: initialBytes };
      entries.set(id, entry); bytes += initialBytes;
      const pendingPromise = Promise.resolve().then(() => execute({ ...request, body: structuredClone(wireBody) })).then(result => {
        entry.pending = false; entry.promise = undefined;
        const resultBytes = size(result);
        if (resultBytes + initialBytes > maxBytes) {
          // Keep a small tombstone: do not cache a huge reply or let reuse of
          // this still-known token cause another cross-system write.
          bytes -= entry.bytes; entry.wireBody = null; entry.bytes = 0; entry.unavailable = true;
        } else {
          entry.result = structuredClone(result); entry.bytes += resultBytes; bytes += resultBytes; evict(entry);
          if (bytes > maxBytes) { bytes -= entry.bytes; entry.result = undefined; entry.wireBody = null; entry.bytes = 0; entry.unavailable = true; }
        }
        return result;
      }, error => {
        entry.pending = false; entry.promise = undefined; entry.unavailable = true; bytes -= entry.bytes; entry.bytes = 0; entry.wireBody = null;
        throw error;
      });
      entry.promise = pendingPromise;
      return pendingPromise;
    },
  };
}
