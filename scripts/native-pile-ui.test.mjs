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
