import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { currentGen2Root } from './current-gen2-resources.mjs';
import { parseOriginalDonorScript } from './agent-node-transform.mjs';
import { transformNativeMaterialViewerScript } from './native-material-viewer-transform.mjs';
import { transformNativeLightThemeScript } from './native-light-theme-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const pnpm = path.join(currentGen2Root, 'huabu/node_modules/.pnpm');
export const nativeTextSourceCourse = 'lcos-original-text-course';
export const nativeTextSourceIndex = 'lcos-original-text-index';
let modules;

/** Extract the actual CT/uW/jX dependency closure used by the current native
 * Reader. Rebind only the original shared React namespaces, not Markdown rules. */
export function readNativeTextSourceRendererModules() {
  return modules ??= (async () => {
    const traversePackage = (await fs.readdir(pnpm)).find(name => name.startsWith('@babel+traverse@'));
    if (!traversePackage) throw new Error('Installed original renderer AST dependency is unavailable.');
    const traverse = dependency(path.join(pnpm, traversePackage, 'node_modules/@babel/traverse/lib/index.js')).default;
    async function sourceModule(filename) {
      const file = path.join(assets, filename), raw = await fs.readFile(file, 'utf8');
      const source = transformNativeLightThemeScript(filename, filename === 'course-api-base-url-CifxI1ia.js'
        ? transformNativeMaterialViewerScript(filename, raw) : raw);
      const program = parseOriginalDonorScript(source, filename); let scope;
      traverse({ type: 'File', program }, { Program(value) { scope = value.scope; value.stop(); } });
      const exports = new Map(program.body.flatMap(node => node.type === 'ExportNamedDeclaration' ? node.specifiers : [])
        .map(node => [node.exported.name ?? node.exported.value, node.local.name]));
      return { file, source, program, scope, exports };
    }
    const index = await sourceModule('index-BAQXnPag.js'), course = await sourceModule('course-api-base-url-CifxI1ia.js');
    const indexSeeds = new Set(), replacements = new Map([['w', 'const w=React;'], ['v', 'const v=JSX;'], ['N7e', 'const N7e=ReactDOM;']]);
    function extract(module, seeds, isCourse = false) {
      const selected = new Map(), queue = [...seeds], imports = new Map();
      while (queue.length) {
        const name = queue.pop(); if (selected.has(name)) continue;
        const binding = module.scope.getBinding(name);
        if (!binding) throw new Error('Original CT dependency is unavailable: ' + name);
        const node = binding.path.node; selected.set(name, node);
        if (!isCourse && replacements.has(name)) continue;
        if (binding.kind === 'module') {
          const original = binding.path.parentPath.node.source.value;
          if (isCourse && original === './index-BAQXnPag.js') {
            const imported = node.imported?.name ?? node.imported?.value, actual = index.exports.get(imported);
            if (!actual) throw new Error('Original CT index export is unavailable: ' + imported);
            indexSeeds.add(actual); imports.set(name, `import{${actual} as ${name}}from${JSON.stringify(nativeTextSourceIndex)};`);
          } else {
            const specifier = module.source.slice(node.start, node.end);
            imports.set(name, `import{${specifier}}from${JSON.stringify(path.resolve(path.dirname(module.file), original).replaceAll('\\', '/'))};`);
          }
          continue;
        }
        binding.path.traverse({ ReferencedIdentifier(value) {
          const dep = value.scope.getBinding(value.node.name);
          if (dep?.scope === module.scope && !selected.has(value.node.name)) queue.push(value.node.name);
        } });
      }
      const declarations = new Map();
      for (const [name, node] of selected) {
        if (imports.has(name)) continue;
        if (!isCourse && replacements.has(name)) { declarations.set(node.start, replacements.get(name)); continue; }
        const text = module.source.slice(node.start, node.end);
        declarations.set(node.start, node.type === 'VariableDeclarator' ? 'var ' + text + ';' : text);
      }
      return { count: selected.size, source: `import*as React from'react';import*as JSX from'react/jsx-runtime';import*as ReactDOM from'react-dom';\n`
        + [...imports.values()].join('\n') + '\n' + [...declarations].sort((a,b) => a[0]-b[0]).map(row => row[1]).join('\n')
        + '\nexport{' + [...seeds].join(',') + '};' };
    }
    const courseParts = extract(course, ['CT'], true), indexParts = extract(index, indexSeeds);
    // The original named-entity decoder owns one inert <i> scratch element.
    // Give that exact local element a local parser document on Node; never
    // install a global document or replace the original decoder/Markdown rules.
    const scratch = index.scope.getBinding('Plt')?.path.node;
    if (scratch?.type !== 'VariableDeclarator' || scratch.init?.type !== 'CallExpression'
      || scratch.init.callee?.object?.name !== 'document' || scratch.init.callee?.property?.name !== 'createElement'
      || scratch.init.arguments?.[0]?.value !== 'i') throw new Error('Original CT entity decoder scratch element changed.');
    const scratchDeclaration = 'var ' + index.source.slice(scratch.start, scratch.end) + ';';
    if (indexParts.source.split(scratchDeclaration).length !== 2) throw new Error('Original CT entity decoder must have one scratch element.');
    indexParts.nodeSource = `import{parseHTML as NativeTextParseHTML}from'linkedom';const NativeTextDocument=NativeTextParseHTML('<!doctype html><html><head></head><body></body></html>').document;\n`
      + indexParts.source.replace(scratchDeclaration, 'var Plt=NativeTextDocument.createElement("i");');
    return { assets, course: courseParts, index: indexParts };
  })();
}

/** Registered only for Node builds; extraction is lazy until the server-only
 * projection module is actually imported. Browser bundles never load Node DOM. */
export function createNativeTextSourceProjectionPlugin() {
  return { name: 'original-CT-node-source-projection', setup(build) {
    if (build.initialOptions.platform !== 'node') throw new Error('Original CT source projection plugin is Node-only.');
    build.onResolve({ filter: /^lcos-original-text-(?:course|index)$/ }, args => ({ path: args.path, namespace: 'native-original-CT' }));
    build.onLoad({ filter: /.*/, namespace: 'native-original-CT' }, async args => {
      const value = await readNativeTextSourceRendererModules();
      return { contents: args.path === nativeTextSourceCourse ? value.course.source : value.index.nodeSource, loader: 'js', resolveDir: value.assets };
    });
    build.onResolve({ filter: /^linkedom$/ }, async () => {
      const entry = path.join(pnpm, 'linkedom@0.18.13/node_modules/linkedom/esm/index.js');
      await fs.access(entry);
      return { path: pathToFileURL(entry).href, external: true };
    });
  } };
}
