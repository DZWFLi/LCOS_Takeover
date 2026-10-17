import assert from 'node:assert/strict';
import test from 'node:test';

import { CoreArtifactClient } from '../src/backend/artifacts.js';
import { HttpClient } from '../src/backend/client.js';

test('registered source controls reuse real GEN1 artifact routes, auth and cancellation without changing revision identity', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url).endsWith('/source-path') ? { path: 'E:/registered.pdf', exists: true, isUrl: false }
      : String(url).endsWith('/open') ? { opened: true, path: 'E:/registered.pdf' } : { revealed: true, path: 'E:/registered.pdf' };
    return new Response(JSON.stringify({ ok: true, value }), { status: 200 });
  };
  const signal = new AbortController().signal;
  const client = new CoreArtifactClient(new HttpClient({ baseUrl: 'http://127.0.0.1:4200', token: 'test-token', fetch: fetcher }));
  assert.deepEqual(await client.artifactSourcePath('artifact/exact', signal), { path: 'E:/registered.pdf', exists: true, isUrl: false });
  assert.equal((await client.openArtifactSource('artifact/exact', signal)).opened, true);
  assert.equal((await client.revealArtifactSource('artifact/exact', signal)).revealed, true);
  assert.deepEqual(calls.map(call => [call.url, call.init.method]), [
    ['http://127.0.0.1:4200/artifacts/artifact%2Fexact/source-path', 'GET'],
    ['http://127.0.0.1:4200/artifacts/artifact%2Fexact/open', 'POST'],
    ['http://127.0.0.1:4200/artifacts/artifact%2Fexact/reveal', 'POST'],
  ]);
  assert.ok(calls.every(call => call.init.signal === signal && (call.init.headers as Record<string, string>).Authorization === 'Bearer test-token'));
});
