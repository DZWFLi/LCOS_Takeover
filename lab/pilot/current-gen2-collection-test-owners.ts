import type { Collection, CollectionMemberRef, CollectionMembership, ProjectId } from '@local-creative-os/domain'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'

export {
  createLocalCoreServer,
} from '../../lcos/apps/local-core/src/server.ts'
export { ExplicitProjectCatalog } from '../../lcos/apps/local-core/src/project-catalog.ts'
export { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
export { ImportCopyService } from '../../lcos/apps/local-core/src/import-copy-service.ts'
export { createTextArtifact, reviseManagedTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
export { ConversationImportService } from '../../lcos/apps/local-core/src/conversation-import-service.ts'
export { createRuntimeComposition } from './runtime-composition.ts'

/**
 * Test fixture helper that writes canonical collection rows through the real
 * repository transaction owner. It intentionally does not call SQLite/raw SQL
 * or invent a Collection resolver path.
 */
export function persistCollectionFixture(
  repository: SqliteMetadataRepository,
  projectId: string,
  collections: readonly { readonly id: string; readonly title: string; readonly members?: readonly CollectionMemberRef[] }[],
  addedAt = '2026-10-14T00:00:00.000Z',
): readonly Collection[] {
  const collectionAdds: Collection[] = collections.map((value, index) => ({
    id: value.id as Collection['id'],
    projectId: projectId as ProjectId,
    title: value.title,
    createdAt: new Date(Date.parse(addedAt) + index).toISOString(),
    updatedAt: new Date(Date.parse(addedAt) + index).toISOString(),
  }))
  const collectionMembershipAdds: CollectionMembership[] = collections.flatMap((collection) =>
    (collection.members ?? []).map((memberRef, index) => ({
      collectionId: collection.id as Collection['id'],
      memberRef,
      relationId: `${collection.id}-member-${String(index).padStart(3, '0')}` as CollectionMembership['relationId'],
      addedAt: new Date(Date.parse(addedAt) + index).toISOString(),
    })),
  )
  repository.runCurationMutation({ projectId, collectionAdds, collectionMembershipAdds })
  return collectionAdds
}
