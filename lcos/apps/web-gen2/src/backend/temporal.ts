import type { TemporalIndexV1 } from '@local-creative-os/contracts';

import type { HttpClient } from './client.js';

export class CoreTemporalClient {
  constructor(private readonly http: HttpClient) {}

  getIndex(projectId: string, workspaceId: string, signal?: AbortSignal): Promise<{ ok: true; value: TemporalIndexV1 }> {
    return this.http.getJson(
      `/projects/${encodeURIComponent(projectId)}/temporal-index?workspaceId=${encodeURIComponent(workspaceId)}`,
      signal,
    );
  }
}
