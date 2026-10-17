// Adopted project-owned Gen1 pure outline logic @3e99769. No backend or body store.
/**
 * Outline tree — the data layer for mubu-style mind-map text nodes.
 *
 * The outline TEXT is the single source of truth (markmap paradigm):
 * hierarchy comes from indentation (two/four spaces or tabs, optionally with
 * "-"/"*" bullets) AND markdown heading levels (`#`/`##`/`###`), so a
 * heading-structured note converts to a mind map seamlessly (mubu behaviour:
 * every line is an outline row, Tab and heading level both express depth).
 * Tags are `#tag` tokens at line end. Parsing and serialization round-trip,
 * so editing the text IS editing the mind map — no second data structure.
 */

export interface OutlineNode {
  readonly id: string
  readonly text: string
  readonly tags: readonly string[]
  readonly depth: number
  readonly children: readonly OutlineNode[]
}

const TAG_PATTERN = /(?:^|\s)#([^\s#]+)/g
const BULLET_PATTERN = /^[-*+]\s+/
const HEADING_PATTERN = /^(#{1,6})\s+/

function indentWidth(line: string): number {
  const expanded = line.replace(/\t/g, '  ')
  const match = expanded.match(/^ */)
  return match ? match[0].length : 0
}

function parseLine(rawLine: string): { text: string; tags: string[] } {
  // Strip bullet / heading marker first (indentation was already measured),
  // inline **加粗**/==高光== markers, then tags.
  const unbulleted = rawLine.trim()
    .replace(BULLET_PATTERN, '')
    .replace(HEADING_PATTERN, '')
  const tags: string[] = []
  let match: RegExpExecArray | null
  TAG_PATTERN.lastIndex = 0
  while ((match = TAG_PATTERN.exec(unbulleted)) !== null) tags.push(match[1])
  const text = unbulleted
    .replace(TAG_PATTERN, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, tags }
}

let idCounter = 0
const nextId = () => `outline-${(idCounter += 1)}`

/** Parse outline text into a forest. Blank lines and pure-tag lines are dropped.
 *  缩进与 markdown 标题共同定义层级：`#`→0、`##`→1…正文行挂到当前标题之下。 */
export function parseOutline(source: string): readonly OutlineNode[] {
  idCounter = 0
  const lines = source.split(/\r?\n/)
  const roots: OutlineNode[] = []
  let fence: { marker: string; length: number } | undefined
  // Stack of { node, indent, heading level } for open ancestors. Heading level
  // is 0 for body/list rows; the innermost open heading (topmost entry with
  // level > 0) provides the base indent context for following body rows.
  const stack: Array<{ node: OutlineNode; indent: number; level: number }> = []
  const pushChild = (parent: { node: OutlineNode } | null, child: OutlineNode) => {
    if (!parent) { roots.push(child); return }
    Object.assign(parent.node, { children: [...parent.node.children, child] } as Partial<OutlineNode>)
  }
  const openHeadingLevel = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if ((stack[index]?.level ?? 0) > 0) return stack[index]?.level ?? 0
    }
    return 0
  }
  for (const sourceLine of lines) {
    // Milkdown serializes leading paragraph spaces as numeric space entities.
    // Interpret only that leading indentation in this pure reading projection;
    // the original canonical Markdown stays untouched until explicit graph save.
    const rawLine=sourceLine.replace(/^(?:[ \t]|&#(?:x20|32);)+/i,indent=>indent.replace(/&#(?:x20|32);/gi,' '));
    const delimiter = rawLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (delimiter) {
      const marker = delimiter[1] ?? ''
      if (!fence) fence = { marker: marker[0] ?? '', length: marker.length }
      else if (marker[0] === fence.marker && marker.length >= fence.length && !(delimiter[2] ?? '').trim()) fence = undefined
      continue
    }
    if (fence) continue
    if (!rawLine.trim()) continue
    const heading = rawLine.match(HEADING_PATTERN)
    const { text, tags } = parseLine(rawLine)
    if (!text) continue
    // Logical indent: headings sit at (level-1)*2; body rows sit at
    // rawIndent + level*2 under the innermost open heading (no heading →
    // pure-indent behaviour, byte-for-byte identical to the legacy parser).
    const logical = heading
      ? ((heading[1]?.length ?? 1) - 1) * 2
      : indentWidth(rawLine) + openHeadingLevel() * 2
    while (stack.length && (stack[stack.length - 1]?.indent ?? 0) >= logical) stack.pop()
    const parent = stack[stack.length - 1] ?? null
    const node: OutlineNode = { id: nextId(), text, tags, depth: parent ? parent.node.depth + 1 : 0, children: [] }
    pushChild(parent, node)
    stack.push({ node, indent: logical, level: heading ? (heading[1]?.length ?? 1) : 0 })
  }
  return roots
}

/** Serialize a forest back to outline text (two-space indent, "-" bullets, tags appended). */
export function serializeOutline(roots: readonly OutlineNode[]): string {
  const lines: string[] = []
  const walk = (node: OutlineNode, depth: number) => {
    const indent = depth === 0 ? '' : '  '.repeat(depth)
    const tags = node.tags.length ? ` ${node.tags.map((tag) => `#${tag}`).join(' ')}` : ''
    lines.push(`${indent}- ${node.text}${tags}`)
    node.children.forEach((child) => walk(child, depth + 1))
  }
  roots.forEach((root) => walk(root, 0))
  return lines.join('\n')
}

/** Flatten a forest into display rows (depth, parent linkage) for layout consumers. */
export interface OutlineRow {
  readonly node: OutlineNode
  readonly parentId: string | null
  readonly depth: number
  readonly hasChildren: boolean
}

export function outlineRows(roots: readonly OutlineNode[]): readonly OutlineRow[] {
  const rows: OutlineRow[] = []
  const walk = (node: OutlineNode, parentId: string | null) => {
    rows.push({ node, parentId, depth: node.depth, hasChildren: node.children.length > 0 })
    node.children.forEach((child) => walk(child, node.id))
  }
  roots.forEach((root) => walk(root, null))
  return rows
}

/** Max depth across the forest (0 = single level). */
export function outlineDepth(roots: readonly OutlineNode[]): number {
  return roots.reduce((max, node) => {
    const childDepth = outlineDepth(node.children)
    return Math.max(max, node.depth === 0 && !node.children.length ? 0 : childDepth + (node.children.length ? 1 : 0))
  }, 0)
}

/**
 * Branch hue: deterministic tag/text hash → one of six low-saturation hues.
 * Same branch → same hue across renders (mubu branch coloring).
 */
export const OUTLINE_HUES = [262, 210, 168, 36, 12, 320] as const

export function outlineHue(node: OutlineNode): number {
  const key = node.tags.join('/') || node.text
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0
  }
  return OUTLINE_HUES[Math.abs(hash) % OUTLINE_HUES.length]
}

