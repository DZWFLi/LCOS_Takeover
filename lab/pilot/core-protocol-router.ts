/** Narrow, same-project entry to existing Core producers. No TapNow DTO is
 * silently reinterpreted here; callers receive the original Core envelope. */
const ROUTES = [
  { id: 'project-read', method: 'GET', path: /^\/projects\/([^/]+)$/, owner: 'Core Project' },
  { id: 'context-read', method: 'GET', path: /^\/projects\/([^/]+)\/(workspaces|graph|warehouse|artifacts|file-records|presentations)$/, owner: 'Core graph / Warehouse / Presentation' },
  { id: 'projection-binding-read', method: 'GET', path: /^\/projects\/([^/]+)\/spatial\/bindings$/, owner: 'Original Core ProjectionBinding read only; no binding write or reconciliation is exposed' },
  { id: 'collection-read', method: 'GET', path: /^\/projects\/([^/]+)\/collections(?:\/[^/]+(?:\/members)?)?$/, owner: 'Original Core Collection list/detail/member previews; same-project route and original Collection ownership checks; read-only' },
  { id: 'collection-create', method: 'POST', path: /^\/projects\/([^/]+)\/collections$/, owner: 'Original Core Collection create/createFromMembers producer; same-project route and original atomic member validation/ChangeSet' },
  { id: 'color-pin-read', method: 'GET', path: /^\/projects\/([^/]+)\/color-pins$/, owner: 'Original Core Color Pin snapshot; project canonical definitions/memberships' },
  { id: 'color-pin-assign', method: 'POST', path: /^\/projects\/([^/]+)\/color-pins\/memberships$/, owner: 'Original Core MutationSafety Color Pin assign; canonical target and original transaction/ChangeSet' },
  { id: 'color-pin-remove', method: 'DELETE', path: /^\/projects\/([^/]+)\/color-pins\/memberships\/([^/]+)$/, owner: 'Original Core MutationSafety Color Pin membership removal; exact project-owned membership' },
  { id: 'color-pin-label', method: 'PATCH', path: /^\/projects\/([^/]+)\/color-pins\/definitions\/([^/]+)$/, owner: 'Core MutationSafety Color Pin label-only update; exact observed definition CAS and original ChangeSet' },
  { id: 'navigation-resolve', method: 'POST', path: /^\/projects\/([^/]+)\/navigation\/resolve$/, owner: 'Original Core NavigationMarkerService canonical resolution; unresolved remains truthful, never a synthetic occurrence' },
  { id: 'collection-member-add', method: 'POST', path: /^\/projects\/([^/]+)\/collections\/([^/]+)\/members$/, owner: 'Original Core MutationSafetyService Collection member add; exact owned Collection required' },
  { id: 'collection-member-remove', method: 'DELETE', path: /^\/projects\/([^/]+)\/collections\/([^/]+)\/members$/, owner: 'Original Core MutationSafetyService Collection member remove; exact owned Collection required' },
  { id: 'presentation-read', method: 'GET', path: /^\/projects\/([^/]+)\/presentations\/([^/]+)$/, owner: 'Existing Core Presentation; same-project route identity' },
  { id: 'presentation-write', method: 'PUT', path: /^\/projects\/([^/]+)\/presentations\/([^/]+)$/, owner: 'Core PresentationApplicationService; exact project/scope/presentation identity and expectedVersion CAS' },
  { id: 'conversation-list', method: 'GET', path: /^\/projects\/([^/]+)\/connected-conversations$/, owner: 'Core ConnectedConversation' },
  { id: 'conversation-projection', method: 'GET', path: /^\/projects\/([^/]+)\/connected-conversations\/[^/]+\/(collaboration-session|collaboration-timeline)$/, owner: 'Core Collaboration' },
  { id: 'conversation-work-view', method: 'GET', path: /^\/projects\/([^/]+)\/connected-conversations\/[^/]+\/(identity|reach|work-view)$/, owner: 'Existing Core identity / reach / WorkView aggregate; partial states preserved' },
  { id: 'conversation-sessions', method: 'GET', path: /^\/projects\/([^/]+)\/(conversations|receiver-binding|conversation-continuations)$/, owner: 'Existing Core imported sessions / receiver / continuation journal' },
  { id: 'conversation-register', method: 'POST', path: /^\/projects\/([^/]+)\/connected-conversations$/, owner: 'Core Receiver; create is pending, not running' },
  { id: 'conversation-import', method: 'POST', path: /^\/projects\/([^/]+)\/conversations\/import-manual$/, owner: 'Core Conversation import' },
  { id: 'conversation-link', method: 'POST', path: /^\/projects\/([^/]+)\/connected-conversations\/[^/]+\/link-session$/, owner: 'Core canonical session binding' },
  { id: 'continuation-create', method: 'POST', path: /^\/projects\/([^/]+)\/conversation-continuations$/, owner: 'Core Continuation journal; no provider execution implied' },
  { id: 'continuation-recovery', method: 'POST', path: /^\/projects\/([^/]+)\/conversation-continuations\/[^/]+\/recovery-actions$/, owner: 'Existing Core transport capabilities / continuation state machine' },
  { id: 'assembly-apply', method: 'POST', path: /^\/projects\/([^/]+)\/assembly\/apply$/, owner: 'Core AssemblyApplyService' },
  { id: 'execution-projection', method: 'GET', path: /^\/projects\/([^/]+)\/execution-projection$/, owner: 'Existing Core Run / ResultSlot execution projection; same-project route identity' },
  { id: 'result-slot-list', method: 'GET', path: /^\/projects\/([^/]+)\/result-slots$/, owner: 'Existing Core ResultSlot list; same-project route identity' },
  { id: 'result-slot-create', method: 'POST', path: /^\/projects\/([^/]+)\/result-slots$/, owner: 'Existing Core ResultSlot producer; same-project scope and optional workspace/scope identity' },
  { id: 'result-slot-read', method: 'GET', path: /^\/result-slots\/([^/]+)$/, owner: 'Existing Core ResultSlot; exact same-project ownership required' },
  { id: 'canvas-text-read', method: 'GET', path: /^\/projects\/([^/]+)\/curation\/canvas-text$/, owner: 'Core CanvasTextService' },
  { id: 'canvas-text-write', method: 'PUT', path: /^\/projects\/([^/]+)\/curation\/canvas-text$/, owner: 'Core CanvasTextService; original binding guard and expectedRevisionId CAS' },
  { id: 'text-artifact-create', method: 'POST', path: /^\/projects\/([^/]+)\/text-artifacts$/, owner: 'Existing Core TextArtifactService; explicit same-project owned Scope/Workspace, original compound producer' },
  { id: 'artifact-read', method: 'GET', path: /^\/artifacts\/([^/]+)(?:\/(revisions|source-path))?$/, owner: 'Existing Core Artifact / registered-source metadata; same-project Artifact ownership required' },
  { id: 'artifact-source-action', method: 'POST', path: /^\/artifacts\/([^/]+)\/(open|reveal)$/, owner: 'Existing Core registered-source OS action; same-project registered Artifact only, no caller-supplied path' },
  { id: 'artifact-lifecycle', method: 'POST', path: /^\/projects\/([^/]+)\/artifacts\/([^/]+)\/(archive|restore)$/, owner: 'Existing Core MutationSafetyService archive/restore; same-project Artifact and original operation receipt' },
  { id: 'artifact-title-write', method: 'POST', path: /^\/entities\/artifact\/([^/]+)\/title$/, owner: 'Core Artifact title producer; same-project Artifact ownership required' },
  { id: 'artifact-view-read', method: 'GET', path: /^\/projects\/([^/]+)\/artifact-views\/[^/]+$/, owner: 'Existing Core ArtifactView; exact project/view identity' },
  { id: 'artifact-search', method: 'GET', path: /^\/projects\/([^/]+)\/artifacts\/search$/, owner: 'Existing Core title search; not a full catalog' },
  { id: 'revision-compare', method: 'GET', path: /^\/projects\/([^/]+)\/revisions\/compare$/, owner: 'Existing Core RuntimeRevisionCompareService; same-project revisions required' },
  { id: 'file-content-read', method: 'GET', path: /^\/projects\/([^/]+)\/file-records\/[^/]+\/content$/, owner: 'Existing Core registered FileRecord bytes/path containment; original binary response' },
  { id: 'assembly-resource-read', method: 'GET', path: /^\/projects\/([^/]+)\/resources(?:\/[^/]+\/descriptor)?$/, owner: 'Existing Core Resource descriptor; resourceId is not artifactId' },
  { id: 'assembly-skill-read', method: 'GET', path: /^\/projects\/([^/]+)\/skills(?:\/[^/]+)?$/, owner: 'Existing Core layered Skill catalog; read-only' },
  { id: 'assembly-capture-read', method: 'GET', path: /^\/runtime\/capture-space(?:\/items\/[^/]+\/preview)?$/, owner: 'Existing isolated Core Capture Space; system staging, not project membership' },
  { id: 'assembly-capture-materialize', method: 'POST', path: /^\/runtime\/capture-space\/materialize$/, owner: 'Current Core CaptureSpaceService; explicit isolated destination and contained staged blobs; original compound registration and exact receipt' },
  { id: 'runtime-providers', method: 'GET', path: /^\/runtime\/(providers|intelligence)$/, owner: 'Core runtime capability projection; status only' },
  { id: 'run-list', method: 'GET', path: /^\/projects\/([^/]+)\/runs$/, owner: 'Core Runtime journal / Review' },
  { id: 'run-create', method: 'POST', path: /^\/projects\/([^/]+)\/runs$/, owner: 'Core RuntimeApplicationService; creates journal only, does not dispatch' },
  { id: 'run-read', method: 'GET', path: /^\/runs\/([^/]+)\/(review|context-prompt|input-request|recipe)$/, owner: 'Existing Core Run / Review / pending-input / recipe read; same-project ownership required' },
  { id: 'context-manifest-read', method: 'GET', path: /^\/projects\/([^/]+)\/context-manifests\/v0\/[^/]+$/, owner: 'Existing Core persisted task context manifest; same-project immutable input evidence' },
  { id: 'run-cancel', method: 'POST', path: /^\/runs\/([^/]+)\/cancel$/, owner: 'Existing Core RuntimeApplicationService cancel; same-project Run ownership required' },
  { id: 'run-input-answer', method: 'POST', path: /^\/runs\/([^/]+)\/input-request$/, owner: 'Existing Core Run input-request answer; same-project Run ownership required' },
  { id: 'artifact-return-decision', method: 'POST', path: /^\/artifact-returns\/([^/]+)\/(accept|reject|retry)$/, owner: 'Existing Core RuntimeReviewService; exact same-project ArtifactReturn ownership required' },
] as const
const NATIVE_COLLECTION_TITLE_ROUTE = {
  id: 'collection-title-write',
  method: 'PATCH',
  path: /^\/projects\/([^/]+)\/collections\/([^/]+)$/,
  owner: 'Pilot-only Core Collection title owner; exact same-project Collection required',
} as const

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
// Same limit as the existing Core ImportCopy owner; binary reads must not be
// silently restricted to the small JSON DTO limit.
const MAX_FILE_RESPONSE_BYTES = 128 * 1024 * 1024
const COLLECTION_MEMBER_TYPES = new Set(['artifact', 'note', 'collection', 'scope', 'workspace', 'conversation', 'run'])

