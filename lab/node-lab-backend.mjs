import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = { mode: 'node-lab-fixture', core_connected: false, mutations_connected: false,
  fixture_writes_connected: true, billing_connected: false, source: 'isolated-synthetic-canvas-state' };
const clone = value => structuredClone(value);
const success = data => ({ status: 200, body: { code: 0, message: '', msg: '', data, lcos_adapter: metadata } });
const failure = (status, code, message) => ({ status, body: { code: status * 100, data: null,
  message, msg: message, error: { code, message }, lcos_adapter: metadata } });
class FixtureError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const reject = (status, code, message) => { throw new FixtureError(status, code, message); };
function requireId(value, label) {
  if (typeof value !== 'string' || !value || value.length > 200) reject(400, 'INVALID_ARGUMENT', label + ' must be an identifier.');
  return value;
}
function coordinates(value, label) {
  if (!value || !['x', 'y'].every(key => Number.isFinite(value[key]))) reject(400, 'INVALID_ARGUMENT', label + ' must have finite x/y.');
  return { x: value.x, y: value.y };
}
function dimensions(value) {
  if (!value || !['width', 'height'].every(key => Number.isFinite(value[key]) && value[key] > 0)) {
    reject(400, 'INVALID_ARGUMENT', 'measured must have positive finite width/height.');
  }
  return { width: value.width, height: value.height };
}
function safeData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'INVALID_ARGUMENT', 'Node data must be an object.');
  return clone(value);
}
function textNode(id, canvasId, title, text, x, y) {
  return { id, canvas_id: canvasId, type: 'text', position: { x, y }, measured: { width: 300, height: 270 },
    data: { id, title, text, content: text, prompt: '' } };
}
function seed(imageSrc) {
  const main = 'offline-fixture-canvas';
  return { sequence: 0, canvases: [
    { id: main, name: '节点实验 · 图片与文本', type: 'canvas', description: 'Synthetic node CRUD only; no LCOS Core.',
      is_public: false, isCollaborationEnabled: false, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z',
      nodes: [
        { id: 'node-lab-image', canvas_id: main, type: 'image', position: { x: 140, y: 120 },
          measured: { width: 340, height: 220 }, data: { id: 'node-lab-image', title: '图片节点 · 合成图', src: imageSrc, type: 'upload', prompt: '' } },
        textNode('node-lab-text', main, '文本节点 · 可编辑', '# 原文本节点\n\n双击正文打开富文本编辑器。\n\n这里的保存只落隔离实验目录，不写真实 Gen2。', 570, 130),
      ], connections: [] },
    { id: 'node-lab-secondary', name: '第二画布 · 独立空间', type: 'canvas', is_public: false, isCollaborationEnabled: false,
      updated_at: '2026-10-13T00:00:00Z', nodes: [textNode('node-lab-other-text', 'node-lab-secondary', '另一份空间状态', '这不是主画布节点。切换后再返回，节点位置与内容应各自保留。', 180, 130)], connections: [] },
    { id: 'node-lab-empty', name: '空画布 · 创建实验', type: 'canvas', is_public: false, isCollaborationEnabled: false,
      updated_at: '2026-10-13T00:00:00Z', nodes: [], connections: [] },
  ] };
}

