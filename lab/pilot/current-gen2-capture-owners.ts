// Test-only entry to the existing Core owners. buildPilotEntry resolves these
// copied paths through the explicit read-only current-Gen2 source catalog; this
// file owns no service, repository, state, or implementation of its own.
export { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
export { createMvpSampleSnapshot } from '../../lcos/apps/local-core/src/mvp-sample-project.ts'
export { CaptureSpaceService } from '../../lcos/apps/local-core/src/capture-space-service.ts'
export { CaptureStagingService } from '../../lcos/apps/local-core/src/capture-staging-service.ts'
export { CapturePlacementService } from '../../lcos/apps/local-core/src/capture-placement-service.ts'
export { UniversalResourceImportService } from '../../lcos/apps/local-core/src/resources/universal-resource-import-service.ts'
export { ImportCopyService } from '../../lcos/apps/local-core/src/import-copy-service.ts'
export { createTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
