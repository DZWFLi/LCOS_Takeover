import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'course-api-base-url-CifxI1ia.js';
const HELPER = 'LCOSUseNativeImageTitle';
const IMPORT_SOURCE = '/lcos/agent-ui.js';
const IMPORT = `import{${HELPER}}from"${IMPORT_SOURCE}";\n`;

function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) pending.push(value);
    }
  }
}

function one(items, label) {
  if (items.length !== 1) {
    throw new Error(`Native image title seam changed: expected one ${label}, got ${items.length}.`);
  }
  return items[0];
}

function propertyName(key) {
  if (key?.type === 'Identifier') return key.name;
  if (key?.type === 'StringLiteral') return key.value;
  return undefined;
}

function nodesMatching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function titleSeam(program, installed) {
  const xie = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === 'Xie'), 'shared original Canvas node shell Xie');
  const renderer = xie.init;
  if (renderer?.type !== 'ArrowFunctionExpression' || renderer.params[0]?.type !== 'Identifier') {
    throw new Error('Native image title seam changed: Xie is no longer the original node shell renderer.');
  }

  const destructure = one(nodesMatching(renderer.body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'ObjectPattern' && node.init?.type === 'Identifier'
    && node.init.name === renderer.params[0].name), 'original Xie prop destructure');
  const props = Object.fromEntries(destructure.id.properties
    .filter(property => property.type === 'ObjectProperty')
    .map(property => [propertyName(property.key), property.value?.name]));
  if (!['id', 'data', 'defaultTitle'].every(name => typeof props[name] === 'string')) {
    throw new Error('Native image title seam changed: original node ID/data/default-title props drifted.');
  }

  const titleBinding = one(nodesMatching(renderer.body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === '$'), 'original header title binding');
  let fallback = titleBinding.init;
  if (installed) {
    const call = fallback;
    if (call?.type !== 'CallExpression' || call.callee?.type !== 'Identifier' || call.callee.name !== HELPER
      || call.arguments.length !== 3 || call.arguments[0]?.type !== 'Identifier'
      || call.arguments[0].name !== props.id || call.arguments[1]?.type !== 'Identifier'
      || call.arguments[1].name !== props.data) {
      throw new Error('Native image title seam changed: installed read-only title hook arguments drifted.');
    }
    fallback = call.arguments[2];
  }

  const outer = fallback;
  const inner = outer?.type === 'LogicalExpression' && outer.operator === '||' ? outer.left : undefined;
  const dataTitle = inner?.type === 'LogicalExpression' && inner.operator === '||' ? inner.left : undefined;
  const defaultTitle = inner?.type === 'LogicalExpression' && inner.operator === '||' ? inner.right : undefined;
  if (outer?.type !== 'LogicalExpression' || outer.operator !== '||'
    || dataTitle?.type !== 'OptionalMemberExpression' || !dataTitle.optional || dataTitle.computed
    || dataTitle.object?.type !== 'Identifier' || dataTitle.object.name !== props.data
    || dataTitle.property?.type !== 'Identifier' || dataTitle.property.name !== 'title'
    || defaultTitle?.type !== 'Identifier' || defaultTitle.name !== props.defaultTitle
    || outer.right?.type !== 'StringLiteral' || outer.right.value !== 'Title') {
    throw new Error('Native image title seam changed: expected the exact data.title → defaultTitle → "Title" fallback.');
  }

  return { titleBinding, fallback, nodeId: props.id, data: props.data };
}

function ownedImport(program) {
  return nodesMatching(program, node => node.type === 'ImportDeclaration'
    && node.source?.value === IMPORT_SOURCE
    && node.specifiers?.some(specifier => specifier.type === 'ImportSpecifier'
      && specifier.imported?.name === HELPER && specifier.local?.name === HELPER));
}

function helperCalls(program) {
  return nodesMatching(program, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === HELPER);
}

function assertInstalled(program) {
  const importNode = one(ownedImport(program), 'named read-only image title helper import');
  const callNode = one(helperCalls(program), 'original image title hook call');
  if (importNode.specifiers.length !== 1) {
    throw new Error('Native image title seam is partially installed: owned import was merged or changed.');
  }
  titleSeam(program, true);
  return { importNode, callNode };
}

/** Replace only Xie's title expression; all original header markup and fallback stay intact. */
export function transformNativeImageTitleScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  const imports = ownedImport(program);
  const calls = helperCalls(program);
  if (imports.length || calls.length) {
    if (imports.length !== 1 || calls.length !== 1) {
      throw new Error('Native image title seam is partially installed.');
    }
    assertInstalled(program);
    return source;
  }

  const { titleBinding, fallback, nodeId, data } = titleSeam(program, false);
  const importAnchor = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1),
    'first module import');
  const replacement = `${HELPER}(${nodeId},${data},${source.slice(fallback.start, fallback.end)})`;
  let transformed = source;
  const edits = [
    { start: titleBinding.init.start, end: titleBinding.init.end, text: replacement },
    { start: importAnchor.start, end: importAnchor.start, text: IMPORT },
  ];
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  assertInstalled(parseOriginalDonorScript(transformed, filename));
  return transformed;
}

/** Restore the original fallback and remove only this transform's exact import. */
export function restoreNativeImageTitleScriptForComparison(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  const { importNode } = assertInstalled(program);
  const { titleBinding, fallback } = titleSeam(program, true);
  if (source.slice(importNode.start, importNode.start + IMPORT.length) !== IMPORT) {
    throw new Error('Native image title seam is partially installed: owned import bytes changed.');
  }
  const edits = [
    { start: titleBinding.init.start, end: titleBinding.init.end, text: source.slice(fallback.start, fallback.end) },
    { start: importNode.start, end: importNode.start + IMPORT.length, text: '' },
  ];
  let restored = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
  }
  return restored;
}
