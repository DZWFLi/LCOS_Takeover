import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.js'
import {
  createNativeProjectTextReceiptPort,
  type NativeProjectTextCreateInput,
  type NativeProjectTextHost,
  type NativeProjectTextRecoveryInput,
  type NativeProjectTextReceiptPortOptions,
} from './native-project-text-create-receipt.js'

export type NativeProjectTextFactory = NativeProjectTextReceiptPortOptions['createTextCarrier']

export interface NativeProjectTextCallerOptions {
  /** Reads the current project owner (not a captured project ID from a stale render). */
  readonly getCurrentProjectId: () => string | undefined
  /** Invoke the original TapNow XD/fi factory; the caller must not synthesize a replacement node. */
  readonly createTextCarrier: NativeProjectTextFactory
  readonly timeoutMs?: number
}

let coreSession: ReturnType<typeof createLcosCoreSession> | undefined

type NativeProjectTextWindow = Window & {
  readonly __LCOS_NODE_LAB__?: NativeProjectTextHost
  readonly __LCOS_NATIVE_INTENT__?: unknown
}

function currentWindow(): NativeProjectTextWindow | undefined {
  return typeof window === 'undefined' ? undefined : window as NativeProjectTextWindow
}

function activeSession(): ReturnType<typeof createLcosCoreSession> {
  coreSession ??= createLcosCoreSession()
  return coreSession
}

function portFor(options: NativeProjectTextCallerOptions) {
  return createNativeProjectTextReceiptPort({
    getHost: () => currentWindow()?.__LCOS_NODE_LAB__,
    getCurrentProjectId: options.getCurrentProjectId,
    getNativeIntent: () => currentWindow()?.__LCOS_NATIVE_INTENT__,
    readCanvasText: (projectId, address) => activeSession().artifacts.readCanvasText(projectId, address),
    createTextCarrier: options.createTextCarrier,
    timeoutMs: options.timeoutMs,
  })
}

/**
 * Add through the original TapNow node queue exactly once; return only after
 * the original native history receipt is backfilled and exact Core GET agrees.
 */
export function createNativeProjectText(
  input: NativeProjectTextCreateInput,
  options: NativeProjectTextCallerOptions,
) {
  return portFor(options).create(input)
}

/** Read-only recovery for a create whose original batch reply arrived late or was lost. */
export function verifyNativeProjectTextCreate(
  input: NativeProjectTextRecoveryInput,
  options: NativeProjectTextCallerOptions,
) {
  return portFor(options).verify(input)
}

export { NativeProjectTextCreateError, type NativeProjectTextCreateFailureStatus } from './native-project-text-create-receipt.js'
