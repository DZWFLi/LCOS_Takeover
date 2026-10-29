import { pathToFileURL } from 'node:url'
import fs from 'node:fs'

const LAB = 'E:/Codex 项目/LCOS夺舍计划_20261013/lab/'
const ASSET = 'E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js'
const NAME = 'course-api-base-url-CifxI1ia.js'

const imp = async f => import(pathToFileURL(LAB + f).href)

const flags = {
  takeover: true,
  cut: true,
  fullIntegration: true,
  surfaceCore: true,
  nodes: true,
  nativeRailPilot: process.argv.includes('--rail'),
  nativeAssemblyPilot: process.argv.includes('--assembly') || process.argv.includes('--rail'),
  nativeTextPilot: process.argv.includes('--text') || process.argv.includes('--assembly') || process.argv.includes('--rail'),
  nativeCollectionPilot: process.argv.includes('--collection') || process.argv.includes('--text') || process.argv.includes('--assembly') || process.argv.includes('--rail')
}
console.log('flags:', JSON.stringify(flags))

const original = fs.readFileSync(ASSET, 'utf8')
let src = original
const steps = []

async function step(label, fn) {
  try {
    const out = await fn(src)
    if (typeof out !== 'string') throw new Error('not a string: ' + typeof out)
    const delta = out.length - src.length
    src = out
    steps.push({ label, ok: true, delta })
    console.log(`  OK   ${label.padEnd(46)} ${delta >= 0 ? '+' : ''}${delta} B`)
  } catch (e) {
    steps.push({ label, ok: false, error: e.message })
    console.log(`  FAIL ${label.padEnd(46)} ${e.message}`)
    throw e
  }
}

