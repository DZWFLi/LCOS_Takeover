import type { CapabilityClaimV1 } from '@local-creative-os/contracts'
import type { HuabuAgentletSessionInfoV1, HuabuAgentletTransportV1 } from './huabu-agentlet-continuation-adapter.js'

/**
 * DEV-ONLY Fake transport（MOCK / FIXTURE，禁止视为生产能力）。
 * 用于：受控测试 + dev 演示（`LCOS_RECOVERY_TRANSPORT=fake`）。
 * 生产 transport 需真实 Huabu Agentlet gateway（EXTERNAL_GAP，未接线）。
 */
export class DevFakeAgentletTransportV1 implements HuabuAgentletTransportV1 {
  static lastInstance: DevFakeAgentletTransportV1 | undefined
  readonly kind = 'dev-fake'
  spawnCalls = 0
  promptCalls = 0
  private sessionIds: readonly HuabuAgentletSessionInfoV1[] = []
  private failNextSpawn = false
  private failNextPrompt = false
  private emptyNextPrompt = false

  constructor() { DevFakeAgentletTransportV1.lastInstance = this }

  seedSessions(sessions: readonly HuabuAgentletSessionInfoV1[]): void {
    this.sessionIds = sessions
  }

  failNextSpawnOnce(): void {
    this.failNextSpawn = true
  }

  failNextPromptOnce(): void { this.failNextPrompt = true }

  sendEmptyPromptOnce(): void { this.emptyNextPrompt = true }

  async spawn(params: { readonly agentletId: string; readonly appId: string; readonly sessionId?: string }): Promise<{ readonly sessionId: string; readonly pid: number; readonly cwd?: string }> {
    this.spawnCalls += 1
    if (this.failNextSpawn) {
      this.failNextSpawn = false
      throw new Error('dev-fake spawn timed out (injected)')
    }
    return { sessionId: params.sessionId ?? `dev-fake-session-${this.spawnCalls}`, pid: 4242, cwd: '/tmp/dev-fake' }
  }

  async stop(_params: { readonly agentletId: string; readonly sessionId: string }): Promise<{ readonly stopped: boolean }> {
    return { stopped: true }
  }

  async list(_agentletId: string): Promise<{ readonly agents: readonly HuabuAgentletSessionInfoV1[] }> {
    return { agents: this.sessionIds }
  }

  async getSession(_agentletId: string, sessionId: string): Promise<HuabuAgentletSessionInfoV1 | undefined> {
    return this.sessionIds.find((session) => session.sessionId === sessionId)
  }

  async sendResource(): Promise<void> {
    /* noop */
  }

  async sendPrompt(params: { readonly threadId: string; readonly externalSessionId: string; readonly transportSessionId?: string; readonly text: string }): Promise<{ readonly externalSessionId: string; readonly transportSessionId: string; readonly threadId: string; readonly text: string; readonly stopReason: string }> {
    this.promptCalls += 1
    if (this.failNextPrompt) {
      this.failNextPrompt = false
      throw new Error('dev-fake provider rejected prompt')
    }
    if (this.emptyNextPrompt) {
      this.emptyNextPrompt = false
      return {
        externalSessionId: params.externalSessionId,
        transportSessionId: params.transportSessionId ?? params.externalSessionId,
        threadId: params.threadId,
        text: '',
        stopReason: 'end_turn',
      }
    }
    return {
      externalSessionId: params.externalSessionId,
      transportSessionId: params.transportSessionId ?? params.externalSessionId,
      threadId: params.threadId,
      text: `dev-fake response: ${params.text}`,
      stopReason: 'end_turn',
    }
  }

  async probe(): Promise<{ readonly session: Readonly<Partial<Record<'createSession' | 'continueExisting' | 'attachContext' | 'send' | 'status' | 'cancel' | 'recoverExisting', CapabilityClaimV1>>>; readonly limitations?: readonly string[] }> {
    return { session: {}, limitations: ['dev-fake transport（MOCK，非生产能力）'] }
  }
}
