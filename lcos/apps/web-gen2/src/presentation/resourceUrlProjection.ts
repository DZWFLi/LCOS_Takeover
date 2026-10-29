import type { ResourceDescriptorV0 } from '@local-creative-os/contracts';
import type { CoreResourceClient } from '../backend/resources.js';
import { isCoreAbortError } from '../backend/coreTypes.js';

export interface ResourceUrlPresentation {
  readonly sourceKind: 'url';
  readonly sourceUrl: string;
  readonly resourceId: string;
}

/** Only the exact canonical source revision may supply the displayed URL.
 * A current descriptor must never replace a fixed historical view's source. */
export function resourceUrlPresentation(
  descriptors: readonly ResourceDescriptorV0[],
  target: { readonly projectId: string; readonly artifactId: string; readonly revisionId: string | undefined },
): ResourceUrlPresentation | undefined {
  if (!target.revisionId) return undefined;
  const descriptor = descriptors.find(item => item.projectId === target.projectId && item.artifactId === target.artifactId
    && item.sourceRevisionId === target.revisionId && item.source.kind === 'url');
  const value = descriptor?.source.normalizedUrl;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return { sourceKind: 'url', sourceUrl: url.href, resourceId: descriptor.resourceId };
  } catch { return undefined; }
}

/** Read once per reconciliation/facts pass, never per node render. A missing
 * descriptor keeps that material readable through its exact Core file bytes. */
export async function readResourceUrlDescriptors(
  resources: Pick<CoreResourceClient, 'list' | 'descriptor'>,
  projectId: string,
  signal?: AbortSignal,
): Promise<{ readonly descriptors: readonly ResourceDescriptorV0[]; readonly issues: readonly string[] }> {
  const summaries = (await resources.list(projectId, signal)).filter(item => item.sourceKind === 'url');
  const results = await Promise.allSettled(summaries.map(item => resources.descriptor(projectId, item.resourceId, signal)));
  if (signal?.aborted) throw new DOMException('资源读取已取消。', 'AbortError');
  const descriptors: ResourceDescriptorV0[] = []; const issues: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') descriptors.push(result.value);
    else if (isCoreAbortError(result.reason)) throw result.reason;
    else issues.push(`${summaries[index]?.resourceId}: ${result.reason instanceof Error ? result.reason.message : '链接来源读取失败。'}`);
  }
  return { descriptors, issues };
}
