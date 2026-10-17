// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type { PermissionNotifier } from '@agenetes/acp-driver';

export interface LcosRunCorrelation {
  readonly lcosRunId: string;
  readonly externalTaskId: string;
}

type AcpPermissionRequest = Parameters<PermissionNotifier>[0];

export async function forwardAcpPermissionRequestToCore(
  coreBaseUrl: string,
  coreApiToken: string,
  correlation: LcosRunCorrelation,
  request: AcpPermissionRequest,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (
    correlation.lcosRunId.trim() === '' ||
    correlation.externalTaskId.trim() === '' ||
    request.requestId.trim() === '' ||
    request.options.some((option) => option.optionId.trim() === '')
  ) {
    throw new Error('ACP permission_request requires non-empty Run, Task, request and option ids.');
  }
  const response = await fetcher(
    new URL('/runtime/provider-events', coreBaseUrl),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${coreApiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contractVersion: 'provider-run-event-v1',
        type: 'waiting_input',
        correlation: {
          lcosRunId: correlation.lcosRunId.trim(),
          externalTaskId: correlation.externalTaskId.trim(),
        },
        request: {
          requestId: request.requestId.trim(),
          prompt:
            request.toolCall.title?.trim() ||
            'Provider requests permission to continue.',
          // Core returns these opaque option ids through the existing Run
          // answer route. The Bridge/ACP owner maps the selected id back to
          // the suspended request; display labels never become protocol ids.
          options: request.options.map((option) => option.optionId.trim()),
          allowFreeText: false,
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Local Core rejected ACP permission_request (${response.status})${detail === '' ? '' : `: ${detail}`}`,
    );
  }
}
