// Adopted project-owned Gen1 pure layout @3e99769; UI/kernel remains Huabu.
import { parseOutline, outlineHue, type OutlineNode } from './outlineTree';

/** 显示宽度：CJK 全角 ≈ 1.0em，ASCII ≈ .58em。中文按 ASCII 估宽会重叠（排列纯乱的根因）。 */
export function textDisplayWidth(text: string, fontSize: number) {
  let width = 0
  for (const ch of text) width += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fontSize : fontSize * .58
  return width
}

/** 按显示宽度截断，中英文一致不会溢出分支框。 */
export function ellipsizeByWidth(text: string, fontSize: number, maxWidth: number) {
  let width = 0
  for (const [index, ch] of [...text].entries()) {
    width += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fontSize : fontSize * .58
    if (width > maxWidth - 14) return `${text.slice(0, Math.max(1, index))}…`
  }
  return text
}

export interface MindMapPlacement {
  readonly id: string
  readonly text: string
  readonly depth: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly side: -1 | 0 | 1
  readonly parentId: string | null
  readonly hue: number
  readonly hasChildren: boolean
}

export interface MindMapMetrics {
  readonly fontByDepth: readonly number[]
  readonly nodeH: readonly number[]
  readonly colGap: number
  readonly sibGap: number
  readonly maxText: number
}

/** 卡片内预览（小字）与沉浸式编辑器（大字）共用布局，只换尺寸档。 */
export const MINDMAP_PREVIEW: MindMapMetrics = { fontByDepth: [13, 11, 10, 9], nodeH: [30, 26, 24, 22], colGap: 44, sibGap: 8, maxText: 160 }
export const MINDMAP_IMMERSIVE: MindMapMetrics = { fontByDepth: [16, 13.5, 12, 11], nodeH: [36, 30, 26, 24], colGap: 60, sibGap: 10, maxText: 300 }

export const MINDMAP_ROOT_ID = '__root__'

/**
 * 经典思维导图布局：根居中、一级分支左右交替分布、子树自顶向下堆叠、
 * 父节点垂直居中于其子节点跨度中心。返回归一化（左上角 0,0）后的 placements。
 */
