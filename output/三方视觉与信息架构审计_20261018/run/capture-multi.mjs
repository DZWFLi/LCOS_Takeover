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
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-extensions']
})

const SEL = 'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"]'

async function ready(page) {
  try {
    await page.waitForFunction(() => {
      const c = document.querySelectorAll('button,[role="button"],a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])').length
      return c > 5 && document.querySelectorAll('[role="progressbar"]').length === 0
    }, { timeout: 45000 })
  } catch { }
  await page.waitForTimeout(2200)
}

async function snapshot(page, name, note) {
  await page.screenshot({ path: path.join(OUT, 'screens', name + '.png') })
  const data = await page.evaluate((sel) => {
    const isVisible = el => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0
    }
    const items = [...document.querySelectorAll(sel)].filter(isVisible).map(el => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
        text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
        ariaLabel: el.getAttribute('aria-label'), title: el.getAttribute('title'),
        placeholder: el.getAttribute('placeholder'),
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
    })
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const texts = []
    while (walker.nextNode()) {
      const n = walker.currentNode, t = (n.textContent || '').trim()
      if (!t) continue
      const p = n.parentElement
      if (!p || !isVisible(p)) continue
      if (['script', 'style', 'noscript'].includes(p.tagName.toLowerCase())) continue
      texts.push(t.replace(/\s+/g, ' ').slice(0, 220))
    }
    return { title: document.title, url: location.href, vw: innerWidth, vh: innerHeight, controlCount: items.length, items, texts }
  }, SEL)
  fs.writeFileSync(path.join(OUT, 'dom', name + '.dom.json'), JSON.stringify(data, null, 1), 'utf-8')
  fs.writeFileSync(path.join(OUT, 'dom', name + '.visible-copy.txt'), data.texts.join('\n'), 'utf-8')
  let aria = ''
  try { aria = await page.locator('body').ariaSnapshot() } catch (e) { aria = 'failed: ' + e.message }
  fs.writeFileSync(path.join(OUT, 'aria', name + '.aria.txt'), aria, 'utf-8')
  console.log(`[${name}] controls=${data.controlCount} texts=${data.texts.length} ${note || ''}`)
  return data
}

async function fresh(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'zh-CN' })
  const page = await ctx.newPage()
  page.on('pageerror', () => { })
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await ready(page)
  return { ctx, page }
}

const results = []

// 02 Composer 聚焦
{
  const { ctx, page } = await fresh({ width: 1440, height: 900 })
  try {
    const ta = page.locator('textarea').first()
    if (await ta.count()) { await ta.click({ timeout: 5000 }); await page.waitForTimeout(1200) }
  } catch (e) { console.log('02 click failed:', e.message.slice(0, 80)) }
  results.push(await snapshot(page, '02-composer-focus', '点击 Composer'))
  await ctx.close()
}

// 03 库打开（左侧文件夹图标）
{
  const { ctx, page } = await fresh({ width: 1440, height: 900 })
  try {
    const btns = page.locator('button')
    const n = await btns.count()
    for (let i = 0; i < n; i++) {
      const b = btns.nth(i)
      const box = await b.boundingBox().catch(() => null)
      if (box && box.x < 70 && box.y > 350 && box.y < 480) { await b.click({ timeout: 4000 }); break }
    }
    await page.waitForTimeout(2500)
  } catch (e) { console.log('03 click failed:', e.message.slice(0, 80)) }
  results.push(await snapshot(page, '03-library-open', '左竖轨文件夹'))
  await ctx.close()
}

// 06 选中画布节点
{
  const { ctx, page } = await fresh({ width: 1440, height: 900 })
  try {
    const stack = page.locator('[role="button"]').filter({ hasText: '堆叠节点' }).first()
    if (await stack.count()) { await stack.click({ timeout: 5000 }); await page.waitForTimeout(1800) }
  } catch (e) { console.log('06 click failed:', e.message.slice(0, 80)) }
  results.push(await snapshot(page, '06-node-selected', '选中集合卡'))
  await ctx.close()
}

// 07 会话右栏
{
  const { ctx, page } = await fresh({ width: 1440, height: 900 })
  try {
    const chat = page.locator('button[aria-label="聊天记录"]').first()
    if (await chat.count()) { await chat.click({ timeout: 5000 }); await page.waitForTimeout(2500) }
  } catch (e) { console.log('07 click failed:', e.message.slice(0, 80)) }
  results.push(await snapshot(page, '07-chat-panel', '聊天记录'))
  await ctx.close()
}

// 08 窄窗 360
{
  const { ctx, page } = await fresh({ width: 360, height: 800 })
  results.push(await snapshot(page, '08-narrow-360', '360x800'))
  await ctx.close()
}

// 09 右键菜单
{
  const { ctx, page } = await fresh({ width: 1440, height: 900 })
  try {
    const stack = page.locator('[role="button"]').filter({ hasText: '堆叠节点' }).first()
    if (await stack.count()) {
      const box = await stack.boundingBox()
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
      await page.waitForTimeout(1800)
    }
  } catch (e) { console.log('09 right-click failed:', e.message.slice(0, 80)) }
  results.push(await snapshot(page, '09-context-menu', '右键画布节点'))
  await ctx.close()
}

console.log('\nSUMMARY:', JSON.stringify(results.map(r => ({ url: r.url, vw: r.vw, c: r.controlCount, t: r.texts.length })), null, 1))
await browser.close()
