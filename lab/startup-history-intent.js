// Runtime companion for the in-memory TapNow history-intent transform.
// Operation metadata lives inside TapNow's own snapshots; this module owns no second stack.
(function installNativeIntent(global) {
  if (!global || global.__LCOS_NATIVE_INTENT__) return;

  const byCanvasNode = new Map();
  const pendingNodeIntents = new Map();
  const pendingHistoryActions = new Map();
  const activeIntents = [];
  let nextId = 0;

  function identifier() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch { /* use the local fallback */ }
    nextId += 1;
    return 'tap-history-' + Date.now().toString(36) + '-' + nextId.toString(36);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value)); }
  }

  function nodeKey(canvasId, nodeId) { return String(canvasId || '') + '\0' + String(nodeId || ''); }
  function operationKey(item) {
    const operation = item && item.lcos_operation;
    if (!operation || operation.version !== 1 || !operation.operationId || !operation.kind || !operation.phase) return '';
    return [operation.operationId, operation.kind, operation.phase].join('\0');
  }

  function stableOperation(operation) {
    if (!operation || operation.version !== 1 || !operation.operationId || !operation.kind) return undefined;
    return { ...clone(operation), phase: 'apply' };
  }

  function inspectNativeHistory({ canvasId, requestedCanvasId, nodeId, history, currentIndex } = {}) {
    if (typeof canvasId !== 'string' || !canvasId || requestedCanvasId !== canvasId) {
      return { ok: false, reason: 'HISTORY_CANVAS_MISMATCH' };
    }
    if (typeof nodeId !== 'string' || !nodeId) return { ok: false, reason: 'HISTORY_NODE_ID_REQUIRED' };
    if (!Array.isArray(history) || history.length === 0 || !Number.isInteger(currentIndex)
      || currentIndex < 0 || currentIndex >= history.length) {
      return { ok: false, reason: 'HISTORY_OWNER_STATE_INVALID' };
    }

    const nodeSummary = node => {
      const measured = node?.measured && typeof node.measured === 'object' && !Array.isArray(node.measured)
        ? { width: Number.isFinite(node.measured.width) ? node.measured.width : null,
          height: Number.isFinite(node.measured.height) ? node.measured.height : null }
        : null;
      return {
        id: node.id,
        type: typeof node.type === 'string' ? node.type : null,
        position: node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)
          ? { x: node.position.x, y: node.position.y } : null,
        width: Number.isFinite(node.width) ? node.width : null,
        height: Number.isFinite(node.height) ? node.height : null,
        measured,
      };
    };
    const operationSummary = action => {
      const operation = action?.lcos_operation;
      return {
        nodeId: typeof action?.nodeId === 'string' ? action.nodeId : null,
        aliases: Array.isArray(action?.aliases) ? action.aliases.filter(id => typeof id === 'string') : [],
        carrierId: typeof action?.carrierId === 'string' ? action.carrierId : null,
        changeType: typeof action?.changeType === 'string' ? action.changeType : null,
        operation: operation && typeof operation === 'object' ? {
          version: Number.isInteger(operation.version) ? operation.version : null,
          operationId: typeof operation.operationId === 'string' ? operation.operationId : null,
          kind: typeof operation.kind === 'string' ? operation.kind : null,
          phase: typeof operation.phase === 'string' ? operation.phase : null,
        } : null,
        unsupported: typeof action?.lcos_intent_unsupported === 'string' ? action.lcos_intent_unsupported : null,
      };
    };
    const summarizeEntry = index => {
      if (index < 0 || index >= history.length) return null;
      const entry = history[index];
      const stateNodes = Array.isArray(entry?.state?.nodes) ? entry.state.nodes : [];
      const nodes = stateNodes.filter(node => node?.id === nodeId).map(nodeSummary);
      const operations = (Array.isArray(entry?.lcos_history_operations) ? entry.lcos_history_operations : [])
        .filter(action => action?.nodeId === nodeId || action?.carrierId === nodeId
          || (Array.isArray(action?.aliases) && action.aliases.includes(nodeId)))
        .map(operationSummary);
      return {
        index,
        timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : null,
        nodeCount: stateNodes.length,
        nodes,
        operations,
      };
    };

    return {
      ok: true,
      canvasId,
      nodeId,
      currentIndex,
      historySize: history.length,
      canUndo: currentIndex > 0,
      canRedo: currentIndex < history.length - 1,
      // O8 associates undo with the entry being left; expose it alongside the
      // destination snapshots so inspection never guesses which entry owns an operation.
      currentEntry: summarizeEntry(currentIndex),
      undoTarget: summarizeEntry(currentIndex - 1),
      redoTarget: summarizeEntry(currentIndex + 1),
    };
  }

  function remember(canvasId, nodeId, ref) {
    const nodeMapKey = nodeId === undefined || nodeId === null || nodeId === '' ? undefined : nodeKey(canvasId, nodeId);
    if (!nodeMapKey) return;
    const record = byCanvasNode.get(nodeMapKey) || { ref: undefined };
    // A detail/refetch without a reference must not erase a receipt already attached to this Native ID.
    if (ref !== undefined) {
      // A receipt only proves its exact accepted revision. A later canonical
      // binding must not let that proof rewrite an older body when it reappears.
      if (record.textReceipt && !refAlreadyMatches(record.textReceipt.ref, ref)) delete record.textReceipt;
      record.ref = clone(ref);
    }
    byCanvasNode.set(nodeMapKey, record);
  }

  function attachIntent(change, metadata) {
    try { Object.defineProperty(change, '__lcos_native_intent', { configurable: true, enumerable: false, writable: true, value: metadata }); }
    catch { change.__lcos_native_intent = metadata; }
  }

  function snapshot(node) {
    if (!node || typeof node !== 'object') return undefined;
    try {
      const copied = clone(node);
      return copied && typeof copied === 'object' ? copied : undefined;
    } catch { return undefined; }
  }

  function queueHistoryAction(canvasId, nodeId, changeType, operation, ref, fullNode, aliases = [nodeId]) {
    if (nodeId === undefined || nodeId === null || nodeId === '' || !operation?.operationId) return;
    const key = nodeKey(canvasId, nodeId);
    const actions = pendingHistoryActions.get(key) || [];
    actions.push({
      nodeId,
      aliases: [...new Set((Array.isArray(aliases) ? aliases : [nodeId]).filter(id => typeof id === 'string' && id))],
      carrierId: nodeId,
      changeType,
      lcos_operation: stableOperation(operation),
      ...(!['collection-space','collection-merge'].includes(operation.kind) && ref !== undefined ? { lcos_ref: clone(ref) } : {}),
      ...(!['collection-space','collection-merge'].includes(operation.kind) && fullNode ? { lcos_snapshot: snapshot(fullNode) } : {}),
    });
    pendingHistoryActions.set(key, actions);
  }

  function nonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
  function collectionSpaceOperation(operation, canvasId) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)
      || operation.version !== 1 || !nonEmptyString(operation.operationId)
      || operation.kind !== 'collection-space' || !['apply', 'undo', 'redo'].includes(operation.phase)
      || !operation.space || typeof operation.space !== 'object' || Array.isArray(operation.space)) return undefined;
    const space = operation.space;
    if (![space.projectId, space.canvasId, space.workspaceId, space.collectionId,
      space.collectionNodeId, space.frameId].every(nonEmptyString)
      || space.canvasId !== canvasId
      || !Number.isSafeInteger(space.sourceVersion) || space.sourceVersion < 0
      || !Array.isArray(space.before) || !Array.isArray(space.after)) return undefined;
    const readSlices = values => {
      const output = new Map();
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !nonEmptyString(value.id)
          || !value.position || !Number.isFinite(value.position.x) || !Number.isFinite(value.position.y)
          || !(value.parentId === null || typeof value.parentId === 'string')
          || !value.size || !Number.isFinite(value.size.width) || !Number.isFinite(value.size.height)
          || value.size.width < 0 || value.size.height < 0 || output.has(value.id)) return undefined;
        output.set(value.id, { id: value.id, position: { x: value.position.x, y: value.position.y },
          parentId: value.parentId, size: { width: value.size.width, height: value.size.height } });
      }
      return output;
    };
    const before = readSlices(space.before), after = readSlices(space.after);
    if (!before || !after || before.has(space.frameId) || !after.has(space.frameId)) return undefined;
    const children = [...before.keys()];
    if (after.size !== children.length + 1 || children.some(id => !after.has(id))) return undefined;
    for (const id of children) if (sameSpaceSlice(before.get(id), after.get(id))) return undefined;
    return { operation: clone(operation), space: { ...space, before: [...before.values()], after: [...after.values()] }, before, after, children };
  }

  function sameSpaceSlice(left, right) {
    return !!left && !!right && left.id === right.id
      && left.position?.x === right.position?.x && left.position?.y === right.position?.y
      && left.parentId === right.parentId
      && left.size?.width === right.size?.width && left.size?.height === right.size?.height;
  }

  function sameUnplannedNodeSpace(left, right) {
    return !!left && !!right && left.id === right.id
      && Number.isFinite(left.position?.x) && Number.isFinite(left.position?.y)
      && Number.isFinite(right.position?.x) && Number.isFinite(right.position?.y)
      && left.position.x === right.position.x && left.position.y === right.position.y
      && (left.parentId ?? null) === (right.parentId ?? null)
      && left.width === right.width && left.height === right.height;
  }

  function nodeSpaceSlice(node) {
    if (!node || typeof node !== 'object' || !nonEmptyString(node.id)
      || !node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
      || !(node.parentId === undefined || node.parentId === null || typeof node.parentId === 'string')
      || !Number.isFinite(node.width) || !Number.isFinite(node.height)) return undefined;
    return { id: node.id, position: { x: node.position.x, y: node.position.y },
      parentId: node.parentId ?? null, size: { width: node.width, height: node.height } };
  }

  function uniqueNodeMap(nodes) {
    if (!Array.isArray(nodes)) return undefined;
    const result = new Map();
    for (const node of nodes) {
      if (!node || typeof node !== 'object' || !nonEmptyString(node.id) || result.has(node.id)) return undefined;
      result.set(node.id, node);
    }
    return result;
  }

  function collectionSpaceMatchesNodeMap(plan, nodes, which) {
    const actual = uniqueNodeMap(nodes);
    if (!actual) return false;
    const expected = which === 'before' ? plan.before : plan.after;
    for (const [id, slice] of expected) {
      const node = actual.get(id);
      if (!node || !sameSpaceSlice(nodeSpaceSlice(node), slice)) return false;
    }
    if (which === 'before' ? actual.has(plan.space.frameId) : !actual.has(plan.space.frameId)) return false;
    return true;
  }

  function sameNativeValue(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left)) return left.length === right.length
      && left.every((value, index) => sameNativeValue(value, right[index]));
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
      && sameNativeValue(left[key], right[key]));
  }

  function collectionArrangeOperation(operation, canvasId) {
    const operationKeys = ['kind', 'operationId', 'phase', 'space', 'version'];
    const spaceKeys = ['after', 'before', 'canvasId', 'collectionId', 'collectionNodeId', 'frameId', 'projectId', 'sourceVersion', 'workspaceId'];
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)
      || Object.keys(operation).sort().join(',') !== operationKeys.join(',')
      || operation.version !== 1 || !nonEmptyString(operation.operationId) || operation.kind !== 'collection-arrange'
      || !['apply', 'undo', 'redo'].includes(operation.phase)
      || !operation.space || typeof operation.space !== 'object' || Array.isArray(operation.space)
      || Object.keys(operation.space).sort().join(',') !== spaceKeys.join(',')
      || ![operation.space.projectId, operation.space.canvasId, operation.space.workspaceId, operation.space.collectionId,
        operation.space.collectionNodeId, operation.space.frameId].every(nonEmptyString)
      || operation.space.canvasId !== canvasId || !Number.isSafeInteger(operation.space.sourceVersion)
      || operation.space.sourceVersion < 0 || !Array.isArray(operation.space.before) || !Array.isArray(operation.space.after)) return undefined;
    const readSlices = values => {
      const output = new Map();
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !nonEmptyString(value.id)
          || Object.keys(value).sort().join(',') !== 'id,parentId,position,size'
          || !value.position || !Number.isFinite(value.position.x) || !Number.isFinite(value.position.y)
          || !(value.parentId === null || nonEmptyString(value.parentId))
          || !value.size || typeof value.size !== 'object' || Array.isArray(value.size)
          || Object.keys(value.size).sort().join(',') !== 'height,width'
          || !Number.isFinite(value.size.width) || value.size.width <= 0
          || !Number.isFinite(value.size.height) || value.size.height <= 0 || output.has(value.id)) return undefined;
        output.set(value.id, { id: value.id, position: { x: value.position.x, y: value.position.y },
          parentId: value.parentId, size: { width: value.size.width, height: value.size.height } });
      }
      return output;
    };
    const before = readSlices(operation.space.before), after = readSlices(operation.space.after);
    const frameId = operation.space.frameId;
    if (!before || !after || !before.has(frameId) || !after.has(frameId) || before.size !== after.size
      || [...before.keys()].some(id => !after.has(id))) return undefined;
    if (before.get(frameId).parentId !== after.get(frameId).parentId) return undefined;
    const ancestorFrameIds = [];
    const ancestorSet = new Set([frameId]);
    let parentId = before.get(frameId).parentId;
    while (parentId !== null) {
      if (!nonEmptyString(parentId) || ancestorSet.has(parentId)) return undefined;
      const parentBefore = before.get(parentId), parentAfter = after.get(parentId);
      if (!parentBefore || !parentAfter || parentBefore.parentId !== parentAfter.parentId) return undefined;
      ancestorSet.add(parentId);
      ancestorFrameIds.push(parentId);
      parentId = parentBefore.parentId;
    }
    for (const [id, afterSlice] of after) {
      if (id === frameId || ancestorSet.has(id)) continue;
      const beforeParentId = before.get(id).parentId;
      if (afterSlice.parentId === frameId) {
        if (beforeParentId !== null && beforeParentId !== frameId) return undefined;
      } else if (ancestorSet.has(afterSlice.parentId)) {
        if (beforeParentId !== afterSlice.parentId) return undefined;
      } else return undefined;
    }
    const changedNodeIds = [...after.keys()].filter(id => !sameSpaceSlice(before.get(id), after.get(id)));
    if (!changedNodeIds.length) return undefined;
    return { operation: clone(operation), space: { ...operation.space, before: [...before.values()], after: [...after.values()] },
      before, after, changedNodeIds, frameId, ancestorFrameIds };
  }

  function collectionArrangeFrameMatches(node, plan) {
    return node?.type === 'group' && node.id === plan.frameId && node.data?.id === plan.frameId
      && node.data?.createdBy === 'client' && node.data?.layoutType === 'none'
      && node.data?.lcosCollectionId === plan.space.collectionId
      && node.data?.lcosCollectionNodeId === plan.space.collectionNodeId;
  }

  function collectionArrangeFrameOwnerMatches(frame, frameId, collectionId, collectionNodeId, nodes, plan) {
    const actual = uniqueNodeMap(nodes);
    if (!actual || !frame || frame.id !== frameId || frame.type !== 'group'
      || frame.data?.id !== frameId || frame.data?.createdBy !== 'client' || frame.data?.layoutType !== 'none'
      || frame.data?.lcosCollectionId !== collectionId || frame.data?.lcosCollectionNodeId !== collectionNodeId
      || frame.dragging || frame.data?.locked === true) return undefined;
    const owner = actual.get(collectionNodeId);
    const ref = owner?.data?.lcos_collection_ref;
    if (owner?.type !== 'lcos-collection' || owner.id !== owner.data?.id || owner.dragging || owner.data?.locked === true
      || (owner.parentId ?? null) !== (frame.parentId ?? null)
      || !ref || ref.projectId !== plan.space.projectId || ref.canvasId !== plan.space.canvasId
      || ref.workspaceId !== plan.space.workspaceId || ref.collectionId !== collectionId) return undefined;
    const matchingFrames = nodes.filter(node => node?.type === 'group' && node.data?.lcosCollectionId === collectionId);
    const matchingOwners = nodes.filter(node => node?.type === 'lcos-collection'
      && node.data?.lcos_collection_ref?.projectId === plan.space.projectId
      && node.data?.lcos_collection_ref?.canvasId === plan.space.canvasId
      && node.data?.lcos_collection_ref?.workspaceId === plan.space.workspaceId
      && node.data?.lcos_collection_ref?.collectionId === collectionId);
    if (matchingFrames.length !== 1 || matchingFrames[0]?.id !== frameId
      || matchingOwners.length !== 1 || matchingOwners[0]?.id !== collectionNodeId) return undefined;
    return owner;
  }

  function collectionArrangeFrameOwners(plan, nodes) {
    const actual = uniqueNodeMap(nodes);
    if (!actual) return undefined;
    const owners = [];
    const collectionIds = new Set();
    const carrierIds = new Set();
    for (const frameId of [plan.frameId, ...plan.ancestorFrameIds]) {
      const frame = actual.get(frameId);
      const collectionId = frameId === plan.frameId ? plan.space.collectionId : frame?.data?.lcosCollectionId;
      const collectionNodeId = frameId === plan.frameId ? plan.space.collectionNodeId : frame?.data?.lcosCollectionNodeId;
      if (!nonEmptyString(collectionId) || !nonEmptyString(collectionNodeId)
        || collectionIds.has(collectionId) || carrierIds.has(collectionNodeId)) return undefined;
      const owner = collectionArrangeFrameOwnerMatches(frame, frameId, collectionId, collectionNodeId, nodes, plan);
      if (!owner) return undefined;
      collectionIds.add(collectionId);
      carrierIds.add(collectionNodeId);
      owners.push(owner);
    }
    return owners;
  }

  function collectionArrangeMatchesNodeMap(plan, nodes, which) {
    const actual = uniqueNodeMap(nodes);
    if (!actual) return false;
    const expected = which === 'before' ? plan.before : plan.after;
    for (const [id, slice] of expected) {
      const node = actual.get(id);
      if (!node || !sameSpaceSlice(nodeSpaceSlice(node), slice)) return false;
    }
    return collectionArrangeFrameMatches(actual.get(plan.frameId), plan);
  }

  function collectionArrangeSnapshotsMatch(plan, beforeNodes, afterNodes, baseline) {
    const before = uniqueNodeMap(beforeNodes), after = uniqueNodeMap(afterNodes);
    if (!before || !after || before.size !== after.size || [...before.keys()].some(id => !after.has(id))
      || !collectionArrangeMatchesNodeMap(plan, beforeNodes, 'before')
      || !collectionArrangeMatchesNodeMap(plan, afterNodes, 'after')
      || !collectionArrangeFrameOwners(plan, beforeNodes) || !collectionArrangeFrameOwners(plan, afterNodes)) return false;
    for (const [id, previous] of before) {
      const next = after.get(id);
      if (previous.type !== next.type || !sameNativeValue(previous.data, next.data)) return false;
      if (!plan.before.has(id) && !sameUnplannedNodeSpace(previous, next)) return false;
    }
    for (const id of plan.before.keys()) {
      if (!sameNativeValue(before.get(id)?.data, after.get(id)?.data)) return false;
      const saved = baseline?.get?.(id);
      if (baseline && (!saved || saved.type !== before.get(id)?.type
        || !sameNativeValue(saved.data, before.get(id)?.data))) return false;
    }
    if (baseline) {
      for (const owner of collectionArrangeFrameOwners(plan, beforeNodes)) {
        const saved = baseline.get(owner.id);
        if (!saved || saved.type !== owner.type || !sameNativeValue(saved.data, owner.data)) return false;
      }
    }
    return true;
  }

  function collectionArrangeStateMatches(plan, beforeNodes, afterNodes, baseline) {
    if (!collectionArrangeSnapshotsMatch(plan, beforeNodes, afterNodes, baseline)) return false;
    const before = uniqueNodeMap(beforeNodes), after = uniqueNodeMap(afterNodes);
    const beforeFrame = before.get(plan.frameId), afterFrame = after.get(plan.frameId);
    if (!collectionArrangeFrameMatches(beforeFrame, plan) || !collectionArrangeFrameMatches(afterFrame, plan)) return false;
    const parentFrameIds = [plan.frameId, ...plan.ancestorFrameIds];
    const expectedScopeIds = new Set(parentFrameIds);
    for (const parentId of parentFrameIds) {
      const expectedBeforeChildren = [...plan.before.values()].filter(slice => slice.parentId === parentId)
        .map(slice => slice.id).sort();
      const actualBeforeChildren = [...before.values()].filter(node => node.parentId === parentId)
        .map(node => node.id).sort();
      const expectedAfterChildren = [...plan.after.values()].filter(slice => slice.parentId === parentId)
        .map(slice => slice.id).sort();
      const actualAfterChildren = [...after.values()].filter(node => node.parentId === parentId)
        .map(node => node.id).sort();
      if (!sameNativeValue(expectedBeforeChildren, actualBeforeChildren)
        || !sameNativeValue(expectedAfterChildren, actualAfterChildren)) return false;
      for (const id of [...expectedBeforeChildren, ...expectedAfterChildren]) expectedScopeIds.add(id);
    }
    if (expectedScopeIds.size !== plan.before.size || [...expectedScopeIds].some(id => !plan.before.has(id))) return false;
    if (!collectionArrangeFrameOwners(plan, beforeNodes) || !collectionArrangeFrameOwners(plan, afterNodes)) return false;
    const frameCopies = nodes => nodes.filter(node => node?.type === 'group'
      && node.data?.lcosCollectionId === plan.space.collectionId);
    if (frameCopies(beforeNodes).length !== 1 || frameCopies(afterNodes).length !== 1) return false;
    for (const id of plan.changedNodeIds) {
      const oldNode = before.get(id), nextNode = after.get(id);
      if (oldNode?.dragging || nextNode?.dragging || oldNode?.data?.locked === true || nextNode?.data?.locked === true) return false;
    }
    return true;
  }

  function collectionMergeNode(node) {
    if (!node || !nonEmptyString(node.id) || !nonEmptyString(node.type) || !isRecord(node.data)
      || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) return undefined;
    const width = node.width ?? node.measured?.width, height = node.height ?? node.measured?.height;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return undefined;
    // Match the original r6/DC two-decimal persisted position, without rewriting
    // O8's live/history geometry. All other identity/content/size checks stay exact.
    return { id: node.id, type: node.type, data: clone(node.data),
      position: {x:Math.round(node.position.x*100)/100,y:Math.round(node.position.y*100)/100},
      parentId: ('parentId' in node ? node.parentId : node.parent_id) || null, size: { width, height } };
  }
  function collectionMergeOperation(operation, canvasId) {
    const merge = operation?.merge;
    if (!operation || operation.version !== 1 || operation.kind !== 'collection-merge' || !nonEmptyString(operation.operationId)
      || !['apply','undo','redo'].includes(operation.phase) || !isRecord(merge) || merge.canvasId !== canvasId
      || ![merge.projectId,merge.workspaceId,merge.sourceCollectionId,merge.targetCollectionId,merge.sourceNodeId,merge.targetNodeId].every(nonEmptyString)
      || merge.sourceCollectionId === merge.targetCollectionId || merge.sourceNodeId === merge.targetNodeId) return undefined;
    const read = values => {
      if (!Array.isArray(values)) return undefined;
      const map = new Map();
      for (const node of values) { const shape = collectionMergeNode(node); if (!shape || map.has(shape.id)) return undefined; map.set(shape.id,shape); }
      return map;
    };
    const before = read(merge.nativeBefore), after = read(merge.nativeAfter);
    const source = before?.get(merge.sourceNodeId), target = before?.get(merge.targetNodeId), nextTarget = after?.get(merge.targetNodeId);
    if (!before || !after || !source || !target || !nextTarget || after.has(merge.sourceNodeId) || [...after.keys()].some(id=>!before.has(id))) return undefined;
    const owned = (node, collectionId) => node?.type === 'pile' && node.data.id === node.id && node.data.lcos_native_collection === true
      && node.data.lcos_collection_ref?.projectId === merge.projectId && node.data.lcos_collection_ref?.canvasId === canvasId
      && node.data.lcos_collection_ref?.workspaceId === merge.workspaceId && node.data.lcos_collection_ref?.collectionId === collectionId;
    if (!owned(source,merge.sourceCollectionId) || !owned(target,merge.targetCollectionId) || !owned(nextTarget,merge.targetCollectionId)) return undefined;
    const members = [...new Set([...(target.data.memberIds ?? []),...(source.data.memberIds ?? [])])];
    if (!sameNativeValue(nextTarget.data,{...target.data,memberIds:members})) return undefined;
    for (const [id,node] of before) if (!after.has(id) && id !== source.id
      && !(node.type === 'group' && node.data.lcosCollectionId === merge.sourceCollectionId && node.data.lcosCollectionNodeId === source.id)) return undefined;
    for (const [id,node] of after) if (id !== target.id && !sameNativeValue(node.data,before.get(id)?.data)) return undefined;
    const changedNodeIds = [...before.keys()].filter(id=>!after.has(id)||!sameNativeValue(before.get(id),after.get(id)));
    if (!changedNodeIds.includes(source.id)) return undefined;
    return {operation:clone(operation),merge,before,after,changedNodeIds};
  }
  function collectionMergeStateMatches(plan, nodes, phase, outsideNodes) {
    const actual = uniqueNodeMap(nodes), expected = phase === 'undo' ? plan.before : plan.after;
    if (!actual) return false;
    for (const id of plan.before.keys()) {
      const node = actual.get(id), wanted = expected.get(id);
      if (wanted ? !sameNativeValue(collectionMergeNode(node),wanted) : !!node) return false;
    }
    if (outsideNodes) {
      const outside = uniqueNodeMap(outsideNodes);
      if (!outside) return false;
      for (const [id,node] of outside) if (!plan.before.has(id) && !sameNativeValue(node,actual.get(id))) return false;
      for (const id of actual.keys()) if (!plan.before.has(id) && !outside.has(id)) return false;
    }
    return true;
  }
  function collectionMergeChangeMatches(plan,phase,change,getNode) {
    const id=changeNodeId(change),from=phase==='undo'?plan.after:plan.before,to=phase==='undo'?plan.before:plan.after;
    const expected=!from.has(id)?'add':!to.has(id)?'remove':'replace';
    if(!plan.changedNodeIds.includes(id)||change?.type!==expected)return false;
    if(expected==='remove')return !getNode||sameNativeValue(collectionMergeNode(getNode(id)),from.get(id));
    return sameNativeValue(collectionMergeNode(change.item),to.get(id));
  }
  function collectionMergeOperationItemMatches(item,phase,plan) {
    const from=phase==='undo'?plan.after:plan.before,to=phase==='undo'?plan.before:plan.after,id=item?.id;
    const expected=!from.has(id)?'create':!to.has(id)?'delete':'update';
    if(!plan.changedNodeIds.includes(id)||item.operationType!==expected||item.lcos_ref!==undefined||item.lcos_snapshot!==undefined)return false;
    if(expected==='delete')return true;
    const desired=to.get(id),data=clone(item.data);
    if(data?.historySourceNodeId===id)delete data.historySourceNodeId;
    return sameNativeValue(collectionMergeNode({id,type:item.type,data,position:item.position,parentId:item.parentId,
      width:item.dimensions?.width,height:item.dimensions?.height}),desired);
  }
  function queueCollectionMergeIntent({canvasId,operation,beforeNodes,afterNodes}={}) {
    const plan=collectionMergeOperation(operation,canvasId);
    if(operation?.phase!=='apply'||!plan||!collectionMergeStateMatches(plan,beforeNodes,'undo')
      ||!collectionMergeStateMatches(plan,afterNodes,'apply',beforeNodes))return{ok:false,reason:'COLLECTION_MERGE_PLAN_MISMATCH'};
    if(plan.changedNodeIds.some(id=>pendingNodeIntents.has(nodeKey(canvasId,id))||(pendingHistoryActions.get(nodeKey(canvasId,id))||[]).length))return{ok:false,reason:'COLLECTION_MERGE_INTENT_CONFLICT'};
    for(const id of plan.changedNodeIds)pendingNodeIntents.set(nodeKey(canvasId,id),{...clone(operation),canvasId,collectionMergePlan:true});
    queueHistoryAction(canvasId,plan.merge.sourceNodeId,'remove',operation,undefined,undefined,plan.changedNodeIds);
    return{ok:true,operationId:operation.operationId,anchorNodeId:plan.merge.sourceNodeId,changedNodeIds:plan.changedNodeIds};
  }
  function cancelCollectionMergeIntent(operationId) {
    let removed=0;
    for(const[key,pending]of pendingNodeIntents)if(pending.kind==='collection-merge'&&pending.operationId===operationId){pendingNodeIntents.delete(key);removed++;}
    for(const[key,actions]of pendingHistoryActions){const next=actions.filter(a=>!(a.lcos_operation?.kind==='collection-merge'&&a.lcos_operation.operationId===operationId));if(next.length!==actions.length){if(next.length)pendingHistoryActions.set(key,next);else pendingHistoryActions.delete(key);}}
    return{ok:true,removed};
  }
  function tagCollectionMergeChanges(context,changes,getNode,canvasId) {
    const handled=new Set(),replay=context?.phase==='undo'||context?.phase==='redo';
    const actions=replay?(context.entry?.lcos_history_operations||[]).filter(a=>a.lcos_operation?.kind==='collection-merge'):[];
    const pending=[...pendingNodeIntents.values()].filter(p=>p.kind==='collection-merge'&&p.canvasId===canvasId);
    const operations=new Map((replay?actions.map(a=>a.lcos_operation):pending).map(op=>[op.operationId,
      {version:op.version,operationId:op.operationId,kind:op.kind,phase:op.phase,merge:op.merge}]));
    for(const operation of operations.values()){
      const phase=replay?context.phase:'apply',plan=collectionMergeOperation(operation,replay?context.canvasId:canvasId);
      if(!plan)continue;
      const scoped=(changes||[]).filter(change=>plan.changedNodeIds.includes(changeNodeId(change)));
      const exact=scoped.length===plan.changedNodeIds.length&&plan.changedNodeIds.every(id=>scoped.filter(c=>changeNodeId(c)===id).length===1)
        &&scoped.every(c=>collectionMergeChangeMatches(plan,phase,c,getNode))
        &&(!replay||actions.length===1&&!actions[0].lcos_intent_unsupported&&sameNativeValue(actions[0].aliases,plan.changedNodeIds)&&!plan.changedNodeIds.some(id=>context.remap?.has?.(id)));
      for(const change of scoped){attachIntent(change,exact?{lcos_operation:{...clone(operation),phase}}:{unsupported:true,reason:'COLLECTION_MERGE_CHANGESET_MISMATCH'});handled.add(change);}
      if(!replay)for(const id of plan.changedNodeIds)pendingNodeIntents.delete(nodeKey(canvasId,id));
    }
    return handled;
  }
  function tagCollectionMergeHistoryBatchOperations(canvasId,phase,entry,remap,changes,operations) {
    const handled=new Set();if(!['undo','redo'].includes(phase))return handled;
    const actions=(entry?.lcos_history_operations||[]).filter(a=>a.lcos_operation?.kind==='collection-merge');
    if(!actions.length)return handled;
    const plan=actions.length===1&&collectionMergeOperation(actions[0].lcos_operation,canvasId);
    const ids=plan?.changedNodeIds||actions.flatMap(a=>a.aliases||[]),scoped=(operations||[]).filter(item=>ids.includes(item?.id));
    const exact=!!plan&&!actions[0].lcos_intent_unsupported&&sameNativeValue(actions[0].aliases,ids)&&!ids.some(id=>remap?.has?.(id))
      &&scoped.length===ids.length&&ids.every(id=>scoped.filter(item=>item.id===id).length===1)
      &&scoped.every(item=>collectionMergeOperationItemMatches(item,phase,plan))
      &&(changes||[]).filter(c=>ids.includes(changeNodeId(c))).length===ids.length
      &&(changes||[]).filter(c=>ids.includes(changeNodeId(c))).every(c=>collectionMergeChangeMatches(plan,phase,c));
    for(const item of scoped){if(exact){if(item.data?.historySourceNodeId===item.id){item.data={...item.data};delete item.data.historySourceNodeId;}item.lcos_operation={...clone(actions[0].lcos_operation),phase};}
      else item.lcos_intent_unsupported='COLLECTION_MERGE_HISTORY_BATCH_MISMATCH';handled.add(item);}
    return handled;
  }

  function queueCollectionSpaceIntent({ canvasId, operation, beforeNodes, afterNodes } = {}) {
    if (operation?.phase !== 'apply') return { ok: false, reason: 'COLLECTION_SPACE_APPLY_PHASE_REQUIRED' };
    const plan = collectionSpaceOperation(operation, canvasId);
    if (!plan || !collectionSpaceMatchesNodeMap(plan, beforeNodes, 'before')
      || !collectionSpaceMatchesNodeMap(plan, afterNodes, 'after')) {
      return { ok: false, reason: 'COLLECTION_SPACE_PLAN_MISMATCH' };
    }
    const beforeMap = uniqueNodeMap(beforeNodes), afterMap = uniqueNodeMap(afterNodes);
    const expectedIds = new Set([...plan.before.keys(), ...plan.after.keys()]);
    const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const id of allIds) {
      const before = beforeMap.get(id), after = afterMap.get(id);
      if (id === plan.space.frameId) {
        if (before || !after) return { ok: false, reason: 'COLLECTION_SPACE_FRAME_TRANSITION_INVALID' };
        continue;
      }
      if (!before || !after) return { ok: false, reason: 'COLLECTION_SPACE_UNPLANNED_NODE_CHANGE' };
      if (!expectedIds.has(id) && !sameUnplannedNodeSpace(before, after)) {
        return { ok: false, reason: 'COLLECTION_SPACE_UNPLANNED_NODE_CHANGE' };
      }
    }
    const ids = [...expectedIds];
    if (ids.some(id => pendingNodeIntents.has(nodeKey(canvasId, id))
      || (pendingHistoryActions.get(nodeKey(canvasId, id)) || []).length > 0)) {
      return { ok: false, reason: 'COLLECTION_SPACE_INTENT_CONFLICT' };
    }
    const stable = { ...clone(plan.operation), phase: 'apply', space: clone(plan.space) };
    for (const id of ids) {
      pendingNodeIntents.set(nodeKey(canvasId, id), {
        ...clone(stable), collectionSpacePlan: { operation: clone(stable), role: id === plan.space.frameId ? 'frame' : 'child' },
      });
    }
    return { ok: true, operationId: stable.operationId, nodeIds: ids };
  }

  function cancelCollectionSpaceIntent(operationId) {
    if (!nonEmptyString(operationId)) return { ok: false, reason: 'COLLECTION_SPACE_OPERATION_ID_REQUIRED' };
    let removed = 0;
    for (const [key, pending] of pendingNodeIntents) {
      if (pending?.kind === 'collection-space' && pending.operationId === operationId
        && pending.collectionSpacePlan?.operation?.operationId === operationId) {
        pendingNodeIntents.delete(key);
        removed += 1;
      }
    }
    return { ok: true, removed };
  }

  function queueCollectionArrangeIntent({ canvasId, operation, beforeNodes, afterNodes } = {}) {
    if (operation?.phase !== 'apply') return { ok: false, reason: 'COLLECTION_ARRANGE_APPLY_PHASE_REQUIRED' };
    const plan = collectionArrangeOperation(operation, canvasId);
    if (!plan || !collectionArrangeStateMatches(plan, beforeNodes, afterNodes)) {
      return { ok: false, reason: 'COLLECTION_ARRANGE_PLAN_MISMATCH' };
    }
    const before = uniqueNodeMap(beforeNodes), after = uniqueNodeMap(afterNodes);
    const anchorNodeId = plan.changedNodeIds[0];
    const ids = plan.changedNodeIds;
    if (pendingNodeIntents.size && [...pendingNodeIntents.values()].some(pending => pending?.kind === 'collection-arrange'
      && pending.canvasId === canvasId)) return { ok: false, reason: 'COLLECTION_ARRANGE_CANVAS_INTENT_CONFLICT' };
    if (ids.some(id => pendingNodeIntents.has(nodeKey(canvasId, id))
      || (pendingHistoryActions.get(nodeKey(canvasId, id)) || []).length > 0)) {
      return { ok: false, reason: 'COLLECTION_ARRANGE_INTENT_CONFLICT' };
    }
    const stable = { ...clone(plan.operation), phase: 'apply', space: clone(plan.space) };
    const frameOwners = collectionArrangeFrameOwners(plan, beforeNodes);
    if (!frameOwners) return { ok: false, reason: 'COLLECTION_ARRANGE_PLAN_MISMATCH' };
    const baselineIds = new Set([...plan.before.keys(), ...frameOwners.map(owner => owner.id)]);
    const baseline = new Map([...baselineIds].map(id => {
      const node = before.get(id);
      return [id, { type: node.type, data: clone(node.data) }];
    }));
    for (const id of ids) {
      pendingNodeIntents.set(nodeKey(canvasId, id), {
        ...clone(stable), canvasId,
        collectionArrangePlan: { operation: clone(stable), changedNodeIds: [...ids], anchorNodeId,
          before: clone(plan.space.before), after: clone(plan.space.after), baseline },
      });
    }
    queueHistoryAction(canvasId, anchorNodeId, 'replace', stable, undefined, undefined, ids);
    const queued = pendingHistoryActions.get(nodeKey(canvasId, anchorNodeId)) || [];
    const action = queued.at(-1);
    if (!action || action.lcos_operation?.kind !== 'collection-arrange') {
      cancelCollectionArrangeIntent(stable.operationId);
      return { ok: false, reason: 'COLLECTION_ARRANGE_HISTORY_ACTION_QUEUE_FAILED' };
    }
    action.canvasId = canvasId;
    action.collectionArrangePlan = { operation: clone(stable), changedNodeIds: [...ids], anchorNodeId,
      before: clone(plan.space.before), after: clone(plan.space.after), baseline };
    return { ok: true, operationId: stable.operationId, anchorNodeId, changedNodeIds: [...ids] };
  }

  function cancelCollectionArrangeIntent(operationId) {
    if (!nonEmptyString(operationId)) return { ok: false, reason: 'COLLECTION_ARRANGE_OPERATION_ID_REQUIRED' };
    let removed = 0;
    for (const [key, pending] of pendingNodeIntents) {
      if (pending?.kind === 'collection-arrange' && pending.operationId === operationId
        && pending.collectionArrangePlan?.operation?.operationId === operationId) {
        pendingNodeIntents.delete(key);
        removed += 1;
      }
    }
    for (const [key, actions] of pendingHistoryActions) {
      const remaining = actions.filter(action => !(action?.lcos_operation?.kind === 'collection-arrange'
        && action.lcos_operation.operationId === operationId));
      if (remaining.length !== actions.length) {
        if (remaining.length) pendingHistoryActions.set(key, remaining);
        else pendingHistoryActions.delete(key);
        removed += actions.length - remaining.length;
      }
    }
    return { ok: true, removed };
  }

  function consumeCollectionArrangeHistoryActions(canvasId, previous, next) {
    const actions = [];
    const previousMap = uniqueNodeMap(previous?.nodes), nextMap = uniqueNodeMap(next?.nodes);
    if (!previousMap || !nextMap) return actions;
    for (const [key, queued] of pendingHistoryActions) {
      const selectedActions = queued.filter(action => action?.canvasId === canvasId
        && action.changeType === 'replace' && action.lcos_operation?.kind === 'collection-arrange');
      for (const selected of selectedActions) {
        const plan = collectionArrangeOperation(selected.lcos_operation, canvasId);
        const touchesScope = !!plan && plan.changedNodeIds.some(id => {
          const before = previousMap.get(id), after = nextMap.get(id);
          return !before || !after || !sameSpaceSlice(nodeSpaceSlice(before), nodeSpaceSlice(after));
        });
        if (!touchesScope) continue;
        const exactAliases = plan && selected.nodeId === plan.changedNodeIds[0]
          && Array.isArray(selected.aliases) && sameNativeValue(selected.aliases, plan.changedNodeIds);
        if (!plan || !exactAliases || !collectionArrangeStateMatches(plan, previous.nodes, next.nodes,
          selected.collectionArrangePlan?.baseline)) {
          selected.lcos_intent_unsupported = 'COLLECTION_ARRANGE_HISTORY_SNAPSHOT_MISMATCH';
        }
        const remaining = queued.filter(action => action !== selected);
        if (remaining.length) pendingHistoryActions.set(key, remaining);
        else pendingHistoryActions.delete(key);
        delete selected.canvasId;
        delete selected.collectionArrangePlan;
        actions.push(selected);
        if (plan) cancelCollectionArrangeIntent(plan.operation.operationId);
      }
    }
    return actions;
  }

  function recordHistoryTransition(canvasId, previous, next) {
    if (!previous || !next || !Array.isArray(previous.nodes) || !Array.isArray(next.nodes)) return {};
    const previousIds = new Set(previous.nodes.map(node => node?.id).filter(id => id !== undefined && id !== null));
    const nextIds = new Set(next.nodes.map(node => node?.id).filter(id => id !== undefined && id !== null));
    const actions = [];
    const collect = (nodeId, changeType) => {
      const key = nodeKey(canvasId, nodeId);
      const queued = pendingHistoryActions.get(key) || [];
      const candidates = queued.filter(action => action.changeType === changeType);
      if (candidates.length === 1) {
        const selected = candidates[0];
        if (selected.lcos_operation?.kind === 'collection-merge') {
          const plan=collectionMergeOperation(selected.lcos_operation,canvasId);
          if(!plan||!collectionMergeStateMatches(plan,previous.nodes,'undo')||!collectionMergeStateMatches(plan,next.nodes,'apply',previous.nodes)) {
            selected.lcos_intent_unsupported='COLLECTION_MERGE_HISTORY_SNAPSHOT_MISMATCH';
          }
        }
        if (selected.lcos_operation?.kind === 'collection-space') {
          const plan = collectionSpaceOperation(selected.lcos_operation, canvasId);
          if (!plan || selected.nodeId !== plan.space.frameId
            || !collectionSpaceMatchesNodeMap(plan, previous.nodes, 'before')
            || !collectionSpaceMatchesNodeMap(plan, next.nodes, 'after')) {
            selected.lcos_intent_unsupported = 'COLLECTION_SPACE_HISTORY_SNAPSHOT_MISMATCH';
          }
        }
        const remaining = queued.filter(action => action !== selected);
        if (remaining.length) pendingHistoryActions.set(key, remaining);
        else pendingHistoryActions.delete(key);
        actions.push(selected);
      } else if (candidates.length > 1) {
        pendingHistoryActions.delete(key);
        actions.push({ nodeId, aliases: [nodeId], carrierId: nodeId, changeType,
          lcos_intent_unsupported: 'MULTIPLE_APPLY_OPERATIONS_BEFORE_NATIVE_HISTORY_COMMIT' });
      }
    };
    for (const nodeId of nextIds) if (!previousIds.has(nodeId)) collect(nodeId, 'add');
    for (const nodeId of previousIds) if (!nextIds.has(nodeId)) collect(nodeId, 'remove');
    actions.push(...consumeCollectionArrangeHistoryActions(canvasId, previous, next));
    return actions.length ? { lcos_history_operations: actions } : {};
  }

  function historyActionFor(context, change, changeType, itemId) {
    const history = context?.entry?.lcos_history_operations;
    if (!Array.isArray(history)) return undefined;
    const expectedType = context.phase === 'undo'
      ? (changeType === 'add' ? 'remove' : 'add')
      : changeType;
    const matches = history.filter(action => {
      if (action?.lcos_operation?.kind === 'collection-arrange' && changeType === 'replace') {
        const plan = collectionArrangeOperation(action.lcos_operation, context.canvasId);
        return !action.lcos_intent_unsupported && action.changeType === 'replace' && !!plan
          && plan.changedNodeIds.includes(itemId) && action.aliases?.includes(itemId) === true;
      }
      if (action?.lcos_intent_unsupported || action?.changeType !== expectedType) return false;
      if (action.lcos_operation?.kind === 'collection-space' && changeType === 'replace') {
        const plan = collectionSpaceOperation(action.lcos_operation, context.canvasId);
        return !!plan && plan.children.includes(itemId)
          && action.aliases?.includes(itemId) === true;
      }
      const mapped = context.remap && typeof context.remap.get === 'function' ? context.remap.get(action.nodeId) : undefined;
      if (changeType === 'add') {
        const expectedId = mapped ?? action.carrierId ?? action.nodeId;
        return itemId === expectedId;
      }
      return itemId === action.carrierId;
    });
    return matches.length === 1 ? matches[0] : undefined;
  }

  function withHistoryEntry(canvasId, phase, entry, remap, original) {
    if (typeof original !== 'function') return original;
    const context = { canvasId, phase, entry, remap };
    activeIntents.push(context);
    try { return original(); }
    finally {
      const index = activeIntents.lastIndexOf(context);
      if (index >= 0) activeIntents.splice(index, 1);
    }
  }

  function isExactMaterialRef(ref) {
    if (!isRecord(ref) || ref.version !== 1 || !['artifact', 'view'].includes(ref.entityType)
      || !nonEmptyString(ref.entityId) || !nonEmptyString(ref.artifactId)
      || !nonEmptyString(ref.artifactViewId) || !nonEmptyString(ref.revisionId)) return false;
    return ref.entityType === 'artifact'
      ? ref.entityId === ref.artifactId
      : ref.entityId === ref.artifactViewId;
  }

  function sameExactMaterialRef(left, right) {
    return isExactMaterialRef(left) && isExactMaterialRef(right) && refAlreadyMatches(left, right);
  }

  function canStripNativeImageHistoryTitle(canvasId, phase, entry, changes, operations, operationItem, itemData) {
    if (!nonEmptyString(canvasId) || !['undo', 'redo'].includes(phase)
      || operationItem?.operationType !== 'update' || operationItem.type !== 'image'
      || !nonEmptyString(operationItem.id) || !isRecord(itemData)) return false;
    const nodeId = operationItem.id;
    if ((operations || []).filter(item => item?.id === nodeId).length !== 1) return false;

    const relatedChanges = (changes || []).filter(change => change?.id === nodeId || change?.item?.id === nodeId);
    if (relatedChanges.length !== 1) return false;
    const change = relatedChanges[0];
    if (change?.type !== 'replace' || change.id !== nodeId
      || change.item?.id !== nodeId || change.item?.type !== 'image') return false;

    const historyNodes = Array.isArray(entry?.state?.nodes)
      ? entry.state.nodes.filter(node => node?.id === nodeId)
      : [];
    if (historyNodes.length !== 1) return false;
    const historyNode = historyNodes[0];
    if (historyNode?.type !== 'image' || !isRecord(historyNode.data) || !isRecord(change.item.data)) return false;
    const title = historyNode.data.title;
    if (!Object.prototype.hasOwnProperty.call(historyNode.data, 'title')
      || !Object.prototype.hasOwnProperty.call(change.item.data, 'title')
      || !Object.prototype.hasOwnProperty.call(itemData, 'title')
      || !nonEmptyString(title) || change.item.data.title !== title || itemData.title !== title) return false;

    const rememberedRef = byCanvasNode.get(nodeKey(canvasId, nodeId))?.ref;
    return sameExactMaterialRef(rememberedRef, historyNode.data.lcos_ref)
      && sameExactMaterialRef(rememberedRef, change.item.data.lcos_ref)
      && sameExactMaterialRef(rememberedRef, itemData.lcos_ref);
  }

  function tagHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations) {
    if (!Array.isArray(operations)) return operations;
    const context = { canvasId, phase, entry, remap };
    const handledCollectionMerge = tagCollectionMergeHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations);
    const handledCollectionSpace = tagCollectionSpaceHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations);
    const handledCollectionArrange = tagCollectionArrangeHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations);
    const textHistoryIntentId = ['undo', 'redo'].includes(phase) ? identifier() : undefined;
    for (const operationItem of operations) {
      if (!operationItem || typeof operationItem !== 'object') continue;
      if (handledCollectionMerge.has(operationItem) || handledCollectionSpace.has(operationItem) || handledCollectionArrange.has(operationItem)) continue;
      const itemData = operationItem.data && typeof operationItem.data === 'object' && !Array.isArray(operationItem.data)
        ? operationItem.data : undefined;
      const hasHistorySource = !!itemData && Object.prototype.hasOwnProperty.call(itemData, 'historySourceNodeId');
      if (!['undo', 'redo'].includes(phase)) {
        if (hasHistorySource) operationItem.lcos_intent_unsupported = 'HISTORY_SOURCE_NODE_ID_OUTSIDE_HISTORY_REPLAY';
        continue;
      }
      if (operationItem.operationType === 'update' && !hasHistorySource) {
        global.__LCOS_NATIVE_TEXT_SAVE_PORT__?.captureHistoryTextOperations?.({ canvasId, phase,
          intentId: textHistoryIntentId, changes, operations: [operationItem] });
        if (canStripNativeImageHistoryTitle(canvasId, phase, entry, changes, operations, operationItem, itemData)) {
          operationItem.data = { ...itemData };
          delete operationItem.data.title;
        }
        continue;
      }
      if (!['create', 'delete'].includes(operationItem.operationType)) {
        if (hasHistorySource) operationItem.lcos_intent_unsupported = 'HISTORY_SOURCE_NODE_ID_ON_NON_LIFECYCLE_ACTION';
        continue;
      }
      if (hasHistorySource && (phase !== 'redo' || operationItem.operationType !== 'create')) {
        operationItem.lcos_intent_unsupported = 'HISTORY_SOURCE_NODE_ID_UNEXPECTED_PHASE_OR_ACTION';
        continue;
      }
      const expectedChangeType = operationItem.operationType === 'create' ? 'add' : 'remove';
      const changeCandidates = (changes || []).filter(change => {
        const changeId = change?.type === 'add' ? change.item?.id : change?.id;
        return change?.type === expectedChangeType && changeId === operationItem.id;
      });
      if (changeCandidates.length !== 1) {
        operationItem.lcos_intent_unsupported = 'NATIVE_HISTORY_BATCH_CHANGE_MATCH_MISSING_OR_AMBIGUOUS';
        continue;
      }
      const change = changeCandidates[0];
      const action = historyActionFor(context, change, expectedChangeType, operationItem.id);
      if (!action?.lcos_operation || action.lcos_intent_unsupported) {
        operationItem.lcos_intent_unsupported = action?.lcos_intent_unsupported || 'HISTORY_OPERATION_ENTRY_ASSOCIATION_MISSING';
        continue;
      }
      if (hasHistorySource) {
        const sourceId = itemData.historySourceNodeId;
        const aliases = Array.isArray(action.aliases) ? action.aliases : [action.nodeId];
        const mappedId = remap && typeof remap.get === 'function' ? remap.get(action.nodeId) : undefined;
        if (action.lcos_operation.kind !== 'duplicate-view' || sourceId !== action.nodeId
          || typeof sourceId !== 'string' || !sourceId || !aliases.includes(sourceId)
          || mappedId !== operationItem.id || mappedId === sourceId) {
          operationItem.lcos_intent_unsupported = 'HISTORY_SOURCE_NODE_ID_ALIAS_MISMATCH';
          continue;
        }
        // M8 shares item.data with the native history snapshot. Detach before stripping this renderer-only hint.
        operationItem.data = { ...itemData };
        delete operationItem.data.historySourceNodeId;
      }
      operationItem.lcos_operation = { ...clone(action.lcos_operation), phase };
      if (action.lcos_ref !== undefined) operationItem.lcos_ref = clone(action.lcos_ref);
      if (operationItem.operationType === 'delete' && action.lcos_snapshot) operationItem.lcos_snapshot = clone(action.lcos_snapshot);
      if (expectedChangeType === 'add') {
        action.carrierId = operationItem.id;
        if (!action.aliases.includes(operationItem.id)) action.aliases.push(operationItem.id);
      } else action.carrierId = undefined;
    }
    return operations;
  }

  function patchHistoryNode(node, id, ref, data) {
    const nativeId = node?.id ?? id;
    const next = { ...(node?.data && typeof node.data === 'object' ? node.data : {}), ...clone(data), id: nativeId, lcos_ref: clone(ref) };
    // The opaque upload URL belongs to the in-flight original upload. Once
    // this exact create receives its Core identity, history retains the
    // canonical file/text presentation instead of a new-import transport.
    if (node?.data?.lcos_upload_url && ref && data && typeof data === 'object') {
      delete next.lcos_upload_url;
      if (!data.lcos_file_ref) delete next.lcos_file_ref;
      if (node.data.type === 'pure' && data.type === undefined) delete next.type;
      const params = node.data.params;
      if (data.params === undefined && params && typeof params === 'object' && !Array.isArray(params)
        && (Object.keys(params).length === 0 || Object.keys(params).sort().join(',') === 'model,provider'
          && params.model === 'gemini-3.1-flash-lite' && params.provider === 'google')) delete next.params;
    }
    if (node?.data?.lcos_workspace_membership && !data?.lcos_workspace_membership
      && node.data.lcos_workspace_membership.viewId !== ref?.artifactViewId) delete next.lcos_workspace_membership;
    return { ...node, data: next };
  }

  function changeNodeId(change) {
    return change?.type === 'add' || change?.type === 'replace' ? change.item?.id : change?.id;
  }

  function collectionSpaceExpectedChangeType(plan, phase, nodeId) {
    if (nodeId === plan.space.frameId) return phase === 'undo' ? 'remove' : 'add';
    return plan.children.includes(nodeId) ? 'replace' : undefined;
  }

  function collectionSpaceTargetSlice(plan, phase, nodeId) {
    if (nodeId === plan.space.frameId) return plan.after.get(nodeId);
    return (phase === 'undo' ? plan.before : plan.after).get(nodeId);
  }

  function collectionSpaceChangeMatches(plan, phase, change, getNode) {
    const id = changeNodeId(change);
    const expectedType = collectionSpaceExpectedChangeType(plan, phase, id);
    if (!expectedType || change?.type !== expectedType) return false;
    const expected = collectionSpaceTargetSlice(plan, phase, id);
    if (change.type === 'remove' && typeof getNode !== 'function') {
      return phase === 'undo' && id === plan.space.frameId && !!plan.after.get(id);
    }
    const node = change.type === 'remove'
      ? (typeof getNode === 'function' ? getNode(change.id) : undefined)
      : change.item;
    return !!expected && !!node && sameSpaceSlice(nodeSpaceSlice(node), expected);
  }

  function collectionSpaceChangesFor(plan, changes) {
    const ids = new Set([...plan.before.keys(), ...plan.after.keys()]);
    return (changes || []).filter(change => ids.has(changeNodeId(change)));
  }

  function consumeCollectionSpaceApplyChanges(changes, getNode, canvasId) {
    const handled = new Set();
    const pendingPlans = new Map();
    for (const change of changes || []) {
      const id = changeNodeId(change);
      if (!nonEmptyString(id)) continue;
      const pending = pendingNodeIntents.get(nodeKey(canvasId, id))?.collectionSpacePlan;
      if (!pending?.operation?.operationId) continue;
      const key = nodeKey(canvasId, pending.operation.operationId);
      const record = pendingPlans.get(key) || { plan: collectionSpaceOperation(pending.operation, canvasId), operation: pending.operation, seen: [] };
      record.seen.push(change);
      pendingPlans.set(key, record);
    }
    for (const [key, record] of pendingPlans) {
      const plan = record.plan;
      if (!plan) continue;
      const scoped = collectionSpaceChangesFor(plan, changes);
      const expectedIds = [...plan.after.keys()];
      const pendingExact = expectedIds.every(id => {
        const pending = pendingNodeIntents.get(nodeKey(canvasId, id))?.collectionSpacePlan;
        return pending?.operation?.operationId === record.operation.operationId
          && pending.role === (id === plan.space.frameId ? 'frame' : 'child');
      });
      const exact = pendingExact && scoped.length === expectedIds.length
        && expectedIds.every(id => {
          const matches = scoped.filter(change => changeNodeId(change) === id);
          return matches.length === 1 && collectionSpaceChangeMatches(plan, 'redo', matches[0], getNode)
            && collectionSpaceExpectedChangeType(plan, 'redo', id) === (id === plan.space.frameId ? 'add' : 'replace');
        });
      if (!exact) {
        for (const change of scoped) {
          attachIntent(change, { unsupported: true, reason: 'COLLECTION_SPACE_APPLY_CHANGESET_MISMATCH' });
          handled.add(change);
        }
        for (const id of expectedIds) pendingNodeIntents.delete(nodeKey(canvasId, id));
        continue;
      }
      const aliases = expectedIds;
      for (const change of scoped) {
        const id = changeNodeId(change);
        const node = change.type === 'remove' ? getNode?.(change.id) : change.item;
        attachIntent(change, { lcos_operation: clone(plan.operation) });
        handled.add(change);
        pendingNodeIntents.delete(nodeKey(canvasId, id));
        if (id === plan.space.frameId) queueHistoryAction(canvasId, id, 'add', plan.operation, undefined, node, aliases);
      }
    }
    return handled;
  }

  function collectionSpaceHistoryActions(context) {
    return (context?.entry?.lcos_history_operations || []).filter(action => !action?.lcos_intent_unsupported
      && action?.lcos_operation?.kind === 'collection-space');
  }

  function tagCollectionSpaceHistoryChanges(context, changes, getNode) {
    const handled = new Set();
    if (context?.phase !== 'undo' && context?.phase !== 'redo') return handled;
    const actions = collectionSpaceHistoryActions(context);
    if (actions.length === 0) return handled;
    const action = actions.length === 1 ? actions[0] : undefined;
    const plan = action && collectionSpaceOperation(action.lcos_operation, context.canvasId);
    if (!plan || action.nodeId !== plan.space.frameId || action.changeType !== 'add'
      || !plan.after.keys().every(id => action.aliases?.includes(id))) {
      const ids = new Set(actions.flatMap(item => item.aliases || [item.nodeId]));
      for (const change of changes || []) if (ids.has(changeNodeId(change))) {
        attachIntent(change, { unsupported: true, reason: 'COLLECTION_SPACE_HISTORY_ENTRY_AMBIGUOUS' });
        handled.add(change);
      }
      return handled;
    }
    const scoped = collectionSpaceChangesFor(plan, changes);
    const expectedIds = [...plan.after.keys()];
    const remap = context.remap;
    const remapSafe = context.phase !== 'redo' || expectedIds.every(id => !remap?.has?.(id));
    const exact = remapSafe && scoped.length === expectedIds.length && expectedIds.every(id => {
      const matches = scoped.filter(change => changeNodeId(change) === id);
      return matches.length === 1 && collectionSpaceChangeMatches(plan, context.phase, matches[0], getNode);
    });
    if (!exact) {
      for (const change of scoped) {
        attachIntent(change, { unsupported: true, reason: 'COLLECTION_SPACE_HISTORY_CHANGESET_MISMATCH' });
        handled.add(change);
      }
      return handled;
    }
    for (const change of scoped) {
      const id = changeNodeId(change);
      attachIntent(change, { lcos_operation: { ...clone(action.lcos_operation), phase: context.phase } });
      handled.add(change);
    }
    return handled;
  }

  function collectionSpaceOperationItemMatches(item, phase, plan) {
    const id = item?.id;
    const expectedType = id === plan.space.frameId ? (phase === 'undo' ? 'delete' : 'create')
      : plan.children.includes(id) ? 'update' : undefined;
    if (!expectedType || item.operationType !== expectedType) return false;
    if (item.operationType === 'delete') return true;
    const slice = collectionSpaceTargetSlice(plan, phase, id);
    return !!slice && item.position?.x === slice.position.x && item.position?.y === slice.position.y
      && (item.parentId ?? '') === (slice.parentId ?? '')
      && item.dimensions?.width === slice.size.width && item.dimensions?.height === slice.size.height;
  }

  function collectionArrangeTargetSlice(plan, phase, nodeId) {
    return (phase === 'undo' ? plan.before : plan.after).get(nodeId);
  }

  function collectionArrangeChangeMatches(plan, phase, change) {
    const id = changeNodeId(change);
    if (change?.type !== 'replace' || !plan.changedNodeIds.includes(id)) return false;
    const target = collectionArrangeTargetSlice(plan, phase, id);
    return !!target && !!change.item && change.item.id === id
      && sameSpaceSlice(nodeSpaceSlice(change.item), target);
  }

  function collectionArrangeOperationItemMatches(item, phase, plan) {
    if (!plan.changedNodeIds.includes(item?.id) || item.operationType !== 'update') return false;
    const slice = collectionArrangeTargetSlice(plan, phase, item.id);
    return !!slice && item.position?.x === slice.position.x && item.position?.y === slice.position.y
      && (item.parentId ?? '') === (slice.parentId ?? '')
      && item.dimensions?.width === slice.size.width && item.dimensions?.height === slice.size.height
      && item.lcos_ref === undefined && item.lcos_snapshot === undefined;
  }

  function collectionArrangeHistoryActions(context) {
    return (context?.entry?.lcos_history_operations || []).filter(action => action?.lcos_operation?.kind === 'collection-arrange');
  }

  function collectionArrangeChangesFor(plan, changes) {
    const ids = new Set(plan.changedNodeIds);
    return (changes || []).filter(change => ids.has(changeNodeId(change)));
  }

  function tagCollectionArrangeHistoryChanges(context, changes) {
    const handled = new Set();
    if (context?.phase !== 'undo' && context?.phase !== 'redo') return handled;
    const actions = collectionArrangeHistoryActions(context);
    if (!actions.length) return handled;
    const action = actions.length === 1 ? actions[0] : undefined;
    const plan = action && collectionArrangeOperation(action.lcos_operation, context.canvasId);
    const ids = plan ? plan.changedNodeIds : actions.flatMap(item => item.aliases || [item.nodeId]);
    const scoped = collectionArrangeChangesFor(plan || { changedNodeIds: [] }, changes);
    const exactAliases = !!plan && !action.lcos_intent_unsupported && action.nodeId === plan.changedNodeIds[0] && action.changeType === 'replace'
      && sameNativeValue(action.aliases, plan.changedNodeIds);
    const noRemap = !plan || plan.changedNodeIds.every(id => !context.remap?.has?.(id));
    const exact = exactAliases && noRemap && scoped.length === ids.length && ids.every(id => {
      const matches = scoped.filter(change => changeNodeId(change) === id);
      return matches.length === 1 && collectionArrangeChangeMatches(plan, context.phase, matches[0]);
    });
    if (!exact) {
      const candidates = new Set([...ids, ...actions.flatMap(item => item.aliases || [item.nodeId])]);
      for (const change of changes || []) if (candidates.has(changeNodeId(change))) {
        attachIntent(change, { unsupported: true, reason: 'COLLECTION_ARRANGE_HISTORY_CHANGESET_MISMATCH' });
        handled.add(change);
      }
      return handled;
    }
    for (const change of scoped) {
      attachIntent(change, { lcos_operation: { ...clone(action.lcos_operation), phase: context.phase } });
      handled.add(change);
    }
    return handled;
  }

  function consumeCollectionArrangeApplyChanges(changes, canvasId) {
    const handled = new Set();
    for (const change of changes || []) {
      const id = changeNodeId(change);
      if (!nonEmptyString(id)) continue;
      const pending = pendingNodeIntents.get(nodeKey(canvasId, id));
      const queued = pending?.collectionArrangePlan;
      if (!queued?.operation?.operationId) continue;
      const plan = collectionArrangeOperation(queued.operation, canvasId);
      const baseline = queued.baseline?.get?.(id);
      if (!plan || !plan.changedNodeIds.includes(id) || !collectionArrangeChangeMatches(plan, 'apply', change)
        || !baseline || baseline.type !== change.item?.type || !sameNativeValue(baseline.data, change.item?.data)) {
        attachIntent(change, { unsupported: true, reason: 'COLLECTION_ARRANGE_APPLY_CHANGESET_MISMATCH' });
        handled.add(change);
        continue;
      }
      attachIntent(change, { lcos_operation: clone(queued.operation) });
      handled.add(change);
    }
    return handled;
  }

  function tagCollectionArrangeHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations) {
    const handled = new Set();
    if ((phase !== 'undo' && phase !== 'redo') || !Array.isArray(operations)) return handled;
    const actions = collectionArrangeHistoryActions({ canvasId, phase, entry });
    if (!actions.length) return handled;
    const action = actions.length === 1 ? actions[0] : undefined;
    const plan = action && collectionArrangeOperation(action.lcos_operation, canvasId);
    const ids = plan ? plan.changedNodeIds : actions.flatMap(item => item.aliases || [item.nodeId]);
    const scoped = operations.filter(item => ids.includes(item?.id));
    const scopedChanges = collectionArrangeChangesFor(plan || { changedNodeIds: [] }, changes);
    const exactAliases = !!plan && !action.lcos_intent_unsupported && action.nodeId === plan.changedNodeIds[0] && action.changeType === 'replace'
      && sameNativeValue(action.aliases, plan.changedNodeIds);
    const noRemap = !plan || plan.changedNodeIds.every(id => !remap?.has?.(id));
    const exact = exactAliases && noRemap && scoped.length === ids.length && ids.every(id => {
      const matches = scoped.filter(item => item.id === id);
      return matches.length === 1 && collectionArrangeOperationItemMatches(matches[0], phase, plan);
    }) && scopedChanges.length === ids.length && ids.every(id => {
      const matches = scopedChanges.filter(change => changeNodeId(change) === id);
      return matches.length === 1 && collectionArrangeChangeMatches(plan, phase, matches[0]);
    });
    if (!exact) {
      for (const item of scoped) {
        item.lcos_intent_unsupported = 'COLLECTION_ARRANGE_HISTORY_BATCH_MISMATCH';
        handled.add(item);
      }
      return handled;
    }
    const operation = { ...clone(action.lcos_operation), phase };
    for (const item of scoped) {
      item.lcos_operation = clone(operation);
      handled.add(item);
    }
    return handled;
  }

  function tagCollectionSpaceHistoryBatchOperations(canvasId, phase, entry, remap, changes, operations) {
    const handled = new Set();
    if (phase !== 'undo' && phase !== 'redo' || !Array.isArray(operations)) return handled;
    const actions = collectionSpaceHistoryActions({ canvasId, phase, entry });
    if (actions.length === 0) return handled;
    const action = actions.length === 1 ? actions[0] : undefined;
    const plan = action && collectionSpaceOperation(action.lcos_operation, canvasId);
    const ids = plan ? [...plan.after.keys()] : actions.flatMap(item => item.aliases || [item.nodeId]);
    const remapSafe = phase !== 'redo' || !!plan && ids.every(id => !remap?.has?.(id));
    const scoped = operations.filter(item => ids.includes(item?.id));
    const changeScoped = collectionSpaceChangesFor(plan || { before: new Map(), after: new Map() }, changes);
    const exact = !!plan && action.nodeId === plan.space.frameId && action.changeType === 'add'
      && ids.every(id => action.aliases?.includes(id)) && remapSafe
      && scoped.length === ids.length && ids.every(id => {
        const matches = scoped.filter(item => item.id === id);
        return matches.length === 1 && collectionSpaceOperationItemMatches(matches[0], phase, plan);
      })
      && changeScoped.length === ids.length && ids.every(id => {
        const matches = changeScoped.filter(change => changeNodeId(change) === id);
        return matches.length === 1 && collectionSpaceChangeMatches(plan, phase, matches[0]);
      });
    if (!exact) {
      for (const item of scoped) {
        item.lcos_intent_unsupported = 'COLLECTION_SPACE_HISTORY_BATCH_MISMATCH';
        handled.add(item);
      }
      return handled;
    }
    const operation = { ...clone(action.lcos_operation), phase };
    for (const item of scoped) {
      item.lcos_operation = clone(operation);
      handled.add(item);
    }
    return handled;
  }

  function normalizeCollectionSpaceRedoRemaps(remap, entry, phase, canvasId, currentNodes, targetNodes) {
    const mergeActions=(entry?.lcos_history_operations||[]).filter(a=>a.lcos_operation?.kind==='collection-merge');
    if(mergeActions.length===1&&['undo','redo'].includes(phase)&&remap?.delete){
      const plan=collectionMergeOperation(mergeActions[0].lcos_operation,canvasId);
      if(plan&&!mergeActions[0].lcos_intent_unsupported&&collectionMergeStateMatches(plan,currentNodes,phase==='undo'?'apply':'undo')
        &&collectionMergeStateMatches(plan,targetNodes,phase)){
        for(const id of plan.changedNodeIds)remap.delete(id);return true;
      }
    }
    if (phase !== 'redo' || !remap || typeof remap.delete !== 'function') return false;
    const actions = collectionSpaceHistoryActions({ canvasId, phase, entry });
    if (actions.length !== 1) return false;
    const action = actions[0];
    const plan = collectionSpaceOperation(action.lcos_operation, canvasId);
    if (!plan || action.nodeId !== plan.space.frameId || action.changeType !== 'add'
      || !plan.after.keys().every(id => action.aliases?.includes(id))) return false;
    const current = uniqueNodeMap(currentNodes), target = uniqueNodeMap(targetNodes);
    if (!current || !target || current.has(plan.space.frameId)
      || !collectionSpaceMatchesNodeMap(plan, targetNodes, 'after')) return false;
    const frame = target.get(plan.space.frameId);
    if (frame?.type !== 'group' || frame.data?.id !== plan.space.frameId
      || frame.data?.createdBy !== 'client'
      || frame.data?.layoutType !== 'none'
      || frame.data?.lcosCollectionId !== plan.space.collectionId
      || frame.data?.lcosCollectionNodeId !== plan.space.collectionNodeId) return false;
    for (const [id, before] of plan.before) {
      const live = current.get(id);
      if (!live || live.id !== id || !Number.isFinite(live.position?.x) || !Number.isFinite(live.position?.y)
        || live.position.x !== before.position.x || live.position.y !== before.position.y
        || (live.parentId ?? null) !== before.parentId) return false;
    }
    for (const id of plan.after.keys()) remap.delete(id);
    return true;
  }

  async function collectionSpaceVersion(canvasId, operation) {
    if (!['collection-space','collection-arrange','collection-merge'].includes(operation?.kind)) return {};
    const plan = operation.kind === 'collection-space'
      ? collectionSpaceOperation(operation, canvasId)
      : operation.kind === 'collection-merge' ? collectionMergeOperation(operation,canvasId) : collectionArrangeOperation(operation, canvasId);
    if(plan?.merge)plan.space=plan.merge;
    const host = global.__LCOS_NODE_LAB__;
    if (!plan || !host?.api || host.canvasId !== canvasId || host.projectId !== plan.space.projectId) {
      throw new Error('Collection-space request is no longer on its original Canvas/API/Project.');
    }
    if (typeof global.fetch !== 'function') throw new Error('Canvas version read is unavailable.');
    const response = await global.fetch('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), {
      cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
    });
    let envelope;
    try { envelope = await response.json(); } catch { throw new Error('Canvas version read returned invalid JSON.'); }
    if (!response.ok || envelope?.code !== 0 || envelope?.data?.id !== canvasId
      || !Number.isSafeInteger(envelope?.data?.version) || envelope.data.version < 0) {
      throw new Error('Current native Canvas version could not be confirmed.');
    }
    const latest = global.__LCOS_NODE_LAB__;
    if (latest?.api !== host.api || latest?.canvasId !== canvasId || latest?.projectId !== plan.space.projectId) {
      throw new Error('Canvas/API/Project changed during the version read.');
    }
    return { lcos_expected_canvas_version: envelope.data.version };
  }

  function isPrimaryArtifactRef(ref) {
    return !!ref && typeof ref === 'object' && !Array.isArray(ref)
      && ref.version === 1 && ref.entityType === 'artifact'
      && typeof ref.entityId === 'string' && ref.entityId.length > 0
      && ref.entityId === ref.artifactId
      && typeof ref.artifactViewId === 'string' && ref.artifactViewId.length > 0
      && typeof ref.revisionId === 'string' && ref.revisionId.length > 0;
  }

  function samePrimaryArtifact(left, right) {
    return isPrimaryArtifactRef(left) && isPrimaryArtifactRef(right)
      && left.entityId === right.entityId
      && left.artifactId === right.artifactId
      && left.artifactViewId === right.artifactViewId;
  }

  function nodeHasExactBody(node, body) {
    const data = node?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (Object.prototype.hasOwnProperty.call(data, 'text')) {
      return typeof data.text === 'string' && data.text === body;
    }
    return Object.prototype.hasOwnProperty.call(data, 'content')
      && typeof data.content === 'string' && data.content === body;
  }

  function refAlreadyMatches(left, right) {
    return !!left && !!right && left.version === right.version && left.entityType === right.entityType
      && left.entityId === right.entityId && left.artifactId === right.artifactId
      && left.artifactViewId === right.artifactViewId && left.revisionId === right.revisionId;
  }

  function patchNodeRefOnly(node, ref) {
    if (refAlreadyMatches(node?.data?.lcos_ref, ref)) return node;
    return { ...node, data: { ...node.data, lcos_ref: clone(ref) } };
  }

  function normalizeTextReceiptHistoryState(canvasId, state) {
    state = normalizeCreateReceiptHistoryState(canvasId, state);
    if (!state || !Array.isArray(state.nodes)) return state;
    const counts = new Map();
    for (const node of state.nodes) counts.set(node?.id, (counts.get(node?.id) || 0) + 1);
    const nodes = state.nodes.map(node => {
      if (node?.type !== 'text' || counts.get(node.id) !== 1) return node;
      const remembered = byCanvasNode.get(nodeKey(canvasId, node.id));
      const proof = remembered?.textReceipt;
      if (!proof || !refAlreadyMatches(remembered.ref, proof.ref)
        || !samePrimaryArtifact(node?.data?.lcos_ref, proof.ref)
        || !nodeHasExactBody(node, proof.body)) return node;
      return patchNodeRefOnly(node, proof.ref);
    });
    return nodes.some((node, index) => node !== state.nodes[index]) ? { ...state, nodes } : state;
  }

  function backfillTextRevisionReceipt({ canvasId, nodeId, ref, body, history, getHistory, currentNodesRef, setNodes,
    setTextReceiptNodes, flushHistory, isHistoryApplying, queuedTextReceipt } = {}) {
    if (typeof canvasId !== 'string' || !canvasId || typeof nodeId !== 'string' || !nodeId
      || !Array.isArray(history) || typeof body !== 'string' || !isPrimaryArtifactRef(ref)) {
      return { ok: false, reason: 'TEXT_REVISION_RECEIPT_INPUT_INVALID' };
    }

    const remembered = byCanvasNode.get(nodeKey(canvasId, nodeId))?.ref;
    if (!samePrimaryArtifact(remembered, ref)) {
      return { ok: false, reason: 'TEXT_REVISION_CANVAS_BINDING_MISMATCH' };
    }
    const current = currentNodesRef?.current;
    if (!Array.isArray(current)) return { ok: false, reason: 'NATIVE_STATE_OWNER_UNAVAILABLE' };
    const liveMatches = current.filter(node => node?.id === nodeId);
    if (liveMatches.length !== 1) {
      return { ok: false, reason: liveMatches.length ? 'LIVE_NODE_ALIAS_AMBIGUOUS' : 'LIVE_NODE_NOT_FOUND' };
    }
    const liveNode = liveMatches[0];
    if (!samePrimaryArtifact(liveNode?.data?.lcos_ref, ref)) {
      return { ok: false, reason: 'LIVE_NODE_ARTIFACT_IDENTITY_MISMATCH' };
    }
    // Autosave may have a newer local draft by the time this exact original
    // request returns. Its original attempted DTO proves only the older body;
    // accept its base metadata without ever replacing the newer draft text.
    const queued = queuedTextReceipt;
    const originalQueuedBody = queued?.version === 1 && ['native-autosave', 'native-history'].includes(queued.source)
      && (queued.source !== 'native-history' || ['undo', 'redo'].includes(queued.historyPhase) && nonEmptyString(queued.historyIntentId))
      && nonEmptyString(queued.operationId) && queued.canvasId === canvasId && queued.nodeId === nodeId
      && queued.body === body && nonEmptyString(queued.expectedRevisionId)
      && queued.queuedNode?.id === nodeId && queued.queuedNode?.type === 'text'
      && nodeHasExactBody(queued.queuedNode, body) && samePrimaryArtifact(queued.queuedNode?.data?.lcos_ref, ref);
    if (!nodeHasExactBody(liveNode, body) && !originalQueuedBody) {
      return { ok: false, reason: 'LIVE_NODE_BODY_MISMATCH' };
    }
    const liveNeedsPatch = !refAlreadyMatches(liveNode?.data?.lcos_ref, ref);
    // Publish the real pending user frame before a metadata-only setter can
    // replace its debounce arguments. During Undo/Redo the original applying
    // owner already controls this transition; never flush its intermediate state.
    if (liveNeedsPatch && typeof flushHistory === 'function' && isHistoryApplying?.() !== true) {
      try { flushHistory(); }
      catch { return { ok: false, reason: 'HISTORY_DEBOUNCE_FLUSH_FAILED' }; }
      if (currentNodesRef.current !== current) return { ok: false, reason: 'LIVE_STATE_CHANGED_DURING_HISTORY_FLUSH' };
    }
    const historyOwner = typeof getHistory === 'function' ? getHistory() : history;
    if (!Array.isArray(historyOwner)) return { ok: false, reason: 'NATIVE_HISTORY_OWNER_UNAVAILABLE' };

    const isReceiptSnapshot = node => node?.id === nodeId
      && nodeHasExactBody(node, body)
      && samePrimaryArtifact(node?.data?.lcos_ref, ref);
    const statePatches = [];
    const operationPatches = [];
    for (const entry of historyOwner) {
      const state = entry?.state;
      if (Array.isArray(state?.nodes)) {
        const sameId = state.nodes.filter(node => node?.id === nodeId);
        if (sameId.length > 1) return { ok: false, reason: 'HISTORY_NODE_ALIAS_AMBIGUOUS' };
        if (sameId.length === 1 && isReceiptSnapshot(sameId[0])) {
          const nodes = state.nodes.map(node => node === sameId[0] ? patchNodeRefOnly(node, ref) : node);
          if (nodes.some((node, index) => node !== state.nodes[index])) {
            statePatches.push({ state, before: state.nodes, after: nodes });
          }
        }
      }
      for (const action of entry?.lcos_history_operations || []) {
        const snapshot = action?.lcos_snapshot;
        if (isReceiptSnapshot(snapshot)) {
          const after = patchNodeRefOnly(snapshot, ref);
          if (after !== snapshot) operationPatches.push({ action, before: snapshot, after });
        }
      }
    }

    const receiptSetter = typeof setTextReceiptNodes === 'function' ? setTextReceiptNodes : setNodes;
    if (liveNeedsPatch && typeof receiptSetter !== 'function') {
      return { ok: false, reason: 'NATIVE_STATE_SETTER_UNAVAILABLE' };
    }
    const patchedCurrent = liveNeedsPatch
      ? current.map(node => node?.id === nodeId ? patchNodeRefOnly(node, ref) : node)
      : current;

    // Patch only matching snapshots. The original O8 receipt setter marks its
    // exact resulting nodes+edges, so only that metadata commit is skipped by
    // its recording effect; a later user/node/edge change still records normally.
    for (const patch of statePatches) patch.state.nodes = patch.after;
    for (const patch of operationPatches) patch.action.lcos_snapshot = patch.after;
    if (liveNeedsPatch) {
      currentNodesRef.current = patchedCurrent;
      try { receiptSetter(patchedCurrent); }
      catch (error) {
        currentNodesRef.current = current;
        for (const patch of statePatches) patch.state.nodes = patch.before;
        for (const patch of operationPatches) patch.action.lcos_snapshot = patch.before;
        return { ok: false, reason: 'NATIVE_STATE_SETTER_FAILED' };
      }
    }
    remember(canvasId, nodeId, ref);
    // React may defer the updater invoked by the original history flush. Its
    // user frame does not exist in x.current yet, so normalize that candidate
    // in the original append path using this exact accepted receipt only.
    byCanvasNode.get(nodeKey(canvasId, nodeId)).textReceipt = { body, ref: clone(ref) };
    return { ok: true };
  }

  function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function nonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }

  function executionProjectionIdentity(node) {
    if (!isRecord(node) || !nonEmptyString(node.id) || !isRecord(node.data) || node.data.id !== node.id
      || !nonEmptyString(node.data.title)) return undefined;
    const data = node.data;
    if (node.type === 'lcos-execution') {
      const reference = data.lcos_execution_ref;
      const facts = data.lcos_execution_facts;
      const execution = isRecord(facts) ? facts.execution : undefined;
      if (!isRecord(reference) || !isRecord(facts) || !isRecord(execution)
        || !nonEmptyString(reference.projectId) || !nonEmptyString(reference.canvasId)
        || !nonEmptyString(reference.workspaceId) || !['run', 'result-slot'].includes(reference.entityType)
        || !nonEmptyString(reference.entityId) || facts.entityType !== reference.entityType
        || facts.entityId !== reference.entityId || facts.title !== data.title
        || !nonEmptyString(execution.status) || typeof execution.pendingReturnCount !== 'number'
        || !Number.isFinite(execution.pendingReturnCount) || execution.pendingReturnCount < 0) return undefined;
      if (reference.entityType === 'run' && execution.runId !== reference.entityId) return undefined;
      if (reference.entityType === 'result-slot' && execution.resultSlotId !== reference.entityId) return undefined;
      if (execution.runId !== undefined && !nonEmptyString(execution.runId)) return undefined;
      if (execution.resultSlotId !== undefined && !nonEmptyString(execution.resultSlotId)) return undefined;
      return {
        kind: 'execution', projectId: reference.projectId, canvasId: reference.canvasId,
        workspaceId: reference.workspaceId, entityType: reference.entityType, entityId: reference.entityId,
      };
    }
    if (node.type === 'lcos-result-material') {
      const result = data.lcos_result_ref;
      const reference = data.lcos_ref;
      const facts = data.lcos_result_facts;
      if (!isRecord(result) || !isRecord(reference) || !isRecord(facts)
        || !nonEmptyString(result.projectId)
        || !nonEmptyString(result.canvasId) || !nonEmptyString(result.workspaceId) || !nonEmptyString(result.slotId)
        || !nonEmptyString(result.artifactId) || !nonEmptyString(result.artifactViewId) || !nonEmptyString(result.revisionId)
        || reference.version !== 1 || reference.entityType !== 'artifact'
        || reference.entityId !== result.artifactId || reference.artifactId !== result.artifactId
        || reference.artifactViewId !== result.artifactViewId || reference.revisionId !== result.revisionId
        || facts.entityType !== 'artifact' || facts.entityId !== result.artifactId
        || facts.artifactViewId !== result.artifactViewId || facts.presentedRevisionId !== result.revisionId
        || facts.artifactViewReferenceKind !== 'explicit_additional' || facts.title !== data.title
        || facts.canvasTextEditable === true || facts.canvasTextSourceAddress !== undefined) return undefined;
      return {
        kind: 'result-material', projectId: result.projectId, canvasId: result.canvasId,
        workspaceId: result.workspaceId, slotId: result.slotId, artifactId: result.artifactId,
        artifactViewId: result.artifactViewId, revisionId: result.revisionId,
      };
    }
    return undefined;
  }

  function projectionCompatibility(existing, incoming) {
    const previous = executionProjectionIdentity(existing);
    if (!previous) return 'EXECUTION_PROJECTION_EXISTING_IDENTITY_INVALID';
    if (previous.projectId !== incoming.projectId || previous.canvasId !== incoming.canvasId
      || previous.workspaceId !== incoming.workspaceId) return 'EXECUTION_PROJECTION_OWNER_MISMATCH';
    if (incoming.kind === 'execution') {
      return previous.kind === 'execution' && previous.entityType === incoming.entityType
        && previous.entityId === incoming.entityId ? undefined : 'EXECUTION_PROJECTION_IDENTITY_MISMATCH';
    }
    if (previous.kind === 'execution') {
      if (previous.entityType !== 'result-slot') return 'EXECUTION_PROJECTION_IDENTITY_MISMATCH';
      return previous.entityId === incoming.slotId ? undefined : 'EXECUTION_PROJECTION_SLOT_ID_MISMATCH';
    }
    return previous.kind === 'result-material' && previous.slotId === incoming.slotId
      && previous.artifactId === incoming.artifactId && previous.artifactViewId === incoming.artifactViewId
      && previous.revisionId === incoming.revisionId ? undefined : 'EXECUTION_PROJECTION_REFERENCE_MISMATCH';
  }

  function canonicalProjectionNode(existing, incoming) {
    const oldData = isRecord(existing?.data) ? existing.data : {};
    const newData = isRecord(incoming?.data) ? incoming.data : {};
    const data = { ...oldData };
    for (const key of Object.keys(data)) {
      if (['id', 'title', 'text', 'content', 'src', 'type', 'lcos_ref'].includes(key)
        || key.startsWith('lcos_execution_') || key.startsWith('lcos_result_')) delete data[key];
    }
    Object.assign(data, clone(newData));
    // Top-level geometry, selection and other ReactFlow-owned state belong to
    // each original snapshot, not to the Core projection receipt.
    const patched = { ...existing, type: incoming.type, data };
    return JSON.stringify(patched) === JSON.stringify(existing) ? existing : patched;
  }

  function insertedHistoryProjectionNode(node) {
    const inserted = snapshot(node);
    if (!inserted) return undefined;
    inserted.selected = false;
    if (Object.prototype.hasOwnProperty.call(inserted, 'dragging')) inserted.dragging = false;
    if (Object.prototype.hasOwnProperty.call(inserted, 'resizing')) inserted.resizing = false;
    return inserted;
  }

  function operationReferencesNode(action, nodeId) {
    return action?.nodeId === nodeId || action?.carrierId === nodeId
      || Array.isArray(action?.aliases) && action.aliases.includes(nodeId);
  }

  function conversationProjectionIdentity(node) {
    if (!isRecord(node) || node.type !== 'lcos-conversation' || !nonEmptyString(node.id)
      || !isRecord(node.data) || node.data.id !== node.id || !nonEmptyString(node.data.title)) return undefined;
    const ref = node.data.lcos_conversation_ref, state = node.data.lcos_conversation_state;
    if (!isRecord(ref) || ![ref.projectId, ref.canvasId, ref.workspaceId, ref.connectedConversationId].every(nonEmptyString)
      || !isRecord(state) || typeof state.isRunning !== 'boolean' || !nonEmptyString(state.provider)
      || state.waitingReason != null && typeof state.waitingReason !== 'string') return undefined;
    return { kind: 'conversation', projectId: ref.projectId, canvasId: ref.canvasId,
      workspaceId: ref.workspaceId, connectedConversationId: ref.connectedConversationId };
  }

  function conversationProjectionCompatibility(existing, incoming) {
    const previous = conversationProjectionIdentity(existing);
    if (!previous) return 'CONVERSATION_PROJECTION_EXISTING_IDENTITY_INVALID';
    return ['projectId', 'canvasId', 'workspaceId', 'connectedConversationId'].every(key => previous[key] === incoming[key])
      ? undefined : 'CONVERSATION_PROJECTION_IDENTITY_MISMATCH';
  }

  function canonicalConversationProjectionNode(existing, incoming) {
    // Only the confirmed Core display fields are refreshed. Local avatar,
    // draft and other user data stay with each existing native snapshot.
    const data = { ...existing.data, id: incoming.id, title: incoming.data.title,
      lcos_conversation_ref: clone(incoming.data.lcos_conversation_ref),
      lcos_conversation_state: clone(incoming.data.lcos_conversation_state) };
    const patched = { ...existing, data };
    return JSON.stringify(patched) === JSON.stringify(existing) ? existing : patched;
  }

  function backfillExecutionProjectionReceipt({ canvasId, nodes, history, getHistory, currentNodesRef, setNodes, suppress, flushHistory,
    identityOf = executionProjectionIdentity, compatible = projectionCompatibility, canonicalize = canonicalProjectionNode } = {}) {
    if (!nonEmptyString(canvasId) || !Array.isArray(nodes) || !Array.isArray(history)) {
      return { ok: false, reason: 'EXECUTION_PROJECTION_RECEIPT_INPUT_INVALID' };
    }
    if (nodes.length === 0) return { ok: true, idempotent: true, framesPatched: 0, framesInserted: 0, operationSnapshotsPatched: 0 };
    const incoming = new Map();
    for (const node of nodes) {
      const identity = identityOf(node);
      if (!identity) return { ok: false, reason: 'EXECUTION_PROJECTION_NODE_INVALID' };
      if (identity.canvasId !== canvasId) return { ok: false, reason: 'EXECUTION_PROJECTION_CANVAS_MISMATCH' };
      if (incoming.has(node.id)) return { ok: false, reason: 'EXECUTION_PROJECTION_NODE_ID_DUPLICATE' };
      incoming.set(node.id, { node: snapshot(node), identity });
    }
    const current = currentNodesRef?.current;
    if (!Array.isArray(current)) return { ok: false, reason: 'NATIVE_STATE_OWNER_UNAVAILABLE' };
    if (typeof flushHistory === 'function') {
      try { flushHistory(); }
      catch { return { ok: false, reason: 'HISTORY_DEBOUNCE_FLUSH_FAILED' }; }
    }
    const historyOwner = typeof getHistory === 'function' ? getHistory() : history;
    if (!Array.isArray(historyOwner) || historyOwner.length === 0) {
      return { ok: false, reason: 'EXECUTION_HISTORY_STATE_INVALID' };
    }

    const statePlans = [];
    const actionPlans = [];
    for (const entry of historyOwner) {
      if (!isRecord(entry) || !isRecord(entry.state) || !Array.isArray(entry.state.nodes)) {
        return { ok: false, reason: 'EXECUTION_HISTORY_STATE_INVALID' };
      }
      const beforeNodes = entry.state.nodes;
      const afterNodes = [...beforeNodes];
      for (const [nodeId, target] of incoming) {
        const matches = beforeNodes.filter(node => node?.id === nodeId);
        if (matches.length > 1) return { ok: false, reason: 'EXECUTION_HISTORY_NODE_ID_AMBIGUOUS' };
        if (matches.length === 0) {
          const inserted = insertedHistoryProjectionNode(target.node);
          if (!inserted) return { ok: false, reason: 'EXECUTION_PROJECTION_NODE_INVALID' };
          afterNodes.push(inserted);
          continue;
        }
        const existing = matches[0];
        const incompatibility = compatible(existing, target.identity);
        if (incompatibility) return { ok: false, reason: incompatibility };
        const index = afterNodes.findIndex(node => node === existing);
        afterNodes[index] = canonicalize(existing, target.node);
      }
      if (afterNodes.some((node, index) => node !== beforeNodes[index])) {
        statePlans.push({ state: entry.state, before: beforeNodes, after: afterNodes });
      }

      if (entry.lcos_history_operations !== undefined && !Array.isArray(entry.lcos_history_operations)) {
        return { ok: false, reason: 'EXECUTION_HISTORY_OPERATIONS_INVALID' };
      }
      for (const action of entry.lcos_history_operations || []) {
        if (!isRecord(action)) return { ok: false, reason: 'EXECUTION_HISTORY_OPERATION_INVALID' };
        const referenced = [...incoming].filter(([nodeId]) => operationReferencesNode(action, nodeId));
        if (referenced.length > 1) return { ok: false, reason: 'EXECUTION_HISTORY_OPERATION_AMBIGUOUS' };
        if (referenced.length === 0) continue;
        const [nodeId, target] = referenced[0];
        const snapshotNode = action.lcos_snapshot;
        if (snapshotNode !== undefined) {
          if (snapshotNode?.id !== nodeId) return { ok: false, reason: 'EXECUTION_HISTORY_SNAPSHOT_ID_MISMATCH' };
          const incompatibility = compatible(snapshotNode, target.identity);
          if (incompatibility) return { ok: false, reason: incompatibility };
        }
        const canonicalRef = target.node.data?.lcos_ref;
        if (action.lcos_ref !== undefined) {
          if (!canonicalRef || !isRecord(action.lcos_ref) || !isRecord(canonicalRef)
            || action.lcos_ref.entityType !== canonicalRef.entityType || action.lcos_ref.entityId !== canonicalRef.entityId
            || action.lcos_ref.artifactViewId !== canonicalRef.artifactViewId
            || action.lcos_ref.revisionId !== canonicalRef.revisionId) {
            return { ok: false, reason: 'EXECUTION_HISTORY_OPERATION_REFERENCE_MISMATCH' };
          }
        }
        const nextSnapshot = snapshotNode === undefined ? undefined : canonicalize(snapshotNode, target.node);
        const nextReceiptData = isRecord(action.lcos_receipt_data) && isRecord(target.node.data?.lcos_ref)
          ? clone(target.node.data) : action.lcos_receipt_data;
        const nextRef = canonicalRef === undefined ? action.lcos_ref : clone(canonicalRef);
        if (nextSnapshot !== snapshotNode || JSON.stringify(nextReceiptData) !== JSON.stringify(action.lcos_receipt_data)
          || JSON.stringify(nextRef) !== JSON.stringify(action.lcos_ref)) {
          actionPlans.push({ action, beforeSnapshot: snapshotNode, afterSnapshot: nextSnapshot,
            beforeReceiptData: action.lcos_receipt_data, afterReceiptData: nextReceiptData,
            beforeRef: action.lcos_ref, afterRef: nextRef });
        }
      }
    }

    const currentAfter = [...current];
    for (const [nodeId, target] of incoming) {
      const matches = current.filter(node => node?.id === nodeId);
      if (matches.length > 1) return { ok: false, reason: 'EXECUTION_LIVE_NODE_ID_AMBIGUOUS' };
      if (matches.length === 0) {
        currentAfter.push(snapshot(target.node));
        continue;
      }
      const existing = matches[0];
      const incompatibility = compatible(existing, target.identity);
      if (incompatibility) return { ok: false, reason: incompatibility };
      const index = currentAfter.findIndex(node => node === existing);
      currentAfter[index] = canonicalize(existing, target.node);
    }
    const currentChanged = currentAfter.some((node, index) => node !== current[index]);
    if (currentChanged && typeof setNodes !== 'function') {
      return { ok: false, reason: 'NATIVE_STATE_SETTER_UNAVAILABLE' };
    }

    const changed = statePlans.length > 0 || actionPlans.length > 0 || currentChanged;
    if (!changed) return { ok: true, idempotent: true, framesPatched: 0, framesInserted: 0, operationSnapshotsPatched: 0 };

    for (const plan of statePlans) plan.state.nodes = plan.after;
    for (const plan of actionPlans) {
      if (plan.afterSnapshot !== undefined) plan.action.lcos_snapshot = plan.afterSnapshot;
      if (plan.afterReceiptData !== plan.beforeReceiptData) plan.action.lcos_receipt_data = plan.afterReceiptData;
      if (plan.afterRef !== undefined) plan.action.lcos_ref = plan.afterRef;
    }
    if (currentChanged) {
      currentNodesRef.current = currentAfter;
      try {
        suppress?.();
        setNodes(currentAfter);
      } catch {
        currentNodesRef.current = current;
        for (const plan of statePlans) plan.state.nodes = plan.before;
        for (const plan of actionPlans) {
          if (plan.beforeSnapshot === undefined) delete plan.action.lcos_snapshot;
          else plan.action.lcos_snapshot = plan.beforeSnapshot;
          if (plan.beforeReceiptData === undefined) delete plan.action.lcos_receipt_data;
          else plan.action.lcos_receipt_data = plan.beforeReceiptData;
          if (plan.beforeRef === undefined) delete plan.action.lcos_ref;
          else plan.action.lcos_ref = plan.beforeRef;
        }
        return { ok: false, reason: 'NATIVE_STATE_SETTER_FAILED' };
      }
    }
    for (const [nodeId, target] of incoming) {
      const ref = target.node.data?.lcos_ref;
      if (ref !== undefined) remember(canvasId, nodeId, ref);
    }
    return { ok: true, idempotent: false, framesPatched: statePlans.length,
      framesInserted: statePlans.filter(plan => plan.after.length > plan.before.length).length,
      operationSnapshotsPatched: actionPlans.length };
  }

  function collectionProjectionIdentity(node) {
    if (!isRecord(node) || !nonEmptyString(node.id)
      || !(node.type === 'lcos-collection' || node.type === 'pile' && node.data?.lcos_native_collection === true)
      || !isRecord(node.data) || node.data.id !== node.id) return undefined;
    const reference = node.data.lcos_collection_ref;
    if (!isRecord(reference) || !nonEmptyString(reference.projectId) || !nonEmptyString(reference.canvasId)
      || !nonEmptyString(reference.workspaceId) || !nonEmptyString(reference.collectionId)) return undefined;
    return { projectId: reference.projectId, canvasId: reference.canvasId,
      workspaceId: reference.workspaceId, collectionId: reference.collectionId };
  }

  function sameCollectionProjection(left, right) {
    return !!left && !!right && left.projectId === right.projectId && left.canvasId === right.canvasId
      && left.workspaceId === right.workspaceId && left.collectionId === right.collectionId;
  }

  function canonicalCollectionProjectionNode(existing, incoming) {
    const oldData = isRecord(existing?.data) ? existing.data : {};
    const data = { ...oldData, ...clone(incoming.data) };
    // Locking is native presentation state; a canonical collection receipt must
    // not unlock a carrier while refreshing its server-owned projection data.
    if (Object.prototype.hasOwnProperty.call(oldData, 'locked')) data.locked = oldData.locked;
    const patched = { ...existing, type: incoming.type, data };
    return JSON.stringify(patched) === JSON.stringify(existing) ? existing : patched;
  }

  function canonicalCollectionGroupTitle(existing, incoming, identity) {
    if (incoming.type !== 'pile' || existing?.type !== 'group' || existing.data?.id !== existing.id
      || existing.data?.lcosCollectionNodeId !== incoming.id
      || existing.data?.lcosCollectionId !== identity.collectionId
      || !sameCollectionProjection(existing.data?.lcos_collection_ref, identity)
      || typeof incoming.data?.title !== 'string' || existing.data.title === incoming.data.title) return existing;
    // The Group is a spatial presentation, not another Collection carrier.
    // Refresh only its Core-owned title echo; never insert/remove a Group or
    // change its geometry, parenting, selection, layout, or space operations.
    return { ...existing, data: { ...existing.data, title: incoming.data.title } };
  }

  function insertedCollectionProjectionNode(node) {
    const inserted = snapshot(node);
    if (!inserted) return undefined;
    inserted.selected = false;
    if (Object.prototype.hasOwnProperty.call(inserted, 'dragging')) inserted.dragging = false;
    if (Object.prototype.hasOwnProperty.call(inserted, 'resizing')) inserted.resizing = false;
    return inserted;
  }

  function backfillCollectionProjectionReceipt({ projectId, workspaceId, canvasId, node, history, getHistory,
    currentNodesRef, setNodes, suppress, flushHistory } = {}) {
    if (!nonEmptyString(projectId) || !nonEmptyString(workspaceId) || !nonEmptyString(canvasId)) {
      return { ok: false, reason: 'COLLECTION_PROJECTION_OWNER_INPUT_INVALID' };
    }
    const identity = collectionProjectionIdentity(node);
    if (!identity) return { ok: false, reason: 'COLLECTION_PROJECTION_NODE_INVALID' };
    if (identity.projectId !== projectId || identity.canvasId !== canvasId || identity.workspaceId !== workspaceId) {
      return { ok: false, reason: 'COLLECTION_PROJECTION_OWNER_MISMATCH' };
    }
    const incoming = snapshot(node);
    if (!incoming) return { ok: false, reason: 'COLLECTION_PROJECTION_NODE_INVALID' };
    if (typeof flushHistory !== 'function') return { ok: false, reason: 'HISTORY_DEBOUNCE_FLUSH_UNAVAILABLE' };
    try { flushHistory(); }
    catch { return { ok: false, reason: 'HISTORY_DEBOUNCE_FLUSH_FAILED' }; }

    const current = currentNodesRef?.current;
    if (!Array.isArray(current)) return { ok: false, reason: 'NATIVE_STATE_OWNER_UNAVAILABLE' };
    const historyOwner = typeof getHistory === 'function' ? getHistory() : history;
    if (!Array.isArray(historyOwner) || historyOwner.length === 0) {
      return { ok: false, reason: 'COLLECTION_PROJECTION_HISTORY_STATE_INVALID' };
    }

    const nodeId = incoming.id;
    const ownerArrays = [{ kind: 'live', nodes: current }];
    for (const entry of historyOwner) {
      if (!isRecord(entry) || !isRecord(entry.state) || !Array.isArray(entry.state.nodes)) {
        return { ok: false, reason: 'COLLECTION_PROJECTION_HISTORY_STATE_INVALID' };
      }
      if (entry.lcos_history_operations !== undefined && !Array.isArray(entry.lcos_history_operations)) {
        return { ok: false, reason: 'COLLECTION_PROJECTION_HISTORY_OPERATIONS_INVALID' };
      }
      for (const action of entry.lcos_history_operations || []) {
        if (!isRecord(action)) return { ok: false, reason: 'COLLECTION_PROJECTION_HISTORY_OPERATION_INVALID' };
        if (operationReferencesNode(action, nodeId)) {
          return { ok: false, reason: 'COLLECTION_PROJECTION_LIFECYCLE_CONFLICT' };
        }
      }
      ownerArrays.push({ kind: 'history', state: entry.state, nodes: entry.state.nodes });
    }

    // One Collection identity must not be represented by multiple Native IDs,
    // and the requested Native ID cannot be reused by an incompatible node.
    for (const owner of ownerArrays) {
      const sameId = owner.nodes.filter(candidate => candidate?.id === nodeId);
      if (sameId.length > 1) return { ok: false, reason: 'COLLECTION_PROJECTION_NODE_ID_AMBIGUOUS' };
      if (sameId.length === 1) {
        const existingIdentity = collectionProjectionIdentity(sameId[0]);
        if (!sameCollectionProjection(existingIdentity, identity)) {
          return { ok: false, reason: 'COLLECTION_PROJECTION_EXISTING_IDENTITY_MISMATCH' };
        }
      }
      for (const candidate of owner.nodes) {
        if (candidate?.id === nodeId) continue;
        const candidateIdentity = collectionProjectionIdentity(candidate);
        if (sameCollectionProjection(candidateIdentity, identity)) {
          return { ok: false, reason: 'COLLECTION_PROJECTION_DUPLICATE_NATIVE_ID' };
        }
      }
    }

    const statePlans = [];
    for (const owner of ownerArrays.slice(1)) {
      const before = owner.nodes;
      const matches = before.filter(candidate => candidate?.id === nodeId);
      const after = matches.length === 0
        ? [...before.map(candidate => canonicalCollectionGroupTitle(candidate, incoming, identity)), insertedCollectionProjectionNode(incoming)]
        : before.map(candidate => candidate.id === nodeId ? canonicalCollectionProjectionNode(candidate, incoming)
          : canonicalCollectionGroupTitle(candidate, incoming, identity));
      if (after.some(candidate => candidate === undefined)) {
        return { ok: false, reason: 'COLLECTION_PROJECTION_NODE_INVALID' };
      }
      if (after.some((candidate, index) => candidate !== before[index])) {
        statePlans.push({ state: owner.state, before, after });
      }
    }

    const liveMatches = current.filter(candidate => candidate?.id === nodeId);
    const currentAfter = liveMatches.length === 0
      ? [...current.map(candidate => canonicalCollectionGroupTitle(candidate, incoming, identity)), insertedCollectionProjectionNode(incoming)]
      : current.map(candidate => candidate.id === nodeId ? canonicalCollectionProjectionNode(candidate, incoming)
        : canonicalCollectionGroupTitle(candidate, incoming, identity));
    if (currentAfter.some(candidate => candidate === undefined)) {
      return { ok: false, reason: 'COLLECTION_PROJECTION_NODE_INVALID' };
    }
    const currentChanged = currentAfter.some((candidate, index) => candidate !== current[index]);
    if (currentChanged && typeof setNodes !== 'function') {
      return { ok: false, reason: 'NATIVE_STATE_SETTER_UNAVAILABLE' };
    }
    if (!currentChanged && statePlans.length === 0) {
      return { ok: true, idempotent: true, framesPatched: 0, framesInserted: 0 };
    }

    for (const plan of statePlans) plan.state.nodes = plan.after;
    if (currentChanged) {
      currentNodesRef.current = currentAfter;
      try {
        suppress?.();
        setNodes(currentAfter);
      } catch {
        currentNodesRef.current = current;
        for (const plan of statePlans) plan.state.nodes = plan.before;
        return { ok: false, reason: 'NATIVE_STATE_SETTER_FAILED' };
      }
    }
    return { ok: true, idempotent: false, framesPatched: statePlans.length,
      framesInserted: statePlans.filter(plan => plan.after.length > plan.before.length).length };
  }

  // Prepare a patch on r6's own arrays and in-flight group. No replacement
  // queue, registry or retry policy is created by an identity receipt.
  function patchCreatedReceiptNode(node, proof) {
    const { clientNodeId, nodeId, ref, data, submitted } = proof;
    let after = node;
    if (node.id === clientNodeId) {
      after = patchHistoryNode({ ...node, id: nodeId }, nodeId, ref, data);
      for (const key of Object.keys(node.data || {})) if (!['id', 'lcos_ref', 'lcos_file_ref', 'lcos_upload_url'].includes(key)
        && !sameNativeValue(node.data[key], submitted.data[key])) after.data[key] = clone(node.data[key]);
    }
    if (after.parentId === clientNodeId) after = { ...after, parentId: nodeId };
    if (Array.isArray(after.data?.memberIds) && after.data.memberIds.includes(clientNodeId))
      after = { ...after, data: { ...after.data, memberIds: after.data.memberIds.map(id => id === clientNodeId ? nodeId : id) } };
    return after;
  }
  function normalizeCreateReceiptHistoryState(canvasId, state) {
    if (!Array.isArray(state?.nodes)) return state;
    let nodes = state.nodes, edges = state.edges;
    for (const candidate of state.nodes) {
      const proof = byCanvasNode.get(nodeKey(canvasId, candidate?.id))?.createReceipt;
      if (!proof || proof.clientNodeId !== candidate.id || candidate.type !== proof.submitted.type
        || candidate.data?.lcos_upload_url !== proof.submitted.data?.lcos_upload_url
        || !sameNativeValue(candidate.data?.lcos_file_ref, proof.submitted.data?.lcos_file_ref)
        || state.nodes.filter(node => node.id === candidate.id).length !== 1 || state.nodes.some(node => node.id === proof.nodeId)) continue;
      nodes = nodes.map(node => patchCreatedReceiptNode(node, proof));
      if (Array.isArray(edges)) edges = edges.map(edge => edge.source === proof.clientNodeId || edge.target === proof.clientNodeId
        ? { ...edge, ...(edge.source === proof.clientNodeId ? { source: proof.nodeId } : {}), ...(edge.target === proof.clientNodeId ? { target: proof.nodeId } : {}) } : edge);
    }
    return nodes !== state.nodes || edges !== state.edges ? { ...state, nodes, edges } : state;
  }

  function prepareCreateReceiptQueue({ canvasId, ownerCanvasId, clientNodeId, nodeId, operation, ref, data, submitted,
    nodeQueue, edgeQueue, activeGroup, fingerprints, stopped } = {}) {
    if (stopped || canvasId !== ownerCanvasId || !nonEmptyString(clientNodeId) || !nonEmptyString(nodeId)
      || clientNodeId === nodeId || !Array.isArray(nodeQueue) || !Array.isArray(edgeQueue) || !Array.isArray(activeGroup)
      || operation?.version !== 1 || operation.kind !== 'create' || operation.phase !== 'apply')
      return { ok: false, reason: 'CREATE_RECEIPT_QUEUE_OWNER_INVALID' };
    const active = activeGroup.filter(item => item?.operationType === 'create' && item.id === clientNodeId
      && sameNativeValue(item.lcos_operation, operation));
    if (active.length !== 1 || nodeQueue.some(item => item?.id === nodeId)
      || activeGroup.some(item => item?.id === nodeId)) return { ok: false, reason: 'CREATE_RECEIPT_QUEUE_OPERATION_MISMATCH' };
    const patches = [];
    for (const item of new Set([...nodeQueue, ...edgeQueue, ...activeGroup])) {
      if (!item || typeof item !== 'object') continue;
      const after = { ...item };
      if (item.id === clientNodeId) {
        if (item !== active[0] && item.operationType === 'create') return { ok: false, reason: 'CREATE_RECEIPT_QUEUED_CREATE_COLLISION' };
        after.id = nodeId;
        if (item.data && typeof item.data === 'object') after.data = patchCreatedReceiptNode({ id: clientNodeId, data: item.data }, { clientNodeId, nodeId, ref, data, submitted }).data;
        after.lcos_ref = clone(ref);
      }
      for (const field of ['parentId', 'source', 'target']) if (item[field] === clientNodeId) after[field] = nodeId;
      if (Array.isArray(item.data?.memberIds) && item.data.memberIds.includes(clientNodeId))
        after.data = { ...after.data, memberIds: item.data.memberIds.map(id => id === clientNodeId ? nodeId : id) };
      if (!sameNativeValue(after, item)) patches.push({ item, before: { ...item }, after });
    }
    const oldKey = canvasId + ':' + clientNodeId, newKey = canvasId + ':' + nodeId;
    if (fingerprints?.has?.(newKey)) return { ok: false, reason: 'CREATE_RECEIPT_FINGERPRINT_COLLISION' };
    const oldFingerprint = fingerprints?.get?.(oldKey), hadFingerprint = fingerprints?.has?.(oldKey);
    return { ok: true,
      apply() { for (const patch of patches) Object.assign(patch.item, patch.after);
        if (hadFingerprint) { fingerprints.delete(oldKey); fingerprints.set(newKey, oldFingerprint); } },
      rollback() { for (const patch of patches) { for (const key of Object.keys(patch.item)) if (!(key in patch.before)) delete patch.item[key]; Object.assign(patch.item, patch.before); }
        if (hadFingerprint) { fingerprints.delete(newKey); fingerprints.set(oldKey, oldFingerprint); } },
      patchedOperations: patches.length,
    };
  }

  function backfillCreateIdentityReceipt({ canvasId, projectId, clientNodeId, nodeId, ref, data, operation, submitted,
    history, getHistory, currentNodesRef, currentEdgesRef, setNodes, setEdges, setIdentityReceiptGraph,
    suppress, flushHistory, prepareIdentityQueue } = {}) {
    if (![canvasId, projectId, clientNodeId, nodeId].every(nonEmptyString) || clientNodeId === nodeId
      || operation?.version !== 1 || operation.kind !== 'create' || operation.phase !== 'apply'
      || !nonEmptyString(operation.operationId) || submitted?.id !== clientNodeId || !isRecord(submitted.data)
      || !isRecord(data) || data.id !== nodeId || !isRecord(ref) || ref.version !== 1
      || !['artifact', 'view'].includes(ref.entityType) || ![ref.artifactId, ref.artifactViewId, ref.revisionId].every(nonEmptyString)
      || ref.entityId !== (ref.entityType === 'artifact' ? ref.artifactId : ref.artifactViewId)
      || !Array.isArray(history) || !Array.isArray(currentNodesRef?.current) || !Array.isArray(currentEdgesRef?.current))
      return { ok: false, reason: 'CREATE_IDENTITY_RECEIPT_INPUT_INVALID' };
    const file = submitted.data.lcos_file_ref;
    if (file && ['artifactId', 'artifactViewId', 'revisionId'].some(key => file[key] !== ref[key]))
      return { ok: false, reason: 'CREATE_IDENTITY_UPLOAD_REFERENCE_MISMATCH' };
    const host = global.__LCOS_NODE_LAB__;
    if (host?.projectId !== projectId || host?.canvasId !== canvasId || host.currentCanvasId && host.currentCanvasId !== canvasId)
      return { ok: false, reason: 'CREATE_IDENTITY_SCENE_MISMATCH' };
    flushHistory?.();
    history = typeof getHistory === 'function' ? getHistory() : history;
    const candidates = [];
    for (const entry of history) for (const action of entry?.lcos_history_operations || [])
      if (action.lcos_operation?.operationId === operation.operationId && action.lcos_operation?.kind === operation.kind
        && action.aliases?.includes(clientNodeId)) candidates.push(action);
    if (candidates.length !== 1) return { ok: false, reason: 'CREATE_IDENTITY_HISTORY_OPERATION_MISMATCH' };
    const action = candidates[0], current = currentNodesRef.current, edges = currentEdgesRef.current;
    const source = current.filter(node => node.id === clientNodeId), target = current.filter(node => node.id === nodeId);
    if (!source.length && target.length === 1 && action.carrierId === nodeId && action.aliases.includes(nodeId)
      && refAlreadyMatches(target[0].data?.lcos_ref, ref)) return { ok: true, idempotent: true };
    if (source.length !== 1 || target.length || source[0].type !== submitted.type
      || source[0].data?.lcos_upload_url !== submitted.data.lcos_upload_url
      || !sameNativeValue(source[0].data?.lcos_file_ref, submitted.data.lcos_file_ref)
      || submitted.data.src !== undefined && source[0].data?.src !== submitted.data.src)
      return { ok: false, reason: 'CREATE_IDENTITY_LIVE_SOURCE_MISMATCH' };
    const proof = { clientNodeId, nodeId, ref, data, submitted };
    const queue = typeof prepareIdentityQueue === 'function' ? prepareIdentityQueue({ canvasId, clientNodeId, nodeId, operation, ref, data, submitted }) : null;
    if (!queue?.ok || typeof queue.apply !== 'function' || typeof queue.rollback !== 'function')
      return { ok: false, reason: queue?.reason || 'CREATE_IDENTITY_ORIGINAL_QUEUE_UNAVAILABLE' };
    const rename = node => patchCreatedReceiptNode(node, proof);
    const renameEdges = list => list.map(edge => edge.source === clientNodeId || edge.target === clientNodeId
      ? { ...edge, ...(edge.source === clientNodeId ? { source: nodeId } : {}), ...(edge.target === clientNodeId ? { target: nodeId } : {}) } : edge);
    const nextNodes = current.map(rename), nextEdges = renameEdges(edges);
    const edgesChanged = nextEdges.some((edge, index) => edge !== edges[index]);
    if (typeof setNodes !== 'function' || typeof setIdentityReceiptGraph !== 'function' || edgesChanged && typeof setEdges !== 'function')
      return { ok: false, reason: 'CREATE_IDENTITY_GRAPH_SETTER_UNAVAILABLE' };
    const plans = [];
    for (const entry of history) if (Array.isArray(entry?.state?.nodes)) {
      if (entry.state.nodes.some(node => node.id === nodeId)) return { ok: false, reason: 'CREATE_IDENTITY_HISTORY_TARGET_COLLISION' };
      plans.push({ state: entry.state, nodes: entry.state.nodes.map(rename), edges: Array.isArray(entry.state.edges) ? renameEdges(entry.state.edges) : entry.state.edges });
    }
    try {
      queue.apply(); suppress?.();
      setIdentityReceiptGraph({ nodes: nextNodes, edges: edgesChanged ? nextEdges : edges });
      currentNodesRef.current = nextNodes; currentEdgesRef.current = edgesChanged ? nextEdges : edges;
    } catch {
      queue.rollback(); currentNodesRef.current = current; currentEdgesRef.current = edges;
      try { setNodes(current); if (edgesChanged) setEdges(edges); } catch { /* original setter failure stays a failed receipt */ }
      return { ok: false, reason: 'CREATE_IDENTITY_ORIGINAL_SETTER_FAILED' };
    }
    for (const plan of plans) { plan.state.nodes = plan.nodes; if (plan.edges !== undefined) plan.state.edges = plan.edges; }
    action.aliases = [...new Set([...action.aliases, nodeId])]; action.carrierId = nodeId;
    if (action.lcos_snapshot) action.lcos_snapshot = rename(action.lcos_snapshot);
    action.lcos_ref = clone(ref); action.lcos_receipt_data = clone(data);
    remember(canvasId, clientNodeId, ref); remember(canvasId, nodeId, ref);
    // A pre-receipt original S updater can be deferred until the next render.
    // Project that exact old upload candidate through the same accepted ID
    // proof when S constructs it; do not append or suppress a user's frame.
    byCanvasNode.get(nodeKey(canvasId, clientNodeId)).createReceipt = clone(proof);
    return { ok: true, idempotent: false, sourceNodeId: clientNodeId, nodeId, queuedOperationsPatched: queue.patchedOperations };
  }

  function backfillHistoryReceipt({ receiptKind, canvasId, nodeId, ref, body, data, nodes, operation, history,
    projectId, workspaceId, connectedConversationId, node, currentNodesRef, setNodes, suppress, flushHistory, getHistory,
    setTextReceiptNodes, isHistoryApplying, queuedTextReceipt, clientNodeId, submitted, currentEdgesRef, setEdges, setIdentityReceiptGraph, prepareIdentityQueue } = {}) {
    if (receiptKind === 'native-create-identity') return backfillCreateIdentityReceipt({ canvasId, projectId, clientNodeId, nodeId, ref, data, operation, submitted,
      history, getHistory, currentNodesRef, currentEdgesRef, setNodes, setEdges, setIdentityReceiptGraph, suppress, flushHistory, prepareIdentityQueue });
    if (receiptKind === 'material-projection') {
      // Identity and exact revision came from a real Core/projector receipt.
      // Existing native snapshots keep their body, geometry, selection and
      // editing state. Only absent canonical carriers enter these frames.
      const identityOf = candidate => {
        const material = candidate?.data?.lcos_ref;
        if (![projectId, canvasId, workspaceId].every(nonEmptyString) || !isRecord(candidate)
          || !nonEmptyString(candidate.id) || candidate.data?.id !== candidate.id || !['text', 'image'].includes(candidate.type)
          || !isRecord(material) || material.version !== 1 || !['artifact', 'view'].includes(material.entityType)
          || ![material.artifactId, material.artifactViewId, material.revisionId].every(nonEmptyString)
          || material.entityId !== (material.entityType === 'artifact' ? material.artifactId : material.artifactViewId)) return undefined;
        return { projectId, canvasId, workspaceId, artifactId: material.artifactId, artifactViewId: material.artifactViewId,
          revisionId: material.revisionId, entityType: material.entityType, entityId: material.entityId };
      };
      const compatible = (existing, incoming) => {
        const previous = identityOf(existing);
        return previous && Object.keys(incoming).every(key => previous[key] === incoming[key])
          ? undefined : 'MATERIAL_HISTORY_REFERENCE_MISMATCH';
      };
      return backfillExecutionProjectionReceipt({ canvasId, nodes, history, getHistory, currentNodesRef, setNodes, suppress, flushHistory,
        identityOf, compatible, canonicalize: existing => existing });
    }
    if (receiptKind === 'execution-projection') {
      return backfillExecutionProjectionReceipt({ canvasId, nodes, history, getHistory, currentNodesRef, setNodes, suppress, flushHistory });
    }
    if (receiptKind === 'conversation-projection') {
      if (![projectId, canvasId, workspaceId, connectedConversationId].every(nonEmptyString)
        || !Array.isArray(nodes) || nodes.length !== 1) return { ok: false, reason: 'CONVERSATION_PROJECTION_RECEIPT_INPUT_INVALID' };
      const identity = conversationProjectionIdentity(nodes[0]);
      if (!identity || identity.projectId !== projectId || identity.canvasId !== canvasId
        || identity.workspaceId !== workspaceId || identity.connectedConversationId !== connectedConversationId) {
        return { ok: false, reason: 'CONVERSATION_PROJECTION_IDENTITY_MISMATCH' };
      }
      return backfillExecutionProjectionReceipt({ canvasId, nodes, history, getHistory, currentNodesRef, setNodes, suppress, flushHistory,
        identityOf: conversationProjectionIdentity, compatible: conversationProjectionCompatibility, canonicalize: canonicalConversationProjectionNode });
    }
    if (receiptKind === 'collection-projection') {
      return backfillCollectionProjectionReceipt({ projectId, workspaceId, canvasId, node, history, getHistory,
        currentNodesRef, setNodes, suppress, flushHistory });
    }
    if (receiptKind === 'text-revision') {
      return backfillTextRevisionReceipt({ canvasId, nodeId, ref, body, history, getHistory, currentNodesRef, setNodes,
        setTextReceiptNodes, flushHistory, isHistoryApplying, queuedTextReceipt });
    }
    if (receiptKind !== undefined) return { ok: false, reason: 'HISTORY_RECEIPT_KIND_UNSUPPORTED' };
    if (!canvasId || nodeId === undefined || nodeId === null || nodeId === '' || !Array.isArray(history)) {
      return { ok: false, reason: 'HISTORY_OWNER_INPUT_INVALID' };
    }
    if (!ref || ref.version !== 1 || !['artifact', 'view'].includes(ref.entityType)
      || typeof ref.entityId !== 'string' || !ref.entityId
      || !operation || operation.version !== 1 || !['apply', 'undo', 'redo'].includes(operation.phase)
      || !operation.operationId || !['create', 'delete', 'duplicate-view'].includes(operation.kind)
      || !data || typeof data !== 'object' || Array.isArray(data) || typeof data.id !== 'string' || !data.id) {
      return { ok: false, reason: 'HISTORY_RECEIPT_METADATA_INVALID' };
    }
    const candidates = [];
    for (const entry of history) {
      for (const action of entry?.lcos_history_operations || []) {
        const aliases = Array.isArray(action.aliases) ? action.aliases : [action.nodeId];
        if (action.lcos_operation?.operationId === operation.operationId
          && action.lcos_operation?.kind === operation.kind
          && aliases.includes(nodeId)) candidates.push({ entry, action });
      }
    }
    if (candidates.length !== 1) {
      return { ok: false, reason: candidates.length ? 'HISTORY_OPERATION_MATCH_AMBIGUOUS' : 'HISTORY_OPERATION_ENTRY_NOT_FOUND' };
    }
    const { action } = candidates[0];
    const aliases = new Set(Array.isArray(action.aliases) ? action.aliases : [action.nodeId]);
    const patchedStates = [];
    let snapshotNodesPatched = 0;
    for (const entry of history) {
      const state = entry?.state;
      if (!Array.isArray(state?.nodes)) continue;
      let changed = false;
      const nodes = state.nodes.map(node => {
        if (!aliases.has(node?.id)) return node;
        changed = true;
        snapshotNodesPatched += 1;
        return patchHistoryNode(node, node.id, ref, data);
      });
      if (changed) patchedStates.push({ state, nodes });
    }
    const patchedSnapshot = action.lcos_snapshot
      ? patchHistoryNode(action.lcos_snapshot, action.lcos_snapshot.id, ref, data) : undefined;
    if (snapshotNodesPatched === 0 && !action.lcos_snapshot) {
      return { ok: false, reason: 'HISTORY_NODE_SNAPSHOT_NOT_FOUND' };
    }

    const current = currentNodesRef?.current;
    if (Array.isArray(current)) {
      const matches = current.filter(node => aliases.has(node?.id));
      if (matches.length > 1) return { ok: false, reason: 'LIVE_NODE_ALIAS_AMBIGUOUS' };
      if (matches.length === 1 && typeof setNodes !== 'function') return { ok: false, reason: 'NATIVE_STATE_SETTER_UNAVAILABLE' };
      if (matches.length === 1) {
        const patchedCurrent = current.map(node => aliases.has(node?.id) ? patchHistoryNode(node, node.id, ref, data) : node);
        suppress?.();
        currentNodesRef.current = patchedCurrent;
        setNodes(patchedCurrent);
      }
    }
    for (const patch of patchedStates) patch.state.nodes = patch.nodes;
    if (patchedSnapshot) action.lcos_snapshot = patchedSnapshot;
    action.lcos_ref = clone(ref);
    action.lcos_receipt_data = clone(data);
    remember(canvasId, action.carrierId ?? nodeId, ref);
    return { ok: true };
  }

  function tagChanges(changes, getNode, canvasId) {
    if (!Array.isArray(changes)) return changes;
    const context = activeIntents.at(-1);
    const handledCollectionMerge = tagCollectionMergeChanges(context, changes, getNode, canvasId);
    const handledCollectionSpace = context?.phase === 'undo' || context?.phase === 'redo'
      ? tagCollectionSpaceHistoryChanges(context, changes, getNode)
      : consumeCollectionSpaceApplyChanges(changes, getNode, canvasId);
    const handledCollectionArrange = context?.phase === 'undo' || context?.phase === 'redo'
      ? tagCollectionArrangeHistoryChanges(context, changes)
      : consumeCollectionArrangeApplyChanges(changes, canvasId);
    const applyOperations = new Map();

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      if (handledCollectionMerge.has(change) || handledCollectionSpace.has(change) || handledCollectionArrange.has(change)) continue;
      const changeType = change.type;
      const lifecycle = changeType === 'add' || changeType === 'remove';
      if (!lifecycle) continue;

      let fullNode;
      if (changeType === 'remove' && typeof getNode === 'function') {
        try { fullNode = getNode(change.id); } catch { fullNode = undefined; }
      }
      const item = changeType === 'add' ? change.item : undefined;
      const itemId = item?.id ?? change.id;
      const pendingKey = nodeKey(canvasId, itemId);
      const pending = pendingNodeIntents.get(pendingKey);
      const itemData = item && typeof item.data === 'object' ? item.data : undefined;
      const fullData = fullNode && typeof fullNode.data === 'object' ? fullNode.data : undefined;
      let ref = item?.lcos_ref ?? itemData?.lcos_ref ?? fullNode?.lcos_ref ?? fullData?.lcos_ref
        ?? byCanvasNode.get(nodeKey(canvasId, change.id))?.ref;

      let intent;
      let historyAction;
      if (context?.phase === 'undo' || context?.phase === 'redo') {
        historyAction = historyActionFor(context, change, changeType, itemId);
        if (historyAction?.lcos_operation) {
          intent = { ...clone(historyAction.lcos_operation), phase: context.phase };
          if (historyAction.lcos_ref !== undefined) ref = clone(historyAction.lcos_ref);
        } else {
          attachIntent(change, { unsupported: true, reason: 'HISTORY_OPERATION_ENTRY_ASSOCIATION_MISSING', ref: clone(ref) });
          continue;
        }
      } else if (pending && changeType === 'add') {
        intent = { ...pending, phase: 'apply' };
        pendingNodeIntents.delete(pendingKey);
      } else if (context?.kind === 'duplicate-view' && changeType === 'add') {
        attachIntent(change, { unsupported: true, reason: 'DUPLICATE_NODE_INTENT_MISSING', ref: clone(ref) });
        continue;
      } else if (context?.kind) {
        attachIntent(change, { unsupported: true, reason: 'PASTE_EMITTED_UNEXPECTED_LIFECYCLE_CHANGE', ref: clone(ref) });
        continue;
      } else {
        const kind = changeType === 'add' ? 'create' : 'delete';
        let operationId = applyOperations.get(kind);
        if (!operationId) {
          operationId = identifier();
          applyOperations.set(kind, operationId);
        }
        intent = { version: 1, operationId, kind, phase: 'apply' };
      }

      if (!intent) {
        attachIntent(change, { unsupported: true, reason: 'HISTORY_OPERATION_ASSOCIATION_MISSING', ref: clone(ref) });
        continue;
      }

      const removeSnapshot = changeType === 'remove' ? snapshot(fullNode) : undefined;
      attachIntent(change, {
        lcos_operation: intent,
        ...(ref === undefined ? {} : { lcos_ref: clone(ref) }),
        ...(changeType === 'remove' && removeSnapshot ? { lcos_snapshot: removeSnapshot } : {}),
        ...(changeType === 'remove' && !removeSnapshot ? { unsupported: true, reason: 'DELETE_SNAPSHOT_UNAVAILABLE' } : {}),
      });
      if (intent.phase === 'apply') {
        const changedNodeId = change.id ?? item?.id;
        remember(canvasId, changedNodeId, ref);
        queueHistoryAction(canvasId, changedNodeId, changeType, intent, ref, fullNode);
      }
    }
    return changes;
  }

  function partitionOperations(items) {
    const groups = new Map();
    for (const item of items || []) {
      if (item?.lcos_intent_unsupported) {
        throw new Error('LCOS native history intent is ambiguous; refusing persistence: ' + item.lcos_intent_unsupported);
      }
      const operation = item?.lcos_operation;
      if (operation && (!operationKey(item) || !['create', 'delete', 'duplicate-view', 'collection-space', 'collection-arrange', 'collection-merge'].includes(operation.kind)
        || !['apply', 'undo', 'redo'].includes(operation.phase))) {
        throw new Error('LCOS native lifecycle action has invalid explicit history intent; refusing persistence.');
      }
      if(operation?.kind==='collection-merge'){
        const plan=collectionMergeOperation(operation,operation.merge?.canvasId);
        if(!plan||!collectionMergeOperationItemMatches(item,operation.phase,plan))throw new Error('Original Collection merge action differs from its O8 plan.');
      }
      if (operation?.kind === 'collection-space') {
        const plan = collectionSpaceOperation(operation, operation.space?.canvasId);
        if (!plan || !collectionSpaceOperationItemMatches(item, operation.phase, plan)) {
          throw new Error('LCOS native collection-space action does not match its original O8 plan; refusing persistence.');
        }
      }
      if (operation?.kind === 'collection-arrange') {
        const plan = collectionArrangeOperation(operation, operation.space?.canvasId);
        if (!plan || !collectionArrangeOperationItemMatches(item, operation.phase, plan)) {
          throw new Error('LCOS native collection-arrange action does not match its original O8 plan; refusing persistence.');
        }
      }
      if ((item?.operationType === 'create' || item?.operationType === 'delete') && !operation) {
        throw new Error('LCOS native lifecycle action has no explicit history intent; refusing persistence.');
      }
      const key = operationKey(item);
      let group = groups.get(key);
      if (!group) {
        group = { lcos_operation: operation ? clone(operation) : undefined, items: [] };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    for (const group of groups.values()) {
      if (group.lcos_operation?.kind !== 'collection-space') continue;
      const plan = collectionSpaceOperation(group.lcos_operation, group.lcos_operation.space?.canvasId);
      const ids = plan ? [...plan.after.keys()] : [];
      if (!plan || group.items.length !== ids.length || !ids.every(id => {
        const matching = group.items.filter(item => item.id === id);
        return matching.length === 1 && collectionSpaceOperationItemMatches(matching[0], group.lcos_operation.phase, plan);
      })) throw new Error('LCOS native collection-space intent was split or incomplete; refusing persistence.');
    }
    for (const group of groups.values()) {
      if (group.lcos_operation?.kind !== 'collection-arrange') continue;
      const plan = collectionArrangeOperation(group.lcos_operation, group.lcos_operation.space?.canvasId);
      const ids = plan?.changedNodeIds || [];
      if (!plan || group.items.length !== ids.length || !ids.every(id => {
        const matching = group.items.filter(item => item.id === id);
        return matching.length === 1 && collectionArrangeOperationItemMatches(matching[0], group.lcos_operation.phase, plan);
      })) throw new Error('LCOS native collection-arrange intent was split, mixed, or incomplete; refusing persistence.');
    }
    for(const group of groups.values())if(group.lcos_operation?.kind==='collection-merge'){
      const plan=collectionMergeOperation(group.lcos_operation,group.lcos_operation.merge?.canvasId),ids=plan?.changedNodeIds||[];
      if(!plan||group.items.length!==ids.length||!ids.every(id=>group.items.filter(item=>item.id===id).length===1)
        ||!group.items.every(item=>collectionMergeOperationItemMatches(item,group.lcos_operation.phase,plan)))throw new Error('Original Collection merge was split or incomplete.');
    }
    return Array.from(groups.values());
  }

  function withIntent(spec, original) {
    if (typeof original !== 'function') return original;
    return function lcosIntentWrapped(...args) {
      const context = { ...spec };
      activeIntents.push(context);
      try { return original.apply(this, args); }
      finally {
        const index = activeIntents.lastIndexOf(context);
        if (index >= 0) activeIntents.splice(index, 1);
      }
    };
  }

  function wrapHistory(phase, original, canvasId) {
    if (phase !== 'undo' && phase !== 'redo') return original;
    return withIntent({ phase, canvasId }, original);
  }

  function wrapPaste(original, canvasId) {
    if (typeof original !== 'function') return original;
    return function lcosPasteIntentWrapped(...args) {
      return withIntent({ phase: 'apply', kind: 'duplicate-view', operationId: identifier(), canvasId }, original).apply(this, args);
    };
  }

  function tagCreatedNode(node) {
    const context = activeIntents[activeIntents.length - 1];
    if (!context || context.phase !== 'apply' || context.kind !== 'duplicate-view'
      || !node || typeof node !== 'object' || node.id === undefined || node.id === null || node.id === '') return node;
    pendingNodeIntents.set(nodeKey(context.canvasId, node.id), {
      version: 1, operationId: context.operationId, kind: context.kind, phase: 'apply',
    });
    return node;
  }

  function tagCreatedNodes(nodes) {
    if (Array.isArray(nodes)) for (const node of nodes) tagCreatedNode(node);
    return nodes;
  }

  global.__LCOS_NATIVE_INTENT__ = {
    version: 1,
    inspectNativeHistory,
    wrapHistory,
    wrapPaste,
    withHistoryEntry,
    tagHistoryBatchOperations,
    recordHistoryTransition,
    normalizeTextReceiptHistoryState,
    backfillHistoryReceipt,
    prepareCreateReceiptQueue,
    tagCreatedNode,
    tagCreatedNodes,
    queueCollectionMergeIntent,
    cancelCollectionMergeIntent,
    queueCollectionSpaceIntent,
    cancelCollectionSpaceIntent,
    queueCollectionArrangeIntent,
    cancelCollectionArrangeIntent,
    collectionSpaceVersion,
    normalizeCollectionSpaceRedoRemaps,
    tagChanges,
    partitionOperations,
    operationKey,
    metadata(change) { return change && change.__lcos_native_intent; },
    rememberNodeRef(canvasId, nodeId, ref) { remember(canvasId, nodeId, ref); },
    snapshot,
  };
})(typeof window === 'undefined' ? globalThis : window);
