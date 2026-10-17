// Adopted project-owned Gen1 derived editor @3e99769; save targets the existing canonical text owner.
import { Check, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { MINDMAP_IMMERSIVE, MINDMAP_ROOT_ID, mindmapLayout } from './MatureMindMapLayout'
import { parseOutline, serializeOutline, type OutlineNode } from './outlineTree'

interface Props {
  readonly disabled?: boolean
  readonly title: string
  readonly outline: string
  readonly onCancel: () => void
  readonly onSave: (input: { readonly title: string; readonly body: string }) => Promise<boolean>
}

/** 不可变树操作：改文字 / 加子级 / 加兄弟（插到参照后） / 删除。 */
function updateText(nodes: readonly OutlineNode[], id: string, text: string): OutlineNode[] {
  return nodes.map((node) => node.id === id
    ? { ...node, text }
    : { ...node, children: updateText(node.children, id, text) })
}

function addChild(nodes: readonly OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] {
  return nodes.map((node) => node.id === parentId
    ? { ...node, children: [...node.children, child] }
    : { ...node, children: addChild(node.children, parentId, child) })
}

function addSibling(nodes: readonly OutlineNode[], refId: string, node: OutlineNode): OutlineNode[] {
  const index = nodes.findIndex((item) => item.id === refId)
  if (index >= 0) return [...nodes.slice(0, index + 1), node, ...nodes.slice(index + 1)]
  return nodes.map((item) => ({ ...item, children: addSibling(item.children, refId, node) }))
}

function removeNode(nodes: readonly OutlineNode[], id: string): OutlineNode[] {
  const filtered = nodes.filter((node) => node.id !== id)
  if (filtered.length !== nodes.length) return filtered
  return nodes.map((node) => ({ ...node, children: removeNode(node.children, id) }))
}

/** 升级（Shift+Tab）：把节点从父级提出，变成父级的下一个兄弟。 */
function liftNode(nodes: readonly OutlineNode[], id: string): readonly OutlineNode[] {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!node) continue
    const childIndex = node.children.findIndex((child) => child.id === id)
    if (childIndex >= 0) {
      const child = node.children[childIndex]
      if (!child) continue
      const result = [...nodes]
      result.splice(index, 1, { ...node, children: node.children.filter((item) => item.id !== id) }, child)
      return result
    }
    const lifted = liftNode(node.children, id)
    if (lifted !== node.children) {
      const result = [...nodes]
      result.splice(index, 1, { ...node, children: lifted })
      return result
    }
  }
  return nodes
}

let newCounter = 0
const newNode = (depth: number): OutlineNode => {
  newCounter += 1
  return { id: `mm-new-${newCounter}`, text: '', tags: [], depth, children: [] }
}

/** 从树里找节点原文（编辑要拿未截断的全文，不是显示文本）。 */
function findText(nodes: readonly OutlineNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.text
    const found = findText(node.children, id)
    if (found !== null) return found
  }
  return null
}

/** 取整棵分支（含子孙）用于复制/剪切 —— 幕布语义：操作分支 = 操作子树。 */
function findBranch(nodes: readonly OutlineNode[], id: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findBranch(node.children, id)
    if (found !== null) return found
  }
  return null
}

/** 深拷贝并换新 id：serialize→parse 回环天然重生成全部 id，粘贴不出重复键。 */
function cloneBranches(branches: readonly OutlineNode[]): readonly OutlineNode[] {
  const clone = (node: OutlineNode): OutlineNode => ({ ...node, id: newNode(node.depth).id, children: node.children.map(clone) })
  return branches.map(clone)
}

/**
 * 沉浸式导图编辑器（XMind paradigm）：纯导图、无侧栏编辑器。
 * 双击任意节点文字 → 原位 input 直接改；Tab 加子级、Enter 加同级、Del 删除；
 * 单击选中。关闭时序列化回大纲文本保存（文本仍是唯一数据源）。
 */
