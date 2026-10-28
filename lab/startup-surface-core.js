(() => {
  'use strict';
  // Remember only Core revisions actually observed by this page, not the server's
  // newest revision. The original editor/store remains the owner of UI state.
  const upstreamFetch = window.fetch.bind(window);
  const revisions = new Map();
  const writeReceipts = new Map();
  let pendingWrite = Promise.resolve();
  const canvasRoute = /^\/api\/canvas\/v1\/canvases\/([^/]+)$/;
  const batchRoute = /^\/api\/canvas\/v1\/canvases\/([^/]+)\/nodes:batchActions$/;
  const nativeTextSaveFactory = window.__LCOS_CREATE_NATIVE_TEXT_SAVE_PORT__;
  const nativeTextSavePort = typeof nativeTextSaveFactory === 'function'
    ? nativeTextSaveFactory({
      getHost: () => window.__LCOS_NODE_LAB__,
      // The revision map stays owned here. The text-save port receives only a
      // read accessor; it cannot seed, guess, or replace CAS state.
      getObservedRevision: (canvasId, nodeId) => revisions.get(canvasId)?.get(nodeId),
      readCanvasText: readCoreCanvasText,
      recoverBatchReceipt: readOriginalBatchReceipt,
    })
    : null;
  if (nativeTextSavePort) window.__LCOS_NATIVE_TEXT_SAVE_PORT__ = nativeTextSavePort;
  if (nativeTextSavePort) window.addEventListener?.('lcos-native-bridge-changed', () => nativeTextSavePort.notifyContextChanged());

  async function readCoreCanvasText(projectId, address) {
    const target = new URL('/api/lcos/core/projects/' + encodeURIComponent(projectId) + '/curation/canvas-text', location.origin);
    target.searchParams.set('canvasId', address.canvasId);
    target.searchParams.set('spatialId', address.spatialId);
    const response = await upstreamFetch(target.href, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Core returned an unreadable canvas-text response (HTTP ' + response.status + ').'); }
    if (!response.ok || payload?.ok !== true || !Object.prototype.hasOwnProperty.call(payload, 'value')) {
      throw new Error(payload?.error?.message || ('Core canvas-text read failed (HTTP ' + response.status + ').'));
    }
    return payload.value;
  }

  function equalValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equalValue(left[key], right[key]));
  }

  function currentRequestOwner(owner, canvasId) {
    const host = window.__LCOS_NODE_LAB__;
    return !!owner?.api && owner.canvasId === canvasId && host?.api === owner.api
      && host.canvasId === canvasId && (!host.currentCanvasId || host.currentCanvasId === canvasId)
      && host.projectId === owner.projectId;
  }

  function remapCreateReceipt(result, node, commit, canvasId, requestContext) {
    const clientNodeId = node?.clientNodeId, nodeId = node?.nodeId, context = requestContext;
    if (!clientNodeId || !nodeId) return null;
    const input = context?.wireBody, owner = context?.owner;
    const creates = input?.actions?.length === 1 && input.actions[0]?.action === 'create' ? input.actions[0].creates : null;
    const submitted = Array.isArray(creates) && creates.length === 1 ? creates[0] : null;
    if (clientNodeId === nodeId && submitted?.data?.lcos_material_excerpt === undefined) return null;
    const ref = node.lcos_ref;
    if (!currentRequestOwner(owner, canvasId) || input?.canvas_id !== canvasId || !owner.projectId
      || commit.core_saved !== true || commit.spatial_saved !== true
      || result.canvas_id !== canvasId || result.core_saved !== true || result.spatial_saved !== true
      || !equalValue(result.operation, input.lcos_operation) || result.operation?.kind !== 'create' || result.operation?.phase !== 'apply'
      || result.client_to_spatial_ids?.[clientNodeId] !== nodeId || commit.client_to_spatial_ids?.[clientNodeId] !== nodeId
      || submitted?.id !== clientNodeId || submitted.canvas_id !== undefined && submitted.canvas_id !== canvasId
      || !owner.api.getNode(clientNodeId) || clientNodeId !== nodeId && owner.api.getNode(nodeId)
      || !equalValue(result.lcos_refs?.[nodeId], ref)) return { ok: false, reason: 'CREATE_RECEIPT_REQUEST_OWNER_MISMATCH' };
    return owner.api.backfillNodeReceipt?.({ receiptKind: 'native-create-identity', canvasId, projectId: owner.projectId,
      clientNodeId, nodeId, submitted, ref, operation: result.operation, importedFile: node.imported_file_ref,
      ...(commit.sourceLinkPending === true ? { sourceLinkPending: true } : {}),
      data: { ...node.data, id: nodeId, lcos_ref: ref } }) ?? { ok: false, reason: 'CREATE_RECEIPT_ORIGINAL_OWNER_UNAVAILABLE' };
  }

  function observePartialExcerptReceipt(payload, canvasId, context) {
    const details = payload?.error?.details, cause = details?.causeDetails;
    const input = context?.wireBody, creates = input?.actions?.[0]?.creates;
    if (payload?.error?.code !== 'PARTIAL_LIFECYCLE_COMMIT'
      || details?.causeCode !== 'EXCERPT_SOURCE_LINK_UNCONFIRMED'
      || details.canvas_id !== canvasId
      || input?.actions?.length !== 1 || input.actions[0].action !== 'create'
      || !Array.isArray(creates) || creates.length !== 1 || !creates[0].data?.lcos_material_excerpt
      || !equalValue(details.operation, input.lcos_operation)
      || cause?.coreBound !== true || cause.spatialSaved !== true
      || !Array.isArray(details.completed) || details.completed.length !== 1) return;
    const node = details.completed[0];
    if (cause.nodeId !== node?.nodeId || node.clientNodeId !== creates[0].id
      || !equalValue(cause.completed, details.completed)
      || !equalValue(cause.lcos_refs, details.lcos_refs)
      || !equalValue(cause.client_to_spatial_ids, details.client_to_spatial_ids)) return;
    // This proves the saved child only. Preserve the error response and let
    // r6 hold its original attempt; the source relationship is still pending.
    const committed = { canvas_id: canvasId, operation: details.operation, nodes: details.completed, sourceLinkPending: true,
      core_saved: true, spatial_saved: true, lcos_refs: details.lcos_refs,
      client_to_spatial_ids: details.client_to_spatial_ids };
    const result = remapCreateReceipt(committed, node, committed, canvasId, context);
    if (!result?.ok) console.error('LCOS saved excerpt identity remains unconfirmed:', result?.reason || 'original receipt owner unavailable');
  }

  async function readOriginalBatchReceipt(operation, wireBody) {
    const requestId = operation.claimedRequestId;
    if (!requestId || !wireBody) return null;
    const route = '/api/lcos/canvases/' + encodeURIComponent(operation.canvasId)
      + '/text-save-receipts/' + encodeURIComponent(requestId);
    const response = await upstreamFetch(new URL(route, location.origin).href, {
      method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (response.status === 202 || response.status === 404) return null;
    let payload;
    try { payload = await response.json(); } catch { return null; }
    const receipt = payload?.value;
    if (response.status !== 200 || payload?.ok !== true || receipt?.requestId !== requestId
      || receipt.canvasId !== operation.canvasId || !equalValue(receipt.wireBody, wireBody)
      || !Number.isInteger(receipt.status) || receipt.status < 200 || receipt.status > 599
      || !receipt.body || typeof receipt.body !== 'object') return null;
    const originalResponse = new Response(JSON.stringify(receipt.body), {
      status: receipt.status, headers: { 'Content-Type': 'application/json' },
    });
    const backfilledTextNodes = [];
    await observe(originalResponse, operation.canvasId, false, undefined, receipt.body, backfilledTextNodes,
      { requestId, canvasId: operation.canvasId, wireBody });
    // A real HTTP response plus a Core body alone cannot claim that the
    // original history owner accepted this exact text receipt.
    if (originalResponse.ok && !backfilledTextNodes.includes(operation.nodeId)) return null;
    return { requestId, canvasId: operation.canvasId, wireBody: receipt.wireBody,
      ok: originalResponse.ok, status: receipt.status, payload: receipt.body, backfilledTextNodeIds: backfilledTextNodes };
  }

  async function observe(response, canvasId, detail, readEpoch, suppliedPayload, backfilledTextNodes, requestContext) {
    let payload = suppliedPayload;
    if (payload === undefined) {
      if (!response.ok) return null;
      try { payload = await response.clone().json(); } catch { return null; }
    }
    if (!response.ok || payload?.code !== 0 || !payload.data) {
      if (!detail) observePartialExcerptReceipt(payload, canvasId, requestContext);
      return payload;
    }
    // A GET started before a confirmed save may return last. It must not roll
    // this page's confirmed revision receipt backwards.
    if (detail && readEpoch !== (writeReceipts.get(canvasId) || 0)) return;
    if (!detail) writeReceipts.set(canvasId, (writeReceipts.get(canvasId) || 0) + 1);
    const seen = detail ? new Map() : new Map(revisions.get(canvasId) || []);
    if (detail) {
      for (const node of payload.data.nodes || []) {
        if (typeof node?.id === 'string' && typeof node.lcos_revision_id === 'string') {
          seen.set(node.id, node.lcos_revision_id);
        }
        if (node?.data?.lcos_ref) window.__LCOS_NATIVE_INTENT__?.rememberNodeRef?.(canvasId, node.id, node.data.lcos_ref);
      }
    } else {
      for (const [id, revision] of Object.entries(payload.data.lcos_expected_revisions || {})) {
        if (typeof revision === 'string') seen.set(id, revision);
      }
      const intent = window.__LCOS_NATIVE_INTENT__;
      const host = window.__LCOS_NODE_LAB__;
      for (const result of payload.data.lifecycle_results || []) {
        for (const node of result.nodes || []) {
          const remapped = remapCreateReceipt(result, node, payload.data, canvasId, requestContext);
          if (remapped) {
            if (remapped.ok) { seen.delete(node.clientNodeId); if (typeof node.lcos_ref?.revisionId === 'string') seen.set(node.nodeId, node.lcos_ref.revisionId); }
            else console.error('LCOS Core create committed, but original carrier identity backfill failed:', remapped.reason);
            continue;
          }
          intent?.rememberNodeRef?.(canvasId, node.nodeId, node.lcos_ref, result.operation);
          // A save receipt is not a new user edit. Backfill its exact original
          // history entry and live React state without creating a new history
          // snapshot or another native persistence request.
          if (host?.canvasId === canvasId && host.api?.getNode(node.nodeId)) {
            const filled = host.api.backfillNodeReceipt?.({ canvasId, nodeId: node.nodeId,
              ref: node.lcos_ref, operation: result.operation,
              data: { ...node.data, id: node.nodeId, lcos_ref: node.lcos_ref } });
            if (!filled?.ok) console.error('LCOS Core save committed, but original history receipt backfill failed:', filled?.reason || 'receipt port unavailable');
          }
        }
        // Delete/copy/restore can carry an exact reference without a returned
        // live node. Keep their existing metadata path; only a changed-ID
        // create waits for the stricter original-owner handoff above.
        for (const [id, ref] of Object.entries(result.lcos_refs || {})) {
          if (!(result.nodes || []).some(node => node?.nodeId === id && node.clientNodeId && node.clientNodeId !== id))
            intent?.rememberNodeRef?.(canvasId, id, ref, result.operation);
        }
      }
      for (const receipt of payload.data.lcos_text_receipts || []) {
        const ref = receipt?.ref;
        if (payload.data.core_saved !== true || payload.data.spatial_saved !== true
          || receipt?.canvasId !== canvasId || typeof receipt?.projectId !== 'string'
          || !receipt.projectId || typeof receipt?.nodeId !== 'string' || typeof receipt?.body !== 'string'
          || ref?.version !== 1 || ref.entityType !== 'artifact' || ref.entityId !== ref.artifactId
          || typeof ref.artifactId !== 'string' || !ref.artifactId
          || typeof ref.artifactViewId !== 'string' || !ref.artifactViewId
          || typeof ref.revisionId !== 'string' || !ref.revisionId
          || seen.get(receipt.nodeId) !== ref.revisionId) {
          console.error('LCOS Core text revision receipt is malformed or does not match the committed batch.');
          continue;
        }
        // Do not attach a late response to a different Canvas/Flow owner. The
        // history-owned port rechecks exact live material and body as well.
        if (host?.canvasId !== canvasId || host.currentCanvasId && host.currentCanvasId !== canvasId
          || host.projectId && host.projectId !== receipt.projectId || !host.api?.getNode(receipt.nodeId)
          || nativeTextSavePort?.canApplyTextReceipt?.(requestContext, receipt) === false) continue;
        const filled = host.api.backfillNodeReceipt?.({ receiptKind: 'text-revision', canvasId,
          nodeId: receipt.nodeId, ref, body: receipt.body,
          queuedTextReceipt: nativeTextSavePort?.historyReceiptContext?.(requestContext, receipt) });
        if (!filled?.ok) console.error('LCOS Core text saved, but its original history revision backfill failed:', filled?.reason || 'receipt port unavailable');
        else backfilledTextNodes?.push(receipt.nodeId);
      }
    }
    revisions.set(canvasId, seen);
    return payload;
  }

  window.fetch = function (input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), location.href); }
    catch { return upstreamFetch(input, init); }
    if (url.origin !== location.origin) return upstreamFetch(input, init);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const detail = canvasRoute.exec(url.pathname);
    if (detail && method === 'GET') {
      const canvasId = decodeURIComponent(detail[1]);
      const readEpoch = writeReceipts.get(canvasId) || 0;
      return upstreamFetch(input, init).then(async response => {
        await observe(response, canvasId, true, readEpoch);
        return response;
      });
    }
    const batch = batchRoute.exec(url.pathname);
    if (!batch || method !== 'POST') return upstreamFetch(input, init);
    const canvasId = decodeURIComponent(batch[1]);
    const requestHost = window.__LCOS_NODE_LAB__;
    const owner = requestHost ? { api: requestHost.api, canvasId: requestHost.canvasId, projectId: requestHost.projectId } : null;
    const send = async () => {
      const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      let body;
      try { body = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { body = null; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return upstreamFetch(input, init);
      const expected = Object.fromEntries(revisions.get(canvasId) || []);
      // An ordinary Frame title has no canonical text revision authorization.
      // Keep explicit caller metadata for the title validator to accept/reject;
      // never add this Canvas-wide revision map to its exact operation wire.
      let wireBody = body.lcos_operation?.kind === 'frame-title'
        ? { ...body } : { ...body, lcos_expected_revisions: expected };
      wireBody = window.__LCOS_NATIVE_INTENT__?.prepareFrameTitleBatch?.({canvasId,wireBody,owner}) ?? wireBody;
      const encoded = JSON.stringify(wireBody);
      // This runs inside the existing serialized send, after any older HTTP
      // response released it. Never downgrade a stale owned text op to an
      // unregistered ordinary POST merely because its original API changed.
      nativeTextSavePort?.assertBatchContext?.({ canvasId, wireBody });
      const requestId = 'surface-native-batch-' + crypto.randomUUID();
      const textSaveOperationIds = nativeTextSavePort?.observeBatchRequest({ requestId, canvasId, wireBody }) || [];
      const requestUrl = new URL(url.href);
      if (textSaveOperationIds.length) requestUrl.searchParams.set('lcos_text_save_request', requestId);
      let response;
      try {
        response = input instanceof Request
          ? await upstreamFetch(new Request(requestUrl.href, new Request(input, { ...init, body: encoded })))
          : await upstreamFetch(textSaveOperationIds.length ? requestUrl.href : input, { ...init, body: encoded });
      } catch (error) {
        window.__LCOS_NATIVE_INTENT__?.observeFrameTitleBatch?.({canvasId,wireBody,owner,transportFailure:true});
        if (textSaveOperationIds.length) await nativeTextSavePort.observeTransportFailure({ requestId, canvasId, wireBody,
          operationIds: textSaveOperationIds, error });
        throw error;
      }
      let payload = null;
      try { payload = await response.clone().json(); } catch { /* Preserve non-JSON native responses unchanged. */ }
      window.__LCOS_NATIVE_INTENT__?.observeFrameTitleBatch?.({canvasId,wireBody,owner,ok:response.ok,status:response.status,payload});
      const backfilledTextNodeIds = [];
      await observe(response, canvasId, false, undefined, payload, backfilledTextNodeIds,
        { requestId, canvasId, wireBody, owner });
      if (textSaveOperationIds.length) {
        await nativeTextSavePort.observeBatchResponse({ requestId, canvasId, wireBody, operationIds: textSaveOperationIds,
          ok: response.ok, status: response.status, payload, backfilledTextNodeIds });
      }
      return response;
    };
    // Native debounced saves may overlap. Keep this page's writes ordered so the
    // second request uses the first request's confirmed receipt, not a guess.
    const result = pendingWrite.then(send);
    pendingWrite = result.then(() => undefined, () => undefined);
    return result;
  };
})();
