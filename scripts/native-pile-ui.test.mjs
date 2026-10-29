import assert from 'node:assert/strict'
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const base = path.resolve('.runtime')
await mkdir(base, { recursive: true })
const runtime = await mkdtemp(path.join(base, 'native-pile-ui-'))
try {
  const output = path.join(runtime, 'pure.mjs')
  await buildPilotEntry('lab/pilot/native-pile-ui.tsx', output)
  const { LCOSNativePileDisplay, LCOSNativePileOperation, LCOSNativePileTitleReadonly, LCOSNativePileChangeGuardNodes,
    LCOSNativePileCanonicalChanges } = await import(pathToFileURL(output).href)
  const ref = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', collectionId: 'collection' }
  const pile = { id: 'pile', type: 'pile', data: { id: 'pile', lcos_native_collection: true,
    lcos_collection_ref: ref, memberIds: ['image', 'text'] } }
  const frame = { id: 'frame', type: 'group', position: { x: 10, y: 20 },
    data: { lcosCollectionId: ref.collectionId, lcosCollectionNodeId: pile.id } }
  const image = { id: 'image', type: 'image', parentId: 'frame', position: { x: 20, y: 20 }, data: { src: '/exact' } }
  const text = { id: 'text', type: 'text', parentId: 'frame', position: { x: 240, y: 20 }, data: { text: '# Exact' } }
  const source = [pile, frame, image, text]
  const anchoredImage = { ...image, parentId: undefined, className: 'pile-member-anchor', position: { x: 1, y: 1 }, draggable: false }
  const anchoredText = { ...text, parentId: undefined, className: 'pile-member-anchor', position: { x: 1, y: 1 }, draggable: false }
  const display = [pile, frame, anchoredImage, anchoredText]
  const before = structuredClone(source)
  const result = LCOSNativePileDisplay(source, display)
  assert.equal(result[0], pile)
  assert.equal(result[1], frame)
  assert.equal(result[2], image, 'the original editable image is restored to its actual native Group parent')
  assert.equal(result[3], text, 'the original text renderer/data is kept, not replaced by GN2 body')
  assert.deepEqual(source, before, 'display repair cannot mutate geometry or Core member projection')
  const ordinaryPile = { ...pile, data: { memberIds: ['image', 'text'] } }
  assert.equal(LCOSNativePileDisplay([ordinaryPile, image], display), display, 'ordinary native Piles are exact pass-through')
  assert.equal(LCOSNativePileOperation('unpile', [ordinaryPile], 'pile'), false, 'ordinary original actions retain their handler')
  assert.equal(LCOSNativePileTitleReadonly(pile), true)
  assert.equal(LCOSNativePileTitleReadonly(ordinaryPile), false)
  assert.equal(LCOSNativePileTitleReadonly({ ...frame, data: { ...frame.data, id: frame.id, lcos_collection_ref: ref } }), true)
  assert.equal(LCOSNativePileTitleReadonly(frame), false, 'an ordinary Group keeps its native title editor')
  assert.equal(LCOSNativePileTitleReadonly({ ...pile, data: { ...pile.data, id: 'different' } }), false)
  const foreignFrame = { ...frame, data: { ...frame.data, lcosCollectionId: 'other-collection' } }
  assert.equal(LCOSNativePileDisplay([pile, foreignFrame, image], display), display, 'a different Collection frame cannot expose these members')
  const free = { ...image, parentId: undefined }
  assert.equal(LCOSNativePileDisplay([pile, frame, free, text], display)[2], anchoredImage,
    'a free or differently-parented node is not stolen into a native Collection Group')

  const coreRef = { version: 1, entityType: 'artifact', entityId: 'artifact-image', artifactId: 'artifact-image',
    artifactViewId: 'view-image', revisionId: 'revision-image' }
  const material = { ...image, parentId: undefined, data: { ...image.data, lcos_ref: coreRef } }
  const carryDisplay = LCOSNativePileDisplay([pile, material], [pile, anchoredImage])
  assert.equal(carryDisplay[1], material, 'Core membership must not hide or relocate a right-carry source')
  assert.deepEqual(material.position, image.position)
  const nativePhysicalPile = { id: 'physical-pile', type: 'pile', data: { memberIds: ['image'] } }
  assert.equal(LCOSNativePileDisplay([pile, nativePhysicalPile, material], [pile, nativePhysicalPile, anchoredImage])[2],
    anchoredImage, 'an actual ordinary Pile retains physical ownership even if a Core Collection references the same material')

  const coreGroup = { ...frame, data: { ...frame.data, id: frame.id, lcos_collection_ref: ref } }
  const expandedMaterial = { ...material, parentId: coreGroup.id, position: { x: 20, y: 20 } }
  const opening = [{ type: 'add', item: coreGroup }, { type: 'replace', id: material.id, item: expandedMaterial }]
  const rawBeforeOpen = [pile, material]
  const rawBeforeCopy = structuredClone(rawBeforeOpen)
  const guard = LCOSNativePileChangeGuardNodes(opening, rawBeforeOpen)
  assert.deepEqual(guard[0].data.memberIds, ['text'], 'only exact staged Group member loses its ordinary Pile geometry protection')
  assert.equal(guard[1], material, 'the helper supplies only a Ri lookup input, not replacement editable nodes')
  assert.deepEqual(rawBeforeOpen, rawBeforeCopy, 'Core Pile/member changes and true memberIds are immutable')
  assert.deepEqual(LCOSNativePileChangeGuardNodes([{ type: 'position', id: material.id }, { type: 'select', id: material.id }],
    [pile, coreGroup, expandedMaterial])[0].data.memberIds, ['text'], 'existing native Group members remain editable through original node changes')
  assert.equal(LCOSNativePileChangeGuardNodes(opening, [ordinaryPile, material])[0], ordinaryPile)
  const foreignOpen = [{ type: 'add', item: { ...coreGroup, data: { ...coreGroup.data,
    lcos_collection_ref: { ...ref, canvasId: 'other-canvas' } } } }, opening[1]]
  assert.equal(LCOSNativePileChangeGuardNodes(foreignOpen, rawBeforeOpen), rawBeforeOpen)
  const wrongRevision = [{ ...opening[0] }, { ...opening[1], item: { ...expandedMaterial,
    data: { ...expandedMaterial.data, lcos_ref: { ...coreRef, revisionId: 'forged' } } } }]
  assert.equal(LCOSNativePileChangeGuardNodes(wrongRevision, rawBeforeOpen), rawBeforeOpen)

  // Main has one independent image referenced by several collapsed semantic
  // Collections. Its native display is visible, so Ri's temporary protection
  // lookup must not treat the many-to-many references as physical ownership.
  {
    const independent = { ...material, data: { ...material.data, id: material.id } }
    const semanticPiles = ['semantic-a', 'semantic-b', 'semantic-c'].map((id, index) => ({
      ...pile, id, data: { ...pile.data, id, memberIds: [independent.id],
        lcos_collection_ref: { ...ref, collectionId: `collection-${index}` } },
    }))
    const freeNodes = [...semanticPiles, independent]
    const freeChanges = [
      { type: 'position', id: independent.id, position: { x: 110, y: 120 }, dragging: true },
      { type: 'select', id: independent.id, selected: true },
      { type: 'dimensions', id: independent.id, dimensions: { width: 488, height: 325 } },
    ]
    const nodesBefore = structuredClone(freeNodes), changesBefore = structuredClone(freeChanges)
    const freeGuard = LCOSNativePileChangeGuardNodes(freeChanges, freeNodes)
    for (const original of semanticPiles) {
      assert.deepEqual(freeGuard.find(node => node.id === original.id).data.memberIds, [],
        'each collapsed Core Collection reference is removed only from the temporary Ri protection lookup')
      assert.deepEqual(original.data.memberIds, [independent.id], 'canonical membership remains unchanged')
    }
    assert.equal(freeGuard.at(-1), independent, 'the actual editable material is never replaced by a guard clone')
    assert.deepEqual(freeNodes, nodesBefore)
    assert.deepEqual(freeChanges, changesBefore)

    const viewMember = { ...independent, data: { ...independent.data,
      lcos_ref: { ...coreRef, entityType: 'view', entityId: coreRef.artifactViewId } } }
    const viewGuard = LCOSNativePileChangeGuardNodes(freeChanges, [...semanticPiles, viewMember])
    assert.ok(viewGuard.filter(node => node.type === 'pile').every(node => !node.data.memberIds.includes(independent.id)),
      'an independent exact View occurrence is just as editable as an Artifact-bound occurrence')

    const physical = { ...nativePhysicalPile, data: { ...nativePhysicalPile.data } }
    const physicalInput = [...semanticPiles, physical, independent]
    const physicalBefore = structuredClone(physicalInput)
    const physicalGuard = LCOSNativePileChangeGuardNodes(freeChanges, physicalInput)
    assert.equal(physicalGuard.find(node => node.id === physical.id), physical,
      'ordinary physical Pile protection retains its original lookup object')
    assert.deepEqual(physicalGuard.find(node => node.id === physical.id).data.memberIds, [independent.id])
    assert.deepEqual(physicalInput, physicalBefore)

    for (const parent of [{ parentId: 'foreign-group' }, { parent_id: 'foreign-group' }]) {
      const foreign = { ...independent, ...parent }
      const protectedNodes = [...semanticPiles, foreign]
      const protectedGuard = LCOSNativePileChangeGuardNodes(freeChanges, protectedNodes)
      assert.ok(protectedGuard.filter(node => node.type === 'pile').every(node => node.data.memberIds.includes(independent.id)),
        'an unknown parent is not treated as independent material')
    }
    const changedIdentity = { ...independent, data: { ...independent.data,
      lcos_ref: { ...coreRef, revisionId: 'another-revision' } } }
    const replacing = [...freeChanges, { type: 'replace', id: independent.id, item: changedIdentity }]
    const replacedGuard = LCOSNativePileChangeGuardNodes(replacing, freeNodes)
    assert.ok(replacedGuard.filter(node => node.type === 'pile').every(node => node.data.memberIds.includes(independent.id)),
      'a lifecycle replacement that changes identity cannot borrow the free-material geometry exception')
    assert.deepEqual(freeNodes, nodesBefore)
  }
  const observerChanges = [{ id: pile.id, type: 'dimensions', dimensions: { width: 375, height: 250 } }]
  const observedCopy = structuredClone(observerChanges)
  assert.deepEqual(LCOSNativePileCanonicalChanges(observerChanges, [pile]), [], 'derived Pile fan measurement is not canonical geometry')
  assert.deepEqual(observerChanges, observedCopy)
  assert.equal(LCOSNativePileCanonicalChanges(observerChanges, [ordinaryPile]), observerChanges, 'ordinary native Pile measurement is unchanged')
  for (const explicit of [{ setAttributes: true }, { setAttributes: 'width' }, { resizing: true }]) {
    const resize = [{ ...observerChanges[0], ...explicit }]
    assert.equal(LCOSNativePileCanonicalChanges(resize, [pile]), resize, 'explicit authoring resize remains on its original path')
  }
  const materialMeasure = [{ id: material.id, type: 'dimensions', dimensions: { width: 360, height: 240 } }]
  assert.equal(LCOSNativePileCanonicalChanges(materialMeasure, [material]), materialMeasure)

  const savedPile = { ...pile, position: { x: 30, y: 40 }, measured: { width: 250, height: 146 } }
  let projections = 0
  const displayPile = nodes => { projections++; return nodes.map(node => node.type === 'pile'
    ? { ...node, position: { x: node.position.x - 35, y: node.position.y - 52 } } : node) }
  const firstPointer = { type: 'position', id: pile.id, position: { x: 95, y: 188 }, dragging: true }
  const pointerBefore = structuredClone(firstPointer), savedBefore = structuredClone(savedPile)
  const firstCanonical = LCOSNativePileCanonicalChanges([firstPointer], [savedPile], displayPile)[0]
  assert.deepEqual(firstCanonical.position, { x: 130, y: 240 }, 'first drag frame preserves the original center offset')
  const nextPile = { ...savedPile, position: firstCanonical.position }
  const lastPointer = { ...firstPointer, position: { x: 145, y: 288 }, positionAbsolute: { x: 1145, y: 2288 } }
  const lastCanonical = LCOSNativePileCanonicalChanges([lastPointer], [nextPile], displayPile)[0]
  assert.deepEqual(lastCanonical.position, { x: 180, y: 340 }, 'later frames use the current original display, without accumulating offsets')
  assert.deepEqual(lastCanonical.positionAbsolute, { x: 1180, y: 2340 })
  const released = LCOSNativePileCanonicalChanges([{ ...lastPointer, dragging: false }],
    [{ ...savedPile, position: lastCanonical.position }], displayPile)[0]
  assert.deepEqual(released.position, lastCanonical.position, 'mouseup with the same pointer position cannot jump again')
  const endOnly = [{ type: 'position', id: pile.id, dragging: false }]
  assert.equal(LCOSNativePileCanonicalChanges(endOnly, [savedPile], displayPile), endOnly)
  assert.equal(projections, 3, 'selection, observer and position-free events do not invoke the original projection')
  const mismatchedDisplay = nodes => displayPile(nodes).map(node => ({ ...node, data: { ...node.data,
    lcos_collection_ref: { ...ref, collectionId: 'another' } } }))
  assert.equal(LCOSNativePileCanonicalChanges([firstPointer], [savedPile], mismatchedDisplay)[0], firstPointer,
    'another Collection cannot supply a display offset')
  assert.equal(LCOSNativePileCanonicalChanges([firstPointer], [savedPile], nodes => [...nodes, ...nodes])[0], firstPointer)
  assert.equal(LCOSNativePileCanonicalChanges([firstPointer], [{ ...savedPile, data: ordinaryPile.data }], displayPile)[0], firstPointer)
  assert.deepEqual(firstPointer, pointerBefore)
  assert.deepEqual(savedPile, savedBefore, 'pointer conversion never mutates the canonical input')

  const browser = path.join(runtime, 'browser.js')
  await buildPilotEntry('lab/pilot/native-pile-ui.tsx', browser, 'browser', { nativeReact: true })
  const bundle = await readFile(browser, 'utf8')
  const sourceText = await readFile('lab/pilot/native-pile-ui.tsx', 'utf8')
  assert.doesNotMatch(bundle, /CollectionNodePresentation|Gen1CollectionFace|CanonicalCollectionView|react-dom\/client/)
  assert.match(sourceText, /<NativeRenderer \{\.\.\.renderedProps\} \/>/)
  assert.doesNotMatch(sourceText, /<NativeToolbar |<form |setPanel|background: '#222'/)
  assert.match(sourceText, /lcosCollectionTools: tools/)
  assert.match(sourceText, /<NativeTitle /)
  assert.match(sourceText, /synchronizeCollectionCarrier/)
  assert.doesNotMatch(sourceText, /updateNodeData\(|setNodes\(|localStorage|indexedDB/)
  console.log(JSON.stringify({ passed: true, scope: 'pure display/ordinary-action fallback + real UI bundle/source checks, not GUI',
    originalRendererAndToolbar: true, originalMembersAndParents: true, ordinaryPileExactFallback: true,
    collectionIdentityRequired: true, copiedGn2CollectionBody: false, secondCanvasOrHistory: false }))
} finally {
  const target = path.resolve(runtime)
  assert.ok(target.startsWith(base + path.sep) && path.basename(target).startsWith('native-pile-ui-'))
  await rm(target, { recursive: true, force: true })
}
