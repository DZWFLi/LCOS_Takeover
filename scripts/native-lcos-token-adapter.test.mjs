import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [adapter, agentUi, canonicalTokens, canonicalLcosCss, nativeTextUi] = await Promise.all([
  readFile(path.join(root, 'lab/pilot/native-lcos-token-adapter.css'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-agent-ui.tsx'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/lcos-tokens.css'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/lcos.css'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-text-ui.tsx'), 'utf8'),
]);

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...withoutComments(adapter).matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
  .map((match) => ({ selector: match[1].trim(), body: match[2] }));

function ruleBody(css, selector) {
  const source = withoutComments(css);
  const selectorIndex = source.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `Canonical token owner omitted ${selector}.`);
  const open = source.indexOf('{', selectorIndex);
  const close = source.indexOf('}', open + 1);
  assert.ok(open >= 0 && close > open, `Could not read canonical ${selector} token block.`);
  return source.slice(open + 1, close);
}

function tokenValue(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`(?:^|[\\s;])${escaped}\\s*:\\s*([^;]+);`, 'm'));
  assert.ok(match, `Missing CSS custom property ${name}.`);
  return match[1].trim();
}

assert.match(agentUi, /import ['"]\.\/native-lcos-token-adapter\.css['"]/,
  'The token adapter must be in the real native UI module graph.');
assert.equal(rules.length, 2, 'Keep the adapter to explicit light and dark scoped token rules.');
const [lightRule, darkRule] = rules;
const anchorSelectors = [
  '.lcos-conversation-node-shell',
  '.lcos-glyth-presence',
  '.lcos-native-text-host',
  '[data-lcos-native-conversation-drop-target]',
  '[data-lcos-drop-preview]',
  '[data-lcos-drop-receptor]',
  '[data-lcos-drop-receipt]',
  '[data-lcos-professional-stage]',
  '[data-lcos-window-region-id]',
  "[data-lcos-window-material='frost']",
  '[data-lcos-window-body]',
];
assert.match(nativeTextUi, /className="lcos-native-text-host/,
  'The new token scope must match the existing native text-slot body class.');
for (const { selector } of rules) {
  assert.ok(selector.includes(':where('), 'Token declarations must be attached through a scoped LCOS selector list.');
  for (const anchor of anchorSelectors) assert.ok(selector.includes(anchor), `Token scope omitted LCOS anchor ${anchor}.`);
  assert.doesNotMatch(selector, /(^|[\s,])(?:html|body|:root|#root)(?=$|[\s,])/,
    'The adapter must not set tokens on the document or TapNow page shell.');
}
assert.ok(darkRule.selector.startsWith('.dark :where('), 'Dark values must follow the original LCOS .dark theme owner.');
assert.doesNotMatch(adapter, /@import\s/i, 'Do not import an unscoped global stylesheet into the TapNow host.');

const canonicalLight = ruleBody(canonicalTokens, ':root');
const canonicalDark = ruleBody(canonicalTokens, '.dark');
const canonicalLcosBase = ruleBody(canonicalLcosCss, ':root');
const canonicalLcosGlass = (() => {
  const match = [...withoutComments(canonicalLcosCss).matchAll(/:root\s*\{([^{}]*)\}/g)]
    .map((row) => row[1]).find((body) => body.includes('--lcos-glass-bg:'));
  assert.ok(match, 'Canonical LCOS glass-background declaration was not found.');
  return match;
})();

const lightValuesFromTokens = [
  '--lcos-radius-control', '--lcos-radius-card-small', '--lcos-pin-amber',
  '--lcos-color-border-subtle', '--gen2-surface', '--gen2-raised', '--gen2-text',
  '--gen2-muted', '--gen2-border', '--gen2-accent',
];
for (const name of lightValuesFromTokens) {
  assert.equal(tokenValue(lightRule.body, name), tokenValue(canonicalLight, name), `Light ${name} diverged from lcos-tokens.css.`);
}
for (const name of ['--lcos-color-border-subtle', '--gen2-surface', '--gen2-raised', '--gen2-text', '--gen2-muted', '--gen2-border', '--gen2-accent']) {
  assert.equal(tokenValue(darkRule.body, name), tokenValue(canonicalDark, name), `Dark ${name} diverged from lcos-tokens.css.`);
}
for (const name of ['--lcos-color-bg-inverse', '--lcos-color-text-on-inverse']) {
  assert.equal(tokenValue(lightRule.body, name), tokenValue(canonicalLight, name), `Light ${name} diverged from lcos-tokens.css.`);
  assert.equal(tokenValue(darkRule.body, name), tokenValue(canonicalDark, name), `Dark ${name} diverged from lcos-tokens.css.`);
}
assert.equal(tokenValue(lightRule.body, '--lcos-status-danger'), tokenValue(canonicalLcosBase, '--lcos-status-danger'));
assert.equal(tokenValue(lightRule.body, '--lcos-glass-bg'), tokenValue(canonicalLcosGlass, '--lcos-glass-bg'));
assert.equal(tokenValue(lightRule.body, '--lcos-glass-blur'), tokenValue(canonicalTokens, '--lcos-glass-blur'));
assert.equal(tokenValue(lightRule.body, '--lcos-glass-shadow'), tokenValue(canonicalTokens, '--lcos-glass-shadow'));
assert.doesNotMatch(adapter, /(?:^|\n)\s*(?:html|body|:root|#root|\*)\s*[{,]/,
  'The token adapter may not reset or style the document shell.');

console.log(JSON.stringify({ mode: 'native-lcos-scoped-token-adapter', passed: true, rules: rules.length,
  anchors: anchorSelectors.length, lightAndDarkValuesMatchCanonicalOwners: true,
  globalPageSelectors: 0, importedIntoNativeUi: true }, null, 2));
