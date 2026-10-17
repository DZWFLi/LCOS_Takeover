// Local facade around the donor's original ReactFlow owner; not recovered TSX.
import { e as useCanvasApi, cK as useNativeFlowStoreApi, bs as normalizeNativeNodes, dI as normalizeNativeNodeParams } from '/assets/UnlimitedModeToggle-D4wysAbz.js';
import { cd as React, ru as flushNativeCanvas, rs as retryNativeCanvas } from '/assets/index-BAQXnPag.js';
import { readCollapsedFrames, writeCollapsedFrames } from '/lcos/agent-ui.js';
import { f as originalExportPlacement } from '/assets/canvas-export-placement-BcB3femJ.js';
import { a as originalNodePosition } from '/assets/UnlimitedModeToggle-D4wysAbz.js';
import { dk as originalNodeWidth } from '/assets/index-BAQXnPag.js';

// Same display-only preference key as the current Gen2 Canvas. The original
// ReactFlow remains the only node owner; this cache contains collapsed IDs,
// not another copy of Canvas geometry, material truth, or history.
const collectionDisplayPreferences = new Map();
const collectionDisplayListeners = new Set();
const emptyCollectionDisplay = new Set();
function collectionDisplayPreference(canvasId, nodes = []) {
  if (!canvasId) return emptyCollectionDisplay;
  if (!collectionDisplayPreferences.has(canvasId)) {
    if (!nodes.length) return emptyCollectionDisplay;
    collectionDisplayPreferences.set(canvasId, readCollapsedFrames(canvasId, nodes));
  }
  return collectionDisplayPreferences.get(canvasId);
}
function toggleCollectionDisplay(canvasId, frameId) {
  const next = new Set(collectionDisplayPreference(canvasId));
  if (next.has(frameId)) next.delete(frameId); else next.add(frameId);
  collectionDisplayPreferences.set(canvasId, next);
  writeCollapsedFrames(canvasId, next);
  for (const listener of collectionDisplayListeners) listener();
  return next.has(frameId);
}
export function useLCOSCollectionDisplayProjection(nodes, canvasId) {
  const collapsed = React.useSyncExternalStore(listener => {
    collectionDisplayListeners.add(listener);
    return () => collectionDisplayListeners.delete(listener);
  }, () => collectionDisplayPreference(canvasId, nodes), () => emptyCollectionDisplay);
  return React.useMemo(() => {
    if (!Array.isArray(nodes)) return nodes;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const frames = new Set(nodes.filter(node => node.type === 'group' && collapsed.has(node.id)
      && typeof node.data?.lcosCollectionId === 'string' && typeof node.data?.lcosCollectionNodeId === 'string'
      && byId.get(node.data.lcosCollectionNodeId)?.data?.lcos_collection_ref?.collectionId === node.data.lcosCollectionId)
      .map(node => node.id));
    const expandedNativePiles = new Set(nodes.filter(node => node.type === 'group' && !collapsed.has(node.id)
      && typeof node.data?.lcosCollectionNodeId === 'string'
      && byId.get(node.data.lcosCollectionNodeId)?.type === 'pile'
      && byId.get(node.data.lcosCollectionNodeId)?.data?.lcos_native_collection === true
      && byId.get(node.data.lcosCollectionNodeId)?.data?.lcos_collection_ref?.collectionId === node.data.lcosCollectionId)
      .map(node => node.data.lcosCollectionNodeId));
    if (frames.size === 0 && expandedNativePiles.size === 0) return nodes;
    return nodes.map(node => {
      let hidden = frames.has(node.id) || expandedNativePiles.has(node.id), parent = node.parentId;
      const visited = new Set();
      while (!hidden && parent && !visited.has(parent)) {
        visited.add(parent);
        if (frames.has(parent)) hidden = true;
        parent = byId.get(parent)?.parentId;
      }
      return hidden && node.hidden !== true ? { ...node, hidden: true } : node;
    });
  }, [nodes, collapsed]);
}
const sensitive = /(?:token|secret|credential|authorization|api.?key|agent|locator)/i;
function safeClone(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) => sensitive.test(key) ? undefined : entry));
}
const projectionTypes = new Set(['lcos-execution', 'lcos-result-material']);
function currentCanvasId(host) { return host?.currentCanvasId || host?.canvasId; }
// Compare only editable state. Selection/camera and RF measurement bookkeeping
// stay with their original owner and are not overwritten by this receipt.
function editableState(api) {
  return JSON.stringify({ nodes: api.getNodes().map(node => ({ id: node.id, type: node.type,
    data: node.data, position: node.position, width: node.width, height: node.height,
    style: node.style, parentId: node.parentId, hidden: node.hidden })), edges: api.getEdges() });
}
export function createExecutionProjectionSynchronizer({ api, ownerApi, getHost, flushCanvas, retryCanvas, backfillReceipt,
  normalizeNodes, request = (address, options) => fetch(address, options) }) {
  let pending;
  let pendingTarget;
  return (input, { isCurrent = () => true, retryPendingSave = false } = {}) => {
    const target = JSON.stringify([input?.projectId, input?.canvasId, input?.workspaceId]);
    if (pending) return pendingTarget === target ? pending
      : Promise.resolve({ ok: false, reason: '另一工作现场的同步尚未完成，未复用旧回执。' });
    const operation = (async () => {
      const { projectId, canvasId, workspaceId } = input ?? {};
      const current = () => {
        const host = getHost();
        return host?.api === ownerApi && currentCanvasId(host) === canvasId
          && (!host.projectId || host.projectId === projectId) && isCurrent() === true;
      };
      const unavailable = reason => ({ ok: false, reason });
      if (![projectId, canvasId, workspaceId].every(value => typeof value === 'string' && value.trim()) || !current()) {
        return unavailable('当前 Canvas/API 已切换，未同步旧工作现场。');
      }
      try {
        const flush = retryPendingSave === true ? retryCanvas : flushCanvas;
        if (typeof flush !== 'function' || await flush(canvasId) !== 'saved') return unavailable('原画布仍有未确认保存的编辑；草稿保留，未覆盖。');
        if (!current()) return unavailable('保存完成时 Canvas/API 已切换，未更新旧画布。');
        const beforeRequest = editableState(api);
        const read = async (address, options) => {
          const response = await request(address, { cache: 'no-store', redirect: 'error', ...options });
          const envelope = await response.json();
          if (!response.ok || envelope?.code !== 0 || !envelope.data) {
            throw new Error(envelope?.message || `任务投影同步失败（HTTP ${response.status}）。`);
          }
          return envelope.data;
        };
        const receipt = await read('/api/lcos/canvases/' + encodeURIComponent(canvasId) + '/execution:reconcile', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        });
        if (receipt.canvas_id !== canvasId || receipt.workspace_id !== workspaceId || receipt.provider_execution_started !== false) {
          return unavailable('投影回执不属于当前 Workspace，未应用。');
        }
        if (!current()) return unavailable('投影完成时 Canvas/API 已切换，未读取旧画布。');
        const canvas = await read('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), { headers: { Accept: 'application/json' } });
        if (canvas.id !== canvasId || canvas.workspace_id !== workspaceId || !Array.isArray(canvas.nodes)) {
          return unavailable('画布读回身份不一致，未应用。');
        }
        const candidates = canvas.nodes.filter(node => projectionTypes.has(node?.type));
        for (const node of candidates) {
          const ref = node.type === 'lcos-execution' ? node.data?.lcos_execution_ref : node.data?.lcos_result_ref;
          if (!ref || ref.projectId !== projectId || ref.canvasId !== canvasId || ref.workspaceId !== workspaceId) {
            return unavailable('任务／结果引用不属于当前工作现场，未应用。');
          }
        }
        if (!current()) return unavailable('读回完成时 Canvas/API 已切换，未应用旧数据。');
        if (beforeRequest !== editableState(api)) return unavailable('同步期间出现新编辑；本轮未替换节点，请保留当前操作。');
        if (candidates.length === 0) return { ok: true };
        // Same converter chain as the installed useProcessedNodes hook. Only
        // canonical execution leaves enter the existing O8 backfill port.
        const result = backfillReceipt({ receiptKind: 'execution-projection', canvasId, nodes: normalizeNodes(candidates) });
        return result?.ok === true ? { ok: true } : unavailable(result?.reason || '原历史回填接口尚未就绪。');
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : '任务投影同步失败；当前编辑未替换。');
      }
    })();
    pending = operation;
    pendingTarget = target;
    const release = () => { if (pending === operation) { pending = undefined; pendingTarget = undefined; } };
    void operation.then(release, release);
    return operation;
  };
}

