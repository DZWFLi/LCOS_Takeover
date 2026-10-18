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

const names = ['c2', 'vZ', 'UX', 'd2']
const counts = Object.fromEntries(names.map(n => [n, []]))
const calls = { c2: 0, vZ: 0, UX: 0 }

walk(ast, node => {
  if (node.type === 'FunctionDeclaration' && names.includes(node.id?.name)) {
    counts[node.id.name].push({ kind: 'FunctionDeclaration', start: node.start })
  }
  if (node.type === 'VariableDeclarator' && node.id?.name === 'd2') {
    counts.d2.push({ kind: 'VariableDeclarator', start: node.start })
  }
  if (node.type === 'CallExpression' && ['jsx', 'jsxs'].includes(node.callee?.property?.name)) {
    const arg = node.arguments?.[0]?.name
    if (names.includes(arg)) calls[arg]++
  }
})

console.log('source bytes:', source.length)
for (const n of names) {
  console.log(`  ${n}: ${counts[n].length} declaration(s)`, counts[n].map(x => x.kind + '@' + x.start).join(', '))
}
console.log('  jsx-call counts:', calls)

// 直接复刻 transform 的 one() 判定
function oneCount(pred) {
  const found = []
  walk(ast, node => { if (pred(node)) found.push(node) })
  return found.length
}
const checks = [
  ['function c2', n => n.type === 'FunctionDeclaration' && n.id?.name === 'c2'],
  ['function vZ', n => n.type === 'FunctionDeclaration' && n.id?.name === 'vZ'],
  ['function UX', n => n.type === 'FunctionDeclaration' && n.id?.name === 'UX'],
  ['declarator d2', n => n.type === 'VariableDeclarator' && n.id?.name === 'd2']
]
console.log('\ntransform one() checks (must be exactly 1):')
for (const [label, pred] of checks) {
  const c = oneCount(pred)
  console.log(`  ${label.padEnd(16)} = ${c}  ${c === 1 ? 'PASS' : 'THROW -> Native media viewer changed (' + c + ')'}`)
}
