import assert from 'node:assert/strict'

const MEMBER_TYPES = new Set(['artifact', 'conversation', 'run', 'collection', 'note', 'scope', 'workspace'])

function cssValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\a ')
}

function memberPath(projectId, collectionId) {
  return `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`
}

function refsOf(snapshot) {
  assert.ok(snapshot && Array.isArray(snapshot.members), 'Core Collection read did not return members[].')
  return snapshot.members.map((row) => row.memberRef).map((ref) => {
    assert.ok(ref && MEMBER_TYPES.has(ref.type) && typeof ref.id === 'string' && ref.id.length > 0,
      `Core returned an invalid canonical member ref: ${JSON.stringify(ref)}`)
    return { type: ref.type, id: ref.id }
  }).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))
}

function sortedRefs(rows) {
  return rows.map((ref) => ({ type: ref.type, id: String(ref.id) }))
    .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))
}

function assertMemberPreview(snapshot, member, label) {
  const preview = snapshot.previews?.find((row) => row.type === member.type && String(row.id) === String(member.id))
  assert.ok(preview, `Core member preview omitted ${label}: ${member.type}:${member.id}`)
  assert.equal(String(preview.revisionId), String(member.revisionId), `${label} preview changed its selected revision.`)
  assert.equal(String(preview.fileRecordId), String(member.fileRecordId), `${label} preview changed its exact FileRecord.`)
  assert.equal(String(preview.mimeType).split(';')[0].trim().toLowerCase(), String(member.mimeType).split(';')[0].trim().toLowerCase())
  assert.equal(preview.availability, 'available', `${label} must remain readable from its canonical FileRecord.`)
  return preview
}

