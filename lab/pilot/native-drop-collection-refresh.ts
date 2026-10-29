import type { NativeCanvasSnapshot } from './native-canvas-port';
import type { DropCollectionMembershipIntent } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import type { CoreCollectionMembershipReceipt } from '../../lcos/apps/web-gen2/src/backend/collections';
import { readNativeLibraryCollectionProjection, isNativeLibraryCollectionCarrier } from './native-library-collection-placement';

type Api = NonNullable<NativeCanvasSnapshot['rfInstance']>;
interface Release {
  readonly projectId: string;
  readonly canvasId: string | null;
  readonly workspaceId: string | null;
  readonly api: Api | null;
  readonly isCurrent: () => boolean;
  readonly signal?: AbortSignal;
}

/** Read the existing projection after its matching positive membership receipt.
 * This never adds members, creates carriers, changes geometry, or retries a write. */
export function createNativeDropCollectionRefresh(release: Release) {
  return async (intent: DropCollectionMembershipIntent, receipt: CoreCollectionMembershipReceipt): Promise<void> => {
    if (!['applied', 'already-member'].includes(receipt?.status)
      || receipt.collectionId !== intent.collectionId
      || receipt.memberRef?.type !== intent.memberRef.type || receipt.memberRef.id !== intent.memberRef.id) {
      throw new Error('集合成员回执不匹配，未更新原画布。');
    }
    const { projectId, canvasId, workspaceId, api } = release;
    if (!canvasId || !workspaceId || !api?.synchronizeCollectionCarrier) {
      throw new Error('集合关系已保存，原画布同步入口尚未就绪。');
    }
    const input = { projectId, canvasId, workspaceId, collectionId: intent.collectionId };
    const current = () => !release.signal?.aborted && release.isCurrent();
    const carriers = () => api.getNodes().filter(node => isNativeLibraryCollectionCarrier(node, input));
    if (!current() || carriers().length !== 1) {
      throw new Error('集合关系已保存，原集合已离开当前画布，未改动其他位置。');
    }
    const carrierId = carriers()[0]!.id;
    const projection = await readNativeLibraryCollectionProjection(input, release.signal);
    if (!current() || projection.state !== 'present' || projection.node?.id !== carrierId
      || carriers().length !== 1 || carriers()[0]!.id !== carrierId) {
      throw new Error('集合关系已保存，原载体回读尚未确认。');
    }
    // O8's existing receipt owner preserves position, parent, selection and history.
    const result = await api.synchronizeCollectionCarrier({ projectId, canvasId, workspaceId, node: projection.node },
      { isCurrent: current });
    if (result?.ok !== true || !current()) {
      throw new Error(result?.reason || '集合关系已保存，原画布显示尚未同步。');
    }
    window.dispatchEvent(new CustomEvent('lcos:native-collection-updated', {
      detail: { ...input, carrierId },
    }));
  };
}
