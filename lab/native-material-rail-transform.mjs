import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const AGENT_UI_SOURCE = '/lcos/agent-ui.js';
const ASSEMBLY_OPEN = 'LCOSNativeAssemblyOpen';
const ASSEMBLY_TOOLS = 'LCOSNativeAssemblyTools';
const NATIVE_ASSET_ROW = 'Zp';
const NATIVE_POPOVER = 'pr';
const PROPS = Object.freeze([
  ['NativeButton', 'em'],
  ['NativePreview', 'TS'],
  ['NativeAssetRow', NATIVE_ASSET_ROW],
  ['NativePopover', NATIVE_POPOVER],
]);

function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) {
        pending.push(value);
      }
    }
  }
}

function nodesMatching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function one(items, label) {
  if (items.length !== 1) {
    throw new Error('Native material Rail seam changed: expected one ' + label + ', got ' + items.length + '.');
  }
  return items[0];
}

function propertyName(property) {
  if (property?.type === 'Identifier') return property.name;
  if (property?.type === 'StringLiteral') return property.value;
  return undefined;
}

function objectProperty(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find(property => property.type === 'ObjectProperty' && propertyName(property.key) === name)
    : undefined;
}

function call(node, objectName, property) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.object?.type === 'Identifier'
    && node.callee.object.name === objectName
    && propertyName(node.callee.property) === property;
}

function jsxComponent(node, name) {
  return (call(node, 'r', 'jsx') || call(node, 'r', 'jsxs'))
    && node.arguments[0]?.type === 'Identifier'
    && node.arguments[0].name === name;
}

function binding(program, name) {
  return one(nodesMatching(program, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === name), 'module binding ' + name);
}

function librarySurface(program) {
  const component = binding(program, 'jF').init;
  if (component?.type !== 'ArrowFunctionExpression') {
    throw new Error('Native material Rail seam changed: jF is no longer the original Library panel.');
  }
  const surface = one(nodesMatching(component.body, node =>
    (call(node, 'r', 'jsxs') || call(node, 'r', 'jsx'))
      && objectProperty(node.arguments[1], 'data-library-view')?.value?.value === 'library'),
  'original Library view');
  const children = objectProperty(surface.arguments[1], 'children')?.value;
  if (children?.type !== 'ArrayExpression') {
    throw new Error('Native material Rail seam changed: original Library children are no longer an array.');
  }
  return { component, surface, children };
}

function assemblyLeaf(program) {
  const { component, surface, children } = librarySurface(program);
  const row = binding(program, NATIVE_ASSET_ROW).init;
  const leaf = one(nodesMatching(row.body, node => jsxComponent(node, ASSEMBLY_TOOLS)),
    'LCOSNativeAssemblyTools row preview leaf');
  if (!jsxComponent(children.elements[0], 'iF') || !jsxComponent(children.elements[1], 'cw')
      || nodesMatching(component.body, node => jsxComponent(node, ASSEMBLY_TOOLS)).length) {
    throw new Error('Native material Rail seam changed: material actions must stay inside the original row preview.');
  }
  const props = leaf.arguments[1];
  if (props?.type !== 'ObjectExpression') {
    throw new Error('Native material Rail seam changed: Assembly tools leaf props are no longer an object.');
  }
  // The earlier Agent transform legitimately imports other leaves from this
  // same module. Own only the import carrying Assembly's two exact specifiers;
  // still reject duplicates and any partial/aliased installation below.
  const agentImports = program.body.filter(node => node.type === 'ImportDeclaration'
    && node.source?.value === AGENT_UI_SOURCE
    && node.specifiers.some(specifier => {
      if (specifier.type !== 'ImportSpecifier') return false;
      const imported = propertyName(specifier.imported);
      const local = specifier.local?.name;
      return imported === ASSEMBLY_OPEN || imported === ASSEMBLY_TOOLS
        || local === ASSEMBLY_OPEN || local === ASSEMBLY_TOOLS;
    }));
  const agentImport = one(agentImports, 'owned Assembly agent-ui import');
  const imported = agentImport.specifiers.map(specifier => [
    propertyName(specifier.imported), specifier.local?.name,
  ]);
  const expectedImports = [
    [ASSEMBLY_OPEN, ASSEMBLY_OPEN],
    [ASSEMBLY_TOOLS, ASSEMBLY_TOOLS],
  ];
  if (JSON.stringify(imported) !== JSON.stringify(expectedImports)) {
    throw new Error('Native material Rail seam changed: expected the installed Assembly agent-ui import first.');
  }
  return { component, surface, children, leaf, props };
}

