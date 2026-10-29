import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [hostCss, nativeTextUi, canonicalTokens, tokenAdapter, originalTextFacesCss] = await Promise.all([
  readFile(path.join(root, 'lab/pilot/native-text-host.css'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-text-ui.tsx'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/lcos-tokens.css'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-lcos-token-adapter.css'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/text/text-faces.css'), 'utf8'),
]);

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const source = withoutComments(hostCss);
const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
  .map((match) => ({ selector: match[1].trim(), body: match[2] }));
const hostRule = rules.find((rule) => rule.selector === '.lcos-native-text-host');
assert.ok(hostRule, 'Legacy aliases must be scoped to the native text host.');
const editorRule = rules.find((rule) => rule.selector === '.lcos-native-text-host .lcos-inline-text-editor');
const actionsRule = rules.find((rule) => rule.selector === '.lcos-native-text-host .lcos-inline-text-actions');
assert.ok(editorRule, 'The inline editor containment adjustment must stay under the native text host.');
assert.ok(actionsRule, 'The original save/cancel bar adjustment must stay under the native text host.');
assert.match(nativeTextUi, /import ['"]\.\/native-text-host\.css['"]/, 'The host bridge must be loaded by the native text module.');

function declarations(block) {
  return Object.fromEntries([...block.matchAll(/(?:^|[;\s])([\w-]+)\s*:\s*([^;]+);/g)]
    .map((match) => [match[1], match[2].trim()]));
}

function tokenBlock(selector) {
  const canonical = withoutComments(canonicalTokens);
  const index = canonical.indexOf(selector);
  assert.notEqual(index, -1, `Canonical token owner omitted ${selector}.`);
  const open = canonical.indexOf('{', index);
  const close = canonical.indexOf('}', open + 1);
  assert.ok(open >= 0 && close > open, `Could not read canonical ${selector} tokens.`);
  return declarations(canonical.slice(open + 1, close));
}

const aliases = declarations(hostRule.body);
const expectedAliases = {
  '--bg-surface': 'var(--gen2-surface)',
  '--lcos-surface': 'var(--gen2-surface)',
  '--fg-default': 'var(--gen2-text)',
  '--fg-muted': 'var(--gen2-muted)',
  '--edge-default': 'var(--gen2-border)',
  '--color-surface': 'var(--gen2-surface)',
  '--color-bg-default': 'var(--gen2-canvas)',
  '--color-info': 'var(--gen2-accent)',
  '--color-edge-default': 'var(--gen2-border)',
  color: 'var(--gen2-text)',
};
for (const [name, value] of Object.entries(expectedAliases)) {
  assert.equal(aliases[name], value, `${name} must resolve through the existing canonical Gen2 token.`);
}

for (const selector of [':root', '.dark']) {
  const canonical = tokenBlock(selector);
  for (const name of ['--gen2-surface', '--gen2-canvas', '--gen2-text', '--gen2-muted', '--gen2-border', '--gen2-accent']) {
    assert.ok(canonical[name], `${selector} must define ${name} for the host alias.`);
  }
}

assert.match(originalTextFacesCss, /\.lcos-text-mindmap-root\s*,\s*\.lcos-text-mindmap-node[^{}]*\{[^{}]*background:\s*var\(--color-surface,\s*#fff\)/s,
  'The original mind-map preview consumes the legacy surface alias that otherwise falls back to white.');
assert.match(originalTextFacesCss, /\.lcos-text-face-tabs\s*\[aria-selected="true"\][^{}]*\{[^{}]*background:\s*var\(--color-bg-default\)[^{}]*color:\s*var\(--color-info\)/,
  'The original selected face tab consumes legacy background and accent aliases.');
assert.match(originalTextFacesCss, /\.lcos-text-mindmap-root[^{}]*\{[^{}]*border-color:\s*var\(--color-edge-default\)/,
  'The original mind-map root outline consumes the legacy edge alias.');

const editorContainment = declarations(editorRule.body);
assert.equal(editorContainment['box-sizing'], 'border-box');
assert.equal(editorContainment['padding-bottom'], '8px');
const actionContainment = declarations(actionsRule.body);
assert.equal(actionContainment.bottom, '0', 'Keep save/cancel within the editor scrollport.');
assert.deepEqual(Object.keys(actionContainment), ['bottom'], 'Only adjust the original sticky row inset, not its positioning or stacking model.');
for (const body of [editorRule.body, actionsRule.body]) {
  assert.doesNotMatch(body, /(?:^|[;\s])(?:width|height|transform|left|right|top)\s*:/,
    'Containment may not alter Canvas node geometry or relocate the editor.');
}

assert.doesNotMatch(hostRule.body, /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch|color-mix)\s*\(/i,
  'The host bridge must not introduce a parallel palette.');
assert.equal(rules.filter((rule) => rule.selector === '.lcos-native-text-host').length, 1);
assert.doesNotMatch(source, /(?:^|[\n,])\s*(?:html|body|:root|#root|\*)\s*[{,]/,
  'The text bridge must not alter the TapNow page shell.');
assert.match(tokenAdapter, /\.lcos-native-text-host/, 'The LCOS token adapter must provide Gen2 values to this host.');
assert.equal((tokenAdapter.match(/\[data-lcos-map-editor\]/g) ?? []).length, 2,
  'The original body portal needs both existing light and dark token scopes.');
const mapRule = rules.find(rule => rule.selector === '[data-lcos-map-editor].mindmap-editor');
assert.deepEqual(declarations(mapRule?.body ?? ''), {
  '--color-surface': 'var(--gen2-surface)', '--color-bg-default': 'var(--gen2-raised)',
  '--color-edge-default': 'var(--gen2-border)', color: 'var(--gen2-text)',
}, 'The map portal aliases existing tokens, not a parallel palette.');
const iconRule = rules.find(rule => rule.selector === '[data-lcos-map-editor].mindmap-editor .inline-note-editor-hud svg');
assert.deepEqual(declarations(iconRule?.body ?? ''), { width: '13px', height: '13px', 'min-height': '0' },
  'Only action icons escape the original full-stage SVG sizing.');
const linkRule = rules.find(rule => rule.selector === '[data-lcos-map-editor].mindmap-editor .lcos-mindmap-link');
assert.deepEqual(declarations(linkRule?.body ?? ''), { fill: 'none', stroke: 'var(--gen2-muted)', 'stroke-width': '1.5px' },
  'Original curve geometry stays unchanged; render it as a stroke, not a filled wedge.');

console.log(JSON.stringify({
  mode: 'native-text-host-legacy-token-bridge',
  passed: true,
  hostScopedAliases: Object.keys(expectedAliases),
  hostScopedContainment: ['.lcos-inline-text-editor box-sizing:border-box', '.lcos-inline-text-actions bottom:0; sticky owner retained'],
  originalMindMapLegacyConsumers: ['--color-surface', '--color-bg-default', '--color-info', '--color-edge-default'],
  lightAndDarkGen2OwnersPresent: true,
  parallelPalette: false,
  pageShellSelectors: 0,
}, null, 2));
