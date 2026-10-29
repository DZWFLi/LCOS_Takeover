import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { transformNativeFirstTextScript as first, restoreNativeFirstTextScriptForComparison as restoreFirst } from '../lab/native-text-first-transform.mjs';
import { transformNativeTextActionsScript as actions, restoreNativeTextActionsScriptForComparison as restoreActions } from '../lab/native-text-actions-transform.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
const file = 'course-api-base-url-CifxI1ia.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + file, import.meta.url), 'utf8');
const input = first(file, original), output = actions(file, input);
assert.equal(actions(file, output), output); assert.equal(actions('other.js', 'unchanged'), 'unchanged');
assert.equal(restoreActions(file, output), input, 'only provider wrappers and original rBe tools input change; every other byte remains');
assert.equal(restoreFirst(file, restoreActions(file, output)), original, 'combined original-node/text/actions transform is exactly reversible');
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); };
const parsed = parse(output, file), calls = [];
walk(parsed, node => { if (node.type === 'CallExpression' && node.arguments[0]?.name === 'LCOSNativeTextNodeOwner') calls.push(node); });
assert.equal(calls.length, 2);
const fn = (source, name) => { const p = parse(source, file), values = []; walk(p, n => {
  if (n.type === 'FunctionDeclaration' && n.id?.name === name || n.type === 'VariableDeclarator' && n.id?.name === name) values.push(n);
}); assert.equal(values.length, 1, name); return source.slice(values[0].start, values[0].end); };
for (const name of ['n4', 'ua', 'iBe', 'xl', 'zde', 'JT', 'Vde', 'Hde', 't4', 'JU'])
  assert.equal(fn(output, name), fn(input, name), 'original visibility/zoom/actions/edit/generative input unchanged: ' + name);
assert.throws(() => actions(file, input.replace(fn(input, 'rBe'), fn(input, 'rBe').replace('tools:n', 'tools:other'))), /tools input changed|seam changed/);
assert.throws(() => actions(file, input.replace('rBe({nodeTitle:e,...t})', 'rBe({nodeTitle:e,...other})')), /node policy changed/);
const report = { passed: true, scope: 'actual original AST and byte preservation; no candidate runtime or GUI claimed',
  cases: ['two per-occurrence DOM-free providers', 'one original rBe tools handoff', 'n4/ua/iBe/xl/zde/JT/Vde/Hde/t4/JU exact source preserved',
    'all non-seam source exactly restored', 'idempotence and drift refusal'], secondToolbar: false, candidateWrites: 0 };
await mkdir(new URL('../output/原生文本整合_20261017e/', import.meta.url), { recursive: true });
await writeFile(new URL('../output/原生文本整合_20261017e/原动作链接线测试.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
