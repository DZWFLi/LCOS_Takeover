import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

import { createOutlineSourceSession, OUTLINE_SOURCE } from '../lab/pilot/native-outline-source.ts';
import * as legacyOutline from '../lcos/huabu/apps/web/src/lcos/nodes/text/outlineTree.ts';

const editorSourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx');
const editorOperationNames = ['addChild', 'addSibling', 'removeNode', 'liftNode', 'findBranch', 'cloneBranches'];
let editorOperations;

function matchingBrace(source, openingBrace) {
  let depth = 0;
  let state = 'code';
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { state = 'code'; index += 1; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if ((state === 'single' && char === "'") || (state === 'double' && char === '"')
        || (state === 'template' && char === '`')) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') { state = 'line-comment'; index += 1; continue; }
    if (char === '/' && next === '*') { state = 'block-comment'; index += 1; continue; }
    if (char === "'") { state = 'single'; continue; }
    if (char === '"') { state = 'double'; continue; }
    if (char === '`') { state = 'template'; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  throw new Error('Could not find the end of a source-backed MindMapEditor helper.');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `MindMapEditor source still defines ${name}`);
  const openingBrace = source.indexOf('{', start);
  assert.notEqual(openingBrace, -1, `${name} has a function body`);
  return source.slice(start, matchingBrace(source, openingBrace) + 1);
}

function extractArrowFunction(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `MindMapEditor source still defines ${name}`);
  const openingBrace = source.indexOf('{', start);
  assert.notEqual(openingBrace, -1, `${name} has a function body`);
  return source.slice(start, matchingBrace(source, openingBrace) + 1);
}

function stripEditorHelperTypes(source) {
  return source
    .replace(/:\s*(?:readonly\s+)?OutlineNode(?:\[\])?(?:\s*\|\s*null)?/g, '')
    .replace(/:\s*(?:string|number)(?:\s*\|\s*null)?/g, '');
}

async function loadEditorOperations() {
  if (editorOperations) return editorOperations;
  const source = await readFile(editorSourcePath, 'utf8');
  const counter = source.match(/^let newCounter = 0;?$/m)?.[0];
  assert.ok(counter, 'MindMapEditor source still defines its node ID counter');
  const declarations = [counter, extractArrowFunction(source, 'newNode'),
    ...editorOperationNames.map((name) => extractFunction(source, name))].join('\n');
  const executable = stripEditorHelperTypes(declarations);
  const sandbox = {};
  runInNewContext(`${executable}\nglobalThis.__editorOperations = { newNode, ${editorOperationNames.join(', ')} };`, sandbox,
    { filename: editorSourcePath });
  editorOperations = sandbox.__editorOperations;
  return editorOperations;
}

function findNode(nodes, text) {
  for (const node of nodes) {
    if (node.text === text) return node;
    const found = findNode(node.children, text);
    if (found) return found;
  }
  return undefined;
}

