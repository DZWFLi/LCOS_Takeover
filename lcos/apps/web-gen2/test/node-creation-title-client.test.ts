import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpClient } from '../src/backend/client.js';
import { CoreArtifactClient } from '../src/backend/artifacts.js';
import { CoreAssemblyClient } from '../src/backend/assembly.js';

test('manual titles and blank slots use existing canonical routes and exact request bodies', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, value: {} }), { status: 200 });
  };
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:4200', fetch: fetcher });
  await new CoreArtifactClient(http).renameEntity('artifact', 'a/1', 'Human');
  await new CoreAssemblyClient(http).createResultSlot('p/1', { scopeId: 'scope-real', workspaceId: 'workspace-real', x: 100, y: 200 });
  assert.equal(calls[0]?.url, 'http://127.0.0.1:4200/entities/artifact/a%2F1/title');
  assert.deepEqual(calls[0]?.body, { title: 'Human', mode: 'manual', generatedBy: 'user' });
  assert.equal(calls[1]?.url, 'http://127.0.0.1:4200/projects/p%2F1/result-slots');
  assert.deepEqual(calls[1]?.body, { scopeId: 'scope-real', workspaceId: 'workspace-real', x: 100, y: 200 });
});
