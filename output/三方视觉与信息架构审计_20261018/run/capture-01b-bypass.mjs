import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const requireFromProject = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')
const { chromium } = requireFromProject('playwright-core')

const OUT = 'E:/Codex 项目/LCOS夺舍计划_20261013/output/三方视觉与信息架构审计_20261018'
const VENDOR = 'E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets'
const BROKEN = 'course-api-base-url-CifxI1ia.js'
const URL = 'http://127.0.0.1:56239/takeover/'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-extensions']
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
const page = await ctx.newPage()

// 只绕过这一个被 transform 打挂的 chunk，直接回原文，不做任何改写
let bypassed = 0
await page.route('**/assets/' + BROKEN, async route => {
  bypassed++
  const body = fs.readFileSync(path.join(VENDOR, BROKEN))
  await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
})

const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(9000)

const state = await page.evaluate(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden' }
  const sel = 'button,[role="button"],a[href],input,textarea,select,[tabindex]:not([tabindex="-1"]),[role="menuitem"],[role="tab"]'
  const ctrls = [...document.querySelectorAll(sel)].filter(vis)
  return {
    controls: ctrls.length,
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    canvas: document.querySelectorAll('canvas').length,
    svg: document.querySelectorAll('svg').length
  }
})
console.log('after load:', JSON.stringify(state), 'bypassed=', bypassed)

const shot = path.join(OUT, 'screens', '01-cold-start-1440x900.png')
await page.screenshot({ path: shot })

const data = await page.evaluate(() => {
  const isVisible = el => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    return true
  }
  const sel = 'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]'
  const items = [...document.querySelectorAll(sel)].filter(isVisible).map(el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      testid: el.getAttribute('data-testid'),
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      fontSize: cs.fontSize, radius: cs.borderRadius, bg: cs.backgroundColor
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
    if (['script', 'style', 'noscript'].includes(p.tagName.toLowerCase())) continue
    texts.push({ t: t.replace(/\s+/g, ' ').slice(0, 220), tag: p.tagName.toLowerCase() })
  }
  return { title: document.title, url: location.href, controlCount: items.length, items, textCount: texts.length, texts }
})

fs.writeFileSync(path.join(OUT, 'dom', '01-cold-start.dom.json'), JSON.stringify(data, null, 1), 'utf-8')
fs.writeFileSync(path.join(OUT, 'dom', '01-cold-start.visible-copy.txt'), data.texts.map(x => x.t).join('\n'), 'utf-8')
let aria = ''
try { aria = await page.locator('body').ariaSnapshot() } catch (e) { aria = 'failed: ' + e.message }
fs.writeFileSync(path.join(OUT, 'aria', '01-cold-start.aria.txt'), aria, 'utf-8')

console.log(JSON.stringify({ shot, title: data.title, url: data.url, controlCount: data.controlCount, textCount: data.textCount, bypassed, errors: [...new Set(errors)].slice(0, 6) }, null, 1))

await browser.close()
