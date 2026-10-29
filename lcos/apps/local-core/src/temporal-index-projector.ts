import type {
  ProjectGraphSnapshot,
  TemporalFactV1,
  TemporalGroupV1,
  TemporalIndexV1,
  TemporalTargetRefV1,
} from '@local-creative-os/contracts'

import type { SqliteMetadataRepository } from './metadata-repository.js'

const MID_GAP_MS = 30 * 60_000

function targetKey(target: TemporalTargetRefV1): string {
  return `${target.type}:${target.id}`
}

function uniqueTargets(facts: readonly TemporalFactV1[]): readonly TemporalTargetRefV1[] {
  const result = new Map<string, TemporalTargetRefV1>()
  for (const fact of facts) for (const target of fact.targets) result.set(targetKey(target), target)
  return [...result.values()].sort((left, right) => targetKey(left).localeCompare(targetKey(right)))
}

function groupFacts(level: TemporalGroupV1['level'], buckets: readonly (readonly TemporalFactV1[])[]): readonly TemporalGroupV1[] {
  return buckets.flatMap((facts, index) => {
    const first = facts[0]
    const last = facts.at(-1)
    if (first === undefined || last === undefined) return []
    return [{
      id: `${level}:${first.occurredAt}:${index}`,
      level,
      start: first.occurredAt,
      end: last.occurredAt,
      eventIds: facts.map((fact) => fact.id),
      targets: uniqueTargets(facts),
      eventCount: facts.length,
    }]
  })
}

function farGroups(facts: readonly TemporalFactV1[]): readonly TemporalGroupV1[] {
  const byDay = new Map<string, TemporalFactV1[]>()
  for (const fact of facts) {
    const day = fact.occurredAt.slice(0, 10)
    const bucket = byDay.get(day) ?? []
    bucket.push(fact)
    byDay.set(day, bucket)
  }
  return groupFacts('far', [...byDay.values()])
}

function midGroups(facts: readonly TemporalFactV1[]): readonly TemporalGroupV1[] {
  const buckets: TemporalFactV1[][] = []
  for (const fact of facts) {
    const current = buckets.at(-1)
    const previous = current?.at(-1)
    if (current === undefined || previous === undefined || Date.parse(fact.occurredAt) - Date.parse(previous.occurredAt) > MID_GAP_MS) {
      buckets.push([fact])
    } else {
      current.push(fact)
    }
  }
  return groupFacts('mid', buckets)
}

function noteBelongsToScope(
  note: ProjectGraphSnapshot['notes'][number],
  scopeId: string,
  artifactIds: ReadonlySet<string>,
  viewIds: ReadonlySet<string>,
  revisionIds: ReadonlySet<string>,
): boolean {
  switch (note.anchor.type) {
    case 'scope': return String(note.anchor.scopeId) === scopeId
    case 'artifact': return artifactIds.has(String(note.anchor.artifactId))
    case 'artifact_view': return viewIds.has(String(note.anchor.viewId))
    case 'page': return revisionIds.has(String(note.anchor.revisionId))
    case 'project': return false
  }
}

function compareFacts(left: TemporalFactV1, right: TemporalFactV1): number {
  return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)
}

/** Pure deterministic projection over existing durable truth. */
export function projectTemporalIndex(
  graph: ProjectGraphSnapshot,
  metadata: SqliteMetadataRepository,
  workspaceId: string,
): TemporalIndexV1 | undefined {
  const workspace = graph.workspaces.find((candidate) => String(candidate.id) === workspaceId)
  if (workspace === undefined) return undefined
  const scopeId = String(workspace.scopeId)
  const views = graph.artifactViews.filter((view) => String(view.scopeId) === scopeId)
  const viewIds = new Set(views.map((view) => String(view.id)))
  const artifactIds = new Set(views.map((view) => String(view.artifactId)))
  const revisions = graph.artifactRevisions.filter((revision) => artifactIds.has(String(revision.artifactId)))
  const revisionIds = new Set(revisions.map((revision) => String(revision.id)))
  const facts: TemporalFactV1[] = []

  for (const artifact of graph.artifacts) {
    if (!artifactIds.has(String(artifact.id))) continue
    facts.push({ id: `artifact-created:${String(artifact.id)}`, kind: 'artifact.created', occurredAt: artifact.createdAt, targets: [{ type: 'artifact', id: String(artifact.id) }] })
  }
  for (const revision of revisions) facts.push({
    id: `artifact-revision:${String(revision.id)}`,
    kind: 'artifact.revision_created',
    occurredAt: revision.createdAt,
    targets: [
      { type: 'artifact', id: String(revision.artifactId) },
      { type: 'artifact_revision', id: String(revision.id) },
      ...(revision.runId === undefined ? [] : [{ type: 'run' as const, id: String(revision.runId) }]),
    ],
  })
  for (const note of graph.notes) {
    if (!noteBelongsToScope(note, scopeId, artifactIds, viewIds, revisionIds)) continue
    facts.push({ id: `note-created:${String(note.id)}`, kind: 'note.created', occurredAt: note.createdAt, targets: [{ type: 'note', id: String(note.id) }] })
  }
  for (const checkpoint of graph.checkpoints) {
    if (String(checkpoint.scopeId) !== scopeId && String(checkpoint.workspaceId ?? '') !== workspaceId) continue
    facts.push({
      id: `checkpoint-created:${String(checkpoint.id)}`,
      kind: 'checkpoint.created',
      occurredAt: checkpoint.createdAt,
      targets: [{ type: 'checkpoint', id: String(checkpoint.id) }, { type: 'workspace', id: workspaceId }, { type: 'scope', id: scopeId }],
    })
  }
  for (const run of metadata.getProjectRuns(graph.project.id, 100)) {
    if (String(run.workspaceId ?? '') !== workspaceId) continue
    const runTargets: TemporalTargetRefV1[] = [
      { type: 'run', id: String(run.id) },
      ...(run.targetArtifactId === undefined ? [] : [{ type: 'artifact' as const, id: String(run.targetArtifactId) }]),
    ]
    facts.push({ id: `run-created:${String(run.id)}`, kind: 'run.created', occurredAt: run.createdAt, targets: runTargets })
    for (const event of metadata.getRunEvents(run.id)) facts.push({
      id: `run-event:${String(event.id)}`,
      kind: 'run.event',
      occurredAt: event.occurredAt,
      targets: runTargets,
    })
  }

  facts.sort(compareFacts)
  return {
    schemaVersion: 1,
    projectId: String(graph.project.id),
    workspaceId,
    scopeId,
    source: 'canonical_durable_records',
    facts,
    far: farGroups(facts),
    mid: midGroups(facts),
    omissions: ['conversation_timeline_unscoped', 'project_event_hub_ephemeral'],
  }
}
