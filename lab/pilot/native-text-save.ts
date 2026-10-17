import type { CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts.js'

export interface NativeTextSaveInput {
  readonly projectId: string
  readonly canvasId: string
  readonly nodeId: string
  readonly artifactId: string
  readonly expectedRevisionId: string
  readonly body: string
}

export interface NativeTextSaveResult {
  readonly status: string
  readonly operationId?: string
  readonly reason?: string
  readonly retrySent?: false
  readonly value?: CanvasTextSnapshot
  readonly readback?: CanvasTextSnapshot | null
  readonly coreRevisionId?: string
  readonly readbackMatches?: boolean
  readonly contextCurrent?: boolean
  readonly httpStatus?: number
  readonly errorCode?: string | null
  readonly nativeRequestId?: string
}

export interface NativeTextSavePending {
  readonly source?: 'native-autosave' | 'native-history' | 'explicit'
  readonly historyPhase?: 'undo' | 'redo'
  readonly operationId: string
  readonly status: string
  readonly canvasId: string
  readonly nodeId: string
  readonly artifactId: string
  readonly expectedRevisionId: string
  readonly body: string
  readonly claimedRequestId: string | null
  readonly reason: string | null
  readonly coreRevisionId: string | null
}

export interface NativeTextSavePort {
  subscribe(listener: () => void): () => void
  canResumeExplicitSave(operationId: string, context: {
    readonly projectId: string; readonly canvasId: string; readonly nodeId: string;
    readonly artifactId: string; readonly artifactViewId: string; readonly revisionId: string; readonly api: unknown;
  }): boolean
  getAutosaveContext(nodeId: string): { readonly projectId: string; readonly canvasId: string; readonly nodeId: string } | null
  readQueuedAutosave(nodeId: string): { readonly projectId: string; readonly canvasId: string; readonly nodeId: string; readonly count: number; readonly canResume: boolean } | null
  resumeAutosave(nodeId: string): boolean
  save(input: NativeTextSaveInput): Promise<NativeTextSaveResult>
  verify(operationId: string): Promise<NativeTextSaveResult>
  acknowledge(operationId: string): boolean
  getPending(): NativeTextSavePending[]
  getPending(operationId: string): NativeTextSavePending | null
  getPending(selector: { readonly operationId: string } | { readonly canvasId: string; readonly nodeId: string }): NativeTextSavePending | null
}

declare global {
  interface Window {
    __LCOS_NATIVE_TEXT_SAVE_PORT__?: NativeTextSavePort
  }
}

/**
 * Submit a body through TapNow's existing updateNodeData/history/batch path.
 * This helper intentionally does not expose Core's direct saveCanvasText PUT.
 */
export function saveNativeCanvasText(
  input: NativeTextSaveInput,
): Promise<NativeTextSaveResult> {
  const port = typeof window === 'undefined' ? undefined : window.__LCOS_NATIVE_TEXT_SAVE_PORT__
  if (!port) return Promise.resolve({ status: 'unavailable', reason: 'Native text save receipt port is not installed.', retrySent: false })
  return port.save(input)
}

/** Read-only recovery after a missing response; never replays the native write. */
export function verifyNativeCanvasTextSave(operationId: string): Promise<NativeTextSaveResult> {
  const port = typeof window === 'undefined' ? undefined : window.__LCOS_NATIVE_TEXT_SAVE_PORT__
  if (!port) return Promise.resolve({ status: 'unavailable', operationId,
    reason: 'Native text save receipt port is not installed.', retrySent: false })
  return port.verify(operationId)
}

/** Release a late, terminal receipt after its original caller has consumed it. */
export function acknowledgeNativeCanvasTextSave(operationId: string): boolean {
  const port = typeof window === 'undefined' ? undefined : window.__LCOS_NATIVE_TEXT_SAVE_PORT__
  return port?.acknowledge(operationId) ?? false
}
