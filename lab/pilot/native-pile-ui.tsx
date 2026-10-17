import { useEffect, useMemo, useRef, useState, type ComponentType, type JSX, type ReactNode } from 'react'
import { NativePileFolderFace } from './native-pile-folder'
import { requestNativeMaterialView } from './native-material-viewer-port'
import './native-pile-ui.css'

type Row = Record<string, any>
type CollectionRef = { projectId: string; canvasId: string; workspaceId: string; collectionId: string }
type Target = CollectionRef & { carrierId: string }
type Candidate = { nodeId: string; type: 'artifact'; id: string; title: string; node: Row }
type Read = { collection: Row; members: Row[]; previews: Row[]; candidates: Candidate[]; galleryCandidates: Candidate[];
  occurrences: { nodeId: string; type: string; id: string }[]; native: Row; bindings: Row[] }
type Host = { projectId?: string; canvasId?: string; currentCanvasId?: string; api?: Row }
const mutations = new Map<string, Promise<unknown>>()
const changedEvent = 'lcos:native-collection-updated'
const record = (x: unknown): x is Row => x !== null && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const host = (): Host | undefined => (window as any).__LCOS_NODE_LAB__

function collectionRef(data: unknown): CollectionRef | undefined {
  const value = record(data) ? data.lcos_collection_ref : undefined
  if (!record(value) || !['projectId', 'canvasId', 'workspaceId', 'collectionId'].every(k => text(value[k]))) return
  return value as CollectionRef
}

function targetOf(nodeId: string, data: Row, kind: string): Target | undefined {
  const ref = collectionRef(data)
  if (!ref || kind === 'pile' && data.lcos_native_collection !== true) return
  const carrierId = kind === 'group' ? data.lcosCollectionNodeId : nodeId
  if (!text(carrierId) || kind === 'group' && data.lcosCollectionId !== ref.collectionId) return
  return { ...ref, carrierId }
}

function sameRef(a: CollectionRef | undefined, b: CollectionRef): boolean {
  return !!a && a.projectId === b.projectId && a.canvasId === b.canvasId
    && a.workspaceId === b.workspaceId && a.collectionId === b.collectionId
}

function current(target: Target, owner = host()?.api): boolean {
  const h = host()
  if (!h) return false
  const carrier = h?.api?.getNode?.(target.carrierId) ?? h?.api?.getNodes?.().find((n: Row) => n.id === target.carrierId)
  return h?.api === owner && !!owner && (h.currentCanvasId || h.canvasId) === target.canvasId
    && (!h.projectId || h.projectId === target.projectId) && carrier?.type === 'pile'
    && carrier.data?.lcos_native_collection === true && sameRef(collectionRef(carrier.data), target)
}