function validateNativeBindings(program) {
  for (const name of ['em', 'TS', NATIVE_ASSET_ROW]) binding(program, name);
  one(program.body.filter(node => node.type === 'ImportDeclaration'
    && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier'
      && specifier.local?.name === NATIVE_POPOVER)),
  'original Popover import binding pr');
  const row = binding(program, NATIVE_ASSET_ROW).init;
  if (nodesMatching(row.body, node => jsxComponent(node, NATIVE_POPOVER)).length !== 1
      || nodesMatching(row.body, node => jsxComponent(node, 'TS')).length !== 1) {
    throw new Error('Native material Rail seam changed: Zp no longer owns its original HoverPopover and TS preview.');
  }
}

function installedLeaf(program) {
  validateNativeBindings(program);
  const found = assemblyLeaf(program);
  const props = found.props.properties;
  const actions = props.filter(property => !['detail', 'onApply', 'onClose'].includes(propertyName(property.key)));
  if (actions.length !== PROPS.length || actions.some((property, index) =>
    property.type !== 'ObjectProperty'
      || propertyName(property.key) !== PROPS[index][0]
      || property.value?.type !== 'Identifier'
      || property.value.name !== PROPS[index][1])) {
    throw new Error('Native material Rail seam is partially installed or its native leaf props drifted.');
  }
  return found;
}

function originalLeaf(program) {
  validateNativeBindings(program);
  const found = assemblyLeaf(program);
  const props = found.props.properties;
  const expected = PROPS.slice(0, 2);
  const actions = props.filter(property => !['detail', 'onApply', 'onClose'].includes(propertyName(property.key)));
  if (actions.length !== expected.length || actions.some((property, index) =>
    property.type !== 'ObjectProperty'
      || propertyName(property.key) !== expected[index][0]
      || property.value?.type !== 'Identifier'
      || property.value.name !== expected[index][1])) {
    throw new Error('Native material Rail seam changed: Assembly leaf must first expose NativeButton:em and NativePreview:TS.');
  }
  return found;
}

/** Supply the original row and Popover to the on-demand preview location action. */
export function transformNativeMaterialRailScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') {
    throw new TypeError('Native material Rail transform expects a filename and source text.');
  }
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;

  const program = parseOriginalDonorScript(source, filename);
  const found = assemblyLeaf(program);
  const hasRow = objectProperty(found.props, 'NativeAssetRow');
  const hasPopover = objectProperty(found.props, 'NativePopover');
  if (hasRow || hasPopover) {
    installedLeaf(program);
    return source;
  }

  const original = originalLeaf(program);
  const text = ',NativeAssetRow:' + NATIVE_ASSET_ROW + ',NativePopover:' + NATIVE_POPOVER;
  const insertAt = original.props.end - 1;
  const transformed = source.slice(0, insertAt) + text + source.slice(insertAt);
  installedLeaf(parseOriginalDonorScript(transformed, filename));
  return transformed;
}

/** Restore byte-for-byte to the exact post-Assembly source supplied by the caller. */
export function restoreNativeMaterialRailScriptForComparison(filename, transformed, assemblySource) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return transformed;
  if (typeof assemblySource !== 'string') {
    throw new TypeError('Native material Rail restore requires the exact post-Assembly source.');
  }
  const expected = transformNativeMaterialRailScript(filename, assemblySource);
  if (expected !== transformed) {
    throw new Error('Native material Rail restore refused: transformed source differs from the exact reversible output.');
  }
  return assemblySource;
}
