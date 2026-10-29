import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';
const helper = path.join(root, 'lab/pilot/native-canvas-port.ts');

/** Reuse the original switchMode computation, commit data+geometry as one
 * original ReactFlow updateNode, not two writes behind pretend gesture calls. */
export function transformNativeTextFacesPresentation(source, { sourcePath } = {}) {
  if (typeof sourcePath !== 'string' || path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== target.toLowerCase()) {
    throw new Error('Native text presentation transform requires the exact copied TextFaces sourcePath.');
  }
  const eol = source.match(/\r\n|\n/)?.[0] ?? '\n';
  const relative = path.relative(path.dirname(sourcePath), helper).replaceAll('\\', '/');
  const importLine = `import { updateNativeTextPresentation } from ${JSON.stringify(relative.startsWith('.') ? relative : './' + relative)};`;
  const old = [
    '    state.beginNodeDataGesture();',
    '    try {',
    '      state.updateNodeData(nodeId, { lcosTextViewMode: next,',
    "        ...(next === 'mindmap' && mode !== 'mindmap' ? { lcosTextBeforeMindMapSize: oldSize } : {}) });",
    '      if (size) {',
    '        state.setNodeGeometry([{ nodeId: nodeId as `node-${string}`, size,',
    '          position: { x: node.position.x + (oldSize.width - size.width) / 2,',
    '            y: node.position.y + (oldSize.height - size.height) / 2 } }]);',
    '      }',
    '    } finally { state.endNodeDataGesture(); }',
  ].join(eol);
  const replacement = [
    '    updateNativeTextPresentation(nodeId, { lcosTextViewMode: next,',
    "      ...(next === 'mindmap' && mode !== 'mindmap' ? { lcosTextBeforeMindMapSize: oldSize } : {}) },",
    '      size ? { size, position: { x: node.position.x + (oldSize.width - size.width) / 2,',
    '        y: node.position.y + (oldSize.height - size.height) / 2 } } : undefined);',
  ].join(eol);
  const count = text => source.split(text).length - 1;
  if (source.includes('updateNativeTextPresentation')) {
    if (count(importLine) !== 1 || count(replacement) !== 1 || source.includes('state.beginNodeDataGesture()')
      || source.includes('state.endNodeDataGesture()')) throw new Error('Native text presentation transform is partially installed or has drifted.');
    return source;
  }
  // The copied file contains mixed CRLF/LF in this block. Match line endings
  // only; retain every source byte outside this exact known caller.
  const pattern = old.split(eol).map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n');
  const matches = [...source.matchAll(new RegExp(pattern, 'g'))];
  if (matches.length !== 1) throw new Error('Native text presentation switchMode seam changed.');
  const match = matches[0];
  return importLine + eol + source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
}
