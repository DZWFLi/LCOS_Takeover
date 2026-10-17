import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = join(workspaceRoot, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(join(runtimeParent, 'current-gen2-capture-owner-'))
const bundlePath = join(runtimeRoot, 'capture-owner-bundle.mjs')

function assertContained(parent, target, prefix) {
  const resolvedParent = resolve(parent)
  const resolvedTarget = resolve(target)
  const child = relative(resolvedParent, resolvedTarget)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || resolve(resolvedParent, child) !== resolvedTarget
    || (prefix && !basename(resolvedTarget).startsWith(prefix))) {
    throw new Error(`Refusing to use or clean a path outside its test-owned root: ${resolvedTarget}`)
  }
}

after(async () => {
  assertContained(runtimeParent, runtimeRoot, 'current-gen2-capture-owner-')
  await rm(runtimeRoot, { recursive: true, force: true })
})

const entryPath = join(runtimeRoot, 'capture-owner-entry.ts')
const seamPath = join(workspaceRoot, 'lab/pilot/current-gen2-capture-owners.ts')
const seamSpecifier = relative(dirname(entryPath), seamPath).split(sep).join('/')
await (await import('node:fs/promises')).writeFile(entryPath,
  `export * from ${JSON.stringify(seamSpecifier.startsWith('.') ? seamSpecifier : `./${seamSpecifier}`)};\n`)
await buildPilotEntry(relative(workspaceRoot, entryPath).split(sep).join('/'), bundlePath, 'node')

const sourceManifest = JSON.parse(await readFile(`${bundlePath}.sources.json`, 'utf8'))
assert.equal(sourceManifest.currentRoot, currentGen2Root, 'the actual bundle manifest must identify the configured read-only current source root')
const adoptedResources = new Set((sourceManifest.resources ?? []).map((item) => item.resourcePath))
for (const expected of [
  'apps/local-core/src/metadata-repository.ts',
  'apps/local-core/src/text-artifact-service.ts',
  'apps/local-core/src/capture-space-service.ts',
  'apps/local-core/src/capture-title.ts',
  'apps/local-core/src/import-copy-service.ts',
  'apps/local-core/src/resources/universal-resource-import-service.ts',
  'apps/local-core/src/resources/analyzers/fallback-analyzer.ts',
  'apps/local-core/src/search-artifact-body.ts',
]) assert.ok(adoptedResources.has(expected), `actual bundle must record selected current source ${expected}`)
for (const resourcePath of adoptedResources) {
  const record = sourceManifest.resources.find((item) => item.resourcePath === resourcePath)
  assert.equal(record?.readOnly, true)
  assert.equal(resolve(record?.sourcePath ?? ''), resolve(currentGen2Root, resourcePath))
  assert.equal(resolve(record?.copiedPath ?? ''), resolve(workspaceRoot, 'lcos', resourcePath))
}

const owners = await import(pathToFileURL(bundlePath).href)
const { SqliteMetadataRepository, createMvpSampleSnapshot, CaptureSpaceService,
  CaptureStagingService, CapturePlacementService, UniversalResourceImportService,
  ImportCopyService } = owners

