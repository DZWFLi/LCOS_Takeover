import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'

import { createProjectionBindingRegistry } from '@local-creative-os/web-gen2'
import useCanvasStore from '../../lcos/huabu/apps/web/src/store/canvasStore.ts'
import { CanvasNodeRenameEntry } from '../../lcos/huabu/apps/web/src/lcos/nodes/CanvasNodeRenameEntry.tsx'
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts'
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'
import { registerNativeMaterialSources } from '../../lcos/huabu/apps/web/src/lcos/drop/registerNativeMaterialSources.ts'

import {
  nativeImageReferenceSignature,
  nativeImagePresentedTitle,
  nativeMaterialRenameIdentityKey,
  resolveNativeMaterialMetadata,
  type NativeMaterialMetadataEntry,
  type NativeMaterialMetadataNativeRef,
} from './native-material-metadata-policy.ts'

type JsonRecord = Record<string, unknown>
type RegistrationBatch = Parameters<typeof registerNativeMaterialSources>[2]
type RegistrationEntry = RegistrationBatch['byNodeId'] extends ReadonlyMap<string, infer Value> ? Value : never

interface MaterialReadState {
  readonly key: string
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly byNodeId: ReadonlyMap<string, NativeMaterialMetadataEntry>
  readonly rejectedByNodeId: ReadonlyMap<string, string>
  readonly reason?: string
}

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function referenceMatchesNativeDto(value: unknown, expected: NativeMaterialMetadataNativeRef): boolean {
  const ref = record(value)
  return ref?.version === 1 && ref.entityType === expected.entityType
    && ref.entityId === expected.entityId && ref.artifactId === expected.artifactId
    && ref.artifactViewId === expected.artifactViewId && ref.revisionId === expected.revisionId
}

function referenceHasExpectedOwner(value: unknown, entry: NativeMaterialMetadataEntry): boolean {
  const ref = record(value)
  const descriptor = record(ref?.descriptor)
  return ref?.entityType === 'artifact' && ref.entityId === entry.artifactId
    && descriptor?.entityType === 'artifact' && descriptor.entityId === entry.artifactId
    && descriptor.title === entry.descriptor.title && descriptor.artifactKind === 'image'
    && descriptor.currentRevisionId === entry.descriptor.currentRevisionId
    && descriptor.presentedRevisionId === entry.revisionId
    && descriptor.artifactViewId === entry.artifactViewId
    && descriptor.artifactViewReferenceKind === entry.descriptor.artifactViewReferenceKind
    && descriptor.fileRecordId === entry.fileRecordId && descriptor.mimeType === entry.reference.mimeType
}

function referenceIdentityMatches(value: unknown, entry: NativeMaterialMetadataEntry): boolean {
  const ref = record(value)
  const descriptor = record(ref?.descriptor)
  return ref?.entityType === 'artifact' && ref.entityId === entry.artifactId
    && descriptor?.entityType === 'artifact' && descriptor.entityId === entry.artifactId
    && descriptor.artifactKind === 'image' && descriptor.presentedRevisionId === entry.revisionId
    && descriptor.artifactViewId === entry.artifactViewId
    && descriptor.artifactViewReferenceKind === entry.descriptor.artifactViewReferenceKind
    && descriptor.fileRecordId === entry.fileRecordId
}

function currentSceneMatches(projectId: string, canvasId: string, imageRefsKey: string,
  bindingRefreshVersion: number): boolean {
  const canvas = useCanvasStore.getState()
  return canvas.status === 'ready' && canvas.canvasId === canvasId
    && nativeImageReferenceSignature(canvas.nodes) === imageRefsKey
    && useLcosShellStore.getState().projectId === projectId
    && useLcosReferenceStore.getState().projectId === projectId
    && useLcosReferenceStore.getState().bindingRefreshVersion === bindingRefreshVersion
}

function selection(nodes: readonly { readonly id: string; readonly selected?: boolean; readonly type?: string }[]): string {
  const selected = nodes.filter(node => node.selected === true)
  return selected.length === 1 && typeof selected[0]?.id === 'string' ? selected[0].id : ''
}

function registrationBatch(nodeId: string, entry: NativeMaterialMetadataEntry): RegistrationBatch {
  const resolved: RegistrationEntry = {
    reference: entry.reference,
    sourceRef: { kind: 'artifactView', id: entry.artifactViewId },
    sourceRegistration: 'original-image-carrier',
    descriptor: entry.descriptor,
  }
  return {
    // This is an already-bound, read-only presentation projection. The existing
    // registration helper only consumes byNodeId; claims intentionally stay empty.
    objects: [],
    claims: [],
    byNodeId: new Map([[nodeId, resolved]]),
  }
}

