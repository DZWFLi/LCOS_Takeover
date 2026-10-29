import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectId } from '@local-creative-os/domain';

import { SqliteMetadataRepository } from '../src/metadata-repository.js';
import { createLocalCoreServer, type LocalCoreServer } from '../src/server.js';
import { buildZip } from '../src/zip-writer.js';

const roots: string[] = [];
const repositories: SqliteMetadataRepository[] = [];
const servers: LocalCoreServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const repository of repositories.splice(0)) repository.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function archive(): Uint8Array {
  const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
  return buildZip([
    { path: 'manifest.json', bytes: bytes({ schemaVersion: 1, kind: 'lcos-workflow', title: 'Imported Workflow' }) },
    { path: 'workflow.json', bytes: bytes({ members: [], workspaces: [], edges: [], operators: {} }) },
    { path: 'references.json', bytes: bytes({ references: [] }) },
  ]);
}

describe('Workflow canonical import HTTP route', () => {
  it('creates a workflow scope/worksite and replay returns the same identities without duplicates', async () => {
    const dbRoot = mkdtempSync(join(tmpdir(), 'lcos-workflow-http-db-'));
    const projectRoot = mkdtempSync(join(tmpdir(), 'lcos-workflow-http-project-'));
    roots.push(dbRoot, projectRoot);
    const repository = new SqliteMetadataRepository(join(dbRoot, 'metadata.sqlite'));
    repositories.push(repository);
    repository.createProject({ id: 'project-workflow-http' as ProjectId, name: 'Workflow HTTP', rootPath: projectRoot });
    const server = createLocalCoreServer({ port: 0, metadataRepository: repository });
    servers.push(server);
    const address = await server.start();
    const endpoint = `http://${address.host}:${address.port}/projects/project-workflow-http/workflow/import-as-workflow`;

    const send = async () => {
      const form = new FormData();
      form.set('file', new Blob([archive()]), 'portable.lcos-workflow.zip');
      form.set('name', '内容审核流程');
      return fetch(endpoint, { method: 'POST', body: form });
    };

    const first = await send();
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { value: { created: boolean; scopeId: string; workspaceIds: string[] } };
    expect(firstBody.value.created).toBe(true);

    const second = await send();
    expect(second.status).toBe(200);
    const secondBody = await second.json() as { value: { created: boolean; scopeId: string; workspaceIds: string[] } };
    expect(secondBody.value).toEqual({
      ...firstBody.value,
      created: false,
    });

    const graph = repository.get('project-workflow-http')!;
    expect(graph.scopes.filter((scope) => scope.kind === 'workflow')).toHaveLength(1);
    expect(graph.workspaces.filter((workspace) => String(workspace.scopeId) === firstBody.value.scopeId)).toHaveLength(1);
  });
});
