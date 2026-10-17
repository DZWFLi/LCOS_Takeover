import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'
import { MutationSafetyService } from '../src/mutation-safety-service.js'
import { PresentationApplicationService } from '../src/presentation-application-service.js'
import { ProjectEventHub } from '../src/project-events/project-event-hub.js'
import { ProjectSearchService } from '../src/project-search-service.js'
import { WarehouseService } from '../src/warehouse-service.js'
import { handleEntityRoute } from '../src/routes/entity.js'

const roots: string[] = []
const repositories: SqliteMetadataRepository[] = []
const AT = '2026-09-20T00:00:00.000Z'

function setup() {
  const dbRoot = mkdtempSync(join(tmpdir(), 'lcos-archive-db-'))
  const projectRoot = mkdtempSync(join(tmpdir(), 'lcos-archive-project-'))
  roots.push(dbRoot, projectRoot)
  const dbPath = join(dbRoot, 'metadata.sqlite')
  const repository = new SqliteMetadataRepository(dbPath)
  repositories.push(repository)
  const graph = createMvpSampleSnapshot(projectRoot, AT)
  repository.save(graph)
  const projectId = String(graph.project.id)
  const artifact = graph.artifacts[0]!
  const artifactId = String(artifact.id)
  const events = new ProjectEventHub()
  const presentation = new PresentationApplicationService(repository, repository, undefined, events)
  const lifecycle = new MutationSafetyService(repository, presentation, events)
  return { dbPath, repository, graph, projectId, artifactId, events, lifecycle }
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    try { repository.close() } catch { /* already closed */ }
  }
  for (const root of roots.splice(0)) {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* best effort */ }
  }
})

