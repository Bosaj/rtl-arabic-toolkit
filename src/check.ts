import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import type { Browser, Page } from 'playwright'

/**
 * The runtime check: render a page left-to-right and right-to-left, and compare. A correct RTL layout
 * is the mirror image of the LTR one, so an element that doesn't land where its mirror should be is
 * very likely a bug. This finds what static analysis can't: JavaScript layout, third-party CSS,
 * overflow. Text pixels never match exactly, so the geometry is the verdict and the picture is the evidence.
 */

export interface MirrorIssue {
  selector: string
  text: string
  /** How far the element is from where its mirror should be, in px. */
  offBy: number
  ltr: { x: number; width: number }
  rtl: { x: number; width: number }
}

export interface CheckResult {
  url: string
  width: number
  elements: number
  issues: MirrorIssue[]
  /** The page scrolls sideways in RTL but not in LTR. */
  overflow: { ltr: number; rtl: number; rtlOnly: boolean }
  /** Share of pixels that differ between the RTL page and the mirrored LTR page. */
  pixelDiff: number
}

interface Box {
  i: number
  selector: string
  text: string
  x: number
  y: number
  width: number
  height: number
  skip: boolean
}

/** Runs in the page: every visible element, in DOM order. */
function measure(): { boxes: Box[]; scroll: number; client: number; viewport: number } {
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${id}${cls}`
  }
  const all = [...document.body.querySelectorAll('*')]
  const boxes = all.map((el, i) => {
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const hidden = r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0'
    const local = el.closest('[dir]')
    const fixedDir = !!local && local !== document.documentElement && local !== document.body
    const inline = style.display === 'inline' && !el.children.length
    // Decoration isn't layout, and an SVG's insides move with the SVG
    const decorative = !!el.closest('[aria-hidden="true"]') || (el instanceof SVGElement && el.ownerSVGElement !== null)
    return {
      i,
      selector: describe(el),
      text: (el.textContent ?? '').trim().slice(0, 40),
      x: r.x,
      y: r.y + window.scrollY,
      width: r.width,
      height: r.height,
      skip: hidden || fixedDir || inline || decorative || ['SCRIPT', 'STYLE', 'BR'].includes(el.tagName.toUpperCase()),
    }
  })
  return { boxes, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, viewport: window.innerWidth }
}

const setDir = (dir: string) => {
  document.documentElement.setAttribute('dir', dir)
  document.body.removeAttribute('dir')
}

function flipPng(png: PNG): PNG {
  const out = new PNG({ width: png.width, height: png.height })
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const from = (y * png.width + x) * 4
      const to = (y * png.width + (png.width - 1 - x)) * 4
      for (let c = 0; c < 4; c++) out.data[to + c] = png.data[from + c]!
    }
  }
  return out
}

/** Compare the two directions of the page already open at `page`. */
export async function checkPage(page: Page, url: string, { tolerance = 4, outDir }: { tolerance?: number; outDir?: string } = {}): Promise<CheckResult> {
  const width = page.viewportSize()?.width ?? 1280
  await page.evaluate(setDir, 'ltr')
  await page.waitForTimeout(150)
  const ltr = await page.evaluate(measure)
  const ltrShot = PNG.sync.read(await page.screenshot())
  await page.evaluate(setDir, 'rtl')
  await page.waitForTimeout(150)
  const rtl = await page.evaluate(measure)
  const rtlShot = PNG.sync.read(await page.screenshot())

  const issues: MirrorIssue[] = []
  let elements = 0
  const sameDom = ltr.boxes.length === rtl.boxes.length
  if (sameDom) {
    const flagged: { box: Box; offBy: number; r: Box }[] = []
    ltr.boxes.forEach((l, i) => {
      const r = rtl.boxes[i]!
      if (l.skip || r.skip || l.width >= ltr.client - 2) return
      elements++
      // The scrollbar or its reserved gutter may or may not change sides, so either mirror line is fine.
      const offBy = Math.min(Math.abs(r.x - (rtl.client - (l.x + l.width))), Math.abs(r.x - (rtl.viewport - (l.x + l.width))), Math.abs(r.x + (rtl.viewport - rtl.client) - (rtl.viewport - (l.x + l.width))))
      // Text can wrap differently, so only a mismatch beyond the element's own width change counts.
      const resized = Math.abs(r.width - l.width)
      if (offBy > tolerance + resized) flagged.push({ box: l, offBy, r })
    })
    // A parent that's wrong drags its children along: report the outermost one.
    const areas = flagged.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
    for (const f of areas) {
      const insideReported = issues.some((i) => {
        const o = flagged.find((x) => x.box.selector === i.selector && x.box.x === i.ltr.x)
        return o && f.box.x >= o.box.x - 1 && f.box.x + f.box.width <= o.box.x + o.box.width + 1 && f.box.y >= o.box.y - 1 && f.box.y + f.box.height <= o.box.y + o.box.height + 1 && Math.abs(f.offBy - o.offBy) < tolerance
      })
      if (!insideReported) issues.push({ selector: f.box.selector, text: f.box.text, offBy: Math.round(f.offBy), ltr: { x: Math.round(f.box.x), width: Math.round(f.box.width) }, rtl: { x: Math.round(f.r.x), width: Math.round(f.r.width) } })
    }
  }

  const flipped = flipPng(ltrShot)
  const { width: w, height: h } = rtlShot
  const diff = new PNG({ width: w, height: h })
  const same = flipped.width === w && flipped.height === h
  const changed = same ? pixelmatch(flipped.data, rtlShot.data, diff.data, w, h, { threshold: 0.2 }) : w * h
  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'ltr.png'), PNG.sync.write(ltrShot))
    writeFileSync(join(outDir, 'rtl.png'), PNG.sync.write(rtlShot))
    if (same) writeFileSync(join(outDir, 'diff.png'), PNG.sync.write(diff))
  }
  return {
    url,
    width,
    elements,
    issues: issues.sort((a, b) => b.offBy - a.offBy),
    overflow: { ltr: ltr.scroll, rtl: rtl.scroll, rtlOnly: rtl.scroll > rtl.client + 1 && ltr.scroll <= ltr.client + 1 },
    pixelDiff: changed / (w * h),
  }
}

/** Open a URL and check it. Needs Playwright, which is an optional dependency. */
export async function checkUrl(url: string, options: { width?: number; height?: number; tolerance?: number; outDir?: string; executablePath?: string } = {}): Promise<CheckResult> {
  const { chromium } = await import('playwright')
  const browser: Browser = await chromium.launch(options.executablePath ? { executablePath: options.executablePath } : {})
  try {
    const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: options.height ?? 800 } })
    await page.goto(url, { waitUntil: 'networkidle' })
    return await checkPage(page, url, options)
  } finally {
    await browser.close()
  }
}
