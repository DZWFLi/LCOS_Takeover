import type { LocalCoreServerOptions } from '../../lcos/apps/local-core/src/server.ts'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { ContextManifestService } from '../../lcos/apps/local-core/src/context-manifest-service.ts'
import { RestBridgeRuntimeClient } from '../../lcos/apps/local-core/src/bridge-rest-client.ts'
import { RuntimeAdapterService } from '../../lcos/apps/local-core/src/runtime-adapter.ts'
import { RuntimeApplicationService } from '../../lcos/apps/local-core/src/runtime-application-service.ts'
import { RuntimeResultIngestionService } from '../../lcos/apps/local-core/src/runtime-result-ingestion.ts'
import { RuntimeReviewService } from '../../lcos/apps/local-core/src/runtime-review-service.ts'

export interface RuntimeCompositionOptions {
  /** Optional explicit loopback origin for provenance; this isolated factory still rejects every fetch. */
  readonly bridgeOrigin?: string
  readonly bridgeProjectId?: string
}

export type RuntimeCoreServerOptions = Pick<
  LocalCoreServerOptions,
  'metadataRepository' | 'runtimeApplicationService'
>

export interface RuntimeComposition {
  readonly runtimeReviewReader: Pick<RuntimeReviewService, 'getRunReview'>
  readonly runtimeApplicationService: RuntimeApplicationService
  readonly coreServerOptions: RuntimeCoreServerOptions
  readonly bridgeOriginConfigured: boolean
  readonly bridgeAttempts: () => readonly string[]
}

const ISOLATED_BRIDGE_ERROR = 'isolated Bridge transport not configured'
const ISOLATED_BRIDGE_ORIGIN = 'http://127.0.0.1:1'
const ISOLATED_BRIDGE_PROJECT_ID = 'isolated-runtime'

/**
 * Compose real Local Core Runtime services around the caller's one repository.
 * The RestBridgeRuntimeClient is genuine, while its injected fetch is a hard
 * network refusal so capability reads resolve to honest offline status and no
 * Bridge task can be created in this experiment.
 */
export function createRuntimeComposition(
  metadataRepository: SqliteMetadataRepository,
  options: RuntimeCompositionOptions = {},
): RuntimeComposition {
  const bridgeAttempts: string[] = []
  const rejectBridgeFetch: typeof fetch = async (input) => {
    bridgeAttempts.push(String(input))
    throw new Error(ISOLATED_BRIDGE_ERROR)
  }
  const bridge = new RestBridgeRuntimeClient(
    options.bridgeOrigin ?? ISOLATED_BRIDGE_ORIGIN,
    rejectBridgeFetch,
  )
  // Application only calls getRunReview. Its stateless reader shares the one
  // repository; HTTP decisions must use composeLocalCoreServices' original
  // writer with the same Semantic / ResultSlot / MutationSafety owners.
  const runtimeReviewReader = new RuntimeReviewService(metadataRepository)
  const runtimeAdapter = new RuntimeAdapterService(
    metadataRepository,
    bridge,
    options.bridgeProjectId ?? ISOLATED_BRIDGE_PROJECT_ID,
    undefined,
    undefined,
    new Set<'workbuddy' | 'codex'>(),
  )
  const runtimeApplicationService = new RuntimeApplicationService(
    metadataRepository,
    new ContextManifestService(metadataRepository),
    runtimeAdapter,
    new RuntimeResultIngestionService(metadataRepository, bridge),
    runtimeReviewReader,
  )

  return {
    runtimeReviewReader: { getRunReview: runtimeReviewReader.getRunReview.bind(runtimeReviewReader) },
    runtimeApplicationService,
    coreServerOptions: {
      metadataRepository,
      runtimeApplicationService,
    },
    bridgeOriginConfigured: options.bridgeOrigin !== undefined,
    bridgeAttempts: () => [...bridgeAttempts],
  }
}