describe('Artifact archive lifecycle vertical', () => {
  const entityRoute = async (s: ReturnType<typeof setup>, method: string, pathname: string, body: unknown = {}) => {
    const request = Readable.from(method === 'POST' ? [Buffer.from(JSON.stringify(body))] : []) as never
    Object.assign(request as object, { url: pathname })
    return handleEntityRoute({
      method,
      pathname: pathname.split('?', 1)[0]!,
      metadata: s.repository,
      mutationSafety: s.lifecycle,
      fileObservation: undefined,
      previewWorker: undefined,
      request,
      signal: new AbortController().signal,
      helpers: {
        failure: (code: string, message: string) => ({ ok: false, error: { code, message } }),
        readJsonBody: async (source: AsyncIterable<Buffer>) => {
          const chunks: Buffer[] = []
          for await (const chunk of source) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
        },
      },
    })
  }

  it('migrates a populated v55 database to v57 without losing the project graph', () => {
    const s = setup()
    const viewCount = s.repository.getArtifactViews(s.artifactId).length
    const revisionCount = s.repository.getArtifactRevisions(s.artifactId).length
    s.repository.close()
    repositories.pop()

    const legacy = new DatabaseSync(s.dbPath)
    legacy.exec(`
      DROP INDEX IF EXISTS idx_artifacts_project_archived;
      ALTER TABLE artifacts DROP COLUMN archived_at;
      PRAGMA user_version = 55;
    `)
    legacy.close()

    const reopened = new SqliteMetadataRepository(s.dbPath)
    repositories.push(reopened)
    expect(reopened.schemaVersion).toBe(57)
    expect(reopened.getArtifact(s.artifactId)?.archivedAt).toBeUndefined()
    expect(reopened.getArtifactViews(s.artifactId)).toHaveLength(viewCount)
    expect(reopened.getArtifactRevisions(s.artifactId)).toHaveLength(revisionCount)
    expect(reopened.get(s.projectId)?.relations).toHaveLength(s.graph.relations.length)
  })

  it('archives idempotently, keeps canonical graph/history, exits active projections, restores and survives reload', async () => {
    const s = setup()
    const beforeViews = s.repository.getArtifactViews(s.artifactId)
    const beforeRevisions = s.repository.getArtifactRevisions(s.artifactId)
    const events: Array<{ readonly type: string }> = []
    const unsubscribe = s.events.subscribe(s.projectId, (event) => events.push({ type: event.type }))
    const changeSetsBefore = s.lifecycle.list(s.projectId).length

    const archived = s.lifecycle.archiveArtifact({ projectId: s.projectId, artifactId: s.artifactId, operationId: 'archive-once' })
    expect(archived.artifact.archivedAt).toBeTruthy()
    expect(archived.changeSet).toBeDefined()
    expect(events.map((event) => event.type)).toEqual(['artifact.changed', 'change_set.changed'])
    expect(s.lifecycle.list(s.projectId)).toHaveLength(changeSetsBefore + 1)

    const repeatedArchive = s.lifecycle.archiveArtifact({ projectId: s.projectId, artifactId: s.artifactId, operationId: 'archive-retry' })
    expect(repeatedArchive.changeSet).toBeUndefined()
    expect(events).toHaveLength(2)
    expect(s.lifecycle.list(s.projectId)).toHaveLength(changeSetsBefore + 1)

    const graphWhileArchived = s.repository.get(s.projectId)!
    expect(graphWhileArchived.artifacts.find((artifact) => String(artifact.id) === s.artifactId)?.archivedAt).toBe(archived.artifact.archivedAt)
    expect(s.repository.getArtifactViews(s.artifactId)).toEqual(beforeViews)
    expect(s.repository.getArtifactRevisions(s.artifactId)).toEqual(beforeRevisions)
    expect(graphWhileArchived.relations).toHaveLength(s.graph.relations.length)

    const warehouse = new WarehouseService(s.repository)
    expect(warehouse.query(s.projectId).items.some((item) => item.entityRef.type === 'artifact' && item.entityRef.id === s.artifactId)).toBe(false)
    const search = new ProjectSearchService(s.repository, undefined, undefined)
    const activeSearch = await search.search(s.projectId, archived.artifact.title, { types: ['artifact'] })
    expect(activeSearch.hits.some((hit) => String(hit.entityId) === s.artifactId)).toBe(false)
    const workspaceId = String(s.graph.workspaces[0]!.id)
    const archiveSearch = await search.search(s.projectId, archived.artifact.title, {
      types: ['artifact'], includeArchived: true, usedHereTarget: { kind: 'workspace', id: workspaceId },
    })
    const archiveHit = archiveSearch.hits.find((hit) => String(hit.entityId) === s.artifactId)
    expect(archiveHit).toMatchObject({ readOnly: true, locationRefs: [], locationCount: 0, usedHere: false })
    expect(archiveHit?.archivedAt).toBe(archived.artifact.archivedAt)
    expect(archiveHit?.viewId).toBeUndefined()
    expect(archiveHit?.entityRef).toEqual({ type: 'artifact', id: s.artifactId })

    const archiveChangeSetId = archived.changeSet!.id
    expect(s.lifecycle.revert(archiveChangeSetId).revertable).toBe(true)
    expect(s.repository.getArtifact(s.artifactId)?.archivedAt).toBeUndefined()
    expect(s.lifecycle.reapply(archiveChangeSetId).revertable).toBe(true)
    expect(s.repository.getArtifact(s.artifactId)?.archivedAt).toBe(archived.artifact.archivedAt)

    const restored = s.lifecycle.restoreArtifact({ projectId: s.projectId, artifactId: s.artifactId, operationId: 'restore-once' })
    expect(restored.artifact.archivedAt).toBeUndefined()
    expect(restored.changeSet).toBeDefined()
    const eventCountAfterRestore = events.length
    const repeatedRestore = s.lifecycle.restoreArtifact({ projectId: s.projectId, artifactId: s.artifactId, operationId: 'restore-retry' })
    expect(repeatedRestore.changeSet).toBeUndefined()
    expect(events).toHaveLength(eventCountAfterRestore)
    unsubscribe()

    s.repository.close()
    repositories.pop()
    const reopened = new SqliteMetadataRepository(s.dbPath)
    repositories.push(reopened)
    expect(reopened.getArtifact(s.artifactId)?.archivedAt).toBeUndefined()
    expect(reopened.getArtifactViews(s.artifactId)).toEqual(beforeViews)
    expect(reopened.getArtifactRevisions(s.artifactId)).toEqual(beforeRevisions)
  })

  it('fails closed for missing and cross-project artifact identities', () => {
    const s = setup()
    s.repository.createProject({ id: 'other-project' as never, name: 'Other', rootPath: 'probe://other' })
    expect(() => s.lifecycle.archiveArtifact({ projectId: s.projectId, artifactId: 'missing' })).toThrow('Artifact not found in route project.')
    expect(() => s.lifecycle.archiveArtifact({ projectId: 'other-project', artifactId: s.artifactId })).toThrow('Artifact not found in route project.')
    expect(s.repository.getArtifact(s.artifactId)?.archivedAt).toBeUndefined()
  })

  it('exposes project-scoped archive/restore routes with an explicit archived collection', async () => {
    const s = setup()
    const encodedProject = encodeURIComponent(s.projectId)
    const encodedArtifact = encodeURIComponent(s.artifactId)
    const archivePath = `/projects/${encodedProject}/artifacts/${encodedArtifact}/archive`
    const archived = await entityRoute(s, 'POST', archivePath, { operationId: 'route-archive' })
    expect(archived).toMatchObject({ status: 200, body: { ok: true, value: { id: s.artifactId }, meta: { idempotent: false } } })
    const archivedList = await entityRoute(s, 'GET', `/projects/${encodedProject}/artifacts?lifecycle=archived`)
    expect(archivedList).toBeDefined()
    expect((archivedList.body as { value: Array<{ id: string }> }).value.map((item) => String(item.id))).toContain(s.artifactId)
    const duplicate = await entityRoute(s, 'POST', archivePath, { operationId: 'route-archive-retry' })
    expect(duplicate).toMatchObject({ status: 200, body: { meta: { idempotent: true } } })
    const crossProject = await entityRoute(s, 'POST', `/projects/other/artifacts/${encodedArtifact}/restore`, { operationId: 'route-cross' })
    expect(crossProject).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } })
    const restored = await entityRoute(s, 'POST', `/projects/${encodedProject}/artifacts/${encodedArtifact}/restore`, { operationId: 'route-restore' })
    expect(restored).toMatchObject({ status: 200, body: { ok: true, value: { id: s.artifactId }, meta: { idempotent: false } } })
  })
})