try {
  const startup = await imp('startup-transform.mjs')
  await step('startup.transformRendererScript', s => startup.transformRendererScript(NAME, s))

  const cutMod = await imp('cut-transform.mjs')
  await step('cut.transformCutScript', s => cutMod.transformCutScript(NAME, s))

  const nodeMod = await imp('node-transform.mjs')
  await step('node.transformNodeBridgeScript', s => nodeMod.transformNodeBridgeScript(NAME, s))

  const dockMod = await imp('surface-dock-transform.mjs')
  await step('surfaceDock.transformSurfaceDockScript', s => dockMod.transformSurfaceDockScript(NAME, s))

  const historyIntent = await imp('history-intent-transform.mjs')
  await step('historyIntent.transformHistoryIntentScript', s => historyIntent.transformHistoryIntentScript(NAME, s))

  const chatMsgs = await imp('native-chat-messages-transform.mjs')
  await step('chatMessages.transformNativeChatMessagesScript', s => chatMsgs.transformNativeChatMessagesScript(NAME, s))

  const chatActs = await imp('native-chat-actions-transform.mjs')
  await step('chatActions.transformNativeChatActionsScript', s => chatActs.transformNativeChatActionsScript(NAME, s))

  const chatFrame = await imp('native-chat-frame-transform.mjs')
  await step('chatFrame.transformNativeChatFrameScript', s => chatFrame.transformNativeChatFrameScript(NAME, s))

  const composer = await imp('native-composer-source-transform.mjs')
  await step('composer.transformNativeComposerFrame', s => composer.transformNativeComposerFrame(NAME, s))

  const agent = await imp('agent-node-transform.mjs')
  await step('agent.transformAgentNodeScript', s => agent.transformAgentNodeScript(NAME, s))

  const textCreate = await imp('native-project-text-create-transform.mjs')
  await step('defaultTextPlacement', s => textCreate.transformNativeDefaultTextPlacementScript(NAME, s))

  if (flags.nativeTextPilot) {
    const t1 = await imp('native-text-first-transform.mjs')
    await step('textFirst.transformNativeFirstTextScript', s => t1.transformNativeFirstTextScript(NAME, s))
  } else if (flags.fullIntegration && !flags.nativeCollectionPilot) {
    const tt = await imp('native-text-transform.mjs')
    await step('nativeText.transformNativeTextScript', s => tt.transformNativeTextScript(NAME, s))
  } else {
    console.log('  --   跳过 text transform（collection pilot 模式）')
  }

  if (flags.nativeTextPilot) {
    const ta = await imp('native-text-actions-transform.mjs')
    await step('textActions.transformNativeTextActionsScript', s => ta.transformNativeTextActionsScript(NAME, s))
  }

  if (flags.fullIntegration && !flags.nativeCollectionPilot) {
    const it = await imp('native-image-title-transform.mjs')
    await step('imageTitle.transformNativeImageTitleScript', s => it.transformNativeImageTitleScript(NAME, s))
  } else {
    console.log('  --   跳过 imageTitle')
  }

  if (flags.nativeCollectionPilot) {
    const pile = await imp('native-pile-collection-transform.mjs')
    await step('pileCollection.transformNativePileCollectionScript', s => pile.transformNativePileCollectionScript(NAME, s))
  } else { console.log('  --   跳过 pileCollection') }

  if (flags.nativeAssemblyPilot) {
    const asm = await imp('native-assembly-library-transform.mjs')
    await step('assemblyLibrary.transformNativeAssemblyLibraryScript', s => asm.transformNativeAssemblyLibraryScript(NAME, s))
    const drop = await imp('native-library-drop-transform.mjs')
    await step('libraryDrop.transformNativeLibraryDropScript', s => drop.transformNativeLibraryDropScript(NAME, s))
    await step('libraryDrop.transformNativeLibraryDropNoticeScript', s => drop.transformNativeLibraryDropNoticeScript(NAME, s))
  } else { console.log('  --   跳过 assemblyLibrary/libraryDrop') }

  if (flags.nativeRailPilot) {
    const rail = await imp('native-material-rail-transform.mjs')
    await step('materialRail.transformNativeMaterialRailScript', s => rail.transformNativeMaterialRailScript(NAME, s))
  } else { console.log('  --   跳过 materialRail') }

  if (flags.nativeAssemblyPilot) {
    const ctx = await imp('native-library-contexts-transform.mjs')
    await step('libraryContexts.transformNativeLibraryContextsScript', s => ctx.transformNativeLibraryContextsScript(NAME, s))
  } else { console.log('  --   跳过 libraryContexts') }

  if (flags.fullIntegration) {
    const hist = await imp('native-history-transform.mjs')
    await step('history.transformNativeHistoryScript', s => hist.transformNativeHistoryScript(NAME, s))
  }

  if (flags.fullIntegration) {
    const viewer = await imp('native-material-viewer-transform.mjs')
    await step('materialViewer.transformNativeMaterialViewerScript', s => viewer.transformNativeMaterialViewerScript(NAME, s))
  }

  if (flags.fullIntegration) {
    const auto = await imp('native-tiptap-autosave-transform.mjs')
    await step('tiptapAutosave.transformNativeTiptapAutosaveScript', s => auto.transformNativeTiptapAutosaveScript(NAME, s))
  }

  if (flags.nativeRailPilot) {
    const cp1 = await imp('native-colorpin-course-transform.mjs')
    await step('colorPinCourse.transformNativeColorPinCourseScript', s => cp1.transformNativeColorPinCourseScript(NAME, s))
    const cp2 = await imp('native-colorpin-page-transform.mjs')
    await step('colorPinPage.transformNativeColorPinPageScript', s => cp2.transformNativeColorPinPageScript(NAME, s))
  } else { console.log('  --   跳过 colorPin 两级') }

  if (flags.fullIntegration) {
    const up = await imp('native-file-upload-transform.mjs')
    await step('fileUpload.transformNativeFileUploadScript', s => up.transformNativeFileUploadScript(NAME, s))
    const light = await imp('native-light-theme-transform.mjs')
    await step('lightTheme.transformNativeLightThemeScript', s => light.transformNativeLightThemeScript(NAME, s))
  }

  console.log('\nRESULT: 全链 PASS，最终字节', original.length, '->', src.length)
} catch (e) {
  console.log('\nRESULT: 在 [' + steps[steps.length - 1].label + '] 中断')
}

fs.writeFileSync(
  'E:/Codex 项目/LCOS夺舍计划_20261013/output/三方视觉与信息架构审计_20261018/metrics/transform-chain-' +
    (flags.nativeRailPilot ? 'all' : flags.nativeTextPilot ? 'text' : 'collection-only') + '.json',
  JSON.stringify({ flags, steps }, null, 1), 'utf-8'
)
