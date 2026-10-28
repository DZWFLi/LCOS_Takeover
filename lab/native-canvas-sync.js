// Receive the original Huabu CanvasSyncEvent into the sole TapNow Canvas.
// This cursor is transient connection state, never another Canvas or history store.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = value => Number.isSafeInteger(value) && value >= 0;
const nativeGuiFields = ['color_pins', 'lcos_gui_navigation_pin'];
const nativeGuiRefs = ['lcos_ref','lcos_collection_ref','lcos_conversation_ref','lcos_execution_ref','lcos_member_ref','lcos_scope_ref','lcos_run_ref',
  'lcos_result_ref','lcos_file_ref','lcos_method_member_ref','lcosCollectionId','lcosCollectionNodeId','lcos_native_collection'];
const colorPins = value => Array.isArray(value) && value.every(color => typeof color === 'string' && /^[0-9a-f]{6}$/i.test(color))
  && new Set(value.map(color => color.toUpperCase())).size === value.length;
function nativeGuiData(node) {
  const data = node?.data ?? {}, fields = nativeGuiFields.filter(field => Object.hasOwn(data, field));
  if (!fields.length) return {};
  if (nativeGuiRefs.some(field => data[field] !== undefined) || data.id !== undefined && data.id !== node.id) return;
  const result = {};
  for (const field of fields) {
    if (field === 'color_pins' ? !colorPins(data[field]) : typeof data[field] !== 'boolean') return;
    result[field] = field === 'color_pins' ? [...data[field]] : data[field];
  }
  return result;
}
const equal = (left, right) => {
  if (left === right) return true;
  if (!record(left) || !record(right)) return JSON.stringify(left) === JSON.stringify(right);
  const keys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const other = Object.keys(right).filter(key => right[key] !== undefined).sort();
  return keys.length === other.length && keys.every((key, i) => key === other[i] && equal(left[key], right[key]));
};
export function canvasGeometry(node) {
  if (!record(node) || typeof node.id !== 'string' || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) return;
  const width = node.measured?.width ?? node.style?.width ?? node.width;
  const height = node.measured?.height ?? node.style?.height ?? node.height;
  if (width !== undefined && (!Number.isFinite(width) || width <= 0) || height !== undefined && (!Number.isFinite(height) || height <= 0)) return;
  return { id: node.id, position: { x: node.position.x, y: node.position.y },
    ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) };
}
export function samePersistedCanvasGeometry(left, right) {
  return !!left && !!right && left.id === right.id && left.width === right.width && left.height === right.height
    && ['x', 'y'].every(key => Math.round(left.position[key] * 100) === Math.round(right.position[key] * 100));
}
function geometryOnly(delta) {
  if (delta?.type !== 'REPLACE_NODE' || delta.prev?.id !== delta.next?.id || !canvasGeometry(delta.prev) || !canvasGeometry(delta.next)) return false;
  if ([delta.prev, delta.next].some(node => node.data?.lcos_gui_emphasis !== undefined && typeof node.data.lcos_gui_emphasis !== 'boolean')) return false;
  if ([delta.prev, delta.next].some(node => !nativeGuiData(node))
    || nativeGuiFields.some(field => Object.hasOwn(delta.prev.data ?? {}, field) && !Object.hasOwn(delta.next.data ?? {}, field))) return false;
  const rest = node => { const result = { ...node }; delete result.position; delete result.width; delete result.height; delete result.measured;
    if (record(result.style)) { result.style = { ...result.style }; delete result.style.width; delete result.style.height; }
    if (record(result.data)) { result.data = { ...result.data }; delete result.data.lcos_gui_emphasis; for (const field of nativeGuiFields) delete result.data[field]; }
    return result; };
  return equal(rest(delta.prev), rest(delta.next));
}
function signature(nodes) { return JSON.stringify(nodes.map(node => ({ id: node.id, type: node.type, data: node.data,
  position: node.position, width: node.width, height: node.height, measured: node.measured, style: node.style, parentId: node.parentId }))); }
