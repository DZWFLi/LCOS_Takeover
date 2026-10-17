import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoreArtifactClient } from '../src/backend/artifacts.js';
import { HttpClient } from '../src/backend/client.js';

test('material text uses the original scope/workspace and canonical text endpoint', async () => {
  let body: unknown; let url = '';
  const client = new CoreArtifactClient(new HttpClient({ baseUrl: 'http://core', fetch: async (input, init) => {
    url = String(input); body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, value: { artifactId: 'a', revisionId: 'r', viewId: 'v', fileRecordId: 'f', title: '摘录' } }));
  } }));
  const input = { title: '摘录', body: '真实正文', scopeId: 'scope-original', workspaceId: 'w', x: 10, y: 20 };
  const receipt = await client.createTextArtifact('project /', input);
  assert.equal(url, 'http://core/projects/project%20%2F/text-artifacts'); assert.deepEqual(body, input); assert.equal(receipt.artifactId, 'a');
});
test('material file transports actual bytes and original position without a browser path', async () => {
  const client = new CoreArtifactClient(new HttpClient({ baseUrl: 'http://core', token: 'fixture-token', fetch: async (_input, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-token');
    assert.equal((init?.headers as Record<string, string>)['Content-Type'], undefined);
    const form = init?.body as FormData;
    assert.equal(form.get('scopeId'), 'scope-original'); assert.equal(form.get('position.x'), '11');
    assert.equal(form.get('importRequestId'), 'original-attempt'); assert.equal(form.has('path'), false);
    assert.equal(await (form.get('file') as File).text(), '<svg>actual-page</svg>');
    return new Response(JSON.stringify({ ok: true, value: { artifact: { id: 'a' }, revision: { id: 'r' }, view: { id: 'v' }, reused: false } }));
  } }));
  const reply = await client.importCopiedFile('p', { file: new File(['<svg>actual-page</svg>'], 'slide.svg', { type: 'image/svg+xml' }),
    importRequestId: 'original-attempt', scopeId: 'scope-original', position: { x: 11, y: 22 } });
  assert.equal(reply.artifact.id, 'a');
});