async function core(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch('/api/lcos/core' + path, { redirect: 'error', ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  const payload = await response.json()
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || `Core HTTP ${response.status}`)
  return payload.value
}

const collectionPath = (t: Target) => '/projects/' + encodeURIComponent(t.projectId) + '/collections/' + encodeURIComponent(t.collectionId)
const mutationKey = (t: Target) => JSON.stringify([t.projectId, t.canvasId, t.collectionId])

async function readCollection(target: Target, signal?: AbortSignal): Promise<Read> {
  const owner = host()?.api
  if (!current(target, owner)) throw new Error('当前集合已离开原画布。')
  const [value, bindings, nativeResponse] = await Promise.all([
    core(collectionPath(target) + '/members', { signal }),
    core('/projects/' + encodeURIComponent(target.projectId) + '/spatial/bindings', { signal }),
    fetch('/api/canvas/v1/canvases/' + encodeURIComponent(target.canvasId), { signal, cache: 'no-store' }),
  ])
  const nativePayload = await nativeResponse.json()
  if (!nativeResponse.ok || nativePayload?.code !== 0 || !Array.isArray(nativePayload.data?.nodes)
    || !current(target, owner)) throw new Error('原画布或现场读取未确认。')
  if (!record(value?.collection) || value.collection.id !== target.collectionId
    || value.collection.projectId !== target.projectId || !Array.isArray(value.members) || !Array.isArray(bindings)
    || value.members.some((member: Row) => !record(member.memberRef) || !text(member.memberRef.type) || !text(member.memberRef.id))) {
    throw new Error('Core 返回的集合身份或完整成员不一致。')
  }
  const matches = bindings.filter((b: Row) => b.canvasId === target.canvasId && b.spatialKind === 'node' && b.spatialId === target.carrierId)
  if (matches.length !== 1 || matches[0].projectId !== target.projectId || matches[0].entityType !== 'collection'
    || matches[0].entityId !== target.collectionId) throw new Error('当前 Pile 没有唯一的 Core Collection 绑定。')
  const nodes: Row[] = nativePayload.data.nodes
  const carrier = nodes.find(n => n.id === target.carrierId)
  if (carrier?.type !== 'pile' || !sameRef(collectionRef(carrier.data), target)) throw new Error('Core 载体与原 Pile 不一致。')
  const galleryCandidates = nodes.flatMap((node): Candidate[] => {
    const ref = node.data?.lcos_ref
    if (!['image', 'text', 'audio', 'video'].includes(node.type) || !record(ref) || ref.version !== 1
      || !text(ref.artifactId) || !text(ref.artifactViewId) || !text(ref.revisionId)
      || !['artifact', 'view'].includes(ref.entityType)
      || ref.entityId !== (ref.entityType === 'artifact' ? ref.artifactId : ref.artifactViewId)) return []
    const rows = bindings.filter((b: Row) => b.canvasId === target.canvasId && b.spatialKind === 'node' && b.spatialId === node.id)
    if (rows.length !== 1 || rows[0].projectId !== target.projectId || rows[0].entityType !== ref.entityType
      || rows[0].entityId !== ref.entityId) return []
    return [{ nodeId: node.id, type: 'artifact', id: ref.artifactId, title: String(node.data.title || node.id), node }]
  })
  const candidates = galleryCandidates.filter(candidate => ['image', 'text'].includes(candidate.node.type))
  const occurrences = (Array.isArray(carrier.data?.memberIds) ? carrier.data.memberIds : []).flatMap((nodeId: string) => {
    const saved = nodes.find(node => node.id === nodeId)
    const rows = bindings.filter((binding: Row) => binding.canvasId === target.canvasId && binding.projectId === target.projectId
      && binding.spatialKind === 'node' && binding.spatialId === nodeId)
    if (!saved || rows.length !== 1) return []
    const artifact = galleryCandidates.find(candidate => candidate.nodeId === nodeId)
    const type = artifact ? 'artifact' : rows[0].entityType, id = artifact?.id ?? rows[0].entityId
    return value.members.some((member: Row) => member.memberRef.type === type && member.memberRef.id === id) ? [{ nodeId, type, id }] : []
  })
  return { collection: value.collection, members: value.members, previews: value.previews ?? [],
    candidates, galleryCandidates, occurrences, native: carrier, bindings }
}

function announce(target: Target): void {
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { ...target } }))
}

async function refreshCarrier(target: Target, owner: Row): Promise<void> {
  if (!current(target, owner)) return
  const response = await fetch('/api/lcos/canvases/' + encodeURIComponent(target.canvasId) + '/collections/'
    + encodeURIComponent(target.collectionId) + '/projection', { cache: 'no-store', headers: { Accept: 'application/json' } })
  const payload = await response.json()
  if (!response.ok || payload?.code !== 0 || !payload.data?.node || !current(target, owner)) {
    throw new Error('Core 已保存，原 Pile 的只读回执未确认；请刷新核对，不重复提交。')
  }
  const result = await owner.synchronizeCollectionCarrier?.({ ...target, node: payload.data.node },
    { isCurrent: () => current(target, owner) })
  if (result?.ok !== true) throw new Error('Core 已保存，但原画布回执未确认：' + String(result?.reason ?? '接口不可用'))
  announce(target)
}

async function exclusive<T>(target: Target, work: (owner: Row) => Promise<T>): Promise<T> {
  const key = mutationKey(target)
  if (mutations.has(key)) throw new Error('集合操作仍在确认，请等本次完成。')
  const owner = host()?.api
  if (!owner || !current(target, owner)) throw new Error('当前原画布不可用。')
  const pending = work(owner)
  mutations.set(key, pending)
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { ...target, pending: true } }))
  try { return await pending } finally {
    if (mutations.get(key) === pending) {
      mutations.delete(key)
      window.dispatchEvent(new CustomEvent(changedEvent, { detail: { ...target, pending: false } }))
    }
  }
}

async function changeMember(target: Target, member: { type: string; id: string }, remove: boolean): Promise<void> {
  return exclusive(target, async owner => {
    const proof = await readCollection(target)
    if (!current(target, owner)) throw new Error('核对成员时现场已切换。')
    const exists = proof.members.some(m => m.memberRef?.type === member.type && m.memberRef?.id === member.id)
    if (remove && !exists || !remove && exists) { await refreshCarrier(target, owner); return }
    if (!remove && !proof.candidates.some(c => c.type === member.type && c.id === member.id)) {
      throw new Error('只允许加入当前画布已核实的 Core 材料。')
    }
    await core(collectionPath(target) + '/members', { method: remove ? 'DELETE' : 'POST',
      body: JSON.stringify({ memberType: member.type, memberId: member.id }) })
    const after = await readCollection(target)
    if (after.members.some(m => m.memberRef?.type === member.type && m.memberRef?.id === member.id) === remove) {
      throw new Error('成员变更结果尚未确认，请先核对集合。')
    }
    await refreshCarrier(target, owner)
  })
}

