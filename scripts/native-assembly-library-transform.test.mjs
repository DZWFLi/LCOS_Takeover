import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { restoreNativeAssemblyLibraryScriptForComparison, transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = 'page-Da_DfwiK.js';
const source = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
const transformed = transformNativeAssemblyLibraryScript(filename, source);
const walk = node => { const result = []; const pending = [node]; while (pending.length) { const item = pending.pop();
  if (!item?.type) continue; result.push(item); for (const value of Object.values(item)) {
    if (Array.isArray(value)) pending.push(...value.filter(child => child?.type)); else if (value?.type) pending.push(value);
  } } return result; };
const one = (items, label) => { assert.equal(items.length, 1, label); return items[0]; };
const key = node => node?.name ?? node?.value;
const prop = (object, name) => object.properties.find(row => key(row.key) === name)?.value;
const jsx = (node, name) => node.type === 'CallExpression' && node.callee?.object?.name === 'r'
  && ['jsx', 'jsxs'].includes(node.callee.property?.name) && key(node.arguments[0]) === name;
const original = parseOriginalDonorScript(source, filename), installed = parseOriginalDonorScript(transformed, filename);
const binding = (program, name) => { const found = one(walk(program).filter(node => ['VariableDeclarator', 'FunctionDeclaration'].includes(node.type) && node.id?.name === name), name); return found.init ?? found; };
const text = (input, node) => input.slice(node.start, node.end);
assert.equal(restoreNativeAssemblyLibraryScriptForComparison(filename, transformed, source), source);
assert.equal(transformNativeAssemblyLibraryScript(filename, transformed), transformed);
assert.equal(transformNativeAssemblyLibraryScript('other.js', source), source);
assert.equal(fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8'), source);

const isLibrary = node => node.type === 'CallExpression' && node.arguments[1]?.type === 'ObjectExpression' && prop(node.arguments[1], 'data-library-view')?.value === 'library';
const originalView = one(walk(binding(original, 'jF')).filter(isLibrary), 'original Library');
const installedView = one(walk(binding(installed, 'jF')).filter(isLibrary), 'installed Library');
assert.equal(text(transformed, installedView), text(source, originalView),
  'Library header, space switch, search, list and favorites remain byte-for-byte; no inspector is inserted');
const row = binding(installed, 'Zp');
const leaf = one(walk(row).filter(node => jsx(node, 'LCOSNativeAssemblyTools')), 'one adapter inside original row preview');
assert.equal(prop(leaf.arguments[1], 'detail').name, 'T');
assert.equal(prop(leaf.arguments[1], 'onApply').name, 'g');
assert.equal(prop(leaf.arguments[1], 'NativePreview').name, 'TS');
assert.equal(prop(leaf.arguments[1], 'NativeButton').name, 'em');
assert.ok(prop(leaf.arguments[1], 'onClose'), 'original Popover close callback is retained');
assert.equal(walk(row).filter(node => node.callee?.name === 'LCOSNativeAssemblyOpen').length, 2,
  'mouse and keyboard actions open the original Popover for Core materials');
assert.equal(walk(row).filter(node => node.callee?.name === 'g').length, 2,
  'ordinary assets and pinned location rows retain original Apply callbacks');
const nativeApply = one(walk(binding(installed, 'jF')).filter(node => node.type === 'VariableDeclarator' && node.id?.name === 'ut'), 'original Apply callback').init.arguments[0];
assert.equal(nativeApply.body.body[0].test.callee.name, 'LCOSNativeAssemblyOpen');
assert.equal(nativeApply.body.body.length, 3, 'ordinary asset insertion survives the Core-specific early return');
const preview = binding(installed, 'TS');
assert.equal(prop(preview.params[0], 'lcosActions').name, 'LCOSActions');
const action = one(walk(preview).filter(node => node.type === 'ConditionalExpression' && node.test?.callee?.name === 'LCOSIsPinnedAssemblyDetail'), 'pinned action slot');
assert.equal(action.consequent.name, 'LCOSActions');
assert.ok(jsx(action.alternate, 'button'), 'ordinary assets keep original Apply button');
const refresh = one(walk(installed).filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'sU'), 'detail state hook');
assert.equal(walk(refresh).filter(node => node.type === 'IfStatement' && node.test?.callee?.name === 'LCOSIsPinnedAssemblyDetail').length, 1,
  'pinned exact-version bytes cannot be replaced by vendor Current refresh');
for (const name of ['IS', 'CU', 'LS', 'QU', 'sF', 'em']) {
  assert.equal(text(transformed, binding(installed, name)), text(source, binding(original, name)), `${name} remains original`);
}
assert.throws(() => transformNativeAssemblyLibraryScript(filename, source.replace('bt&&Ye(bt)', 'bt&&Other(bt)')), /ut no longer follows|seam changed/);
assert.throws(() => transformNativeAssemblyLibraryScript(filename, transformed.replace('pinned_revision===true', 'pinned_revision===false')), /validator changed/);
assert.throws(() => transformNativeAssemblyLibraryScript(filename, transformed.replace('LCOSNativeAssemblyOpen(oe)', 'LCOSNativeAssemblyOpen(otherDetail)')), /full detail|seam changed/);
assert.throws(() => restoreNativeAssemblyLibraryScriptForComparison(filename, transformed, source + ' '), /exact reversible output/);
console.log(JSON.stringify({ passed: true, flow: 'jF unchanged → CU/Zp original row → original Popover → TS preview/action slot', exactVersionProtected: true, ordinaryAssetApplyPreserved: true }, null, 2));
