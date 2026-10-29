// Compatibility for the inspected Qwen session runtime MCP endpoints. Their
// original manager updates its registry but leaves an already loaded model's
// function declarations stale. Reuse the provider's own setTools refresh.
const marker = '/* LCOS refresh original session MCP declarations. */';
const add = 'const session=this.sessionOrThrow(sessionId2);return addRuntimeMcpServer(getRuntimeMcpManager(session.getConfig()),readRuntimeMcpAddRequest(params))}case SERVE_CONTROL_EXT_METHODS.sessionMcpRuntimeRemove:';
const remove = 'const result=await getRuntimeMcpManager(session.getConfig()).removeRuntimeMcpServer(request.name,request.runtimeClientId);return result}case SERVE_CONTROL_EXT_METHODS.workspaceExtensionsRefresh:';
export async function persistNativeEmptySession(config) {
  const recording = config.getChatRecordingService?.();
  if (typeof recording?.recordSessionApprovalMode !== 'function' || typeof recording.flush !== 'function')
    throw new Error('Original empty session recording is unavailable.');
  const mode = config.getApprovalMode();
  const payload = { mode, ...(mode === 'plan' ? { prePlanMode: config.getPrePlanMode?.() ?? 'default',
    ...(config.getPlanExecutionMode?.() ? { planExecutionMode: config.getPlanExecutionMode() } : {}) } : {}) };
  // A real original system metadata record makes a zero-message session
  // discoverable by the provider's own restore path. No synthetic chat turn,
  // changed approval mode, manual JSONL, or bypass of its writer lease.
  if (await recording.recordSessionApprovalMode(payload) !== true)
    throw new Error('Original empty session recording was not confirmed.');
  await recording.flush();
}

export function transformNativeProviderSessionMcp(source, { declarationEvidence = true, emptySessionRecord = true } = {}) {
  if (source.includes(marker)) return source;
  if (source.split(add).length !== 2 || source.split(remove).length !== 2)
    throw new Error('The inspected original session MCP refresh seams changed.');
  let result = marker + '\n' + source.replace(add, 'const session=this.sessionOrThrow(sessionId2);const result=await addRuntimeMcpServer(getRuntimeMcpManager(session.getConfig()),readRuntimeMcpAddRequest(params));const client=session.getConfig().getLlmClient?.();if(client?.isInitialized?.())await client.setTools();return result}case SERVE_CONTROL_EXT_METHODS.sessionMcpRuntimeRemove:')
    .replace(remove, 'const result=await getRuntimeMcpManager(session.getConfig()).removeRuntimeMcpServer(request.name,request.runtimeClientId);const client=session.getConfig().getLlmClient?.();if(client?.isInitialized?.())await client.setTools();return result}case SERVE_CONTROL_EXT_METHODS.workspaceExtensionsRefresh:');
  if (declarationEvidence) {
    const before = 'mcpTools:usage.mcpTools,memoryFiles:usage.memoryFiles';
    if (result.split(before).length !== 2) throw new Error('The original session tool status seam changed.');
    result = result.replace(before, 'mcpTools:usage.mcpTools.map(tool=>({...tool,lcosModelToolNames:config.getLlmClient?.().isInitialized?.()?(config.getLlmClient().getChat().getGenerationConfig().tools??[]).flatMap(group=>(group.functionDeclarations??[]).map(item=>item.name)):null})),memoryFiles:usage.memoryFiles');
  }
  if (emptySessionRecord) {
    const before = 'profiler.timeSync("file_system_setup",()=>this.setupFileSystem(config))}session=await profiler.time("session_register",()=>this.createAndStoreSession(config,settings,void 0,';
    if (result.split(before).length !== 2) throw new Error('The original new-session recording seam changed.');
    result = result.replace(before, 'profiler.timeSync("file_system_setup",()=>this.setupFileSystem(config));await persistNativeEmptySession(config)}session=await profiler.time("session_register",()=>this.createAndStoreSession(config,settings,void 0,');
    result += '\n' + persistNativeEmptySession.toString() + '\n';
  }
  return result;
}
