export type TemporalFactKindV1 =
  | 'artifact.created'
  | 'artifact.revision_created'
  | 'note.created'
  | 'checkpoint.created'
  | 'run.created'
  | 'run.event'

export type TemporalTargetTypeV1 = 'artifact' | 'artifact_revision' | 'note' | 'checkpoint' | 'run' | 'workspace' | 'scope'

export interface TemporalTargetRefV1 {
  readonly type: TemporalTargetTypeV1
  readonly id: string
}

/** Durable canonical fact projected into time; never a second truth. */
export interface TemporalFactV1 {
  readonly id: string
  readonly kind: TemporalFactKindV1
  readonly occurredAt: string
  readonly targets: readonly TemporalTargetRefV1[]
}

export interface TemporalGroupV1 {
  readonly id: string
  readonly level: 'far' | 'mid'
  readonly start: string
  readonly end: string
  readonly eventIds: readonly string[]
  readonly targets: readonly TemporalTargetRefV1[]
  readonly eventCount: number
}

export interface TemporalIndexV1 {
  readonly schemaVersion: 1
  readonly projectId: string
  readonly workspaceId: string
  readonly scopeId: string
  readonly source: 'canonical_durable_records'
  readonly facts: readonly TemporalFactV1[]
  readonly far: readonly TemporalGroupV1[]
  readonly mid: readonly TemporalGroupV1[]
  readonly omissions: readonly ('conversation_timeline_unscoped' | 'project_event_hub_ephemeral')[]
}