/**
 * G-4 导图分支拖出：取出 branchId 对应节点（含整棵子孙）序列化为大纲文本。
 * 单条分支（无子）返回纯文本；带子分支返回缩进大纲（serializeOutline 格式，
 * parseOutline 可原样往返）。不在森林中（含根占位 id）返回 null。
 * 摘取是复制语义：调用方不删原分支，原地保留。
 */
export function extractOutlineBranchText(roots: readonly OutlineNode[], branchId: string): string | null {
  const find = (nodes: readonly OutlineNode[]): OutlineNode | null => {
    for (const node of nodes) {
      if (node.id === branchId) return node
      const hit = find(node.children)
      if (hit) return hit
    }
    return null
  }
  const branch = find(roots)
  if (!branch) return null
  if (!branch.children.length) return branch.text
  return serializeOutline([branch])
}

/** Tolerant parse for agent output: non-outline prose degrades to single-line roots. */
export function parseOutlineLoose(source: string): readonly OutlineNode[] {
  const parsed = parseOutline(source)
  if (parsed.length) return parsed
  // No indentation structure at all — treat each non-empty line as a root.
  idCounter = 0
  return source
    .split(/\r?\n/)
    .map((line) => parseLine(line))
    .filter((line) => line.text)
    .map((line) => ({ id: nextId(), text: line.text, tags: line.tags, depth: 0, children: [] }))
}
