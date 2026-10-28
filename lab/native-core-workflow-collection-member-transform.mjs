import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeCoreWorkflowCollectionSafetySource = 'lcos/apps/local-core/src/mutation-safety-service.ts';
export const nativeCoreWorkflowCollectionRepositorySource = 'lcos/apps/local-core/src/metadata-repository.ts';

// Current Workflow producers still return real project-owned Scope identities.
// Only legacy collection-Scopes must be kept out of canonical Collection members.
// This does not turn Workflow's product semantics into a Scope container.
function adapt(source, sourcePath, file, before, after, expected) {
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath).toLowerCase() !== path.resolve(root, file).toLowerCase())
    throw new Error('Workflow Collection member transform requires its exact Core sourcePath.');
  if (typeof source !== 'string') throw new TypeError('Actual Core source text is required.');
  const oldCount = source.split(before).length - 1, newCount = source.split(after).length - 1;
  if (oldCount === 0 && newCount === expected) return source;
  if (oldCount !== expected || newCount !== 0)
    throw new Error('Workflow Collection member source seam changed; no source was adapted.');
  return source.replaceAll(before, after);
}
export function transformNativeCoreWorkflowCollectionSafety(source, { sourcePath } = {}) {
  return adapt(source, sourcePath, nativeCoreWorkflowCollectionSafetySource,
    "scope.kind !== 'collection' && scope.kind !== 'workflow'",
    "scope.kind !== 'collection' /* native-workflow-collection-member */", 1);
}
export function transformNativeCoreWorkflowCollectionRepository(source, { sourcePath } = {}) {
  return adapt(source, sourcePath, nativeCoreWorkflowCollectionRepositorySource,
    "kind NOT IN ('collection','workflow')", "kind <> 'collection' /* native-workflow-collection-member */", 2);
}
export function createNativeCoreWorkflowCollectionMemberTransforms() {
  return {
    [nativeCoreWorkflowCollectionSafetySource]: transformNativeCoreWorkflowCollectionSafety,
    [nativeCoreWorkflowCollectionRepositorySource]: transformNativeCoreWorkflowCollectionRepository,
  };
}