/** The native drop contains all selected NodeIDs, including distinct Views of
 * one Artifact. Validate every ID first, then submit each entity only once.
 * No native memberIds or geometry is authored outside the original owner. */
async function addMembers(target: Target, nodeIds: unknown): Promise<void> {
  return exclusive(target, async owner => {
    const proof = await readCollection(target)
    if (!Array.isArray(nodeIds) || !nodeIds.length || nodeIds.some(id => !text(id))) {
      throw new Error('没有找到本次拖入的材料，集合保持不变。')
    }
    const requested = [...new Set(nodeIds)] as string[]
    const rows = requested.map(id => proof.candidates.find(candidate => candidate.nodeId === id))
    if (rows.some(row => !row) || !current(target, owner)) {
      throw new Error('部分材料不属于当前画布，尚未加入集合。')
    }
    const unique = [...new Map(rows.map(row => [row!.id, row!])).values()]
    for (const row of unique) {
      if (!current(target, owner)) throw new Error('画布已切换，后续材料未继续加入。')
      if (proof.members.some(member => member.memberRef?.type === row.type && member.memberRef?.id === row.id)) continue
      // A lost reply is never retried automatically: membership readback is the
      // recovery path, not another POST from a repeated drop callback.
      await core(collectionPath(target) + '/members', { method: 'POST',
        body: JSON.stringify({ memberType: row.type, memberId: row.id }) })
    }
    const after = await readCollection(target)
    if (unique.some(row => !after.members.some(member => member.memberRef?.type === row.type && member.memberRef?.id === row.id))) {
      throw new Error('部分加入结果尚未确认，请先核对集合。')
    }
    await refreshCarrier(target, owner)
  })
}

async function mergeMembers(target: Target, source: Target): Promise<void> {
  return exclusive(target, owner => exclusive(source, async sourceOwner => {
    if (sourceOwner !== owner || target.projectId !== source.projectId || target.canvasId !== source.canvasId
      || target.workspaceId !== source.workspaceId) throw new Error('两个集合不在同一画布，未合并。')
    await Promise.all([readCollection(target), readCollection(source)])
    if (!current(target, owner) || !current(source, owner)) throw new Error('原画布已变化，两个集合都已保留。')
    const result = await owner.mergeCollectionSpace?.({ ...target, nodeId: target.carrierId,
      sourceCollectionId: source.collectionId, sourceNodeId: source.carrierId }, { isCurrent: () => current(target, owner) })
    if (result?.ok !== true) throw new Error(result?.reason || '集合合并接口尚未就绪，两个集合都已保留。')
    announce(target)
  }))
}

function reportFailure(target: Target, error: unknown): void {
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { ...target,
    error: error instanceof Error ? error.message : String(error) } }))
}

/** Capture the original title editor's scene at render time. Its existing hl
 * debounce flushes on unmount, so a late commit must never adopt a new host. */
export function LCOSNativePileTitleCommit(node: unknown): ((title: string) => Promise<void>) | undefined {
  if (!record(node) || !text(node.id) || !record(node.data) || node.data.id !== node.id
    || !['pile', 'group'].includes(node.type)) return
  const target = targetOf(node.id, node.data, node.type)
  if (!target) return
  const owner = host()?.api
  return async title => {
    try {
      if (!owner || !current(target, owner)) throw new Error('画布已切换，名称未继续保存。')
      await exclusive(target, async activeOwner => {
        const proof = await readCollection(target)
        const next = title.trim()
        if (!next || next.length > 500) throw new Error('集合名称需要 1–500 个字。')
        if (!current(target, owner) || activeOwner !== owner) throw new Error('画布已切换，名称未继续保存。')
        if (proof.collection.title !== next) {
          const result = await core(collectionPath(target), { method: 'PATCH', body: JSON.stringify({ title: next }) })
          if (result?.id !== target.collectionId || result.projectId !== target.projectId || result.title !== next) {
            throw new Error('名称保存结果尚未确认，请先核对集合。')
          }
        }
        await refreshCarrier(target, owner)
      })
    } catch (error) { reportFailure(target, error) }
  }
}