// Existing material/typed ownership, not a content version lock. A new
// revision of the same artifact/view must not disable ordinary GUI expression.
function sameNodeIdentity(left, right) {
  const identity = node => Object.fromEntries(nativeGuiRefs.map(field => {
    const ref = node.data?.[field];
    return [field, record(ref) ? Object.fromEntries(['projectId', 'workspaceId', 'canvasId', 'entityType', 'entityId', 'artifactId', 'artifactViewId',
      'viewId', 'collectionId', 'connectedConversationId', 'conversationId', 'scopeId', 'runId','slotId','memberId','methodId'].filter(key => ref[key] !== undefined).map(key => [key, ref[key]])) : ref];
  }));
  return left.type === right.type && equal(identity(left), identity(right));
}

/** Same event/data framing as Huabu's readTypedSSEStream. Unknown frames fail the
 * connection and reconnect to a snapshot; they never become Canvas writes. */
export async function readNativeCanvasSyncStream(response, onEvent, signal) {
  if (!response.ok || !response.body) throw new Error('Canvas sync stream unavailable.');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
  try { for (;;) { if (signal.aborted) return; const { done, value } = await reader.read(); if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/); buffer = parts.pop() ?? '';
    for (const part of parts) { let type = ''; const data = [];
      for (const line of part.split(/\r?\n/)) { if (line.startsWith('event:')) type = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); }
      if (!type && !data.length) continue;
      if (!type || !data.length) throw new Error('Invalid original Canvas SSE frame.');
      onEvent({ type, data: JSON.parse(data.join('\n')) });
    }
  } } finally { reader.releaseLock?.(); }
}

