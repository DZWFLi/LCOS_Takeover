import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs'

const runtimeBase = path.resolve('.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtime = await mkdtemp(path.join(runtimeBase, 'native-pile-folder-test-'))
let dom
let root

try {
  const output = path.join(runtime, 'native-pile-folder.js')
  await buildPilotEntry('lab/pilot/native-pile-folder.tsx', output, 'browser', { nativeReact: true })
  const bundle = await readFile(output, 'utf8')

  const appRequire = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'))
  const react = appRequire('react')
  const reactUrl = pathToFileURL(appRequire.resolve('react')).href
  const jsxRuntimeUrl = pathToFileURL(appRequire.resolve('react/jsx-runtime')).href
  const { Window } = appRequire('happy-dom')
  dom = new Window({ url: 'http://127.0.0.1:32123/' })
  dom.matchMedia = query => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  })
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    Node: dom.Node,
    MouseEvent: dom.MouseEvent,
    PointerEvent: dom.PointerEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  let explicitFetchCalls = 0
  const fetchSpy = async () => {
    explicitFetchCalls += 1
    return new Response('', { status: 204 })
  }
  globalThis.fetch = fetchSpy
  dom.fetch = fetchSpy

  const adaptedBundle = bundle
    .replaceAll('"/lcos/native-react.js"', JSON.stringify(reactUrl))
    .replaceAll('"/lcos/native-jsx-runtime.js"', JSON.stringify(jsxRuntimeUrl))
  assert.doesNotMatch(adaptedBundle, /"\/lcos\/native-(?:react|jsx-runtime)\.js"/,
    'the test adapter resolves the existing nativeReact externals to the installed React runtime')
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(adaptedBundle).toString('base64')}`
  const { NativePileFolderFace } = await import(moduleUrl)
  assert.equal(typeof NativePileFolderFace, 'function', 'nativeReact browser build exports a renderable React component')

  const { createRoot } = appRequire('react-dom/client')
  const { act } = react
  const validRef = {
    version: 1, entityType: 'artifact', entityId: 'artifact-image', artifactId: 'artifact-image',
    artifactViewId: 'view-image', revisionId: 'revision-image',
  }
  const image = {
    id: 'native-image', type: 'image',
    data: { lcos_ref: validRef, title: '实拍样片', src: 'http://127.0.0.1:32123/api/surface-core/file-records/import-file-123/content' },
  }
  const text = {
    id: 'native-text', type: 'text',
    data: { lcos_ref: { ...validRef, entityId: 'view-image', entityType: 'view' }, title: '拍摄说明', prompt: '仅纯文本预览 <script>不能执行</script>' },
  }
  const artifactImage = {
    id: 'native-image-2', type: 'image',
    data: { lcos_ref: { ...validRef, artifactId: 'artifact-image-2', entityId: 'artifact-image-2' }, src: '/api/canvas/canvas-1/artifact/real-image.png' },
  }
  const fourth = {
    id: 'fourth-text', type: 'text',
    data: { lcos_ref: { ...validRef, artifactId: 'artifact-four', entityId: 'artifact-four' }, content: '不应进入前三张卡片' },
  }

  const container = dom.document.createElement('div')
  dom.document.body.append(container)
  let bubbledClicks = 0
  root = createRoot(container)
  const render = async props => act(async () => {
    root.render(react.createElement('div', { onClick: () => { bubbledClicks += 1 } },
      react.createElement(NativePileFolderFace, props)))
  })

  await render({ nodeId: 'pile-1', title: 'Core Collection', members: [image, text, artifactImage, fourth], selected: true, canvasId: 'canvas-1' })
  let face = container.querySelector('.native-pile-folder')
  assert.ok(face, 'folder face renders into the real DOM')
  assert.equal(face.dataset.nativePileFolderSelected, 'true')
  assert.equal(face.dataset.nativePileFolderOpen, 'false', 'selection does not open the local preview')
  assert.equal(face.querySelectorAll('[data-slot="folder-card"]').length, 3, 'the original Folder renders its three source card frames')
  assert.equal(face.querySelectorAll('.native-pile-folder__image-preview').length, 2, 'two valid managed image previews render')
  assert.deepEqual([...face.querySelectorAll('[data-native-folder-member]')].map(node => node.getAttribute('data-native-folder-member')),
    ['native-image', 'native-text', 'native-image-2'], 'each preview is marked with the exact native member node id')
  assert.equal(face.querySelector('.native-pile-folder__image-preview').getAttribute('src'),
    '/api/surface-core/file-records/import-file-123/content', 'same-origin Core FileRecord route is kept relative and managed')
  assert.equal(face.querySelectorAll('.native-pile-folder__image-preview')[1].getAttribute('src'),
    '/api/canvas/canvas-1/artifact/real-image.png', 'native artifact routes stay scoped to the supplied Canvas id')
  assert.equal(face.querySelectorAll('.native-pile-folder__text-preview').length, 1)
  assert.match(face.querySelector('.native-pile-folder__text-preview').textContent, /仅纯文本预览 <script>不能执行<\/script>/)
  assert.equal(face.querySelector('script'), null, 'text content is rendered as text, never parsed as markup')
  assert.equal(face.querySelector('[contenteditable]'), null, 'text previews cannot edit native content')
  assert.equal(face.textContent.includes('不应进入前三张卡片'), false, 'members after the first three never enter the Folder')
  assert.equal(face.querySelector('button'), null, 'the leaf adds no click target or Gallery control')
  assert.equal(face.querySelector('.lcos-context-collection-hit'), null, 'controlled open suppresses the source transparent hit target')
  assert.equal(face.querySelector('.nodrag, .nopan'), null, 'the leaf leaves the original Pile drag surface intact')
  assert.equal(explicitFetchCalls, 0, 'mounting local previews performs no JavaScript fetch')
  await act(async () => face.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  assert.equal(bubbledClicks, 1, 'face clicks continue bubbling to the original Gallery owner')

  await render({ nodeId: 'pile-1', title: 'Core Collection', members: [image], open: true, canvasId: 'canvas-1' })
  face = container.querySelector('.native-pile-folder')
  assert.equal(face.dataset.nativePileFolderOpen, 'true', 'the host-controlled open prop opens the local Folder presentation')
  assert.equal(face.querySelectorAll('.native-pile-folder__image-preview').length, 1, 'a one-member collection remains visible')
  assert.equal(face.dataset.nativePileFolderSelected, 'false')
  assert.equal(explicitFetchCalls, 0, 'host-controlled open only changes local presentation and performs no JavaScript fetch')

  await render({ nodeId: 'pile-1', title: 'Core Collection', members: [image], open: false, canvasId: 'canvas-1' })
  face = container.querySelector('.native-pile-folder')
  assert.equal(face.dataset.nativePileFolderOpen, 'false', 'the host can close the local Folder presentation')
  assert.equal(explicitFetchCalls, 0, 'closing remains a local presentation update')

  await render({ nodeId: 'pile-empty', title: '空集合', members: [], open: false })
  face = container.querySelector('.native-pile-folder')
  assert.ok(face, 'a zero-member collection keeps its folder face')
  assert.equal(face.querySelectorAll('.native-pile-folder__image-preview, .native-pile-folder__text-preview').length, 0,
    'an empty collection does not fabricate preview content')

  const unsafe = {
    id: 'unsafe-image', type: 'image',
    data: { lcos_ref: validRef, title: '外部图', src: 'https://external.example/remote.png' },
  }
  const arbitraryRoute = {
    id: 'arbitrary-image', type: 'image',
    data: { lcos_ref: validRef, title: '非管理路由', src: '/api/unmanaged/image.png' },
  }
  const bareKey = { id: 'bare-key-image', type: 'image', data: { lcos_ref: validRef, src: 'real-image.png' } }
  const noCoreRef = { id: 'unbound-image', type: 'image', data: { src: '/api/surface-core/file-records/import-file-123/content' } }
  await render({ nodeId: 'pile-unsafe', title: '安全预览', members: [unsafe, arbitraryRoute, bareKey, noCoreRef], canvasId: 'canvas-1' })
  face = container.querySelector('.native-pile-folder')
  assert.equal(face.querySelectorAll('img').length, 0, 'external, arbitrary same-origin, bare-key, and unbound sources fail closed')

  const wrongCanvas = {
    id: 'wrong-canvas-image', type: 'image',
    data: { lcos_ref: validRef, src: '/api/canvas/other-canvas/artifact/real-image.png' },
  }
  await render({ nodeId: 'pile-wrong-canvas', title: '其他画布', members: [wrongCanvas], canvasId: 'canvas-1' })
  face = container.querySelector('.native-pile-folder')
  assert.equal(face.querySelector('img'), null, 'Canvas artifact paths must match the host current Canvas id')

  console.log('PASS native-pile-folder: nativeReact build, React DOM mount, host-controlled open, selection independence, click bubbling, zero/one members, top-three cap, text-only preview, managed-source allowlist')
} finally {
  if (root) {
    const { act } = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'))('react')
    await act(async () => root.unmount())
  }
  if (dom) await dom.happyDOM.abort()
  const target = path.resolve(runtime)
  assert.ok(target.startsWith(path.resolve(runtimeBase) + path.sep)
    && path.basename(target).startsWith('native-pile-folder-test-'), 'cleanup is restricted to this test temp folder')
  await rm(target, { recursive: true, force: true })
}
