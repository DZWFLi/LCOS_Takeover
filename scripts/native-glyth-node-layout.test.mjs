import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [layoutCss, nativeUi, donorGlyth, donorGlythCss] = await Promise.all([
  readFile(path.join(root, 'lab/pilot/native-glyth-node-layout.css'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-agent-ui.tsx'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/glyth/GlythBodyView.tsx'), 'utf8'),
  readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/ui/glyth/glyth-presence.css'), 'utf8'),
]);

const rules = [...layoutCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
  .map(([_, selector, declarations]) => ({ selector: selector.trim(), declarations }));
const scope = '.lcos-conversation-node-shell[data-lcos-native-conversation-drop-target]';

assert.match(nativeUi, /import ['"]\.\/native-glyth-node-layout\.css['"]/,
  'The fix must be part of the actual LCOS Agent node module graph.');
assert.match(nativeUi, /className="lcos-conversation-node-shell"[\s\S]*data-lcos-native-conversation-drop-target/,
  'Layout rules must be scoped to the existing native Glyth conversation shell.');
assert.match(nativeUi, /size=\{44\}[\s\S]*left=\{0\}[\s\S]*top=\{0\}/,
  'Do not change the donor Glyth size or Canvas-relative offsets.');
assert.match(donorGlyth, /className="lcos-glyth-presence"[\s\S]*style=\{\{ width: props\.size, height: props\.size, left: props\.left, top: props\.top \}\}/,
  'The targeted child must remain canonical GlythBodyView with caller-provided dimensions/offsets.');
assert.match(donorGlythCss, /\.lcos-glyth-presence\s*\{[^}]*position:\s*absolute/s,
  'The adapter must specifically normalize the original absolute-positioned donor wrapper.');

assert.equal(rules.length, 4, 'Keep the adapter to four narrow node-content layout rules.');
for (const { selector } of rules) assert.ok(selector.startsWith(scope), `Unexpected global or unrelated selector: ${selector}`);
assert.match(rules[0].declarations, /width:\s*100%/);
assert.match(rules[0].declarations, /min-width:\s*0\s*!important/,
  'Remove only the native child minimum that exceeds the persisted node footprint.');
assert.match(rules[1].declarations, /position:\s*relative\s*!important/);
assert.match(rules[1].declarations, /flex:\s*0\s+0\s+44px/,
  'Return the unchanged 44px Glyph to the existing shell row flow.');
assert.match(rules[2].declarations, /flex:\s*1\s+1\s+0%/);
assert.match(rules[2].declarations, /min-width:\s*0/);
assert.match(rules[3].declarations, /max-width:\s*100%\s*!important/,
  'Keep the existing title button within the projected Canvas node.');
assert.doesNotMatch(layoutCss, /(?:^|\n)\s*(?:html|body|:root|#root|\*)\s*[{,]/,
  'Do not affect the page shell or unrelated TapNow nodes.');
assert.doesNotMatch(layoutCss, /react-flow__node|transform:|\b(?:left|top|height):\s*\d+px/,
  'The layout adapter must not rewrite ReactFlow/Core geometry or add position offsets.');

console.log(JSON.stringify({ mode: 'native-glyth-node-layout', passed: true,
  scopedRules: rules.length, projectedNodeGeometryChanged: false,
  glyphSizeOrOffsetChanged: false, iconAndLabelShareNormalFlow: true }, null, 2));
