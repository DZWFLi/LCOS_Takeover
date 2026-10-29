import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeFirstTextScript } from '../lab/native-text-first-transform.mjs';
import { transformNativeTextActionsScript } from '../lab/native-text-actions-transform.mjs';
import { transformNativeFileUploadScript } from '../lab/native-file-upload-transform.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

// Preserve the earlier failing-route report; current-source reruns write a
// separate reading-only result instead of overwriting that historical evidence.
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'output/原生文件Drop整合_20261017i/文本上传阅读链当前事实.json');
const read = async file => readCurrentGen2Resource(path.join(root, file))?.contents ?? await fs.readFile(path.join(root, file), 'utf8');
const find = (node, test) => { const out = []; const visit = n => { if (!n?.type) return; if (test(n)) out.push(n); for (const value of Object.values(n)) {
  if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
} }; visit(node); assert.equal(out.length, 1); return out[0]; };
const name = 'course-api-base-url-CifxI1ia.js';
const original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', name), 'utf8');
const transformed = transformNativeFileUploadScript(name, transformNativeTextActionsScript(name, transformNativeFirstTextScript(name, original)));
const ast = parse(transformed, name), router = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'o4');
const route = find(router, node => node.type === 'VariableDeclarator' && node.id?.name === 't').init;
const expression = transformed.slice(route.start, route.end);
const evaluateRoute = new Function('e', 'Ck', 'LCOSHasNativeFileMarker', 'return (' + expression + ');');
const ref = { version: 1, entityType: 'view', entityId: 'view', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision' };
const pinned = evaluateRoute({ data: { text: '# text', lcos_ref: ref } }, { PURE: 'pure', GENERATE: 'generate' }, () => false);
const primary = evaluateRoute({ data: { text: '# text', lcos_ref: { ...ref, entityType: 'artifact', entityId: 'artifact' } } }, { PURE: 'pure', GENERATE: 'generate' }, () => false);
assert.equal(pinned, 'pure'); assert.equal(primary, 'pure');
const port = await read('lab/native-text-save-port.js'), portAst = parse(port, 'native-text-save-port.js');
const primaryRef = find(portAst, node => node.type === 'FunctionDeclaration' && node.id?.name === 'primaryRef');
const record = find(portAst, node => node.type === 'FunctionDeclaration' && node.id?.name === 'record');
const nonEmpty = find(portAst, node => node.type === 'FunctionDeclaration' && node.id?.name === 'nonEmpty');
const primaryPolicy = new Function([record, nonEmpty, primaryRef].map(node => port.slice(node.start, node.end)).join('\n') + ';return primaryRef;')();
assert.equal(primaryPolicy({ data: { lcos_ref: ref } }), null);
assert.ok(primaryPolicy({ data: { lcos_ref: { ...ref, entityType: 'artifact', entityId: 'artifact' } } }));
const evidence = [];
const anchor = async (file, needle, finding) => {
  const source = await read(file), at = source.indexOf(needle); assert.ok(at >= 0, file + ': ' + needle);
  evidence.push({ file, line: source.slice(0, at).split('\n').length, needle, finding });
};
await anchor('lab/pilot/native-material-placement.ts', "referenceKind: 'explicit_additional'", 'first placement creates a pinned additional View');
await anchor('lab/pilot/native-material-placement.ts', "entityType: 'view', entityId: facts.viewId", 'projector emits a View binding');
await anchor('lab/pilot/native-text-first-ui.tsx', "if (!ref || ref.entityType !== 'artifact'", 'node owner skips primary text GET for a View');
await anchor('lab/pilot/native-text-first-ui.tsx', "eligible: ref?.entityType === 'artifact'", 'View has no primary editing/mindmap more menu eligibility');
await anchor('lab/pilot/native-text-first-ui.tsx', "tooltip: '阅读正文'", 'the original fullscreen slot opens the exact version reader');
await anchor('lab/pilot/surface-core-facade.ts', "if (bodyChanged && (await referenceForNode(canvasId, patch.id))?.entityType === 'view')", 'View body edits explicitly rejected before Core write');
await anchor('lcos/apps/local-core/src/canvas-text-service.ts', "const artifact = binding.entityType === 'artifact'", 'Core canvas-text reader only admits Artifact binding');
await anchor('lcos/apps/local-core/src/metadata-repository.ts', "UPDATE artifact_views SET revision_id = ? WHERE artifact_id = ?", 'existing managed-text revision commit advances all Artifact Views, so do not bypass pinned protection');
await anchor('lcos/apps/local-core/src/metadata-repository.ts', "const managed = value.managed === false", 'missing imported managed flag is normalized; absence alone is not an unsupported-text proof');
const report = { at: new Date().toISOString(), scope: 'local source + pure actual-expression evaluation only; no candidate/browser/network/Core/model operations',
  pinnedTextRouteWithoutDataType: pinned, primaryTextRoute: primary, savePortAcceptsPinnedView: false,
  conclusion: 'pinned Text uses the original Pure reading face; it remains a version View and cannot bypass primary text-save protection', evidence };
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }));
