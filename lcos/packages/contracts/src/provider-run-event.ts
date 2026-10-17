/**
 * Normalized provider -> Core event seam for an already-dispatched Run.
 *
 * Huabu/Agenetes emits `permission_request`; Bridge/provider adapters map
 * that transport event into this shape. Core still owns the Run and the
 * durable pending-input record.
 */
export interface ProviderRunWaitingInputEventV1 {
  readonly contractVersion: 'provider-run-event-v1'
  readonly type: 'waiting_input'
  readonly correlation: {
    readonly lcosRunId: string
    readonly externalTaskId: string
  }
  readonly request: {
    readonly requestId: string
    readonly prompt: string
    readonly options: readonly string[]
    readonly allowFreeText: boolean
    readonly contextVersion?: number
  }
  readonly occurredAt?: string
}

export type ProviderRunEventV1 = ProviderRunWaitingInputEventV1
