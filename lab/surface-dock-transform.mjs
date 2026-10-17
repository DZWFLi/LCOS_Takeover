import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ENTRY = 'page-Da_DfwiK.js';
const UI_IMPORT = '/surface-dock-ui.js';
const REACT_DOM_IMPORT = './index-BAQXnPag.js';
// In the vendor index ESM export table, Au (the ReactDOM namespace with
// createPortal) is exported as hD. The test checks this source relationship.
const REACT_DOM_EXPORT = 'hD';
const REACT_FLOW_IMPORT_SUFFIX = 'UnlimitedModeToggle-D4wysAbz.js';
const REACT_IMPORT_SUFFIX = 'index-BAQXnPag.js';
const REACT_EXPORT = 'cd';

let babelParse;

function loadBabelParse() {
  if (babelParse) return babelParse;

  const npmCache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx') : '';
  if (npmCache && fs.existsSync(npmCache)) {
    const cached = fs.readdirSync(npmCache).sort()
      .map((entry) => path.join(npmCache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find((filename) => fs.existsSync(filename));
    if (cached) {
      babelParse = require(cached).babelParse;
      return babelParse;
    }
  }

  try {
    const localParser = require.resolve('@babel/parser');
    babelParse = (source, filename) => require(localParser).parse(source, {
      sourceType: 'module',
      sourceFilename: filename,
    });
    return babelParse;
  } catch {
    // This is the already-installed LCOS parser cache used by lab/pilot/extract-node-leaves.mjs.
  }

  const parserStore = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
  if (fs.existsSync(parserStore)) {
    const parserPackage = fs.readdirSync(parserStore).find((name) => name.startsWith('@babel+parser@'));
    if (parserPackage) {
      const filename = path.join(parserStore, parserPackage, 'node_modules/@babel/parser/lib/index.js');
      babelParse = (source, file) => require(filename).parse(source, {
        sourceType: 'module',
        sourceFilename: file,
      });
      return babelParse;
    }
  }

  throw new Error('Cached @babel/parser unavailable; no download attempted.');
}

function parse(source, filename) {
  return loadBabelParse()(source, filename, true);
}

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

function propertyKey(property) {
  if (property?.type !== 'ObjectProperty' || property.computed) return null;
  if (property.key?.type === 'Identifier') return property.key.name;
  if (property.key?.type === 'StringLiteral') return property.key.value;
  return null;
}

function property(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find((entry) => propertyKey(entry) === name) : undefined;
}

function unique(items, label) {
  if (items.length !== 1) {
    throw new Error('Surface dock seam changed: expected one ' + label + ', got ' + items.length + '.');
  }
  return items[0];
}

function stringValue(node) {
  return node?.type === 'StringLiteral' ? node.value : null;
}

function directArrowCall(propertyValue) {
  if (propertyValue?.type !== 'ArrowFunctionExpression') return null;
  let body = propertyValue.body;
  if (body.type === 'BlockStatement') {
    if (body.body.length !== 1 || body.body[0].type !== 'ExpressionStatement') return null;
    body = body.body[0].expression;
  }
  return body.type === 'CallExpression' ? body : null;
}

function memberMethod(node, methods) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && methods.includes(node.callee.property?.name);
}

function reactFlowAliases(program) {
  return program.body
    .filter((node) => node.type === 'ImportDeclaration'
      && node.source.value.endsWith(REACT_FLOW_IMPORT_SUFFIX))
    .flatMap((node) => node.specifiers
      .filter((specifier) => specifier.type === 'ImportSpecifier'
        && specifier.imported?.name === 'i')
      .map((specifier) => specifier.local.name));
}

export function countReactFlowRoots(source, filename = ENTRY) {
  const program = parse(source, filename).program;
  const aliases = new Set(reactFlowAliases(program));
  if (!aliases.size) return 0;
  const calls = [];
  walk(program, (node) => {
    if (memberMethod(node, ['jsx', 'jsxs'])
        && node.arguments[0]?.type === 'Identifier'
        && aliases.has(node.arguments[0].name)) calls.push(node);
  });
  return calls.length;
}

function seams(program) {
  const importReactFlow = unique(reactFlowAliases(program), 'ReactFlow import');
  const reactAliases = program.body
    .filter((node) => node.type === 'ImportDeclaration'
      && node.source.value.endsWith(REACT_IMPORT_SUFFIX))
    .flatMap((node) => node.specifiers
      .filter((specifier) => specifier.type === 'ImportSpecifier'
        && specifier.imported?.name === REACT_EXPORT)
      .map((specifier) => specifier.local.name));
  const react = unique(reactAliases, 'host React import');

  const selectionCalls = [];
  const headerRoots = [];
  walk(program, (node) => {
    if (memberMethod(node, ['jsx', 'jsxs'])) {
      const props = node.arguments[1];
      const select = property(props, 'onSelect');
      const callback = directArrowCall(select?.value);
      const currentCanvasId = property(props, 'currentCanvasId')?.value;
      const disabled = property(props, 'disabled')?.value;
      if (callback?.callee?.type === 'Identifier'
          && property(props, 'rootItems')
          && currentCanvasId
          && disabled) {
        selectionCalls.push({
          node,
          runtime: node.callee.object?.name,
          onSelect: callback.callee.name,
          currentCanvasId,
          disabled,
        });
      }
    }

    if (memberMethod(node, ['jsx', 'jsxs'])
        && stringValue(node.arguments[0]) === 'div'
        && stringValue(property(node.arguments[1], 'className')?.value) === 'canvas-header-chrome') {
      headerRoots.push({ node, runtime: node.callee.object?.name });
    }
  });

  const selection = unique(selectionCalls, 'original canvas selector callback');
  const header = unique(headerRoots, 'canvas-header-chrome root');
  if (!selection.runtime || !header.runtime || selection.runtime !== header.runtime) {
    throw new Error('Surface dock seam changed: host JSX runtime is ambiguous.');
  }
  if (countReactFlowRootsFromProgram(program, new Set([importReactFlow])) < 1) {
    throw new Error('Surface dock seam changed: original ReactFlow root is missing.');
  }
  return { ...selection, ...header, react };
}

function countReactFlowRootsFromProgram(program, aliases) {
  const calls = [];
  walk(program, (node) => {
    if (memberMethod(node, ['jsx', 'jsxs'])
        && node.arguments[0]?.type === 'Identifier'
        && aliases.has(node.arguments[0].name)) calls.push(node);
  });
  return calls.length;
}

function installedState(program) {
  const imports = program.body.filter((node) => node.type === 'ImportDeclaration'
    && node.source.value === UI_IMPORT
    && node.specifiers.some((specifier) => specifier.local?.name === 'LCOSSurfaceDock'));
  const portalImports = program.body.filter((node) => node.type === 'ImportDeclaration'
    && node.source.value === REACT_DOM_IMPORT
    && node.specifiers.some((specifier) => specifier.type === 'ImportSpecifier'
      && specifier.imported?.name === REACT_DOM_EXPORT
      && specifier.local?.name === 'LCOSReactDOM'));
  const calls = [];
  walk(program, (node) => {
    if (memberMethod(node, ['jsx', 'jsxs'])
        && node.arguments[0]?.type === 'Identifier'
        && node.arguments[0].name === 'LCOSSurfaceDock') calls.push(node);
  });
  return { imports: imports.length, portalImports: portalImports.length, calls: calls.length };
}

export function transformSurfaceDockScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') {
    throw new TypeError('Surface dock transform expects a filename and source text.');
  }
  if (filename.split(/[\\/]/).pop() !== ENTRY) return source;

  const existing = installedState(parse(source, filename).program);
  if (existing.imports === 1 && existing.portalImports === 1 && existing.calls === 1) return source;
  if (existing.imports || existing.portalImports || existing.calls) {
    throw new Error('Surface dock transform is partially installed; refusing ambiguous source.');
  }

  const program = parse(source, filename).program;
  const found = seams(program);
  const flowBefore = countReactFlowRootsFromProgram(program, new Set(reactFlowAliases(program)));
  const runtime = found.runtime;
  const originalHeader = source.slice(found.node.start, found.node.end);
  const dock = runtime + '.jsx(LCOSSurfaceDock,{react:' + found.react
    + ',runtime:' + runtime
    + ',createPortal:LCOSReactDOM.createPortal'
    + ',currentCanvasId:' + source.slice(found.currentCanvasId.start, found.currentCanvasId.end)
    + ',onSelect:' + found.onSelect
    + ',disabled:' + source.slice(found.disabled.start, found.disabled.end) + '})';
  const wrapped = runtime + '.jsx(' + found.react + '.Fragment,{children:[' + originalHeader + ',' + dock + ']})';
  let transformed = source.slice(0, found.node.start) + wrapped + source.slice(found.node.end);
  const firstImport = program.body.find((node) => node.type === 'ImportDeclaration');
  const importAt = firstImport?.start ?? 0;
  transformed = transformed.slice(0, importAt)
    + 'import { LCOSSurfaceDock } from "' + UI_IMPORT + '";\n'
    + 'import { ' + REACT_DOM_EXPORT + ' as LCOSReactDOM } from "' + REACT_DOM_IMPORT + '";\n'
    + transformed.slice(importAt);

  const transformedProgram = parse(transformed, filename).program;
  const installed = installedState(transformedProgram);
  if (installed.imports !== 1 || installed.portalImports !== 1 || installed.calls !== 1) {
    throw new Error('Surface dock transform did not install one host React dock and vendor ReactDOM portal.');
  }
  const flowAfter = countReactFlowRootsFromProgram(transformedProgram,
    new Set(reactFlowAliases(transformedProgram)));
  if (flowBefore !== flowAfter) {
    throw new Error('Surface dock transform changed the original ReactFlow root count.');
  }
  return transformed;
}
