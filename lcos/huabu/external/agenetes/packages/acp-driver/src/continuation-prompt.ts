import { reportEntryState } from './session.js';

import type { PermissionNotifier } from './client.js';
import type { AcpSessionEntry } from './session-registry.js';
import type {
  ContentBlock as AcpContentBlock,
  SessionUpdate,
} from '@agentclientprotocol/sdk';

export interface AcpContinuationPromptReceipt {
  readonly text: string;
  readonly stopReason?: string;
}

export interface AcpContinuationReference {
  readonly order: number;
  readonly mode?: 'full' | 'summary' | 'structure';
  readonly ref: Readonly<Record<string, string | undefined>> & {
    readonly type: string;
  };
}

export interface AcpContinuationResolutionEvidence extends AcpContinuationReference {
  readonly artifactId: string;
  readonly revisionId: string;
  readonly fileRecordId: string;
  readonly contentHash: string;
  readonly title: string;
}

export interface AcpContinuationContextManifest {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly orderedReferences: readonly AcpContinuationReference[];
  readonly contextResolution: readonly AcpContinuationResolutionEvidence[];
}

export interface AcpContinuationContextAttachment extends AcpContinuationContextManifest {
  readonly resolvedReferences: readonly AcpResolvedContinuationReference[];
}

export interface AcpResolvedContinuationReference extends AcpContinuationReference {
  readonly title: string;
  readonly mimeType: 'text/plain';
  readonly text: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textFromUpdate(update: SessionUpdate): string {
  const envelope = record(update);
  const content = record(envelope?.content);
  return envelope?.sessionUpdate === 'agent_message_chunk' &&
    content?.type === 'text' &&
    typeof content.text === 'string'
    ? content.text
    : '';
}

function referenceIdentity(reference: AcpContinuationReference): string {
  const ref = reference.ref;
  return (
    ref.artifactId ??
    ref.viewId ??
    ref.scopeId ??
    ref.workspaceId ??
    ref.conversationSessionId ??
    ref.componentId ??
    'unknown'
  );
}

/**
 * LCOS only claims provider attach when the live agent advertises ACP
 * embeddedContext. Core resolves the selected immutable revision and this
 * helper binds that evidence to the same session/prompt without daemon files.
 */
export function continuationReferenceBlocks(
  attachment: AcpContinuationContextAttachment,
): AcpContentBlock[] {
  return [...attachment.resolvedReferences]
    .sort((left, right) => left.order - right.order)
    .map((reference) => {
      const identity = referenceIdentity(reference);
      const resolution = attachment.contextResolution.find(
        (item) => item.order === reference.order,
      );
      return {
        type: 'resource' as const,
        resource: {
          uri: `lcos://reference/${encodeURIComponent(reference.ref.type)}/${encodeURIComponent(identity)}`,
          mimeType: reference.mimeType,
          text: reference.text,
        },
        _meta: {
          lcos: {
            attachmentId: attachment.attachmentId,
            messageId: attachment.messageId,
            correlationId: attachment.correlationId,
            order: reference.order,
            mode: reference.mode ?? 'full',
            ref: reference.ref,
            ...(resolution === undefined
              ? {}
              : {
                  resolution: {
                    artifactId: resolution.artifactId,
                    revisionId: resolution.revisionId,
                    contentHash: resolution.contentHash,
                  },
                }),
          },
        },
      };
    });
}

/**
 * Send through the already-registered ACP owner. This is intentionally the
 * only continuation prompt helper: it waits for selection replay, collects
 * agent text, and promotes the first successful prompt into the existing
 * durable entry/report path. It never creates a client or writes raw frames.
 */
export async function promptExistingAcpSession(
  entry: AcpSessionEntry,
  text: string,
  contextAttachment?: AcpContinuationContextAttachment,
  signal?: AbortSignal,
  onPermissionRequest?: PermissionNotifier,
): Promise<AcpContinuationPromptReceipt> {
  if (entry.selectionsReplay !== null) await entry.selectionsReplay;
  let assembled = '';
  const blocks: AcpContentBlock[] = [
    ...(contextAttachment === undefined
      ? []
      : continuationReferenceBlocks(contextAttachment)),
    { type: 'text', text },
  ];
  const result = await entry.client.prompt(
    entry.sessionId,
    blocks,
    (update) => {
      assembled += textFromUpdate(update);
    },
    signal,
    onPermissionRequest ??
      ((request) => {
        // A continuation without an LCOS-correlated input owner still fails
        // closed. The Host route supplies a notifier only after validating
        // the canonical Run + external Task correlation.
        entry.client.resolvePermission(request.requestId, { cancelled: true });
      }),
  );
  if (!entry.persistedToDisk) {
    entry.persistedToDisk = true;
    reportEntryState(entry);
  }
  return {
    text: assembled,
    ...(result.stopReason === undefined
      ? {}
      : { stopReason: result.stopReason }),
  };
}