async function withNoNetwork(run) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    throw new Error(`Unexpected network in the in-process Core fixture: ${String(input)}`)
  }
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function createFixture() {
  const root = await mkdtemp(join(runtimeRoot, 'fixture-'))
  assertContained(runtimeRoot, root, 'fixture-')
  const dbPath = join(root, 'metadata.sqlite')
  const projectRoot = join(root, 'project')
  const blobRoot = join(root, 'blobs')
  let db = new SqliteMetadataRepository(dbPath)
  const graph = createMvpSampleSnapshot(projectRoot, '2026-10-14T00:00:00.000Z')
  db.save(graph)
  const projectId = String(graph.project.id)
  const scopeId = String(graph.scopes.find((scope) => scope.kind === 'root')?.id ?? '')
  assert.ok(scopeId, 'fixture must have its real root Scope')

  function owners(repository) {
    const staging = new CaptureStagingService(repository, blobRoot)
    const resources = new UniversalResourceImportService(repository, new ImportCopyService(repository))
    const noProvider = {
      generateStructured: async () => { throw new Error('Capture fixture must not invoke an Intelligence provider') },
    }
    const service = new CaptureSpaceService(repository, staging, resources,
      new CapturePlacementService(repository), noProvider, blobRoot)
    return { staging, service }
  }

  let sequence = 0
  let activeOwners = owners(db)
  const enqueueText = (body) => activeOwners.staging.enqueue({
    operationId: `current-capture-owner-${++sequence}`,
    kind: 'clipboard_text',
    payloadBytes: new TextEncoder().encode(body),
    source: { title: `原生 Capture ${sequence}` },
    suggestedProjects: [],
  })
  const counts = (repository = db) => {
    const project = repository.get(projectId)
    assert.ok(project, 'fixture Project must still exist')
    return [project.artifacts.length, project.artifactViews.length, project.artifactRevisions.length, project.fileRecords.length]
  }
  const reopen = () => {
    db.close()
    db = new SqliteMetadataRepository(dbPath)
    activeOwners = owners(db)
    return { db, ...activeOwners }
  }
  const noteFiles = async () => readdir(join(projectRoot, '.creative-os', 'notes')).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  const closeAndRemove = async () => {
    db.close()
    const target = resolve(root)
    assertContained(runtimeRoot, target, 'fixture-')
    await rm(target, { recursive: true, force: true })
  }
  return { root, dbPath, projectRoot, blobRoot, graph, projectId, scopeId,
    get db() { return db }, get service() { return activeOwners.service }, enqueueText,
    counts, reopen, noteFiles, closeAndRemove }
}

function overrideOnce(target, method, replacement) {
  const hadOwn = Object.hasOwn(target, method)
  const previous = Object.getOwnPropertyDescriptor(target, method)
  Object.defineProperty(target, method, { configurable: true, writable: true, value: replacement })
  return () => {
    if (hadOwn && previous) Object.defineProperty(target, method, previous)
    else delete target[method]
  }
}

test('adopted Core Capture resolves its exact text material in the same registration transaction; failed backlink leaves zero products and retries once after SQLite reopen', async () => {
  await withNoNetwork(async () => {
    const fixture = await createFixture()
    try {
      const body = 'Capture 原文\n完整 UTF-8：雪、é、尾标记  '
      const capture = await fixture.enqueueText(body)
      const before = fixture.counts()
      const originalResolve = fixture.db.resolveCaptureStagingItem.bind(fixture.db)
      let failedArtifactId = ''
      let failedViewId = ''
      let failedRevisionId = ''
      let failedFinalPath = ''
      const restore = overrideOnce(fixture.db, 'resolveCaptureStagingItem', (...args) => {
        assert.equal(args[0], capture.id, 'only this fixture Capture may be resolved')
        assert.equal(args[1], fixture.projectId)
        const resolved = originalResolve(...args)
        assert.equal(resolved, true, 'the original SQL update must really execute before injected failure')
        failedArtifactId = args[3]
        failedViewId = args[4]
        const artifact = fixture.db.getArtifact(failedArtifactId)
        assert.ok(artifact)
        failedRevisionId = String(artifact.currentRevisionId)
        const revision = fixture.db.getArtifactRevision(failedRevisionId)
        assert.ok(revision)
        const file = fixture.db.getFileRecord(String(revision.fileRecordId))
        assert.ok(file)
        failedFinalPath = file.observedPath
        throw new Error('Injected after the original Capture backlink SQL changed one row')
      })
      try {
        await assert.rejects(
          fixture.service.materializeToProject([capture.id], fixture.projectId),
          /after the original Capture backlink SQL/,
        )
      } finally {
        restore()
      }

      assert.ok(failedArtifactId && failedViewId && failedRevisionId && failedFinalPath,
        'failure injection must have reached the real in-transaction backlink')
      assert.deepEqual(fixture.counts(), before, 'transaction failure leaves no Artifact/View/Revision/FileRecord')
      assert.equal(fixture.db.getArtifact(failedArtifactId), undefined)
      assert.equal(fixture.db.getArtifactView(failedViewId), undefined)
      assert.equal(fixture.db.getArtifactRevision(failedRevisionId), undefined)
      assert.equal(fixture.db.getCaptureStagingItem(capture.id)?.resolvedProjectId, undefined,
        'the original Capture remains unresolved after rollback')
      await assert.rejects(access(failedFinalPath), { code: 'ENOENT' }, 'only this failed draft file is cleaned')
      assert.deepEqual(await fixture.noteFiles(), [])
      const sourceBlob = await readFile(join(fixture.blobRoot, capture.payloadRef.slice('blob:'.length)))
      assert.equal(sourceBlob.toString('utf8'), body, 'failed registration preserves the original staged Capture bytes')

      const reopened = fixture.reopen()
      assert.deepEqual(fixture.counts(reopened.db), before)
      assert.equal(reopened.db.getCaptureStagingItem(capture.id)?.resolvedArtifactId, undefined)
      const retried = await reopened.service.materializeToProject([capture.id], fixture.projectId)
      assert.equal(retried.imported, 1)
      assert.equal(retried.items.length, 1)
      const material = retried.items[0]
      assert.ok(material?.artifactId && material.viewId && material.revisionId)
      assert.equal(material.captureId, capture.id)
      const artifact = reopened.db.getArtifact(material.artifactId)
      const view = reopened.db.getArtifactView(material.viewId)
      const revision = reopened.db.getArtifactRevision(material.revisionId)
      assert.ok(artifact && view && revision)
      assert.equal(String(artifact.projectId), fixture.projectId)
      assert.equal(String(view.artifactId), material.artifactId)
      assert.equal(String(view.scopeId), fixture.scopeId)
      assert.equal(String(revision.artifactId), material.artifactId)
      assert.equal(String(view.revisionId), material.revisionId)
      assert.equal(reopened.db.getCaptureStagingItem(capture.id)?.resolvedArtifactId, material.artifactId)
      assert.equal(reopened.db.getCaptureStagingItem(capture.id)?.resolvedViewId, material.viewId)
      assert.deepEqual(fixture.counts(reopened.db), before.map((value) => value + 1))

      const retry = await reopened.service.materializeToProject([capture.id], fixture.projectId)
      assert.equal(retry.imported, 0)
      assert.deepEqual(retry.items[0], { ...material, reused: true })
      assert.deepEqual(fixture.counts(reopened.db), before.map((value) => value + 1),
        'idempotent retry reuses exact Artifact/View/Revision without rebuilding')
    } finally {
      await fixture.closeAndRemove()
    }
  })
})

