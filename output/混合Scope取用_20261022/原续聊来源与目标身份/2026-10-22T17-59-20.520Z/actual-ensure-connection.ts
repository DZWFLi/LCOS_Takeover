import {AcpAgentClient} from "../../../../lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts"
import {acpSessionRegistry} from "../../../../lcos/huabu/external/agenetes/packages/acp-driver/src/session-registry.ts"
import {LiveAgentletConnection} from "../../../../lcos/huabu/external/agenetes/packages/agentlet-gateway/src/connection.ts"
import {AcpServiceError} from "../../../../lcos/huabu/external/agenetes/packages/acp-driver/src/errors.ts"
let currentConnection; let failResume=false; const priorCalls=[]; const agentletId="ensure-machine", threadId="ensure-thread", native="native-keep";
const logger={debug(){},info(){},warn(){},error(){}};
const makeConnection=()=>new LiveAgentletConnection({agentletId,sessionId:native,role:"agent-session",metadata:{},ws:{readyState:1,send(){},close(){}},outboundBufferLimit:10,inboundPreAttachBufferLimit:10,logger,sessionProfile:{session:{initializeResult:{agentCapabilities:{loadSession:true,promptCapabilities:{embeddedContext:true}}}}}});
const gateway={getSession:(node,id)=>node===agentletId&&id===native?currentConnection:undefined}; const getAgentletGateway=()=>gateway;
const ensureAgentForThread=async(node,thread,recipe,prior)=>{priorCalls.push({node,thread,prior});if(prior!==native)throw new Error("A create fallback would be forbidden");if(failResume)throw new AcpServiceError("session_resume_unavailable","Original native unavailable");if(!currentConnection||currentConnection.status!=="connected")currentConnection=makeConnection();return {sessionId:native,pid:1};};
const profileCachePort=undefined; const snapshotEntryMeta=()=>({}); const seedEntryFromNewSessionResult=()=>{}; const hydrateSelectionsFromPersistedMeta=()=>{}; const seedInitialPreferences=()=>{}; const handleSessionMetaUpdate=()=>{}; const hydrateEntryFromPersistedMeta=()=>{}; const reconcileSessionSelections=async()=>{};
export function snapshotEntryState(
  entry: AcpSessionEntry,
): AgentStateSnapshot<AcpDurableState> {
  return {
    driverState: {
      ...(entry.persistedToDisk
        ? { sessionId: entry.sessionId as SessionId }
        : {}),
      initialPreambleDelivered: entry.initialPreambleDelivered,
    },
    metadata: snapshotEntryMeta(entry),
  };
}
async function ensureAcpSessionInner(
  opts: EnsureAcpSessionOptions,
): Promise<AcpSessionEntry> {
  const { agentletId, threadId, binding, logger } = opts;
  const namespace = opts.namespace;
  const scopeName = namespace.name;
  // Recipe resolution (recipe-first-via-L1, I9.6 / R1): use the L1-baked
  // recipe that rode the create-time spec verbatim. L1 owns keeping a
  // returning thread's recipe stable; the driver no longer reads a
  // persisted `bindingRecipe`. When absent, the binding is unbound — fail
  // with a clear, user-actionable error.
  const recipe: AcpBindingRecipe | null = opts.recipe ?? null;
  if (!recipe) {
    throw new AcpServiceError(
      'profile_missing',
      `External agent '${binding.alias}' is no longer configured. Re-create the profile in Settings → External Agents, or start a new chat with another agent.`,
    );
  }
  const agentTeamCwd = recipe.agentTeam
    ? 'workingDirPath' in recipe.agentTeam
      ? recipe.agentTeam.workingDirPath
      : recipe.agentTeam.agentDir
    : undefined;
  const cwd = opts.cwd ?? recipe.cwd ?? agentTeamCwd ?? '';

  const gateway = getAgentletGateway();
  if (!gateway) {
    throw new AcpServiceError(
      'bridge_not_mounted',
      'ACP bridge is not mounted \u2014 the embedded agentlet daemon is not running yet',
    );
  }

  const registeredEntry = acpSessionRegistry.get(agentletId, threadId);
  // native-live-ensure-current-connection: a reused transport id is not the same live connection.
  if (registeredEntry && !registeredEntry.client.isClosed
    && !registeredEntry.client.isConnectedTo(gateway.getSession(agentletId, registeredEntry.client.transportSessionId))) {
    registeredEntry.client.shutdown("transport_connection_unavailable");
  }
  const entryMatchesRequest =
    registeredEntry?.namespace.name === scopeName &&
    registeredEntry.profileId === binding.profileId;
  if (
    registeredEntry &&
    entryMatchesRequest &&
    !registeredEntry.client.isClosed
  ) {
    logger.debug(
      { threadId, sessionId: registeredEntry.sessionId },
      '[acp] reusing existing session for thread',
    );
    return registeredEntry;
  }

  let priorState = opts.priorState;
  if (
    registeredEntry &&
    entryMatchesRequest &&
    registeredEntry.client.isClosed &&
    opts.repairFromClosedEntry !== false
  ) {
    priorState = snapshotEntryState(registeredEntry);
    logger.info(
      {
        threadId,
        sessionId: priorState.driverState.sessionId,
        persistedToDisk: registeredEntry.persistedToDisk,
      },
      '[acp] stored session client was closed \u2014 repairing from live entry state',
    );
  } else if (registeredEntry && !entryMatchesRequest) {
    logger.info(
      {
        threadId,
        oldScopeName: registeredEntry.namespace.name,
        newScopeName: scopeName,
        oldProfileId: registeredEntry.profileId,
        newProfileId: binding.profileId,
      },
      '[acp] stored session does not match requested scope/profile \u2014 replacing',
    );
  } else if (registeredEntry?.client.isClosed) {
    logger.info(
      { threadId },
      '[acp] bypassing closed session state after native recovery failed',
    );
  }
  const priorSessionId =
    opts.priorSessionId ?? priorState?.driverState.sessionId;

  // Resolve the thread to a live agentlet agent. Each thread owns its
  // own CLI process — the orchestrator either returns the cached spawn
  // or asks the daemon to start a new one keyed on `threadId`.
  // When a down-fed sessionId exists, pass it to the orchestrator so
  // the daemon can resume a suspended session instead of creating new.
  // Failures here surface as a 503 from the caller with a user-actionable
  // hint pointing at Settings → External Agents.
  const { sessionId: agentSessionId } = await ensureAgentForThread(
    agentletId,
    threadId,
    recipe,
    priorSessionId,
    opts.env,
    opts.idleTimeoutSecs,
  );
  const conn = gateway.getSession(agentletId, agentSessionId);
  if (!conn || conn.status !== 'connected') {
    // Agentlet acknowledged the spawn but the agent's own WS session
    // never reached `connected` (or has since dropped). Surfaces the
    // same root cause as a `connect_timeout` from the orchestrator:
    // the agent process is up but not talking — almost always an
    // interactive auth wait (Copilot OAuth) or an immediate crash.
    throw new AcpServiceError(
      'connect_timeout',
      `External agent '${recipe.alias}' is not connected`,
    );
  }

  // ── New session: skip re-initialization ──────────────────────────
  //
  // The agentlet daemon has already bootstrapped the session
  // (initialize + session/new) during spawn. We seed the client from
  // the live session profile instead of calling those RPCs again.
  // This fixes the split-brain sessionId divergence where Huabu's
  // second session/new created a different sessionId from the one the
  // WS relay is keyed on.

  const client = new AcpAgentClient(conn, { scopeName, logger });

  // The live profile carries the daemon's bootstrap results, so the
  // stateless Gateway does not need a DataStore.
  const bootstrapProfile = conn.sessionProfile?.session;
  if (bootstrapProfile?.initializeResult) {
    client.seedFromRecord(
      bootstrapProfile.initializeResult as AcpInitializeResult,
    );
    logger.info(
      {
        threadId,
        sessionId: agentSessionId,
        agentInfo: (bootstrapProfile.initializeResult as AcpInitializeResult)
          .agentInfo,
      },
      '[acp] seeded client from live session profile (skipped redundant initialize + session/new)',
    );
  } else {
    logger.warn(
      { threadId, sessionId: agentSessionId },
      '[acp] live session profile has no initializeResult — agent capabilities unknown',
    );
  }

  const sessionId = agentSessionId;

  const created: AcpSessionEntry = {
    agentletId,
    threadId,
    client,
    sessionId,
    profileId: binding.profileId,
    namespace,
    cwd,
    createdAt: Date.now(),
    bindingRecipe: recipe,
    // Resume path (`priorSessionId` was down-fed + agent accepted it)
    // already has a recoverable session, so the entry starts persisted and
    // the handle's first up-report refreshes the durable record. Fresh
    // `session/new` sessions start NOT persisted — `sessionId` is withheld
    // from the up-reported snapshot (see `snapshotEntryState`) until the
    // first user prompt promotes it, so an unused thread never leaves a
    // stale sessionId for the next server lifetime to choke on.
    persistedToDisk: !!priorSessionId,
    // Delivery is independent from session creation: a command may create
    // and persist a session without consuming the pending preamble.
    initialPreambleDelivered:
      priorState?.driverState.initialPreambleDelivered ?? false,
    availableCommands: [],
    commandsUpdatedAt: 0,
    availableModes: [],
    currentModeId: null,
    availableModels: [],
    currentModelId: null,
    configOptions: [],
    selections: {},
    selectionsUpdatedAt: 0,
    selectionsReplay: null,
    sessionInfo: null,
    usage: null,
    metaUpdatedAt: 0,
  };

  // Seed modes/models/configOptions inline from the agent's `session/new`
  // response (Copilot CLI delivers them here rather than via notifications).
  // Done before attaching the listener so a buffered, genuinely-newer
  // notification drains afterward and wins.
  //
  // Gated on the ABSENCE of a down-fed meta snapshot: the `session/new`
  // blob is frozen at session-creation time, so its `current*` fields
  // (currentModelId / currentModeId / configOption currentValues) are the
  // agent's defaults from back then. On a fresh session that is exactly
  // right (no user choice exists yet). On RESUME (`priorState.metadata`
  // present) those frozen defaults are the STALEST source of `current*` —
  // staler than the user's last selection in `priorState.metadata` and
  // staler than any buffered/live notification — so we skip the seed
  // entirely and let notifications + `hydrateEntryFromPersistedMeta` restore
  // the up-to-date state instead of clobbering it.
  seedEntryFromNewSessionResult(
    created,
    priorState?.metadata ? undefined : bootstrapProfile?.newSessionResult,
    logger,
  );

  // Unconditional, and before the listener: the agent's bootstrap push
  // would otherwise close the `metaUpdatedAt === 0` gate below and strand
  // the user's remembered choices.
  hydrateSelectionsFromPersistedMeta(created, priorState?.metadata);
  if (!priorState?.metadata) {
    seedInitialPreferences(created, opts.initialPreferences);
  }

  // Installing the listener synchronously drains Gateway pre-attach messages
  // that AcpAgentClient retained as orphan updates during construction.
  client.registerSessionListener(sessionId, (update) => {
    handleSessionMetaUpdate(created, update, logger);
  });

  // If the down-fed snapshot has a meta payload (e.g. from a previous
  // server lifetime), use it as a fallback seed — it may carry
  // modes/models/configOptions that the agent doesn't re-push after
  // bootstrap.
  //
  // Doing so also means the entry's agent-reported fields are now a disk
  // copy of the user's own last choice rather than anything this agent
  // said, which `reconcileSessionSelections` must not mistake for
  // agreement — hence the flag.
  let agentViewIsLive = true;
  if (priorState?.metadata && created.metaUpdatedAt === 0) {
    hydrateEntryFromPersistedMeta(created, priorState.metadata);
    agentViewIsLive = false;
    logger.info(
      {
        threadId,
        sessionId,
        commandCount: created.availableCommands.length,
        modeCount: created.availableModes.length,
      },
      '[acp] hydrated session meta from down-fed snapshot (fallback)',
    );
  }

  // Optimistic slash-command warm-start: if no source so far has
  // populated `availableCommands`, seed from the per-profile L3 cache
  // (populated by previous sessions of the same profile). The agent's
  // authoritative `available_commands_update` overwrites this once it
  // arrives, so any per-session drift self-corrects. Mirrors the
  // optimistic localStorage cache the web client maintains for the
  // same purpose.
  if (created.availableCommands.length === 0 && binding.profileId) {
    const warm = profileCachePort?.readCommands(binding.profileId);
    if (warm) {
      created.availableCommands = warm.availableCommands;
      created.commandsUpdatedAt = warm.commandsUpdatedAt;
      logger.info(
        {
          threadId,
          sessionId,
          count: created.availableCommands.length,
        },
        '[acp] warm-started availableCommands from per-profile cache',
      );
    }
  }

  acpSessionRegistry.set(agentletId, threadId, created);

  // Push the restored intent back onto the agent. Not awaited here: a slow
  // agent must not delay session open itself. The handle waits on this
  // before the turn's prompt and before any user set-RPC, so nothing
  // overtakes it. Errors are handled per-selection inside; the catch only
  // guards against an unexpected throw so awaiting is always safe.
  created.selectionsReplay = reconcileSessionSelections(created, logger, {
    agentViewIsLive,
  }).catch((err: unknown) => {
    logger.warn(
      {
        threadId,
        sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      '[acp] selection replay aborted',
    );
  });

  // The durable record is refreshed via the up-report channel (I9.7): the
  // owning handle installs `reportState` on this entry the moment it
  // resolves it in `run` and fires an initial report, which persists the
  // resumed session's `sessionId` + seeded `metadata` through the instance
  // (the sole ThreadStore writer). No direct on-disk write here anymore.

  return created;
}
export async function exerciseOriginalEnsure(kind){
  priorCalls.length=0;failResume=false;const oldConnection=makeConnection();currentConnection=oldConnection;const oldClient=new AcpAgentClient(oldConnection,{scopeName:"ensure-project"});
  const oldEntry={agentletId,threadId,sessionId:native,client:oldClient,profileId:"ensure-profile",namespace:{name:"ensure-project"},cwd:"isolated",bindingRecipe:{command:"not-executed",alias:"ensure"},persistedToDisk:true,initialPreambleDelivered:true,selections:{},availableCommands:[],availableModes:[],availableModels:[],configOptions:[]};
  acpSessionRegistry.set(agentletId,threadId,oldEntry);
  if(kind==="replaced")currentConnection=makeConnection();else oldConnection.disconnect("controlled-gateway-disconnect");
  const closedBefore=oldClient.isClosed; if(kind==="unavailable")failResume=true;
  let result,error;try{result=await ensureAcpSessionInner({agentletId,threadId,binding:{alias:"ensure",profileId:"ensure-profile"},namespace:{name:"ensure-project"},recipe:{command:"not-executed",alias:"ensure"},priorSessionId:native,logger});}catch(e){error={code:e.code,message:e.message};}
  const output={closedBefore,closedAfter:oldClient.isClosed,priorCalls:[...priorCalls],native:result?.sessionId,newClient:result?.client!==oldClient,currentConnection:result?.client.isConnectedTo(currentConnection),error};
  acpSessionRegistry.remove(agentletId,threadId);return output;
}