import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HttpClient } from '../src/backend/client.js';
import { CoreTemporalClient } from '../src/backend/temporal.js';

test('temporal client requests a workspace-scoped deterministic index', async () => {
  let requested = '';
  const http = new HttpClient({
    baseUrl: 'http://core.test',
    fetch: async (input) => {
      requested = typeof input === 'string' ? input : input.url;
      return new Response(JSON.stringify({
        ok: true,
        value: {
          schemaVersion: 1, projectId: 'p/a', workspaceId: 'w b', scopeId: 'scope',
          source: 'canonical_durable_records', facts: [], far: [], mid: [],
          omissions: ['conversation_timeline_unscoped', 'project_event_hub_ephemeral'],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const result = await new CoreTemporalClient(http).getIndex('p/a', 'w b');
  assert.equal(requested, 'http://core.test/projects/p%2Fa/temporal-index?workspaceId=w%20b');
  assert.equal(result.value.source, 'canonical_durable_records');
});