async function toggleSpace(target: Target): Promise<void> {
  return exclusive(target, async owner => {
    await readCollection(target)
    if (!current(target, owner)) throw new Error('展开前原现场已变化。')
    const result = await owner.toggleCollectionSpace?.({ ...target, nodeId: target.carrierId },
      { isCurrent: () => current(target, owner) })
    if (result?.ok !== true) throw new Error(result?.reason || '原画布空间操作未确认。')
    const focusId = result.collapsed === true ? target.carrierId : result.frameId
    if (text(focusId) && current(target, owner) && typeof owner.fitView === 'function') {
      // Native Group bounds can be far from its compact Pile carrier. Use the
      // existing Flow camera to show the saved result, never relocate members.
      await owner.fitView({ nodes: [{ id: focusId }], includeHiddenNodes: true,
        padding: 0.2, minZoom: 0.15, maxZoom: 1, duration: 180 })
    }
    announce(target)
  })
}

/** Core identity predicate retained for the existing change-protection seam.
 * Editing itself now uses the original title input with TitleCommit above. */
export function LCOSNativePileTitleReadonly(node: unknown): boolean {
  if (!record(node) || !text(node.id) || !record(node.data) || node.data.id !== node.id
    || !['pile', 'group'].includes(node.type)) return false
  return !!targetOf(node.id, node.data, node.type)
}

/** Original jVe protects ordinary Pile members from Canvas geometry changes.
 * A Core member expanded into its exact native Group is an editable main-Canvas
 * node instead. Give only Ri's protection lookup a derived membership list;
 * the original nodes, actual Pile memberIds, changes, O8 and save path stay intact. */
export function LCOSNativePileChangeGuardNodes(changes: Row[], nodes: Row[]): Row[] {
  if (!Array.isArray(changes) || !Array.isArray(nodes)) return nodes
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (byId.size !== nodes.length) return nodes
  const proposed = new Map(byId)
  const replacement = new Map<string, Row>()
  const changedIds = new Set<string>()
  for (const change of changes) {
    const id = change.type === 'add' ? change.item?.id : change.id
    if (!text(id)) return nodes
    if (['add', 'remove', 'replace'].includes(change.type)) {
      if (changedIds.has(id)) return nodes
      changedIds.add(id)
    }
    if (change.type === 'remove') proposed.delete(id)
    else if (change.type === 'add' || change.type === 'replace') {
      if (!record(change.item) || change.item.id !== id) return nodes
      proposed.set(id, change.item)
      if (change.type === 'replace') replacement.set(id, change.item)
    }
  }
  const groupsByCarrier = new Map<string, Row[]>()
  for (const group of proposed.values()) {
    if (group.type !== 'group' || group.data?.id !== group.id) continue
    const target = targetOf(group.id, group.data, 'group')
    const pile = target ? byId.get(target.carrierId) : undefined
    if (!target || pile?.type !== 'pile' || pile.data?.id !== pile.id
      || pile.data?.lcos_native_collection !== true || !sameRef(collectionRef(pile.data), target)) continue
    const list = groupsByCarrier.get(pile.id) ?? []
    list.push(group); groupsByCarrier.set(pile.id, list)
  }
  let result = nodes
  for (const [pileId, groups] of groupsByCarrier) {
    const pile = byId.get(pileId)!
    if (groups.length !== 1 || !Array.isArray(pile.data.memberIds)) continue
    const group = groups[0]
    const protectedIds = pile.data.memberIds.filter((id: string) => {
      const original = byId.get(id), next = replacement.get(id) ?? original
      const ref = original?.data?.lcos_ref
      const nextRef = next?.data?.lcos_ref
      return !original || !['image', 'text'].includes(original.type) || next?.type !== original.type
        || next?.parentId !== group.id || !record(ref) || ref.version !== 1 || !text(ref.artifactId)
        || !text(ref.artifactViewId) || !text(ref.revisionId)
        || !record(nextRef) || Object.keys(ref).length !== Object.keys(nextRef).length
        || Object.keys(ref).some(key => ref[key] !== nextRef[key])
    })
    if (protectedIds.length === pile.data.memberIds.length) continue
    if (result === nodes) result = [...nodes]
    result[result.indexOf(pile)] = { ...pile, data: { ...pile.data, memberIds: protectedIds } }
  }
  return result
}

/** wFe/Xh grows and offsets the visible Pile fan around its canonical center.
 * ResizeObserver measures that display projection, not the stored Pile box.
 * Explicit resize changes keep their original route; only passive observer
 * dimensions on an exact Core carrier are excluded from authoring changes. */
export function LCOSNativePileCanonicalChanges(changes: Row[], nodes: Row[]): Row[] {
  if (!Array.isArray(changes) || !Array.isArray(nodes)) return changes
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (byId.size !== nodes.length) return changes
  const kept = changes.filter(change => {
    const node = byId.get(change.id), size = change.dimensions
    if (change.type !== 'dimensions' || change.setAttributes || change.resizing
      || !record(size) || !Number.isFinite(size.width) || size.width <= 0
      || !Number.isFinite(size.height) || size.height <= 0
      || Object.keys(change).some(key => !['id', 'type', 'dimensions', 'setAttributes', 'resizing'].includes(key))
      || node?.type !== 'pile' || !LCOSNativePileTitleReadonly(node)) return true
    return false
  })
  return kept.length === changes.length ? changes : kept
}

