/*
 * Thin adapter for the existing Rare UI Folder Component; it does not copy
 * the upstream Atlas implementation.
 * Upstream provenance: swamimalode07/rare-ui@b4de46e, MIT + Commons Clause
 * + Attribution. The directly reused source retains its license/credit note:
 * lcos/huabu/apps/web/src/lcos/ui/context/RareFolderComponent.tsx.
 */
import { useId, type JSX, type ReactNode } from 'react'

import FolderComponent from '../../lcos/huabu/apps/web/src/lcos/ui/context/RareFolderComponent'
import './native-pile-folder.css'

type Row = Readonly<Record<string, unknown>>

/** A native image/text node already checked against the current Core member and binding rows by its host. */
export interface NativePileFolderMember {
  readonly id: string
  readonly type: 'image' | 'text'
  readonly data: Row
}

export interface NativePileFolderFaceProps {
  readonly nodeId: string
  readonly title: string
  /** Current-Canvas Core-bound native nodes, in canonical member order. */
  readonly members: readonly NativePileFolderMember[]
  readonly selected?: boolean
  /** Host-owned local presentation state; selection alone never opens the fan. */
  readonly open?: boolean
  /** Restricts accepted Canvas artifact paths to the current native Canvas. */
  readonly canvasId?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Check the copied native node's Core identity again; the host remains responsible for current binding verification. */
function hasCoreArtifactReference(member: NativePileFolderMember): boolean {
  const reference = member.data.lcos_ref
  if (!record(reference) || reference.version !== 1
    || !nonEmpty(reference.artifactId) || !nonEmpty(reference.artifactViewId) || !nonEmpty(reference.revisionId)
    || !['artifact', 'view'].includes(String(reference.entityType))) return false
  return reference.entityId === (reference.entityType === 'artifact' ? reference.artifactId : reference.artifactViewId)
}

const artifactKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/
const fileRecordIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/

/** Allow only the managed Core FileRecord content route or a current-Canvas artifact route. */
function managedImageSource(value: unknown, canvasId?: string): string | undefined {
  if (!nonEmpty(value)) return undefined
  const source = value.trim()
  if (/[\\\u0000-\u0020]/.test(source)) return undefined

  let pathname: string
  if (/^https?:\/\//i.test(source)) {
    if (typeof window === 'undefined') return undefined
    try {
      const parsed = new URL(source)
      if (parsed.origin !== window.location.origin || parsed.username || parsed.password
        || parsed.search || parsed.hash || !['http:', 'https:'].includes(parsed.protocol)) return undefined
      pathname = parsed.pathname
    } catch {
      return undefined
    }
  } else {
    if (!source.startsWith('/') || source.startsWith('//') || source.includes('?') || source.includes('#')) return undefined
    pathname = source
  }

  const fileRecordMatch = /^\/api\/surface-core\/file-records\/([^/]+)\/content$/.exec(pathname)
  if (fileRecordMatch && fileRecordIdPattern.test(fileRecordMatch[1])) return pathname

  if (!nonEmpty(canvasId)) return undefined
  const artifactMatch = /^\/api\/canvas\/([^/]+)\/artifact\/([^/]+)$/.exec(pathname)
  if (!artifactMatch) return undefined
  try {
    const routeCanvasId = decodeURIComponent(artifactMatch[1])
    const key = decodeURIComponent(artifactMatch[2])
    if (routeCanvasId !== canvasId || !artifactKeyPattern.test(key) || key === '.' || key === '..') return undefined
    return `/api/canvas/${encodeURIComponent(canvasId)}/artifact/${encodeURIComponent(key)}`
  } catch {
    return undefined
  }
}

function previewFor(member: NativePileFolderMember, canvasId?: string): ReactNode | undefined {
  if (!nonEmpty(member.id) || !hasCoreArtifactReference(member)) return undefined

  if (member.type === 'image') {
    const src = managedImageSource(member.data.src, canvasId)
    if (!src) return undefined
    const label = nonEmpty(member.data.title) ? member.data.title.trim() : '图片材料'
    return <img className="native-pile-folder__image-preview" data-native-folder-member={member.id}
      src={src} alt={label} draggable={false} loading="lazy" />
  }

  if (member.type !== 'text') return undefined
  const title = nonEmpty(member.data.title) ? member.data.title.trim() : ''
  const body = typeof member.data.content === 'string' ? member.data.content
    : typeof member.data.text === 'string' ? member.data.text
      : typeof member.data.prompt === 'string' ? member.data.prompt : ''
  const excerpt = body.replace(/\s+/g, ' ').trim()
  const heading = title || excerpt.slice(0, 88)
  if (!heading) return undefined
  const summary = title && excerpt && excerpt !== title ? excerpt.slice(0, 180) : ''
  return <div className="native-pile-folder__text-preview" data-native-folder-member={member.id}
    aria-label={title || '文字材料预览'}>
    <strong>{heading}</strong>
    {summary ? <span>{summary}</span> : null}
  </div>
}

export function NativePileFolderFace({
  nodeId,
  title,
  members,
  selected = false,
  open = false,
  canvasId,
}: NativePileFolderFaceProps): JSX.Element {
  const folderTitle = title.trim() || '未命名集合'
  const cardContents = Array.isArray(members)
    ? members.slice(0, 3).map(member => previewFor(member, canvasId))
    : []
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  return <div
    className="native-pile-folder"
    role="group"
    data-native-pile-folder-node-id={nodeId}
    data-native-pile-folder-selected={String(selected)}
    data-native-pile-folder-open={String(open)}
    aria-label={`${folderTitle}，${open ? '本地预览已展开' : '本地预览已收起'}`}
  >
    <FolderComponent
      className="native-pile-folder__visual"
      color="black"
      selected={selected}
      open={open}
      cardContents={cardContents}
    />
    <span className="native-pile-folder__title" title={folderTitle}>{folderTitle}</span>
    <span id={`native-pile-folder-${generatedId}`} className="native-pile-folder__preview-description" aria-live="polite">
      {open ? `本地预览已展开，${cardContents.filter(Boolean).length} 个材料卡片可见。` : '本地预览已收起。'}
    </span>
  </div>
}
