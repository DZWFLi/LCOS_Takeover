/**
 * Per-editor source mapping for the existing Gen1/GN2 outline projection.
 * Markdown remains the only document truth; this session is temporary edit
 * provenance, not a parallel body store.
 */

export interface OutlineNode {
  readonly id: string
  readonly text: string
  readonly tags: readonly string[]
  readonly depth: number
  readonly children: readonly OutlineNode[]
}

/** Enumerable so the existing `{ ...node }` editor updates carry provenance. */
export const OUTLINE_SOURCE = Symbol('lcos.native-outline-source.v1')

export interface OutlineSourceSession {
  parseOutline(): readonly OutlineNode[]
  serializeOutline(roots: readonly OutlineNode[]): string
  serializeBranch(branches: readonly OutlineNode[]): string
  cloneBranches(branches: readonly OutlineNode[]): readonly OutlineNode[]
}

type Style = 'bold' | 'highlight'

interface LineRecord {
  readonly index: number
  readonly content: string
  readonly eol: string
}

interface DecoratedChar {
  readonly value: string
  readonly styles: readonly Style[]
}

interface InlineSource {
  readonly chars: readonly DecoratedChar[]
  readonly canEditText: boolean
}

interface SourceNode {
  readonly sourceId: string
  readonly lineIndex: number
  readonly originalParentSourceId: string | null
  readonly originalText: string
  readonly originalTags: readonly string[]
  readonly originalDepth: number
  readonly prefix: string
  readonly body: string
  readonly structuralKind: 'heading' | 'bullet' | 'plain'
  readonly bullet: string
  readonly inline: InlineSource
  readonly sourceOriginal: boolean
}

type MappedNode = OutlineNode & { readonly [OUTLINE_SOURCE]?: SourceNode }

interface ParsedLine {
  readonly node: MappedNode
  readonly parentSourceId: string | null
}

interface OpaqueChunk {
  readonly records: readonly LineRecord[]
  readonly beforeSourceId: string | null
  readonly afterSourceId: string | null
  readonly priorVisibleIndex: number
  readonly nextVisibleIndex: number
  readonly sourceOrder: number
}

interface StackEntry {
  readonly outputIndex: number
  readonly logicalIndent: number
  readonly headingLevel: number
}

