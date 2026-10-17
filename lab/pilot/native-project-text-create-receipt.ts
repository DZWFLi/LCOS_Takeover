import type { CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts.js'

export interface NativeProjectTextCreateInput {
  readonly projectId: string
  readonly canvasId: string
  readonly body: string
  readonly position: Readonly<{ x: number; y: number }>
  readonly title?: string
  /** Compatibility with the current branch-drop call; create never opens a second editor. */
  readonly focus?: false
  readonly timeoutMs?: number
}

export interface NativeProjectTextRecoveryInput extends NativeProjectTextCreateInput {
  readonly nodeId: string
}

export interface NativeProjectTextCarrier extends Readonly<Record<string, unknown>> {
  readonly id: string
  readonly type: string
  readonly position?: Readonly<{ x: number; y: number }>
  readonly data?: Readonly<Record<string, unknown>>
}

export interface NativeProjectTextArtifactRef {
  readonly version: 1
  readonly entityType: 'artifact'
  readonly entityId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
}

export interface NativeProjectTextNodeApi {
  getNode?(nodeId: string): NativeProjectTextCarrier | undefined
  getNodes(): readonly NativeProjectTextCarrier[]
  addNodes(nodes: readonly NativeProjectTextCarrier[]): unknown
  subscribeNative?(listener: () => void): () => void
  backfillNodeReceipt?(receipt: unknown): { readonly ok: boolean; readonly reason?: string }
}

export interface NativeProjectTextHost {
  readonly projectId?: unknown
  readonly canvasId?: unknown
  readonly currentCanvasId?: unknown
  readonly api?: NativeProjectTextNodeApi | null
}

export interface NativeProjectTextReceiptPortOptions {
  readonly getHost: () => NativeProjectTextHost | undefined
  readonly getCurrentProjectId: () => string | undefined
  readonly getNativeIntent: () => unknown
  readonly readCanvasText: (projectId: string, address: { canvasId: string; spatialId: string }) => Promise<CanvasTextSnapshot | null>
  /** Calls the original TapNow XD/fi factory with its original (data, overrides) signature. */
  readonly createTextCarrier: (data: Readonly<Record<string, unknown>>, overrides: Readonly<Record<string, unknown>>) => NativeProjectTextCarrier
  readonly timeoutMs?: number
}

export type NativeProjectTextCreateFailureStatus =
  | 'invalid-input'
  | 'native-intent-unavailable'
  | 'host-unavailable'
  | 'project-changed'
  | 'canvas-changed'
  | 'native-api-unavailable'
  | 'node-id-collision'
  | 'native-create-threw'
  | 'create-receipt-timeout'
  | 'history-receipt-unavailable'
  | 'core-readback-failed'
  | 'identity-mismatch'
  | 'context-changed'

export class NativeProjectTextCreateError extends Error {
  constructor(
    readonly status: NativeProjectTextCreateFailureStatus,
    message: string,
    readonly nodeId?: string,
    readonly causeValue?: unknown,
  ) {
    super(message)
    this.name = 'NativeProjectTextCreateError'
  }
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

function currentCanvasId(host: NativeProjectTextHost | undefined): string | undefined {
  if (nonEmpty(host?.currentCanvasId)) return host.currentCanvasId
  return nonEmpty(host?.canvasId) ? host.canvasId : undefined
}

function validateInput(input: NativeProjectTextCreateInput): void {
  if (!nonEmpty(input.projectId) || !nonEmpty(input.canvasId) || typeof input.body !== 'string'
    || !input.body.trim() || !input.position || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)
    || (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim()))
    || input.focus !== undefined && input.focus !== false) {
    throw new NativeProjectTextCreateError('invalid-input', 'New project text needs its exact project/canvas, non-empty body, title when supplied, and finite native position.')
  }
  if (input.timeoutMs !== undefined && (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0)) {
    throw new NativeProjectTextCreateError('invalid-input', 'Receipt timeout must be positive when supplied.')
  }
}

function exactArtifactRef(value: unknown): value is NativeProjectTextArtifactRef {
  if (!isRecord(value)) return false
  return value.version === 1 && value.entityType === 'artifact'
    && nonEmpty(value.entityId) && value.entityId === value.artifactId
    && nonEmpty(value.artifactId) && nonEmpty(value.artifactViewId) && nonEmpty(value.revisionId)
}

