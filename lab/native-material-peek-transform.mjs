export const nativeMaterialPeekSource = 'lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek.tsx';

// Keep the existing inert Gen1 scene SVG. Its caller already has the exact scene;
// importing the old cache/loader here would give Peek a second read lifetime.
const seams = [
  ["import { useSpacePreviewScene } from '@/store/spacePreviewSceneCache';", "import type { GetSpacePreviewSceneResponse } from '@huabu/shared';"],
  ['export function RailwayPeek({ canvasId }: { readonly canvasId: string }): React.JSX.Element {',
    'export function RailwayPeek({ canvasId, nativeScene, highlightNodeId }: { readonly canvasId: string; readonly nativeScene: GetSpacePreviewSceneResponse; readonly highlightNodeId?: string }): React.JSX.Element {'],
  ['  const { scene, loading, stale, error, retry } = useSpacePreviewScene(canvasId, true);',
    "  const { scene, loading, stale, error, retry } = { scene: nativeScene, loading: false, stale: false, error: null as Error | null, retry: () => {} };\n  if (scene.canvasId !== canvasId) return <div role=\"status\">现场身份不一致，未显示别处的预览。</div>;"],
  ['<g key={node.id} data-lcos-preview-node={node.id}>', '<g key={node.id} data-lcos-preview-node={node.id} data-native-peek-target={node.id === highlightNodeId ? \'true\' : undefined}>'],
];

export function transformNativeMaterialPeek(source) {
  if (typeof source !== 'string') throw new TypeError('The original Peek source is required.');
  const crlf = source.includes('\r\n');
  const text = source.replaceAll('\r\n', '\n');
  if (seams.every(([before, after]) => !text.includes(before) && text.split(after).length === 2)) return source;
  if (!seams.every(([before, after]) => text.split(before).length === 2 && !text.includes(after))) {
    throw new Error('Original read-only Peek seams changed; no partial adaptation was applied.');
  }
  const result = seams.reduce((value, [before, after]) => value.replace(before, after), text);
  return crlf ? result.replaceAll('\n', '\r\n') : result;
}

export function restoreNativeMaterialPeekForComparison(transformed, original) {
  if (transformNativeMaterialPeek(original) !== transformed) throw new Error('Peek source differs from the precise reversible adaptation.');
  return original;
}
