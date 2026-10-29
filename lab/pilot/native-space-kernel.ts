import { spaceQuerySchema, rfsExecuteRequestSchema } from '../../lcos/huabu/packages/shared/src/types/api/space-operations.ts';
import { getRfsCapabilities, getQueryCapability, getCommandCapability } from '../../lcos/huabu/apps/server/src/modules/remote_fs/space-capabilities.ts';
import { executeSpaceQuery } from '../../lcos/huabu/apps/server/src/modules/canvas/space-query.ts';
import type { NativeCanvasOwner } from './native-canvas-sync-stream.ts';
import type { createNativeCanvasGuiMarkers } from './native-canvas-gui-markers.ts';
import { NativeCanvasGuiMarkerError } from './native-canvas-gui-markers.ts';

type CanvasRead = { version: number; state: { nodes: Array<{ id: string }> } };
type GeometryItem = { nodeId: string; position?: { x: number; y: number }; size?: { width?: number; height?: number | 'auto' } };
export type NativeNodeEmphasisPatch = { nodeId: string; patch: { lcos_gui_emphasis: boolean } };
export interface NativeSpaceKernelOptions {
  resolveCanvas(canvasId: string): NativeCanvasOwner | undefined | Promise<NativeCanvasOwner | undefined>;
  readCanvas(canvasId: string): Promise<CanvasRead | undefined | null>;
  commitGeometry(canvasId: string, items: GeometryItem[]): Promise<unknown>;
  commitPresentation?(canvasId: string, patches: NativeNodeEmphasisPatch[]): Promise<unknown>;
  gui?: ReturnType<typeof createNativeCanvasGuiMarkers>;
}
export class NativeSpaceKernelError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'NativeSpaceKernelError'; }
}
const queryTypes = ['GET_SPACE_OUTLINE', 'INSPECT_NODES', 'INSPECT_EDGES'] as const;
const sameOwner = (a: NativeCanvasOwner, b?: NativeCanvasOwner) => !!b && a.projectId === b.projectId
  && a.workspaceId === b.workspaceId && a.canvasId === b.canvasId;
const fail = (status: number, code: string, message: string): never => { throw new NativeSpaceKernelError(status, code, message); };
/** Thin same-process access to the original structural query producer. Core
 * identities and geometry persistence remain owned by the injected facade. */
