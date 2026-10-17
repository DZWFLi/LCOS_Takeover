/* Classic-script factory for native text save handshakes.
 * The ordinary Map tracks unresolved handshakes by canvas/node (including a
 * late terminal receipt awaiting caller acknowledgement); it is not saved
 * body/revision/history. TapNow remains the spatial/history owner and Core
 * the canonical text owner.
 */
(function installNativeTextSavePortFactory(scope) {
  'use strict';

  function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function artifactRefFor(node, artifactId) {
    const ref = node?.data?.lcos_ref;
    if (!record(ref) || ref.entityType !== 'artifact') return false;
    const refId = typeof ref.artifactId === 'string' ? ref.artifactId : ref.entityId;
    return refId === artifactId && (ref.entityId === undefined || ref.entityId === artifactId);
  }
  function currentCanvas(host) {
    return nonEmpty(host?.currentCanvasId) ? host.currentCanvasId : host?.canvasId;
  }
  function publicOperation(operation) {
    if (!operation) return null;
    return { operationId: operation.operationId, status: operation.status,
      canvasId: operation.canvasId, nodeId: operation.nodeId, artifactId: operation.artifactId,
      expectedRevisionId: operation.expectedRevisionId, body: operation.body,
      claimedRequestId: operation.claimedRequestId || null, reason: operation.reason || null,
      coreRevisionId: operation.coreRevisionId || null, source: operation.source || 'explicit',
      ...(operation.historyPhase ? { historyPhase: operation.historyPhase } : {}) };
  }

  function createNativeTextSavePort({ getHost, getObservedRevision, readCanvasText, recoverBatchReceipt, timeoutMs = 15000 } = {}) {
    if (typeof getHost !== 'function' || typeof getObservedRevision !== 'function' || typeof readCanvasText !== 'function') {
      throw new TypeError('Native text save port requires the existing node/revision owners and exact Core GET reader.');
    }
    let sequence = 0;
    const pending = new Map();
    // These are callbacks into r6, not another operation queue. Actual unsaved
    // objects and their coalescing/cache remain owned by the original hook.
    const queueOwners = new Map();
    const queueTag = 'lcos_native_text_save_operation';
    const autosaveTag = 'lcos_native_text_autosave';
    const autosaveProvenance = Symbol('native-text-autosave-source');
    const autosaveOwnerApi = Symbol('native-text-autosave-owner');
    const listeners = new Set();

    function notify() {
      for (const listener of [...listeners]) {
        try { listener(); } catch (error) { console.error('Native text save observer failed.', error); }
      }
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    function getAutosaveContext(nodeId) {
      const host = getHost(), node = host?.api?.getNode?.(nodeId);
      return nonEmpty(host?.projectId) && nonEmpty(currentCanvas(host)) && node?.id === nodeId
        ? { projectId: host.projectId, canvasId: currentCanvas(host), nodeId } : null;
    }
    function primaryRef(node) {
      const ref = node?.data?.lcos_ref;
      return record(ref) && ref.version === 1 && ref.entityType === 'artifact'
        && nonEmpty(ref.artifactId) && ref.entityId === ref.artifactId
        && nonEmpty(ref.artifactViewId) && nonEmpty(ref.revisionId) ? ref : null;
    }
    function isQueuedTextSource(operation) {
      return ['native-autosave', 'native-history'].includes(operation?.source);
    }
    function captureHistoryTextOperations({ canvasId, phase, intentId, changes, operations } = {}) {
      if (!nonEmpty(canvasId) || !['undo', 'redo'].includes(phase) || !nonEmpty(intentId)) return;
      const host = getHost();
      for (const item of operations || []) {
        const ref = primaryRef({ data: item?.data });
        if (item?.operationType !== 'update' || item.type !== 'text' || typeof item.data?.text !== 'string'
          || !ref || item.lcos_operation || item.lcos_intent_unsupported) continue;
        const matches = (changes || []).filter(change => change?.id === item.id || change?.item?.id === item.id);
        const change = matches[0], changeRef = primaryRef(change?.item);
        const exactChange = matches.length === 1 && change.type === 'replace' && change.item?.id === item.id
          && change.item?.type === 'text' && change.item.data?.text === item.data.text
          && changeRef?.artifactId === ref.artifactId && changeRef?.artifactViewId === ref.artifactViewId;
        if (!exactChange) {
          item[autosaveTag] = { version: 1, source: 'native-history', historyPhase: phase, intentId,
            projectId: host?.projectId, canvasId, artifactId: ref.artifactId, artifactViewId: ref.artifactViewId,
            [autosaveOwnerApi]: host?.api, blockedHistory: true };
          continue;
        }
        item[autosaveTag] = { version: 1, source: 'native-history', historyPhase: phase, intentId,
          projectId: host?.projectId, canvasId, artifactId: ref.artifactId, artifactViewId: ref.artifactViewId,
          [autosaveOwnerApi]: host?.api };
      }
    }
    function autosavePatch(nodeId, body) {
      const host = getHost(), node = host?.api?.getNode?.(nodeId), ref = primaryRef(node);
      const context = getAutosaveContext(nodeId);
      if (typeof body !== 'string') return { text: body };
      const source = { ...context, nodeId, api: host?.api, artifactId: ref?.artifactId,
        artifactViewId: ref?.artifactViewId, body, ref };
      notify();
      // dr queues this function and executes it in the donor's later batch.
      // Object spread carries a Symbol to Ff/onNodesChange; JSON ignores it.
      return current => {
        const currentRef = primaryRef(current);
        if (current?.id !== nodeId || !ref && !currentRef) return { text: body };
        if (ref && (current?.type !== 'text' || currentRef?.artifactId !== ref.artifactId
          || currentRef?.artifactViewId !== ref.artifactViewId)) {
          // The queued callback belonged to A. Never put A's text into a
          // replacement B; retain its draft as an explicit held original op.
          return { ...current.data, [autosaveProvenance]: { ...source, blockedIdentity: true } };
        }
        return { text: body, [autosaveProvenance]: source };
      };
    }
    function captureQueuedAutosave(canvasId, item) {
      const source = item?.data?.[autosaveProvenance], ref = primaryRef({ data: item?.data });
      if (!source || item?.id !== source.nodeId || item.operationType !== 'update'
        || !source.blockedIdentity && item.data?.text !== source.body) return;
      // Ephemeral original-op metadata. PC only serializes the donor fields.
      item[autosaveTag] = { version: 1, projectId: source.projectId, canvasId: source.canvasId || canvasId,
        artifactId: source.artifactId, artifactViewId: source.artifactViewId, [autosaveOwnerApi]: source.api,
        ...(source.blockedIdentity ? { blockedIdentity: true, blockedBody: source.body } : {}) };
      // Consumption never changes a product data field or serialized value.
      try { delete item.data[autosaveProvenance]; } catch { /* JSON still excludes it */ }
    }

    function nodeKey(canvasId, nodeId) { return canvasId + '\u0000' + nodeId; }
    function findOperation(operationId) {
      for (const operation of pending.values()) if (operation.operationId === operationId) return operation;
      return null;
    }

    function contextMatches(operation) {
      const host = getHost();
      return currentCanvas(host) === operation.canvasId && host?.api === operation.api
        && (!nonEmpty(operation.projectId) || !nonEmpty(host?.projectId) || host.projectId === operation.projectId);
    }

    function finish(operation, result) {
      if (pending.get(operation.nodeKey) !== operation && operation.settled) return;
      operation.status = result.status;
      operation.reason = result.reason || null;
      operation.result = result;
      operation.settled = true;
      const nativeQueuePending = operation.queueManaged && operation.queueOutcome !== 'saved';
      const failedClaim = operation.claimedRequestId && !['confirmed', 'context-changed'].includes(result.status);
      operation.queueRetained = nativeQueuePending || failedClaim;
      if (!operation.timedOut && !operation.queueRetained && pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
      for (const resolve of operation.waiters.splice(0)) resolve(result);
      if (isQueuedTextSource(operation) && !operation.queueRetained
        && pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
      notify();
      return result;
    }

    function queueOperation(canvasId, item) {
      if (!item || !nonEmpty(item.id)) return null;
      const operation = pending.get(nodeKey(canvasId, item.id));
      if (!operation?.requestStarted) return null;
      if (operation.settled && !operation.queueRetained) return null;
      return operation;
    }

    function queueKey(canvasId, item) {
      const operation = queueOperation(canvasId, item);
      const historyIntent = item?.[autosaveTag]?.source === 'native-history' ? item[autosaveTag].intentId : '';
      if (!operation) return historyIntent ? 'history:' + historyIntent : '';
      // An edit made after the first request must not be coalesced into, or
      // acknowledged as, that older request's exact held object.
      const later = item[queueTag] !== operation.operationId && (operation.claimedRequestId
        || historyIntent && historyIntent !== operation.historyIntentId);
      return operation.operationId + (later ? ':later-edit:' + historyIntent : '');
    }

    function queueDisposition(canvasId, items) {
      const operations = (items || []).map(item => queueOperation(canvasId, item)).filter(Boolean);
      if (!operations.length) return 'ordinary';
      return operations.some(operation => operation.queueOutcome === 'held' || operation.claimedRequestId || operation.queueRetained)
        ? 'hold' : 'send';
    }

    function coalesceQueue(canvasId, items, originalCoalesce) {
      if (typeof originalCoalesce !== 'function') throw new TypeError('Original node coalescer is required.');
      const groups = new Map();
      for (const item of items || []) {
        const operation = queueOperation(canvasId, item);
        const historyIntent = item?.[autosaveTag]?.source === 'native-history' ? item[autosaveTag].intentId : '';
        const key = operation && item[queueTag] === operation.operationId ? operation.operationId
          : historyIntent ? 'history:' + historyIntent : '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      if (groups.size <= 1) return originalCoalesce(items);
      return [...groups.values()].flatMap(group => originalCoalesce(group)).sort((a, b) => a.timestamp - b.timestamp);
    }

    function queueStarted(canvasId, items) {
      for (const item of items || []) {
        const operation = queueOperation(canvasId, item);
        if (!operation || operation.claimedRequestId || operation.queueOutcome === 'held') continue;
        operation.queueManaged = true;
        operation.queueOutcome = 'sending';
        item[queueTag] = operation.operationId;
      }
      notify();
    }

    function queueSucceeded(canvasId, items) {
      for (const item of items || []) {
        const operation = queueOperation(canvasId, item);
        if (!operation || item[queueTag] !== operation.operationId) continue;
        operation.queueOutcome = 'saved';
        operation.queueRetained = false;
        if (operation.settled && !operation.timedOut && pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
        if (isQueuedTextSource(operation) && operation.settled
          && pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
      }
      notify();
    }

    function holdQueue(canvasId, items, error) {
      let held = false;
      for (const item of items || []) {
        const operation = queueOperation(canvasId, item);
        if (!operation) continue;
        operation.queueManaged = true;
        operation.queueOutcome = 'held';
        operation.queueRetained = true;
        // Only the attempted request's objects acquire this tag. Newly queued
        // edits at the same node stay separate and are never silently dropped.
        item[queueTag] = operation.operationId;
        if (!operation.claimedRequestId && !operation.settled) {
          if (!['context-changed','wrong-node-or-view','conflict'].includes(operation.status)) {
            operation.status = 'response-lost';
            operation.reason = 'The original registered queue failed without an attributable response; its edit remains pending.';
          }
          operation.transportError = String(error?.message || error || 'Original queue failure');
          settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
            reason: operation.reason, retrySent: false });
        }
        held = true;
      }
      if (held) notify();
      return held;
    }

    function holdAfterResponse(canvasId, items) {
      const incomplete = (items || []).some(item => {
        const operation = queueOperation(canvasId, item);
        return operation?.claimedRequestId && !operation.confirmationReady;
      });
      return incomplete ? holdQueue(canvasId, items) : false;
    }

    function equalValue(left, right) {
      if (left === right) return true;
      if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
        && left.length === right.length && left.every((value, index) => equalValue(value, right[index]));
      if (!record(left) || !record(right)) return false;
      const keys = Object.keys(left);
      return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equalValue(left[key], right[key]));
    }

    function canAcknowledgeQueueItem(canvasId, item, nativeUpdate, operationId) {
      const operation = queueOperation(canvasId, item);
      if (!operation || operation.operationId !== operationId || item[queueTag] !== operationId
        || !operation.confirmationReady || !operation.batchReceiptReceived || !operation.wireBody) return false;
      const updates = operation.wireBody.actions?.flatMap(action => action?.action === 'update' && Array.isArray(action.updates) ? action.updates : []) || [];
      const matches = updates.filter(update => update?.id === item.id);
      return matches.length === 1 && equalValue(matches[0], JSON.parse(JSON.stringify(nativeUpdate)));
    }

    function registerQueueOwner(canvasId, owner, reconcile, controls = {}) {
      if (!nonEmpty(canvasId) || !owner || typeof reconcile !== 'function') return () => {};
      if (!queueOwners.has(canvasId)) queueOwners.set(canvasId, new Map());
      const owners = queueOwners.get(canvasId);
      const entry = owners.get(owner) || {};
      Object.assign(entry, { reconcile, ...controls });
      owners.set(owner, entry);
      return () => {
        // A blocked original owner remains responsible for its actual queue
        // across effect cleanup. Keep only its callback until a real receipt.
        const holds = [...pending.values()].some(operation => operation.canvasId === canvasId
          && operation.queueManaged && operation.queueOutcome !== 'saved');
        const waitingResume = entry.recoveryRequired && entry.readPending?.().some(item => item?.[autosaveTag]);
        if (!holds && !waitingResume && owners.get(owner) === entry) owners.delete(owner);
        if (!owners.size) queueOwners.delete(canvasId);
      };
    }

    function reconcileConfirmedQueue(operation) {
      if (!operation.queueManaged || operation.queueOutcome !== 'held') return;
      for (const owner of queueOwners.get(operation.canvasId)?.values() || []) {
        if (owner.reconcile(operation.operationId) === true) {
          operation.queueOutcome = 'saved';
          operation.queueRetained = false;
          if (owner.readPending?.().some(item => item.id === operation.nodeId && item[autosaveTag])) owner.recoveryRequired = true;
          return;
        }
      }
    }

    function queueIdle(canvasId) {
      for (const operation of [...pending.values()]) {
        if (operation.canvasId !== canvasId || !operation.confirmationReady) continue;
        reconcileConfirmedQueue(operation);
        if (isQueuedTextSource(operation) && operation.settled && !operation.queueRetained
          && pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
      }
      notify();
    }

    function queuedAutosaveOwner(nodeId) {
      const host = getHost(), context = getAutosaveContext(nodeId), live = host?.api?.getNode?.(nodeId), ref = primaryRef(live);
      if (!context || !ref || live?.type !== 'text') return null;
      for (const entry of queueOwners.get(context.canvasId)?.values() || []) {
        if (entry.api !== host.api || typeof entry.readPending !== 'function') continue;
        const items = entry.readPending().filter(item => item.id === nodeId && item[autosaveTag]?.projectId === context.projectId
          && item[autosaveTag]?.artifactId === ref.artifactId && item[autosaveTag]?.artifactViewId === ref.artifactViewId);
        if (items.length) return { entry, context, count: items.length };
      }
      return null;
    }
    function readQueuedAutosave(nodeId) {
      const found = queuedAutosaveOwner(nodeId);
      if (!found) return null;
      const { entry, context, count } = found;
      return { ...context, count, canResume: entry.recoveryRequired === true && !entry.resuming
        && !entry.isBusy?.() && !pending.has(nodeKey(context.canvasId, nodeId)) };
    }
    function resumeAutosave(nodeId) {
      const found = queuedAutosaveOwner(nodeId), view = readQueuedAutosave(nodeId);
      if (!found || !view?.canResume || typeof found.entry.resume !== 'function') return false;
      const entry = found.entry;
      entry.resuming = true; entry.recoveryRequired = false; notify();
      try {
        Promise.resolve(entry.resume()).finally(() => {
          entry.resuming = false;
          if (entry.readPending?.().some(item => item.id === nodeId && item[autosaveTag])) entry.recoveryRequired = true;
          notify();
        }).catch(error => console.error('Original autosave continuation failed.', error));
        return true;
      } catch { entry.resuming = false; entry.recoveryRequired = true; notify(); return false; }
    }

    function validateSnapshot(operation, value) {
      return record(value)
        && value.projectId === operation.projectId
        && value.canvasId === operation.canvasId
        && value.spatialId === operation.nodeId
        && value.artifactId === operation.artifactId
        && typeof value.revisionId === 'string' && value.revisionId.length > 0
        && typeof value.body === 'string';
    }

    function matchesBodyUpdate(operation, wireBody) {
      if (!record(wireBody) || wireBody.canvas_id !== operation.canvasId
        || !Array.isArray(wireBody.actions) || !record(wireBody.lcos_expected_revisions)
        || wireBody.lcos_expected_revisions[operation.nodeId] !== operation.expectedRevisionId) return false;
      let matches = 0;
      for (const action of wireBody.actions) {
        if (!record(action) || action.action !== 'update' || !Array.isArray(action.updates)) continue;
        for (const update of action.updates) {
          if (update?.id !== operation.nodeId) continue;
          if (record(update.data) && update.data.text === operation.body
            && artifactRefFor({ data: update.data }, operation.artifactId)) matches += 1;
        }
      }
      return matches === 1;
    }

    async function readback(operation) {
      const value = await operation.readCanvasText(operation.projectId, {
        canvasId: operation.canvasId, spatialId: operation.nodeId,
      });
      if (!validateSnapshot(operation, value)) return { matches: false, value: value ?? null, reason: 'Core readback identity did not match the registered project/canvas/node/Artifact.' };
      return { matches: value.body === operation.body, value,
        reason: value.body === operation.body ? null : 'Core still returns a different body.' };
    }

    function settleFromResponse(operation, result) {
      const waiters = operation.waiters.splice(0);
      for (const resolve of waiters) resolve(result);
      notify();
    }

    async function processBatchResponse(operation, { requestId, canvasId, wireBody, ok, status, payload, transportError, backfilledTextNodeIds } = {}) {
      if (!operation || operation.settled || operation.claimedRequestId !== requestId
        || operation.canvasId !== canvasId) return false;
      if (transportError) {
        operation.status = 'response-lost';
        operation.reason = 'The native batch transport ended without a response; no writer retry was sent.';
        operation.transportError = String(transportError.message || transportError);
        settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
          reason: operation.reason, retrySent: false });
        return true;
      }
      if (!record(wireBody) || wireBody.canvas_id !== operation.canvasId || !matchesBodyUpdate(operation, wireBody)) {
        finish(operation, { status: 'unmatched-response', operationId: operation.operationId,
          reason: 'The response is not for the one exact registered native update.', retrySent: false });
        return true;
      }
      if (!ok || status < 200 || status >= 300 || !record(payload) || payload.code !== 0 || !record(payload.data)) {
        const error = payload?.error;
        const code = typeof error?.code === 'string' ? error.code : '';
        if (code === 'PARTIAL_COMMIT') {
          const details = error?.details;
          const committedNodeIds = Array.isArray(details?.coreSavedNodeIds) ? details.coreSavedNodeIds : null;
          if (!committedNodeIds) {
            finish(operation, { status: 'batch-failed-unattributed', operationId: operation.operationId,
              errorCode: code, reason: 'The batch reported a partial commit without per-node Core receipts; this node cannot be attributed.',
              retrySent: false });
            return true;
          }
          if (!committedNodeIds.includes(operation.nodeId)) {
            finish(operation, { status: 'batch-failed-other-node', operationId: operation.operationId,
              errorCode: code, reason: 'The partial-commit receipt lists other Core nodes, not this node; no success is inferred.',
              retrySent: false });
            return true;
          }
          operation.status = 'partial-commit';
          operation.reason = 'The facade reported a partial Core/spatial result; a readback is required and no retry will be sent.';
          try {
            const observed = await readback(operation);
            operation.readback = observed.value;
            operation.coreRevisionId = observed.value?.revisionId || null;
            operation.readbackMatches = observed.matches;
          } catch (readError) {
            operation.reason += ' Core readback failed: ' + String(readError?.message || readError);
          }
          settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
            reason: operation.reason, readback: operation.readback || null, readbackMatches: operation.readbackMatches === true,
            retrySent: false });
          return true;
        }
        const details = error?.details;
        const nodeConflict = ['STALE_REVISION', 'EXPECTED_REVISION_REQUIRED'].includes(code);
        const detailNodeId = typeof details?.nodeId === 'string' ? details.nodeId : null;
        const attributedConflict = nodeConflict && detailNodeId === operation.nodeId;
        const batchStatus = attributedConflict ? 'conflict'
          : nodeConflict && detailNodeId !== null ? 'batch-failed-other-node' : 'batch-failed-unattributed';
        finish(operation, { status: batchStatus,
          operationId: operation.operationId, httpStatus: status, errorCode: code || null,
          reason: typeof error?.message === 'string' ? error.message
            : attributedConflict ? 'The native batch was rejected by this node’s Core revision CAS.'
              : 'The batch failed without a receipt attributable to this node.',
          retrySent: false });
        return true;
      }
      const data = payload.data;
      const coreRevisionId = data.lcos_expected_revisions?.[operation.nodeId];
      if (data.core_saved !== true || data.spatial_saved !== true || !nonEmpty(coreRevisionId)
        || coreRevisionId === operation.expectedRevisionId) {
        operation.status = 'incomplete-receipt';
        operation.reason = 'The batch response did not confirm both Core and spatial saves with a new revision.';
        try {
          const observed = await readback(operation);
          operation.readback = observed.value;
          operation.coreRevisionId = observed.value?.revisionId || null;
          operation.readbackMatches = observed.matches;
        } catch (readError) {
          operation.reason += ' Core readback failed: ' + String(readError?.message || readError);
        }
        settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
          reason: operation.reason, readback: operation.readback || null, readbackMatches: operation.readbackMatches === true,
          retrySent: false });
        return true;
      }
      operation.batchReceiptReceived = true;
      operation.responseCoreRevisionId = coreRevisionId;
      operation.historyReceiptAccepted = Array.isArray(backfilledTextNodeIds) && backfilledTextNodeIds.includes(operation.nodeId);
      try {
        const observed = await readback(operation);
        if (!observed.matches || observed.value.revisionId !== coreRevisionId) {
          finish(operation, { status: 'readback-mismatch', operationId: operation.operationId,
            reason: observed.reason || 'Core revision differs from the batch response.', readback: observed.value,
            retrySent: false });
          return true;
        }
        operation.coreRevisionId = observed.value.revisionId;
        operation.readback = observed.value;
        if (!contextMatches(operation)) {
          finish(operation, { status: 'context-changed', operationId: operation.operationId,
            reason: 'The exact save was confirmed, but the original canvas/API is no longer current; callers must not update the new scene.',
            readback: observed.value, retrySent: false });
          return true;
        }
        if (!operation.historyReceiptAccepted) {
          operation.status = 'history-receipt-rejected';
          operation.reason = 'Core and spatial returned success, but the original history owner did not accept this exact text receipt; its native edit remains pending.';
          settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
            reason: operation.reason, retrySent: false });
          return true;
        }
        operation.confirmationReady = true;
        reconcileConfirmedQueue(operation);
        finish(operation, { status: 'confirmed', operationId: operation.operationId,
          value: observed.value, coreRevisionId: observed.value.revisionId,
          nativeRequestId: requestId, retrySent: false });
      } catch (readError) {
        operation.status = 'readback-failed';
        operation.reason = 'The native batch returned success, but exact Core GET readback failed: ' + String(readError?.message || readError);
        settleFromResponse(operation, { status: operation.status, operationId: operation.operationId,
          reason: operation.reason, retrySent: false });
      }
      return true;
    }

    async function observeBatchResponse(input = {}) {
      const operationIds = Array.isArray(input.operationIds) ? [...new Set(input.operationIds)] : [];
      if (!operationIds.length) return false;
      const results = await Promise.all(operationIds.map(operationId => processBatchResponse(findOperation(operationId), input)));
      notify();
      return results.some(Boolean);
    }

    function observeBatchRequest({ requestId, canvasId, wireBody } = {}) {
      const operationIds = [];
      for (const operation of pending.values()) {
        if (operation.settled || operation.claimedRequestId || operation.requestStarted === false
          || operation.canvasId !== canvasId || !contextMatches(operation)
          || !matchesBodyUpdate(operation, wireBody)) continue;
        operation.claimedRequestId = requestId;
        operation.status = 'waiting-response';
        operation.wireBody = wireBody;
        operationIds.push(operation.operationId);
      }
      if (operationIds.length) notify();
      return operationIds;
    }

    function assertBatchContext({ canvasId, wireBody } = {}) {
      const updates = wireBody?.actions?.flatMap(action => action?.action === 'update' ? action.updates || [] : []) || [];
      for (const operation of pending.values()) {
        if (!operation.requestStarted || operation.canvasId !== canvasId || operation.settled && !operation.queueRetained) continue;
        const matching = updates.filter(item => item?.id === operation.nodeId && item.data?.text === operation.body);
        if (!matching.length) continue;
        const host = getHost(), live = host?.api?.getNode?.(operation.nodeId), ref = primaryRef(live);
        const wireRef = primaryRef({data:matching[0]?.data});
        let status, reason;
        if (!contextMatches(operation) || host?.projectId !== operation.projectId) {
          status = 'context-changed'; reason = 'The original text owner changed while its native request waited to send; its draft remains queued.';
        } else if (matching.length !== 1 || live?.type !== 'text' || ref?.artifactId !== operation.artifactId
          || operation.artifactViewId && ref?.artifactViewId !== operation.artifactViewId
          || wireRef?.artifactId !== operation.artifactId || wireRef?.artifactViewId !== ref?.artifactViewId) {
          status = 'wrong-node-or-view'; reason = 'The original primary text identity changed before transport; no native request was sent.';
        } else if (operation.claimedRequestId || wireBody.lcos_expected_revisions?.[operation.nodeId] !== operation.expectedRevisionId) {
          status = operation.claimedRequestId ? operation.status : 'conflict';
          reason = 'This exact text operation cannot be replayed or rebound to another observed revision.';
        }
        if (!reason) continue;
        operation.status = status; operation.reason = reason;
        operation.queueOutcome = 'held'; operation.queueRetained = true;
        settleFromResponse(operation,{status,operationId:operation.operationId,reason,retrySent:false});
        const error = new Error(reason); error.code = 'NATIVE_TEXT_SEND_SCOPE_CHANGED'; throw error;
      }
    }

    function historyReceiptContext({ requestId, canvasId, wireBody } = {}, receipt) {
      if (!receipt || receipt.canvasId !== canvasId || typeof receipt.body !== 'string') return undefined;
      const operation = [...pending.values()].find(value => isQueuedTextSource(value)
        && value.claimedRequestId === requestId && value.canvasId === canvasId
        && value.nodeId === receipt.nodeId && value.body === receipt.body
        && equalValue(value.wireBody, wireBody) && matchesBodyUpdate(value, wireBody));
      if (!operation) return undefined;
      const updates = wireBody.actions.flatMap(action => action.action === 'update' ? action.updates || [] : []);
      const queuedNode = updates.find(item => item.id === operation.nodeId);
      const ref = primaryRef({ data: queuedNode?.data });
      if (!queuedNode || ref?.artifactId !== receipt.ref?.artifactId
        || ref.artifactViewId !== receipt.ref?.artifactViewId) return undefined;
      return { version: 1, source: operation.source, operationId: operation.operationId,
        ...(operation.historyPhase ? { historyPhase: operation.historyPhase, historyIntentId: operation.historyIntentId } : {}),
        canvasId, nodeId: operation.nodeId, expectedRevisionId: operation.expectedRevisionId,
        body: operation.body, queuedNode };
    }

    function canApplyTextReceipt({ requestId, canvasId } = {}, receipt) {
      const operation = [...pending.values()].find(value => value.claimedRequestId === requestId
        && value.canvasId === canvasId && value.nodeId === receipt?.nodeId);
      return !operation || contextMatches(operation);
    }

    async function prepareQueuedText(canvasId, items, ownerId) {
      for (const item of items || []) {
        const source = item?.[autosaveTag], ref = primaryRef({ data: item?.data });
        if (!record(source) || source.version !== 1) continue;
        const key = nodeKey(canvasId, item.id);
        if (pending.has(key)) continue; // later edits stay in the original g, partitioned from the held object
        const host = getHost(), observed = getObservedRevision(canvasId, item.id);
        const owner = queueOwners.get(canvasId)?.get(ownerId);
        if (owner && !owner.api) owner.api = source[autosaveOwnerApi];
        const operation = { operationId: 'native-text-save-' + (++sequence),
          source: source.source === 'native-history' ? 'native-history' : 'native-autosave',
          ...(source.source === 'native-history' ? { historyPhase: source.historyPhase, historyIntentId: source.intentId } : {}),
          status: 'core-preflight', nodeKey: key, projectId: source.projectId, canvasId, nodeId: item.id,
          artifactId: source.artifactId, artifactViewId: source.artifactViewId,
          expectedRevisionId: observed, body: source.blockedIdentity ? source.blockedBody : item.data?.text,
          api: source[autosaveOwnerApi], readCanvasText,
          requestStarted: true, claimedRequestId: null, waiters: [], settled: false,
          queueManaged: true, queueOutcome: 'preparing', queueRetained: true };
        pending.set(key, operation);
        item[queueTag] = operation.operationId;
        notify();
        const hold = (status, reason, readback) => {
          operation.status = status; operation.reason = reason; operation.readback = readback;
          operation.queueOutcome = 'held'; operation.queueRetained = true; notify();
        };
        const live = host?.api?.getNode?.(item.id), liveRef = primaryRef(live);
        if (source.blockedHistory) { hold('wrong-node-or-view', 'The original history text update no longer matches its exact native change; its operation remains queued.'); continue; }
        if (source.blockedIdentity) { hold('wrong-node-or-view', 'The original material changed before its deferred edit ran; its earlier draft is retained without changing the replacement material.'); continue; }
        if (source.canvasId !== canvasId || !nonEmpty(source.projectId) || item.type !== 'text'
          || item.operationType !== 'update' || typeof item.data?.text !== 'string'
          || ref?.artifactId !== source.artifactId || ref?.artifactViewId !== source.artifactViewId
          || !nonEmpty(observed) || !contextMatches(operation) || host?.projectId !== source.projectId
          || live?.type !== 'text' || liveRef?.artifactId !== source.artifactId || liveRef.artifactViewId !== source.artifactViewId) {
          hold('core-preflight-failed', 'The original text scene or observed revision is unavailable; its draft remains queued.'); continue;
        }
        let before;
        try { before = await readCanvasText(source.projectId, { canvasId, spatialId: item.id }); }
        catch (error) { hold('core-preflight-failed', String(error?.message || error)); continue; }
        if (!validateSnapshot(operation, before) || before.viewId !== source.artifactViewId) {
          hold('wrong-node-or-view', 'Core did not resolve this exact original primary text view.', before); continue;
        }
        if (!contextMatches(operation) || getHost()?.projectId !== source.projectId) { hold('context-changed', 'The original scene changed before autosave sent; its draft remains queued.', before); continue; }
        const latest = getHost()?.api?.getNode?.(item.id), latestRef = primaryRef(latest);
        if (latest?.type !== 'text' || latestRef?.artifactId !== source.artifactId || latestRef?.artifactViewId !== source.artifactViewId) {
          hold('wrong-node-or-view', 'The primary text material changed during the read-only preflight; the original operation remains queued.', before); continue;
        }
        if (before.revisionId !== observed || getObservedRevision(canvasId, item.id) !== observed) {
          hold('conflict', 'Core and the original observed text revision differ; the draft remains queued.', before); continue;
        }
        if (before.body === operation.body) {
          // This exact body is not a Core text write (e.g. a geometry-only
          // history DTO or typing back to the original body). Keep the donor
          // op for spatial/title work; do not wait for a nonexistent revision.
          if (pending.get(key) === operation) pending.delete(key);
          delete item[queueTag]; delete item[autosaveTag]; notify(); continue;
        }
        operation.status = 'waiting-batch'; operation.queueOutcome = 'ready'; operation.queueRetained = false;
        // Arm the existing observation timeout without creating another writer.
        void waitForResult(operation);
        notify();
      }
    }

    function observeTransportFailure({ requestId, canvasId, wireBody, operationIds, error } = {}) {
      return observeBatchResponse({ requestId, canvasId, wireBody, operationIds,
        ok: false, status: 0, payload: null, transportError: error || new Error('Native batch response was lost.') });
    }

    function waitForResult(operation) {
      return new Promise((resolve) => {
        if (operation.settled) { resolve(operation.result); return; }
        operation.waiters.push(resolve);
        const timer = setTimeout(() => {
          const index = operation.waiters.indexOf(resolve);
          if (index >= 0) operation.waiters.splice(index, 1);
          if (operation.settled) resolve(operation.result);
          else if (operation.status === 'waiting-response') {
            operation.timedOut = true;
            operation.status = 'response-processing-late';
            operation.reason = 'The exact native batch arrived; its response/readback is still pending. No retry is allowed.';
            resolve({ status: 'response-processing-late', operationId: operation.operationId,
              reason: operation.reason, claimedRequestId: operation.claimedRequestId, retrySent: false });
            notify();
          }
          else {
            operation.timedOut = true;
            operation.status = 'no-receipt-yet';
            operation.reason = 'No matching native batch response arrived before the observation window; the pending operation remains unresolved and cannot be retried here.';
            resolve({ status: operation.status, operationId: operation.operationId,
              reason: operation.reason, retrySent: false });
            notify();
          }
        }, timeoutMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
      });
    }

    async function save(input = {}) {
      if (!nonEmpty(input.projectId) || !nonEmpty(input.canvasId) || !nonEmpty(input.nodeId)
        || !nonEmpty(input.artifactId) || !nonEmpty(input.expectedRevisionId) || typeof input.body !== 'string') {
        return { status: 'rejected', reason: 'Project, canvas, node, Artifact, observed revision, and exact body are required.', retrySent: false };
      }
      const key = nodeKey(input.canvasId, input.nodeId);
      const existing = pending.get(key);
      if (existing) return { status: 'busy', operationId: existing.operationId,
        reason: 'This native node already has an unfinished save; no second update was issued.', retrySent: false };
      const host = getHost();
      const api = host?.api;
      const node = api?.getNode?.(input.nodeId);
      if (!host || currentCanvas(host) !== input.canvasId || !api || typeof api.updateNodeData !== 'function') {
        return { status: 'wrong-canvas', reason: 'The requested canvas is not the current original TapNow canvas/API.', retrySent: false };
      }
      if (!node || node.id !== input.nodeId || node.type !== 'text' || !artifactRefFor(node, input.artifactId)) {
        return { status: 'wrong-node-or-view', reason: 'The live native text node does not carry this exact primary Artifact identity.', retrySent: false };
      }
      if (getObservedRevision(input.canvasId, input.nodeId) !== input.expectedRevisionId) {
        return { status: 'unobserved-revision', reason: 'The existing surface wrapper has not observed this exact Core revision for the native node.', retrySent: false };
      }
      const operation = {
        operationId: 'native-text-save-' + (++sequence), status: 'core-preflight',
        nodeKey: key,
        projectId: input.projectId, canvasId: input.canvasId, nodeId: input.nodeId,
        artifactId: input.artifactId, artifactViewId: primaryRef(node)?.artifactViewId,
        expectedRevisionId: input.expectedRevisionId,
        body: input.body, api, readCanvasText,
        requestStarted: false, claimedRequestId: null, waiters: [], settled: false,
      };
      // Reserve this canvas/node synchronously before awaiting Core. A second
      // same-node caller cannot replace the original payload during preflight.
      pending.set(key, operation);
      notify();
      let before;
      try { before = await readCanvasText(input.projectId, { canvasId: input.canvasId, spatialId: input.nodeId }); }
      catch (error) {
        finish(operation, { status: 'core-preflight-failed', operationId: operation.operationId,
          reason: String(error?.message || error), retrySent: false });
        return operation.result;
      }
      if (!record(before) || before.projectId !== input.projectId || before.canvasId !== input.canvasId
        || before.spatialId !== input.nodeId || before.artifactId !== input.artifactId
        || !nonEmpty(before.revisionId) || typeof before.body !== 'string') {
        finish(operation, { status: 'wrong-node-or-view', operationId: operation.operationId,
          reason: 'Core GET did not resolve this exact primary Artifact at the requested canvas/node address.', retrySent: false });
        return operation.result;
      }
      if (before.revisionId !== input.expectedRevisionId) {
        finish(operation, { status: 'conflict', operationId: operation.operationId,
          reason: 'Core GET revision differs from the expected revision; the native update was not called.',
          readback: before, retrySent: false });
        return operation.result;
      }
      if (!contextMatches({ canvasId: input.canvasId, api })) {
        finish(operation, { status: 'context-changed', operationId: operation.operationId,
          reason: 'The original canvas changed during Core preflight; no native update was called.', retrySent: false });
        return operation.result;
      }
      if (getObservedRevision(input.canvasId, input.nodeId) !== input.expectedRevisionId) {
        finish(operation, { status: 'conflict', operationId: operation.operationId,
          reason: 'The wrapper observed a newer revision during Core preflight; no native update was called.',
          readback: before, retrySent: false });
        return operation.result;
      }
      if (before.body === input.body) {
        finish(operation, { status: 'unchanged', operationId: operation.operationId, value: before, retrySent: false });
        return operation.result;
      }
      operation.status = 'waiting-batch';
      operation.requestStarted = true;
      try {
        // This is the sole writer call. Its native update is recorded by
        // TapNow's existing ReactFlow/history queue and persisted by the
        // existing nodes:batchActions -> Core CAS path.
        api.updateNodeData(input.nodeId, { text: input.body });
      } catch (error) {
        finish(operation, { status: 'native-update-threw', operationId: operation.operationId,
          reason: String(error?.message || error), retrySent: false });
      }
      return waitForResult(operation);
    }

    async function verifyOperation(operationId) {
      const operation = findOperation(operationId);
      if (!operation || operation.operationId !== operationId) return { status: 'unknown-operation', operationId, retrySent: false };
      if (operation.settled) {
        if (operation.confirmationReady) reconcileConfirmedQueue(operation);
        return operation.result;
      }
      if (!['response-lost', 'no-receipt-yet', 'response-processing-late', 'partial-commit', 'incomplete-receipt', 'readback-failed',
        'readback-matched-unconfirmed', 'readback-not-matched', 'partial-commit-readback-matched', 'history-receipt-rejected'].includes(operation.status)) {
        return { status: operation.status, operationId, reason: operation.reason || undefined,
          readback: operation.readback || undefined, retrySent: false };
      }
      const verifyingStatus = operation.status;
      try {
        // Only the original HTTP response can confirm its spatial/history
        // receipt. A matching Core body below remains read-only evidence.
        if (operation.claimedRequestId && typeof recoverBatchReceipt === 'function') {
          const recovered = await recoverBatchReceipt(publicOperation(operation), operation.wireBody);
          if (recovered) {
            await processBatchResponse(operation, recovered);
            if (operation.settled) return operation.result;
          }
        }
        const observed = await readback(operation);
        if (operation.status !== verifyingStatus) return { status: operation.status, operationId,
          reason: operation.reason || undefined, readback: operation.readback || observed.value || null,
          retrySent: false };
        operation.readback = observed.value;
        operation.readbackMatches = observed.matches;
        operation.coreRevisionId = observed.value?.revisionId || null;
        if (verifyingStatus === 'readback-failed' && operation.historyReceiptAccepted === true && observed.matches
          && observed.value.revisionId === operation.responseCoreRevisionId) {
          if (!contextMatches(operation)) {
            finish(operation, { status: 'context-changed', operationId, reason: 'The native batch and exact Core revision were confirmed after the original canvas/API changed; callers must not update the new scene.',
              readback: observed.value, retrySent: false });
            return operation.result;
          }
          operation.confirmationReady = true;
          reconcileConfirmedQueue(operation);
          finish(operation, { status: 'confirmed', operationId, value: observed.value,
            coreRevisionId: observed.value.revisionId, nativeRequestId: operation.claimedRequestId,
            retrySent: false });
          return operation.result;
        }
        if (verifyingStatus === 'partial-commit' && observed.matches) {
          operation.status = 'partial-commit-readback-matched';
          operation.reason = 'Core has the requested body, but the facade reported spatial_saved:false; the native operation remains unconfirmed and must not be retried here.';
          return { status: operation.status, operationId, readback: observed.value,
            readbackMatches: true, contextCurrent: contextMatches(operation), retrySent: false };
        }
        if (observed.matches && observed.value.revisionId !== operation.expectedRevisionId) {
          operation.status = 'readback-matched-unconfirmed';
          operation.reason = 'Core now contains the exact requested body at the exact identity, but the native batch response receipt was lost; this is read-only evidence, not a confirmed spatial/history receipt.';
          return { status: operation.status, operationId, value: observed.value,
            contextCurrent: contextMatches(operation), retrySent: false };
        }
        operation.status = 'readback-not-matched';
        operation.reason = observed.reason || 'Core readback is still at the original revision; an in-flight native write cannot be ruled out.';
        return { status: operation.status, operationId, readback: observed.value || null,
          contextCurrent: contextMatches(operation), retrySent: false };
      } catch (error) {
        operation.status = 'readback-failed';
        operation.reason = 'Read-only Core verification failed: ' + String(error?.message || error);
        return { status: operation.status, operationId, reason: operation.reason, retrySent: false };
      }
    }

    async function verify(operationId) {
      try { return await verifyOperation(operationId); }
      finally { notify(); }
    }

    function acknowledge(operationId) {
      const operation = findOperation(operationId);
      if (!operation || !operation.settled || operation.queueRetained) return false;
      if (pending.get(operation.nodeKey) === operation) pending.delete(operation.nodeKey);
      notify();
      return true;
    }

    function getPending(selector) {
      if (selector === undefined) return [...pending.values()].map(publicOperation);
      if (typeof selector === 'string') return publicOperation(findOperation(selector));
      if (record(selector)) {
        if (nonEmpty(selector.operationId)) return publicOperation(findOperation(selector.operationId));
        if (nonEmpty(selector.canvasId) && nonEmpty(selector.nodeId)) {
          return publicOperation(pending.get(nodeKey(selector.canvasId, selector.nodeId)));
        }
      }
      return null;
    }

    function canResumeExplicitSave(operationId, input = {}) {
      const operation = findOperation(operationId), host = getHost();
      if (!operation || isQueuedTextSource(operation) || operation.source && operation.source !== 'explicit'
        || operation.settled && !operation.queueRetained || operation.status === 'context-changed'
        || !contextMatches(operation) || host?.api !== input.api || operation.api !== input.api
        || host?.projectId !== input.projectId || operation.projectId !== input.projectId
        || operation.canvasId !== input.canvasId || operation.nodeId !== input.nodeId
        || operation.artifactId !== input.artifactId || !nonEmpty(operation.artifactViewId)
        || operation.artifactViewId !== input.artifactViewId || operation.expectedRevisionId !== input.revisionId) return false;
      const ref = primaryRef(host.api.getNode?.(input.nodeId));
      return ref?.artifactId === input.artifactId && ref.artifactViewId === input.artifactViewId
        && ref.revisionId === input.revisionId;
    }

    return Object.freeze({
      save,
      verify,
      acknowledge,
      getPending,
      canResumeExplicitSave,
      subscribe,
      notifyContextChanged: notify,
      getAutosaveContext,
      autosavePatch,
      captureHistoryTextOperations,
      captureQueuedAutosave,
      prepareQueuedText,
      historyReceiptContext,
      canApplyTextReceipt,
      readQueuedAutosave,
      resumeAutosave,
      queueIdle,
      observeBatchRequest,
      assertBatchContext,
      observeBatchResponse,
      observeTransportFailure,
      queueKey,
      queueDisposition,
      coalesceQueue,
      queueStarted,
      queueSucceeded,
      holdQueue,
      holdAfterResponse,
      registerQueueOwner,
      canAcknowledgeQueueItem,
    });
  }

  if (scope) scope.__LCOS_CREATE_NATIVE_TEXT_SAVE_PORT__ = createNativeTextSavePort;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createNativeTextSavePort };
})(typeof window !== 'undefined' ? window : globalThis);