/** Original page operation callbacks delegate only Core-bound Piles here. */
export function LCOSNativePileOperation(kind: string, nodes: Row[], pileId: string, memberId?: string | string[]): boolean {
  const pile = Array.isArray(nodes) ? nodes.find(n => n.id === pileId) : undefined
  const target = pile?.type === 'pile' ? targetOf(pileId, pile.data, 'pile') : undefined
  // A merge has both identities. Never let an ordinary target silently consume
  // a Core source, or lose its members through the original Canvas-only merge.
  const source = kind === 'merge' && typeof memberId === 'string' ? nodes.find(n => n.id === memberId) : undefined
  const sourceTarget = source?.type === 'pile' ? targetOf(source.id, source.data, 'pile') : undefined
  if (!target && !sourceTarget) return false
  const reportingTarget = target ?? sourceTarget!
  let operation: Promise<unknown>
  if (kind === 'unpile' && target) operation = toggleSpace(target)
  else if (kind === 'addMember' && target) operation = addMembers(target, memberId)
  else if (kind === 'merge' && target && sourceTarget) operation = mergeMembers(target, sourceTarget)
  else if (kind === 'removeMember' || kind === 'remove') {
    const member = nodes.find(n => n.id === memberId), ref = member?.data?.lcos_ref
    operation = record(ref) && text(ref.artifactId)
      ? changeMember(reportingTarget, { type: 'artifact', id: ref.artifactId }, true)
      : Promise.reject(new Error('原成员没有可核实的 Core 材料身份，未移除。'))
  } else operation = Promise.reject(new Error(kind === 'merge'
    ? '合并集合尚未接通，两个集合与成员都已保留。'
    : '这项集合操作尚未接通，集合保持不变。'))
  void operation.catch(error => reportFailure(reportingTarget, error))
  return true
}

/** Keep the original Pile display and restore only children of its exact saved
 * Collection group. No geometry, Core membership or editable node is mutated. */
export function LCOSNativePileDisplay(source: Row[], display: Row[], memberDisplay?: (node: Row) => Row): Row[] {
  if (!Array.isArray(source) || !Array.isArray(display)) return display
  const byId = new Map(source.map(n => [n.id, n]))
  const frames = new Map<string, Row>()
  for (const node of source) {
    if (node.type !== 'group' || !text(node.data?.lcosCollectionNodeId)) continue
    const pile = byId.get(node.data.lcosCollectionNodeId)
    if (pile?.type === 'pile' && pile.data?.lcos_native_collection === true
      && pile.data?.lcos_collection_ref?.collectionId === node.data.lcosCollectionId) frames.set(node.id, pile)
  }
  const result = display.map(node => {
    const original = byId.get(node.id), pile = original?.parentId ? frames.get(original.parentId) : undefined
    if (pile && Array.isArray(pile.data.memberIds) && pile.data.memberIds.includes(node.id)) return original!
    // Core Collections are many-to-many; Ri remains the exclusive physical
    // owner, but its winner must not erase another Collection's read display.
    // These are actual source nodes, not cloned Canvas nodes or new bindings.
    const target = original && targetOf(original.id, original.data ?? {}, 'pile')
    if (original?.type !== 'pile' || !target || typeof memberDisplay !== 'function'
      || !Array.isArray(original.data.memberIds)) return node
    const members = [...new Set<string>(original.data.memberIds)].map(id => byId.get(id)).filter((member): member is Row =>
      !!member && ['image', 'video', 'audio', 'text'].includes(member.type) && record(member.data?.lcos_ref))
    return { ...node, data: { ...node.data, displayMembers: members.map(member => memberDisplay(member)) } }
  })
  return result.some((node, index) => node !== display[index]) ? result : display
}

type GallerySession = Row & { lcosCollectionGallery?: Target & { api: Row } }
const galleryReference = (value: unknown) => record(value) ? JSON.stringify([value.version, value.entityType,
  value.entityId, value.artifactId, value.artifactViewId, value.revisionId]) : ''

/** Canonical read projection for the existing original Gallery. Local React
 * read state is not a Canvas/Pin store and never creates a member occurrence. */
