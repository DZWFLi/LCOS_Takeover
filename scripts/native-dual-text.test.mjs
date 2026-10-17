import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime');
await mkdir(runtimeBase, { recursive: true });
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-dual-text-'));

try {
  const output = path.join(runtimeRoot, 'native-text-ui.js');
  await buildPilotEntry('lab/pilot/native-text-ui.tsx', output, 'browser', { nativeReact: true });

  const bundle = await readFile(output, 'utf8');
  const adapter = await readFile(path.join(root, 'lab/pilot/native-text-ui.tsx'), 'utf8');
  const textNode = await readFile(path.join(root, 'lcos/huabu/apps/web/src/components/Nodes/text/TextNode.tsx'), 'utf8');
  const textBody = await readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx'), 'utf8');
  const faces = await readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx'), 'utf8');
  const mindMap = await readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx'), 'utf8');

  // Adapter stays the exact original TextNode body-slot shape and component.
  assert.match(adapter, /LcosCanvasTextBody as NativeTextUi/);
  assert.match(adapter, /CanvasNodeBodySlotInput as NativeTextUiProps/);
  assert.match(textNode, /useResolvedNodeBody\(\{\s*nodeId:\s*id,\s*nodeType:\s*'text'/);
  assert.match(textNode, /<NodeWrapper[\s\S]*?<BodyOverride nodeId=\{id\} nodeType="text" data=\{/);
  assert.match(textNode, /<NativeTextNode \{\.\.\.props\}\s*\/>/);

  // Both faces remain views of one body; edits continue through the existing Core producer.
  assert.match(textBody, /MilkdownEditor/);
  assert.match(textBody, /LcosTextFaces/);
  assert.match(textBody, /session\.artifacts\.saveCanvasText/);
  assert.match(textBody, /expectedRevisionId/);
  assert.match(faces, /id:\s*'text',\s*label:\s*'正文'/);
  assert.match(faces, /id:\s*'outline',\s*label:\s*'大纲'/);
  assert.match(faces, /id:\s*'mindmap',\s*label:\s*'脑图'/);
  assert.match(faces, /useCanvasStore/);
  assert.match(faces, /<MindMapEditor[\s\S]*?onSaveText\(value\.body\)/);
  assert.match(mindMap, /onSave\(\{\s*title:\s*finalTitle,\s*body:/);

  // The adapter shares the vendor React root and does not introduce a Canvas/root/store owner.
  assert.match(bundle, /\/lcos\/native-react\.js/);
  assert.match(bundle, /\/lcos\/native-jsx-runtime\.js/);
  assert.doesNotMatch(bundle, /react-dom\/client/);
  assert.doesNotMatch(bundle, /createRoot\s*\(/);
  assert.doesNotMatch(adapter, /createRoot|ReactFlowProvider|createContext|useState|useSyncExternalStore/);

  console.log(JSON.stringify({
    mode: 'original-textnode-body-slot-with-core-text-faces',
    passed: true,
    checks: [
      'the alias preserves CanvasNodeBodySlotInput and the existing LcosCanvasTextBody component identity',
      'original TextNode still owns NodeWrapper and keeps its native fallback',
      'Milkdown body edits keep using the existing Core saveCanvasText CAS path',
      '正文/大纲/脑图 and MindMapEditor remain the existing same-body presentations',
      'the browser bundle reuses host React and adds no Canvas/store/root owner',
    ],
    runtimeWrites: false,
    browserRun: false,
  }, null, 2));
} finally {
  await rm(runtimeRoot, { recursive: true, force: true });
}
