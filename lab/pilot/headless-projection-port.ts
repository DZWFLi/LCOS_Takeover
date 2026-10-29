import { HuabuRfsClient } from '../../lcos/apps/web-gen2/src/spatial/huabuRfsClient.ts'
import { executeSpaceQuery } from '../../lcos/huabu/apps/server/src/modules/canvas/space-query.ts'

/** An in-process transport port, not fabricated RFS responses. The existing
 * projector runs unchanged against the existing Huabu query/executor owners. */
export function createHeadlessProjectionPort({ canvasId, coreOrigin, read, execute }: {
  canvasId: string; coreOrigin: string;
  read(canvasId: string): Promise<any>;
  execute(canvasId: string, commands: unknown[]): Promise<any>;
}) {
  const prefix = '/api/rfs/' + encodeURIComponent(canvasId)
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin !== new URL(coreOrigin).origin || ![prefix + '/query', prefix + '/execute'].includes(url.pathname) || method !== 'POST') {
      return Response.json({ error: 'Unregistered headless projection address.' }, { status: 501 })
    }
    if (init?.signal?.aborted) throw new DOMException('Projection cancelled.', 'AbortError')
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : '')
    if (typeof raw !== 'string') return Response.json({ error: 'Expected typed JSON from the existing RFS client.' }, { status: 400 })
    const body = JSON.parse(raw)
    if (!await read(canvasId)) return Response.json({ error: 'No owned spatial canvas.' }, { status: 404 })
    if (url.pathname.endsWith('/query')) {
      if (!['GET_SPACE_OUTLINE', 'INSPECT_NODES'].includes(body?.type)) return Response.json({ error: 'Query is not used by this projection port.' }, { status: 501 })
      return Response.json(await executeSpaceQuery(canvasId, body))
    }
    if (!Array.isArray(body?.commands) || body.commands.length > 200) return Response.json({ error: 'Expected bounded existing RFS commands.' }, { status: 400 })
    return Response.json(await execute(canvasId, body.commands))
  }
  return new HuabuRfsClient({ canvasId, baseUrl: coreOrigin, bearerToken: '', fetch: transport })
}
