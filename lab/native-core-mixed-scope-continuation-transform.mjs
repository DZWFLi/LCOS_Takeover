import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const nativeCoreMixedScopeContinuationSource = 'lcos/apps/local-core/src/conversation-continuation-service.ts'
export const nativeCoreMixedScopeEvidenceSource = 'lcos/packages/contracts/src/continuation-provider.ts'
export const nativeCoreMixedScopeHostSource = 'lcos/huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts'
export const nativeCoreMixedScopeAcpSource = 'lcos/huabu/external/agenetes/packages/acp-driver/src/continuation-prompt.ts'

function canonical(source, sourcePath, relative, marker) {
  if (typeof source !== 'string') throw new TypeError('Original source text is required.')
  if (typeof sourcePath !== 'string' || path.resolve(sourcePath).toLowerCase() !== path.resolve(root, relative).toLowerCase())
    throw new Error('Mixed Scope adaptation requires its exact original sourcePath.')
  return source.includes(marker) ? null : source.replaceAll('\r\n', '\n')
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Mixed Scope source seam changed; no copied source was written.')
  return source.replace(before, after)
}
function importedReader(source, relative) {
  const specifier = path.relative(path.dirname(path.resolve(root, relative)), path.resolve(root, 'lab/pilot/mixed-scope-context.ts')).replaceAll('\\', '/')
  return "import { readMixedScopeContext, getRegisteredMixedScopeReadPort } from " + JSON.stringify(specifier.startsWith('.') ? specifier : './' + specifier) + '\n' + source
}

export function transformNativeCoreMixedScopeContinuation(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreMixedScopeContinuationSource, 'native-mixed-scope-continuation')
  if (next === null) return source
  const scopeBranch = [
    '      // native-mixed-scope-continuation: one original Scope reference, one atomic read.',
    "      if (ref.type === 'scope') {",
    "        if (mode !== 'full') return { ok: false, code: 'context_reference_resolution_unsupported', message: '整份 Scope 当前只支持完整正文；本次未发送。' }",
    '        try {',
    '          const scope = await readMixedScopeContext({ projectId, scopeId: ref.scopeId }, getRegisteredMixedScopeReadPort(this.metadata), { maxCharacters: CONTINUATION_CONTEXT_TOTAL_CHAR_LIMIT })',
    '          const scopeEvidence: ProviderContextResolutionEvidenceV1 = {',
    "            kind: 'scope', order: reference.order, mode, ref, title: scope.root.title,",
    '            scopeId: scope.scopeId, presentationId: scope.presentationId,',
    '            members: scope.evidence.map(member => ({ ...member })), text: scope.text,',
    '          }',
    '          if (frozen !== undefined && JSON.stringify(frozen) !== JSON.stringify(scopeEvidence)) {',
    "            return { ok: false, code: 'context_resolution_conflict', message: '这条消息已经读取过另一份 Scope 内容；原引用保留，请新建消息再使用更新内容。' }",
    '          }',
    '          totalChars += scope.text.length',
    '          if (totalChars > CONTINUATION_CONTEXT_TOTAL_CHAR_LIMIT) return {',
    "            ok: false, code: 'context_budget_exceeded', message: '完整 Scope 超出本条消息的正文额度，本次未发送任何部分。',",
    '          }',
    "          resolved.push({ order: reference.order, mode, ref, title: scope.root.title, mimeType: 'text/plain', text: scope.text })",
    '          evidence.push(scopeEvidence)',
    '          continue',
    '        } catch (error) {',
    "          return { ok: false, code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'context_content_unavailable',",
    "            message: error instanceof Error ? error.message : '完整 Scope 暂时无法读取，本次未发送。' }",
    '        }',
    '      }',
    "      if (frozen?.kind === 'scope') return { ok: false, code: 'context_resolution_conflict', message: 'Scope evidence cannot replace an Artifact reference.' }",
    '      let artifactId: string',
    '',
  ].join('\n')
  if (next.includes('      let title: string, text: string, itemEvidence: ProviderContextResolutionEvidenceV1')) {
    const currentBranch = scopeBranch.replaceAll('frozen', 'retained')
      .replace("      if (retained?.kind === 'scope')", "      if (retained && 'scopeId' in retained)")
      .replace('      let artifactId: string\n', '')
    next = once(next, '      let title: string, text: string, itemEvidence: ProviderContextResolutionEvidenceV1', currentBranch + '      let title: string, text: string, itemEvidence: ProviderContextResolutionEvidenceV1')
  } else next = once(next, '      let artifactId: string\n', scopeBranch)
  next = once(next, "        ? { attachReceipt: receipt }", "        ? { attachReceipt: existing?.attachReceipt?.outcome === 'attached' && existing.contextResolution?.some(item => 'kind' in item && item.kind === 'scope') ? existing.attachReceipt : receipt }")
  if (next.includes('Resolve only artifact-backed')) next = once(next, '  /** Resolve only artifact-backed references into ACP embedded text. Other kinds stay honest unsupported. */', '  /** Original message-scoped resolver: exact files and complete mixed Scope, with no partial sends. */')
  return importedReader(next, nativeCoreMixedScopeContinuationSource)
}