function assertCurrentContext(
  options: NativeProjectTextReceiptPortOptions,
  input: NativeProjectTextCreateInput,
  api?: NativeProjectTextNodeApi,
  nodeId?: string,
): asserts api is NativeProjectTextNodeApi {
  const host = options.getHost()
  if (!host) throw new NativeProjectTextCreateError('host-unavailable', 'The original TapNow Canvas host is not connected.', nodeId)
  if (options.getCurrentProjectId() !== input.projectId || (nonEmpty(host.projectId) && host.projectId !== input.projectId)) {
    throw new NativeProjectTextCreateError('project-changed', 'The project is no longer the exact current project.', nodeId)
  }
  if (currentCanvasId(host) !== input.canvasId || (nonEmpty(host.canvasId) && host.canvasId !== input.canvasId)) {
    throw new NativeProjectTextCreateError('canvas-changed', 'The requested project text does not belong to the exact current TapNow Canvas.', nodeId)
  }
  if (!host.api || api !== undefined && host.api !== api || typeof host.api.addNodes !== 'function'
    || typeof host.api.getNodes !== 'function' || typeof host.api.backfillNodeReceipt !== 'function') {
    throw new NativeProjectTextCreateError('native-api-unavailable', 'The current original NodeLab API does not expose addNodes and history-receipt backfill.', nodeId)
  }
}

function exactRefOnNode(node: NativeProjectTextCarrier | undefined, input: NativeProjectTextCreateInput): NativeProjectTextArtifactRef | undefined {
  const data = node?.data
  if (!node || node.id === '' || !isRecord(data) || data.text !== input.body || !exactArtifactRef(data.lcos_ref)) return undefined
  return data.lcos_ref
}

function validateReadback(value: CanvasTextSnapshot | null, input: NativeProjectTextRecoveryInput, ref: NativeProjectTextArtifactRef): value is CanvasTextSnapshot {
  return !!value && value.projectId === input.projectId && value.canvasId === input.canvasId
    && value.spatialId === input.nodeId && value.artifactId === ref.artifactId
    && value.viewId === ref.artifactViewId && value.revisionId === ref.revisionId && value.body === input.body
    && (input.title === undefined || value.title === input.title.trim())
}