export async function createNodeLabBackend({ runtimeRoot, imageSrc = '/node-fixtures/image.svg' } = {}) {
  const root = path.resolve(runtimeRoot || path.join(workspaceRoot, '.runtime', 'offline-node-lab'));
  const allowed = path.join(workspaceRoot, '.runtime') + path.sep;
  if (!root.toLowerCase().startsWith(allowed.toLowerCase())) throw new Error('Node fixture state must stay inside this experiment .runtime child directory.');
  await mkdir(root, { recursive: true });
  const stateFile = path.join(root, 'canvas-state.json');
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (!Array.isArray(state?.canvases) || !Number.isInteger(state.sequence)) throw new Error('Invalid node fixture state; preserve it for inspection.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = seed(imageSrc);
    await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  }
  let writes = Promise.resolve();
  const mutate = operation => {
    const result = writes.then(async () => {
      const next = clone(state);
      const value = await operation(next);
      next.sequence += 1;
      const temporary = stateFile + '.tmp';
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
      await rename(temporary, stateFile);
      state = next;
      return clone(value);
    });
    writes = result.catch(() => {});
    return result;
  };
  const find = (snapshot, id) => {
    const canvas = snapshot.canvases.find(item => item.id === id);
    if (!canvas) reject(404, 'CANVAS_NOT_FOUND', 'No synthetic canvas with this ID.');
    return canvas;
  };
  const mark = canvas => { canvas.updated_at = new Date().toISOString(); };
  async function handle({ method = 'GET', pathname, url, body } = {}) {
    const requestUrl = url instanceof URL ? url : new URL(url || pathname || '/', 'http://127.0.0.1');
    const route = pathname || requestUrl.pathname;
    if (!route.startsWith('/api/canvas/v1/canvases') && !route.startsWith('/api/node-lab/')) return null;
    try {
      await writes;
      if (route === '/api/node-lab/state' && method === 'GET') return success(clone(state));
      if (route === '/api/node-lab/status' && method === 'GET') return success({ ...metadata, sequence: state.sequence,
        canvas_count: state.canvases.length, node_count: state.canvases.reduce((sum, canvas) => sum + canvas.nodes.length, 0) });
      if (route === '/api/canvas/v1/canvases') {
        if (method === 'GET') {
          const keyword = (requestUrl.searchParams.get('keyword') || '').toLowerCase();
          const sortBy = requestUrl.searchParams.get('sort_by') || 'updated_at';
          const sortOrder = requestUrl.searchParams.get('sort_order') || 'desc';
          if (!['updated_at', 'created_at', 'name'].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) reject(400, 'INVALID_ARGUMENT', 'Unsupported canvas sorting.');
          const list = state.canvases.filter(item => item.name.toLowerCase().includes(keyword))
            .sort((a, b) => String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')) * (sortOrder === 'asc' ? 1 : -1));
          const offset = Number(requestUrl.searchParams.get('offset') || 0), limit = Number(requestUrl.searchParams.get('limit') || 100);
          if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) reject(400, 'INVALID_ARGUMENT', 'Invalid list pagination.');
          return success({ canvases: list.slice(offset, offset + limit).map(({ nodes, connections, ...item }) => ({ ...clone(item), node_count: nodes.length })), total: list.length });
        }
        if (method === 'POST') {
          if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 32) reject(400, 'INVALID_ARGUMENT', 'A canvas name of 1–32 characters is required.');
          const canvas = await mutate(next => {
            const created = { id: 'node-lab-' + randomUUID(), name: body.name, type: 'canvas', is_public: false,
              isCollaborationEnabled: false, description: typeof body.description === 'string' ? body.description : '',
              parent_id: body.parent_id || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), nodes: [], connections: [] };
            next.canvases.push(created); return created;
          });
          return success({ canvas });
        }
      }
      const match = /^\/api\/canvas\/v1\/canvases\/([^/]+?)(?::clone|\/(nodes:batchActions|connections:batchActions))?$/.exec(route);
      if (!match) return failure(501, 'READ_OR_ACTION_NOT_IMPLEMENTED', 'This synthetic Canvas endpoint is not implemented.');
      const canvasId = decodeURIComponent(match[1]);
      const canvas = find(state, canvasId);
      if (route.endsWith(':clone') && method === 'POST') {
        const copied = await mutate(next => {
          const source = find(next, canvasId), result = clone(source);
          result.id = 'node-lab-' + randomUUID(); result.name = (source.name.slice(0, 28) + ' 副本').slice(0, 32);
          const ids = new Map(result.nodes.map(node => [node.id, randomUUID()]));
          result.nodes = result.nodes.map(node => ({ ...node, id: ids.get(node.id), canvas_id: result.id,
            ...(node.parent_id ? { parent_id: ids.get(node.parent_id) || node.parent_id } : {}),
            data: { ...node.data, id: ids.get(node.id) } }));
          result.connections = result.connections.map(edge => ({ ...edge, id: randomUUID(), source: ids.get(edge.source), target: ids.get(edge.target) }));
          mark(result); next.canvases.push(result); return result;
        });
        return success({ new_canvas_id: copied.id, canvas: copied });
      }
      if (!match[2] && !route.endsWith(':clone')) {
        if (method === 'GET') return success(clone(canvas));
        if (method === 'PATCH') {
          if (Object.keys(body || {}).some(key => !['name', 'canvas_id'].includes(key))) {
            return failure(501, 'CANVAS_PATCH_NOT_IMPLEMENTED', 'Only local canvas renaming is implemented. Sharing and other fields are not connected.');
          }
          const updated = await mutate(next => {
            const item = find(next, canvasId);
            if (body?.canvas_id && body.canvas_id !== canvasId) reject(400, 'CANVAS_ID_MISMATCH', 'Request canvas does not match route.');
            if (Object.hasOwn(body || {}, 'name')) {
              if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 32) reject(400, 'INVALID_ARGUMENT', 'Invalid canvas name.');
              item.name = body.name;
            }
            mark(item); return item;
          });
          return success({ canvas: updated, ...updated });
        }
        if (method === 'DELETE') {
          await mutate(next => { find(next, canvasId); next.canvases = next.canvases.filter(item => item.id !== canvasId); return null; });
          return success({ canvas_id: canvasId, deleted: true });
        }
      }
      if (match[2] && method === 'POST') {
        if (body?.canvas_id !== canvasId || !Array.isArray(body.actions) || body.actions.length > 200) reject(400, 'INVALID_ARGUMENT', 'Expected matching canvas_id and bounded actions array.');
        const result = await mutate(next => {
          const item = find(next, canvasId);
          const alreadyAbsentConnections = [];
          for (const action of body.actions) {
            const nodes = match[2] === 'nodes:batchActions';
            const targetKey = nodes ? 'nodes' : 'connections';
            if (action.action === 'delete') {
              if (!Array.isArray(action.delete_ids)) reject(400, 'INVALID_ARGUMENT', 'Expected delete_ids.');
              const ids = new Set(action.delete_ids.map(id => requireId(id, 'delete ID')));
              const absent = [...ids].filter(id => !item[targetKey].some(value => value.id === id));
              if (nodes && absent.length) reject(404, 'OBJECT_NOT_FOUND', 'Deleted synthetic node was not found.');
              alreadyAbsentConnections.push(...absent);
              item[targetKey] = item[targetKey].filter(value => !ids.has(value.id));
              if (nodes) item.connections = item.connections.filter(edge => !ids.has(edge.source) && !ids.has(edge.target));
            } else if (action.action === 'create') {
              if (!Array.isArray(action.creates)) reject(400, 'INVALID_ARGUMENT', 'Expected creates.');
              for (const input of action.creates) {
                requireId(input?.id, 'created ID');
                if (item[targetKey].some(value => value.id === input.id)) reject(409, 'DUPLICATE_ID', 'Synthetic object already exists.');
                if (nodes) {
                  if (!['text', 'image'].includes(input.type)) reject(501, 'NODE_TYPE_NOT_IMPLEMENTED', 'Only text/image nodes are implemented by this fixture.');
                  if (input.canvas_id && input.canvas_id !== canvasId) reject(400, 'CANVAS_ID_MISMATCH', 'Created node belongs to another canvas.');
                  item.nodes.push({ ...clone(input), canvas_id: canvasId, position: coordinates(input.position, 'position'),
                    data: safeData(input.data), measured: input.measured ? dimensions(input.measured) : { width: 300, height: 270 } });
                } else {
                  requireId(input.source, 'source'); requireId(input.target, 'target');
                  if (![input.source, input.target].every(id => item.nodes.some(node => node.id === id))) reject(400, 'INVALID_EDGE', 'Connection endpoints must exist in this canvas.');
                  item.connections.push(clone(input));
                }
              }
            } else if (action.action === 'update') {
              if (!Array.isArray(action.updates)) reject(400, 'INVALID_ARGUMENT', 'Expected updates.');
              for (const patch of action.updates) {
                const target = item[targetKey].find(value => value.id === patch.id);
                if (!target) reject(404, 'OBJECT_NOT_FOUND', 'Updated synthetic object was not found.');
                if (nodes) {
                  if (patch.type !== undefined && patch.type !== target.type) reject(501, 'NODE_TYPE_CHANGE_NOT_IMPLEMENTED', 'Node type replacement is not implemented.');
                  if (patch.data !== undefined) target.data = { ...target.data, ...safeData(patch.data) };
                  if (patch.position !== undefined) target.position = coordinates(patch.position, 'position');
                  if (patch.measured !== undefined) target.measured = dimensions(patch.measured);
                  for (const key of ['parent_id', 'extent']) if (Object.hasOwn(patch, key)) target[key] = clone(patch[key]);
                } else {
                  for (const key of ['source', 'target', 'source_handle', 'target_handle', 'type', 'data']) if (Object.hasOwn(patch, key)) target[key] = clone(patch[key]);
                  if (![target.source, target.target].every(id => item.nodes.some(node => node.id === id))) reject(400, 'INVALID_EDGE', 'Connection endpoint is missing.');
                }
              }
            } else reject(501, 'BATCH_ACTION_NOT_IMPLEMENTED', 'Unknown synthetic batch action.');
          }
          mark(item); return { canvas_id: canvasId, nodes: clone(item.nodes), connections: clone(item.connections), fixture_saved: true,
            already_absent_connection_ids: alreadyAbsentConnections };
        });
        return success(result);
      }
      return failure(501, 'ACTION_NOT_IMPLEMENTED', 'No model, collaboration, sharing or real Core action is connected.');
    } catch (error) {
      if (error instanceof FixtureError) return failure(error.status, error.code, error.message);
      if (error instanceof URIError) return failure(400, 'INVALID_ARGUMENT', 'Invalid encoded identifier.');
      throw error;
    }
  }
  return { handle, getSnapshot: async () => { await writes; return clone(state); }, metadata };
}
