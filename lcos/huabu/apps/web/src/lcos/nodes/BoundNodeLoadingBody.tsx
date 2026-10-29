import { SkeletonLoadingIndicator } from '@/components/Common/SkeletonLoadingIndicator';

import { useLcosReferenceStore } from '../lcosReferenceState';

import type { CanvasNodeBodySlotInput } from '@/lcos-seam/types';

/** Only confirmed artifact/scope identities reach here. Unbound authored nodes keep native editing. */
export function BoundNodeLoadingBody({ nodeId }: CanvasNodeBodySlotInput): React.JSX.Element {
  const status = useLcosReferenceStore((state) => state.bindingReadStatus);
  const retry = useLcosReferenceStore((state) => state.requestNodeBindingRefresh);
  const loading = status === 'loading';
  return <div data-lcos-bound-loading={loading ? 'loading' : 'unavailable'} data-node-id={nodeId}
    role="status" aria-label={loading ? '正在读取对象内容' : '对象内容暂不可用'}
    className="flex h-full w-full flex-col justify-center gap-2 overflow-hidden p-3">
    {loading ? <SkeletonLoadingIndicator lines={2} /> : <>
      <span className="text-xs text-fg-subtle">对象内容暂不可用</span>
      <button type="button" className="nodrag nopan self-start text-xs underline"
        onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); retry(); }}>重新读取</button>
    </>}
  </div>;
}
