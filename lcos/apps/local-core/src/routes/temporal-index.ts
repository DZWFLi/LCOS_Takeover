import type { IncomingMessage, ServerResponse } from 'node:http'

import type { SqliteMetadataRepository } from '../metadata-repository.js'
import { projectTemporalIndex } from '../temporal-index-projector.js'
import { routeRequireProject, type RouteHttpHelpers } from './route-context.js'

export interface TemporalIndexRouteContext {
  readonly method: string
  readonly pathname: string
  readonly url: URL
  readonly request: IncomingMessage
  readonly response: ServerResponse
  readonly metadata: SqliteMetadataRepository | undefined
  readonly helpers: RouteHttpHelpers
}

export function handleTemporalIndexRoute(ctx: TemporalIndexRouteContext): boolean {
  const match = /^\/projects\/([^/]+)\/temporal-index$/.exec(ctx.pathname)
  if (match === null) return false
  if (ctx.method !== 'GET') {
    ctx.helpers.sendJson(ctx.response, 405, ctx.helpers.failure('INVALID_ARGUMENT', 'Temporal index route accepts GET only.'))
    return true
  }
  if (ctx.metadata === undefined) {
    ctx.helpers.sendJson(ctx.response, 503, ctx.helpers.failure('UNAVAILABLE', 'Metadata repository is not configured.'))
    return true
  }
  const projectId = decodeURIComponent(match[1] ?? '')
  if (routeRequireProject(projectId, { metadata: ctx.metadata, response: ctx.response, helpers: ctx.helpers }) === undefined) return true
  const workspaceId = ctx.url.searchParams.get('workspaceId')?.trim()
  if (!workspaceId) {
    ctx.helpers.sendJson(ctx.response, 400, ctx.helpers.failure('INVALID_ARGUMENT', 'workspaceId is required.'))
    return true
  }
  const graph = ctx.metadata.get(projectId)
  if (graph === undefined) {
    ctx.helpers.sendJson(ctx.response, 404, ctx.helpers.failure('NOT_FOUND', 'Project graph not found.'))
    return true
  }
  const value = projectTemporalIndex(graph, ctx.metadata, workspaceId)
  if (value === undefined) {
    ctx.helpers.sendJson(ctx.response, 404, ctx.helpers.failure('NOT_FOUND', 'Workspace not found in project.'))
    return true
  }
  ctx.helpers.sendJson(ctx.response, 200, { ok: true, value })
  return true
}
