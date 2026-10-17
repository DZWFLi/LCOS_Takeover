import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLocalCoreServer } from '../../lcos/apps/local-core/src/server.ts';
import { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import { createMvpSampleSnapshot, MVP_SAMPLE_PROJECT_ID } from '../../lcos/apps/local-core/src/mvp-sample-project.ts';
import { ExplicitProjectCatalog } from '../../lcos/apps/local-core/src/project-catalog.ts';

export async function startCorePilot({ runtimeRoot, port = 0, canvasId = 'takeover-pilot-canvas' }) {
  const projectRoot = path.join(runtimeRoot, 'synthetic-project');
  await mkdir(projectRoot, { recursive: true });
  const repository = new SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'));
  let server;
  try {
  if (!repository.getProject(String(MVP_SAMPLE_PROJECT_ID))) repository.save(createMvpSampleSnapshot(projectRoot));
  const project = repository.getProject(String(MVP_SAMPLE_PROJECT_ID));
  const site = repository.getWorkspaces(String(project.id))[0];
  repository.upsertWorkspace({ ...site, canvasId });
  const catalog = new ExplicitProjectCatalog([{ id: project.id, name: project.name, rootPath: project.rootPath, graphVersion: project.graphVersion }]);
  server = createLocalCoreServer({ metadataRepository: repository, catalog, port,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'), agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: ['http://127.0.0.1:17879'] });
    const address = await server.start();
    return { repository, server, origin: 'http://' + address.host + ':' + address.port,
      projectId: String(project.id), scopeId: String(site.scopeId), workspaceId: String(site.id), canvasId,
      async close() { await server.close(); repository.close(); } };
  } catch (error) { if(server)await server.close().catch(() => {}); repository.close(); throw error; }
}
