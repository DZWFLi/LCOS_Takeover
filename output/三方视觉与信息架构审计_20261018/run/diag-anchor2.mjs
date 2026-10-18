import { pathToFileURL } from 'node:url'
import fs from 'node:fs'

const mod = await import(pathToFileURL('E:/Codex 项目/LCOS夺舍计划_20261013/lab/agent-node-transform.mjs').href)
const { parseOriginalDonorScript } = mod

const asset = 'E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js'
const source = fs.readFileSync(asset, 'utf8')
const ast = parseOriginalDonorScript(source, asset)

function walk(root, visit) {
  if (!root?.type) return
  visit(root)
  for (const [k, v] of Object.entries(root)) {
    if (['loc', 'tokens', 'comments'].includes(k)) continue
    if (Array.isArray(v)) v.forEach(c => walk(c, visit))
    else if (v?.type) walk(v, visit)
  }
}

const isCall = (node, name) => node.type === 'CallExpression' && node.arguments?.[0]?.name === name
  && ['jsx', 'jsxs'].includes(node.callee?.property?.name)

let owner = null
walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id?.name === 'd2') owner = n })
console.log('owner(d2 declarator) found:', !!owner, 'start=', owner?.start)

const inner = []
if (owner) walk(owner, n => { if (isCall(n, 'c2')) inner.push({ start: n.start, end: n.end, callee: n.callee?.property?.name }) })
console.log('c2 jsx-calls inside d2:', inner.length, JSON.stringify(inner))
console.log(inner.length === 1 ? 'PASS single original viewer mount' : `THROW -> Native media viewer single original viewer mount changed (${inner.length}).`)

// 同时看全局 2 处 c2 jsx 调用分别在哪个范围内
const all = []
walk(ast, n => { if (isCall(n, 'c2')) all.push({ start: n.start, end: n.end }) })
console.log('\nglobal c2 jsx calls:', all.length)
for (const a of all) {
  const insideD2 = owner && a.start >= owner.start && a.end <= owner.end
  console.log(`  @${a.start}  insideD2=${insideD2}`)
  console.log('   ctx:', source.slice(Math.max(0, a.start - 90), a.start + 60).replace(/\s+/g, ' '))
}

// 直接跑这一级 transform，拿真实错误
const viewerMod = await import(pathToFileURL('E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-material-viewer-transform.mjs').href)
try {
  const out = viewerMod.transformNativeMaterialViewerScript('course-api-base-url-CifxI1ia.js', source)
  console.log('\ntransform result: OK, bytes', source.length, '->', out.length)
} catch (e) {
  console.log('\ntransform THREW:', e.message)
}
