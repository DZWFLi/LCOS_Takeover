/** Canonical receipt for importing a portable Workflow definition. */
export interface WorkflowImportReceiptV1 {
  readonly imported: true
  /** True only when this archive identity created its Core workflow scope. */
  readonly created: boolean
  readonly scopeId: string
  readonly workspaceIds: readonly string[]
  readonly members: number
  readonly workspaces: number
}
