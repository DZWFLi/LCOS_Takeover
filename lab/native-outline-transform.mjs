import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceMapModule = path.join(workspaceRoot, 'lab/pilot/native-outline-source.ts');
const mindMapRelativePath = 'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx';
const textFacesRelativePath = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';

function assertInput(source, sourcePath, expectedRelativePath, label) {
  if (typeof source !== 'string') throw new TypeError(`${label} expects source text.`);
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new TypeError(`${label} requires the real sourcePath.`);
  const relativePath = path.relative(workspaceRoot, path.resolve(sourcePath)).split(path.sep).join('/');
  if (relativePath.toLowerCase() !== expectedRelativePath.toLowerCase()) {
    throw new Error(`${label} only transforms ${expectedRelativePath}; received ${relativePath}.`);
  }
}

function sourceEol(source) {
  return source.match(/\r\n|\n|\r/)?.[0] ?? '\n';
}

function countExact(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = source.indexOf(needle, from);
    if (index < 0) return count;
    count += 1;
    from = index + needle.length;
  }
}

function replaceExactOnce(source, needle, replacement, seam) {
  const count = countExact(source, needle);
  if (count !== 1) throw new Error(`Native outline ${seam} seam drift: expected exactly one anchor, found ${count}.`);
  const index = source.indexOf(needle);
  return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`;
}

function helperImport(sourcePath) {
  const relative = path.relative(path.dirname(path.resolve(sourcePath)), sourceMapModule).split(path.sep).join('/');
  const specifier = relative.startsWith('.') ? relative : `./${relative}`;
  return `import { createOutlineSourceSession } from ${JSON.stringify(specifier)}`;
}

function assertInstalledOnce(source, importLine, requiredMarkers, oldMarkers, label) {
  const helperImports = [...source.matchAll(/^import\s*\{\s*createOutlineSourceSession\s*\}\s*from\s*(['"])[^'"]+\1;?$/gm)];
  if (helperImports.length !== 1 || helperImports[0]?.[0] !== importLine) {
    throw new Error(`Native outline ${label} has an unexpected or duplicated helper import.`);
  }
  const counts = [
    ['helper import', importLine],
    ...requiredMarkers,
  ].map(([name, marker]) => [name, countExact(source, marker)]);
  const duplicate = counts.find(([, count]) => count !== 1);
  if (duplicate) throw new Error(`Native outline ${label} appears partially installed or duplicated (${duplicate[0]} count ${duplicate[1]}).`);
  const stale = oldMarkers.find((marker) => source.includes(marker));
  if (stale) throw new Error(`Native outline ${label} has a mixed old/new serializer seam (${stale}).`);
}

function cloneFunctionBlock(eol) {
  return [
    '/** 深拷贝并换新 id：serialize→parse 回环天然重生成全部 id，粘贴不出重复键。 */',
    'function cloneBranches(branches: readonly OutlineNode[]): readonly OutlineNode[] {',
    '  const clone = (node: OutlineNode): OutlineNode => ({ ...node, id: newNode(node.depth).id, children: node.children.map(clone) })',
    '  return branches.map(clone)',
    '}',
  ].join(eol);
}

/**
 * Rewire the copied Gen1-derived MindMapEditor to one mount-scoped source-map
 * session. The copied file is read by build-pilot's onLoad hook; never written.
 */
export function transformNativeOutlineEditor(source, { sourcePath } = {}) {
  assertInput(source, sourcePath, mindMapRelativePath, 'MindMapEditor');
  const eol = sourceEol(source);
  const importLine = helperImport(sourcePath);
  const installed = source.includes('createOutlineSourceSession') || source.includes('outlineSession.');
  if (installed) {
    assertInstalledOnce(source, importLine, [
      ['mount session', 'const [outlineSession] = useState(() => createOutlineSourceSession(outline))'],
      ['session parse', '() => [...outlineSession.parseOutline()]'],
      ['clipboard branch serializer', 'outlineSession.serializeBranch([branch])'],
      ['paste clone', 'outlineSession.cloneBranches(clipboard)'],
      ['canonical save serializer', 'outlineSession.serializeOutline(nextRoots)'],
      ['copy callback dependency', '}, [busy, disabled, selected, roots, outlineSession])'],
      ['paste callback dependency', '}, [busy, disabled, clipboard, selected, roots, outlineSession])'],
    ], [
      "import { parseOutline, serializeOutline, type OutlineNode } from './outlineTree'",
      'serializeOutline([branch])',
      'const pasted = cloneBranches(clipboard)',
      'body: serializeOutline(nextRoots)',
      'function cloneBranches(branches: readonly OutlineNode[])',
    ], 'MindMapEditor');
    return source;
  }

  let transformed = replaceExactOnce(source,
    "import { parseOutline, serializeOutline, type OutlineNode } from './outlineTree'",
    `${importLine}${eol}import type { OutlineNode } from './outlineTree'`, 'editor imports');

  transformed = replaceExactOnce(transformed,
    '  const [roots, setRoots] = useState<readonly OutlineNode[]>(() => [...parseOutline(outline)])',
    `  const [outlineSession] = useState(() => createOutlineSourceSession(outline))${eol}`
      + '  const [roots, setRoots] = useState<readonly OutlineNode[]>(() => [...outlineSession.parseOutline()])',
    'mount-scoped forest');

  transformed = replaceExactOnce(transformed,
    cloneFunctionBlock(eol), '', 'local clone helper');

  transformed = replaceExactOnce(transformed,
    'void navigator.clipboard?.writeText(serializeOutline([branch]))',
    'void navigator.clipboard?.writeText(outlineSession.serializeBranch([branch]))',
    'branch clipboard serializer');

  transformed = replaceExactOnce(transformed,
    'const pasted = cloneBranches(clipboard)',
    'const pasted = outlineSession.cloneBranches(clipboard)',
    'session paste clone');

  transformed = replaceExactOnce(transformed,
    '}, [busy, disabled, selected, roots])',
    '}, [busy, disabled, selected, roots, outlineSession])',
    'copy callback dependency');

  transformed = replaceExactOnce(transformed,
    '}, [busy, disabled, clipboard, selected, roots])',
    '}, [busy, disabled, clipboard, selected, roots, outlineSession])',
    'paste callback dependency');

  transformed = replaceExactOnce(transformed,
    'serializeOutline(nextRoots)',
    'outlineSession.serializeOutline(nextRoots)',
    'canonical save serializer');

  return transformed;
}

/** Keep the actual Gen1 tree/clipboard/layout/save owner. Only its outer
 * dialog, key scope and presentation-state handoff gain an inline mode. */
export function transformNativeMindMapContent(source, { sourcePath } = {}) {
  assertInput(source, sourcePath, mindMapRelativePath, 'MindMapEditor');
  const marker = '// LCOS embedded mindmap content';
  if (source.includes(marker)) return source;
  let result = transformNativeOutlineEditor(source, { sourcePath });
  const eol = sourceEol(result);
  const statePath = path.join(workspaceRoot, 'lab/pilot/native-mindmap-editing-state');
  const relative = path.relative(path.dirname(path.resolve(sourcePath)), statePath).split(path.sep).join('/');
  result = replaceExactOnce(result,
    "import { useCallback, useEffect, useMemo, useState } from 'react'",
    "import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'" + eol
      + `import type { NativeMindMapDraftState, NativeMindMapControls } from ${JSON.stringify(relative)}`,
    'embedded React/type imports');
  result = replaceExactOnce(result, 'interface Props {', [
    marker,
    'interface Props {',
    '  readonly embedded?: boolean',
    '  readonly resumeState?: NativeMindMapDraftState',
    '  readonly onDraftChange?: (state: NativeMindMapDraftState) => void',
    '  readonly renderActions?: (controls: NativeMindMapControls) => ReactNode',
  ].join(eol), 'embedded props');
  result = replaceExactOnce(result,
    'export function MindMapEditor({ title, outline, disabled = false, onCancel, onSave }: Props) {',
    'export function MindMapEditor({ title, outline, disabled = false, onCancel, onSave, embedded = false, resumeState, onDraftChange, renderActions }: Props) {',
    'embedded parameter');
  for (const [before, after] of [
    ['useState(title)', 'useState(() => resumeState?.titleText ?? title)'],
    ['useState(() => createOutlineSourceSession(outline))', 'useState(() => resumeState?.outlineSession ?? createOutlineSourceSession(outline))'],
    ['useState<readonly OutlineNode[]>(() => [...outlineSession.parseOutline()])', 'useState<readonly OutlineNode[]>(() => resumeState?.roots ?? [...outlineSession.parseOutline()])'],
    ['const [selected, setSelected] = useState<string | null>(null)', 'const [selected, setSelected] = useState<string | null>(() => resumeState?.selected ?? null)'],
    ['const [editing, setEditing] = useState<string | null>(null)', 'const [editing, setEditing] = useState<string | null>(() => resumeState?.editing ?? null)'],
    ["const [draft, setDraft] = useState('')", "const [draft, setDraft] = useState(() => resumeState?.draft ?? '')"],
    ['useState<readonly OutlineNode[] | null>(null)', 'useState<readonly OutlineNode[] | null>(() => resumeState?.clipboard ?? null)'],
  ]) result = replaceExactOnce(result, before, after, 'embedded resume ' + before.slice(0, 25));
  result = replaceExactOnce(result, '  const metrics = MINDMAP_IMMERSIVE', [
    '  const contentRoot = useRef<HTMLDivElement>(null)',
    '  useLayoutEffect(() => {',
    '    onDraftChange?.({ outlineSession, titleText, roots, selected, editing, draft, clipboard })',
    '  }, [onDraftChange, outlineSession, titleText, roots, selected, editing, draft, clipboard])',
    '  useLayoutEffect(() => {',
    '    if (embedded && !editing && document.activeElement === document.body) contentRoot.current?.focus({ preventScroll: true })',
    '  }, [embedded, editing])',
    '  const metrics = MINDMAP_IMMERSIVE',
  ].join(eol), 'embedded draft handoff');
  result = replaceExactOnce(result, '    const onKey = (event: KeyboardEvent) => {', [
    '    const onKey = (event: KeyboardEvent) => {',
    '      if (embedded && (!contentRoot.current || !(event.target instanceof Node) || !contentRoot.current.contains(event.target))) return',
    "      if (embedded && !editing && event.key === 'Escape') return // original c2 owns outer dismissal; draft remains",
  ].join(eol), 'embedded key scope');
  result = replaceExactOnce(result,
    '}, [editing, selected, roots, byId, onCancel, copyBranch, pasteBranch, busy, disabled])',
    '}, [editing, selected, roots, byId, onCancel, copyBranch, pasteBranch, busy, disabled, embedded])',
    'embedded key effect dependency');
  result = replaceExactOnce(result,
    "if (event.key === 'Escape') { event.preventDefault(); setEditing(null) }",
    "if (event.key === 'Escape') { event.preventDefault(); if (embedded && editing?.startsWith('mm-new-')) setRoots(removeNode(roots, editing)); setEditing(null) }",
    'embedded cancel newly inserted branch');
  result = replaceExactOnce(result, [
    '  return createPortal(<>',
    '    <div className="inline-note-editor-scrim" onPointerDown={save}/>',
    '    <div className="inline-note-editor immersive mindmap-editor" role="dialog" aria-modal="true" aria-label="编辑大纲导图" data-lcos-map-editor',
  ].join(eol), [
    '  const content = <div ref={contentRoot} className={embedded ? "native-mindmap-editor-content" : "inline-note-editor immersive mindmap-editor"}',
    '      role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} tabIndex={embedded ? 0 : undefined} aria-label="编辑大纲导图" data-lcos-map-editor',
  ].join(eol), 'embedded outer frame');
  result = replaceExactOnce(result,
    'onPointerDownCapture={(event) => { if (busy) { event.preventDefault(); event.stopPropagation() } }}>',
    'onPointerDownCapture={(event) => { if (embedded && event.target instanceof Element && !event.target.closest("input,button,textarea,[contenteditable=true]")) contentRoot.current?.focus({ preventScroll: true }); if (busy) { event.preventDefault(); event.stopPropagation() } }}>',
    'embedded graph key focus');
  result = replaceExactOnce(result,
    '      <header className="inline-note-editor-immersive-head">',
    '      {!embedded && <header className="inline-note-editor-immersive-head">', 'embedded header');
  result = replaceExactOnce(result,
    '      </header>', '      </header>}', 'embedded header end');
  result = replaceExactOnce(result, '      <div className="inline-note-editor-hud">', [
    '      {embedded ? renderActions?.({ busy, disabled, error, branchSelected, canPaste: !!clipboard, branchCount: placements.length - 1,',
    '        copy: () => copyBranch(false), cut: () => copyBranch(true), paste: pasteBranch, cancel: onCancel, save: () => { void save() },',
    '        remove: () => { if (!busy && !disabled && selected && selected !== MINDMAP_ROOT_ID) { setRoots(removeNode(roots, selected)); setSelected(null) } },',
    '      }) : <div className="inline-note-editor-hud">',
  ].join(eol), 'embedded action slot');
  result = replaceExactOnce(result, [
    '      </div>',
    '    </div>',
    '  </>, document.body)',
  ].join(eol), [
    '      </div>}',
    '    </div>',
    '  return embedded ? content : createPortal(<><div className="inline-note-editor-scrim" onPointerDown={save}/>{content}</>, document.body)',
  ].join(eol), 'embedded return');
  return result;
}

/**
 * Rewire branch extraction and enable the full-source editor for fenced docs.
 * This transform is intended to be installed alongside transformNativeOutlineEditor.
 */
export function transformNativeTextFaces(source, { sourcePath } = {}) {
  assertInput(source, sourcePath, textFacesRelativePath, 'LcosTextFaces');
  const eol = sourceEol(source);
  const importLine = helperImport(sourcePath);
  const branchSource = [
    '    const outlineSession = createOutlineSourceSession(markdown);',
    '    const pending = [...outlineSession.parseOutline()];',
    '    let branchNode: (typeof pending)[number] | null = null;',
    '    while (pending.length) {',
    '      const candidate = pending.pop();',
    '      if (!candidate) continue;',
    '      if (candidate.id === row.id) { branchNode = candidate; break; }',
    '      pending.push(...candidate.children);',
    '    }',
    '    const text = branchNode ? outlineSession.serializeBranch([branchNode]) : null; if (!text) return;',
  ].join(eol);

  const installed = source.includes('createOutlineSourceSession') || source.includes('serializeBranch([branchNode])');
  if (installed) {
    assertInstalledOnce(source, importLine, [
      ['branch source session', 'const outlineSession = createOutlineSourceSession(markdown);'],
      ['session forest parse', 'const pending = [...outlineSession.parseOutline()];'],
      ['source-mapped branch serializer', 'outlineSession.serializeBranch([branchNode])'],
      ['full-document map guard', 'const canEditMap = Boolean(onSaveText);'],
    ], [
      "import { extractOutlineBranchText, parseOutline } from './outlineTree';",
      'extractOutlineBranchText(parseOutline(markdown), row.id)',
      '!/^ {0,3}(?:`{3,}|~{3,})/m.test(markdown)',
    ], 'LcosTextFaces');
    return source;
  }

  let transformed = replaceExactOnce(source,
    "import { extractOutlineBranchText, parseOutline } from './outlineTree';",
    importLine,
    'text face imports');

  transformed = replaceExactOnce(transformed,
    '    const text = extractOutlineBranchText(parseOutline(markdown), row.id); if (!text) return;',
    branchSource,
    'dragged branch serializer');

  transformed = replaceExactOnce(transformed,
    [
      '  // The reading projection skips fenced code. Never serialize that partial',
      '  // projection over the complete canonical document.',
      '  const canEditMap = onSaveText && !/^ {0,3}(?:`{3,}|~{3,})/m.test(markdown);',
    ].join(eol),
    [
      '  // The connected source-map serializer retains fenced and opaque document lines.',
      '  const canEditMap = Boolean(onSaveText);',
    ].join(eol),
    'full-source map guard');

  return transformed;
}
