import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { CoreArtifactClient } from '../../lcos/apps/web-gen2/src/backend/artifacts.ts'
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts'
import type { LcosNodeRefV1 } from './node-lifecycle.ts'
import { coreUploadFormat, validCoreUploadBytes } from './core-upload-format.ts'

const MAX_JSON_BYTES = 128 * 1024
// Match ImportCopyService's existing 128 MiB boundary; don't add a smaller upload-only ceiling.
const MAX_FILE_BYTES = 128 * 1024 * 1024

type JsonRecord = Record<string, unknown>

export interface CoreUploadOptions {
  readonly coreOrigin: string
  readonly repository: SqliteMetadataRepository
  readonly projectId: string
  readonly publicOrigin: string
  readonly runtimeRoot: string
}

/** Exact result returned by Core Import Copy and attached to one opaque TapNow upload URL. */
export interface CoreUploadReceipt {
  readonly file_id: string
  readonly file_name: string
  readonly mime_type: string
  readonly url: string
  readonly file_size: number
  readonly file_hash?: string
  readonly lcos_ref: LcosNodeRefV1
  readonly fileRecordId: string
  readonly artifact_kind?: string
}

export interface CoreUploadRequest {
  readonly method?: string
  readonly headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Buffer | Uint8Array | string>
}

export interface CoreUploadResponse {
  writeHead(status: number, headers?: Record<string, string | number>): unknown
  end(body?: string | Uint8Array): unknown
}

export interface CoreUploadHandler {
  (request: CoreUploadRequest, response: CoreUploadResponse, url: URL): Promise<boolean>
  /** Exact URL lookup only; this never identifies by name, bytes, or hash. */
  resolveReceiptByUrl(exactUrl: string): CoreUploadReceipt | undefined
}

interface UploadEntry {
  readonly id: string
  readonly fileName: string
  readonly mimeType: string
  readonly size: number
  readonly fileHash?: string
  readonly stagedPath: string
  uploaded: boolean
  complete?: boolean
  busy?: boolean
  receipt?: CoreUploadReceipt
}

class UploadError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

const fail = (status: number, code: string, message: string): never => { throw new UploadError(status, code, message) }

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_ARGUMENT', 'Expected a JSON object.')
  return value as JsonRecord
}

function loopbackOrigin(value: string, label: string): string {
  let url: URL
  try { url = new URL(value) } catch { return fail(400, 'INVALID_ORIGIN', `${label} must be an HTTP loopback origin.`) }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.pathname !== '/' || url.search || url.hash) fail(400, 'INVALID_ORIGIN', `${label} must be an HTTP loopback origin.`)
  return url.origin
}

function safeFileName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 120 || value.trim() !== value
    || value === '.' || value === '..' || /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(value) || /[. ]$/.test(value)) {
    fail(400, 'INVALID_FILE_NAME', 'file_name must be a plain filename of at most 120 characters.')
  }
  return value
}

function envelope(response: CoreUploadResponse, status: number, data: unknown, message = ''): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ code: status < 300 ? 0 : status * 100, message, msg: message, data,
    ...(status < 300 ? {} : { error: { code: 'UPLOAD_REQUEST_FAILED', message } }) }))
}

async function readBody(request: CoreUploadRequest, limit: number): Promise<Buffer> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += part.length
    if (size > limit) fail(413, 'UPLOAD_BODY_TOO_LARGE', `Request body exceeds ${limit} bytes.`)
    parts.push(part)
  }
  return Buffer.concat(parts)
}

function responseFailure(response: CoreUploadResponse, error: unknown): void {
  const candidateStatus = error instanceof UploadError ? error.status
    : Number.isInteger((error as { status?: number } | null)?.status) ? Number((error as { status: number }).status) : 500
  const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500
  const message = error instanceof Error ? error.message : 'Core upload failed.'
  const code = error instanceof UploadError ? error.code : 'CORE_IMPORT_FAILED'
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ code: status < 300 ? 0 : status * 100, message, msg: message, data: null, error: { code, message } }))
}

