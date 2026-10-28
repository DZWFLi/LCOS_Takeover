import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeReferencePickOwner = 'lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts';
const marker = '/* LCOS native reference-pick ports. */';

/** Keep the original recognizer, queue and input owner. These ports only adapt
 * its hit test, original notice renderer and host lifetime to the shipped page. */
export function transformNativeReferencePickSource(source, sourcePath) {
  sourcePath = typeof sourcePath === 'string' ? sourcePath : sourcePath?.sourcePath;
  if (path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== nativeReferencePickOwner.toLowerCase())
    throw new Error('Reference pick transform requires its exact original owner.');
  if (source.includes(marker)) return source;
  const start = source.indexOf('export function createReferencePickRecognizer(');
  const end = source.indexOf('\n/**\n * Acquire a payload', start);
  if (start < 0 || end < 0) throw new Error('Original reference recognizer owner was not found.');
  let body = source.slice(start, end);
  const replace = (from, to) => {
    if (body.split(from).length !== 2) throw new Error(`Reference pick source changed at ${from.slice(0, 90)}.`);
    body = body.replace(from, to);
  };
  replace('prepareNative: NativeReferencePickPreparation = prepareNativeReferencePick)', `prepareNative: NativeReferencePickPreparation = prepareNativeReferencePick, runtime?: {
  nodeIdAtScreenPoint?(event: PointerEvent): string | undefined;
  captureCurrent?(nodeId: string): () => boolean;
  unavailableReason?(nodeId: string, reference?: LcosNodeEntityRef): string | undefined;
  notice?(message: string, options?: { tone?: string }): void;
  subscribeCurrent?(listener: () => void): () => void;
})`);
  replace('  let activePointerId: number | null = null;', `${marker}
  const notify = runtime?.notice ?? toast;
  let activePointerId: number | null = null;`);
  body = body.replaceAll('toast(', 'notify(');
  replace('continuationOperationId?: string } | null = null;', 'continuationOperationId?: string; current?: () => boolean } | null = null;');
  replace('&& useCanvasStore.getState().canvasId === pick.canvasId;', '&& useCanvasStore.getState().canvasId === pick.canvasId && pick.current?.() !== false;');
  replace('useCanvasStore.subscribe(cancelIfChanged)];', 'useCanvasStore.subscribe(cancelIfChanged), ...(runtime?.subscribeCurrent ? [runtime.subscribeCurrent(cancelIfChanged)] : [])];');
  replace('        let reference = captured;', `        const issue = runtime?.unavailableReason?.(nodeId, captured);
        if (issue) throw new Error(issue);
        let reference = captured;`);
  replace('        const currentReferences = useLcosReferenceStore.getState();', `        const changed = runtime?.unavailableReason?.(nodeId, reference);
        if (changed) throw new Error(changed);
        const currentReferences = useLcosReferenceStore.getState();`);
  replace('const nodeId = nodeIdAtScreenPoint(event.clientX, event.clientY);', 'const nodeId = runtime?.nodeIdAtScreenPoint ? runtime.nodeIdAtScreenPoint(event) : nodeIdAtScreenPoint(event.clientX, event.clientY);');
  replace('        canvasId: useCanvasStore.getState().canvasId };', '        canvasId: useCanvasStore.getState().canvasId, current: runtime?.captureCurrent?.(nodeId) };');
  replace('        if (sending(origin)) {', `        const issue = runtime?.unavailableReason?.(pendingNodeId, capturedRef);
        if (issue) {
          notify(issue, { tone: 'danger' });
        } else if (sending(origin)) {`);
  return source.slice(0, start) + body + source.slice(end);
}