/** Read back an already-confirmed Core placement through the same native O8
 * owner. This never replays placement or replaces the Canvas snapshot. */
export function createConversationProjectionSynchronizer({ api, ownerApi, getHost, flushCanvas, retryCanvas, backfillReceipt,
  normalizeNodes, request = (address, options) => fetch(address, options) }) {
  let pending;
  let pendingTarget;
  return (input, { isCurrent = () => true, retryPendingSave = false } = {}) => {
    const target = JSON.stringify([input?.projectId, input?.canvasId, input?.workspaceId, input?.connectedConversationId]);
    if (pending) return pendingTarget === target ? pending
      : Promise.resolve({ ok: false, reason: '另一段对话的画布同步尚未完成。' });
    const operation = (async () => {
      const { projectId, canvasId, workspaceId, connectedConversationId } = input ?? {};
      const current = () => {
        const host = getHost();
        return host?.api === ownerApi && currentCanvasId(host) === canvasId
          && host.projectId === projectId && isCurrent() === true;
      };
      const unavailable = reason => ({ ok: false, reason });
      if (![projectId, canvasId, workspaceId, connectedConversationId].every(value => typeof value === 'string' && value.trim()) || !current()) {
        return unavailable('当前对话或画布已切换，未应用旧投影。');
      }
      try {
        const flush = retryPendingSave === true ? retryCanvas : flushCanvas;
        if (typeof flush !== 'function' || await flush(canvasId) !== 'saved') {
          return unavailable('画布编辑尚未保存，当前草稿已保留。');
        }
        if (!current()) return unavailable('保存期间画布已切换，未应用旧投影。');
        const beforeRequest = editableState(api);
        const response = await request('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), {
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
        });
        const envelope = await response.json();
        if (!response.ok || envelope?.code !== 0 || !envelope.data) return unavailable('已放置对话的画布状态暂时无法读取。');
        const canvas = envelope.data;
        if (canvas.id !== canvasId || canvas.workspace_id !== workspaceId || !Array.isArray(canvas.nodes)) {
          return unavailable('对话投影的画布或工作现场不一致。');
        }
        const candidates = canvas.nodes.filter(node => node?.type === 'lcos-conversation'
          && node.data?.lcos_conversation_ref?.connectedConversationId === connectedConversationId);
        if (candidates.length !== 1) return unavailable('画布尚未确认这段对话的唯一位置，请稍后核对。');
        const node = candidates[0], ref = node.data?.lcos_conversation_ref, state = node.data?.lcos_conversation_state;
        if (ref.projectId !== projectId || ref.canvasId !== canvasId || ref.workspaceId !== workspaceId
          || typeof node.id !== 'string' || !node.id || node.data.id !== node.id || typeof node.data.title !== 'string' || !node.data.title.trim()
          || canvas.nodes.filter(value => value?.id === node.id).length !== 1
          || !state || typeof state.isRunning !== 'boolean' || typeof state.provider !== 'string' || !state.provider.trim()) {
          return unavailable('对话投影身份未确认，未替换画布内容。');
        }
        if (!current()) return unavailable('读取期间对话或画布已切换，未应用旧投影。');
        if (beforeRequest !== editableState(api)) return unavailable('同步期间有新编辑，已保留当前操作，请稍后核对。');
        if (typeof normalizeNodes !== 'function' || typeof backfillReceipt !== 'function') return unavailable('原画布回填接口尚未就绪。');
        const normalized = normalizeNodes([node]);
        if (!Array.isArray(normalized) || normalized.length !== 1) return unavailable('对话投影转换未确认。');
        const normalizedRef = normalized[0]?.data?.lcos_conversation_ref;
        if (normalized[0]?.id !== node.id || normalized[0]?.data?.id !== node.id || normalized[0]?.type !== 'lcos-conversation'
          || normalizedRef?.projectId !== projectId || normalizedRef?.canvasId !== canvasId
          || normalizedRef?.workspaceId !== workspaceId || normalizedRef?.connectedConversationId !== connectedConversationId) {
          return unavailable('转换后的对话投影身份不一致。');
        }
        if (!current() || beforeRequest !== editableState(api)) return unavailable('画布已变化，未应用旧投影。');
        const result = backfillReceipt({ receiptKind: 'conversation-projection', projectId, canvasId, workspaceId, connectedConversationId,
          nodes: normalized.map(value => ({ ...value, selected: false })) });
        if (result?.ok !== true) return unavailable(result?.reason || '对话投影尚未回填到原画布。');
        const published = () => {
          const matches = api.getNodes().filter(value => value?.id === node.id);
          const live = matches[0], reference = live?.data?.lcos_conversation_ref;
          return matches.length === 1 && live.type === 'lcos-conversation' && live.data?.id === node.id
            && reference?.projectId === projectId && reference.canvasId === canvasId
            && reference.workspaceId === workspaceId && reference.connectedConversationId === connectedConversationId;
        };
        if (published()) return { ok: true };
        // O8's setter is a React state update. Confirm the same original Flow
        // has published it before the caller checks getNodes; no reload or
        // second owner is needed to bridge this commit boundary.
        if (typeof ownerApi?.subscribeNative !== 'function') return unavailable('原画布正在更新，对话投影尚未确认。');
        return await new Promise(resolve => {
          let settled = false, release, timer;
          const finish = value => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (typeof release === 'function') release();
            resolve(value);
          };
          const check = () => {
            try {
              if (!current()) return finish(unavailable('更新期间画布已切换，未确认旧投影。'));
              if (published()) finish({ ok: true });
            } catch { finish(unavailable('原画布发布状态暂未确认。')); }
          };
          timer = setTimeout(() => finish(unavailable('原画布尚未确认对话已显示，请稍后核对。')), 3000);
          release = ownerApi.subscribeNative(check);
          if (settled) release?.(); else check();
        });
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : '对话投影暂时无法同步，当前编辑已保留。');
      }
    })();
    pending = operation; pendingTarget = target;
    const release = () => { if (pending === operation) { pending = undefined; pendingTarget = undefined; } };
    void operation.then(release, release);
    return operation;
  };
}

/** Accept one already committed exact material receipt. The native Canvas/O8
 * owner receives it; no addNodes, URL import, camera move or snapshot reset. */