export function MindMapEditor({ title, outline, disabled = false, onCancel, onSave }: Props) {
  const [titleText, setTitleText] = useState(title)
  const [roots, setRoots] = useState<readonly OutlineNode[]>(() => [...parseOutline(outline)])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 分支剪贴板（会话内跨导图可用）；同步写系统剪贴板为缩进大纲文本。 */
  const [clipboard, setClipboard] = useState<readonly OutlineNode[] | null>(null)
  const metrics = MINDMAP_IMMERSIVE
  const branchSelected = Boolean(selected && selected !== MINDMAP_ROOT_ID)

  const copyBranch = useCallback((cut: boolean) => {
    if (busy || disabled) return
    if (!selected || selected === MINDMAP_ROOT_ID) return
    const branch = findBranch(roots, selected)
    if (!branch) return
    setClipboard([branch])
    void navigator.clipboard?.writeText(serializeOutline([branch])).catch(() => setError('系统剪贴板不可用，仍可在此导图粘贴分支。'))
    if (cut) {
      setRoots(removeNode(roots, selected))
      setSelected(null)
    }
  }, [busy, disabled, selected, roots])

  /** 粘贴：选中分支 → 插到它后面做同级；选根/未选 → 追加为一级分支。 */
  const pasteBranch = useCallback(() => {
    if (busy || disabled) return
    if (!clipboard?.length) return
    const pasted = cloneBranches(clipboard)
    if (!selected || selected === MINDMAP_ROOT_ID) {
      setRoots([...roots, ...pasted])
    } else {
      setRoots(pasted.reduce((acc, node) => addSibling(acc, selected, node), roots))
    }
    setSelected(pasted[0]?.id ?? null)
  }, [busy, disabled, clipboard, selected, roots])

  const { placements, width, height } = useMemo(
    () => mindmapLayout(roots, titleText, metrics),
    [roots, titleText, metrics],
  )
  const byId = useMemo(() => new Map(placements.map((item) => [item.id, item])), [placements])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (busy || disabled && event.key !== 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return }
      if (editing) return // 编辑中的按键由 input 自己处理
      // This modal owns canvas keys while its graph is active. Native input
      // keys remain with the inline input above; no canvas listener fires too.
      event.stopImmediatePropagation()
      if (event.target instanceof HTMLButtonElement && event.key !== 'Escape') return
      if (event.key === 'Escape') { event.preventDefault(); onCancel() }
      // 分支复制/剪切/粘贴（幕布通用快捷键）。
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copyBranch(false); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); copyBranch(true); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteBranch(); return }
      if (!selected) return
      // Shift+Tab：升级（提出父级）；Tab：降级（加子级）—— 与文本编辑器同一语义。
      if (event.key === 'Tab' && event.shiftKey && selected !== MINDMAP_ROOT_ID) {
        event.preventDefault()
        setRoots(liftNode(roots, selected))
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const parent = byId.get(selected)
        const child = newNode(parent ? parent.depth + 1 : 1)
        setRoots(selected === MINDMAP_ROOT_ID ? [...roots, child] : addChild(roots, selected, child))
        setSelected(child.id)
        setEditing(child.id)
        setDraft('')
      }
      if (event.key === 'Enter' && selected !== MINDMAP_ROOT_ID) {
        event.preventDefault()
        const ref = byId.get(selected)
        const sibling = newNode(ref ? ref.depth : 1)
        setRoots(addSibling(roots, selected, sibling))
        setSelected(sibling.id)
        setEditing(sibling.id)
        setDraft('')
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== MINDMAP_ROOT_ID) {
        event.preventDefault()
        setRoots(removeNode(roots, selected))
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing, selected, roots, byId, onCancel, copyBranch, pasteBranch, busy, disabled])

  const startEdit = (id: string, text: string) => {
    if (busy || disabled) return
    setSelected(id)
    setEditing(id)
    setDraft(text)
  }

  const commitEdit = (followUp?: 'child' | 'sibling') => {
    if (!editing) return
    const text = draft.trim()
    let nextRoots = roots
    if (editing === MINDMAP_ROOT_ID) { if (text) setTitleText(text) }
    else if (text) nextRoots = updateText(roots, editing, text)
    else if (editing.startsWith('mm-new-')) nextRoots = removeNode(roots, editing) // 空新节点直接丢弃
    if (followUp && editing !== MINDMAP_ROOT_ID) {
      const ref = byId.get(editing)
      const node = newNode(ref ? ref.depth + (followUp === 'child' ? 1 : 0) : 1)
      nextRoots = followUp === 'child' ? addChild(nextRoots, editing, node) : addSibling(nextRoots, editing, node)
      setRoots(nextRoots)
      setSelected(node.id)
      setEditing(node.id)
      setDraft('')
      return
    }
    setRoots(nextRoots)
    setEditing(null)
  }

  const save = async () => {
    if (busy || disabled) return
    setBusy(true); setError('')
    let nextRoots = roots
    const text = draft.trim()
    if (editing && editing !== MINDMAP_ROOT_ID) nextRoots = text ? updateText(roots, editing, text)
      : editing.startsWith('mm-new-') ? removeNode(roots, editing) : roots
    const finalTitle = (editing === MINDMAP_ROOT_ID ? text : titleText).trim() || '未命名大纲'
    setRoots(nextRoots); setTitleText(finalTitle); setEditing(null)
    try {
      if (!await onSave({ title: finalTitle, body: serializeOutline(nextRoots) })) setError('原保存尚未确认，导图草稿仍保留。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '原保存未确认。') }
    finally { setBusy(false) }
  }

  return createPortal(<>
    <div className="inline-note-editor-scrim" onPointerDown={save}/>
    <div className="inline-note-editor immersive mindmap-editor" role="dialog" aria-modal="true" aria-label="编辑大纲导图" data-lcos-map-editor
      onPointerDownCapture={(event) => { if (busy) { event.preventDefault(); event.stopPropagation() } }}>
      <header className="inline-note-editor-immersive-head">
        <strong>大纲导图</strong>
        <small>双击改字 · Tab 降级 · Shift+Tab 升级 · Enter 加同级 · Ctrl+C/X/V 复制剪切粘贴分支 · Del 删除</small>
      </header>
      <div className="mindmap-editor-stage" role="application" aria-label="导图分支编辑">
        <svg viewBox={`0 0 ${Math.max(320, width)} ${Math.max(200, height)}`} preserveAspectRatio="xMidYMid meet">
          <g transform={`translate(${Math.max(0, (Math.max(320, width) - width) / 2)} ${Math.max(0, (Math.max(200, height) - height) / 2)})`}>
          {placements.map((item) => {
            const parent = item.parentId ? byId.get(item.parentId) : undefined
            if (!parent) return null
            const x1 = item.side > 0 ? parent.x + parent.width : parent.x
            const y1 = parent.y + (metrics.nodeH[Math.min(parent.depth, 3)] ?? 24) / 2
            const x2 = item.side > 0 ? item.x : item.x + item.width
            const y2 = item.y + (metrics.nodeH[Math.min(item.depth, 3)] ?? 24) / 2
            const dx = (x2 - x1) * .5
            return <path
              key={`link-${item.id}`}
              className="lcos-mindmap-link"
              d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
            />
          })}
          {placements.map((item) => {
            const h = (metrics.nodeH[Math.min(item.depth, 3)] ?? 24)
            const isEditing = editing === item.id
            const isSelected = selected === item.id
            return <g
              key={item.id}
              className={`lcos-mindmap-topic depth-${item.depth} ${isSelected ? 'is-selected' : ''}`}
              onClick={(event) => { event.stopPropagation(); setSelected(item.id) }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                const original = item.id === MINDMAP_ROOT_ID ? titleText : findText(roots, item.id)
                startEdit(item.id, original ?? '')
              }}
            >
              <rect
                x={item.x} y={item.y} width={item.width} height={h} rx={item.depth === 0 ? 14 : 9}
                style={{
                  fill: item.depth === 0 ? `hsl(${item.hue} 38% 92%)` : item.depth === 1 ? `hsl(${item.hue} 34% 95%)` : 'rgba(255,255,255,.9)',
                  stroke: `hsl(${item.hue} 38% 58% / ${item.depth === 0 || isSelected ? .75 : .32})`,
                  strokeWidth: item.depth === 0 ? 1.8 : isSelected ? 1.6 : 1,
                }}
              />
              {isEditing
                ? <foreignObject x={item.x - 2} y={item.y - 2} width={Math.max(item.width, 132) + 4} height={h + 4}>
                    <input
                      disabled={busy || disabled}
                      ref={(input) => { input?.focus() }}
                      value={draft}
                      style={{ fontSize: metrics.fontByDepth[Math.min(item.depth, 3)] }}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitEdit()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); commitEdit('sibling') }
                        if (event.key === 'Tab') { event.preventDefault(); commitEdit('child') }
                        if (event.key === 'Escape') { event.preventDefault(); setEditing(null) }
                        event.stopPropagation()
                      }}
                    />
                  </foreignObject>
                : <text
                    x={item.x + 10} y={item.y + h / 2 + 3.5}
                    style={{ fontSize: metrics.fontByDepth[Math.min(item.depth, 3)], fontWeight: item.depth === 0 ? 600 : 400 }}
                  >
                    {item.text || '…'}
                  </text>}
            </g>
          })}
          </g>
        </svg>
      </div>
      <div className="inline-note-editor-hud">
        {error && <span role="status">{error}</span>}
        <small>{placements.length - 1} 个分支</small>
        <span className="mindmap-branch-actions">
          <button type="button" disabled={busy || disabled || !branchSelected} title="复制分支（Ctrl+C）" onClick={() => copyBranch(false)}>复制</button>
          <button type="button" disabled={busy || disabled || !branchSelected} title="剪切分支（Ctrl+X）" onClick={() => copyBranch(true)}>剪切</button>
          <button type="button" disabled={busy || disabled || !branchSelected} title="删除分支（Del）" onClick={() => { if (selected && selected !== MINDMAP_ROOT_ID) { setRoots(removeNode(roots, selected)); setSelected(null) } }}>删除</button>
          <button type="button" disabled={busy || disabled || !clipboard} title="粘贴分支（Ctrl+V）" onClick={pasteBranch}>粘贴</button>
        </span>
        <span>
          <button type="button" disabled={busy} aria-label="取消编辑" onClick={onCancel}><X size={13}/></button>
          <button type="button" disabled={busy || disabled} aria-label="保存导图" onClick={() => void save()}><Check size={13}/></button>
        </span>
      </div>
    </div>
  </>, document.body)
}
