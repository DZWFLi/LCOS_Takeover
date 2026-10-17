import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import {
  nativeProjectTextCreateTarget,
  transformNativeProjectTextCreate,
} from '../lab/native-project-text-create-transform.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, nativeProjectTextCreateTarget)
const runtimeRoot = path.join(root, '.runtime', 'native-project-text-create-transform-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })

const original = await readFile(sourcePath, 'utf8')
const transform = (source, targetPath = sourcePath) => transformNativeProjectTextCreate(source, { sourcePath: targetPath })
const output = transform(original)
const helperImport = "import { createNativeProjectText } from \"../../../../../../../../lab/pilot/native-project-text-create.ts\";"
const factoryImport = "import { createOriginalTextCarrier } from '/lcos/native-flow.js';"
const call = [
  'void createNativeProjectText({ projectId, canvasId, position, body: active.text, focus: false }, {',
  '      getCurrentProjectId: () => useLcosReferenceStore.getState().projectId ?? undefined,',
  '      createTextCarrier: createOriginalTextCarrier,',
  '    })',
].join('\n')

assert.equal(transform(output), output, 'the exact fully-installed result is idempotent')
assert.equal(output.split(helperImport).length - 1, 1)
assert.equal(output.split(factoryImport).length - 1, 1)
assert.equal(output.split("createTextCarrier: createOriginalTextCarrier,").length - 1, 1)
assert.equal(output.includes("import { createProjectText } from '../creation/projectTextCreation';"), false,
  'the narrower branch-drag caller no longer imports the direct state.addNode/Core-claim producer')
assert.equal(output.includes("void createProjectText({ projectId, canvasId, position, body: active.text, focus: false })"), false)
assert.equal(output.split(".then(() => toast('已摘成项目文本，原分支保留')).catch((error: unknown) => toast(error instanceof Error ? error.message : '摘取尚未确认。', { tone: 'danger' }));").length - 1, 1,
  'the existing success/error UI receipt remains attached to the helper promise')
assert.deepEqual(await readFile(sourcePath), Buffer.from(original), 'the copied donor remains byte-for-byte unchanged')

assert.throws(() => transform(original, path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/creation/projectTextCreation.ts')),
  /only accepts lcos\/huabu\/apps\/web\/src\/lcos\/nodes\/text\/LcosTextFaces\.tsx/)
assert.throws(() => transform(original.replace('void createProjectText(', 'void createProjectTextDrifted(')), /finishBranch caller seam drifted/)
assert.throws(() => transform(original + '\n' + original.slice(original.indexOf('void createProjectText('), original.indexOf('void createProjectText(') + 90)),
  /finishBranch caller seam drifted/)
const partial = output.replace('createTextCarrier: createOriginalTextCarrier,', 'createTextCarrier: unresolvedCarrier,')
assert.throws(() => transform(partial), /partially installed or has drifted/)

// The copied TextFaces source is mixed-line-ending. The transform uses a
// minimal exact caller replacement and does not normalize the donor around it.
const mixed = original.replace(
  'const position = rf.screenToFlowPosition({ x: event.clientX + 14, y: event.clientY + 16 });\n    void createProjectText(',
  'const position = rf.screenToFlowPosition({ x: event.clientX + 14, y: event.clientY + 16 });\r\n    void createProjectText(',
)
assert.notEqual(mixed, original, 'the mixed-EOL fixture changed only the source separator adjacent to the target caller')
const mixedOutput = transform(mixed)
assert.ok(mixedOutput.includes('screenToFlowPosition({ x: event.clientX + 14, y: event.clientY + 16 });\r\n    void createNativeProjectText('),
  'the existing CRLF at the call boundary survives')
assert.equal(transform(mixedOutput), mixedOutput)

// Exercise the actual sourceTransforms bundler seam without starting a server,
// browser, or live runtime. The entrypoint and bundle live under .runtime only.
const entryPath = path.join(runtimeRoot, 'native-project-text-transform-entry.tsx')
const entrySpecifier = path.relative(path.dirname(entryPath), sourcePath).split(path.sep).join('/')
await writeFile(entryPath, `export { LcosTextFaces } from ${JSON.stringify(entrySpecifier)};\n`)
const entryRelative = path.relative(root, entryPath).split(path.sep).join('/')
const bundlePath = await buildPilotEntry(entryRelative, path.join(runtimeRoot, 'native-project-text-transform-bundle.mjs'), 'browser', {
  nativeReact: true,
  sourceTransforms: { [nativeProjectTextCreateTarget]: transformNativeProjectTextCreate },
})
const bundle = await readFile(bundlePath, 'utf8')
assert.ok(bundle.includes('/lcos/native-flow.js') && bundle.includes('createOriginalTextCarrier'),
  'the transformed bundle retains the Root-owned original factory bridge import')
assert.ok(bundle.includes('createNativeProjectTextReceiptPort') && bundle.includes('getCurrentProjectId'),
  'the transformed branch caller reaches the typed Core/history receipt helper')

const report = {
  status: 'passed',
  target: nativeProjectTextCreateTarget,
  onlyBranchDropCallerTransformed: true,
  copiedDonorModified: false,
  rootRuntimeStarted: false,
  browserStarted: false,
  providerExecutionStarted: false,
  bundlePath,
  cases: [
    'exact source path, original branch-drop caller, idempotence, path drift, caller drift, duplicate seam, partial install',
    'existing live project getter and original NativeIntent/addNodes helper wiring retained',
    'success/error toast tail remains unchanged and copied donor bytes are unchanged',
    'mixed CRLF/LF around the exact caller is preserved',
    'temporary nativeReact sourceTransforms bundle resolves the helper and Root-owned original text factory bridge',
  ],
}
await writeFile(path.join(runtimeRoot, 'report.json'), JSON.stringify(report, null, 2))
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