export function createMaterialProjectionSynchronizer({ api, ownerApi, getHost, backfillReceipt, normalizeNodes, publicationTimeoutMs = 3000 }) {
  return async (input, { isCurrent } = {}) => {
    const { projectId, canvasId, workspaceId, artifactId, artifactViewId, revisionId, node } = input ?? {};
    const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
    const current = () => {
      const host = getHost();
      return typeof isCurrent === 'function' && isCurrent() === true && host?.api === ownerApi
        && currentCanvasId(host) === canvasId && host?.projectId === projectId;
    };
    const matches = value => {
      const ref = value?.data?.lcos_ref;
      return nonEmpty(value?.id) && value.data?.id === value.id && ['text', 'image'].includes(value.type)
        && ref?.version === 1 && ['artifact', 'view'].includes(ref.entityType)
        && ref.entityId === (ref.entityType === 'artifact' ? artifactId : artifactViewId)
        && ref.artifactId === artifactId && ref.artifactViewId === artifactViewId && ref.revisionId === revisionId;
    };
    if (![projectId, canvasId, workspaceId, artifactId, artifactViewId, revisionId].every(nonEmpty)
      || !current() || !matches(node) || typeof normalizeNodes !== 'function' || typeof backfillReceipt !== 'function')
      return { ok: false, reason: 'MATERIAL_PROJECTION_OWNER_UNAVAILABLE' };
    const before = editableState(api);
    try {
      const normalized = normalizeNodes([node]);
      if (!Array.isArray(normalized) || normalized.length !== 1 || !matches(normalized[0])
        || normalized[0].id !== node.id || !current() || before !== editableState(api))
        return { ok: false, reason: 'MATERIAL_PROJECTION_CHANGED_DURING_READBACK' };
      const receipt = backfillReceipt({ receiptKind: 'material-projection', projectId, canvasId, workspaceId,
        artifactId, artifactViewId, revisionId, nodes: normalized });
      if (receipt?.ok !== true) return { ok: false, reason: receipt?.reason || 'MATERIAL_HISTORY_UNCONFIRMED' };
      const unavailable = reason => ({ ok: false, reason });
      const published = () => {
        const nodes = api.getNodes().filter(value => value?.id === node.id);
        return nodes.length === 1 && nodes[0].type === node.type && matches(nodes[0]);
      };
      if (!current()) return unavailable('MATERIAL_PROJECTION_OWNER_CHANGED');
      if (published()) return receipt;
      // O8 updates React state. Its receipt is not proof that the original
      // Flow API has published the node; wait on that same owner's store.
      if (typeof ownerApi?.subscribeNative !== 'function') return unavailable('MATERIAL_PUBLICATION_UNCONFIRMED');
      return await new Promise(resolve => {
        let settled = false, release, timer;
        const finish = result => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (typeof release === 'function') release();
          resolve(result);
        };
        const check = () => {
          try {
            if (!current()) return finish(unavailable('MATERIAL_PROJECTION_OWNER_CHANGED'));
            if (published()) finish(receipt);
          } catch { finish(unavailable('MATERIAL_PUBLICATION_UNCONFIRMED')); }
        };
        timer = setTimeout(() => finish(unavailable('MATERIAL_PUBLICATION_UNCONFIRMED')), publicationTimeoutMs);
        release = ownerApi.subscribeNative(check);
        if (settled) release?.(); else check();
      });
    } catch { return { ok: false, reason: 'MATERIAL_PROJECTION_READBACK_FAILED' }; }
  };
}

export function createOriginalNodeApi(api, { undo, redo, subscribeNative, backfillNodeReceipt, inspectNativeHistory } = {}) {
  const resolve = ids => (ids || []).map(id => api.getNode(id)).filter(Boolean);
  const methods = ['getZoom', 'getNodeConnections', 'screenToFlowPosition', 'flowToScreenPosition', 'fitView', 'fitBounds', 'setCenter', 'setViewport', 'zoomIn', 'zoomOut', 'zoomTo'];
  const forwarded = Object.fromEntries(methods.filter(name => typeof api[name] === 'function').map(name => [name, (...args) => api[name](...args)]));
  return {
    ...forwarded,
    // Subscribe to the original ReactFlow owner; expose no setState or second
    // store. Consumers re-read existing nodes/camera through this same API.
    subscribeNative: listener => typeof subscribeNative === 'function' ? subscribeNative(listener) : () => {},
    backfillNodeReceipt: receipt => typeof backfillNodeReceipt === 'function'
      ? backfillNodeReceipt(safeClone(receipt))
      : { ok: false, reason: 'Original history receipt port is unavailable.' },
    inspectNativeHistory: query => typeof inspectNativeHistory === 'function'
      ? safeClone(inspectNativeHistory(safeClone(query)))
      : { ok: false, reason: 'Original history inspection port is unavailable.' },
    getNodes: () => safeClone(api.getNodes()), getEdges: () => safeClone(api.getEdges()),
    getNode: id => { const node = api.getNode(id); return node && safeClone(node); },
    getSelection: () => ({ nodeIds: api.getNodes().filter(n => n.selected).map(n => n.id), edgeIds: api.getEdges().filter(e => e.selected).map(e => e.id) }),
    getViewport: () => safeClone(api.getViewport()),
    getNodesBounds: ids => api.getNodesBounds(resolve(ids)),
    findMaterialPlacement: size => {
      if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return undefined;
      const nodes = api.getNodes(), byId = new Map(nodes.map(node => [node.id, node]));
      // Use the installed export-placement algorithm and its absolute-position
      // and size helpers. Starting beside the rightmost original carrier keeps
      // the fallback clear even when both rails fill the visible Canvas.
      let anchor, edge = -Infinity;
      for (const node of nodes) {
        const position = originalNodePosition(node, byId), right = position.x + originalNodeWidth(node);
        if (!Number.isFinite(right)) return undefined;
        if (right > edge) { anchor = node; edge = right; }
      }
      const point = originalExportPlacement(anchor?.id ?? '', id => api.getNode(id), () => nodes, size.width, size.height);
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : undefined;
    },
    addNodes: nodes => api.addNodes(safeClone(nodes)),
    updateNode: (id, changes, options) => api.updateNode(id, safeClone(changes), options),
    updateNodeData: (id, data, options) => api.updateNodeData(id, safeClone(data), options),
    deleteNodes: ids => api.deleteElements({ nodes: resolve(ids) }),
    deleteElements: ({ nodeIds = [], edgeIds = [] } = {}) => api.deleteElements({ nodes: resolve(nodeIds), edges: api.getEdges().filter(e => edgeIds.includes(e.id)) }),
    undo: () => undo?.(), redo: () => redo?.(),
  };
}

function nonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function collectionReferenceMatches(node, target) {
  const reference = node?.data?.lcos_collection_ref;
  return (node?.type === 'lcos-collection' || node?.type === 'pile' && node.data?.lcos_native_collection === true) && node.id === node.data?.id
    && reference?.projectId === target.projectId && reference?.canvasId === target.canvasId
    && reference?.workspaceId === target.workspaceId && reference?.collectionId === target.collectionId;
}
function samePosition(left, right) {
  return left?.x === right?.x && left?.y === right?.y;
}
// The donor r6 persists create/update positions through its DC(point, 2).
// Compare that wire representation only; the exact live signature below still
// detects every edit while the read-only merge plan is in flight.
function sameCollectionMergePersistedPosition(left, right) {
  return [left?.x,left?.y,right?.x,right?.y].every(Number.isFinite)
    && Math.round(left.x*100) === Math.round(right.x*100)
    && Math.round(left.y*100) === Math.round(right.y*100);
}
function sameCollectionData(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && (left[key] && right[key] && typeof left[key] === 'object' && typeof right[key] === 'object'
      ? sameCollectionData(left[key], right[key]) : left[key] === right[key]));
}

