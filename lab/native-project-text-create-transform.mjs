import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOriginalDonorScript } from './agent-node-transform.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = 'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx'
const helper = path.join(workspaceRoot, 'lab/pilot/native-project-text-create.ts')

const oldImport = "import { createProjectText } from '../creation/projectTextCreation';"
const callAnchor = 'void createProjectText({ projectId, canvasId, position, body: active.text, focus: false })'
const oldTail = ".then(() => toast('已摘成项目文本，原分支保留')).catch((error: unknown) => toast(error instanceof Error ? error.message : '摘取尚未确认。', { tone: 'danger' }));"
const callReplacement = [
  'void createNativeProjectText({ projectId, canvasId, position, body: active.text, focus: false }, {',
  '      getCurrentProjectId: () => useLcosReferenceStore.getState().projectId ?? undefined,',
  '      createTextCarrier: createOriginalTextCarrier,',
  '    })',
].join('\n')

function eolOf(source) {
  return source.match(/\r\n|\n|\r/)?.[0] ?? '\n'
}

function count(source, fragment) {
  if (!fragment) return 0
  let total = 0
  let offset = 0
  while (true) {
    const index = source.indexOf(fragment, offset)
    if (index < 0) return total
    total += 1
    offset = index + fragment.length
  }
}

function exactSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new TypeError('Native project text creation transform requires the actual donor sourcePath.')
  }
  const relative = path.relative(workspaceRoot, path.resolve(sourcePath)).split(path.sep).join('/')
  if (relative.toLowerCase() !== target.toLowerCase()) {
    throw new Error(`Native project text creation transform only accepts ${target}; received ${relative}.`)
  }
}

/**
 * Replace only the original outline-branch drop caller. The public
 * createProjectText producer remains untouched for the menu, paste, and drop
 * ingress paths; this caller now delegates to the original TapNow addNodes
 * queue and the one Core/history receipt helper.
 */
export function transformNativeProjectTextCreate(source, { sourcePath } = {}) {
  if (typeof source !== 'string') throw new TypeError('Native project text creation transform expects source text.')
  exactSourcePath(sourcePath)

  const eol = eolOf(source)
  const helperSpecifier = path.relative(path.dirname(path.resolve(sourcePath)), helper).split(path.sep).join('/')
  const helperImport = `import { createNativeProjectText } from ${JSON.stringify(helperSpecifier.startsWith('.') ? helperSpecifier : './' + helperSpecifier)};`
  const factoryImport = [
    "// @ts-expect-error Root-owned native-flow bridge re-exports TapNow's original XD/fi text factory.",
    "import { createOriginalTextCarrier } from '/lcos/native-flow.js';",
  ].join(eol)
  const imports = [helperImport, factoryImport].join(eol)
  const replacement = callReplacement.split('\n').join(eol)

  const installed = source.includes('createNativeProjectText') || source.includes('createOriginalTextCarrier')
  if (installed) {
    if (count(source, helperImport) !== 1 || count(source, "import { createOriginalTextCarrier } from '/lcos/native-flow.js';") !== 1
      || count(source, replacement) !== 1 || source.includes(oldImport) || source.includes(callAnchor)) {
      throw new Error('Native project text creation transform is partially installed or has drifted.')
    }
    return source
  }

  if (count(source, oldImport) !== 1) throw new Error('Native project text creation donor import seam drifted.')
  if (count(source, callAnchor) !== 1 || count(source, oldTail) !== 1) {
    throw new Error('Native project text creation finishBranch caller seam drifted.')
  }
  if (source.includes('createNativeProjectText') || source.includes('createOriginalTextCarrier')) {
    throw new Error('Native project text creation transform found an unrecognized partial installation.')
  }

  let transformed = source.replace(oldImport, imports)
  // The original caller passes a stable static object and owns the existing
  // success/error toast. Replace only that invocation and preserve its promise
  // handlers byte-for-byte.
  const newCall = replacement
  if (count(transformed, callAnchor) !== 1) throw new Error('Native project text creation finishBranch caller seam drifted.')
  const callIndex = transformed.indexOf(callAnchor)
  transformed = transformed.slice(0, callIndex) + newCall + transformed.slice(callIndex + callAnchor.length)

  if (count(transformed, helperImport) !== 1 || count(transformed, "import { createOriginalTextCarrier } from '/lcos/native-flow.js';") !== 1
    || count(transformed, replacement) !== 1 || transformed.includes(oldImport) || transformed.includes(callAnchor)) {
    throw new Error('Native project text creation transform postcondition failed.')
  }
  return transformed
}