export function transformNativeCoreMixedScopeEvidence(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreMixedScopeEvidenceSource, 'native-mixed-scope-evidence')
  if (next === null) return source
  if (next.includes('export type ProviderContextResolutionEvidenceV1 =')) {
    next = once(next, 'export type ProviderContextResolutionEvidenceV1 =\n  | ProviderArtifactContextResolutionEvidenceV1\n  | ProviderCollectionContextResolutionEvidenceV1', [
      '// native-mixed-scope-evidence: preserve original Artifact and Collection evidence.',
      'export interface ProviderScopeContextResolutionEvidenceV1 {',
      "  readonly kind: 'scope'",
      '  readonly order: number',
      "  readonly mode: 'full'",
      "  readonly ref: Extract<OrderedRunReferenceV2['ref'], { readonly type: 'scope' }>",
      '  readonly scopeId: string',
      '  readonly presentationId: string',
      '  readonly title: string',
      '  readonly members: readonly Readonly<Record<string, unknown>>[]',
      '  readonly text: string',
      '}',
      'export type ProviderContextResolutionEvidenceV1 =',
      '  | ProviderArtifactContextResolutionEvidenceV1',
      '  | ProviderCollectionContextResolutionEvidenceV1',
      '  | ProviderScopeContextResolutionEvidenceV1',
    ].join('\n'))
    return next
  }
  next = once(next, 'export interface ProviderContextResolutionEvidenceV1 {', [
    '// native-mixed-scope-evidence: existing journal/attachment evidence, real heterogeneous identities.',
    'export type ProviderContextResolutionEvidenceV1 =',
    '  | ProviderArtifactContextResolutionEvidenceV1',
    '  | ProviderScopeContextResolutionEvidenceV1',
    '',
    'export interface ProviderScopeContextResolutionEvidenceV1 {',
    "  readonly kind: 'scope'",
    '  readonly order: number',
    "  readonly mode: 'full'",
    "  readonly ref: Extract<OrderedRunReferenceV2['ref'], { readonly type: 'scope' }>",
    '  readonly scopeId: string',
    '  readonly presentationId: string',
    '  readonly title: string',
    '  readonly members: readonly Readonly<Record<string, unknown>>[]',
    '  /** Notes and Runs have no file revision; existing receipt text supports exact retry comparison. */',
    '  readonly text: string',
    '}',
    '',
    'export interface ProviderArtifactContextResolutionEvidenceV1 {',
    "  readonly kind?: 'artifact'",
  ].join('\n'))
  return next
}