function createCollectionCarrierControls({ api, ownerApi, getHost, prepareHistory, backfillReceipt,
  flushCanvas: flush, retryCanvas: retry, normalizeNodes, inspectHistory, readOriginalNodes,
  queueCollectionArrangeIntent, cancelCollectionArrangeIntent,
  request = (address, options) => fetch(address, options) }) {
  const currentOwner = (target, isCurrent) => {
    const host = getHost();
    let stillCurrent = false;
    try { stillCurrent = isCurrent() === true; } catch { stillCurrent = false; }
    return host?.api === ownerApi && currentCanvasId(host) === target.canvasId
      && host?.projectId === target.projectId && stillCurrent;
  };
  const targetFrom = input => {
    const target = { projectId: input?.projectId, canvasId: input?.canvasId,
      workspaceId: input?.workspaceId, collectionId: input?.collectionId };
    return [target.projectId, target.canvasId, target.workspaceId].every(nonEmptyString) ? target : undefined;
  };
  const findLiveNode = nodeId => {
    const nodes = api.getNodes();
    if (!Array.isArray(nodes)) return { reason: '原画布节点读取不可用。' };
    const matches = nodes.filter(node => node?.id === nodeId);
    if (matches.length !== 1) return { reason: matches.length ? '集合原生 NodeID 重复，未改布局。' : '集合原生节点已离开当前画布。' };
    return { node: matches[0] };
  };
  const prepareCollectionGeometryHistory = (input, { isCurrent } = {}) => {
    const target = targetFrom(input);
    if (typeof isCurrent !== 'function') return { ok: false, reason: '当前 Workspace 校验回调不可用。' };
    if (!target || !currentOwner(target, isCurrent)) return { ok: false, reason: '当前 Canvas/API/Workspace 已切换。' };
    if (typeof prepareHistory !== 'function') return { ok: false, reason: '原 O8 几何历史 flush 接口尚未就绪。' };
    try {
      const result = prepareHistory();
      if (result?.ok !== true) return { ok: false, reason: result?.reason || '原 O8 历史尚未完成 flush。' };
    } catch {
      return { ok: false, reason: '原 O8 历史 flush 失败，未改集合位置。' };
    }
    return currentOwner(target, isCurrent) ? { ok: true } : { ok: false, reason: 'O8 历史 flush 后现场已切换。' };
  };
  const placeCollectionCarrier = (input, { isCurrent } = {}) => {
    const target = targetFrom(input);
    const position = input?.position;
    if (typeof isCurrent !== 'function') return { ok: false, reason: '当前 Workspace 校验回调不可用。' };
    if (!target || !currentOwner(target, isCurrent)) return { ok: false, reason: '当前 Canvas/API/Workspace 已切换。' };
    if (!nonEmptyString(input?.nodeId) || !nonEmptyString(target.collectionId)) {
      return { ok: false, reason: '集合落点缺少稳定 Native NodeID 或 CollectionID。' };
    }
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return { ok: false, reason: '集合落点必须是有限坐标。' };
    }
    const first = findLiveNode(input?.nodeId);
    if (!first.node) return { ok: false, reason: first.reason };
    if (!collectionReferenceMatches(first.node, target)) return { ok: false, reason: '集合 NodeID 与 Core 投影身份不匹配。' };
    if (first.node.dragging || first.node.data?.locked) {
      return { ok: false, reason: '集合正在拖动或已锁定，未覆盖其布局。' };
    }
    if (samePosition(first.node.position, position)) return { ok: true, idempotent: true };
    const prepared = prepareCollectionGeometryHistory(input, { isCurrent });
    if (!prepared.ok) return prepared;
    if (!currentOwner(target, isCurrent)) return { ok: false, reason: 'O8 历史 flush 后现场已切换。' };
    const latest = findLiveNode(input.nodeId);
    if (!latest.node || !collectionReferenceMatches(latest.node, target)
      || latest.node.dragging || latest.node.data?.locked
      || !samePosition(latest.node.position, first.node.position)) {
      return { ok: false, reason: latest.reason || '集合在原历史 flush 期间发生变化，保留当前布局。' };
    }
    if (typeof api.updateNode !== 'function') return { ok: false, reason: '原 ReactFlow updateNode 接口尚未就绪。' };
    try {
      // Only the original ReactFlow position field is changed. Data, parent,
      // selection, viewport, and camera remain owned by the vendor Canvas.
      api.updateNode(input.nodeId, { position: { x: position.x, y: position.y } });
      return currentOwner(target, isCurrent)
        ? { ok: true }
        : { ok: false, reason: '集合位置提交后现场已切换；需只读核对原画布。' };
    } catch {
      return { ok: false, reason: '原 ReactFlow 未接受集合位置更新。' };
    }
  };
  const synchronizeCollectionCarrier = async (input, { isCurrent } = {}) => {
    const target = targetFrom({ ...input, collectionId: input?.node?.data?.lcos_collection_ref?.collectionId });
    if (typeof isCurrent !== 'function') return { ok: false, reason: '当前 Workspace 校验回调不可用。' };
    if (!target || !currentOwner(target, isCurrent)) return { ok: false, reason: '当前 Canvas/API/Workspace 已切换。' };
    if (!collectionReferenceMatches(input?.node, target)) return { ok: false, reason: '集合投影引用与当前现场不匹配。' };
    if (typeof normalizeNodes !== 'function' || typeof backfillReceipt !== 'function') {
      return { ok: false, reason: '原 NativeFlow 转换或 O8 回执接口尚未就绪。' };
    }
    let normalized;
    try {
      const nodes = normalizeNodes([input.node]);
      if (!Array.isArray(nodes) || nodes.length !== 1 || !collectionReferenceMatches(nodes[0], target)) {
        return { ok: false, reason: '原 NativeFlow 转换后集合身份不一致。' };
      }
      normalized = nodes[0];
    } catch {
      return { ok: false, reason: '原 NativeFlow 集合投影转换失败。' };
    }
    if (!currentOwner(target, isCurrent)) return { ok: false, reason: '集合转换期间现场已切换。' };
    try {
      const result = backfillReceipt({ receiptKind: 'collection-projection', projectId: target.projectId,
        canvasId: target.canvasId, workspaceId: target.workspaceId, node: normalized });
      if (result?.ok !== true) return { ok: false, reason: result?.reason || '原 O8 集合回执未确认。' };
      // O8's existing receipt suppression resets with setTimeout(..., 0).
      // Yield behind that exact owner timer before callers can make the native
      // geometry edit, so the geometry cannot be swallowed by the projection echo.
      await new Promise(resolve => setTimeout(resolve, 0));
      return currentOwner(target, isCurrent) ? result
        : { ok: false, reason: '集合回执已应用，但等待原 O8 抑制复位时现场切换；只读核对，不自动重放。' };
    } catch {
      return { ok: false, reason: '原 O8 集合回执失败。' };
    }
  };
  const flushCanvas = async (canvasId, { retry: explicitRetry = false } = {}) => {
    const host = getHost();
    if (!nonEmptyString(canvasId) || host?.api !== ownerApi || currentCanvasId(host) !== canvasId
      || !nonEmptyString(host?.projectId)) return 'blocked';
    const save = explicitRetry === true ? retry : flush;
    if (typeof save !== 'function') return 'blocked';
    try {
      const result = await save(canvasId);
      const latestHost = getHost();
      return result === 'saved' && latestHost?.api === ownerApi
        && currentCanvasId(latestHost) === canvasId && latestHost?.projectId === host.projectId ? 'saved' : 'blocked';
    } catch { return 'blocked'; }
  };
  let openingSpace = false;
  const toggleCollectionSpace = async (input, { isCurrent } = {}) => {
    const unavailable = reason => ({ ok: false, reason });
    const target = targetFrom(input);
    if (openingSpace) return unavailable('集合空间动作仍在保存，请等待本次回执。');
    if (typeof isCurrent !== 'function' || !target || !nonEmptyString(target.collectionId)
      || !nonEmptyString(input?.nodeId) || !currentOwner(target, isCurrent)) {
      return unavailable('当前 Canvas/API/Workspace 或集合身份尚未就绪。');
    }
    const first = findLiveNode(input.nodeId);
    if (!first.node || !collectionReferenceMatches(first.node, target) || first.node.dragging || first.node.data?.locked) {
      return unavailable('集合已离开现场、正在拖动或已锁定，未改空间。');
    }
    openingSpace = true;
    try {
      if (await flushCanvas(target.canvasId) !== 'saved') return unavailable('原画布有未确认的保存；编辑已保留，请先在原保存入口核对。');
      if (!currentOwner(target, isCurrent)) return unavailable('保存期间现场已切换，未打开集合。');
      const live = findLiveNode(input.nodeId).node;
      if (!live || !collectionReferenceMatches(live, target) || live.dragging || live.data?.locked) {
        return unavailable('集合在保存期间发生变化，未打开空间。');
      }
      const frames = api.getNodes().filter(node => node.type === 'group'
        && node.data?.lcosCollectionId === target.collectionId && node.data?.lcosCollectionNodeId === input.nodeId);
      if (frames.length > 1) return unavailable('当前集合有重复空间容器，未更改显隐或历史。');
      if (frames.length === 1) {
        if (frames[0].data?.locked || frames[0].dragging) return unavailable('集合容器已锁定或正在移动。');
        return { ok: true, frameId: frames[0].id, collapsed: toggleCollectionDisplay(target.canvasId, frames[0].id) };
      }
      if (typeof api.setNodes !== 'function' || typeof normalizeNodes !== 'function' || typeof readOriginalNodes !== 'function'
        || typeof inspectHistory !== 'function' || typeof window.__LCOS_NATIVE_INTENT__?.queueCollectionSpaceIntent !== 'function') {
        return unavailable('原 ReactFlow/O8 集合空间事务口尚未就绪。');
      }
      const preparedHistory = prepareCollectionGeometryHistory(input, { isCurrent });
      if (!preparedHistory.ok) return preparedHistory;
      const readOriginalState = () => {
        const nodes = readOriginalNodes();
        return Array.isArray(nodes) ? editableState({ getNodes: () => nodes, getEdges: () => api.getEdges() }) : undefined;
      };
      const beforeRead = readOriginalState();
      if (beforeRead === undefined) return unavailable('原画布编辑数组尚未就绪，未采用显示投影作为首开历史。');
      const path = '/api/lcos/canvases/' + encodeURIComponent(target.canvasId)
        + '/collections/' + encodeURIComponent(target.collectionId) + '/space:prepare';
      const response = await request(path, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.code !== 0) return unavailable(payload?.message || '原集合布局准备失败，未修改画布。');
      const plan = payload.data;
      if (!currentOwner(target, isCurrent) || beforeRead !== readOriginalState()) {
        return unavailable('布局准备期间现场或编辑已变化；当前编辑保留，请重新点击。');
      }
      if (plan?.project_id !== target.projectId || plan.canvas_id !== target.canvasId || plan.workspace_id !== target.workspaceId
        || plan.collection_id !== target.collectionId || plan.collection_node_id !== input.nodeId
        || !nonEmptyString(plan.frame_id) || !Number.isSafeInteger(plan.source_version)
        || !Array.isArray(plan.before_nodes) || !Array.isArray(plan.after_nodes)
        || plan.committed !== false || plan.provider_execution_started !== false
        || plan.space?.frameId !== plan.frame_id || plan.space?.sourceVersion !== plan.source_version) {
        return unavailable('原布局计划的项目、载体或空间地址不完整，未提交。');
      }
      const normalizedBefore = normalizeNodes(plan.before_nodes);
      const normalizedAfter = normalizeNodes(plan.after_nodes);
      const actual = readOriginalNodes();
      if (!Array.isArray(actual)) return unavailable('原画布编辑数组已离开，未提交显示投影。');
      const actualById = new Map(actual.map(node => [node.id, node]));
      const afterById = new Map(normalizedAfter.map(node => [node.id, node]));
      if (actualById.size !== actual.length || afterById.size !== normalizedAfter.length
        || actualById.has(plan.frame_id)) return unavailable('空间计划含重复或已占用的 NodeID，未提交。');
      for (const before of normalizedBefore) {
        const current = actualById.get(before.id), after = afterById.get(before.id);
        if (!current || !after || current.type !== before.type || !samePosition(current.position, before.position)
          || (current.parentId ?? null) !== (before.parentId ?? null) || current.dragging || current.data?.locked
          || !sameCollectionData(current.data, before.data) || !sameCollectionData(after.data, before.data)) {
          return unavailable('成员的原引用、父级、位置或锁状态已变化，未覆盖当前画布。');
        }
      }
      const frame = afterById.get(plan.frame_id);
      if (!frame || frame.type !== 'group' || frame.data?.lcosCollectionId !== target.collectionId
        || frame.data?.lcosCollectionNodeId !== input.nodeId
        || normalizedAfter.length !== normalizedBefore.length + 1
        || typeof crypto.randomUUID !== 'function') return unavailable('原集合容器计划无法确认为同一批空间节点。');
      const scopeBeforeIds = new Set(normalizedBefore.map(node => node.id));
      if (normalizedAfter.some(node => node.id !== plan.frame_id && !scopeBeforeIds.has(node.id))) {
        return unavailable('原布局计划包含未确认的新材料节点，未提交。');
      }
      const next = [frame, ...actual.map(node => {
        if (!scopeBeforeIds.has(node.id)) return node;
        const desired = afterById.get(node.id);
        return { ...node, position: { ...desired.position }, parentId: desired.parentId,
          ...(desired.measured ? { measured: { ...desired.measured } } : {}),
          ...(node.width === undefined ? {} : { width: desired.width ?? desired.measured?.width }),
          ...(node.height === undefined ? {} : { height: desired.height ?? desired.measured?.height }) };
      })];
      const operation = { version: 1, operationId: crypto.randomUUID(), kind: 'collection-space', phase: 'apply', space: plan.space };
      const queued = window.__LCOS_NATIVE_INTENT__.queueCollectionSpaceIntent({ canvasId: target.canvasId,
        operation, beforeNodes: actual, afterNodes: next });
      if (queued?.ok !== true) return unavailable(queued?.reason || '原 O8 未确认集合空间操作，未修改节点。');
      if (!currentOwner(target, isCurrent) || beforeRead !== readOriginalState()) {
        window.__LCOS_NATIVE_INTENT__.cancelCollectionSpaceIntent?.(operation.operationId);
        return unavailable('提交前原画布已变化，未覆盖编辑。');
      }
      // Exactly like the donor's createNewGroup: one original setNodes update.
      // The original O8 count-change effect creates the history entry; r6 owns
      // persistence. No server mutation occurs in this bridge or prepare GET.
      try { api.setNodes(next); }
      catch (error) {
        window.__LCOS_NATIVE_INTENT__.cancelCollectionSpaceIntent?.(operation.operationId);
        throw error;
      }
      const deadline = Date.now() + 5000;
      let recorded = false;
      while (Date.now() < deadline && currentOwner(target, isCurrent)) {
        const history = inspectHistory({ canvasId: target.canvasId, nodeId: plan.frame_id });
        recorded = history?.currentEntry?.operations?.some(action => action.operation?.operationId === operation.operationId
          || action.operationId === operation.operationId || action.lcos_operation?.operationId === operation.operationId) === true;
        if (recorded) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!recorded) return unavailable('空间已进入原画布但原 O8 回执尚未确认；请核对保存状态，不重复创建。');
      if (await flushCanvas(target.canvasId) !== 'saved') {
        return unavailable('原空间保存尚未确认，编辑与原历史已保留；请从原保存入口核对，不重复创建。');
      }
      return currentOwner(target, isCurrent) ? { ok: true, frameId: plan.frame_id, collapsed: false }
        : unavailable('空间操作已提交，但现场已切换；只读核对，不自动重放。');
    } catch (error) {
      return unavailable('集合空间未完成确认：' + (error instanceof Error ? error.message : String(error)));
    } finally { openingSpace = false; }
  };
  const arrangeCollectionSpace = async (input, { isCurrent } = {}) => {
    const unavailable = reason => ({ ok: false, reason });
    const target = targetFrom(input);
    if (openingSpace) return unavailable('集合空间动作仍在保存，请等待本次回执。');
    if (typeof isCurrent !== 'function' || !target || !nonEmptyString(target.collectionId)
      || !nonEmptyString(input?.nodeId) || !currentOwner(target, isCurrent)) {
      return unavailable('当前 Canvas/API/Workspace 或集合身份尚未就绪。');
    }
    if (typeof readOriginalNodes !== 'function' || typeof api.setNodes !== 'function'
      || typeof normalizeNodes !== 'function' || typeof inspectHistory !== 'function'
      || typeof queueCollectionArrangeIntent !== 'function') {
      return unavailable('原 Canvas/O8 的集合排列接口尚未就绪。');
    }
    const rawSignature = () => {
      const nodes = readOriginalNodes();
      return JSON.stringify(Array.isArray(nodes) ? nodes.map(node => ({ id: node.id, type: node.type,
        data: node.data, position: node.position, parentId: node.parentId, width: node.width,
        height: node.height, measured: node.measured, style: node.style, hidden: node.hidden })) : null);
    };
    openingSpace = true;
    try {
      if (await flushCanvas(target.canvasId) !== 'saved') return unavailable('原画布有未确认保存；保留当前编辑，未排列。');
      if (!currentOwner(target, isCurrent)) return unavailable('保存期间现场已切换，未排列。');
      const live = findLiveNode(input.nodeId).node;
      if (!live || !collectionReferenceMatches(live, target) || live.dragging || live.data?.locked) {
        return unavailable('集合已离开现场、正在移动或已锁定。');
      }
      const original = readOriginalNodes();
      if (!Array.isArray(original)) return unavailable('原 Canvas 未提供未投影的节点快照，未改显隐或布局。');
      const frames = original.filter(node => node.type === 'group'
        && node.data?.lcosCollectionId === target.collectionId && node.data?.lcosCollectionNodeId === input.nodeId);
      if (frames.length !== 1 || frames[0].dragging || frames[0].data?.locked) return unavailable('当前集合缺少唯一可操作的原容器。');
      const preparedHistory = prepareCollectionGeometryHistory(input, { isCurrent });
      if (!preparedHistory.ok) return preparedHistory;
      const beforeRead = rawSignature();
      const path = '/api/lcos/canvases/' + encodeURIComponent(target.canvasId)
        + '/collections/' + encodeURIComponent(target.collectionId) + '/space:arrange-prepare';
      const response = await request(path, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.code !== 0) return unavailable(payload?.message || '原集合排列规划失败，未修改画布。');
      const plan = payload.data;
      if (!currentOwner(target, isCurrent) || beforeRead !== rawSignature()) return unavailable('规划期间现场或编辑已变化，当前编辑保留。');
      if (plan?.project_id !== target.projectId || plan.canvas_id !== target.canvasId || plan.workspace_id !== target.workspaceId
        || plan.collection_id !== target.collectionId || plan.collection_node_id !== input.nodeId
        || plan.frame_id !== frames[0].id || plan.same_frame !== true || plan.created !== false
        || plan.committed !== false || plan.provider_execution_started !== false
        || !Number.isSafeInteger(plan.source_version) || !Array.isArray(plan.before_nodes) || !Array.isArray(plan.after_nodes)
        || !Array.isArray(plan.changed_node_ids) || plan.space?.frameId !== plan.frame_id
        || plan.space?.sourceVersion !== plan.source_version) return unavailable('原排列计划的现场、容器或快照身份不完整。');
      const normalizedBefore = normalizeNodes(plan.before_nodes), normalizedAfter = normalizeNodes(plan.after_nodes);
      const actual = readOriginalNodes();
      const actualById = new Map(actual.map(node => [node.id, node]));
      const beforeById = new Map(normalizedBefore.map(node => [node.id, node]));
      const afterById = new Map(normalizedAfter.map(node => [node.id, node]));
      const changedIds = new Set(plan.changed_node_ids);
      if (actualById.size !== actual.length || beforeById.size !== normalizedBefore.length
        || afterById.size !== normalizedAfter.length || beforeById.size !== afterById.size
        || changedIds.size !== plan.changed_node_ids.length || !beforeById.has(plan.frame_id)
        || [...changedIds].some(id => !beforeById.has(id))) return unavailable('原排列计划含重复或范围外NodeID。');
      const liveById = new Map(api.getNodes().map(node => [node.id, node]));
      for (const [id, before] of beforeById) {
        const current = actualById.get(id), after = afterById.get(id), displayed = liveById.get(id);
        const size = current?.measured ?? current;
        if (!current || !after || !displayed || current.type !== before.type || after.type !== before.type
          || !samePosition(current.position, before.position) || (current.parentId ?? null) !== (before.parentId ?? null)
          || !sameCollectionData(current.data, before.data) || !sameCollectionData(after.data, before.data)
          || size.width !== before.measured?.width || size.height !== before.measured?.height
          || changedIds.has(id) && (current.dragging || current.data?.locked || displayed.dragging || displayed.data?.locked)) {
          return unavailable('成员的原引用、父级、位置、尺寸或锁状态已变化，未覆盖当前画布。');
        }
        // Existing ancestors/siblings can receive executor-derived fit geometry,
        // but never a new parent. The original O8 queue below validates the
        // complete same-owner hierarchy closure against both actual raw arrays.
        const beforeParent = before.parentId ?? null, afterParent = after.parentId ?? null;
        if (id === plan.frame_id ? afterParent !== beforeParent
          : afterParent !== beforeParent && !(beforeParent === null && afterParent === plan.frame_id)) {
          return unavailable('原排列计划尝试改动容器归属或借用其他父级，未提交。');
        }
      }
      const frame = afterById.get(plan.frame_id);
      if (frame?.type !== 'group' || frame.data?.lcosCollectionId !== target.collectionId
        || frame.data?.lcosCollectionNodeId !== input.nodeId) return unavailable('原排列容器不是当前集合的精确group。');
      if (changedIds.size === 0) return { ok: true, frameId: plan.frame_id, idempotent: true };
      const next = actual.map(node => {
        if (!changedIds.has(node.id)) return node;
        const desired = afterById.get(node.id), size = desired.measured;
        return { ...node, position: { ...desired.position }, parentId: desired.parentId,
          measured: { ...size }, width: size.width, height: size.height,
          ...(node.style ? { style: { ...node.style,
            ...(node.style.width === undefined ? {} : { width: size.width }),
            ...(node.style.height === undefined ? {} : { height: size.height }) } } : {}) };
      });
      const operation = { version: 1, operationId: crypto.randomUUID(), kind: 'collection-arrange', phase: 'apply', space: plan.space };
      const queued = queueCollectionArrangeIntent({ canvasId: target.canvasId,
        operation, beforeNodes: actual, afterNodes: next });
      if (queued?.ok !== true || !nonEmptyString(queued.anchorNodeId)) return unavailable(queued?.reason || '原O8未确认集合排列，未修改节点。');
      if (!currentOwner(target, isCurrent) || beforeRead !== rawSignature()) {
        cancelCollectionArrangeIntent?.(operation.operationId);
        return unavailable('提交前原画布已变化，保留当前编辑。');
      }
      try { api.setNodes(next); }
      catch (error) { cancelCollectionArrangeIntent?.(operation.operationId); throw error; }
      const deadline = Date.now() + 5000;
      let recorded = false;
      while (Date.now() < deadline && currentOwner(target, isCurrent)) {
        const history = inspectHistory({ canvasId: target.canvasId, nodeId: queued.anchorNodeId });
        recorded = history?.currentEntry?.operations?.some(action => action.operation?.operationId === operation.operationId) === true;
        if (recorded) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!recorded) return unavailable('排列已进入原画布但O8回执未确认；请核对保存状态，勿重复提交。');
      if (await flushCanvas(target.canvasId) !== 'saved') return unavailable('原排列保存尚未确认，编辑与原历史保留；未自动重试。');
      return currentOwner(target, isCurrent) ? { ok: true, frameId: plan.frame_id, idempotent: false }
        : unavailable('排列已提交但现场已切换，请只读核对。');
    } catch (error) { return unavailable(error instanceof Error ? error.message : '集合排列尚未确认。'); }
    finally { openingSpace = false; }
  };
  const mergeCollectionSpace = async (input, { isCurrent } = {}) => {
    const unavailable = reason => ({ ok: false, reason });
    const target = targetFrom(input), sourceId = input?.sourceNodeId, sourceCollectionId = input?.sourceCollectionId;
    if (openingSpace || typeof isCurrent !== 'function' || !target || !nonEmptyString(target.collectionId)
      || !nonEmptyString(input?.nodeId) || !nonEmptyString(sourceId) || !nonEmptyString(sourceCollectionId)
      || sourceId === input.nodeId || sourceCollectionId === target.collectionId || !currentOwner(target,isCurrent)) {
      return unavailable('当前集合合并身份或原现场尚未就绪。');
    }
    const intent = window.__LCOS_NATIVE_INTENT__;
    if (typeof readOriginalNodes !== 'function' || typeof api.setNodes !== 'function' || typeof normalizeNodes !== 'function'
      || typeof inspectHistory !== 'function' || typeof intent?.queueCollectionMergeIntent !== 'function') {
      return unavailable('原画布集合合并与历史接口尚未就绪。');
    }
    const sourceTarget = {...target,collectionId:sourceCollectionId};
    const signature = () => JSON.stringify(readOriginalNodes());
    openingSpace = true;
    try {
      // The donor finishes its drag-stop state after its synchronous callback.
      // Enter behind that original update before flushing the existing O8 save.
      await new Promise(resolve=>setTimeout(resolve,0));
      if (!currentOwner(target,isCurrent) || await flushCanvas(target.canvasId) !== 'saved') return unavailable('原画布保存尚未确认，两个集合都已保留。');
      const source = findLiveNode(sourceId).node, destination = findLiveNode(input.nodeId).node;
      if (!collectionReferenceMatches(source,sourceTarget) || !collectionReferenceMatches(destination,target)
        || source.dragging || destination.dragging || source.data?.locked || destination.data?.locked) return unavailable('集合身份、移动或锁状态已变化，未合并。');
      const preparedHistory = prepareCollectionGeometryHistory(input,{isCurrent});
      if (!preparedHistory.ok) return preparedHistory;
      const beforeRead = signature();
      const path='/api/lcos/canvases/'+encodeURIComponent(target.canvasId)+'/collections/'+encodeURIComponent(target.collectionId)
        +'/space:merge-prepare?sourceCollectionId='+encodeURIComponent(sourceCollectionId);
      const response=await request(path,{cache:'no-store',redirect:'error',headers:{Accept:'application/json'}}),payload=await response.json();
      if(!response.ok||payload?.code!==0)return unavailable('两个集合尚未合并：'+String(payload?.message||'无法读取原画布合并计划。'));
      const plan=payload.data;
      if(!currentOwner(target,isCurrent)||beforeRead!==signature())return unavailable('准备期间画布或编辑已变化，当前编辑已保留。');
      if(plan?.project_id!==target.projectId||plan.canvas_id!==target.canvasId||plan.workspace_id!==target.workspaceId
        ||plan.source_collection_id!==sourceCollectionId||plan.target_collection_id!==target.collectionId
        ||plan.source_node_id!==sourceId||plan.target_node_id!==input.nodeId||plan.committed!==false
        ||plan.provider_execution_started!==false||!Array.isArray(plan.before_nodes)||!Array.isArray(plan.after_nodes)
        ||plan.merge?.sourceNodeId!==sourceId||plan.merge?.targetNodeId!==input.nodeId||!Number.isSafeInteger(plan.source_version))return unavailable('合并计划与当前两个集合不一致，未提交。');
      const before=normalizeNodes(plan.before_nodes),after=normalizeNodes(plan.after_nodes),actual=readOriginalNodes();
      const actualById=new Map(actual.map(node=>[node.id,node])),beforeById=new Map(before.map(node=>[node.id,node])),afterById=new Map(after.map(node=>[node.id,node]));
      if(actualById.size!==actual.length||beforeById.size!==before.length||afterById.size!==after.length
        ||!beforeById.has(sourceId)||afterById.has(sourceId)||!afterById.has(input.nodeId))return unavailable('合并计划含重复或缺失节点，未提交。');
      for(const node of before){
        const live=actualById.get(node.id);
        if(!live||live.type!==node.type||live.dragging||live.data?.locked||!sameCollectionMergePersistedPosition(live.position,node.position)
          ||(live.parentId??null)!==(node.parentId??null)||!sameCollectionData(live.data,node.data))return unavailable('原节点引用、正文或位置已变化，未覆盖当前编辑。');
      }
      const next=actual.flatMap(node=>{
        if(!beforeById.has(node.id))return[node];
        const desired=afterById.get(node.id);if(!desired)return[];
        const position=(node.parentId??null)===(desired.parentId??null)
          &&sameCollectionMergePersistedPosition(node.position,desired.position)?node.position:desired.position;
        return[{...node,data:desired.data,position:{...position},parentId:desired.parentId,
          ...(desired.measured?{measured:{...desired.measured}}:{}),
          ...(node.width===undefined?{}:{width:desired.width??desired.measured?.width}),
          ...(node.height===undefined?{}:{height:desired.height??desired.measured?.height})}];
      });
      const operation={version:1,operationId:crypto.randomUUID(),kind:'collection-merge',phase:'apply',merge:plan.merge};
      const queued=intent.queueCollectionMergeIntent({canvasId:target.canvasId,operation,beforeNodes:actual,afterNodes:next});
      if(queued?.ok!==true)return unavailable('原历史未接受这次合并，两个集合都已保留。');
      if(!currentOwner(target,isCurrent)||beforeRead!==signature()){intent.cancelCollectionMergeIntent(operation.operationId);return unavailable('提交前画布已变化，未覆盖编辑。');}
      try{api.setNodes(next);}catch(error){intent.cancelCollectionMergeIntent(operation.operationId);throw error;}
      const deadline=Date.now()+5000;let recorded=false;
      while(Date.now()<deadline&&currentOwner(target,isCurrent)){
        const history=inspectHistory({canvasId:target.canvasId,nodeId:sourceId});
        recorded=history?.currentEntry?.operations?.some(action=>action.operation?.operationId===operation.operationId)===true;
        if(recorded)break;await new Promise(resolve=>setTimeout(resolve,20));
      }
      if(!recorded)return unavailable('合并已进入原画布，历史回执尚未确认；请核对保存状态，不重复操作。');
      if(await flushCanvas(target.canvasId)!=='saved')return unavailable('合并保存尚未确认，原编辑与撤销记录均保留；请核对结果，不重复提交。');
      return currentOwner(target,isCurrent)?{ok:true,sourceNodeId:sourceId,targetNodeId:input.nodeId}:unavailable('合并已提交，但现场切换；请只读核对结果。');
    }catch(error){return unavailable(error instanceof Error?error.message:'集合合并结果尚未确认。');}
    finally{openingSpace=false;}
  };

  return { prepareCollectionGeometryHistory, placeCollectionCarrier, synchronizeCollectionCarrier, flushCanvas,
    toggleCollectionSpace, arrangeCollectionSpace, mergeCollectionSpace };
}

