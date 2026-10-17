import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformAgentNodeScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';
import { transformNativeFirstTextScript } from '../lab/native-text-first-transform.mjs';
import { transformNativeMaterialRailScript, restoreNativeMaterialRailScriptForComparison }
  from '../lab/native-material-rail-transform.mjs';
import { transformNativePileCollectionScript } from '../lab/native-pile-collection-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = 'page-Da_DfwiK.js';
const original = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');

// Mirrors serveStatic when --full-integration --native-rail-pilot are active.
// Those flags also select nativeFirstText/nativePile and skip NativeImageTitle.
let source = transformRendererScript(filename, original);
source = transformCutScript(filename, source);
source = transformNodeBridgeScript(filename, source)
  .replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin');
source = transformSurfaceDockScript(filename, source);
source = transformHistoryIntentScript(filename, source);
source = transformAgentNodeScript(filename, source);
source = transformNativeFirstTextScript(filename, source);
source = transformNativePileCollectionScript(filename, source);
const postAssembly = transformNativeAssemblyLibraryScript(filename, source);
const transformed = transformNativeMaterialRailScript(filename, postAssembly);

assert.equal(transformNativeMaterialRailScript(filename, transformed), transformed,
  'Rail validates the complete installed state and remains idempotent after the full server chain');
assert.equal(restoreNativeMaterialRailScriptForComparison(filename, transformed, postAssembly), postAssembly,
  'Rail restoration returns the exact post-Assembly source, not the original donor or an earlier stage');
assert.equal(transformNativeMaterialRailScript('unrelated-page.js', postAssembly), postAssembly,
  'non-target page scripts remain untouched');

const imports = text => {
  const program = parseOriginalDonorScript(text, filename);
  return program.body.filter(node => node.type === 'ImportDeclaration')
    .map(node => text.slice(node.start, node.end));
};
assert.deepEqual(imports(transformed), imports(postAssembly),
  'Rail preserves all imports byte-for-byte, including both earlier Agent and Assembly imports');

const assemblyImportSource = 'import{LCOSNativeAssemblyOpen,LCOSNativeAssemblyTools}from"/lcos/agent-ui.js";';
const agentImportSource = 'import{LCOSConversationNode,LCOSExecutionNode,LCOSResultMaterialNode,LCOSCollectionNode,LCOSConnectedConversationPanel,LCOSProfessionalHost}from"/lcos/agent-ui.js";';
assert.ok(postAssembly.includes(assemblyImportSource), 'the Assembly transform owns its exact two-specifier import');
assert.ok(postAssembly.includes(agentImportSource), 'the earlier Agent transform retains its separate shared-module import');
assert.equal((postAssembly.match(/from"\/lcos\/agent-ui\.js"/g) || []).length, 2,
  'the real chain has two imports from agent-ui.js; they are not interchangeable');

const duplicateOwnedImport = 'import{LCOSNativeAssemblyOpen as LCOSNativeAssemblyOpenDuplicate,LCOSNativeAssemblyTools as LCOSNativeAssemblyToolsDuplicate}from"/lcos/agent-ui.js";\n';
assert.throws(() => transformNativeMaterialRailScript(filename, duplicateOwnedImport + postAssembly),
  /expected one owned Assembly agent-ui import, got 2/,
  'the transform still refuses duplicate Assembly-owned imports while allowing the Agent import');

assert.equal(fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8'), original,
  'the installed TapNow reference remains read-only');

console.log(JSON.stringify({
  passed: true,
  layers: ['startup', 'cut', 'nodebridge', 'surfaceDock', 'history', 'agent', 'nativeFirstText', 'nativePile', 'Assembly', 'Rail'],
  duplicateSharedImportsPreserved: true,
  railIdempotent: true,
  restoreIsExactPostAssembly: true,
}, null, 2));
