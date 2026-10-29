import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedSourcePath = path.join(workspaceRoot, 'lcos/apps/local-core/src/server.ts')

const earlyReturnPattern = /(?<indent> {4})const listeners = runEventListeners\.get\(projectId\)\r?\n\k<indent>if \(listeners === undefined\) return\r?\n\k<indent>for \(const listener of listeners\) \{\r?\n\k<indent>  try \{ listener\(\) \} catch \{ \/\* 推送失败不影响 Run 生命周期 \*\/ \}\r?\n\k<indent>\}/g
const patchedPattern = /(?<indent> {4})const listeners = runEventListeners\.get\(projectId\)\r?\n\k<indent>for \(const listener of listeners \?\? \[\]\) \{\r?\n\k<indent>  try \{ listener\(\) \} catch \{ \/\* 推送失败不影响 Run 生命周期 \*\/ \}\r?\n\k<indent>\}/g

function normalizedAbsolutePath(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved
}

function requireCanonicalSource(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new Error('Native Core RunEvent transform requires the exact copied server.ts sourcePath.')
  }
  if (normalizedAbsolutePath(sourcePath) !== normalizedAbsolutePath(expectedSourcePath)) {
    throw new Error(`Native Core RunEvent transform only applies to ${expectedSourcePath}.`)
  }
}

/**
 * Remove the old canvas-SSE listener gate from the copied Core RunEvent sink.
 * The sink still publishes once through its existing ProjectEventHub; legacy
 * canvas listeners are optional observers only. No source file is written.
 */
export function transformNativeCoreRunEventSource(source, { sourcePath } = {}) {
  requireCanonicalSource(sourcePath)
  if (typeof source !== 'string') throw new TypeError('Native Core RunEvent source must be text.')

  const oldMatches = [...source.matchAll(earlyReturnPattern)]
  const patchedMatches = [...source.matchAll(patchedPattern)]
  if (oldMatches.length === 0 && patchedMatches.length === 1) return source
  if (oldMatches.length !== 1 || patchedMatches.length !== 0) {
    throw new Error(`Native Core RunEvent source drifted: expected one original sink block, found ${oldMatches.length} original and ${patchedMatches.length} patched blocks.`)
  }

  const transformed = source.replace(earlyReturnPattern, (matched, indent) => {
    const lineEnding = matched.includes('\r\n') ? '\r\n' : '\n'
    return [
      `${indent}const listeners = runEventListeners.get(projectId)`,
      `${indent}for (const listener of listeners ?? []) {`,
      `${indent}  try { listener() } catch { /* 推送失败不影响 Run 生命周期 */ }`,
      `${indent}}`,
    ].join(lineEnding)
  })
  const afterPatched = [...transformed.matchAll(patchedPattern)]
  if (afterPatched.length !== 1 || [...transformed.matchAll(earlyReturnPattern)].length !== 0) {
    throw new Error('Native Core RunEvent transform did not produce exactly one optional-listener block.')
  }
  return transformed
}

export const nativeCoreRunEventSourcePath = 'lcos/apps/local-core/src/server.ts'
