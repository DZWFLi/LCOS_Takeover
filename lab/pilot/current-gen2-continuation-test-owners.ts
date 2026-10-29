// Test-only entry to original Gen2 Core owners. buildPilotEntry resolves the
// selected copied paths through the read-only current-source catalog; this
// entry owns no implementation, service, repository, or persistent state.
export { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
export { createMvpSampleSnapshot } from '../../lcos/apps/local-core/src/mvp-sample-project.ts'
export { createTextArtifact, reviseManagedTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
export { ConversationImportService } from '../../lcos/apps/local-core/src/conversation-import-service.ts'
export { ConversationContinuationService } from '../../lcos/apps/local-core/src/conversation-continuation-service.ts'
export { ProjectEventHub } from '../../lcos/apps/local-core/src/project-events/project-event-hub.ts'
