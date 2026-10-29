import { createRequire } from 'node:module'
const requireFromProject = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')
const { chromium } = requireFromProject('playwright-core')

const URL = 'http://127.0.0.1:56239/takeover/'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-extensions']
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await ctx.newPage()

const bad = []
const failed = []
page.on('response', r => {
  const s = r.status()
  if (s >= 400) bad.push({ status: s, url: r.url().slice(0, 180), method: r.request().method() })
})
page.on('requestfailed', r => {
  failed.push({ reason: r.failure()?.errorText, url: r.url().slice(0, 180) })
})
const logs = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 220)) })

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

for (const t of [3000, 6000, 10000, 15000, 20000]) {
  await page.waitForTimeout(t === 3000 ? 3000 : 3000)
  const state = await page.evaluate(() => {
    const q = s => document.querySelectorAll(s).length
    return {
      controls: [...document.querySelectorAll('button,[role="button"],a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 }).length,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
      spinners: q('[class*="spin"],[class*="load"],[role="progressbar"]'),
      canvas: q('canvas'),
      svg: q('svg')
    }
  })
  console.log('T=' + t, JSON.stringify(state))
}

console.log('\n--- HTTP >=400 (' + bad.length + ') ---')
const seen = new Set()
for (const b of bad) {
  const k = b.status + ' ' + b.url
  if (seen.has(k)) continue
  seen.add(k)
  console.log(' ', b.status, b.method, b.url)
}
console.log('\n--- requestfailed (' + failed.length + ') ---')
const seen2 = new Set()
for (const f of failed) {
  if (seen2.has(f.url)) continue
  seen2.add(f.url)
  console.log(' ', f.reason, f.url)
}
console.log('\n--- console error/warn (' + logs.length + ') ---')
for (const l of [...new Set(logs)].slice(0, 15)) console.log(' ', l)

await browser.close()