export function LCOSUseNativePileGallery(session: GallerySession | null, originalMembers: Row[]) {
  const supplied = session?.lcosCollectionGallery
  const target = supplied && session?.pileId === supplied.carrierId ? supplied : undefined
  const key = target ? JSON.stringify([target.projectId, target.canvasId, target.workspaceId, target.collectionId, target.carrierId]) : ''
  const owner = target?.api
  const signature = JSON.stringify((originalMembers ?? []).map(member => ({ id: member.node?.id,
    ref: member.node?.data?.lcos_ref })))
  const [read, setRead] = useState<{ key: string; value?: Read; error?: string; loading?: boolean }>({ key: '' })
  const [refresh, setRefresh] = useState(0)
  const [opening, setOpening] = useState(false)
  const liveRead = useRef({ key, owner }); liveRead.current = { key, owner }
  useEffect(() => () => { liveRead.current = { key: '', owner: undefined } }, [])
  useEffect(() => { setOpening(false) }, [key, owner])
  useEffect(() => {
    if (!target) return
    const controller = new AbortController()
    setRead(previous => ({ key, ...(previous.key === key ? { value: previous.value } : {}), loading: true }))
    if (!current(target, owner)) {
      setRead({ key, error: '现场已切换，请关闭后从原集合重新打开。' })
      return () => controller.abort()
    }
    void readCollection(target, controller.signal).then(value => {
      if (!controller.signal.aborted && current(target, owner)) setRead({ key, value })
    }).catch(error => {
      if (!controller.signal.aborted) setRead({ key, error: current(target, owner)
        ? '完整成员暂时无法核对，请重新读取；没有替换其他集合。' : '现场已切换，请关闭后从原集合重新打开。' })
    })
    return () => controller.abort()
  }, [key, owner, signature, refresh])
  useEffect(() => {
    if (!target) return
    const changed = (event: Event) => {
      const value = (event as CustomEvent).detail
      if (value?.projectId === target.projectId && value.canvasId === target.canvasId && value.collectionId === target.collectionId
        && typeof value.pending !== 'boolean') setRefresh(value => value + 1)
    }
    const sceneChanged = () => setRefresh(value => value + 1)
    window.addEventListener(changedEvent, changed)
    window.addEventListener('lcos-native-bridge-changed', sceneChanged)
    return () => { window.removeEventListener(changedEvent, changed); window.removeEventListener('lcos-native-bridge-changed', sceneChanged) }
  }, [key, owner])
  if (!target) return undefined
  const value = read.key === key && current(target, owner) ? read.value : undefined
  const byId = new Map((value?.galleryCandidates ?? []).map(candidate => [candidate.nodeId, candidate]))
  const nodes: Row[] = (value?.native.data?.memberIds ?? []).flatMap((id: string) => {
    const candidate = byId.get(id), live = owner?.getNode?.(id) ?? owner?.getNodes?.().find((node: Row) => node.id === id)
    if (!candidate || !value!.members.some(member => member.memberRef?.type === candidate.type && member.memberRef.id === candidate.id)
      || galleryReference(live?.data?.lcos_ref) !== galleryReference(candidate.node.data.lcos_ref)) return []
    return [candidate.node]
  })
  const availability: Row = { available: '可读取', current: '可读取', stale: '原文件已变化', missing: '材料缺失', unreadable: '暂不可读' }
  const exceptions = (value?.members ?? []).flatMap(member => {
    const ref = member.memberRef, preview = value!.previews.find(row => row.type === ref.type && row.id === ref.id)
    const previewCount = nodes.filter(node => node.data?.lcos_ref?.artifactId === ref.id && ref.type === 'artifact').length
    const locationCount = value!.occurrences.filter(occurrence => occurrence.type === ref.type && occurrence.id === ref.id).length
    if (['available', 'current'].includes(preview?.availability) && locationCount > 0 && previewCount === locationCount) return []
    return [{ ref, preview, previewCount, locationCount }]
  })
  const canRefresh = !!(read.key === key && read.error || exceptions.length || value && !value.members.length)
  const openMember = async (artifactId: string) => {
    if (opening || !current(target, owner)) return
    const stillReading = () => liveRead.current.key === key && liveRead.current.owner === owner && current(target, owner)
    setOpening(true)
    try {
      const proof = await readCollection(target)
      if (!stillReading()) return
      const member = proof.members.find(row => row.memberRef.type === 'artifact' && row.memberRef.id === artifactId)
      const preview = proof.previews.find(row => row.type === 'artifact' && row.id === artifactId)
      if (!member || preview?.availability !== 'available' || proof.occurrences.some(row => row.type === 'artifact' && row.id === artifactId)) {
        setRead({ key, value: proof, error: '材料状态或位置已变化，请查看更新后的内容。' }); return
      }
      setRead({ key, value: proof })
      // An unprojected canonical Artifact has no pinned View. This is its
      // genuine entity read; projected cards keep their own exact old Ref.
      requestNativeMaterialView({ projectId: target.projectId, artifactId, title: preview.label })
    } catch { if (stillReading()) setRead(previous => ({ ...previous, key, error: '这份材料暂时无法打开，请重新读取。' })) }
    finally { if (liveRead.current.key === key && liveRead.current.owner === owner) setOpening(false) }
  }
  const content = <section key="collection-info" data-native-collection-gallery-info className="relative z-10 px-6 py-3 text-xs text-muted-foreground"
    aria-label="集合成员与读取状态" onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong className="truncate font-medium text-foreground">{value?.collection.title || '集合成员'}</strong>
      {value && <span>{value.members.length} 个成员 · {value.occurrences.length} 个位置</span>}
      {canRefresh && <button type="button" className="underline underline-offset-2" disabled={read.key === key && read.loading}
        onClick={() => setRefresh(value => value + 1)}>重新读取</button>}</div>
    {read.key === key && read.loading && <p role="status">正在核对完整成员…</p>}
    {read.key === key && read.error && <p role="status">{read.error}</p>}
    {value && !value.members.length && <p role="status">这个集合暂时没有成员。</p>}
    {exceptions.length > 0 && <ul className="mt-2 space-y-1 leading-5">{exceptions.map(({ ref, preview, previewCount, locationCount }) =>
      <li key={ref.type + ':' + ref.id} data-native-collection-gallery-member={ref.type + ':' + ref.id}>
        <span>{preview?.label || '成员暂不可读'}</span><span className="text-muted-foreground"> · {availability[preview?.availability] || '状态待确认'}
          {locationCount ? ` · ${locationCount} 个位置${previewCount !== locationCount ? '（暂不支持此预览）' : ''}` : ' · 尚无画布位置'}</span>
        {ref.type === 'artifact' && preview?.availability === 'available' && locationCount === 0
          && <button type="button" className="ml-2 underline underline-offset-2" disabled={opening || read.loading}
            onClick={() => { void openMember(ref.id) }}>查看</button>}
      </li>
    )}</ul>}
  </section>
  return { nodes, content }
}

