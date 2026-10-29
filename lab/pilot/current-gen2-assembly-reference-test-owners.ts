// Test-only export seam for executing the adopted original reference-preparation
// helper against the original stores and Core clients in one Node module graph.
// This file owns no implementation, service, persistent state, or alternate store.
export { prepareAssemblyReferences, takeAssemblyReferences } from '../../lcos/huabu/apps/web/src/lcos/professional/prepareAssemblyReferences.ts'
export { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'
export { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'
export { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts'
export { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts'

export { CoreCaptureClient, CoreProjectClient, CoreResourceClient, HttpClient } from '@local-creative-os/web-gen2'
export { CaptureStagingService, ImportCopyService, UniversalResourceImportService } from './current-gen2-capture-owners.ts'
export { reviseManagedTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
