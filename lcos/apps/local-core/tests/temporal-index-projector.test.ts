import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ProjectGraphSnapshot } from '@local-creative-os/contracts'
import type { Run, RunEvent } from '@local-creative-os/domain'
import { afterEach, describe, expect, it } from 'vitest'

import type { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'
import { projectTemporalIndex } from '../src/temporal-index-projector.js'

const cleanup: string[] = []
function sample(): ProjectGraphSnapshot {
  const root = mkdtempSync(join(tmpdir(), 'lcos-temporal-'))
  cleanup.push(root)
  return createMvpSampleSnapshot(root, '2026-01-01T00:00:00.000Z')
}

afterEach(() => {
  for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('temporal index projector', () => {
  it('uses durable created/occurred timestamps, filters by workspace scope, and never uses updatedAt', () => {
    const base = sample()
    const workspace = base.workspaces[0]
    expect(workspace).toBeDefined()
    const firstArtifact = base.artifacts[0]
    expect(firstArtifact).toBeDefined()
    const graph: ProjectGraphSnapshot = {
      ...base,
      artifacts: base.artifacts.map((artifact, index) => index === 0 ? {
        ...artifact,
        createdAt: '2026-01-01T01:00:00.000Z',
        updatedAt: '2099-12-31T23:59:59.000Z',
      } : artifact),
    }
    const run = {
      id: 'run-temporal', projectId: graph.project.id, workspaceId: workspace?.id,
      contextManifestId: 'manifest-temporal', provider: 'codex', requestedProvider: 'codex',
      outputIntent: 'analyze', returnGroupId: 'group-temporal', status: 'completed', instruction: 'Inspect',
      createdAt: '2026-01-01T02:00:00.000Z', updatedAt: '2099-01-01T00:00:00.000Z',
    } as Run
    const runEvent = {
      id: 'run-event-temporal', runId: run.id, sequence: 1, type: 'run.completed',
      occurredAt: '2026-01-02T03:00:00.000Z', payload: {},
    } as RunEvent
    const metadata = {
      getProjectRuns: () => [run],
      getRunEvents: () => [runEvent],
    } as unknown as SqliteMetadataRepository

    const result = projectTemporalIndex(graph, metadata, String(workspace?.id))
    expect(result).toBeDefined()
    expect(result?.source).toBe('canonical_durable_records')
    expect(result?.facts.some((fact) => fact.occurredAt.startsWith('2099'))).toBe(false)
    expect(result?.facts.map((fact) => fact.id)).toContain('run-event:run-event-temporal')
    expect(result?.far).toHaveLength(2)
    expect(result?.mid.every((group) => group.level === 'mid')).toBe(true)
    expect(result?.omissions).toEqual(['conversation_timeline_unscoped', 'project_event_hub_ephemeral'])
  })

  it('returns undefined instead of projecting another workspace by guess', () => {
    const graph = sample()
    const metadata = { getProjectRuns: () => [], getRunEvents: () => [] } as unknown as SqliteMetadataRepository
    expect(projectTemporalIndex(graph, metadata, 'missing-workspace')).toBeUndefined()
  })
})