type ShellProps = {
  nativeProps: Row
  NativeRenderer: ComponentType<any>
  NativeTitle: ComponentType<any>
  NativeToolbar: ComponentType<any>
  nodeKind: 'pile' | 'group'
}

/** Keep RareFolder in the original face, and place Collection actions inside
 * the original gFe/Group JT tool arrays. There is no second floating toolbar,
 * rename form, members window, Canvas, or Gallery owner. */
export function LCOSNativePileCollectionShell({ nativeProps, NativeRenderer, NativeTitle, nodeKind }: ShellProps): JSX.Element {
  const nodeId = String(nativeProps.id ?? '')
  const data = record(nativeProps.data) ? nativeProps.data : {}
  const target = targetOf(nodeId, data, nodeKind)
  const key = target ? JSON.stringify(target) : ''
  const [read, setRead] = useState<{ key: string; value?: Read; error?: string }>({ key: '' })
  const [busy, setBusy] = useState(false)
  const [operationPending, setOperationPending] = useState(() => !!target && mutations.has(mutationKey(target)))
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [folderOpen, setFolderOpen] = useState(false)
  useEffect(() => {
    setNotice(''); setFolderOpen(false)
    setOperationPending(!!target && mutations.has(mutationKey(target)))
  }, [key])
  useEffect(() => {
    if (!target) return
    const controller = new AbortController()
    setRead({ key })
    if (!current(target)) return () => controller.abort()
    void readCollection(target, controller.signal).then(value => {
      if (!controller.signal.aborted && current(target)) setRead({ key, value })
    }).catch(error => { if (!controller.signal.aborted) setRead({ key, error: String(error.message ?? error) }) })
    return () => controller.abort()
  }, [key, refresh])
  useEffect(() => {
    if (!target) return
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.collectionId !== target.collectionId || detail.canvasId !== target.canvasId
        || detail.projectId !== target.projectId || detail.workspaceId !== target.workspaceId) return
      if (typeof detail.pending === 'boolean') { setOperationPending(detail.pending); return }
      if (text(detail.error)) setNotice(detail.error)
      else { setNotice(''); setRefresh(n => n + 1) }
    }
    const bridgeChanged = () => setRefresh(n => n + 1)
    window.addEventListener(changedEvent, listener)
    window.addEventListener('lcos-native-bridge-changed', bridgeChanged)
    return () => {
      window.removeEventListener(changedEvent, listener)
      window.removeEventListener('lcos-native-bridge-changed', bridgeChanged)
    }
  }, [key])
  const value = read.key === key ? read.value : undefined
  const title = value?.collection.title ?? data.title
  const folderMembers = useMemo(() => {
    if (!value || !Array.isArray(value.native.data?.memberIds)) return []
    const projected = new Set(value.native.data.memberIds)
    return value.candidates.filter(candidate => projected.has(candidate.nodeId) && value.members.some(member =>
      member.memberRef?.type === 'artifact' && member.memberRef.id === candidate.id)).map(candidate => candidate.node)
  }, [value])
  const run = (action: () => Promise<unknown>) => {
    if (busy || operationPending) return
    setBusy(true); setNotice('')
    void action().catch(error => {
      const message = String(error.message ?? error)
      setNotice(message)
      if (target) reportFailure(target, error)
    }).finally(() => setBusy(false))
  }
  const renderedProps = useMemo(() => {
    if (!target) return nativeProps
    const disabled = busy || operationPending
    const kindLabels: Row = { artifact: '材料', note: '笔记', collection: '集合', scope: '范围',
      workspace: '工作区', conversation: '对话', run: '任务' }
    const label = (member: Row) => {
      const ref = member.memberRef
      return value?.previews.find(preview => preview.type === ref?.type && preview.id === ref?.id)?.label
        || value?.candidates.find(candidate => candidate.type === ref?.type && candidate.id === ref?.id)?.title
        || `未命名${kindLabels[ref?.type] || '成员'}`
    }
    const available = [...new Map((value?.candidates ?? []).filter(candidate =>
      !value?.members.some(member => member.memberRef?.type === candidate.type && member.memberRef?.id === candidate.id))
      .map(candidate => [candidate.id, candidate])).values()]
    const status = notice || (read.key === key ? read.error : '')
    const menuItems: Row[] = [
      ...(nodeKind === 'pile' ? [{ key: 'folder-preview', label: folderOpen ? '收纳预览' : '开口预览',
        disabled: disabled || !value, handle: () => setFolderOpen(open => !open) }] : []),
      { key: 'check-result', label: '核对集合', disabled, handle: () => run(async () => {
        await readCollection(target); await refreshCarrier(target, host()!.api!)
      }) },
      { key: 'members-divider', separator: true },
      { key: 'member-count', label: `成员 · ${value?.members.length ?? '…'}`, disabled: true },
      ...(value?.members ?? []).map(member => ({ key: 'member-' + member.memberRef.type + ':' + member.memberRef.id,
        label: <span data-native-collection-menu-item="member">{label(member)}</span>,
        subActions: [{ key: 'remove', label: '移出', disabled,
          handle: () => run(() => changeMember(target, member.memberRef, true)) }] })),
      ...(available.length ? [{ key: 'available-divider', separator: true }] : []),
      ...available.map(candidate => ({ key: 'add-' + candidate.id,
        label: <span data-native-collection-menu-item="available">{candidate.title}</span>,
        subActions: [{ key: 'add', label: '加入', disabled,
          handle: () => run(() => changeMember(target, candidate, false)) }] })),
      ...(status ? [{ key: 'operation-status', label: <span role="status" data-native-collection-menu-item="status">{status}</span>, disabled: true }] : []),
    ]
    const tools = (original: Row[][]) => {
      const next = original.map(group => group.map(tool => ['unpile', 'ungroup'].includes(tool.key)
        ? { ...tool, node: undefined, buttonType: 'obsidian', text: nodeKind === 'group' ? '收起集合' : '展开到画布',
          disabled: disabled || !value, dataTestId: nodeKind === 'group' ? 'native-collection-collapse' : 'native-collection-expand',
          handle: () => run(() => toggleSpace(target)) } : tool))
      if (nodeKind === 'pile') next.unshift([{ key: 'native-collection-title', buttonType: 'unwrapped',
        node: <span className="native-collection-title" data-native-collection-inline-title={nodeId}>
          <NativeTitle nodeId={nodeId} selected={nativeProps.selected === true} title={String(title ?? '未命名集合')} />
        </span> }])
      next.push([{ key: 'native-collection-menu', buttonType: 'more',
        node: <span aria-label="集合操作" className="native-collection-menu-trigger">···</span>,
        tooltip: status || (disabled ? '正在确认集合操作' : '集合操作'),
        dataTestId: 'native-collection-menu', menuItems }])
      return next
    }
    const props = { ...nativeProps, lcosCollectionTools: tools }
    if (nodeKind === 'pile') return { ...props, lcosCollectionGallery: { ...target, api: host()?.api }, lcosCollectionFace: <NativePileFolderFace nodeId={nodeId}
      canvasId={target.canvasId} title={String(title ?? '未命名集合')} members={folderMembers}
      selected={nativeProps.selected === true} open={folderOpen} /> }
    return text(title) && data.title !== title ? { ...props, data: { ...data, title } } : props
  }, [nativeProps, key, title, nodeKind, folderMembers, folderOpen, value, busy, operationPending, notice, read.error])
  return <NativeRenderer {...renderedProps} />
}
