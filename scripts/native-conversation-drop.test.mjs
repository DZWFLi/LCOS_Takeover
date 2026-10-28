import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [dropHost, agentUi, materialActions] = await Promise.all([
  read('lab/pilot/native-conversation-drop.tsx'),
  read('lab/pilot/native-agent-ui.tsx'),
  read('lab/pilot/native-material-actions.tsx'),
]);
const report = { mode: 'native-pointer-context-narrow-source-adapter', passed: false, cases: [] };

assert.match(dropHost, /from ['"].*lcos\/lcosDropState\.tsx?['"]/);
assert.match(dropHost, /from ['"].*lcos\/LcosHostOverlay\.tsx?['"]/);
assert.match(dropHost, /rectFromDomRect\(live\.getBoundingClientRect\(\)\)/,
  'Target bounds must come from the actual rendered conversation node element.');
assert.match(dropHost, /readRect,/,
  'The target registry receives the live DOM geometry reader, not a captured/guessed rectangle.');
assert.match(dropHost, /isDropPointExposed\(live, point\)/,
  'Original DOM hit-testing/occlusion policy remains the target acceptance owner.');
assert.match(dropHost, /semantic: \{ kind: 'collaboration-reference', conversationId: reference\.connectedConversationId \}/,
  'The Core ConnectedConversation ID, not the Huabu node id, is the recipient.');
assert.match(dropHost, /current\.projectId === reference\.projectId[\s\S]*current\.canvasId === reference\.canvasId[\s\S]*current\.workspaceId === reference\.workspaceId/,
  'Project, Canvas, and Workspace identities are all matched before enabling the receiver.');
assert.doesNotMatch(dropHost, /DataTransfer|dispatchEvent|createRailwayPointerDropController|beginDrop\s*\(|new DropTargetRegistry|create\s*\(/,
  'This target adapter does not introduce a second pointer transport, SemanticDrop machine, or registry.');
report.cases.push('native Glyth target registers in the original drop store using live node DOM bounds and exact Core conversation identity');

assert.match(agentUi, /NativeConversationDropTarget/);
assert.match(agentUi, /data-lcos-native-conversation-drop-target/);
assert.match(agentUi, /onDrop=\{handleDrop\}/,
  'Existing explicit HTML import seam remains intact; the pointer path does not replace it.');
assert.match(agentUi, /<OriginalLCOSProfessionalHost>[\s\S]*<NativeConversationDropHost\s*\/>[\s\S]*<NativeNodeCarryHost\b[\s\S]*<\/OriginalLCOSProfessionalHost>/,
  'The target overlay and node carry share the original professional host/provider tree.');
assert.equal((agentUi.match(/<NativeNodeCarryHost\b/g) ?? []).length, 1,
  'The node carry owner must mount once, not once per node.');
report.cases.push('same-root host adds the original Drop owner without changing the existing panel shortcut or canvas node renderer map');

assert.match(materialActions, /NativeMaterialContextAction/);
assert.match(materialActions, /port\.apply\(preview\)/,
  'Existing direct selection-to-context button still uses its Core preview/apply path.');
report.cases.push('existing button-based current-selection path remains in place');

report.passed = true;
console.log(JSON.stringify(report, null, 2));