export function createNativeProjectTextReceiptPort(options: NativeProjectTextReceiptPortOptions) {
  if (typeof options.getHost !== 'function' || typeof options.getCurrentProjectId !== 'function'
    || typeof options.getNativeIntent !== 'function' || typeof options.readCanvasText !== 'function'
    || typeof options.createTextCarrier !== 'function') {
    throw new TypeError('Native project text create needs the current host/project, NativeIntent, original text factory, and Core GET reader.')
  }

  function intentReady(): boolean {
    const intent = options.getNativeIntent()
    return isRecord(intent) && intent.version === 1 && typeof intent.tagChanges === 'function'
      && typeof intent.recordHistoryTransition === 'function' && typeof intent.backfillHistoryReceipt === 'function'
  }

  function liveNode(api: NativeProjectTextNodeApi, nodeId: string): NativeProjectTextCarrier | undefined {
    return api.getNode?.(nodeId) ?? api.getNodes().find((node) => node.id === nodeId)
  }

  async function confirmCore(input: NativeProjectTextRecoveryInput, ref: NativeProjectTextArtifactRef, api: NativeProjectTextNodeApi): Promise<CanvasTextSnapshot> {
    let value: CanvasTextSnapshot | null
    try {
      value = await options.readCanvasText(input.projectId, { canvasId: input.canvasId, spatialId: input.nodeId })
    } catch (error) {
      throw new NativeProjectTextCreateError('core-readback-failed', 'The original create was not replayed; exact Core canvas-text GET failed.', input.nodeId, error)
    }
    if (!validateReadback(value, input, ref)) {
      throw new NativeProjectTextCreateError('identity-mismatch', 'Core GET did not confirm this exact native NodeID, primary Artifact/View/Revision, and body.', input.nodeId)
    }
    assertCurrentContext(options, input, api, input.nodeId)
    return value
  }

  async function verify(input: NativeProjectTextRecoveryInput): Promise<CanvasTextSnapshot> {
    validateInput(input)
    if (!nonEmpty(input.nodeId)) throw new NativeProjectTextCreateError('invalid-input', 'Read-only recovery needs the original native NodeID.')
    const host = options.getHost()
    assertCurrentContext(options, input, host?.api ?? undefined, input.nodeId)
    const api = host!.api!
    const node = liveNode(api, input.nodeId)
    const ref = exactRefOnNode(node, input)
    if (!ref) throw new NativeProjectTextCreateError('history-receipt-unavailable', 'No exact primary Core ref has been backfilled onto this original native node yet; verify is read-only and will not replay create.', input.nodeId)
    return confirmCore(input, ref, api)
  }

  async function create(input: NativeProjectTextCreateInput): Promise<CanvasTextSnapshot> {
    validateInput(input)
    if (!intentReady()) throw new NativeProjectTextCreateError('native-intent-unavailable', 'Original NativeIntent create/history transform is not installed; no node was added.')
    const host = options.getHost()
    assertCurrentContext(options, input, host?.api ?? undefined)
    const api = host!.api!
    let carrier: NativeProjectTextCarrier
    try {
      carrier = options.createTextCarrier({ text: input.body, prompt: '', ...(input.title ? { title: input.title } : {}) }, { position: { ...input.position } })
    } catch (error) {
      throw new NativeProjectTextCreateError('native-create-threw', 'The original TapNow text-node factory rejected the requested project text.', undefined, error)
    }
    const nodeId = carrier?.id
    if (!nonEmpty(nodeId) || carrier.type !== 'text' || !isRecord(carrier.data) || carrier.data.text !== input.body
      || !isRecord(carrier.position) || carrier.position.x !== input.position.x || carrier.position.y !== input.position.y
      || carrier.data.lcos_ref !== undefined || carrier.lcos_ref !== undefined || carrier.parentId !== undefined) {
      throw new NativeProjectTextCreateError('invalid-input', 'The original text factory returned an unsupported or already-bound carrier; no node was added.', nonEmpty(nodeId) ? nodeId : undefined)
    }
    if (liveNode(api, nodeId)) throw new NativeProjectTextCreateError('node-id-collision', 'The original text factory returned a NodeID already present in this Canvas; no node was added.', nodeId)

    const timeoutMs = input.timeoutMs ?? options.timeoutMs ?? 15000
    let release: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => void) | undefined
    let interval: ReturnType<typeof setInterval> | undefined
    const receiptPromise = new Promise<NativeProjectTextCarrier>((resolve, reject) => {
      let done = false
      const finish = (callback: () => void) => {
        if (done) return
        done = true
        if (timer !== undefined) clearTimeout(timer)
        if (interval !== undefined) clearInterval(interval)
        unsubscribe?.()
        callback()
      }
      const check = () => {
        try {
          assertCurrentContext(options, input, api, nodeId)
          const node = liveNode(api, nodeId)
          if (exactRefOnNode(node, input)) finish(() => resolve(node!))
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error(String(error))))
        }
      }
      timer = setTimeout(() => finish(() => reject(new NativeProjectTextCreateError('create-receipt-timeout',
        'The native node was added once but its exact Core/history receipt did not arrive in time. Keep the node and use read-only verify; do not add it again.', nodeId))), timeoutMs)
      try { unsubscribe = api.subscribeNative?.(check) } catch { /* bounded polling remains available */ }
      interval = setInterval(check, 25)
      check()
      release = () => finish(() => reject(new NativeProjectTextCreateError('create-receipt-timeout',
        'The native create ended without a receipt. The node was not removed or resubmitted.', nodeId)))
    })

    try {
      assertCurrentContext(options, input, api, nodeId)
      api.addNodes([carrier])
    } catch (error) {
      release?.()
      await receiptPromise.catch(() => undefined)
      throw error instanceof NativeProjectTextCreateError ? error
        : new NativeProjectTextCreateError('native-create-threw', 'The original NodeLab API addNodes call failed. No retry or cleanup was attempted.', nodeId, error)
    }

    let receipted: NativeProjectTextCarrier
    try { receipted = await receiptPromise }
    catch (error) {
      if (error instanceof NativeProjectTextCreateError) throw error
      throw new NativeProjectTextCreateError('history-receipt-unavailable', 'The original live node did not receive its Core/history backfill.', nodeId, error)
    }
    const ref = exactRefOnNode(receipted, input)
    if (!ref) throw new NativeProjectTextCreateError('history-receipt-unavailable', 'The node data changed before receipt confirmation.', nodeId)
    return confirmCore({ ...input, nodeId }, ref, api)
  }

  return { create, verify }
}