export const nativeProjectTextCreateTarget = target

const defaultTextHelper = 'LCOSNativeDefaultTextPlacement'
const defaultTextMarker = '/* LCOS original fH default Text placement */'
const defaultTextImport = `import{${defaultTextHelper}}from"/lcos/agent-ui.js";\n`
function walkDefaultText(node, visit) {
  if (!node?.type) return
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walkDefaultText(child, visit))
    else if (value?.type) walkDefaultText(value, visit)
  }
}
const property = (node, name) => node?.properties?.find(value => (value.key?.name ?? value.key?.value) === name)?.value
function oneDefaultText(values, label) {
  if (values.length !== 1) throw new Error(`Original default Text ${label} seam changed (${values.length}).`)
  return values[0]
}

/** Only the original add-menu's no-argument Text action. Position-bearing
 * click/drop/branch/paste factories remain byte-for-byte outside this call. */
export function transformNativeDefaultTextPlacementScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== 'page-Da_DfwiK.js') return source
  if (source.includes(defaultTextMarker)) {
    if (count(source, defaultTextImport) !== 1 || count(source, `${defaultTextHelper}(at,e)`) !== 1)
      throw new Error('Original default Text placement is partially installed.')
    return source
  }
  if (source.includes(defaultTextHelper)) throw new Error('Original default Text placement is partially installed.')
  const program = parseOriginalDonorScript(source, filename)
  const owner = oneDefaultText(program.body.flatMap(node => node.declarations ?? []).filter(node => node.id?.name === 'fH'), 'menu')
  if (property(owner.init?.params?.[0], 'canvasId')?.name !== 'e') throw new Error('Original default Text Canvas owner changed.')
  const callbacks = []
  walkDefaultText(owner.init, node => {
    if (node.type === 'VariableDeclarator' && node.id?.name === 'Ze' && node.init?.type === 'ArrowFunctionExpression') callbacks.push(node.init)
  })
  const callback = oneDefaultText(callbacks, 'default action')
  if (callback.params.length || callback.body.type !== 'BlockStatement') throw new Error('Original default Text action gained explicit input.')
  const factories = [], commits = []
  walkDefaultText(callback.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.name === 'at' && node.init?.callee?.name === 'fi') factories.push(node)
    if (node.type === 'CallExpression' && node.callee?.name === 'Ke' && node.arguments.length === 1 && node.arguments[0]?.name === 'at') commits.push(node)
  })
  const factory = oneDefaultText(factories, 'original factory'), commit = oneDefaultText(commits, 'original Ke commit')
  if (property(factory.init.arguments[0], 'text')?.value !== '' || property(factory.init.arguments[0], 'prompt')?.value !== ''
    || property(factory.init.arguments[1], 'position')?.callee?.name !== 'ns') throw new Error('Original default Text viewport factory changed.')
  const replacement = `try{const __lcosTextPlacement=${defaultTextHelper}(at,e);Ke(__lcosTextPlacement.node);if(__lcosTextPlacement.outsideVisible)se({title:"新文本在当前视口外，可点定位查看。",action:{label:"定位",onClick:()=>{void __lcosTextPlacement.locate().then(ok=>{if(!ok)se.error("文本尚未显示或现场已切换，请回原画布核对。")}).catch(()=>se.error("暂时无法定位新文本，请回原画布核对。"))}}})}catch(error){se.error(error instanceof Error?error.message:"画布空白位置暂时无法确认，未创建新文本。")}`
  const transformed = defaultTextImport + source.slice(0, commit.start) + replacement + source.slice(commit.end) + '\n' + defaultTextMarker
  parseOriginalDonorScript(transformed, filename)
  return transformed
}
