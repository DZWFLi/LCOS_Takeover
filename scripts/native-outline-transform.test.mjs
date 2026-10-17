import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { transformNativeOutlineEditor, transformNativeTextFaces } from '../lab/native-outline-transform.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editorRelative = 'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx';
const facesRelative = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';
const helperAbsolute = path.join(workspaceRoot, 'lab/pilot/native-outline-source.ts');
const editorPath = path.join(workspaceRoot, editorRelative);
const facesPath = path.join(workspaceRoot, facesRelative);
const editorSource = fs.readFileSync(editorPath, 'utf8');
const facesSource = fs.readFileSync(facesPath, 'utf8');
const eol = editorSource.match(/\r\n|\n|\r/)?.[0] ?? '\n';
const dependencyRequire = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = dependencyRequire('esbuild');

function helperSpecifier(sourcePath) {
  const relative = path.relative(path.dirname(sourcePath), helperAbsolute).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function assertRestored(actual, expected, message) {
  let index = 0;
  const limit = Math.min(actual.length, expected.length);
  while (index < limit && actual[index] === expected[index]) index += 1;
  if (index !== actual.length || index !== expected.length) {
    throw new Error(`${message}; first difference ${index}: actual=${JSON.stringify(actual.slice(Math.max(0, index - 50), index + 120))} expected=${JSON.stringify(expected.slice(Math.max(0, index - 50), index + 120))}`);
  }
}

function restoreEditorSeams(transformed, sourcePath) {
  const eol = transformed.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const specifier = helperSpecifier(sourcePath);
  let restored = transformed.replace(
    `import { createOutlineSourceSession } from "${specifier}"${eol}import type { OutlineNode } from './outlineTree'`,
    "import { parseOutline, serializeOutline, type OutlineNode } from './outlineTree'",
  );
  restored = restored.replace(
    `  const [outlineSession] = useState(() => createOutlineSourceSession(outline))${eol}`
      + '  const [roots, setRoots] = useState<readonly OutlineNode[]>(() => [...outlineSession.parseOutline()])',
    '  const [roots, setRoots] = useState<readonly OutlineNode[]>(() => [...parseOutline(outline)])',
  );
  restored = restored.replace('outlineSession.serializeBranch([branch])', 'serializeOutline([branch])');
  restored = restored.replace('outlineSession.cloneBranches(clipboard)', 'cloneBranches(clipboard)');
  restored = restored.replace('outlineSession.serializeOutline(nextRoots)', 'serializeOutline(nextRoots)');
  restored = restored.replace('}, [busy, disabled, selected, roots, outlineSession])', '}, [busy, disabled, selected, roots])');
  restored = restored.replace('}, [busy, disabled, clipboard, selected, roots, outlineSession])', '}, [busy, disabled, clipboard, selected, roots])');
  const cloneBlock = [
    '/** 深拷贝并换新 id：serialize→parse 回环天然重生成全部 id，粘贴不出重复键。 */',
    'function cloneBranches(branches: readonly OutlineNode[]): readonly OutlineNode[] {',
    '  const clone = (node: OutlineNode): OutlineNode => ({ ...node, id: newNode(node.depth).id, children: node.children.map(clone) })',
    '  return branches.map(clone)',
    '}',
  ].join(eol);
  const findBranchStart = restored.indexOf('function findBranch(');
  const findBranchEnd = restored.indexOf(`  return null${eol}}`, findBranchStart);
  const branchEnd = findBranchEnd + `  return null${eol}}`.length;
  const componentDoc = `/**${eol} * 沉浸式导图编辑器`;
  const componentDocIndex = restored.indexOf(componentDoc, branchEnd);
  assert.ok(findBranchStart >= 0 && findBranchEnd > findBranchStart && componentDocIndex > branchEnd);
  assert.match(restored.slice(branchEnd, componentDocIndex), /^(?:\r\n|\n|\r)+$/);
  return `${restored.slice(0, branchEnd)}${eol}${eol}${cloneBlock}${eol}${eol}${restored.slice(componentDocIndex)}`;
}

function restoreTextFaceSeams(transformed, sourcePath) {
  const eol = transformed.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const specifier = helperSpecifier(sourcePath);
  let restored = transformed.replace(
    `import { createOutlineSourceSession } from "${specifier}"`,
    "import { extractOutlineBranchText, parseOutline } from './outlineTree';",
  );
  const branchBlock = [
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
  restored = restored.replace(branchBlock,
    '    const text = extractOutlineBranchText(parseOutline(markdown), row.id); if (!text) return;');
  restored = restored.replace(
    [
      '  // The connected source-map serializer retains fenced and opaque document lines.',
      '  const canEditMap = Boolean(onSaveText);',
    ].join(eol),
    [
      '  // The reading projection skips fenced code. Never serialize that partial',
      '  // projection over the complete canonical document.',
      '  const canEditMap = onSaveText && !/^ {0,3}(?:`{3,}|~{3,})/m.test(markdown);',
    ].join(eol),
  );
  return restored;
}

async function assertTsxBundleResolvesHelper(transformed, sourcePath) {
  const specifier = helperSpecifier(sourcePath);
  const helperImport = `import { createOutlineSourceSession } from "${specifier}"`;
  assert.equal(transformed.split(helperImport).length - 1, 1, 'the transformed module imports the source-map helper exactly once');
  assert.equal(path.resolve(path.dirname(sourcePath), specifier), helperAbsolute, 'the relative module path resolves to the lab helper');

  const result = await esbuild.build({
    stdin: { contents: transformed, sourcefile: sourcePath, resolveDir: path.dirname(sourcePath), loader: 'tsx' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [{
      name: 'externalize-existing-ui-imports-only',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => args.path === specifier ? undefined : { path: args.path, external: true });
      },
    }],
  });
  assert.equal(result.errors.length, 0, 'esbuild parses the TSX and resolves/bundles the helper');
  assert.match(result.outputFiles[0]?.text ?? '', /outlineSourceSession|createOutlineSourceSession/);
}

describe('native outline in-memory source transforms', () => {
  it('connects one mount-scoped session to parse, full save, branch clipboard and paste clone', async () => {
    const transformed = transformNativeOutlineEditor(editorSource, { sourcePath: editorPath });
    assert.notEqual(transformed, editorSource);
    assert.match(transformed, /const \[outlineSession\] = useState\(\(\) => createOutlineSourceSession\(outline\)\)/);
    assert.match(transformed, /const \[roots, setRoots\] = useState<readonly OutlineNode\[\]>\(\(\) => \[\.\.\.outlineSession\.parseOutline\(\)\]\)/);
    assert.match(transformed, /outlineSession\.serializeBranch\(\[branch\]\)/);
    assert.match(transformed, /outlineSession\.cloneBranches\(clipboard\)/);
    assert.match(transformed, /body: outlineSession\.serializeOutline\(nextRoots\)/);
    assert.match(transformed, /\}, \[busy, disabled, selected, roots, outlineSession\]\)/);
    assert.match(transformed, /\}, \[busy, disabled, clipboard, selected, roots, outlineSession\]\)/);
    assert.doesNotMatch(transformed, /parseOutline\(outline\)|serializeOutline\(\[branch\]\)|const pasted = cloneBranches\(clipboard\)/);
    assertRestored(restoreEditorSeams(transformed, editorPath), editorSource,
      'all bytes outside the named editor seams remain unchanged');
    assert.equal(transformNativeOutlineEditor(transformed, { sourcePath: editorPath }), transformed,
      'a second install is idempotent and does not duplicate the helper or session');
    await assertTsxBundleResolvesHelper(transformed, editorPath);
  });

  it('routes branch drag serialization through a source session and only then opens fenced full-source editing', async () => {
    const transformed = transformNativeTextFaces(facesSource, { sourcePath: facesPath });
    assert.match(transformed, /const outlineSession = createOutlineSourceSession\(markdown\);/);
    assert.match(transformed, /const pending = \[\.\.\.outlineSession\.parseOutline\(\)\];/);
    assert.match(transformed, /outlineSession\.serializeBranch\(\[branchNode\]\)/);
    assert.match(transformed, /const canEditMap = Boolean\(onSaveText\);/);
    assert.doesNotMatch(transformed, /extractOutlineBranchText|parseOutline\(markdown\)|!\/\^ \{0,3\}\(\?:`\{3,\}\|~\{3,\}\)\/m\.test\(markdown\)/);
    assert.match(transformed, /mode !== 'text' && onSaveText && !canEditMap/,
      'the existing save-owner check and other UI protections remain');
    assert.match(transformed, /if \(canEditMap && !disabled\) setEditingMap\(true\)/,
      'the existing disabled guard remains on map entry');
    assertRestored(restoreTextFaceSeams(transformed, facesPath), facesSource,
      'all bytes outside the named branch and complete-source gate seams remain unchanged');
    assert.equal(transformNativeTextFaces(transformed, { sourcePath: facesPath }), transformed,
      'a second install is idempotent');
    await assertTsxBundleResolvesHelper(transformed, facesPath);

    const composedEditor = transformNativeOutlineEditor(editorSource, { sourcePath: editorPath });
    const composedFaces = transformNativeTextFaces(facesSource, { sourcePath: facesPath });
    assert.ok(composedEditor.includes('outlineSession.serializeBranch([branch])')
      && composedEditor.includes('outlineSession.cloneBranches(clipboard)')
      && composedEditor.includes('outlineSession.serializeOutline(nextRoots)')
      && composedFaces.includes('const canEditMap = Boolean(onSaveText);'),
    'the fenced guard is released only in the tested composition with all three editor serializer paths');
  });

  it('rejects duplicate installation, repeated anchors, source drift, and the wrong copied owner', () => {
    const oldEditorImport = "import { parseOutline, serializeOutline, type OutlineNode } from './outlineTree'";
    const duplicatedImport = editorSource.replace(oldEditorImport, `${oldEditorImport}${eol}${oldEditorImport}`);
    assert.throws(() => transformNativeOutlineEditor(duplicatedImport, { sourcePath: editorPath }), /editor imports seam drift/);

    const editor = transformNativeOutlineEditor(editorSource, { sourcePath: editorPath });
    const duplicateInstalled = editor.replace(
      'import type { OutlineNode } from \'./outlineTree\'',
      `import type { OutlineNode } from './outlineTree'${eol}import { createOutlineSourceSession } from './duplicate-helper.ts'`,
    );
    assert.throws(() => transformNativeOutlineEditor(duplicateInstalled, { sourcePath: editorPath }), /partially installed or duplicated|duplicated helper import/);
    assert.throws(() => transformNativeOutlineEditor(editorSource.replace('serializeOutline(nextRoots)', 'serializeOutline(roots)'),
      { sourcePath: editorPath }), /canonical save serializer seam drift/);
    assert.throws(() => transformNativeOutlineEditor(editorSource, { sourcePath: facesPath }), /only transforms .*MindMapEditor/);

    const oldFacesBranch = '    const text = extractOutlineBranchText(parseOutline(markdown), row.id); if (!text) return;';
    assert.throws(() => transformNativeTextFaces(facesSource.replace(oldFacesBranch, `${oldFacesBranch}${eol}${oldFacesBranch}`),
      { sourcePath: facesPath }), /dragged branch serializer seam drift/);
    assert.throws(() => transformNativeTextFaces(facesSource, { sourcePath: editorPath }), /only transforms .*LcosTextFaces/);
  });
});