/** Called unconditionally by TapNow's original shared node shell. Unsupported
 * or unverified nodes retain its exact original title expression and DOM. */
export function LCOSUseNativeImageTitle(nodeId: string, data: unknown, originalTitle: string): string {
  const canvasStatus = useCanvasStore(state => state.status)
  const canvasId = useCanvasStore(state => state.canvasId)
  const node = useCanvasStore(state => state.nodes.find(item => item.id === nodeId))
  const projectId = useLcosReferenceStore(state => state.projectId)
  const shellProjectId = useLcosShellStore(state => state.projectId)
  const reference = useLcosReferenceStore(state => state.nodeEntityRefs.get(nodeId))
  return nativeImagePresentedTitle({ nodeId, rendererData: data, node, reference,
    canvasStatus, canvasId, projectId, shellProjectId, originalTitle })
}

/** Hydrate only verified native image metadata, then enable the original F2/Core rename owner. */
export function NativeMaterialRenameHost({ projectId, canvasId }: {
  readonly projectId: string
  readonly canvasId: string
}): JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), [])
  const canvasStatus = useCanvasStore(state => state.status)
  const liveCanvasId = useCanvasStore(state => state.canvasId)
  const imageRefsKey = useCanvasStore(state => nativeImageReferenceSignature(state.nodes))
  const selectedNodeId = useCanvasStore(state => selection(state.nodes))
  const selectedNode = useCanvasStore(state => selectedNodeId
    ? state.nodes.find(node => node.id === selectedNodeId)
    : undefined)
  const nodeEntityRefs = useLcosReferenceStore(state => state.nodeEntityRefs)
  const selectedReference = selectedNodeId ? nodeEntityRefs.get(selectedNodeId) : undefined
  const shellProjectId = useLcosShellStore(state => state.projectId)
  const referenceProjectId = useLcosReferenceStore(state => state.projectId)
  const bindingRefreshVersion = useLcosReferenceStore(state => state.bindingRefreshVersion)
  const readKey = JSON.stringify([projectId, canvasId, imageRefsKey, bindingRefreshVersion])
  const [read, setRead] = useState<MaterialReadState>({
    key: '', status: 'loading', byNodeId: new Map(), rejectedByNodeId: new Map(),
  })
  const registrationOwners = useRef(new Map<string, object>())
  const [registrationFailure, setRegistrationFailure] = useState<{ key: string; message: string }>()

  // The original rename form checks the registered binding again on submit.
  // Invalidate only our exact owner during a refresh so a still-open form cannot
  // commit against an unverified binding; it remains mounted for same-identity
  // title/revision refreshes and keeps its draft.
  useLayoutEffect(() => {
    const invalidateOwnedRegistrations = () => {
      for (const [nodeId, owned] of registrationOwners.current) {
        const references = useLcosReferenceStore.getState()
        if (references.nodeEntityRefs.get(nodeId) === owned) references.forgetNode(nodeId)
      }
      registrationOwners.current.clear()
    }
    invalidateOwnedRegistrations()
    return invalidateOwnedRegistrations
  }, [projectId, canvasId, imageRefsKey, bindingRefreshVersion])

  useEffect(() => {
    let active = true
    const live = () => active && currentSceneMatches(projectId, canvasId, imageRefsKey, bindingRefreshVersion)
    setRead({ key: readKey, status: 'loading', byNodeId: new Map(), rejectedByNodeId: new Map() })
    setRegistrationFailure(undefined)

    if (!projectId.trim() || !canvasId.trim() || canvasStatus !== 'ready' || liveCanvasId !== canvasId
      || shellProjectId !== projectId || referenceProjectId !== projectId) {
      setRead({ key: readKey, status: 'unavailable', byNodeId: new Map(), rejectedByNodeId: new Map(),
        reason: '当前项目、Canvas 或 Core 引用现场尚未就绪。' })
      return () => { active = false }
    }

    const imageNodes = useCanvasStore.getState().nodes.filter(node => node.type === 'image')
    void Promise.all([
      session.projects.getProjectGraph(projectId),
      createProjectionBindingRegistry(session.http, projectId).list(),
    ]).then(([graph, bindings]) => {
      if (!live()) return
      const resolution = resolveNativeMaterialMetadata({ projectId, canvasId, nodes: imageNodes, graph, bindings })
      if (resolution.status !== 'ready') {
        setRead({ key: readKey, status: 'unavailable', byNodeId: new Map(), rejectedByNodeId: new Map(),
          reason: resolution.reason ?? 'Core 图片身份暂不可用。' })
        return
      }
      setRead({ key: readKey, status: 'ready', byNodeId: resolution.byNodeId,
        rejectedByNodeId: resolution.rejectedByNodeId })
    }).catch((error: unknown) => {
      if (!live()) return
      setRead({ key: readKey, status: 'unavailable', byNodeId: new Map(), rejectedByNodeId: new Map(),
        reason: error instanceof Error ? error.message : 'Core 图片身份读取失败。' })
    })
    return () => { active = false }
  }, [projectId, canvasId, imageRefsKey, readKey, canvasStatus, liveCanvasId,
    shellProjectId, referenceProjectId, bindingRefreshVersion, session])

  const currentRead = read.key === readKey ? read : undefined
  const selectedEntry = currentRead?.status === 'ready' && selectedNodeId
    ? currentRead.byNodeId.get(selectedNodeId)
    : undefined
  const selectedDtoMatches = selectedNode?.type === 'image' && selectedEntry !== undefined
    && referenceMatchesNativeDto(record(selectedNode.data)?.lcos_ref, selectedEntry.nativeRef)

  useEffect(() => {
    if (!currentRead || currentRead.status !== 'ready'
      || !currentSceneMatches(projectId, canvasId, imageRefsKey, bindingRefreshVersion)) return

    let selectedFailure: string | undefined
    // Both the primary and already-bound additional image Views read the same
    // Core metadata. Register verified facts through the existing owner, not a
    // second title store; leave unrelated and unverified nodes alone.
    for (const entry of currentRead.byNodeId.values()) {
      const references = useLcosReferenceStore.getState()
      const liveNode = useCanvasStore.getState().nodes.find(node => node.id === entry.nodeId)
      if (liveNode?.type !== 'image' || !referenceMatchesNativeDto(record(liveNode.data)?.lcos_ref, entry.nativeRef)) continue
      const existing = references.nodeEntityRefs.get(entry.nodeId)
      const previouslyRegistered = registrationOwners.current.get(entry.nodeId)
      if (referenceHasExpectedOwner(existing, entry)) {
        if (existing && typeof existing === 'object') registrationOwners.current.set(entry.nodeId, existing)
        continue
      }
      if (existing && !referenceIdentityMatches(existing, entry) && existing === previouslyRegistered) {
        references.forgetNode(entry.nodeId)
      }
      try {
        registerNativeMaterialSources(projectId, canvasId, registrationBatch(entry.nodeId, entry))
        if (!currentSceneMatches(projectId, canvasId, imageRefsKey, bindingRefreshVersion)) return
        const registered = useLcosReferenceStore.getState().nodeEntityRefs.get(entry.nodeId)
        if (!referenceHasExpectedOwner(registered, entry)) throw new Error('原图片身份登记后读回不一致。')
        if (registered && typeof registered === 'object') registrationOwners.current.set(entry.nodeId, registered)
      } catch (error) {
        if (entry.nodeId === selectedNodeId) {
          selectedFailure = error instanceof Error ? error.message : '原图片身份登记失败。'
        }
      }
    }
    setRegistrationFailure(previous => selectedFailure
      ? previous?.key === readKey && previous.message === selectedFailure ? previous : { key: readKey, message: selectedFailure }
      : undefined)
  }, [projectId, canvasId, imageRefsKey, readKey, currentRead, selectedNodeId,
    nodeEntityRefs, bindingRefreshVersion])

  const sceneReady = canvasStatus === 'ready' && liveCanvasId === canvasId
    && shellProjectId === projectId && referenceProjectId === projectId
  const canRename = sceneReady && currentRead?.status === 'ready' && currentRead.key === readKey
    && selectedNode?.type === 'image' && selectedEntry !== undefined && selectedDtoMatches
    && referenceHasExpectedOwner(selectedReference, selectedEntry)
    && registrationFailure?.key !== readKey
  const entryIdentityKey = nativeMaterialRenameIdentityKey(projectId, canvasId, selectedNodeId, selectedNode)
  const status = currentRead?.status === 'loading' || currentRead === undefined
    ? 'loading'
    : canRename ? 'ready' : 'unavailable'
  const statusMessage = status === 'loading'
    ? '正在读取当前图片的 Core 身份。'
    : status === 'ready'
      ? ''
      : registrationFailure?.key === readKey
        ? registrationFailure.message
        : currentRead?.reason
          ?? (selectedEntry ? currentRead?.rejectedByNodeId.get(selectedNodeId)
            : '只允许重命名当前已核实的单个 Core 图片。')

  return <>
    <span hidden aria-live="polite"
      data-lcos-native-material-rename-status={status}
      data-lcos-native-material-rename-enabled={canRename ? 'true' : 'false'}
      data-canvas-id={canvasId}
      data-node-id={selectedNodeId}
      data-lcos-native-material-rename-reason={statusMessage}>
      {statusMessage}
    </span>
    {sceneReady && <CanvasNodeRenameEntry key={entryIdentityKey} disabled={!canRename} />}
  </>
}
