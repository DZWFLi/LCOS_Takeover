import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countAgentNodeReactFlowRoots,
  parseOriginalDonorScript,
  transformAgentNodeScript,
} from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformNativeTextScript, restoreNativeTextScriptForComparison } from '../lab/native-text-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import {
  restoreNativeImageTitleScriptForComparison,
  transformNativeImageTitleScript,
} from '../lab/native-image-title-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const filename = 'course-api-base-url-CifxI1ia.js';
const source = fs.readFileSync(path.join(assets, filename), 'utf8');
const transformed = transformNativeImageTitleScript(filename, source);

assert.equal(restoreNativeImageTitleScriptForComparison(filename, transformed), source,
  'restoring the exact header title expression and owned import reproduces every original source byte');
assert.equal(transformNativeImageTitleScript(filename, transformed), transformed,
  'the named header-only title transform is idempotent');
assert.equal(transformNativeImageTitleScript('unrelated-canvas.js', source), source,
  'non-target scripts pass through byte-for-byte');
assert.throws(() => transformNativeImageTitleScript(filename,
  source.replace('y?.title||o||"Title"', 'y?.label||o||"Title"')),
/title fallback|seam changed/,
'a changed original data-title fallback is refused');
assert.throws(() => transformNativeImageTitleScript(filename,
  transformed.replace('import{LCOSUseNativeImageTitle}from"/lcos/agent-ui.js";\n', '')),
/partially installed/,
'a surviving replacement call without its named import is refused');
assert.throws(() => transformNativeImageTitleScript(filename,
  transformed.replace('LCOSUseNativeImageTitle(v,y,', 'LCOSUseNativeImageTitle(v,otherData,')),
/arguments drifted/,
'a stale/miswired node data argument is refused');
assert.equal(fs.readFileSync(path.join(assets, filename), 'utf8'), source,
  'the installed TapNow vendor reference source remains unchanged');

function walk(rootNode, visit) {
  const pending = [rootNode];
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

function nodesMatching(rootNode, predicate) {
  const found = [];
  walk(rootNode, node => { if (predicate(node)) found.push(node); });
  return found;
}

function one(items, label) {
  assert.equal(items.length, 1, `expected one exact ${label}`);
  return items[0];
}

const program = parseOriginalDonorScript(source, filename);
const transformedProgram = parseOriginalDonorScript(transformed, filename);
const xie = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'Xie'), 'shared Canvas node shell');
const xieParam = xie.init.params[0];
assert.equal(xieParam.type, 'Identifier');
const xieDestructure = one(nodesMatching(xie.init.body, node => node.type === 'VariableDeclarator'
  && node.id?.type === 'ObjectPattern' && node.init?.name === xieParam.name), 'original shell prop destructure');
const bindings = Object.fromEntries(xieDestructure.id.properties
  .filter(property => property.type === 'ObjectProperty')
  .map(property => [property.key.name, property.value.name]));
assert.deepEqual({ id: bindings.id, data: bindings.data, defaultTitle: bindings.defaultTitle },
  { id: 'v', data: 'y', defaultTitle: 'o' },
  'the helper call inputs are derived from Xie original props, not guessed from a screenshot');

const transformedXie = one(nodesMatching(transformedProgram, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'Xie'), 'transformed shared Canvas node shell');
const titleBinding = one(nodesMatching(transformedXie.init.body, node => node.type === 'VariableDeclarator'
  && node.id?.name === '$'), 'shared title computation');
assert.equal(titleBinding.init.callee?.name, 'LCOSUseNativeImageTitle');
assert.deepEqual(titleBinding.init.arguments.slice(0, 2).map(argument => argument.name), ['v', 'y']);
assert.equal(titleBinding.init.arguments.length, 3, 'the exact original data/default/string fallback stays an argument');
assert.ok(nodesMatching(transformedXie.init.body, node => node.type === 'CallExpression'
  && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'jsx'
  && node.arguments[0]?.name === 'h5').length,
'the original h5/Aie title component remains the header owner');
const titleStatementIndex = transformedXie.init.body.body.findIndex(statement => statement.type === 'VariableDeclaration'
  && statement.declarations.some(declaration => declaration.id?.name === '$'));
const firstReturnIndex = transformedXie.init.body.body.findIndex(statement => statement.type === 'ReturnStatement');
assert.equal(titleStatementIndex, 0, 'Xie computes the title in its first unconditional function-body statement');
assert.equal(firstReturnIndex, 1, 'Xie has no conditional early return before the helper call');
assert.equal(transformedXie.init.body.body[0].type, 'VariableDeclaration');
assert.equal(titleBinding.init.type, 'CallExpression', 'the hook is directly invoked, not conditionally short-circuited');
assert.equal(transformedXie.init.body.body.slice(0, titleStatementIndex)
  .some(statement => ['IfStatement', 'ReturnStatement', 'SwitchStatement', 'ConditionalExpression'].includes(statement.type)), false,
'the new hook runs for every render of the shared Xie shell, including non-image node types');

const readOnlyTitle = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === '_ie'), 'original read-only header leaf');
assert.ok(nodesMatching(readOnlyTitle.init.body, node => node.type === 'CallExpression'
  && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'jsx'
  && node.arguments[0]?.type === 'StringLiteral' && node.arguments[0].value === 'span').length,
'the original truncated text span remains the read-only header presentation');

