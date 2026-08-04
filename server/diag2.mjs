import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = await browser.contexts()[0].newPage()
await page.goto('https://www.zhipin.com/web/geek/job?query=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91%E5%B7%A5%E7%A8%8B%E5%B8%88&city=101020100&salary=2030', { waitUntil: 'commit', timeout: 20000 }).catch(e => console.log('goto:', e.message))
await new Promise(r => setTimeout(r, 3000))
const url = page.url()
const title = await page.title().catch(() => 'ERR')
let body = ''
try { body = (await page.evaluate(() => document.body?.innerText ?? '')).slice(0, 200) } catch {}
console.log('URL:', url)
console.log('TITLE:', title)
console.log('BODY:', JSON.stringify(body))
await page.close().catch(()=>{})
await browser.close().catch(()=>{})