export function transformNativeCoreMixedScopeHost(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreMixedScopeHostSource, 'native-mixed-scope-host')
  if (next === null) return source
  next = once(next, [
    '      const base = asReference(item);',
    '      if (',
    '        base === undefined ||',
    '        !isRecord(item) ||',
    "        typeof item.artifactId !== 'string' ||",
  ].join('\n'), [
    '      const base = asReference(item);',
    '      // native-mixed-scope-host: keep original manifest/session/message owner.',
    "      if (base !== undefined && isRecord(item) && item.kind === 'scope') {",
    "        if (base.ref.type !== 'scope' || base.mode !== 'full'",
    "          || typeof item.scopeId !== 'string' || item.scopeId !== base.ref.scopeId",
    "          || typeof item.presentationId !== 'string' || item.presentationId.trim() === ''",
    "          || typeof item.title !== 'string' || item.title.trim() === ''",
    "          || typeof item.text !== 'string' || item.text.trim() === '' || item.text.length > 200_000",
    '          || !Array.isArray(item.members) || item.members.length === 0',
    "          || item.members.some(member => !isRecord(member) || !isRecord(member.ref) || typeof member.ref.type !== 'string' || typeof member.ref.id !== 'string' || !Array.isArray(member.path)))",
    '          return undefined;',
    "        return { ...base, kind: 'scope', scopeId: item.scopeId, presentationId: item.presentationId,",
    '          title: item.title, text: item.text, members: item.members };',
    '      }',
    '      if (',
    '        base === undefined ||',
    '        !isRecord(item) ||',
    "        typeof item.artifactId !== 'string' ||",
  ].join('\n'))
  next = once(next, '      ordered.mode !== resolved.mode\n', "      (ordered.mode ?? 'full') !== (resolved.mode ?? 'full')\n")
  next = once(next, '      resolution.title !== resolved.title\n', "      resolution.title !== resolved.title ||\n      ('kind' in resolution && resolution.kind === 'scope' && resolution.text !== resolved.text)\n")
  return next
}

export function transformNativeCoreMixedScopeAcp(source, { sourcePath } = {}) {
  let next = canonical(source, sourcePath, nativeCoreMixedScopeAcpSource, 'native-mixed-scope-acp')
  if (next === null) return source
  next = once(next, 'export interface AcpContinuationResolutionEvidence extends AcpContinuationReference {', [
    '// native-mixed-scope-acp: original ACP resources retain actual Scope provenance.',
    'export type AcpContinuationResolutionEvidence =',
    '  | AcpArtifactContinuationResolutionEvidence',
    '  | AcpScopeContinuationResolutionEvidence',
    '',
    'export interface AcpScopeContinuationResolutionEvidence extends AcpContinuationReference {',
    "  readonly kind: 'scope';",
    '  readonly scopeId: string;',
    '  readonly presentationId: string;',
    '  readonly title: string;',
    '  readonly members: readonly Readonly<Record<string, unknown>>[];',
    '  readonly text: string;',
    '}',
    '',
    'export interface AcpArtifactContinuationResolutionEvidence extends AcpContinuationReference {',
    "  readonly kind?: 'artifact';",
  ].join('\n'))
  next = once(next, [
    '                  resolution: {',
    '                    artifactId: resolution.artifactId,',
    '                    revisionId: resolution.revisionId,',
    '                    contentHash: resolution.contentHash,',
    '                  },',
  ].join('\n'), [
    "                  resolution: resolution.kind === 'scope'",
    "                    ? { kind: 'scope', scopeId: resolution.scopeId, presentationId: resolution.presentationId, members: resolution.members }",
    '                    : { artifactId: resolution.artifactId, revisionId: resolution.revisionId, contentHash: resolution.contentHash },',
  ].join('\n'))
  return next
}

export function createNativeCoreMixedScopeContinuationTransforms() {
  return {
    [nativeCoreMixedScopeContinuationSource]: transformNativeCoreMixedScopeContinuation,
    [nativeCoreMixedScopeEvidenceSource]: transformNativeCoreMixedScopeEvidence,
    [nativeCoreMixedScopeHostSource]: transformNativeCoreMixedScopeHost,
    [nativeCoreMixedScopeAcpSource]: transformNativeCoreMixedScopeAcp,
  }
}