export function mindmapLayout(roots: readonly OutlineNode[], rootText: string, m: MindMapMetrics): {
  placements: readonly MindMapPlacement[]
  width: number
  height: number
} {
  const fontOf = (depth: number) => (m.fontByDepth[Math.min(depth, 3)] ?? 11)
  const nodeHOf = (depth: number) => (m.nodeH[Math.min(depth, 3)] ?? 24)
  const widthOf = (text: string, depth: number) => {
    const font = fontOf(depth)
    const shown = ellipsizeByWidth(text, font, m.maxText)
    return Math.max(nodeHOf(depth) + 10, textDisplayWidth(shown, font) + 18)
  }

  // 子树总高（叶子 = 行高；父 = max(自身行高, 子跨度)）。
  const heightOf = (node: OutlineNode, depth: number): number => {
    const own = nodeHOf(depth)
    if (!node.children.length) return own
    const childrenSpan = node.children.reduce((sum, child) => sum + heightOf(child, depth + 1), 0)
      + (node.children.length - 1) * m.sibGap
    return Math.max(own, childrenSpan)
  }

  const placements: MindMapPlacement[] = []
  const rootWidth = widthOf(rootText, 0)
  placements.push({
    id: MINDMAP_ROOT_ID, text: ellipsizeByWidth(rootText, fontOf(0), m.maxText), depth: 0,
    x: 0, y: 0, width: rootWidth, side: 0, parentId: null, hue: 262, hasChildren: roots.length > 0,
  })

  // 自顶向下放子树：top = 本子树顶边的（局部）y。
  const place = (node: OutlineNode, parentId: string, depth: number, side: 1 | -1, edge: number, top: number) => {
    const ownH = nodeHOf(depth)
    const width = widthOf(node.text, depth)
    const x = side > 0 ? edge : edge - width
    const childEdge = side > 0 ? x + width + m.colGap : x - m.colGap
    const total = heightOf(node, depth)
    if (!node.children.length) {
      placements.push({
        id: node.id, text: ellipsizeByWidth(node.text, fontOf(depth), m.maxText), depth,
        x, y: top + (total - ownH) / 2, width, side, parentId, hue: outlineHue(node), hasChildren: false,
      })
      return
    }
    const childrenSpan = node.children.reduce((sum, child) => sum + heightOf(child, depth + 1), 0)
      + (node.children.length - 1) * m.sibGap
    let cursor = top + (total - childrenSpan) / 2
    const mids: number[] = []
    node.children.forEach((child) => {
      const childH = heightOf(child, depth + 1)
      place(child, node.id, depth + 1, side, childEdge, cursor)
      mids.push(cursor + childH / 2)
      cursor += childH + m.sibGap
    })
    placements.push({
      id: node.id, text: ellipsizeByWidth(node.text, fontOf(depth), m.maxText), depth,
      x, y: ((mids[0] ?? top) + (mids[mids.length - 1] ?? top)) / 2 - ownH / 2, width, side, parentId,
      hue: outlineHue(node), hasChildren: true,
    })
  }

  // 一级分支左右分布（幕布式规整）：第一支上右侧，之后每支去总高较轻的一侧，
  // 两侧高度尽量均衡；分支对称轴 = 根的垂直中心（旧实现用根顶边 y=0，
  // 根整颗挂在分支轴心下方 —— 导图"歪掉"的根因）。
  const sides: Array<{ dir: 1 | -1; items: OutlineNode[] }> = [
    { dir: 1, items: [] },
    { dir: -1, items: [] },
  ]
  const sideHeight = [0, 0]
  roots.forEach((child, index) => {
    const target = index === 0 ? 0 : ((sideHeight[0] ?? 0) <= (sideHeight[1] ?? 0) ? 0 : 1)
    sides[target]?.items.push(child)
    sideHeight[target] = (sideHeight[target] ?? 0) + heightOf(child, 1) + m.sibGap
  })
  const rootCenterY = (m.nodeH[0] ?? 30) / 2
  sides.forEach(({ dir, items }) => {
    if (!items.length) return
    const total = items.reduce((sum, child) => sum + heightOf(child, 1), 0) + (items.length - 1) * m.sibGap
    let cursor = rootCenterY - total / 2
    // 根矩形实际占据 [0, rootWidth]：分支从根的左右边外退 colGap 起步
    // （旧计算按"根以原点为中心"，右侧分支往根框里叠了 rootWidth/2-colGap）。
    const edge = dir > 0 ? rootWidth + m.colGap : -m.colGap
    items.forEach((child) => {
      place(child, MINDMAP_ROOT_ID, 1, dir, edge, cursor)
      cursor += heightOf(child, 1) + m.sibGap
    })
  })

  // 归一化到 (0,0) 起。
  const minX = Math.min(...placements.map((p) => p.x))
  const minY = Math.min(...placements.map((p) => p.y))
  const shifted = placements.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }))
  const width = Math.max(...shifted.map((p) => p.x + p.width))
  const height = Math.max(...shifted.map((p) => p.y + (m.nodeH[Math.min(p.depth, 3)] ?? 24)))
  return { placements: shifted, width, height }
}

/**
 * Natural mind-map content size (the SVG viewBox) for an outline text.
 * Used by the layout toggle to grow the node to the map's real size and to
 * fit the camera so the whole map is visible (mubu behaviour).
 */
export function mindmapContentSize(outline: string, title = '大纲'): { width: number; height: number } {
  const roots = parseOutline(outline)
  if (!roots.length && !title.trim()) return { width: 240, height: 120 }
  const { width, height } = mindmapLayout(roots, title, MINDMAP_PREVIEW)
  return { width: Math.max(240, width), height: Math.max(120, height) }
}

/** Node size policy for a mind-map note: grow to the map's natural size,
 *  clamped so a huge outline scrolls inside the card instead of blanketing the canvas. */
export function mindmapNodeSize(outline: string, title = '大纲'): { width: number; height: number } {
  const { width, height } = mindmapContentSize(outline, title)
  return {
    width: Math.round(Math.max(244, Math.min(980, width + 28))),
    height: Math.round(Math.max(140, Math.min(482, height + 62))),
  }
}

