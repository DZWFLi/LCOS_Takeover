export function createOriginalTargetProbe(metadata, recoveryAdapter, liveContinuationTransport) { return (recoveryAdapter === undefined
    ? undefined
    : async (target?: { projectId: string; connectedConversationId: string }) => {
        try {
          const snapshot = await recoveryAdapter.probe({
            provider: recoveryAdapter.provider,
            adapterId: recoveryAdapter.adapterId,
            probeId: `collab-read:${Date.now()}`,
          })
          // Read only the same original transport and canonical identity; journal bind alone is not a live owner.
          if (liveContinuationTransport === undefined || target === undefined || metadata === undefined) return snapshot
          const connected = metadata.getConnectedConversation(target.projectId, target.connectedConversationId)
          const session = connected?.conversationSessionId === undefined ? undefined : metadata.getConversationSessionRuntimeIdentity(target.projectId, connected.conversationSessionId)
          const origin = session?.originMeta
          const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value === value.trim()
          const trusted = connected !== undefined && session !== undefined && session.provider === connected.provider
            && origin?.continuationProvider === connected.provider && origin.continuationExternalSessionId === connected.conversationRef
            && text(origin.continuationExternalSessionId) && text(origin.continuationTransportSessionId)
            && text(origin.continuationThreadId) && text(origin.continuationAgentletId) && origin.continuationRuntimeScope === target.projectId
            && origin.continuationAgentletId === (process.env.HUABU_AGENTLET_ID ?? "lcos-default-agentlet")
          const unavailable = (reason: string, untrusted = false) => ({ ...snapshot, session: { ...snapshot.session,
            send: { value: "unknown" as const, source: "gateway_probe" as const, observedAt: new Date().toISOString(), limitation: reason },
            ...(untrusted ? { continueExisting: { value: "unknown" as const, source: "protocol_inspection" as const, observedAt: new Date().toISOString(), limitation: reason } } : {}),
          } })
          if (!trusted || origin === undefined) return unavailable("暂时无法恢复这条对话，请重新连接。", true)
          try {
            const observed = await liveContinuationTransport.getSession(origin.continuationAgentletId as string, origin.continuationTransportSessionId as string)
            if (observed === undefined || observed.status !== "connected"
              || observed.externalSessionId !== origin.continuationExternalSessionId
              || observed.transportSessionId !== origin.continuationTransportSessionId
              || observed.threadId !== origin.continuationThreadId) return unavailable("会话已断开，请重新连接。")
            return snapshot
          } catch { return unavailable("暂时无法连接，请核对或重新连接。") }
        } catch {
          return undefined
        }
      }); }