test('adopted Capture materialization preserves caller order and duplicate IDs while creating each original only once across SQLite reopen', async () => {
  await withNoNetwork(async () => {
    const fixture = await createFixture()
    try {
      const a = await fixture.enqueueText('capture-A')
      const b = await fixture.enqueueText('capture-B')
      const before = fixture.counts()
      const created = await fixture.service.materializeToProject([b.id, a.id, b.id], fixture.projectId)
      assert.equal(created.imported, 2)
      assert.deepEqual(created.items.map((item) => item.captureId), [b.id, a.id, b.id])
      assert.equal(created.items[0]?.artifactId, created.items[2]?.artifactId,
        'duplicate caller identity returns the same original material, not a second producer')
      assert.equal(created.items[0]?.viewId, created.items[2]?.viewId)
      assert.equal(created.items[0]?.revisionId, created.items[2]?.revisionId)
      assert.ok(created.items[0]?.revisionId && created.items[1]?.revisionId)
      assert.deepEqual(fixture.counts(), before.map((value) => value + 2))

      const firstMapping = fixture.db.getCaptureStagingItem(b.id)
      const secondMapping = fixture.db.getCaptureStagingItem(a.id)
      assert.equal(firstMapping?.resolvedArtifactId, created.items[0]?.artifactId)
      assert.equal(secondMapping?.resolvedArtifactId, created.items[1]?.artifactId)
      const reopened = fixture.reopen()
      const retried = await reopened.service.materializeToProject([a.id, b.id, a.id], fixture.projectId)
      assert.equal(retried.imported, 0)
      assert.deepEqual(retried.items.map((item) => item.captureId), [a.id, b.id, a.id])
      assert.deepEqual(retried.items.map((item) => item.artifactId), [
        secondMapping?.resolvedArtifactId, firstMapping?.resolvedArtifactId, secondMapping?.resolvedArtifactId,
      ])
      assert.deepEqual(retried.items.map((item) => item.viewId), [
        secondMapping?.resolvedViewId, firstMapping?.resolvedViewId, secondMapping?.resolvedViewId,
      ])
      assert.ok(retried.items.every((item) => item.reused === true))
      assert.deepEqual(fixture.counts(reopened.db), before.map((value) => value + 2),
        'reopen + reordered repeated retry cannot duplicate formal material')
    } finally {
      await fixture.closeAndRemove()
    }
  })
})