describe('native outline source mapping', () => {
  it('reproduces the existing lossy serializer, while the session returns exact source bytes on no-op', () => {
    const source = '# 一级标题\r\n- **重点** 与 ==高光== #颜色\n\r\n```ts\r\nconst keep = true\r\n```\r\n\r\n';
    const legacy = legacyOutline.serializeOutline(legacyOutline.parseOutline(source));
    assert.notEqual(legacy, source);
    assert.doesNotMatch(legacy, /```ts/);
    assert.doesNotMatch(legacy, /\*\*重点\*\*/);
    assert.doesNotMatch(legacy, /==高光==/);
    assert.doesNotMatch(legacy, /\r/);

    const session = createOutlineSourceSession(source);
    assert.equal(session.serializeOutline(session.parseOutline()), source);
  });

  it('keeps heading, bold/highlight, tags, blank lines, fences and mixed CRLF/LF while a mapped label is edited', () => {
    const source = '# 标题\r\n- 重要 **重点** 与 ==高光== #topic\n\r\n```js\r\nconst preserved = true\r\n```\r\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const row = findNode(roots, '重要 重点 与 高光');
    assert.ok(row);

    const editedRow = { ...row, text: `${row.text} 新字` };
    assert.ok(Object.getOwnPropertySymbols(editedRow).includes(OUTLINE_SOURCE), 'node spread must retain source-line mapping');
    const editedRoots = roots.map((root) => ({
      ...root,
      children: root.children.map((child) => child.id === row.id ? editedRow : child),
    }));
    const result = session.serializeOutline(editedRoots);

    assert.match(result, /^# 标题\r\n/m);
    assert.match(result, /重要 \*\*重点\*\* 与 ==高光== 新字 #topic\n/);
    assert.match(result, /#topic\n\r\n```js\r\nconst preserved = true\r\n```\r\n/);
    assert.equal(createOutlineSourceSession(result).parseOutline()[0]?.children[0]?.text, '重要 重点 与 高光 新字');
  });

  it('writes tag changes and hierarchy/lift edits through the same forest without using Core IDs', () => {
    const source = '- Parent\n  - Child #keep\n- Sibling\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const parent = roots[0];
    const child = parent?.children[0];
    const sibling = roots[1];
    assert.ok(parent && child && sibling);

    const lifted = { ...child, depth: 0, tags: ['changed'] };
    const moved = [{ ...parent, children: [] }, lifted, sibling];
    const result = session.serializeOutline(moved);
    const reparsed = createOutlineSourceSession(result).parseOutline();
    assert.deepEqual(reparsed.map((node) => node.text), ['Parent', 'Child', 'Sibling']);
    assert.deepEqual(reparsed[1]?.tags, ['changed']);
    assert.equal(reparsed[1]?.depth, 0);
    assert.match(result, /- Child #changed/);
  });

  it('serializes the original editor liftNode forest when the lifted child keeps its old depth', async () => {
    const editor = await loadEditorOperations();
    const source = '# Project\n- Parent\n  - Child\n- Sibling\n';
    const session = createOutlineSourceSession(source);
    const [project] = session.parseOutline();
    const child = findNode(project?.children ?? [], 'Child');
    assert.ok(project && child);

    const moved = [{ ...project, children: editor.liftNode(project.children, child.id) }];
    const lifted = findNode(moved, 'Child');
    assert.equal(lifted?.depth, 2, 'the exact source liftNode helper does not rewrite depth');
    assert.ok(Object.getOwnPropertySymbols(lifted ?? {}).includes(OUTLINE_SOURCE),
      'the editor spread operation retains this session’s original-line metadata');

    const result = session.serializeOutline(moved);
    assert.equal(result, '# Project\n- Parent\n- Child\n- Sibling\n');
    const reparsed = createOutlineSourceSession(result).parseOutline();
    assert.deepEqual(reparsed[0]?.children.map((node) => node.text), ['Parent', 'Child', 'Sibling']);
    assert.equal(reparsed[0]?.children[1]?.depth, 1);
  });

  it('uses the edited forest for original add-child/add-sibling shapes after a lift and keeps source bytes', async () => {
    const editor = await loadEditorOperations();
    const source = '# Project\r\n- Parent\n  - **Child** #keep\r\n\n~~~ts\r\nconst preserve = true\r\n~~~\n- Sibling\r\n';
    const session = createOutlineSourceSession(source);
    const [project] = session.parseOutline();
    const child = findNode(project?.children ?? [], 'Child');
    assert.ok(project && child);

    const liftedRoots = [{ ...project, children: editor.liftNode(project.children, child.id) }];
    const liftedChild = findNode(liftedRoots, 'Child');
    assert.ok(liftedChild);
    const addedChild = { ...editor.newNode(liftedChild.depth + 1), text: 'New child' };
    const withChild = editor.addChild(liftedRoots, liftedChild.id, addedChild);
    const addedSibling = { ...editor.newNode(liftedChild.depth), text: 'New sibling' };
    const next = editor.addSibling(withChild, liftedChild.id, addedSibling);

    assert.equal(findNode(next, 'New child')?.depth, 3, 'the source editor derives this value from the stale node.depth');
    assert.equal(findNode(next, 'New sibling')?.depth, 2, 'the source editor keeps the selected node depth for siblings');
    assert.equal(session.serializeOutline(next),
      '# Project\r\n- Parent\n- **Child** #keep\r\n  - New child\r\n- New sibling\r\n\n~~~ts\r\nconst preserve = true\r\n~~~\n- Sibling\r\n');

    const branch = session.serializeBranch([findNode(next, 'Child')]);
    assert.equal(branch, '- **Child** #keep\n  - New child');
    assert.doesNotMatch(branch, /~~~ts|const preserve/);
    const reparsed = createOutlineSourceSession(session.serializeOutline(next)).parseOutline();
    const serializedProject = reparsed[0];
    const serializedChild = findNode(serializedProject?.children ?? [], 'Child');
    assert.deepEqual(serializedProject?.children.map((node) => node.text),
      ['Parent', 'Child', 'New sibling', 'Sibling']);
    assert.equal(serializedChild?.depth, 1);
    assert.equal(serializedChild?.children[0]?.depth, 2);
  });

  it('cut-pastes a source-executed child subtree to a different level without changing stored depths', async () => {
    const editor = await loadEditorOperations();
    const source = '# Project\r\n- Parent\n  - **Child** #keep\r\n    - Grandchild #descendant\n\n~~~js\r\nconst preserve = true\r\n~~~\n- Sibling\r\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const project = roots[0];
    const child = findNode(roots, 'Child');
    assert.ok(project && child);

    const clipboard = [editor.findBranch(roots, child.id)];
    assert.ok(clipboard[0]);
    const cutRoots = editor.removeNode(roots, child.id);
    const [copy] = editor.cloneBranches(clipboard);
    assert.ok(copy);
    const pastedRoots = editor.addSibling(cutRoots, project.id, copy);
    assert.equal(copy.depth, 2, 'copy helper preserves the branch root depth');
    assert.equal(copy.children[0]?.depth, 3, 'copy helper preserves descendant depths');
    assert.notEqual(copy.id, child.id);
    assert.notEqual(copy.children[0]?.id, child.children[0]?.id);

    assert.equal(session.serializeBranch([copy]), '- **Child** #keep\n  - Grandchild #descendant');
    const result = session.serializeOutline(pastedRoots);
    assert.equal(result,
      '# Project\r\n- Parent\n\n~~~js\r\nconst preserve = true\r\n~~~\n- Sibling\r\n# **Child** #keep\r\n- Grandchild #descendant\n');
    const reparsed = createOutlineSourceSession(result).parseOutline();
    assert.deepEqual(reparsed.map((node) => node.text), ['Project', 'Child']);
    assert.equal(reparsed[1]?.depth, 0);
    assert.equal(reparsed[1]?.children[0]?.text, 'Grandchild');
    assert.equal(reparsed[1]?.children[0]?.depth, 1);
    assert.deepEqual(reparsed[1]?.tags, ['keep']);
    assert.deepEqual(reparsed[1]?.children[0]?.tags, ['descendant']);
  });

  it('supports the editor’s add-child/add-sibling tree shapes and keeps a changed heading level explicit', () => {
    const source = '# Project\n- Existing\n';
    const session = createOutlineSourceSession(source);
    const [heading] = session.parseOutline();
    const existing = heading?.children[0];
    assert.ok(heading && existing);
    const child = { id: 'mm-new-1', text: 'Added child', tags: [], depth: 2, children: [] };
    const sibling = { id: 'mm-new-2', text: 'Added sibling', tags: [], depth: 1, children: [] };
    const next = [{ ...heading, text: 'Renamed project', children: [
      { ...existing, children: [child] },
      sibling,
    ] }];
    const result = session.serializeOutline(next);
    const reparsed = createOutlineSourceSession(result).parseOutline();
    assert.equal(reparsed[0]?.text, 'Renamed project');
    assert.equal(reparsed[0]?.children[0]?.children[0]?.text, 'Added child');
    assert.equal(reparsed[0]?.children[0]?.children[0]?.depth, 2);
    assert.equal(reparsed[0]?.children[1]?.text, 'Added sibling');
    assert.match(result, /^# Renamed project\n/);
  });

  it('copies a whole subtree with fresh editor IDs, preserves inline marks, and keeps document fences out of branch clipboard text', () => {
    const source = '# Root\n  - **Child** #tag\n\n```sql\nselect 1;\n```\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const root = roots[0];
    assert.ok(root);
    const copy = session.cloneBranches([root]);
    assert.notEqual(copy[0]?.id, root.id);
    assert.notEqual(copy[0]?.children[0]?.id, root.children[0]?.id);
    const result = session.serializeOutline([...roots, ...copy]);
    assert.equal((result.match(/\*\*Child\*\*/g) ?? []).length, 2);
    assert.equal((result.match(/```sql/g) ?? []).length, 1);

    const branch = session.serializeBranch([root.children[0]]);
    assert.match(branch, /^- \*\*Child\*\* #tag$/);
    assert.doesNotMatch(branch, /```sql|select 1/);
  });

  it('supports cut-then-paste after the original source node is absent, retaining the moved line mapping', () => {
    const source = '- Parent\n  - **Child** #tag\n- Stay\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const parent = roots[0];
    const stay = roots[1];
    const child = parent?.children[0];
    assert.ok(parent && stay && child);
    const pasted = session.cloneBranches([child]);
    const result = session.serializeOutline([{ ...parent, children: [] }, stay, ...pasted]);
    const reparsed = createOutlineSourceSession(result).parseOutline();
    assert.deepEqual(reparsed.map((node) => node.text), ['Parent', 'Stay', 'Child']);
    assert.deepEqual(reparsed[2]?.tags, ['tag']);
    assert.match(result, /- \*\*Child\*\* #tag/);
  });

  it('retains opaque fences and blank source even when every visible node is deleted', () => {
    const source = '# 可见标题\r\n\r\n~~~ts\r\nconst value = 7\r\n~~~\r\n\r\n';
    const session = createOutlineSourceSession(source);
    const deleted = session.serializeOutline([]);
    assert.doesNotMatch(deleted, /可见标题/);
    assert.equal(deleted, source.slice(source.indexOf('\r\n') + 2));
  });

  it('does not silently serialize a label that would be reinterpreted as a tag or formatting syntax', () => {
    const session = createOutlineSourceSession('- 原文\n');
    const [node] = session.parseOutline();
    assert.ok(node);
    assert.throws(() => session.serializeOutline([{ ...node, text: '新文 #tag' }]), /标签请在正文视图编辑/);
    assert.throws(() => session.serializeOutline([{ ...node, text: '**新文**' }]), /强调标记/);
  });

  it('fails closed when a new label cannot be represented by the legacy heading grammar', () => {
    const session = createOutlineSourceSession('- 原文\n');
    const [node] = session.parseOutline();
    assert.ok(node);
    assert.throws(() => session.serializeOutline([{ ...node, text: '# literal label' }]), /heading 标记开头/);
  });

  it('keeps complex inline Markdown byte-for-byte on unrelated edits and refuses edits it cannot map', () => {
    const source = '- [source link](https://example.test)\n- Other row\n';
    const session = createOutlineSourceSession(source);
    const roots = session.parseOutline();
    const link = roots[0];
    const other = roots[1];
    assert.ok(link && other);
    const result = session.serializeOutline([link, { ...other, text: 'Changed row' }]);
    assert.match(result, /^- \[source link\]\(https:\/\/example\.test\)\n/m);
    assert.throws(() => session.serializeOutline([{ ...link, text: 'changed link' }, other]), /无法映射的 Markdown 语法/);
  });
});