export function LCOSOriginalNodeBridge({ canvasId, undo, redo, backfillNodeReceipt, inspectNativeHistory, originalNodes }) {
  const api = useCanvasApi();
  const nativeStore = useNativeFlowStoreApi();
  // Read-only reference to the existing Canvas state, before display-only
  // hidden projection. Never copy derived hidden flags back into that owner.
  const originalNodeSnapshot = React.useRef(originalNodes);
  originalNodeSnapshot.current = originalNodes;
  // History callback changes do not mean the underlying Canvas/API changed.
  // Keep one facade per real Flow owner, while delegating to the current
  // history callbacks; pending saves still reject a real owner/scene switch.
  const historyCallbacks = React.useRef({ undo, redo, backfillNodeReceipt, inspectNativeHistory });
  historyCallbacks.current = { undo, redo, backfillNodeReceipt, inspectNativeHistory };
  const originalApi = React.useMemo(() => {
    const facade = createOriginalNodeApi(api, {
      undo: () => historyCallbacks.current.undo?.(),
      redo: () => historyCallbacks.current.redo?.(),
      backfillNodeReceipt: receipt => typeof historyCallbacks.current.backfillNodeReceipt === 'function'
        ? historyCallbacks.current.backfillNodeReceipt(receipt)
        : { ok: false, reason: 'Original history receipt port is unavailable.' },
      inspectNativeHistory: query => typeof historyCallbacks.current.inspectNativeHistory === 'function'
        ? historyCallbacks.current.inspectNativeHistory(query)
        : { ok: false, reason: 'Original history inspection port is unavailable.' },
      subscribeNative: listener => nativeStore.subscribe(listener),
    });
    Object.assign(facade, createCollectionCarrierControls({ api, ownerApi: facade,
      getHost: () => window.__LCOS_NODE_LAB__,
      prepareHistory: () => typeof historyCallbacks.current.backfillNodeReceipt?.prepareCollectionGeometryHistory === 'function'
        ? historyCallbacks.current.backfillNodeReceipt.prepareCollectionGeometryHistory()
        : { ok: false, reason: 'Original O8 collection geometry history port is unavailable.' },
      backfillReceipt: receipt => facade.backfillNodeReceipt(receipt),
      inspectHistory: query => facade.inspectNativeHistory(query),
      readOriginalNodes: () => originalNodeSnapshot.current,
      queueCollectionArrangeIntent: input => historyCallbacks.current.backfillNodeReceipt?.queueCollectionArrangeIntent?.(input),
      cancelCollectionArrangeIntent: operationId => historyCallbacks.current.backfillNodeReceipt?.cancelCollectionArrangeIntent?.(operationId),
      flushCanvas: typeof flushNativeCanvas === 'function' ? flushNativeCanvas : undefined,
      retryCanvas: typeof retryNativeCanvas === 'function' ? retryNativeCanvas : undefined,
      normalizeNodes: typeof normalizeNativeNodes === 'function' && typeof normalizeNativeNodeParams === 'function'
        ? nodes => normalizeNativeNodeParams(normalizeNativeNodes(nodes)) : undefined,
    }));
    facade.synchronizeExecutionProjection = createExecutionProjectionSynchronizer({ api, ownerApi: facade,
      getHost: () => window.__LCOS_NODE_LAB__,
      flushCanvas: typeof flushNativeCanvas === 'function' ? flushNativeCanvas : undefined,
      retryCanvas: typeof retryNativeCanvas === 'function' ? retryNativeCanvas : undefined,
      backfillReceipt: receipt => facade.backfillNodeReceipt(receipt),
      normalizeNodes: typeof normalizeNativeNodes === 'function' && typeof normalizeNativeNodeParams === 'function'
        ? nodes => normalizeNativeNodeParams(normalizeNativeNodes(nodes)) : undefined,
    });
    facade.synchronizeConversationProjection = createConversationProjectionSynchronizer({ api, ownerApi: facade,
      getHost: () => window.__LCOS_NODE_LAB__,
      flushCanvas: typeof flushNativeCanvas === 'function' ? flushNativeCanvas : undefined,
      retryCanvas: typeof retryNativeCanvas === 'function' ? retryNativeCanvas : undefined,
      backfillReceipt: receipt => facade.backfillNodeReceipt(receipt),
      normalizeNodes: typeof normalizeNativeNodes === 'function' && typeof normalizeNativeNodeParams === 'function'
        ? nodes => normalizeNativeNodeParams(normalizeNativeNodes(nodes)) : undefined,
    });
    facade.synchronizeMaterialProjection = createMaterialProjectionSynchronizer({ api, ownerApi: facade,
      getHost: () => window.__LCOS_NODE_LAB__, backfillReceipt: receipt => facade.backfillNodeReceipt(receipt),
      normalizeNodes: typeof normalizeNativeNodes === 'function' && typeof normalizeNativeNodeParams === 'function'
        ? nodes => normalizeNativeNodeParams(normalizeNativeNodes(nodes)) : undefined,
    });
    return facade;
  }, [api, nativeStore]);
  React.useEffect(() => {
    const host = window.__LCOS_NODE_BRIDGE_HOST__;
    if (!host?.connect) return;
    const release = host.connect({ canvasId, api: originalApi });
    return () => release?.();
  }, [originalApi, canvasId]);
  return null;
}
