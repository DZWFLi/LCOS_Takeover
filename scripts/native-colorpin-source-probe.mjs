import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

// Static source probe only: no browser, bundle, Core request or donor execution.
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(installedRoot, 'package.json'));
const store = path.join(installedRoot, 'huabu/node_modules/.pnpm');
const traverse = require(path.join(store, fs.readdirSync(store).find(name => name.startsWith('@babel+traverse@')),
  'node_modules/@babel/traverse/lib/index.js')).default;
const output = path.join(root, 'output/原生库集合整合_20261017g/ColorPin原件源码摘录.json');
const requested = {
  'page-Da_DfwiK.js': ['w7', 'y7', 'm7', 'u7', 'p7', 'g7', 'd7', 'v7', 'h7'],
  'course-api-base-url-CifxI1ia.js': ['Foe', 'pBe', 'Mie', 'KT', 'pp', 'UVe', 'yBe', '_oe', 'Noe', 'Toe', 'Poe', 'Doe', 'Moe', 't5', 'Ioe', 'IGe', 'wM', 'n5', 'Jc', 'e5', 'Eoe', 'Dg', 'Hie', 'jie', 'Wie', 'zie', 'MF', 'Pie', 'Die', 'Iie', 'Roe'],
};
const report = { scope: 'Static parse of local original bundle; source evidence, no functional or candidate verification.', files: {} };
for (const [name, names] of Object.entries(requested)) {
  const filename = path.join(root, 'reference/tapnow-installed/resources/web/assets', name);
  const source = fs.readFileSync(filename, 'utf8');
  let program;
  traverse({ type: 'File', program: parseOriginalDonorScript(source, name) }, { Program(p) { program = p; p.stop(); } });
  const entries = {}, exports = {};
  for (const item of program.node.body) if (item.type === 'ExportNamedDeclaration')
    for (const specifier of item.specifiers) if (specifier.type === 'ExportSpecifier') exports[specifier.exported.name] = specifier.local.name;
  const requestedNames = new Set(names);
  for (const extra of (process.argv.find(value => value.startsWith('--extra='))?.slice(8) ?? '').split(',').filter(Boolean)) requestedNames.add(extra);
  if (name.startsWith('course-')) for (const key of ['dq', 'dr', 'di', 'dn']) if (exports[key]) requestedNames.add(exports[key]);
  const topOwner = p => {
    for (let cursor = p; cursor && cursor !== program; cursor = cursor.parentPath) {
      if (cursor.isVariableDeclarator() && cursor.node.id.type === 'Identifier' && program.scope.getBinding(cursor.node.id.name)?.path === cursor)
        return cursor.node.id.name;
      if (cursor.isFunctionDeclaration() && program.scope.getBinding(cursor.node.id?.name)?.path === cursor) return cursor.node.id.name;
    }
    return '(program)';
  };
  for (const name of requestedNames) {
    const binding = program.scope.getBinding(name);
    if (!binding) { entries[name] = { absent: true }; continue; }
    const node = binding.path.node;
    const refs = new Map();
    binding.path.traverse({ ReferencedIdentifier(p) {
      const b = p.scope.getBinding(p.node.name);
      if (b?.scope !== program.scope || refs.has(p.node.name)) return;
      refs.set(p.node.name, b.path.isImportSpecifier() ? { imported: b.path.node.imported.name, from: b.path.parent.source.value }
        : { type: b.path.node.type, start: b.path.node.start });
    } });
    entries[name] = { start: node.start, end: node.end, line: node.loc?.start.line, refs: Object.fromEntries(refs),
      callers: binding.referencePaths.map(p => ({ owner: topOwner(p), offset: p.node.start, context: source.slice(Math.max(0, p.node.start - 70), p.node.end + 100) })),
      source: source.slice(node.start, node.end) };
  }
  const occurrences = {};
  for (const term of ['color_pins', 'color_groups']) {
    occurrences[term] = []; let cursor = -1;
    while ((cursor = source.indexOf(term, cursor + 1)) >= 0)
      occurrences[term].push({ offset: cursor, context: source.slice(Math.max(0, cursor - 180), cursor + 260) });
  }
  report.files[name] = { filename, exports, entries, occurrences };
}
const indexFile = path.join(root, 'reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js');
const indexSource = fs.readFileSync(indexFile, 'utf8');
report.apiOwnerContexts = { filename: indexFile, entries: {} };
for (const key of ['getCanvasConfig:', 'updateCanvasConfig:', 'GET_CANVAS_CONFIG:', 'UPDATE_CANVAS_CONFIG:', 'u$l=']) {
  const offset = indexSource.indexOf(key);
  report.apiOwnerContexts.entries[key] = { offset, line: indexSource.slice(0, offset).split('\n').length,
    source: indexSource.slice(offset, offset + 270) };
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, owners: Object.fromEntries(Object.entries(report.files).map(([file, value]) =>
  [file, Object.fromEntries(Object.entries(value.entries).map(([name, entry]) => [name, { absent: entry.absent, start: entry.start, length: entry.source?.length }]))])) }, null, 2));