const TAG_PATTERN = /(?:^|\s)#([^\s#]+)/g
const BULLET_PATTERN = /^[-*+]\s+/
const HEADING_PATTERN = /^(#{1,6})\s+/
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/
const STYLE_PATTERN = /\*\*([^*]+)\*\*|==([^=]+)==/g
const UNSUPPORTED_INLINE_PATTERN = /`{1,}|!?\[[^\]]*\]\([^)]*\)|<\/?[A-Za-z!][^>]*>|~~|\\[\\`*_{}\[\]()#+.!|~-]|(?:^|\s)>\s|\|[^\n]*\|/u

function splitLines(source: string): LineRecord[] {
  const result: LineRecord[] = []
  let start = 0
  while (start < source.length) {
    let end = start
    while (end < source.length && source[end] !== '\r' && source[end] !== '\n') end += 1
    let eol = ''
    if (end < source.length) {
      eol = source[end] === '\r' && source[end + 1] === '\n' ? '\r\n' : source[end] ?? ''
    }
    result.push({ index: result.length, content: source.slice(start, end), eol })
    start = end + eol.length
  }
  return result
}

function normalizeLeadingSpaceEntities(line: string): string {
  return line.replace(/^(?:[ \t]|&#(?:x20|32);)+/i, (indent) => indent.replace(/&#(?:x20|32);/gi, ' '))
}

function indentWidth(line: string): number {
  const expanded = line.replace(/\t/g, '  ')
  return expanded.match(/^ */)?.[0].length ?? 0
}

function parseLine(rawLine: string): { text: string; tags: string[] } {
  const unbulleted = rawLine.trim().replace(BULLET_PATTERN, '').replace(HEADING_PATTERN, '')
  const tags: string[] = []
  TAG_PATTERN.lastIndex = 0
  for (let match = TAG_PATTERN.exec(unbulleted); match; match = TAG_PATTERN.exec(unbulleted)) tags.push(match[1] ?? '')
  const text = unbulleted
    .replace(TAG_PATTERN, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, tags }
}

function stripTags(body: string): string {
  return body.replace(TAG_PATTERN, '')
}

function normalizeChars(chars: readonly DecoratedChar[]): DecoratedChar[] {
  const result: DecoratedChar[] = []
  let pendingSpace = false
  for (const char of chars) {
    if (/\s/u.test(char.value)) {
      if (result.length) pendingSpace = true
      continue
    }
    if (pendingSpace) result.push({ value: ' ', styles: [] })
    pendingSpace = false
    result.push(char)
  }
  return result
}

function parseInline(body: string, expectedText: string): InlineSource {
  const tagless = stripTags(body)
  const spans: Array<{ start: number; end: number; marker: string; style: Style }> = []
  STYLE_PATTERN.lastIndex = 0
  for (let match = STYLE_PATTERN.exec(tagless); match; match = STYLE_PATTERN.exec(tagless)) {
    const marker = match[0].startsWith('**') ? '**' : '=='
    spans.push({ start: match.index, end: match.index + match[0].length, marker,
      style: marker === '**' ? 'bold' : 'highlight' })
  }
  const visible: DecoratedChar[] = []
  for (let index = 0; index < tagless.length;) {
    const span = spans.find((candidate) => index >= candidate.start && index < candidate.end)
    if (span && index === span.start) { index += span.marker.length; continue }
    if (span && index === span.end - span.marker.length) { index += span.marker.length; continue }
    const point = tagless.codePointAt(index)
    if (point === undefined) break
    const value = String.fromCodePoint(point)
    visible.push({ value, styles: span ? [span.style] : [] })
    index += value.length
  }
  const chars = normalizeChars(visible)
  return { chars, canEditText: chars.map((char) => char.value).join('') === expectedText
    && !UNSUPPORTED_INLINE_PATTERN.test(tagless) }
}

function defineSource(node: MappedNode, source: SourceNode): MappedNode {
  Object.defineProperty(node, OUTLINE_SOURCE, { value: source, enumerable: true, configurable: true })
  return node
}

function sourceOf(node: OutlineNode): SourceNode | undefined {
  return (node as MappedNode)[OUTLINE_SOURCE]
}

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

interface ForestEntry {
  readonly node: OutlineNode
  readonly parent: OutlineNode | null
  readonly parentSourceId: string | null
  readonly forestDepth: number
}

function flatten(roots: readonly OutlineNode[]): ForestEntry[] {
  const result: ForestEntry[] = []
  const visit = (nodes: readonly OutlineNode[], parent: OutlineNode | null, forestDepth: number) => {
    for (const node of nodes) {
      result.push({ node, parent, parentSourceId: parent ? sourceOf(parent)?.sourceId ?? null : null, forestDepth })
      visit(node.children, node, forestDepth + 1)
    }
  }
  visit(roots, null, 0)
  return result
}

function sameOriginalShape(roots: readonly OutlineNode[], original: readonly ParsedLine[]): boolean {
  const current = flatten(roots)
  return current.length === original.length && current.every((entry, index) => {
    const before = original[index]
    const meta = sourceOf(entry.node)
    return Boolean(before && meta?.sourceOriginal
      && meta.sourceId === sourceOf(before.node)?.sourceId
      && entry.parentSourceId === before.parentSourceId
      && entry.node.depth === before.node.depth
      && entry.node.text === before.node.text
      && tagsEqual(entry.node.tags, before.node.tags))
  })
}

function mapFormatting(oldChars: readonly DecoratedChar[], nextText: string): readonly DecoratedChar[] {
  const oldValues = oldChars.map((char) => char.value)
  const nextValues = Array.from(nextText)
  if ((oldValues.length + 1) * (nextValues.length + 1) > 1_500_000) {
    throw new Error('这段带格式的节点太长，无法安全映射修改；请先在正文视图编辑。')
  }
  const rows = Array.from({ length: oldValues.length + 1 }, () => new Uint32Array(nextValues.length + 1))
  for (let old = oldValues.length - 1; old >= 0; old -= 1) {
    const row = rows[old]
    const below = rows[old + 1]
    if (!row || !below) continue
    for (let next = nextValues.length - 1; next >= 0; next -= 1) {
      row[next] = oldValues[old] === nextValues[next]
        ? (below[next + 1] ?? 0) + 1
        : Math.max(below[next] ?? 0, row[next + 1] ?? 0)
    }
  }
  const styles: Array<readonly Style[] | undefined> = Array(nextValues.length).fill(undefined)
  let old = 0
  let next = 0
  while (old < oldValues.length && next < nextValues.length) {
    if (oldValues[old] === nextValues[next]) {
      styles[next] = oldChars[old]?.styles ?? []
      old += 1; next += 1
    } else if ((rows[old + 1]?.[next] ?? 0) >= (rows[old]?.[next + 1] ?? 0)) old += 1
    else next += 1
  }
  return nextValues.map((value, index) => ({ value, styles: styles[index] ?? [] }))
}

function renderMarkedText(chars: readonly DecoratedChar[]): string {
  const runs: Array<{ styles: readonly Style[]; text: string }> = []
  for (const char of chars) {
    const styleKey = [...char.styles].sort().join(',')
    const previous = runs[runs.length - 1]
    if (previous && [...previous.styles].sort().join(',') === styleKey) previous.text += char.value
    else runs.push({ styles: char.styles, text: char.value })
  }
  return runs.map(({ styles, text }) => {
    let rendered = text
    if (styles.includes('bold')) rendered = `**${rendered}**`
    if (styles.includes('highlight')) rendered = `==${rendered}==`
    return rendered
  }).join('')
}

function appendTags(text: string, tags: readonly string[]): string {
  for (const tag of tags) {
    if (!tag || /[\s#]/u.test(tag)) throw new Error(`无法安全写回无效标签「${tag}」。`)
  }
  return tags.length ? `${text} ${tags.map((tag) => `#${tag}`).join(' ')}` : text
}

function renderBody(node: OutlineNode, meta: SourceNode | undefined): string {
  if (!meta) {
    if (!node.text.trim()) throw new Error('空白新节点不能序列化；请先填写节点文字或删除它。')
    if (/(?:^|\s)#[^\s#]+/u.test(node.text)) throw new Error('标签请保留在节点 tags 字段；当前导图没有标签编辑器，拒绝把文字误写成标签。')
    if (/^#{1,6}\s/u.test(node.text)) throw new Error('节点文字以 heading 标记开头，现有 outline parser 无法区分字面量与标题；请在正文视图编辑。')
    if (/\*\*[^*]+\*\*|==[^=]+==/u.test(node.text)) throw new Error('新节点文字包含会被 Markdown 解析的强调标记，当前导图不能无损表达，已拒绝保存。')
    return appendTags(node.text, node.tags)
  }
  const textChanged = node.text !== meta.originalText
  const tagsChanged = !tagsEqual(node.tags, meta.originalTags)
  if (!textChanged && !tagsChanged) return meta.body
  if (!textChanged) return appendTags(stripTags(meta.body), node.tags)
  if (!meta.inline.canEditText) {
    throw new Error('该节点含有当前导图无法映射的 Markdown 语法；为避免丢格式，请在正文视图修改。')
  }
  if (/(?:^|\s)#[^\s#]+/u.test(node.text)) throw new Error('标签请在正文视图编辑；导图当前没有标签编辑器。')
  if (/^#{1,6}\s/u.test(node.text)) throw new Error('节点文字以 heading 标记开头，现有 outline parser 无法区分字面量与标题；请在正文视图编辑。')
  if (/\*\*[^*]+\*\*|==[^=]+==/u.test(node.text)) throw new Error('节点文字包含会被 Markdown 解析的强调标记，已拒绝保存以免静默改字。')
  return appendTags(renderMarkedText(mapFormatting(meta.inline.chars, node.text)), node.tags)
}

function logicalIndent(line: string, stack: readonly StackEntry[]): { logicalIndent: number; headingLevel: number } {
  const raw = normalizeLeadingSpaceEntities(line)
  const heading = raw.match(HEADING_PATTERN)
  if (heading) return { logicalIndent: ((heading[1]?.length ?? 1) - 1) * 2, headingLevel: heading[1]?.length ?? 1 }
  let openHeadingLevel = 0
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if ((stack[index]?.headingLevel ?? 0) > 0) { openHeadingLevel = stack[index]?.headingLevel ?? 0; break }
  }
  return { logicalIndent: indentWidth(raw) + openHeadingLevel * 2, headingLevel: 0 }
}

function simulateLine(content: string, outputIndex: number, stack: readonly StackEntry[]): { stack: StackEntry[]; parentIndex: number | null } {
  const parsed = logicalIndent(content, stack)
  const next = [...stack]
  while (next.length && (next[next.length - 1]?.logicalIndent ?? 0) >= parsed.logicalIndent) next.pop()
  const parentIndex = next[next.length - 1]?.outputIndex ?? null
  next.push({ outputIndex, ...parsed })
  return { stack: next, parentIndex }
}

function emitRecords(records: readonly LineRecord[], source: string, defaultEol: string): string {
  if (!records.length) return ''
  const hadFinalNewline = /(?:\r\n|\r|\n)$/.test(source)
  return records.map((record, index) => {
    const last = index === records.length - 1
    let eol = record.eol
    if (!last && !eol) eol = defaultEol
    if (last) eol = hadFinalNewline ? (eol || defaultEol) : ''
    return `${record.content}${eol}`
  }).join('')
}

function cloneLine(content: string, eol: string): LineRecord {
  return { index: -1, content, eol }
}

function leadingEntityDelta(raw: string): number {
  const rawLead = raw.match(/^(?:[ \t]|&#(?:x20|32);)+/i)?.[0] ?? ''
  const normalizedLead = normalizeLeadingSpaceEntities(rawLead)
  return rawLead.length - normalizedLead.length
}

export function createOutlineSourceSession(source: string): OutlineSourceSession {
  const lines = splitLines(source)
  const defaultEol = lines.find((line) => line.eol)?.eol ?? '\n'
  const roots: MappedNode[] = []
  const parsedByLine = new Map<number, ParsedLine>()
  const parseStack: Array<{ node: MappedNode; logicalIndent: number; headingLevel: number }> = []
  let idCounter = 0
  let fence: { marker: string; length: number } | undefined

  for (const record of lines) {
    const raw = normalizeLeadingSpaceEntities(record.content)
    const delimiter = raw.match(FENCE_PATTERN)
    if (delimiter) {
      const marker = delimiter[1] ?? ''
      if (!fence) fence = { marker: marker[0] ?? '', length: marker.length }
      else if (marker[0] === fence.marker && marker.length >= fence.length && !(delimiter[2] ?? '').trim()) fence = undefined
      continue
    }
    if (fence || !raw.trim()) continue
    const heading = raw.match(HEADING_PATTERN)
    const projection = parseLine(raw)
    if (!projection.text) continue
    const logical = heading
      ? ((heading[1]?.length ?? 1) - 1) * 2
      : indentWidth(raw) + ([...parseStack].reverse().find((entry) => entry.headingLevel > 0)?.headingLevel ?? 0) * 2
    while (parseStack.length && (parseStack[parseStack.length - 1]?.logicalIndent ?? 0) >= logical) parseStack.pop()
    const parent = parseStack[parseStack.length - 1] ?? null

    const leading = raw.length - raw.trimStart().length
    let remainder = raw.slice(leading).trimEnd()
    let normalizedBodyStart = leading
    let kind: SourceNode['structuralKind'] = 'plain'
    let bullet = '-'
    const bulletMatch = remainder.match(BULLET_PATTERN)
    if (bulletMatch) {
      kind = 'bullet'
      bullet = bulletMatch[0][0] ?? '-'
      normalizedBodyStart += bulletMatch[0].length
      remainder = remainder.slice(bulletMatch[0].length)
    }
    const headingMatch = remainder.match(HEADING_PATTERN)
    if (headingMatch) {
      kind = 'heading'
      normalizedBodyStart += headingMatch[0].length
    }
    const rawBodyStart = Math.min(record.content.length, normalizedBodyStart + leadingEntityDelta(record.content))
    const prefix = record.content.slice(0, rawBodyStart)
    const body = record.content.slice(rawBodyStart)
    const nodeDepth = parent ? parent.node.depth + 1 : 0
    const node = defineSource({ id: `outline-${++idCounter}`, text: projection.text, tags: projection.tags,
      depth: nodeDepth, children: [] }, {
      sourceId: `outline-line:${record.index}`, lineIndex: record.index,
      originalParentSourceId: parent ? sourceOf(parent.node)?.sourceId ?? null : null,
      originalText: projection.text, originalTags: projection.tags, originalDepth: nodeDepth,
      prefix, body, structuralKind: kind, bullet,
      inline: parseInline(body, projection.text), sourceOriginal: true,
    })
    if (parent) Object.assign(parent.node, { children: [...parent.node.children, node] } as Partial<OutlineNode>)
    else roots.push(node)
    parseStack.push({ node, logicalIndent: logical, headingLevel: heading?.[1]?.length ?? 0 })
    parsedByLine.set(record.index, { node, parentSourceId: parent ? sourceOf(parent.node)?.sourceId ?? null : null })
  }

  const originalVisible = [...parsedByLine.values()].sort((a, b) => sourceOf(a.node)!.lineIndex - sourceOf(b.node)!.lineIndex)
  const opaque: OpaqueChunk[] = []
  let lineIndex = 0
  let sourceOrder = 0
  while (lineIndex < lines.length) {
    if (parsedByLine.has(lineIndex)) { lineIndex += 1; continue }
    const start = lineIndex
    while (lineIndex < lines.length && !parsedByLine.has(lineIndex)) lineIndex += 1
    const prior = [...originalVisible].reverse().find((entry) => sourceOf(entry.node)!.lineIndex < start)
    const next = originalVisible.find((entry) => sourceOf(entry.node)!.lineIndex >= lineIndex)
    opaque.push({ records: lines.slice(start, lineIndex),
      beforeSourceId: prior ? sourceOf(prior.node)!.sourceId : null,
      afterSourceId: next ? sourceOf(next.node)!.sourceId : null,
      priorVisibleIndex: prior ? originalVisible.indexOf(prior) : -1,
      nextVisibleIndex: next ? originalVisible.indexOf(next) : originalVisible.length,
      sourceOrder: sourceOrder++ })
  }

  const usedIds = new Set(flatten(roots).map((entry) => entry.node.id))
  let cloneCounter = 0
  const cloneBranches = (branches: readonly OutlineNode[]): readonly OutlineNode[] => {
    const clone = (node: OutlineNode): OutlineNode => {
      let id = ''
      do { id = `${node.id}-copy-${++cloneCounter}` } while (usedIds.has(id))
      usedIds.add(id)
      const copy: MappedNode = { ...node, id, children: node.children.map(clone) }
      const meta = sourceOf(node)
      if (meta) defineSource(copy, { ...meta, sourceOriginal: false })
      return copy
    }
    return branches.map(clone)
  }

  const renderForest = (forest: readonly OutlineNode[]): { records: LineRecord[]; sourceToOutput: Map<string, number> } => {
    const entries = flatten(forest)
    const preferredOutput = new Map<string, number>()
    for (let index = 0; index < entries.length; index += 1) {
      const meta = sourceOf(entries[index]!.node)
      if (!meta) continue
      const prior = preferredOutput.get(meta.sourceId)
      if (prior === undefined || (!sourceOf(entries[prior]!.node)?.sourceOriginal && meta.sourceOriginal)) preferredOutput.set(meta.sourceId, index)
    }
    const outputIndexByNode = new Map<OutlineNode, number>()
    entries.forEach((entry, index) => outputIndexByNode.set(entry.node, index))
    const sourceToOutput = new Map<string, number>()
    const records: LineRecord[] = []
    let stack: StackEntry[] = []

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!
      const node = entry.node
      const meta = sourceOf(node)
      const targetDepth = entry.forestDepth
      const targetParentIndex = entry.parent ? outputIndexByNode.get(entry.parent) : null
      if (entry.parent && targetParentIndex === undefined) throw new Error('导图父节点映射缺失，拒绝写回。')
      const targetDepthAndParentUnchanged = Boolean(meta && targetDepth === meta.originalDepth
        && entry.parentSourceId === meta.originalParentSourceId)
      const reuseOriginalLine = meta !== undefined && preferredOutput.get(meta.sourceId) === index
      const originalRecord = meta ? lines[meta.lineIndex] : undefined
      const body = renderBody(node, meta)
      let chosenContent: string | undefined
      let chosenSimulation: ReturnType<typeof simulateLine> | undefined

      if (meta && targetDepthAndParentUnchanged) {
        const prefix = meta.prefix
        const candidateContent = `${prefix}${body}`
        const candidate = simulateLine(candidateContent, index, stack)
        if (candidate.parentIndex === (targetParentIndex ?? null)) {
          chosenContent = candidateContent
          chosenSimulation = candidate
          if (reuseOriginalLine && originalRecord && body === meta.body && candidateContent === originalRecord.content) {
            chosenContent = originalRecord.content
          }
        }
      }

      if (!chosenSimulation) {
        const parentPosition = targetParentIndex === null ? -1 : stack.findIndex((item) => item.outputIndex === targetParentIndex)
        if (targetParentIndex !== null && parentPosition < 0) {
          throw new Error('导图当前父节点已无法由 Markdown 层级表达；未提交正文改写。')
        }
        const parentIndent = parentPosition >= 0 ? stack[parentPosition]?.logicalIndent ?? -2 : -2
        const desiredLogical = targetParentIndex === null ? 0 : Math.max(targetDepth * 2, parentIndent + 2)
        const activeHeading = [...stack].reverse().find((item) => item.headingLevel > 0)?.headingLevel ?? 0
        let prefix: string
        if (meta?.structuralKind === 'heading') {
          prefix = `${'#'.repeat(Math.max(1, Math.min(6, targetDepth + 1)))} `
        } else if (desiredLogical < activeHeading * 2) {
          const level = desiredLogical / 2 + 1
          if (!Number.isInteger(level) || level < 1 || level > 6) {
            throw new Error('该层级超出 Markdown heading/indent 可表达范围；请在正文视图调整。')
          }
          prefix = `${'#'.repeat(level)} `
        } else {
          const indent = desiredLogical - activeHeading * 2
          prefix = `${' '.repeat(indent)}${meta?.bullet || '-'} `
        }
        const candidateContent = `${prefix}${body}`
        const candidate = simulateLine(candidateContent, index, stack)
        if (candidate.parentIndex !== (targetParentIndex ?? null)) {
          throw new Error('导图当前层级与 Markdown heading/indent 规则冲突；未改写正文，请先在正文视图调整标题层级。')
        }
        chosenContent = candidateContent
        chosenSimulation = candidate
      }

      stack = chosenSimulation.stack
      const eol = reuseOriginalLine && originalRecord ? originalRecord.eol : defaultEol
      const renderedRecord = reuseOriginalLine && originalRecord && chosenContent === originalRecord.content
        ? originalRecord
        : cloneLine(chosenContent ?? `${meta?.prefix ?? ''}${body}`, eol)
      records.push(renderedRecord)
      outputIndexByNode.set(node, index)
      if (meta && reuseOriginalLine) sourceToOutput.set(meta.sourceId, index)
    }
    return { records, sourceToOutput }
  }

  const serializeOutline = (forest: readonly OutlineNode[]): string => {
    if (sameOriginalShape(forest, originalVisible)) return source
    const rendered = renderForest(forest)
    const before = new Map<number, OpaqueChunk[]>()
    const after = new Map<number, OpaqueChunk[]>()
    const floating: OpaqueChunk[] = []
    const push = (bucket: Map<number, OpaqueChunk[]>, index: number, chunk: OpaqueChunk) => {
      bucket.set(index, [...(bucket.get(index) ?? []), chunk])
    }
    for (const chunk of opaque) {
      let right = chunk.afterSourceId ? rendered.sourceToOutput.get(chunk.afterSourceId) : undefined
      let left = chunk.beforeSourceId ? rendered.sourceToOutput.get(chunk.beforeSourceId) : undefined
      if (right !== undefined && left !== undefined) {
        // Keep the opaque chunk adjacent to its original following row when
        // both anchors survive, even if a branch move reversed their order.
        push(before, right, chunk)
        continue
      }
      if (right !== undefined) { push(before, right, chunk); continue }
      if (left !== undefined) { push(after, left, chunk); continue }
      for (let prior = chunk.priorVisibleIndex; prior >= 0 && left === undefined; prior -= 1) {
        const original = originalVisible[prior]
        const id = original ? sourceOf(original.node)?.sourceId : undefined
        if (id) left = rendered.sourceToOutput.get(id)
      }
      for (let next = chunk.nextVisibleIndex; next < originalVisible.length && right === undefined; next += 1) {
        const original = originalVisible[next]
        const id = original ? sourceOf(original.node)?.sourceId : undefined
        if (id) right = rendered.sourceToOutput.get(id)
      }
      if (left !== undefined) push(after, left, chunk)
      else if (right !== undefined) push(before, right, chunk)
      else floating.push(chunk)
    }

    const output: LineRecord[] = []
    for (let index = 0; index < rendered.records.length; index += 1) {
      for (const chunk of (before.get(index) ?? []).sort((a, b) => a.sourceOrder - b.sourceOrder)) output.push(...chunk.records)
      output.push(rendered.records[index]!)
      for (const chunk of (after.get(index) ?? []).sort((a, b) => a.sourceOrder - b.sourceOrder)) output.push(...chunk.records)
    }
    if (!rendered.records.length) {
      for (const chunk of [...opaque].sort((a, b) => a.sourceOrder - b.sourceOrder)) output.push(...chunk.records)
    } else {
      for (const chunk of floating.sort((a, b) => a.sourceOrder - b.sourceOrder)) output.push(...chunk.records)
    }
    return emitRecords(output, source, defaultEol)
  }

  const serializeBranch = (branches: readonly OutlineNode[]): string => {
    return renderForest(branches).records.map((record) => record.content).join('\n')
  }

  return {
    parseOutline: () => roots,
    serializeOutline,
    serializeBranch,
    cloneBranches,
  }
}
