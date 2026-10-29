import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpClient } from '../src/backend/client.js';
import { CoreConversationClient } from '../src/backend/conversations.js';

test('conversation chunk consumer sends exact bytes and uses the existing routes/auth/signal', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, value: { id: 'upload-real' } }), { status: 200 });
  };
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:4200', token: 'test-token', fetch: fetcher });
  const client = new CoreConversationClient(http), signal = new AbortController().signal;
  await client.createImportSession('project/real', { sourceKind: 'manual', sourceFileName: 'native.jsonl', scopeId: 'scope-real' }, signal);
  const raw = new Blob(['{"type":"session_meta"}\n{"type":"event_msg"}\n']);
  await client.uploadImportChunk('project/real', 'upload/real', 0, raw, signal);
  await client.completeImportSession('project/real', 'upload/real', { expectedChunks: 1 }, signal);
  assert.equal(calls[0]?.url, 'http://127.0.0.1:4200/projects/project%2Freal/conversation-import-sessions');
  assert.equal(calls[1]?.url, 'http://127.0.0.1:4200/projects/project%2Freal/conversation-import-sessions/upload%2Freal/chunks/0');
  assert.equal(calls[1]?.init.method, 'PUT');
  assert.equal(calls[1]?.init.body, raw);
  assert.equal(calls[1]?.init.signal, signal);
  assert.equal((calls[1]?.init.headers as Record<string, string>)['Content-Type'], 'application/octet-stream');
  assert.equal((calls[1]?.init.headers as Record<string, string>)['Authorization'], 'Bearer test-token');
  assert.equal(calls[2]?.init.body, JSON.stringify({ expectedChunks: 1 }));
  assert.equal(calls[2]?.url, 'http://127.0.0.1:4200/projects/project%2Freal/conversation-import-sessions/upload%2Freal/complete');
});
