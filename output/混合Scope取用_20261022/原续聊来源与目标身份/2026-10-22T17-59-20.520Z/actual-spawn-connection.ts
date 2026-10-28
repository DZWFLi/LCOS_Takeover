import {AcpServiceError} from "../../../../lcos/huabu/external/agenetes/packages/acp-driver/src/errors.ts"
class AgentletRequestError extends Error {data;}; const AGENTLET_READY_TIMEOUT_MS=20000;
const threadToAgent=new Map(); const spawns=[];let connection={sessionId:"native-cache",status:"connected"};
const gateway={getAgentlet:()=>({status:"connected"}),getSession:(_a,id)=>id==="native-cache"?connection:undefined,spawnOnAgentlet:async(_a,input)=>{spawns.push(input);if(input.sessionId!=="native-cache")throw new Error("Unexpected create");return {sessionId:"native-cache",pid:1};}};
const getAgentletGateway=()=>gateway,getDaemonSupervisor=()=>({hasGivenUp:()=>false}),getSupervisedAgentletId=()=>"cache-machine";
export function isSessionResumeUnavailableError(error: unknown): boolean {
  if (!(error instanceof AgentletRequestError)) return false;
  if (!error.data || typeof error.data !== 'object') return false;
  return (
    (error.data as { code?: unknown }).code === 'session_resume_unavailable'
  );
}
function agentletThreadKey(agentletId: string, threadId: string): string {
  return JSON.stringify([agentletId, threadId]);
}
function readTargetAgentlet(agentletId: string): { agentletId: string } | null {
  const gateway = getAgentletGateway();
  if (!gateway) return null;
  const agentlet = gateway.getAgentlet(agentletId);
  return agentlet?.status === 'connected' ? { agentletId } : null;
}
async function waitForTargetAgentlet(
  agentletId: string,
  timeoutMs: number,
): Promise<{ agentletId: string } | null> {
  const deadline = Date.now() + timeoutMs;
  const supervisor = getDaemonSupervisor();
  const supervisedAgentletId = getSupervisedAgentletId();
  let agentlet = readTargetAgentlet(agentletId);
  while (!agentlet && Date.now() < deadline) {
    if (agentletId === supervisedAgentletId && supervisor.hasGivenUp()) {
      return null;
    }
    await new Promise((r) => setTimeout(r, 100));
    agentlet = readTargetAgentlet(agentletId);
  }
  return agentlet;
}
async function waitForAgentConnection(
  agentletId: string,
  sessionId: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const gateway = getAgentletGateway();
    const conn = gateway?.getSession(agentletId, sessionId);
    if (conn?.status === 'connected') return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
export async function ensureAgentForThread(
  agentletId: string,
  threadId: string,
  recipe: AcpBindingRecipe,
  existingSessionId?: string,
  env?: Record<string, string>,
  idleTimeoutSecs = 600,
): Promise<{ agentletId: string; sessionId: string; pid: number }> {
  const agentlet = await waitForTargetAgentlet(
    agentletId,
    AGENTLET_READY_TIMEOUT_MS,
  );
  if (!agentlet) {
    const supervisorStatus =
      agentletId === getSupervisedAgentletId()
        ? getDaemonSupervisor().getStatus()
        : null;
    const hint = supervisorStatus?.lastError
      ? ` (${supervisorStatus.lastError})`
      : '';
    throw new AcpServiceError(
      'placement_unavailable',
      `Target agentlet '${agentletId}' is not connected${hint}.`,
    );
  }

  const cacheKey = agentletThreadKey(agentletId, threadId);
  const cached = threadToAgent.get(cacheKey);
  if (cached) {
    const gateway = getAgentletGateway();
    const conn = gateway?.getSession(cached.agentletId, cached.sessionId);
    if (conn && conn.status === 'connected' && conn === cached.connection) {
      return {
        agentletId: cached.agentletId,
        sessionId: cached.sessionId,
        pid: cached.pid,
      };
    }
    threadToAgent.delete(cacheKey);
  }

  const gateway = getAgentletGateway();
  if (!gateway) {
    throw new AcpServiceError(
      'bridge_not_mounted',
      'Agentlet Gateway is not mounted',
    );
  }

  // `env` is the L1-assembled reachback env (canvas-scoped RFS URL +
  // thread id). It is passed straight through — this module never reads
  // a host port or interprets any entry. AGENTLET_SERVER / AGENTLET_TOKEN
  // are injected by the daemon itself.
  const spawnEnv = env && Object.keys(env).length > 0 ? env : undefined;

  let sessionId: string;
  let pid: number;
  try {
    const result = await gateway.spawnOnAgentlet(agentlet.agentletId, {
      appId: threadId,
      ...(existingSessionId ? { sessionId: existingSessionId } : {}),
      sessionSpec: {
        ...(recipe.agentTeam
          ? { agentTeam: recipe.agentTeam }
          : { command: recipe.command, cwd: recipe.cwd }),
        autoRestart: recipe.autoRestart,
        idleTimeoutSecs,
        env: spawnEnv,
      },
    });
    sessionId = result.sessionId;
    pid = result.pid;
  } catch (err) {
    if (existingSessionId && isSessionResumeUnavailableError(err)) {
      throw new AcpServiceError(
        'session_resume_unavailable',
        `External agent '${recipe.alias}' can no longer resume session '${existingSessionId}'`,
      );
    }
    // The agentlet RPC itself rejected — typically a bad recipe
    // (command not found, cwd missing) or a daemon-side validation
    // failure. Preserve the daemon's message so the UI can surface
    // the specific reason (e.g. ENOENT path).
    const message = err instanceof Error ? err.message : String(err);
    throw new AcpServiceError(
      'spawn_failed',
      `Failed to spawn external agent '${recipe.alias}': ${message}`,
    );
  }

  // Wait for the agent's WS handshake to complete before reporting
  // success. If the agent never reaches `connected` within the window
  // we surface a `connect_timeout` — the spawn succeeded but the
  // process is silent. Common when the agent is blocked on
  // interactive auth (Copilot OAuth expired) or crashed on startup.
  const connected = await waitForAgentConnection(
    agentlet.agentletId,
    sessionId,
    3000,
  );
  if (!connected) {
    throw new AcpServiceError(
      'connect_timeout',
      `External agent '${recipe.alias}' started but did not respond within 3s. The agent may need to re-authenticate (e.g. Copilot OAuth) or has crashed on startup.`,
    );
  }

  threadToAgent.set(cacheKey, {
    connection: gateway.getSession(agentlet.agentletId, sessionId),
    sessionId,
    pid,
    agentletId: agentlet.agentletId,
  });
  return { agentletId: agentlet.agentletId, sessionId, pid };
}
export async function exerciseOriginalSpawn(){
 const recipe={command:"not-executed",alias:"cache"};await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");
 const first=spawns.length;await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");const warm=spawns.length;
 connection={sessionId:"native-cache",status:"connected"};
 await ensureAgentForThread("cache-machine","cache-thread",recipe,"native-cache");return {first,warm,replaced:spawns.length,priorIds:spawns.map(row=>row.sessionId)};
}