export function createCoreProtocolRouter({ coreOrigin, projectId, timeoutMs = 5000, isRunOwned, isArtifactReturnOwned, isScopeOwned, isWorkspaceScopeOwned, isResultSlotOwned, isArtifactOwned, isArtifactSourceInScope, isRevisionOwned, isFileContentInScope, isCaptureMaterializeInScope, isCollectionOwned, nativeCollectionTitle = false }: {
  coreOrigin: string; projectId: string; timeoutMs?: number; isRunOwned?: (runId: string) => boolean
  isArtifactReturnOwned?: (returnId: string) => boolean
  isScopeOwned?: (scopeId: string) => boolean
  isWorkspaceScopeOwned?: (workspaceId: string, scopeId: string) => boolean
  isResultSlotOwned?: (slotId: string) => boolean
  isArtifactOwned?: (artifactId: string) => boolean; isRevisionOwned?: (revisionId: string) => boolean
  isArtifactSourceInScope?: (artifactId: string) => Promise<boolean>
  isFileContentInScope?: (fileRecordId: string) => Promise<boolean>
  isCaptureMaterializeInScope?: (captureIds: readonly string[]) => Promise<boolean>
  isCollectionOwned?: (collectionId: string) => boolean
  nativeCollectionTitle?: boolean
}) {
  const targetOrigin = new URL(coreOrigin)
  if (targetOrigin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(targetOrigin.hostname)
    || !targetOrigin.port || targetOrigin.username || targetOrigin.password || targetOrigin.pathname !== '/'
    || targetOrigin.search || targetOrigin.hash) throw new Error('Core must be an explicit loopback HTTP origin.')

  const reject = (status: number, code: string, message: string) => ({ status, body: { ok: false, error: { code, message } } })
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const routes = nativeCollectionTitle ? [...ROUTES, NATIVE_COLLECTION_TITLE_ROUTE] : ROUTES
  return {
    operations: routes.map(({ id, method, owner, path }) => ({ id, method, owner, route: path.source,
      envelope: 'original-core', uiVerified: false, executionVerified: false })),
    async handle({ method = 'GET', pathname, url, body }: { method?: string; pathname?: string; url?: string | URL; body?: unknown }) {
      const incoming = url instanceof URL ? url : new URL(url || pathname || '/', 'http://127.0.0.1')
      const route = pathname || incoming.pathname
      if (!route.startsWith('/api/lcos/core/')) return null
      const corePath = route.slice('/api/lcos/core'.length)
      // Reject encoded separators and dot traversal before URL normalization.
      if (/%(?:2f|5c|2e)|\\|(?:^|\/)\.{1,2}(?:\/|$)/i.test(corePath)) return reject(400, 'INVALID_CORE_ADDRESS', 'Use opaque IDs without path separators.')
      // Validate percent-encoding before decodeURIComponent is used by any
      // ownership check. A malformed opaque ID is a bad address, not a Core
      // transport failure or an uncaught router exception.
      try { decodeURIComponent(corePath) } catch {
        return reject(400, 'INVALID_CORE_ADDRESS', 'Opaque IDs must use valid percent-encoding.')
      }
      const selected = routes.find((row) => row.method === method.toUpperCase() && row.path.test(corePath))
      if (!selected) return reject(501, 'CORE_OPERATION_NOT_CONNECTED', 'This operation has no registered Core producer mapping.')
      const match = selected.path.exec(corePath)!
      if (corePath.startsWith('/projects/') && decodeURIComponent(match[1]!) !== projectId) return reject(404, 'PROJECT_NOT_FOUND', 'Only the isolated project is in scope.')
      if (corePath.startsWith('/runs/') && !isRunOwned?.(decodeURIComponent(match[1]!))) return reject(404, 'RUN_NOT_FOUND', 'Only a Run owned by the isolated project is in scope.')
      if (corePath.startsWith('/artifacts/') && !isArtifactOwned?.(decodeURIComponent(match[1]!))) return reject(404, 'ARTIFACT_NOT_FOUND', 'Only an Artifact owned by the isolated project is in scope.')
      if (selected.id === 'artifact-lifecycle' && !isArtifactOwned?.(decodeURIComponent(match[2]!))) return reject(404, 'ARTIFACT_NOT_FOUND', 'Only an Artifact owned by the isolated project can change lifecycle.')
      if (selected.id === 'artifact-source-action' && body !== undefined) return reject(400, 'INVALID_ARGUMENT', 'Registered-source actions do not accept caller supplied paths or settings.')
      if (selected.id === 'text-artifact-create' && isRecord(body) && typeof body.scopeId === 'string' && body.scopeId.trim()) {
        if (!isScopeOwned?.(body.scopeId)) return reject(404, 'SCOPE_NOT_FOUND', 'Only a scope owned by the isolated project can receive text.')
        if (typeof body.workspaceId === 'string' && !isWorkspaceScopeOwned?.(body.workspaceId, body.scopeId))
          return reject(404, 'WORKSPACE_NOT_FOUND', 'The requested workspace must belong to the same project and scope.')
      }
      if (selected.id === 'artifact-title-write' && !isArtifactOwned?.(decodeURIComponent(match[1]!))) return reject(404, 'ARTIFACT_NOT_FOUND', 'Only an Artifact owned by the isolated project can be renamed.')
      if (selected.id === 'collection-title-write') {
        const collectionId = decodeURIComponent(match[2]!)
        if (!collectionId.trim()) return reject(400, 'INVALID_ARGUMENT', 'A Collection ID is required.')
        if (!isRecord(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'title')
          || typeof body.title !== 'string' || body.title.trim().length === 0 || body.title.trim().length > 500) {
          return reject(400, 'INVALID_ARGUMENT', 'Collection rename accepts only a title containing 1–500 characters.')
        }
        if (!isCollectionOwned) return reject(503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'Collection rename requires a current-project ownership check.')
        let owned: boolean
        try { owned = isCollectionOwned(collectionId) } catch {
          return reject(503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'The current-project Collection ownership check failed.')
        }
        if (!owned) return reject(404, 'COLLECTION_NOT_FOUND', 'Only a Collection owned by the isolated project can be renamed.')
      }
      if (selected.id === 'collection-member-add' || selected.id === 'collection-member-remove') {
        const collectionId = decodeURIComponent(match[2]!)
        if (!collectionId.trim()) return reject(400, 'INVALID_ARGUMENT', 'A Collection ID is required.')
        if (!isRecord(body) || Object.keys(body).length !== 2
          || !Object.hasOwn(body, 'memberType') || !Object.hasOwn(body, 'memberId')
          || typeof body.memberType !== 'string' || !COLLECTION_MEMBER_TYPES.has(body.memberType)
          || typeof body.memberId !== 'string' || !body.memberId.trim()) {
          return reject(400, 'INVALID_ARGUMENT', 'Collection membership requires only a supported canonical memberType and non-empty memberId.')
        }
        if (!isCollectionOwned) return reject(503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'Collection writes require a current-project ownership check.')
        let owned: boolean
        try { owned = isCollectionOwned(collectionId) } catch {
          return reject(503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'The current-project Collection ownership check failed.')
        }
        if (!owned) return reject(404, 'COLLECTION_NOT_FOUND', 'Only a Collection owned by the isolated project can be changed.')
      }
      if (selected.id === 'assembly-capture-materialize') {
        if (!isRecord(body) || body.projectId !== projectId) return reject(400, 'PROJECT_ID_MISMATCH', 'Capture destination must be the registered isolated project.')
        if (!Array.isArray(body.captureIds) || body.captureIds.length === 0
          || body.captureIds.some((id) => typeof id !== 'string' || !id.trim())) return reject(400, 'INVALID_ARGUMENT', 'Select existing Capture IDs; no empty source address is inferred.')
        if (!isCaptureMaterializeInScope) return reject(503, 'CAPTURE_SCOPE_UNAVAILABLE', 'Capture materialization requires a contained isolated staging source.')
        try {
          if (!await isCaptureMaterializeInScope(body.captureIds)) return reject(404, 'CAPTURE_SOURCE_NOT_IN_SCOPE', 'Only contained blobs from this isolated Capture runtime may be materialized; paths and external URLs are not enabled.')
        } catch { return reject(503, 'CAPTURE_SCOPE_UNAVAILABLE', 'Capture source scope could not be verified; no materialization was requested.') }
      }
      if (selected.id === 'artifact-return-decision') {
        const returnId = decodeURIComponent(match[1]!)
        if (!isArtifactReturnOwned) return reject(503, 'ARTIFACT_RETURN_OWNERSHIP_UNAVAILABLE', 'ArtifactReturn writes require a current-project ownership check.')
        let owned: boolean
        try { owned = isArtifactReturnOwned(returnId) } catch {
          return reject(503, 'ARTIFACT_RETURN_OWNERSHIP_UNAVAILABLE', 'The ArtifactReturn ownership check failed.')
        }
        if (!owned) return reject(404, 'ARTIFACT_RETURN_NOT_FOUND', 'Only an ArtifactReturn owned by the isolated project is in scope.')
      }
      if (selected.id === 'result-slot-create') {
        // Keep Core's original DTO validation and error envelope authoritative.
        // Only perform ownership checks once the fields needed to identify the
        // intended scope/workspace are present as strings; malformed payloads
        // continue to the original producer, which returns its own 400/409.
        const slotInput = isRecord(body) ? body : undefined
        const scopeId = typeof slotInput?.scopeId === 'string' && slotInput.scopeId !== '' ? slotInput.scopeId : undefined
        if (scopeId !== undefined) {
          if (!isScopeOwned) return reject(503, 'SCOPE_OWNERSHIP_UNAVAILABLE', 'Result-slot creation requires a current-project scope ownership check.')
          let scopeOwned: boolean
          try { scopeOwned = isScopeOwned(scopeId) } catch {
            return reject(503, 'SCOPE_OWNERSHIP_UNAVAILABLE', 'The current-project scope ownership check failed.')
          }
          if (!scopeOwned) return reject(404, 'SCOPE_NOT_FOUND', 'Only a scope owned by the isolated project can receive a result slot.')

          if (typeof slotInput?.workspaceId === 'string') {
            if (!isWorkspaceScopeOwned) return reject(503, 'WORKSPACE_SCOPE_OWNERSHIP_UNAVAILABLE', 'Result-slot creation with a workspace requires an exact workspace/scope ownership check.')
            let workspaceScopeOwned: boolean
            try { workspaceScopeOwned = isWorkspaceScopeOwned(slotInput.workspaceId, scopeId) } catch {
              return reject(503, 'WORKSPACE_SCOPE_OWNERSHIP_UNAVAILABLE', 'The exact workspace/scope ownership check failed.')
            }
            if (!workspaceScopeOwned) return reject(404, 'WORKSPACE_SCOPE_NOT_FOUND', 'The workspace and scope are not an owned pair in the isolated project.')
          }
        }
      }
      if (selected.id === 'result-slot-read') {
        const slotId = decodeURIComponent(match[1]!)
        if (!isResultSlotOwned) return reject(503, 'RESULT_SLOT_OWNERSHIP_UNAVAILABLE', 'Result-slot reads require a current-project ownership check.')
        let owned: boolean
        try { owned = isResultSlotOwned(slotId) } catch {
          return reject(503, 'RESULT_SLOT_OWNERSHIP_UNAVAILABLE', 'The ResultSlot ownership check failed.')
        }
        if (!owned) return reject(404, 'RESULT_SLOT_NOT_FOUND', 'Only a ResultSlot owned by the isolated project is in scope.')
      }
      if (selected.id === 'presentation-write') {
        const contract = isRecord(body) && isRecord(body.contract) ? body.contract : undefined
        const presentationId = decodeURIComponent(match[2]!)
        if (!contract) return reject(400, 'INVALID_PRESENTATION', 'Presentation PUT requires a contract object.')
        if (contract.projectId !== projectId) return reject(400, 'PROJECT_ID_MISMATCH', 'Presentation contract project does not match the registered project.')
        if (contract.id !== presentationId) return reject(400, 'PRESENTATION_ID_MISMATCH', 'Presentation contract id must match the route id.')
        if (typeof contract.scopeId !== 'string' || !contract.scopeId.trim()) return reject(400, 'INVALID_PRESENTATION_SCOPE', 'Presentation contract requires a scope id.')
        if (!isScopeOwned) return reject(503, 'SCOPE_OWNERSHIP_UNAVAILABLE', 'Presentation writes require a current-project scope ownership check.')
        let scopeOwned: boolean
        try { scopeOwned = isScopeOwned(contract.scopeId) } catch {
          return reject(503, 'SCOPE_OWNERSHIP_UNAVAILABLE', 'The current-project scope ownership check failed.')
        }
        if (!scopeOwned) return reject(404, 'SCOPE_NOT_FOUND', 'Only a scope owned by the isolated project can be saved.')
      }
      if (selected.id === 'revision-compare') {
        for (const key of ['base', 'head']) {
          const revisionId = incoming.searchParams.get(key)
          if (revisionId !== null && !isRevisionOwned?.(revisionId)) return reject(404, 'REVISION_NOT_FOUND', 'Only revisions owned by the isolated project can be compared.')
        }
      }
      if (body && typeof body === 'object' && !Array.isArray(body) && 'projectId' in body
        && (body as { projectId: unknown }).projectId !== projectId) return reject(400, 'PROJECT_ID_MISMATCH', 'Body project does not match the registered project.')
      try {
        if (selected.id === 'artifact-source-action' && !await isArtifactSourceInScope?.(decodeURIComponent(match[1]!)))
          return reject(404, 'ARTIFACT_SOURCE_NOT_IN_SCOPE', 'Only a registered local source contained in the isolated runtime may be opened.')
        if (selected.id === 'file-content-read') {
          const fileRecordId = decodeURIComponent(corePath.split('/')[4]!)
          if (!await isFileContentInScope?.(fileRecordId)) return reject(404, 'FILE_RECORD_NOT_FOUND', 'FileRecord is not contained in the isolated project root.')
        }
        const response = await fetch(new URL(corePath + incoming.search, targetOrigin), {
          method: method.toUpperCase(), redirect: 'error',
          headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs),
        })
        const binary = selected.id === 'file-content-read' && response.ok
        const reader = response.body?.getReader()
        const chunks: Uint8Array[] = []
        let length = 0
        if (reader) {
          try {
            while (true) {
              const chunk = await reader.read()
              if (chunk.done) break
              length += chunk.value.byteLength
              if (length > (binary ? MAX_FILE_RESPONSE_BYTES : MAX_RESPONSE_BYTES)) {
                await reader.cancel()
                return reject(502, 'CORE_RESPONSE_TOO_LARGE', binary ? 'Core file response exceeds the existing ImportCopy size limit.' : 'Core response exceeds the bounded JSON limit.')
              }
              chunks.push(chunk.value)
            }
          } finally { reader.releaseLock() }
        }
        const bytes = Buffer.concat(chunks)
        if (binary) return { status: response.status, body: bytes, contentType: response.headers.get('content-type') || 'application/octet-stream' }
        const parsed = JSON.parse(bytes.toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') return reject(502, 'CORE_RESPONSE_INVALID', 'Core did not return its expected envelope.')
        // Preserve exact status, conflict/error code and partial-result evidence.
        return { status: response.status, body: parsed }
      } catch (error) {
        return reject(503, 'CORE_TRANSPORT_UNAVAILABLE', error instanceof Error && error.name === 'TimeoutError'
          ? 'Core timed out; execution state must be checked before retrying.' : 'Core transport is unavailable; no success was fabricated.')
      }
    },
  }
}