const imageRegistry = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'zVe'), 'original node type registry');
const registeredImage = one(imageRegistry.init.properties.filter(property => property.computed
  && property.key?.type === 'MemberExpression' && property.key.object?.name === 'ye'
  && property.key.property?.name === 'IMAGE'), 'original image node registration');
assert.equal(registeredImage.value.callee?.property?.name, 'memo');
assert.equal(registeredImage.value.arguments[0]?.name, 'lBe', 'the registry sends IMAGE nodes through the original lBe shell');
const imageShell = one(nodesMatching(program, node => node.type === 'FunctionDeclaration'
  && node.id?.name === 'lBe'), 'original image node shell');
assert.ok(nodesMatching(imageShell.body, node => node.type === 'CallExpression'
  && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'jsx'
  && node.arguments[0]?.name === 'bU').length,
'lBe retains the original ImageNode dispatcher');
const imageDispatcher = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'bU'), 'original ImageNode dispatcher');
const imageModes = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'Z2e'), 'original image mode registry');
assert.ok(imageModes.init.properties.some(property => property.key?.property?.name === 'DEFAULT'
  && property.value?.name === 'Jy'));
assert.ok(imageModes.init.properties.some(property => property.key?.property?.name === 'GENERATE'
  && property.value?.name === 'Jy'));
assert.ok(nodesMatching(imageDispatcher.init, node => node.type === 'LogicalExpression'
  && node.right?.name === 'Jy').length, 'the dispatcher preserves its original default-renderer fallback');
const defaultImageRenderer = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'Jy'), 'original default image renderer');
assert.ok(nodesMatching(defaultImageRenderer.init, node => node.type === 'CallExpression'
  && node.callee?.type === 'MemberExpression' && ['jsx', 'jsxs'].includes(node.callee.property?.name)
  && node.arguments[0]?.name === 'wr').length,
'the original GenerateImageNode enters the shared Xie header shell');

const courseExports = one(program.body.filter(node => node.type === 'ExportNamedDeclaration'), 'course module export table');
assert.ok(courseExports.specifiers.some(specifier => specifier.local?.name === 'zVe'
  && specifier.exported?.name === 'v'), 'the exact node registry is exported from the installed course chunk');
const pageName = 'page-Da_DfwiK.js';
const pageSource = fs.readFileSync(path.join(assets, pageName), 'utf8');
const page = parseOriginalDonorScript(pageSource, pageName);
const courseImport = one(page.body.filter(node => node.type === 'ImportDeclaration'
  && node.source?.value === './course-api-base-url-CifxI1ia.js'), 'page import of the installed course chunk');
const registryImport = one(courseImport.specifiers.filter(specifier => specifier.imported?.name === 'v'),
  'page import of original image-capable node registry');
assert.equal(registryImport.local.name, 'oj');
assert.ok(nodesMatching(page, node => node.type === 'ObjectProperty' && node.key?.name === 'nodeTypes'
  && node.value?.name === 'oj').length,
'the actual page passes the imported original registry to its ReactFlow nodeTypes');

// Re-run the actual adopted serve chain in its production order. The page side
// owns startup/cut/bridge/dock/history/Agent; the course side owns text then
// image title. Both final vendor chunks are parsed, and image removal must
// return exactly to the preceding text-transformed source.
let servedPage = transformRendererScript(pageName, pageSource);
servedPage = transformCutScript(pageName, servedPage);
servedPage = transformNodeBridgeScript(pageName, servedPage)
  .replace('VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin');
servedPage = transformSurfaceDockScript(pageName, servedPage);
servedPage = transformHistoryIntentScript(pageName, servedPage);
servedPage = transformAgentNodeScript(pageName, servedPage);
parseOriginalDonorScript(servedPage, pageName);
assert.equal(countAgentNodeReactFlowRoots(servedPage, pageName), 1,
  'the full page chain preserves the original single ReactFlow root');

const courseAfterText = transformNativeTextScript(filename, source);
const courseAfterImage = transformNativeImageTitleScript(filename, courseAfterText);
parseOriginalDonorScript(courseAfterText, filename);
parseOriginalDonorScript(courseAfterImage, filename);
assert.equal(restoreNativeImageTitleScriptForComparison(filename, courseAfterImage), courseAfterText,
  'the image-title transform restores byte-exactly to the prior text-transformed course chunk');
assert.equal(restoreNativeTextScriptForComparison(filename, courseAfterText), source,
  'the pre-existing text transform still restores its exact original course source');

console.log(JSON.stringify({
  passed: true,
  scope: 'read-only AST/source transform; TapNow installed vendor bytes unchanged; no service or GUI',
  seam: 'Xie data.title || defaultTitle || "Title" → LCOSUseNativeImageTitle(nodeId,data,originalFallback) → original h5/Aie/_ie',
  originalImagePath: 'page nodeTypes:oj → course export v/zVe[ye.IMAGE] → lBe → bU → Z2e[DEFAULT|GENERATE] → Jy → wr/Xie',
  headerDataOwner: 'image node data.title precedes Image/default fallback',
  originalDomAndImageRendererPreserved: true,
  exactRestoreIdempotenceDriftAndNonTarget: true,
  sharedShellHookUnconditionalBeforeReturn: true,
  fullPageServeChainParsed: true,
  imageRestoresToPreviousTextTransform: true,
  sourceFileUnchanged: true,
}, null, 2));
