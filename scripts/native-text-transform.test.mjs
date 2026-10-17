import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformNativeTextScript, restoreNativeTextScriptForComparison } from '../lab/native-text-transform.mjs';
import { transformNativeDensityHook } from '../lab/native-density-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = 'course-api-base-url-CifxI1ia.js';
const source = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
const transformed = transformNativeTextScript(filename, source);
assert.equal(restoreNativeTextScriptForComparison(filename, transformed), source,
  'only two Markdown children, the policy-preserving edit delegation and named import differ; original menus, handles and containers are byte-for-byte unchanged');
assert.equal(transformNativeTextScript(filename, transformed), transformed);
assert.equal(transformNativeTextScript('unrelated.js', source), source);
assert.throws(() => transformNativeTextScript(filename, source.replace('children:a.jsx(e4,{markdown:u,editable:h,selected:n===!0,onEdit:p})',
  'children:a.jsx(e4,{markdown:u,editable:h,selected:n===!0,onEdit:p,unexpected:true})')), /body props changed/);
assert.throws(() => transformNativeTextScript(filename, transformed.replace('import{LCOSNativeTextBodySlot,', 'import{OtherSlot,')), /partially installed/);
assert.throws(() => transformNativeTextScript(filename, source.replace('t||n(e,{mode:"edit"})', 'n(e,{mode:"edit"})')), /disabled edit policy/);
assert.throws(() => transformNativeTextScript(filename, transformed.replace(',LCOSRequestNativeTextEdit}from', '}from')), /partially installed/);

const density = fs.readFileSync(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/useLcosDensity.ts'), 'utf8');
const mapped = transformNativeDensityHook(density);
assert.equal(mapped.replace("from '/lcos/native-flow.js'", "from '@xyflow/react'"), density,
  'mature density logic is untouched; only existing Flow-hook ownership changes');
assert.equal(transformNativeDensityHook(mapped), mapped);
assert.throws(() => transformNativeDensityHook(density.replace('useStore, useViewport', 'useOtherStore, useViewport')), /seam changed/);
console.log(JSON.stringify({ passed: true, scope: 'actual donor AST/source seams only; not deployed and not GUI acceptance',
  cases: ['pure and generative original text shells retained', 'policy-preserving original toolbar command delegation',
    'exact original source restore', 'idempotence and drift refusal', 'mature density hook import mapped without a second Flow provider'] }, null, 2));
