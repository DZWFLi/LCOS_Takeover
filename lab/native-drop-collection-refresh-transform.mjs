import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { currentGen2Root, resolveCurrentGen2Resource } from './current-gen2-resources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(currentGen2Root, 'package.json'));
const ts = require('typescript');
export const nativeDropCollectionRefreshSource = 'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx';
const marker = '/* Native Drop collection receipt refresh; original Pile remains the writer. */';
const key = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();

export function transformNativeDropCollectionRefreshOverlay(source, { sourcePath } = {}) {
  const expected = path.join(root, nativeDropCollectionRefreshSource);
  if (typeof sourcePath !== 'string' || key(sourcePath) !== key(expected)
    || !resolveCurrentGen2Resource(expected)) throw new Error('Collection Drop refresh requires the selected original Overlay.');
  if (source.includes(marker)) return source;
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) throw new Error('Collection Drop original Overlay could not be parsed.');
  const callbacks = [];
  const walk = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'onCollectionApplied') callbacks.push(node);
    ts.forEachChild(node, walk);
  };
  walk(ast);
  if (callbacks.length !== 1 || !callbacks[0].getText(ast).includes('appliedCollectionIntent = membershipIntent;')
    || !callbacks[0].getText(ast).includes('currentCanvas.moveNodeIntoFrame')) {
    throw new Error('Collection Drop positive-receipt callback changed; no partial replacement.');
  }
  const seam = '    let appliedCollectionIntent: DropCollectionMembershipIntent | undefined;';
  if (source.split(seam).length !== 2) throw new Error('Collection Drop release capture changed.');
  const create = `
    const nativeCollectionRefresh = createNativeDropCollectionRefresh({
      projectId, canvasId: dropCanvasId, workspaceId: placementWorkspaceId,
      api: canvasAtRelease.rfInstance, signal: placementAbort.signal,
      isCurrent: () => {
        const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState(), drop = useLcosDropStore.getState();
        return active && shell.projectId === projectId && shell.activeWorkspaceId === placementWorkspaceId
          && shell.activeSurface === placementSurface && canvas.canvasId === dropCanvasId
          && canvas.rfInstance === canvasAtRelease.rfInstance
          && drop.state.status === 'committing' && drop.state.transactionId === dropState.transactionId;
      },
    });`;
  const callback = `onCollectionApplied: async (membershipIntent: DropCollectionMembershipIntent,
        receipt: Parameters<ReturnType<typeof createNativeDropCollectionRefresh>>[1]): Promise<void> => {
        appliedCollectionIntent = membershipIntent;
        await nativeCollectionRefresh(membershipIntent, receipt);
      }`;
  const node = callbacks[0];
  let result = source.slice(0, node.getStart(ast)) + callback + source.slice(node.end);
  result = result.replace(seam, seam + create);
  const relative = path.relative(path.dirname(expected), path.join(root, 'lab/pilot/native-drop-collection-refresh')).replaceAll('\\', '/');
  return "import { createNativeDropCollectionRefresh } from '" + relative + "';\n" + marker + '\n' + result;
}
