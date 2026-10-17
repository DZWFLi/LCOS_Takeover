import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const modulePath = fs.readdirSync(cache).map(entry => path.join(cache, entry, 'node_modules', 'playwright')).find(file => fs.existsSync(path.join(file, 'package.json')));
if (!modulePath) throw new Error('Cached Playwright unavailable.');
const { chromium } = createRequire(import.meta.url)(modulePath);
const origin = 'http://127.0.0.1:17877';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => { const url = new URL(route.request().url()); return !['http:', 'https:'].includes(url.protocol) || url.origin === origin ? route.continue() : route.abort('blockedbyclient'); });
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage();
  await page.goto(origin + '/canvas/node-lab-2601d78a-83f3-4b19-8e09-0d472f24ffc6');
  await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api?.getNodes().length);
  await page.locator('.react-flow__node-image img').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node-image img')].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => window.__LCOS_NODE_LAB__.api.fitView({ padding: 0.3, maxZoom: 1.3 }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-node-lab-final.png' });
  console.log(JSON.stringify({ title: await page.title(), nodes: await page.locator('.react-flow__node').count(), edges: await page.locator('.react-flow__edge').count(), screenshot: 'tapnow-node-lab-final.png' }));
} finally { await browser.close(); }
