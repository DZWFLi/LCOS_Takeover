// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type { LcosRunCorrelation } from './provider-run-event-sink.js';
import type { AcpSessionEntry } from '@agenetes/acp-driver';

interface PendingProviderRunInput {
  readonly correlation: LcosRunCorrelation;
  readonly requestId: string;
  readonly optionIds: ReadonlySet<string>;
  readonly owner: AcpSessionEntry;
}

function key(correlation: LcosRunCorrelation, requestId: string): string {
  return `${correlation.lcosRunId}\u0000${correlation.externalTaskId}\u0000${requestId}`;
}

const pending = new Map<string, PendingProviderRunInput>();
interface ResolvedProviderRunInput {
  readonly optionId: string;
  readonly resolvedAt: number;
}

const resolved = new Map<string, ResolvedProviderRunInput>();
const RESOLVED_TTL_MS = 5 * 60 * 1000;
const RESOLVED_LIMIT = 256;

function pruneResolved(now = Date.now()): void {
  for (const [requestKey, value] of resolved) {
    if (now - value.resolvedAt > RESOLVED_TTL_MS) resolved.delete(requestKey);
  }
  while (resolved.size > RESOLVED_LIMIT) {
    const oldest = resolved.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    resolved.delete(oldest);
  }
}

export function registerProviderRunInput(
  correlation: LcosRunCorrelation,
  requestId: string,
  optionIds: readonly string[],
  owner: AcpSessionEntry,
): void {
  const requestKey = key(correlation, requestId);
  const existing = pending.get(requestKey);
  if (existing !== undefined && existing.owner !== owner) {
    throw new Error('Provider input correlation is already owned by another ACP session.');
  }
  pending.set(requestKey, {
    correlation,
    requestId,
    optionIds: new Set(optionIds),
    owner,
  });
}

export function removeProviderRunInput(
  correlation: LcosRunCorrelation,
  requestId: string,
): void {
  pending.delete(key(correlation, requestId));
}

export function answerProviderRunInput(
  correlation: LcosRunCorrelation,
  requestId: string,
  selectedOptions: readonly string[],
): 'answered' | 'not_found' | 'invalid_option' | 'not_pending' | 'answer_conflict' {
  const requestKey = key(correlation, requestId);
  pruneResolved();
  const selectedOption = selectedOptions[0] ?? '';
  const priorAnswer = resolved.get(requestKey);
  if (priorAnswer !== undefined) {
    return selectedOptions.length === 1 && selectedOption === priorAnswer.optionId
      ? 'answered'
      : 'answer_conflict';
  }
  const request = pending.get(requestKey);
  if (request === undefined) return 'not_found';
  if (
    selectedOptions.length !== 1 ||
    !request.optionIds.has(selectedOption)
  ) {
    return 'invalid_option';
  }
  const answered = request.owner.client.resolvePermission(requestId, {
    optionId: selectedOption,
  });
  if (!answered) {
    pending.delete(requestKey);
    return 'not_pending';
  }
  pending.delete(requestKey);
  resolved.set(requestKey, { optionId: selectedOption, resolvedAt: Date.now() });
  pruneResolved();
  return 'answered';
}

export function clearProviderRunInputsForTests(): void {
  pending.clear();
  resolved.clear();
}
