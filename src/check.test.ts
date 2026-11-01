import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPage } from './check.js'

/**
 * Runs in a real browser, so it only runs when one is available:
 *   CHROME=/path/to/chrome npm test
 */
const page = (css: string, body: string) => `<!doctype html><html lang="en"><head><style>*{box-sizing:border-box;margin:0}body{font:16px sans-serif}${css}</style></head><body>${body}</body></html>`

const GOOD = page(
  '.bar{display:flex;gap:8px;padding-inline-start:16px}.tag{width:80px;height:30px;background:#ccc;margin-inline-start:12px}.side{position:absolute;inset-inline-end:0;top:60px;width:100px;height:40px;background:#888}',
  '<div class="bar"><div class="tag"></div><div class="tag"></div></div><div class="side"></div>',
)
const BAD = page(
  '.bar{display:flex;gap:8px}.tag{width:80px;height:30px;background:#ccc;margin-left:40px}.side{position:absolute;left:30px;top:60px;width:100px;height:40px;background:#888}',
  '<div class="bar"><div class="tag" id="first"></div></div><div class="side" id="pinned"></div>',
)
const OVERFLOW = page('.w{position:absolute;left:100%;width:200px;height:20px;background:#000;margin-right:-300px}.x{margin-left:-400px;width:300px;height:20px;background:#333}', '<div class="x"></div>')

describe.skipIf(!process.env.CHROME)('mirror check in a real browser', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROME! })
  })
  afterAll(() => browser?.close())

  const check = async (html: string) => {
    const p = await browser.newPage({ viewport: { width: 800, height: 400 } })
    await p.setContent(html)
    const r = await checkPage(p, 'fixture')
    await p.close()
    return r
  }

  it('passes a page built on logical properties', async () => {
    const r = await check(GOOD)
    expect(r.elements).toBeGreaterThan(2)
    expect(r.issues).toEqual([])
    expect(r.overflow.rtlOnly).toBe(false)
    expect(r.pixelDiff).toBeLessThan(0.01)
  })

  it('finds elements that stay on the same side', async () => {
    const r = await check(BAD)
    const names = r.issues.map((i) => i.selector)
    expect(names.some((n) => n.includes('#pinned'))).toBe(true)
    expect(names.some((n) => n.includes('#first'))).toBe(true)
    expect(r.pixelDiff).toBeGreaterThan(0.01)
  })

  it('ignores decoration and the insides of an SVG', async () => {
    const r = await check(page('.d{position:absolute;left:30px;top:0;width:40px;height:40px}svg{display:block;margin-inline:auto;width:60px;height:60px}', '<div class="d" aria-hidden="true"><i style="display:block;width:9px;height:9px"></i></div><svg viewBox="0 0 60 60"><rect x="1" y="1" width="9" height="9"/></svg>'))
    expect(r.issues).toEqual([])
  })

  it('finds a page that scrolls sideways only in RTL', async () => {
    const r = await check(OVERFLOW)
    expect(r.overflow.rtlOnly || r.issues.length > 0).toBe(true)
  })
})
