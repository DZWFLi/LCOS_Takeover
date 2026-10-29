import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const requireFromProject = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')
const { chromium } = requireFromProject('playwright-core')

const OUT = 'E:/Codex 项目/LCOS夺舍计划_20261013/output/三方视觉与信息架构审计_20261018'
const URL = 'http://127.0.0.1:56239/takeover/'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-extensions', '--disable-component-update']
})
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'zh-CN'
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

// 等真实渲染：出现可交互控件且 loading spinner 消失
try {
  await page.waitForFunction(() => {
    const ctrls = document.querySelectorAll('button,[role="button"],a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])').length
    const spinner = document.querySelectorAll('[role="progressbar"]').length
    return ctrls > 0 && spinner === 0
  }, { timeout: 45000 })
} catch (e) {
  console.log('warn: waitForFunction timeout, 继续采集')
}
await page.waitForTimeout(2500)

const shot = path.join(OUT, 'screens', '01-cold-start-1440x900.png')
await page.screenshot({ path: shot })

let aria = ''
try { aria = await page.locator('body').ariaSnapshot() } catch (e) { aria = 'ariaSnapshot failed: ' + e.message }
fs.writeFileSync(path.join(OUT, 'aria', '01-cold-start.aria.txt'), aria, 'utf-8')

const data = await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    return true
  }
  const sel = 'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]'
  const nodes = [...document.querySelectorAll(sel)].filter(isVisible)
  const items = nodes.map(el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      type: el.getAttribute('type'),
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      testid: el.getAttribute('data-testid'),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 140),
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      fontSize: cs.fontSize,
      radius: cs.borderRadius,
      bg: cs.backgroundColor,
      z: cs.zIndex
    }
  })
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const texts = []
  while (walker.nextNode()) {
    const n = walker.currentNode
    const t = (n.textContent || '').trim()
    if (!t) continue
    const p = n.parentElement
    if (!p || !isVisible(p)) continue
    const tag = p.tagName.toLowerCase()
    if (['script', 'style', 'noscript'].includes(tag)) continue
    texts.push({ t: t.replace(/\s+/g, ' ').slice(0, 200), tag, cls: (typeof p.className === 'string' ? p.className : '').slice(0, 90) })
  }
  const bodyRect = document.body.getBoundingClientRect()
  return {
    title: document.title,
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight },
    bodySize: { w: Math.round(bodyRect.width), h: Math.round(bodyRect.height) },
    controlCount: items.length,
    items,
    textCount: texts.length,
    texts
  }
})

fs.writeFileSync(path.join(OUT, 'dom', '01-cold-start.dom.json'), JSON.stringify(data, null, 1), 'utf-8')
fs.writeFileSync(path.join(OUT, 'dom', '01-cold-start.visible-copy.txt'), data.texts.map(x => x.t).join('\n'), 'utf-8')

console.log(JSON.stringify({
  shot,
  title: data.title,
  url: data.url,
  viewport: data.viewport,
  controlCount: data.controlCount,
  textCount: data.textCount,
  errors: errors.slice(0, 6)
}, null, 1))

await browser.close()
