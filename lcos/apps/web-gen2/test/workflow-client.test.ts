import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpClient } from '../src/backend/client.js';
import { CoreWorkflowClient } from '../src/backend/workflows.js';
import { Gen2Host } from '../src/host/projectionFacade.js';
import { HuabuRfsClient } from '../src/spatial/huabuRfsClient.js';

test('CoreWorkflowClient posts the archive as multipart and unwraps the canonical receipt', async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({
      ok: true,
      value: {
        imported: true,
        created: true,
        scopeId: 'scope-workflow-a',
        workspaceIds: ['workspace-workflow-a'],
        members: 2,
        workspaces: 1,
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const client = new CoreWorkflowClient(new HttpClient({ baseUrl: 'http://core.test', token: 'token', fetch: fetcher }));
  const receipt = await client.importAsWorkflow('p 1', new Blob(['zip']), 'flow.lcos-workflow.zip', '审核流程');

  assert.equal(receipt.scopeId, 'scope-workflow-a');
  assert.equal(request?.url, 'http://core.test/projects/p%201/workflow/import-as-workflow');
  assert.equal(request?.headers.get('authorization'), 'Bearer token');
  assert.match(request?.headers.get('content-type') ?? '', /^multipart\/form-data; boundary=/);
  const form = await request?.formData();
  assert.equal(form?.get('name'), '审核流程');
  assert.equal((form?.get('file') as File | null)?.name, 'flow.lcos-workflow.zip');
});

test('Gen2Host import caller notifies the single reconciler after Core accepts the workflow', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    ok: true,
    value: {
      imported: true,
      created: true,
      scopeId: 'scope-workflow-a',
      workspaceIds: ['workspace-workflow-a'],
      members: 0,
      workspaces: 1,
    },
  }), { status: 201, headers: { 'content-type': 'application/json' } });
  const host = new Gen2Host({
    projectId: 'p-1',
    http: new HttpClient({ baseUrl: 'http://core.test', fetch: fetcher }),
    rfs: new HuabuRfsClient({ canvasId: 'canvas-main', baseUrl: 'http://huabu.test', bearerToken: 'token', fetch: fetcher }),
  });
  let mutationSignals = 0;
  host.reconciler.onMutationSuccess = () => { mutationSignals += 1; };

  await host.importWorkflowDefinition(new Blob(['zip']), 'flow.lcos-workflow.zip');
  assert.equal(mutationSignals, 1);
});