function visibleMarkdownLines(bytes) {
  return bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\*\*|__|~~|`/g, '').trim())
    .filter(Boolean)
}

function materialGraph(graph) {
  assert.ok(graph && Array.isArray(graph.artifacts) && Array.isArray(graph.artifactRevisions)
    && Array.isArray(graph.fileRecords), 'Core graph omitted material identity collections.')
  const byIdentity = (rows, keys) => rows.map((row) => row)
    .sort((a, b) => keys.map((key) => String(a?.[key] ?? '')).join(':').localeCompare(keys.map((key) => String(b?.[key] ?? '')).join(':')))
  return {
    artifacts: byIdentity(graph.artifacts, ['id']),
    artifactRevisions: byIdentity(graph.artifactRevisions, ['artifactId', 'id']),
    fileRecords: byIdentity(graph.fileRecords, ['id']),
    ...(Array.isArray(graph.artifactViews) ? { artifactViews: byIdentity(graph.artifactViews, ['id']) } : {}),
  }
}

function spatialGeometry(canvases) {
  assert.ok(canvases && typeof canvases === 'object', 'Canvas readback omitted the workspace Canvas map.')
  return Object.fromEntries(Object.entries(canvases).sort(([a], [b]) => a.localeCompare(b)).map(([surface, canvas]) => {
    assert.ok(canvas && Array.isArray(canvas.nodes), `Canvas readback for ${surface} omitted nodes[].`)
    const nodes = canvas.nodes.map((node) => ({
      id: String(node.id), type: node.type ?? null, data: node.data ?? null,
      position: node.position ?? null, parentId: node.parentId ?? null,
      width: node.width ?? null, height: node.height ?? null, measured: node.measured ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id))
    const edges = Array.isArray(canvas.edges) ? [...canvas.edges].sort((a, b) => String(a.id).localeCompare(String(b.id))) : []
    return [surface, { canvasId: String(canvas.id ?? canvas.canvasId ?? ''), nodes, edges }]
  }))
}

function canvasNode(canvases, canvasId, nodeId) {
  const matches = Object.values(canvases).flatMap((canvas) => String(canvas.id ?? canvas.canvasId ?? '') === String(canvasId)
    ? canvas.nodes.filter((node) => String(node.id) === String(nodeId)) : [])
  assert.equal(matches.length, 1, `Expected one saved Collection carrier ${nodeId} on Canvas ${canvasId}.`)
  return matches[0]
}

function assertCollectionCarrier(node, { projectId, canvasId, workspaceId, collectionId }) {
  assert.equal(node.type, 'lcos-collection')
  assert.deepEqual(node.data?.lcos_collection_ref, {
    projectId: String(projectId), canvasId: String(canvasId),
    workspaceId: String(workspaceId), collectionId: String(collectionId),
  })
}

async function closeAgentPanel(page) {
  const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true })
  if (await panel.isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click()
    await panel.waitFor({ state: 'detached', timeout: 10000 })
  }
}

async function closeVisibleDropReceipt(page) {
  const receipt = page.locator('[data-lcos-drop-receipt]')
  if (!await receipt.isVisible().catch(() => false)) return
  const close = receipt.getByRole('button', { name: '关闭投放结果', exact: true })
  if (await close.isVisible().catch(() => false)) {
    await close.click()
    await receipt.waitFor({ state: 'hidden', timeout: 10000 })
  }
}

async function waitForCollectionRows(page, collectionId, expectedMembers) {
  const view = page.locator(`[data-lcos-window-body="collection"][data-lcos-window-target="${cssValue(collectionId)}"]`)
  await view.waitFor({ state: 'visible', timeout: 20000 })
  const body = view.locator(`[data-lcos-collection-work-view="${cssValue(collectionId)}"]`)
  await body.waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForFunction(({ collectionId: id, expectedCount }) => {
    const body = document.querySelector(`[data-lcos-collection-work-view="${CSS.escape(id)}"]`)
    return !!body && body.getAttribute('aria-busy') !== 'true'
      && body.querySelectorAll('[data-lcos-collection-work-item]').length === expectedCount
  }, { collectionId, expectedCount: expectedMembers.length }, { timeout: 20000 })
  for (const member of expectedMembers) {
    const row = body.locator(`[data-lcos-member-preview="${cssValue(`${member.type}:${member.id}`)}"]`)
    await row.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await row.getAttribute('data-member-revision'), String(member.revisionId))
  }
  assert.equal(await body.locator('[data-lcos-collection-work-item]').count(), expectedMembers.length)
  return { view, body }
}

async function exposeAssembly(page, conversationId, conversationNodeId) {
  const assembly = page.locator('[data-lcos-window-body="assembly"]')
  if (await assembly.isVisible().catch(() => false)) return assembly
  assert.ok(conversationId && conversationNodeId,
    'The original Assembly window is not visible after native history reload; provide the exact synthetic conversation/node IDs so it can be reopened through the original WorkView.')
  const conversationNode = page.locator(`.react-flow__node[data-id="${cssValue(conversationNodeId)}"]`)
  await conversationNode.waitFor({ state: 'visible', timeout: 15000 })
  await conversationNode.click()
  const openConversation = conversationNode.locator('button[aria-haspopup="dialog"]')
  await openConversation.waitFor({ state: 'visible', timeout: 10000 })
  await openConversation.click()
  const conversation = page.locator(`[data-lcos-window-body="conversation"][data-lcos-window-target="${cssValue(conversationId)}"]`)
  await conversation.waitFor({ state: 'visible', timeout: 15000 })
  await conversation.getByRole('button', { name: '打开 Assembly', exact: true }).click()
  await assembly.waitFor({ state: 'visible', timeout: 20000 })
  const conversationPane = page.locator('[data-lcos-window-pane]').filter({ has: conversation }).first()
  const close = conversationPane.getByRole('button', { name: '关闭窗口', exact: true })
  if (await close.count() && await close.isVisible()) {
    await close.click()
    await conversation.waitFor({ state: 'hidden', timeout: 10000 })
  }
  await assembly.waitFor({ state: 'visible', timeout: 15000 })
  return assembly
}

function waitForApiResponse(page, origin, pathname, method) {
  const wait = page.waitForResponse((response) => {
    const request = response.request(), url = new URL(response.url())
    return url.origin === origin && url.pathname === pathname && request.method() === method
  }, { timeout: 30000 })
  void wait.catch(() => {})
  return wait
}

async function exposedCollectionPoint(page, nodeId) {
  const node = page.locator(`.react-flow__node[data-id="${cssValue(nodeId)}"]`)
  return node.evaluate((element, targetId) => {
    const rect = element.getBoundingClientRect()
    const result = { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, candidates: [] }
    if (rect.width <= 0 || rect.height <= 0) return result
    const fractions = [.2, .35, .5, .65, .8]
    for (const fy of fractions) for (const fx of fractions) {
      const x = Math.round(rect.left + rect.width * fx), y = Math.round(rect.top + rect.height * fy)
      const hit = document.elementFromPoint(x, y)
      const hitNode = hit?.closest('.react-flow__node')
      const interactive = hit?.closest('button,a,input,select,textarea,[role="dialog"],[data-lcos-window-pane]')
      if (hit && hitNode?.getAttribute('data-id') === targetId && !interactive)
        result.candidates.push({ x, y, hitTag: hit.tagName, hitClass: typeof hit.className === 'string' ? hit.className : '' })
    }
    return result
  }, String(nodeId))
}

/**
 * Drives only the original Collection member menu, Assembly carry, Collection
 * WorkView and Reader. Core changes are exactly one removal and one add-back;
 * this helper never calls a Collection setter or creates a spatial node.
 */
export async function verifyCollectionManagement({
  page, origin, projectId, canvasId, collectionId, collectionTitle, nodeId,
  textMember, imageMember, otherCollectionId,
  conversationId, conversationNodeId,
  appCoreCall, appFacadeCall, readAllCanvases, saveScreenshot, report, addStep,
  setMembershipPhase, readMembershipCounts, readRawFile,
}) {
  for (const [name, value] of Object.entries({ appCoreCall, appFacadeCall, readAllCanvases, saveScreenshot,
    addStep, setMembershipPhase, readMembershipCounts, readRawFile })) assert.equal(typeof value, 'function', `${name} is required.`)
  for (const [name, value] of Object.entries({ page, origin, projectId, canvasId, collectionId, collectionTitle, nodeId, otherCollectionId }))
    assert.ok(value !== undefined && value !== null && String(value) !== '', `${name} is required.`)
  for (const member of [textMember, imageMember]) {
    assert.ok(member && member.type === 'artifact' && member.id && member.revisionId && member.fileRecordId && member.mimeType,
      'Management verification requires exact artifact/revision/FileRecord identities for both synthetic members.')
  }
  assert.notEqual(String(textMember.id), String(imageMember.id), 'Text and image fixture members must be distinct Core Artifacts.')

  const exactMemberPath = memberPath(projectId, collectionId)
  const expectedBeforeRefs = sortedRefs([textMember, imageMember])
  const expectedAfterRefs = sortedRefs([{ type: 'artifact', id: String(imageMember.id) }])
  const startingCounts = readMembershipCounts()
  assert.deepEqual(startingCounts, { add: 0, remove: 0 }, 'The native verification must start before either permitted membership write.')

  const [membersBefore, otherBefore, graphBefore, canvasesBefore, runsBefore, surfaceStatus] = await Promise.all([
    appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`),
    appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(otherCollectionId)}/members`),
    appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`),
    readAllCanvases(), appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`),
    appFacadeCall('/api/surface-core/status'),
  ])
  assert.equal(surfaceStatus?.projectId, String(projectId))
  const exactSurface = surfaceStatus?.surfaces?.filter((surface) => String(surface.canvasId) === String(canvasId)) ?? []
  assert.equal(exactSurface.length, 1, 'Collection canvas must map to exactly one current Core-declared native Surface.')
  const workspaceId = String(exactSurface[0].workspaceId)
  assert.equal(membersBefore.collection.id, String(collectionId))
  assert.equal(membersBefore.collection.projectId, String(projectId))
  assert.equal(membersBefore.collection.title, collectionTitle)
  assert.deepEqual(refsOf(membersBefore), expectedBeforeRefs)
  assert.deepEqual(refsOf(otherBefore), [{ type: 'artifact', id: String(textMember.id) }],
    'Control Collection must share the exact text Artifact before the removal.')
  const textPreview = assertMemberPreview(membersBefore, textMember, 'Text')
  const imagePreview = assertMemberPreview(membersBefore, imageMember, 'Image')
  assert.equal(textPreview.kind, 'text')
  assert.equal(imagePreview.kind, 'image')

  const checkSourceMaterial = (graph, member, label) => {
    const artifact = graph.artifacts.find((row) => String(row.id) === String(member.id))
    assert.ok(artifact, `${label} source Artifact is absent from the real Core graph.`)
    assert.equal(String(artifact.currentRevisionId), String(member.revisionId), `${label} fixture is not pinned to the expected current Revision.`)
    const revision = graph.artifactRevisions.find((row) => String(row.id) === String(member.revisionId)
      && String(row.artifactId) === String(member.id))
    assert.ok(revision, `${label} exact ArtifactRevision is absent from the Core graph.`)
    assert.equal(String(revision.fileRecordId), String(member.fileRecordId))
    assert.ok(graph.fileRecords.some((row) => String(row.id) === String(member.fileRecordId)),
      `${label} exact FileRecord is absent from the Core graph.`)
  }
  checkSourceMaterial(graphBefore, textMember, 'Text')
  checkSourceMaterial(graphBefore, imageMember, 'Image')
  const graphMaterialBefore = materialGraph(graphBefore)
  const canvasGeometryBefore = spatialGeometry(canvasesBefore)
  const savedCollectionCarrierBefore = canvasNode(canvasesBefore, canvasId, nodeId)
  assertCollectionCarrier(savedCollectionCarrierBefore, { projectId, canvasId, workspaceId, collectionId })
  const carrierSnapshot = {
    id: String(savedCollectionCarrierBefore.id), type: savedCollectionCarrierBefore.type,
    data: savedCollectionCarrierBefore.data, position: savedCollectionCarrierBefore.position,
    parentId: savedCollectionCarrierBefore.parentId ?? null,
  }
  const [textBytesBefore, imageBytesBefore] = await Promise.all([
    readRawFile(textMember.fileRecordId), readRawFile(imageMember.fileRecordId),
  ])
  for (const [label, result] of [['Text', textBytesBefore], ['Image', imageBytesBefore]]) {
    assert.equal(result?.status, 200, `${label} FileRecord bytes must be readable before UI interaction.`)
    assert.ok(Buffer.isBuffer(result.bytes), `${label} FileRecord must be read as exact bytes.`)
  }

  await closeAgentPanel(page)
  await closeVisibleDropReceipt(page)
  const collectionNode = page.locator(`.react-flow__node[data-id="${cssValue(nodeId)}"]`)
  await collectionNode.waitFor({ state: 'visible', timeout: 15000 })
  assert.equal(await collectionNode.locator('[data-lcos-collection-members-open]').count(), 0,
    'The original Collection member controls should remain absent until this node is genuinely selected.')
  // This regression selects the carrier to open its original member menu.
  // A plain folder click now intentionally expands space; the original Gen1
  // Shift gesture remains selection-only and must not activate that action.
  await collectionNode.click({ modifiers: ['Shift'] })
  await page.waitForFunction((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
    return !!node && (node.getAttribute('data-lcos-native-collection-selected') === 'true'
      || node.querySelector('[data-lcos-native-collection-selected="true"]') !== null)
  }, String(nodeId), { timeout: 10000 })
  const memberMenuTrigger = collectionNode.locator('[data-lcos-collection-members-open]')
  await memberMenuTrigger.waitFor({ state: 'visible', timeout: 10000 })
  await memberMenuTrigger.click()
  const memberPanel = page.locator('[data-lcos-collection-members-panel]')
  await memberPanel.waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await memberPanel.getAttribute('aria-label'), `${collectionTitle}的成员`)
  for (const member of [textMember, imageMember]) {
    const row = memberPanel.locator(`[data-lcos-member-row="artifact:${cssValue(member.id)}"]`)
    await row.waitFor({ state: 'visible', timeout: 10000 })
    assert.ok((await row.innerText()).includes(member.label))
  }
  await saveScreenshot('collection-management-01-original-member-menu', memberPanel)

  const lostReply = report.membershipVerification?.loseMemberReply === true
  const deleteResponsePromise = waitForApiResponse(page, origin, exactMemberPath, 'DELETE')
  setMembershipPhase('remove')
  let deleteResponse, deleteBody
  try {
    await memberPanel.getByRole('button', { name: `从集合移除 ${textMember.label}`, exact: true }).click()
    deleteResponse = await deleteResponsePromise
    deleteBody = await deleteResponse.json()
  } finally { setMembershipPhase('idle') }
  assert.equal(deleteResponse.status(), lostReply ? 503 : 200,
    'Original member removal must either return the real receipt or the explicitly configured test-only lost-reply fault.')
  if (lostReply) assert.equal(deleteBody?.error?.code, 'SYNTHETIC_LOST_MEMBERSHIP_REPLY')
  else assert.equal(deleteBody?.ok, true, JSON.stringify(deleteBody))
  const recordedDelete = report.membershipVerification?.writes?.filter((write) => write.method === 'DELETE') ?? []
  assert.equal(recordedDelete.length, 1, 'Runner receipt ledger must show exactly one canonical Core removal call.')
  assert.equal(recordedDelete[0].status, 200, 'Even the explicit lost-reply case must retain the actual Core 200 receipt.')
  assert.deepEqual(recordedDelete[0].response?.value?.memberRef, { type: 'artifact', id: String(textMember.id) })
  assert.equal(recordedDelete[0].response?.value?.collectionId, String(collectionId))
  assert.equal(recordedDelete[0].response?.value?.status, 'removed', 'The source membership must be removed by the original Core owner.')
  await page.waitForFunction(({ collectionId: id, textId, imageId }) => {
    const face = document.querySelector(`[data-lcos-canonical-collection="${CSS.escape(id)}"]`)
    const imageRow = document.querySelector(`[data-lcos-member-row="artifact:${CSS.escape(imageId)}"]`)
    const textRow = document.querySelector(`[data-lcos-member-row="artifact:${CSS.escape(textId)}"]`)
    return face?.getAttribute('data-member-read-status') === 'ready'
      && face.getAttribute('data-member-count') === '1' && imageRow !== null && textRow === null
  }, { collectionId, textId: textMember.id, imageId: imageMember.id }, { timeout: 20000 })
  // The menu has an explicit readback action; invoke it after the removal result
  // so even the lost-reply case proves current membership without a replay.
  const refreshWait = waitForApiResponse(page, origin, exactMemberPath, 'GET')
  await memberPanel.getByRole('button', { name: '核对成员', exact: true }).click()
  await refreshWait
  await page.waitForFunction(({ textId, imageId }) => {
    const text = document.querySelector(`[data-lcos-member-row="artifact:${CSS.escape(textId)}"]`)
    const image = document.querySelector(`[data-lcos-member-row="artifact:${CSS.escape(imageId)}"]`)
    const panel = document.querySelector('[data-lcos-collection-members-panel]')
    return !!panel && !text && !!image && !panel.querySelector('[role="status"]')?.textContent?.includes('核对成员…')
  }, { textId: textMember.id, imageId: imageMember.id }, { timeout: 15000 })
  const removeCounts = readMembershipCounts()
  assert.deepEqual(removeCounts, { add: 0, remove: 1 }, 'Removal may be submitted once, never retried after a lost reply.')
  const removeNotice = await memberPanel.locator('[data-lcos-collection-member-notice]').innerText()
  assert.ok(lostReply ? removeNotice.includes('已核对') : removeNotice.includes('已移出'))
  await saveScreenshot('collection-management-02-original-removal-readback', memberPanel)
  const afterRemove = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`)
  assert.deepEqual(refsOf(afterRemove), expectedAfterRefs)
  assert.deepEqual(refsOf(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(otherCollectionId)}/members`)),
    [{ type: 'artifact', id: String(textMember.id) }], 'Removing one membership must preserve the shared member in the other Collection.')
  const rawTextAfterRemove = await readRawFile(textMember.fileRecordId)
  const rawImageAfterRemove = await readRawFile(imageMember.fileRecordId)
  assert.deepEqual(rawTextAfterRemove.bytes, textBytesBefore.bytes, 'Removal deleted or rewrote the shared text FileRecord.')
  assert.deepEqual(rawImageAfterRemove.bytes, imageBytesBefore.bytes, 'Removal deleted or rewrote the image FileRecord.')
  assert.deepEqual(materialGraph(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`)), graphMaterialBefore,
    'Removing a Collection relation must not mutate or duplicate any Artifact, Revision, View or FileRecord.')
  assert.deepEqual(spatialGeometry(await readAllCanvases()), canvasGeometryBefore,
    'Collection membership removal must not change any of the three Canvas geometries or carriers.')
  assert.deepEqual((await appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`)).map((row) => String(row.id)),
    runsBefore.map((row) => String(row.id)), 'Membership removal must not create/dispatch a Run.')
  const afterRemoveCarrier = canvasNode(await readAllCanvases(), canvasId, nodeId)
  assert.deepEqual({ id: String(afterRemoveCarrier.id), type: afterRemoveCarrier.type, data: afterRemoveCarrier.data,
    position: afterRemoveCarrier.position, parentId: afterRemoveCarrier.parentId ?? null }, carrierSnapshot)

  await memberPanel.getByRole('button', { name: '收起成员列表', exact: true }).click()
  await memberPanel.waitFor({ state: 'hidden', timeout: 10000 })
  const assembly = await exposeAssembly(page, conversationId, conversationNodeId)
  const artifactCard = assembly.locator(`[data-lcos-assembly-item="${cssValue(textMember.id)}"][data-lcos-assembly-item-kind="artifact"]`)
  await artifactCard.waitFor({ state: 'visible', timeout: 20000 })
  assert.ok((await artifactCard.innerText()).includes(textMember.label), 'Original Assembly omitted the exact existing text Artifact source.')
  const carryHandle = artifactCard.locator('[data-semantic-drop-handle]')
  await carryHandle.waitFor({ state: 'visible', timeout: 10000 })
  const handleEvidence = await carryHandle.evaluate((element) => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element)
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ariaLabel: element.getAttribute('aria-label'), pointerEvents: style.pointerEvents,
      disabled: element.disabled === true, centerHitHandle: !!hit && (hit === element || element.contains(hit)) }
  })
  assert.ok(handleEvidence.rect.width > 0 && handleEvidence.rect.height > 0)
  assert.notEqual(handleEvidence.pointerEvents, 'none')
  assert.equal(handleEvidence.disabled, false)
  assert.equal(handleEvidence.centerHitHandle, true, 'The visible original Assembly carry handle must own its actual pointer hit point.')
  const exposed = await exposedCollectionPoint(page, nodeId)
  assert.ok(exposed.candidates.length > 0,
    `No unobscured physical pointer point on the exact Collection target was found; no force/drop fallback is permitted: ${JSON.stringify(exposed)}`)
  const targetPoint = exposed.candidates[0]
  await saveScreenshot('collection-management-03-assembly-source-and-exposed-collection-target', assembly)
  const sourcePoint = { x: handleEvidence.rect.x + handleEvidence.rect.width / 2,
    y: handleEvidence.rect.y + handleEvidence.rect.height / 2 }
  await page.mouse.move(sourcePoint.x, sourcePoint.y)
  await page.mouse.down()
  let pointerReleased = false
  let previewText
  let addResponse, addBody
  try {
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 16 })
    const preview = page.locator('[data-lcos-drop-preview][data-presentation="preview"]')
    await preview.waitFor({ state: 'visible', timeout: 15000 })
    previewText = await preview.innerText()
    assert.ok(previewText.includes('加入集合') && previewText.includes(collectionTitle),
      `The original drop resolver did not identify the exact canonical Collection target: ${previewText}`)
    assert.ok(previewText.includes(textMember.label), `The original Assembly payload did not identify the exact text Artifact: ${previewText}`)
    assert.deepEqual(readMembershipCounts(), { add: 0, remove: 1 }, 'No add-back may occur before physical pointer release.')
    await saveScreenshot('collection-management-04-original-drop-preview-before-release', preview)
    const addResponsePromise = waitForApiResponse(page, origin, exactMemberPath, 'POST')
    setMembershipPhase('add')
    await page.mouse.up()
    pointerReleased = true
    addResponse = await addResponsePromise
    addBody = await addResponse.json()
  } finally {
    if (!pointerReleased) await page.mouse.up().catch(() => {})
    setMembershipPhase('idle')
  }
  assert.equal(addResponse.status(), 200, JSON.stringify(addBody))
  assert.equal(addBody?.ok, true, JSON.stringify(addBody))
  assert.equal(addBody.value?.collectionId, String(collectionId))
  assert.deepEqual(addBody.value?.memberRef, { type: 'artifact', id: String(textMember.id) })
  assert.ok(['applied', 'already-member'].includes(addBody.value?.status))
  const recordedAdds = report.membershipVerification?.writes?.filter((write) => write.method === 'POST') ?? []
  assert.equal(recordedAdds.length, 1, 'Runner receipt ledger must show exactly one canonical Core add-back call.')
  assert.equal(recordedAdds[0].status, 200)
  assert.deepEqual(recordedAdds[0].response?.value?.memberRef, { type: 'artifact', id: String(textMember.id) })
  assert.equal(recordedAdds[0].response?.value?.collectionId, String(collectionId))
  const dropReceipt = page.locator('[data-lcos-drop-receipt][data-status="success"]')
  await dropReceipt.waitFor({ state: 'visible', timeout: 20000 })
  const countsAfterAdd = readMembershipCounts()
  assert.deepEqual(countsAfterAdd, { add: 1, remove: 1 }, 'Exactly one original assembly-to-Collection add-back may be submitted.')
  const membersAfterAdd = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`)
  assert.deepEqual(refsOf(membersAfterAdd), expectedBeforeRefs)
  assertMemberPreview(membersAfterAdd, textMember, 'Re-added text')
  assertMemberPreview(membersAfterAdd, imageMember, 'Retained image')
  assert.deepEqual(refsOf(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(otherCollectionId)}/members`)),
    [{ type: 'artifact', id: String(textMember.id) }])
  assert.deepEqual(await readRawFile(textMember.fileRecordId), textBytesBefore,
    'The Assembly add-back must reuse the exact existing text FileRecord bytes.')
  assert.deepEqual(await readRawFile(imageMember.fileRecordId), imageBytesBefore,
    'The retained image must keep the exact existing FileRecord bytes.')
  assert.deepEqual(materialGraph(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`)), graphMaterialBefore,
    'Add-back must restore a Collection relation, not create a second Artifact/Revision/View/FileRecord.')
  const canvasesAfterAdd = await readAllCanvases()
  assert.deepEqual(spatialGeometry(canvasesAfterAdd), canvasGeometryBefore,
    'Re-adding an existing Artifact to a Collection must not create/move/delete a Canvas carrier.')
  assert.deepEqual({ id: String(canvasNode(canvasesAfterAdd, canvasId, nodeId).id), type: canvasNode(canvasesAfterAdd, canvasId, nodeId).type,
    data: canvasNode(canvasesAfterAdd, canvasId, nodeId).data, position: canvasNode(canvasesAfterAdd, canvasId, nodeId).position,
    parentId: canvasNode(canvasesAfterAdd, canvasId, nodeId).parentId ?? null }, carrierSnapshot)
  assert.deepEqual((await appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`)).map((row) => String(row.id)),
    runsBefore.map((row) => String(row.id)), 'Collection add-back must not create/dispatch a Run.')
  await saveScreenshot('collection-management-05-original-add-back-receipt-and-readback', dropReceipt)
  await closeVisibleDropReceipt(page)

  const assemblyPane = page.locator('[data-lcos-window-pane]').filter({ has: assembly }).first()
  const closeAssembly = assemblyPane.getByRole('button', { name: '关闭窗口', exact: true })
  if (await closeAssembly.count() && await closeAssembly.isVisible()) {
    await closeAssembly.click()
    await assembly.waitFor({ state: 'hidden', timeout: 10000 })
  }
  addStep('original Collection menu removal and Assembly add-back preserve material identity', {
    collectionId, textArtifactId: String(textMember.id), imageArtifactId: String(imageMember.id),
    removeReplyStatus: deleteResponse.status(), removeProof: lostReply ? 'real Core 200 + synthetic lost reply + original readback' : 'original Core receipt',
    addReplyStatus: addResponse.status(), addStatus: addBody.value.status,
    memberCounts: countsAfterAdd, otherCollectionStillReferencesText: true,
    sourceFileBytesUnchanged: true, artifactsRevisionsViewsFileRecordsUnchanged: true,
    sameCollectionCarrierAndThreeCanvasGeometry: true, runCountUnchanged: true,
    drop: { sourceHandle: handleEvidence, targetPoint, previewText, exactOriginalDropRouter: true },
  })

  // Open the existing Collection WorkView through the now-selected original
  // node control; no shell store or window state is injected by the test.
  await closeAgentPanel(page)
  if (await collectionNode.locator('[data-lcos-native-collection-selected="true"]').count() === 0) {
    await collectionNode.click({ modifiers: ['Shift'] })
  }
  const openCollectionWindow = collectionNode.getByRole('button', { name: '打开集合工作窗口', exact: true })
  await openCollectionWindow.waitFor({ state: 'visible', timeout: 10000 })
  await openCollectionWindow.click()
  const { view: collectionView, body: collectionBody } = await waitForCollectionRows(page, collectionId, [textMember, imageMember])
  await saveScreenshot('collection-management-06-original-collection-work-view', collectionView)
  assert.equal(await collectionBody.locator('[data-lcos-collection-work-item]').count(), 2)

  const textPreviewNode = collectionBody.locator(`[data-lcos-member-preview="artifact:${cssValue(textMember.id)}"]`)
  assert.equal(await textPreviewNode.getAttribute('data-member-revision'), String(textMember.revisionId))
  const textWorkRow = textPreviewNode.locator('xpath=ancestor::*[@data-lcos-collection-work-item][1]')
  const openText = textWorkRow.getByRole('button', { name: '打开', exact: true })
  await openText.waitFor({ state: 'visible', timeout: 10000 })
  await openText.click()
  const readerWindow = page.locator(`[data-lcos-window-body="reader"][data-lcos-window-target="${cssValue(textMember.id)}"]`)
  await readerWindow.waitFor({ state: 'visible', timeout: 20000 })
  const reader = readerWindow.locator('[data-lcos-reader]')
  await reader.waitFor({ state: 'visible', timeout: 20000 })
  await reader.locator('[data-lcos-reader-content="text"]').waitFor({ state: 'visible', timeout: 20000 })
  const revisionBadge = reader.locator('[data-lcos-reader-revision-badge]')
  await revisionBadge.waitFor({ state: 'visible', timeout: 10000 })
  assert.ok((await revisionBadge.innerText()).includes('当前版本'), 'The original Reader must display the selected current revision.')
  const revisionTooltip = await revisionBadge.getAttribute('title')
  assert.ok(typeof revisionTooltip === 'string' && revisionTooltip.includes(String(textMember.revisionId)),
    'The original Reader must identify the exact Core Revision, not just the Artifact title.')
  const textContent = reader.locator('[data-lcos-reader-content="text"]')
  const readerText = await textContent.innerText()
  assert.ok(readerText.trim().length > 0)
  const fileTextLines = visibleMarkdownLines(textBytesBefore.bytes)
  assert.ok(fileTextLines.length > 0, 'The source FileRecord must contain readable UTF-8 text.')
  for (const line of fileTextLines) assert.ok(readerText.includes(line),
    `The original Reader did not render source FileRecord text line: ${line}`)
  await saveScreenshot('collection-management-07-original-text-reader', reader)
  // A reader-only Region renders its LcosWindowChrome beside (not inside) the
  // pane. RetainedReaderBody portals the body into the pane's reader slot, so
  // the owning close control is the nearest Stage Region, not the pane.
  const readerRegion = readerWindow.locator('xpath=ancestor::*[@data-lcos-window-region-id][1]')
  await readerRegion.waitFor({ state: 'visible', timeout: 10000 })
  const closeReader = readerRegion.getByRole('button', { name: '关闭窗口', exact: true })
  await closeReader.waitFor({ state: 'visible', timeout: 10000 })
  await closeReader.click()
  await readerWindow.waitFor({ state: 'hidden', timeout: 10000 })
  await collectionView.waitFor({ state: 'visible', timeout: 10000 })

  const galleryButton = collectionView.getByRole('button', { name: '图片浏览（1）', exact: true })
  await galleryButton.waitFor({ state: 'visible', timeout: 10000 })
  await galleryButton.click()
  const gallery = collectionView.getByRole('region', { name: '集合图片浏览', exact: true })
  await gallery.waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await gallery.innerText().then((text) => text.includes('1 张图片')), true)
  const imageDetail = gallery.locator(`[data-lcos-media-result="${cssValue(imageMember.id)}"]`)
  await imageDetail.waitFor({ state: 'visible', timeout: 10000 })
  const imageGalleryPreview = imageDetail.locator(`[data-lcos-member-preview="artifact:${cssValue(imageMember.id)}"]`)
  await imageGalleryPreview.waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await imageGalleryPreview.getAttribute('data-member-revision'), String(imageMember.revisionId))
  await page.waitForFunction((id) => {
    const gallery = document.querySelector('[aria-label="集合图片浏览"]')
    const detail = gallery?.querySelector(`[data-lcos-media-result="${CSS.escape(id)}"]`)
    const preview = detail?.querySelector(`[data-lcos-member-preview="artifact:${CSS.escape(id)}"]`)
    const image = preview?.querySelector('img')
    return preview?.getAttribute('data-preview-state') === 'available' && image?.complete
      && image.naturalWidth > 0 && image.naturalHeight > 0
  }, String(imageMember.id), { timeout: 20000 })
  const imageLoadEvidence = await imageGalleryPreview.locator('img').evaluate((image) => ({
    complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    sourceProtocol: new URL(image.currentSrc).protocol,
  }))
  assert.equal(imageLoadEvidence.complete, true, 'Collection image preview must finish decoding its real FileRecord bytes.')
  assert.ok(imageLoadEvidence.naturalWidth > 0 && imageLoadEvidence.naturalHeight > 0,
    `Collection image preview has no decoded pixel dimensions: ${JSON.stringify(imageLoadEvidence)}`)
  assert.equal(imageLoadEvidence.sourceProtocol, 'blob:',
    'The original Collection preview should render the Core FileRecord Blob, not an unrelated URL.')
  await saveScreenshot('collection-management-08-original-image-gallery', gallery)

  const afterReaderGraph = materialGraph(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`))
  assert.deepEqual(afterReaderGraph, graphMaterialBefore, 'Opening Reader/gallery must not create or revise source material.')
  assert.deepEqual(spatialGeometry(await readAllCanvases()), canvasGeometryBefore,
    'Reader and Gallery interaction must not write Canvas geometry.')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api?.getNodes, null, { timeout: 30000 })
  await page.locator('.react-flow').waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 30000 })
  await closeAgentPanel(page)
  const reloadedCanvas = await appFacadeCall(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  const reloadedNode = reloadedCanvas.nodes.find((node) => String(node.id) === String(nodeId))
  assert.ok(reloadedNode, 'The original Collection carrier must survive browser reload.')
  assertCollectionCarrier(reloadedNode, { projectId, canvasId, workspaceId, collectionId })
  assert.deepEqual({ id: String(reloadedNode.id), type: reloadedNode.type, data: reloadedNode.data,
    position: reloadedNode.position, parentId: reloadedNode.parentId ?? null }, carrierSnapshot)
  const reloadedCollectionNode = page.locator(`.react-flow__node[data-id="${cssValue(nodeId)}"]`)
  await reloadedCollectionNode.waitFor({ state: 'visible', timeout: 15000 })
  if (await reloadedCollectionNode.locator('[data-lcos-native-collection-selected="true"]').count() === 0) {
    await reloadedCollectionNode.click({ modifiers: ['Shift'] })
  }
  const reopenedButton = reloadedCollectionNode.getByRole('button', { name: '打开集合工作窗口', exact: true })
  await reopenedButton.waitFor({ state: 'visible', timeout: 10000 })
  await reopenedButton.click()
  const reloadedView = page.locator(`[data-lcos-window-body="collection"][data-lcos-window-target="${cssValue(collectionId)}"]`)
  const { body: reloadedBody } = await waitForCollectionRows(page, collectionId, [textMember, imageMember])
  await reloadedView.waitFor({ state: 'visible', timeout: 10000 })
  assert.deepEqual(refsOf(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`)), expectedBeforeRefs,
    'Core Collection membership must still read back after full native page reload.')
  assert.deepEqual(refsOf(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(otherCollectionId)}/members`)),
    [{ type: 'artifact', id: String(textMember.id) }])
  assert.deepEqual(materialGraph(await appCoreCall(`/projects/${encodeURIComponent(projectId)}/graph`)), graphMaterialBefore)
  assert.deepEqual(await readRawFile(textMember.fileRecordId), textBytesBefore)
  assert.deepEqual(await readRawFile(imageMember.fileRecordId), imageBytesBefore)
  const finalCanvases = await readAllCanvases()
  assert.deepEqual(spatialGeometry(finalCanvases), canvasGeometryBefore)
  const finalCounts = readMembershipCounts()
  assert.deepEqual(finalCounts, { add: 1, remove: 1 })
  const projection = await appFacadeCall(`/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/projection`)
  assert.equal(String(projection.canvas_id), String(canvasId))
  assert.equal(String(projection.collection_id), String(collectionId))
  assert.equal(String(projection.binding?.spatialId), String(nodeId))
  assert.equal(String(projection.node?.id), String(nodeId))
  assert.deepEqual(projection.node?.data?.lcos_collection_ref, reloadedNode.data.lcos_collection_ref)
  const runsAfter = await appCoreCall(`/projects/${encodeURIComponent(projectId)}/runs`)
  assert.deepEqual(runsAfter.map((row) => String(row.id)), runsBefore.map((row) => String(row.id)))
  await saveScreenshot('collection-management-09-original-work-view-after-reload', reloadedView)
  addStep('original Collection WorkView, Reader, image Gallery and reload read the same canonical members', {
    collectionId, textArtifactId: String(textMember.id), textRevisionId: String(textMember.revisionId),
    imageArtifactId: String(imageMember.id), imageRevisionId: String(imageMember.revisionId),
    workViewRows: await reloadedBody.locator('[data-lcos-collection-work-item]').count(),
    textReader: { exactArtifactId: String(textMember.id), exactRevisionId: String(textMember.revisionId),
      fileRecordId: String(textMember.fileRecordId), fileByteLength: textBytesBefore.bytes.length,
      sourceTextLinesRendered: fileTextLines.length, contentKind: 'text' },
    imageGallery: { exactArtifactId: String(imageMember.id), exactRevisionId: String(imageMember.revisionId),
      fileRecordId: String(imageMember.fileRecordId), fileByteLength: imageBytesBefore.bytes.length,
      decode: imageLoadEvidence, renderedImage: true },
    reloadedCarrierId: String(projection.node.id), bindingIdentity: projection.binding,
    otherCollectionStillReferencesText: true, sourceFileBytesUnchanged: true,
    allThreeCanvasGeometriesUnchanged: true, providerExecution: false, runCountUnchanged: true,
  })
  report.membershipVerification ??= {}
  report.membershipVerification.originalUi = {
    sequence: ['selected-native-collection-node', 'original-members-menu-remove', 'original-assembly-carry-add',
      'original-collection-work-view', 'original-text-reader', 'original-image-gallery', 'browser-reload-readback'],
    menu: { exactCollectionId: String(collectionId), textMemberRemovedOnce: true, imageMemberRetained: true,
      removalReadback: lostReply ? 'receipt-lost; original UI performed Core readback without replay' : 'Core positive receipt + explicit menu refresh' },
    readd: { source: 'original Assembly artifact carry handle', exactMemberRef: { type: 'artifact', id: String(textMember.id) },
      targetNodeId: String(nodeId), realPointerRelease: true, coreReceipt: addBody.value },
    workView: { targetCollectionId: String(collectionId), rows: expectedBeforeRefs },
    reader: { artifactId: String(textMember.id), revisionId: String(textMember.revisionId),
      fileRecordId: String(textMember.fileRecordId), fileByteLength: textBytesBefore.bytes.length,
      sourceTextLinesRendered: fileTextLines.length, contentKind: 'text' },
    gallery: { artifactId: String(imageMember.id), revisionId: String(imageMember.revisionId),
      fileRecordId: String(imageMember.fileRecordId), fileByteLength: imageBytesBefore.bytes.length,
      decode: imageLoadEvidence, rendered: true },
    finalMembershipCounts: finalCounts, collectionProjection: projection,
    sourcesAndCanvasesUnchanged: true, providerExecution: false,
  }
}