export function createNativeCanvasGeometrySync({ canvasId, ownerApi, getHost, readNodes, readEdges, readBusy,
  normalizeNodes, backfillReceipt, subscribe, request = (url, options) => fetch(url, options),
  readStream = readNativeCanvasSyncStream, delayMs = 200, reconnectMs = 500, onState = () => {} }) {
  const lifetime = new AbortController(); let projectId, active = true, appliedVersion, desiredVersion = -1;
  let pending, needsRead = false, working = false, timer, reconnectTimer, streamController, streamRunning = false, unsupportedUpdates = 0, lastState;
  const ownerMatches = () => { const host = getHost(); return active && !lifetime.signal.aborted && host?.api === ownerApi
    && (host.currentCanvasId || host.canvasId) === canvasId && (!projectId || host.projectId === projectId); };
  const ownerCurrent = () => { const host = getHost();
    if (!active || lifetime.signal.aborted || host?.api !== ownerApi || (host.currentCanvasId || host.canvasId) !== canvasId) return false;
    if (!projectId && typeof host.projectId === 'string' && host.projectId.trim()) projectId = host.projectId;
    return !!projectId && host.projectId === projectId;
  };
  const busy = () => { try { return readBusy() !== false || readNodes().some(node => node.dragging === true || node.resizing === true || node.data?.isEditing === true); } catch { return true; } };
  const schedule = () => { if (!active || timer) return; timer = setTimeout(() => { timer = undefined; void drain(); }, delayMs); };
  const state = (status, reason) => { lastState = { status, canvasId, appliedVersion, desiredVersion, reason }; if (active) onState(lastState); };
  const readCanvas = async () => {
    const response = await request('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(12000)]), cache: 'no-store', redirect: 'error' });
    const body = await response.json(), canvas = body?.data;
    if (!response.ok || body.code !== 0 || canvas?.id !== canvasId || !version(canvas.version) || !Array.isArray(canvas.nodes)
      || canvas.project_id !== undefined && canvas.project_id !== projectId) throw new Error('Current original Canvas identity/version was not confirmed.');
    return canvas;
  };
  async function drain() {
    if (!active || working) return;
    if (!ownerCurrent()) { if (!ownerMatches()) dispose(); else schedule(); return; }
    if (!streamRunning) void connect();
    if (desiredVersion < 0 || appliedVersion !== undefined && desiredVersion <= appliedVersion) return;
    if (busy()) { state('deferred', 'Original Canvas has an active edit or unconfirmed save.'); schedule(); return; }
    working = true;
    const selected = pending, read = needsRead || appliedVersion === undefined || !selected || selected.data.fromVersion !== appliedVersion;
    pending = undefined; needsRead = false;
    const before = readNodes(), beforeSignature = signature(before); let targetVersion, candidates;
    try {
      if (read) { const canvas = await readCanvas(); targetVersion = canvas.version;
        if (targetVersion < desiredVersion) { needsRead = true; schedule(); return; }
        candidates = normalizeNodes(canvas.nodes);
      } else { targetVersion = selected.data.toVersion;
        // Keep the original native body/binding/parent. Only confirmed geometry
        // and the connected saved GUI fields cross this existing seam.
        candidates = selected.data.deltas.map(delta => {
          const local = before.find(node => node.id === delta.next.id), geometry = canvasGeometry(delta.next);
          const priorGui = nativeGuiData(delta.prev), nextGui = nativeGuiData(delta.next), localGui = nativeGuiData(local);
          if (!local || !samePersistedCanvasGeometry(canvasGeometry(local), canvasGeometry(delta.prev))
            || !sameNodeIdentity(local, delta.prev)
            || !priorGui || !nextGui || !localGui || nativeGuiFields.some(field => Object.hasOwn(nextGui,field)
              && !equal(localGui[field] ?? (field==='color_pins'?[]:false), priorGui[field] ?? (field==='color_pins'?[]:false)))
            || (local.data?.lcos_gui_emphasis === true) !== (delta.prev.data?.lcos_gui_emphasis === true)) throw new Error('External geometry no longer matches the local prestate.');
          return { ...local, position: geometry.position, data: { ...local.data, ...nextGui, lcos_gui_emphasis: delta.next.data?.lcos_gui_emphasis === true },
            ...(geometry.width === undefined ? {} : { width: geometry.width, measured: { ...local.measured, width: geometry.width }, style: { ...local.style, width: geometry.width } }),
            ...(geometry.height === undefined ? {} : { height: geometry.height, measured: { ...local.measured, width: geometry.width ?? local.measured?.width, height: geometry.height }, style: { ...local.style, width: geometry.width ?? local.style?.width, height: geometry.height } }) };
        });
        candidates = normalizeNodes(candidates);
      }
      if (!ownerCurrent()) return;
      if (busy() || signature(readNodes()) !== beforeSignature) { needsRead = true; state('deferred', 'A newer original edit was preserved.'); schedule(); return; }
      if (!Array.isArray(candidates)) throw new Error('Original Canvas normalization unavailable.');
      const ids = new Set(), patches = [];
      for (const candidate of candidates) { if (ids.has(candidate?.id)) throw new Error('Ambiguous original Canvas geometry.'); ids.add(candidate?.id);
        const local = before.find(node => node.id === candidate?.id); if (!local) continue;
        if ((local.parentId ?? null) !== (candidate.parentId ?? null)) throw new Error('External geometry changed its parent space.');
        if (!sameNodeIdentity(local, candidate)) throw new Error('External presentation belongs to a different original node binding.');
        const previous = canvasGeometry(local), next = canvasGeometry(candidate);
        if (!previous || !next) throw new Error('Invalid original Canvas geometry.');
        if (candidate.data?.lcos_gui_emphasis !== undefined && typeof candidate.data.lcos_gui_emphasis !== 'boolean') throw new Error('Invalid original GUI emphasis.');
        const beforeEmphasis = local.data?.lcos_gui_emphasis === true, afterEmphasis = candidate.data?.lcos_gui_emphasis === true;
        const localGui=nativeGuiData(local), nextGui=nativeGuiData(candidate);if(!localGui||!nextGui)throw new Error('Invalid original node GUI fields.');
        const guiPatch={};for(const field of nativeGuiFields)if(Object.hasOwn(nextGui,field)){
          const prev=localGui[field]??(field==='color_pins'?[]:false),value=nextGui[field];
          if(!equal(prev,value))guiPatch[field]={before:prev,after:value};
        }
        if (!samePersistedCanvasGeometry(previous, next) || beforeEmphasis !== afterEmphasis || Object.keys(guiPatch).length) patches.push({ id: local.id, before: previous, after: next,
          ...(beforeEmphasis === afterEmphasis ? {} : { emphasis: { before: beforeEmphasis, after: afterEmphasis } }),
          ...(Object.keys(guiPatch).length?{nativeGui:guiPatch}:{}) });
      }
      const receipt = backfillReceipt({ receiptKind: 'external-geometry', projectId, canvasId, fromVersion: appliedVersion,
        toVersion: targetVersion, patches, expectedNodes: before, expectedEdges: readEdges() });
      if (receipt?.ok !== true) { needsRead = true; state('deferred', receipt?.reason || 'Original history did not confirm geometry.'); schedule(); return; }
      if (!ownerCurrent()) return;
      appliedVersion = targetVersion; state('ready');
    } catch (error) { if (!lifetime.signal.aborted && ownerCurrent()) { needsRead = true; state('deferred', String(error.message ?? error)); schedule(); } }
    finally { working = false; if (active && desiredVersion > (appliedVersion ?? -1)) schedule(); }
  }
  function accept(event) {
    if (!ownerCurrent()) return;
    if (event?.type === 'snapshot' && version(event.data?.version)) {
      if (appliedVersion !== undefined && event.data.version <= appliedVersion) return;
      desiredVersion = Math.max(desiredVersion, event.data.version); needsRead = true; pending = undefined; schedule(); return;
    }
    if (event?.type !== 'update' || !version(event.data?.fromVersion) || !version(event.data?.toVersion) || event.data.toVersion <= event.data.fromVersion) return;
    if (appliedVersion !== undefined && event.data.toVersion <= appliedVersion) return;
    desiredVersion = Math.max(desiredVersion, event.data.toVersion);
    const incremental = Array.isArray(event.data.deltas) && event.data.deltas.length > 0 && event.data.deltas.every(geometryOnly)
      && !(event.data.pendingEffects?.deletedNodeIds?.length || event.data.pendingEffects?.contentEditedNodeIds?.length);
    if (!incremental) unsupportedUpdates++;
    if (!needsRead && !pending && appliedVersion !== undefined && event.data.fromVersion === appliedVersion && incremental) pending = event;
    else { needsRead = true; pending = undefined; }
    schedule();
  }
  async function connect() {
    if (!ownerCurrent() || streamRunning) return;
    streamRunning = true; streamController = new AbortController(); const signal = AbortSignal.any([lifetime.signal, streamController.signal]);
    try { const response = await request('/api/canvas/' + encodeURIComponent(canvasId) + '/sync/stream', { signal, cache: 'no-store', redirect: 'error' });
      await readStream(response, accept, signal);
    } catch (error) { if (!signal.aborted && ownerCurrent()) state('disconnected', String(error.message ?? error)); }
    finally { streamRunning = false; if (active && ownerCurrent()) reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, reconnectMs); }
  }
  const release = subscribe(() => { if (!ownerMatches()) { dispose(); return; } schedule(); });
  function dispose() { if (!active) return; active = false; lifetime.abort(); streamController?.abort(); clearTimeout(timer); clearTimeout(reconnectTimer); release?.(); }
  schedule();
  return { accept, dispose, inspect: () => ({ active, canvasId, appliedVersion, desiredVersion, working, unsupportedUpdates, state: lastState }) };
}