export function createCoreUpload(options: CoreUploadOptions): CoreUploadHandler {
  const publicOrigin = loopbackOrigin(options.publicOrigin, 'publicOrigin')
  const coreOrigin = loopbackOrigin(options.coreOrigin, 'coreOrigin')
  const projectId = options.projectId
  if (!options.repository.getProject(projectId)) fail(404, 'PROJECT_NOT_FOUND', 'Upload project is not present in Local Core.')
  const mainWorkspaces = options.repository.getWorkspaces(projectId).filter((workspace) => workspace.preferredSurface === 'main'
    && workspace.scopeId && workspace.canvasId)
  if (mainWorkspaces.length !== 1) fail(409, 'UPLOAD_SCOPE_AMBIGUOUS', 'Upload needs one Main Core Workspace as its initial scope.')
  const mainWorkspace = mainWorkspaces[0]!
  const coreArtifacts = new CoreArtifactClient(new HttpClient({ baseUrl: coreOrigin }))
  const stagingRoot = path.join(path.resolve(options.runtimeRoot), 'core-upload-staging')
  const entries = new Map<string, UploadEntry>()
  const receiptsByUrl = new Map<string, CoreUploadReceipt>()

  const resolveReceiptByUrl = (exactUrl: string): CoreUploadReceipt | undefined => receiptsByUrl.get(exactUrl)

  const handle: CoreUploadHandler = async (request, response, url) => {
    const route = url.pathname
    const relevant = route === '/api/files/upload-urls' || route.startsWith('/api/files/upload-urls/')
      || route.startsWith('/api/lcos-upload-staging/') || route.startsWith('/api/conversation/storage/uploads/')
    if (!relevant) return false

    try {
      const origin = request.headers.origin
      if (origin !== undefined) {
        const originValue = Array.isArray(origin) ? origin[0] : origin
        const publicUrl = new URL(publicOrigin)
        const allowedOrigins = new Set([publicOrigin])
        if (['127.0.0.1', 'localhost'].includes(publicUrl.hostname)) {
          allowedOrigins.add(`http://localhost:${publicUrl.port}`)
          allowedOrigins.add(`http://127.0.0.1:${publicUrl.port}`)
        }
        if (!originValue || !allowedOrigins.has(originValue)) fail(403, 'CROSS_ORIGIN_UPLOAD_REJECTED', 'Upload requests must come from the local host page.')
      }

      if (route === '/api/files/upload-urls' && request.method === 'POST') {
        const contentType = String(request.headers['content-type'] ?? '')
        if (!contentType.toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'Use Content-Type: application/json.')
        const input = record(JSON.parse((await readBody(request, MAX_JSON_BYTES)).toString('utf8')))
        const allowedKeys = new Set(['file_name', 'mime_type', 'file_hash', 'file_size', 'folder_id', 'is_temporary',
          'keep_original_filename', 'forbid_overwrite', 'is_resumable_mode', 'part_size'])
        if (Object.keys(input).some((key) => !allowedKeys.has(key))) fail(501, 'UPLOAD_FIELDS_NOT_IMPLEMENTED', 'Upload request contains unsupported fields.')
        const fileName = safeFileName(input.file_name)
        const format = coreUploadFormat(fileName, input.mime_type)
        if (!format) fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'This file extension and MIME type do not have a connected Core upload validator.')
        const mimeType = format.mimeType
        if (!Number.isSafeInteger(input.file_size) || Number(input.file_size) < 1 || Number(input.file_size) > MAX_FILE_BYTES) {
          fail(413, 'FILE_SIZE_UNSUPPORTED', 'Upload size must be between 1 byte and 128 MiB.')
        }
        if (input.is_resumable_mode !== undefined && typeof input.is_resumable_mode !== 'boolean') fail(400, 'INVALID_ARGUMENT', 'is_resumable_mode must be boolean.')
        if (input.is_temporary !== undefined && typeof input.is_temporary !== 'boolean') fail(400, 'INVALID_ARGUMENT', 'is_temporary must be boolean.')
        if (input.is_resumable_mode === true) fail(501, 'RESUMABLE_UPLOAD_NOT_IMPLEMENTED', 'Only the TapNow single-PUT upload path is connected.')
        if (input.is_temporary === true) fail(501, 'TEMPORARY_UPLOAD_NOT_IMPLEMENTED', 'Temporary uploads have no Core retention owner in this local mode.')
        if (input.folder_id !== undefined && input.folder_id !== null && input.folder_id !== '') {
          fail(501, 'UPLOAD_FOLDER_NOT_IMPLEMENTED', 'TapNow folder placement has no matching Core scope mapping.')
        }
        if (input.file_hash !== undefined && (typeof input.file_hash !== 'string' || input.file_hash.length > 128)) {
          fail(400, 'INVALID_FILE_HASH_FIELD', 'file_hash must be a short string when supplied.')
        }
        for (const key of ['keep_original_filename', 'forbid_overwrite']) {
          if (input[key] !== undefined && typeof input[key] !== 'boolean') fail(400, 'INVALID_ARGUMENT', `${key} must be boolean.`)
        }
        if (input.part_size !== undefined && (!Number.isSafeInteger(input.part_size) || Number(input.part_size) < 1)) {
          fail(400, 'INVALID_ARGUMENT', 'part_size must be a positive integer.')
        }

        await mkdir(stagingRoot, { recursive: true })
        const id = `core-upload-${randomUUID()}`
        const stagedPath = path.join(stagingRoot, `${id}.bytes`)
        const entry: UploadEntry = { id, fileName, mimeType, size: Number(input.file_size),
          ...(typeof input.file_hash === 'string' ? { fileHash: input.file_hash } : {}), stagedPath, uploaded: false }
        entries.set(id, entry)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        envelope(response, 200, { file_id: id, upload_strategy: 'single_put',
          upload_url: `${publicOrigin}/api/lcos-upload-staging/${encodeURIComponent(id)}`, headers: {},
          storage_type: 'local-core-file-record', expires_at: expiresAt })
        return true
      }

      const stagingMatch = /^\/api\/lcos-upload-staging\/([^/]+)$/.exec(route)
      if (stagingMatch && request.method === 'PUT') {
        const id = decodeURIComponent(stagingMatch[1]!)
        const entry = entries.get(id)
        if (!entry) fail(404, 'UPLOAD_NOT_FOUND', 'No active local upload has this opaque ID.')
        if (entry.receipt) fail(409, 'UPLOAD_ALREADY_IMPORTED', 'A completed Core import cannot be replaced by another staging PUT.')
        if (entry.busy) fail(409, 'UPLOAD_IN_PROGRESS', 'This upload is already being processed.')
        entry.busy = true
        try {
          const bytes = await readBody(request, MAX_FILE_BYTES)
          if (bytes.length !== entry.size || !validCoreUploadBytes(bytes, entry.fileName, entry.mimeType)) {
            fail(400, 'UPLOAD_CONTENT_MISMATCH', 'Upload length or file content does not match the declared file format.')
          }
          if (entry.uploaded) {
            const prior = await readFile(entry.stagedPath)
            if (!prior.equals(bytes)) fail(409, 'UPLOAD_RETRY_MISMATCH', 'A repeated PUT cannot replace staged bytes.')
          } else {
            await writeFile(entry.stagedPath, bytes, { flag: 'wx' })
            entry.uploaded = true
          }
          response.writeHead(200, { 'Cache-Control': 'no-store' })
          response.end()
          return true
        } finally { entry.busy = false }
      }

      const completeMatch = /^\/api\/files\/upload-urls\/([^/]+)\/complete$/.exec(route)
      if (completeMatch && request.method === 'PUT') {
        const id = decodeURIComponent(completeMatch[1]!)
        const entry = entries.get(id)
        if (!entry) fail(404, 'UPLOAD_NOT_FOUND', 'No active local upload has this opaque ID.')
        if (entry.busy) fail(409, 'UPLOAD_IN_PROGRESS', 'This upload is already being processed.')
        entry.busy = true
        try {
          const bodyBytes = await readBody(request, MAX_JSON_BYTES)
          if (bodyBytes.length !== 0) fail(501, 'UPLOAD_COMPLETE_BODY_NOT_IMPLEMENTED', 'Single-PUT completion does not accept a body.')
          if (entry.receipt) {
            envelope(response, 200, entry.receipt)
            return true
          }
          if (!entry.uploaded) fail(409, 'UPLOAD_BYTES_MISSING', 'Upload bytes must arrive before completion.')
          const bytes = await readFile(entry.stagedPath)
          if (bytes.length !== entry.size || !validCoreUploadBytes(bytes, entry.fileName, entry.mimeType)) fail(409, 'STAGED_UPLOAD_INVALID', 'Staged file no longer matches its declared receipt.')
          const currentWorkspace = options.repository.getWorkspaces(projectId).filter((workspace) => workspace.preferredSurface === 'main'
            && workspace.scopeId && workspace.canvasId)
          if (currentWorkspace.length !== 1 || currentWorkspace[0]!.id !== mainWorkspace.id
            || currentWorkspace[0]!.scopeId !== mainWorkspace.scopeId || currentWorkspace[0]!.canvasId !== mainWorkspace.canvasId) {
            fail(409, 'UPLOAD_SCOPE_CHANGED', 'The upload workspace changed before import; no other workspace was used.')
          }
          const imported = await coreArtifacts.importCopiedFile(projectId, {
            file: new File([new Uint8Array(bytes)], entry.fileName, { type: entry.mimeType }),
            importRequestId: `tapnow-upload-${entry.id}`,
            scopeId: String(mainWorkspace.scopeId),
            position: { x: 0, y: 0 },
          })
          const artifactId = String(imported.artifact.id)
          const revisionId = String(imported.revision.id)
          const viewId = String(imported.view.id)
          const fileRecord = options.repository.getFileRecord(String(imported.revision.fileRecordId))
          const actualArtifact = options.repository.getArtifact(artifactId)
          const actualRevision = options.repository.getArtifactRevision(revisionId)
          const actualView = options.repository.getArtifactView(viewId)
          const expected = coreUploadFormat(entry.fileName, entry.mimeType)!
          if (!fileRecord || String(fileRecord.projectId) !== projectId || String(imported.artifact.projectId) !== projectId
            || imported.artifact.kind !== expected.artifactKind || fileRecord.mimeType !== entry.mimeType || fileRecord.size !== entry.size
            || imported.artifact.archivedAt !== undefined || imported.revision.status === 'draft'
            || String(imported.revision.artifactId) !== artifactId || String(imported.view.scopeId) !== String(mainWorkspace.scopeId)
            || String(imported.view.artifactId) !== artifactId || String(imported.view.revisionId) !== revisionId
            || !actualArtifact || actualArtifact.projectId !== imported.artifact.projectId || actualArtifact.kind !== imported.artifact.kind
            || actualArtifact.archivedAt !== undefined || !actualRevision || String(actualRevision.artifactId) !== artifactId
            || String(actualRevision.fileRecordId) !== String(fileRecord.id) || actualRevision.status === 'draft'
            || !actualView || String(actualView.artifactId) !== artifactId || String(actualView.revisionId) !== revisionId
            || String(actualView.scopeId) !== String(mainWorkspace.scopeId)) {
            fail(409, 'CORE_IMPORT_UNCONFIRMED', 'Core Import Copy returned an incomplete or mismatched Artifact/Revision/View receipt; import may already be durable.')
          }
          const urlValue = `${publicOrigin}/api/conversation/storage/uploads/${encodeURIComponent(entry.id)}`
          const lcos_ref: LcosNodeRefV1 = { version: 1, entityType: 'artifact', entityId: artifactId,
            artifactId, artifactViewId: viewId, revisionId }
          const receipt: CoreUploadReceipt = { file_id: entry.id, file_name: entry.fileName, mime_type: entry.mimeType,
            url: urlValue, file_size: entry.size, ...(entry.fileHash === undefined ? {} : { file_hash: entry.fileHash }),
            lcos_ref, fileRecordId: String(fileRecord.id), artifact_kind: imported.artifact.kind }
          entry.receipt = receipt
          entry.complete = true
          receiptsByUrl.set(urlValue, receipt)
          await rm(entry.stagedPath, { force: true })
          envelope(response, 200, receipt)
          return true
        } finally { entry.busy = false }
      }

      const cancelMatch = /^\/api\/files\/upload-urls\/([^/]+)$/.exec(route)
      if (cancelMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(cancelMatch[1]!)
        const entry = entries.get(id)
        if (!entry) fail(404, 'UPLOAD_NOT_FOUND', 'No active local upload has this opaque ID.')
        if (entry.busy) fail(409, 'UPLOAD_IN_PROGRESS', 'This upload is being processed; cancellation has not been confirmed.')
        if (entry.receipt) fail(409, 'UPLOAD_ALREADY_IMPORTED', 'A completed Core import is durable and cannot be canceled as a staging upload.')
        entries.delete(id)
        await rm(entry.stagedPath, { force: true })
        envelope(response, 200, { file_id: id, canceled: true })
        return true
      }

      const storageMatch = /^\/api\/conversation\/storage\/uploads\/([^/]+)$/.exec(route)
      if (storageMatch && ['GET', 'HEAD'].includes(String(request.method))) {
        const id = decodeURIComponent(storageMatch[1]!)
        const entry = entries.get(id)
        if (!entry) fail(404, 'UPLOAD_NOT_FOUND', 'No completed Core-backed upload has this opaque ID.')
        if (!entry.receipt || !entry.complete) fail(409, 'UPLOAD_NOT_COMPLETE', 'The upload URL becomes readable after Core confirms import completion.')
        const fileRecord = options.repository.getFileRecord(entry.receipt.fileRecordId)
        if (!fileRecord || String(fileRecord.projectId) !== projectId) fail(404, 'FILE_RECORD_NOT_FOUND', 'The exact Core FileRecord is no longer available.')
        const blob = await coreArtifacts.getFileRecordContent(projectId, String(fileRecord.id))
        const bytes = Buffer.from(await blob.arrayBuffer())
        if (bytes.length !== entry.size || blob.type && blob.type !== entry.mimeType) fail(409, 'CORE_FILE_CONTENT_MISMATCH', 'Core FileRecord content no longer matches this upload receipt.')
        response.writeHead(200, { 'Content-Type': fileRecord.mimeType || entry.mimeType, 'Content-Length': bytes.length,
          ...(entry.mimeType.startsWith('image/') ? {} : { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.fileName)}` }),
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        response.end(request.method === 'HEAD' ? undefined : bytes)
        return true
      }

      if (route.startsWith('/api/files/upload-urls') || route.startsWith('/api/lcos-upload-staging/')
        || route.startsWith('/api/conversation/storage/uploads/')) {
        fail(501, 'UPLOAD_ACTION_NOT_IMPLEMENTED', 'This upload route/method is not supported by the local Core adapter.')
      }
      return false
    } catch (error) {
      responseFailure(response, error instanceof SyntaxError ? new UploadError(400, 'INVALID_JSON', 'Expected a valid JSON body.') : error)
      return true
    }
  }
  handle.resolveReceiptByUrl = resolveReceiptByUrl
  return handle
}
