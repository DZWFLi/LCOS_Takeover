const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const cacheRoot = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const bundle = fs.readdirSync(cacheRoot).map(name => path.join(cacheRoot, name, 'node_modules', 'playwright', 'lib', 'transform', 'babelBundle.js')).find(file => fs.existsSync(file));
if (!bundle) throw new Error('Use an already installed Playwright/Babel cache; this probe never downloads dependencies.');
const babel = require(bundle);
const sourceFile = path.join(root, 'reference', 'tapnow-installed', 'resources', 'web', 'assets', 'index-BAQXnPag.js');
const source = fs.readFileSync(sourceFile, 'utf8');
const startedAt = new Date().toISOString();
let start = performance.now();
let ast = babel.babelParse(source, sourceFile, true);
const parseMs = performance.now() - start;
const counts = {}, stack = [ast];
let nodes = 0;
while (stack.length) {
  const node = stack.pop(); if (!node || typeof node.type !== 'string') continue;
  nodes++; counts[node.type] = (counts[node.type] || 0) + 1;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) { if (child && typeof child.type === 'string') stack.push(child); }
    else if (value && typeof value.type === 'string') stack.push(value);
  }
}
const entry = ast.program || ast;
const topLevelFunctions = entry.body.filter(node => node.type === 'FunctionDeclaration').map(node => ({ name: node.id?.name, start: node.start, end: node.end }));
ast = null;
if (global.gc) global.gc();
start = performance.now();
const formatted = babel.babelTransform(source, sourceFile, true, []);
const formatMs = performance.now() - start;
// This is only a map back to the already-compiled JS, never an original TSX map.
const code = formatted.code.replace(/\n\/\/# sourceMappingURL=data:[^\n]+\s*$/, '') + '\n';
const outputRoot = path.join(root, 'lab', 'decompiled');
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'index-readable.js'), code);
const evidence = {
  workspace: 'LCOS-DSH-03', startedAt, finishedAt: new Date().toISOString(),
  tool: 'already-cached Playwright Babel parser/generator; no vendor code executed',
  inputBytes: Buffer.byteLength(source), inputLines: source.split('\n').length,
  parseMs, formatMs, outputBytes: Buffer.byteLength(code), outputLines: code.split('\n').length,
  astNodes: nodes, nodeTypes: counts, topLevelFunctionCount: topLevelFunctions.length,
  seamFunctions: topLevelFunctions.filter(item => ['hFl', 'rht', 'p0s', 'BDl', 'WRl', 'e2r', 'rPl', 'aPl'].includes(item.name)),
  originalNamesRestored: false, originalTypesRestored: false, originalTsxRestored: false,
  sourceFileBoundariesRestored: false, cloudBackendRecovered: false,
  limitations: 'Mechanical parsing and pretty-printing only. No runtime equivalence or complete decompilation was claimed.'
};
fs.writeFileSync(path.join(root, 'evidence', 'decompile-probe.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ inputBytes: evidence.inputBytes, parseMs, formatMs, outputBytes: evidence.outputBytes,
  outputLines: evidence.outputLines, astNodes: nodes, topLevelFunctionCount: topLevelFunctions.length,
  originalTsxRestored: false }, null, 2));