export function createNativeSpaceKernel(options: NativeSpaceKernelOptions) {
  async function owner(canvasId: string) {
    if (!canvasId || /[\\/\u0000-\u001f]/.test(canvasId)) fail(400, 'INVALID_CANVAS_ID', 'Invalid Canvas identifier.');
    const value = await options.resolveCanvas(canvasId);
    if (!value || value.canvasId !== canvasId || !value.projectId || !value.workspaceId)
      fail(404, 'CANVAS_NOT_REGISTERED', 'This Canvas is not an opened project workspace.');
    return value!;
  }
  async function unchanged(expected: NativeCanvasOwner) {
    if (!sameOwner(expected, await options.resolveCanvas(expected.canvasId)))
      fail(409, 'CANVAS_OWNER_CHANGED', 'The opened Canvas workspace changed.');
  }
  async function canvas(canvasId: string) {
    const value = await options.readCanvas(canvasId);
    if (!value || !Number.isSafeInteger(value.version) || value.version < 0 || !Array.isArray(value.state?.nodes))
      fail(409, 'CANVAS_STATE_UNAVAILABLE', 'The original Canvas state could not be read.');
    return value!;
  }
  async function capabilities(canvasId: string) {
    await owner(canvasId);
    const original = getRfsCapabilities();
    return { protocolVersion: original.protocolVersion, permissions: original.permissions, execution: original.execution,
      limits: { queryDefault: original.limits.queryDefault, queryMax: original.limits.queryMax, executeMaxCommands: 1 },
      queryTypes: [...queryTypes], commandTypes: ['SET_NODE_GEOMETRY', ...(options.commitPresentation ? ['MERGE_NODE_DATA'] : [])],
      ...(options.gui ? { guiTypes: options.gui.capabilities().operations } : {}),
      links: { query: 'query', execute: 'execute', ...(options.gui ? { gui: 'gui' } : {}) },
      notes: ['Structural queries only; body previews and file content use their original Core owners.',
        'Execute returns the original nodes:batchActions geometry receipt, including failure or partial commit; it is not the full RfsExecuteResponse.',
        'Exactly one position-only geometry or connected boolean-emphasis command. External resizing, content writes, Run execution and runId attribution are not connected by this subset.',
        ...(options.gui ? options.gui.capabilities().notes : [])] };
  }
  async function queryCapability(canvasId: string, type: string) {
    await owner(canvasId);
    if (!(queryTypes as readonly string[]).includes(type)) fail(404, 'SPACE_QUERY_NOT_CONNECTED', 'This Space query is not connected.');
    const capability = getQueryCapability(type)!;
    if (type !== 'GET_SPACE_OUTLINE') return capability;
    const schema = structuredClone(capability.schema) as Record<string, any>;
    if (schema.properties?.includePreviews) schema.properties.includePreviews = { ...schema.properties.includePreviews, const: false };
    return { ...capability, schema, constraints: [...capability.constraints, 'Body previews are not connected; use the original Core content reference.'] };
  }
  async function commandCapability(canvasId: string, type: string) {
    await owner(canvasId);
    if (type === 'MERGE_NODE_DATA' && options.commitPresentation) return {
      ...getCommandCapability(type)!,
      schema: { type: 'object', properties: { type: { const: 'MERGE_NODE_DATA' },
        patches: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', properties: {
          nodeId: { type: 'string', minLength: 1 }, patch: { type: 'object', properties: {
            lcos_gui_emphasis: { type: 'boolean', description: 'True emphasizes this existing node; false clears its saved visual emphasis.' },
          }, required: ['lcos_gui_emphasis'], additionalProperties: false },
        }, required: ['nodeId', 'patch'], additionalProperties: false } },
      }, required: ['type', 'patches'], additionalProperties: false,
      description: 'Save or clear existing-node visual emphasis only. No content, title, geometry, Run or stage changes.' },
      examples: [{ type: 'MERGE_NODE_DATA', patches: [{ nodeId: 'node-123', patch: { lcos_gui_emphasis: true } }] }],
      constraints: ['Exactly one command; only patches[].patch.lcos_gui_emphasis boolean is connected.',
        'Use the current canvas and existing node IDs. Locked nodes and changed owners retain their original protections.',
        'The original node save receipt is returned; a failed or unknown write must not be replayed automatically.'],
    };
    if (type !== 'SET_NODE_GEOMETRY') fail(404, 'SPACE_COMMAND_NOT_CONNECTED', 'This Space command is not connected.');
    const capability = getCommandCapability(type)!;
    const schema = structuredClone(capability.schema) as Record<string, any>;
    function restrictSize(value: any) {
      if (!value || typeof value !== 'object') return;
      if (value.properties?.size) {
        delete value.properties.size;
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') restrictSize(child);
    }
    restrictSize(schema);
    return { ...capability, schema, constraints: [...capability.constraints,
      'This connected subset accepts exactly one geometry command and returns the original nodes:batchActions receipt.',
      'Only position is connected. External resizing and runId attribution are not connected.'] };
  }
  async function query(canvasId: string, body: unknown) {
    const expected = await owner(canvasId);
    const parsed = spaceQuerySchema.safeParse(body);
    if (!parsed.success) fail(400, 'SPACE_QUERY_INVALID', parsed.error.issues[0]?.message ?? 'Invalid Space query.');
    const request = parsed.data!;
    if (!(queryTypes as readonly string[]).includes(request.type)) fail(400, 'SPACE_QUERY_NOT_CONNECTED', 'This Space query is not connected.');
    if (request.type === 'GET_SPACE_OUTLINE' && request.includePreviews === true)
      fail(400, 'SPACE_CONTENT_OWNER_REQUIRED', 'Read full material content through its original Core reference.');
    const before = await canvas(canvasId);
    await unchanged(expected);
    const original = await executeSpaceQuery(canvasId, request);
    // Keep the original structural producer. GUI facts are read from the same
    // marker owners used by the user palette/directory, never from node copies.
    let result = original;
    if (original.type === 'INSPECT_NODES' && options.gui) {
      let byId: Map<string, unknown>;
      try {
        const facts = await options.gui.read(canvasId, original.result.nodes.map(node => node.id));
        byId = new Map(facts.nodes.map(node => [node.nodeId, node]));
      } catch (error) {
        // An unavailable canonical GUI projection must not disable an already
        // valid original structural read. Owner/scene/unknown failures still
        // propagate, and the original owner/version checks below always run.
        if (!(error instanceof NativeCanvasGuiMarkerError)
          || !['GUI_NODES_UNAVAILABLE', 'GUI_FACTS_UNAVAILABLE'].includes(error.code)) throw error;
        byId = new Map();
      }
      result = { ...original, result: { ...original.result, nodes: original.result.nodes.map(node => ({ ...node,
        gui: byId.get(node.id) ?? { nodeId: node.id, available: false, reason: 'gui-read-unavailable',
          navigation: { available: false, reason: 'gui-read-unavailable' }, colors: { available: false, reason: 'gui-read-unavailable' } },
      })) } };
    }
    await unchanged(expected);
    const after = await canvas(canvasId);
    await unchanged(expected);
    if (before.version !== after.version) fail(409, 'CANVAS_CHANGED_DURING_QUERY', 'The Canvas changed while its structure was read. Retry the query.');
    return result;
  }
  async function execute(canvasId: string, body: unknown) {
    const expected = await owner(canvasId);
    // Reuse the original MERGE_NODE_DATA operation, but never its broad
    // authored-data vocabulary. This local subset owns one existing GUI bool.
    const raw = body as Record<string, any> | undefined;
    if (raw?.commands?.[0]?.type === 'MERGE_NODE_DATA') {
      if (!options.commitPresentation) fail(400, 'SPACE_COMMAND_NOT_CONNECTED', 'Visual emphasis is not connected in this canvas adapter.');
      if (raw.runId !== undefined) fail(400, 'SPACE_RUN_NOT_CONNECTED', 'Visual emphasis does not execute or attribute a Run.');
      const command = raw.commands[0], patches = command.patches;
      if (Object.keys(raw).some(key => key !== 'commands') || !Array.isArray(raw.commands) || raw.commands.length !== 1
        || !command || Object.keys(command).some(key => !['type', 'patches'].includes(key))
        || !Array.isArray(patches) || !patches.length || patches.length > 200
        || patches.some(value => !value || typeof value !== 'object' || Array.isArray(value)
          || Object.keys(value).some(key => !['nodeId', 'patch'].includes(key)) || typeof value.nodeId !== 'string' || !value.nodeId
          || !value.patch || typeof value.patch !== 'object' || Array.isArray(value.patch)
          || Object.keys(value.patch).length !== 1 || typeof value.patch.lcos_gui_emphasis !== 'boolean'))
        fail(400, 'SPACE_PRESENTATION_INVALID', 'Only existing-node boolean visual emphasis is connected.');
      const current = await canvas(canvasId), ids = new Set(current.state.nodes.map(node => node.id));
      if (patches.some(value => !ids.has(value.nodeId))) fail(404, 'SPACE_NODE_NOT_FOUND', 'A requested presentation node is not in this Canvas.');
      await unchanged(expected);
      return options.commitPresentation!(canvasId, patches.map(value => ({ nodeId: value.nodeId,
        patch: { lcos_gui_emphasis: value.patch.lcos_gui_emphasis } })));
    }
    const parsed = rfsExecuteRequestSchema.safeParse(body);
    if (!parsed.success) fail(400, 'SPACE_COMMAND_INVALID', parsed.error.issues[0]?.message ?? 'Invalid Space execute request.');
    const request = parsed.data!;
    if (request.runId !== undefined) fail(400, 'SPACE_RUN_NOT_CONNECTED', 'This geometry entry does not execute or attribute a Run.');
    if (request.commands.length !== 1 || request.commands[0]!.type !== 'SET_NODE_GEOMETRY')
      fail(400, 'SPACE_COMMAND_NOT_CONNECTED', 'Only one SET_NODE_GEOMETRY command is connected.');
    const command = request.commands[0] as { type: 'SET_NODE_GEOMETRY'; items: GeometryItem[] };
    for (const item of command.items) {
      if (item.size !== undefined)
        fail(400, 'SPACE_RESIZE_NOT_CONNECTED', 'External resizing is not connected; use the original Canvas resize interaction.');
    }
    const current = await canvas(canvasId), ids = new Set(current.state.nodes.map(node => node.id));
    if (command.items.some(item => !ids.has(item.nodeId))) fail(404, 'SPACE_NODE_NOT_FOUND', 'A requested geometry node is not in this Canvas.');
    await unchanged(expected);
    // Never call the raw Huabu command executor here: the original facade
    // performs the binding checks, serialization and Core layout receipt.
    return options.commitGeometry(canvasId, command.items);
  }
  async function guiCapability(canvasId: string, type: string) {
    const expected = await owner(canvasId);
    if (!options.gui) fail(404, 'GUI_OPERATION_NOT_CONNECTED', '这个画布标记操作尚未接入。');
    const result = options.gui!.guiCapability(type);
    await unchanged(expected);
    return result;
  }
  async function gui(canvasId: string, body: unknown) {
    const expected = await owner(canvasId);
    if (!options.gui) fail(404, 'GUI_OPERATION_NOT_CONNECTED', '这个画布标记操作尚未接入。');
    await unchanged(expected);
    return options.gui!.operate(canvasId, body);
  }
  return { capabilities, queryCapability, commandCapability, guiCapability, query, execute, gui };
}
