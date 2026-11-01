// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { auditPaths, listFiles } from './audit.js'
import { hasBidiRisk, isolate, stripIsolates } from './bidi.js'
import { auditCss } from './css.js'
import { auditHtml } from './html.js'
import { auditJsx } from './jsx.js'
import { BidiText, DirectionProvider, directionOf, useDirection, useDocumentDirection } from './react.js'
import { findPhysicalClasses, fixClasses } from './tailwind.js'

const rules = (r: { findings: { rule: string }[] }) => r.findings.map((f) => f.rule)
afterEach(cleanup)

describe('CSS', () => {
  it('reports physical properties with file:line and rewrites them', () => {
    const r = auditCss('.a {\n  margin-left: 4px;\n  padding-right: 2px;\n  border-left: 1px solid;\n  border-top-right-radius: 3px;\n}\n', 'x.css')
    expect(rules(r)).toEqual(Array(4).fill('css-physical-property'))
    expect(r.findings[0]).toMatchObject({ file: 'x.css', line: 2, severity: 'error', fix: 'margin-inline-start: 4px' })
    expect(r.fixed).toBe('.a {\n  margin-inline-start: 4px;\n  padding-inline-end: 2px;\n  border-inline-start: 1px solid;\n  border-start-end-radius: 3px;\n}\n')
  })

  it('rewrites physical keywords', () => {
    const r = auditCss('.a { text-align: left; float: right; clear: left; left: 3px }')
    expect(r.fixed).toBe('.a { text-align: start; float: inline-end; clear: inline-start; inset-inline-start: 3px }')
  })

  it('leaves symmetric and centring code alone', () => {
    for (const css of ['.a { left: 0; right: 0 }', '.a { margin-left: auto; margin-right: auto }', '.a { left: 50%; transform: translateX(-50%) }', '.a { padding-left: 1rem; padding-right: 1rem }', '.a { text-align: center }', '.a { margin: 0 auto }', '.a { margin: 1px 2px 3px 2px }']) {
      expect(auditCss(css).findings, css).toEqual([])
    }
  })

  it('still reports different values on each side', () => {
    expect(rules(auditCss('.a { left: 0; right: 4px }'))).toEqual(['css-physical-property', 'css-physical-property'])
  })

  it('trusts code written for one direction', () => {
    for (const css of ['[dir="rtl"] .a { margin-left: 4px }', '.a:dir(rtl) { left: 1px }', '.rtl .a { float: left }', 'html[dir=ltr] { text-align: left }']) {
      expect(auditCss(css).findings, css).toEqual([])
    }
  })

  it('trusts a rule that fixes its own direction', () => {
    expect(auditCss('.quran { direction: rtl; text-align: right; padding-right: 4px }').findings.map((f) => f.rule)).toEqual(['css-hardcoded-direction'])
  })

  it('only reports keyframes that slide across the whole element', () => {
    expect(auditCss('@keyframes a { to { transform: translateX(5px) rotate(1deg) } }').findings).toEqual([])
    expect(auditCss('@keyframes a { from { transform: translateX(-100%) } }').findings.map((f) => f.rule)).toEqual(['css-translate-x'])
  })

  it('reports what it cannot fix safely, without touching it', () => {
    const css = '.a { margin: 1px 2px 3px 4px; padding: 0 8px 0 0; border-radius: 4px 0 0 4px; flex-direction: row-reverse; transform: translateX(10px); background-position: left top; transform-origin: right } .b { direction: ltr }'
    const r = auditCss(css)
    expect(rules(r).sort()).toEqual(['css-asymmetric-shorthand', 'css-asymmetric-shorthand', 'css-asymmetric-shorthand', 'css-hardcoded-direction', 'css-physical-position', 'css-physical-position', 'css-row-reverse', 'css-translate-x'])
    expect(r.fixed).toBe(css)
  })

  it('honours rtl-ignore, on the line and the line above', () => {
    expect(auditCss('.a {\n  /* rtl-ignore */\n  left: 3px;\n  margin-left: 2px; /* rtl-ignore */\n}').findings).toEqual([])
  })

  it('reads SCSS, including // comments and nesting', () => {
    const r = auditCss('// comment\n.a { &:hover { margin-left: 1px; } }\n', 'x.scss')
    expect(rules(r)).toEqual(['css-physical-property'])
    expect(r.fixed).toContain('margin-inline-start: 1px')
    expect(r.fixed).toContain('// comment')
  })
})

describe('Tailwind classes', () => {
  const to = (c: string) => findPhysicalClasses(c).map((f) => f.to ?? `(${f.from})`)

  it('maps every physical family to its logical name', () => {
    expect(to('ml-4 mr-2 pl-1 pr-3 left-0 right-2 text-left text-right float-left float-right clear-left')).toEqual(['ms-4', 'me-2', 'ps-1', 'pe-3', 'start-0', 'end-2', 'text-start', 'text-end', 'float-start', 'float-end', 'clear-start'])
    expect(to('border-l border-r-2 rounded-l-lg rounded-tr-md rounded-br rounded-bl-xl scroll-ml-4')).toEqual(['border-s', 'border-e-2', 'rounded-s-lg', 'rounded-se-md', 'rounded-ee', 'rounded-es-xl', 'scroll-ms-4'])
  })

  it('keeps variants, negatives, important and arbitrary values', () => {
    expect(to('hover:ml-2 md:focus:-mr-4 !pl-3 ml-[calc(1px+2px)] data-[x=y:z]:pr-1')).toEqual(['hover:ms-2', 'md:focus:-me-4', '!ps-3', 'ms-[calc(1px+2px)]', 'data-[x=y:z]:pe-1'])
  })

  it('leaves correct code alone', () => {
    for (const c of ['ms-4 me-2 ps-1 text-start', 'mx-auto px-4 text-center', 'ml-auto mr-auto', 'pl-4 pr-4', 'left-0 right-0', 'left-1/2 -translate-x-1/2', 'rtl:ml-2 ltr:mr-2', 'rtl:text-right', 'text-lg leading-right-now', 'border-t border-b', 'rounded-lg', 'md:ml-2 md:mr-2']) {
      expect(findPhysicalClasses(c), c).toEqual([])
    }
  })

  it('trusts a family the string already handles with rtl: and ltr:', () => {
    expect(findPhysicalClasses('absolute right-4 rtl:right-4 ltr:left-4')).toEqual([])
    expect(to('right-4 ltr:left-4 ml-2')).toEqual(['ms-2'])
  })

  it('does not treat a pair under different variants as symmetric', () => {
    expect(to('ml-2 md:mr-2')).toEqual(['ms-2', 'md:me-2'])
  })

  it('reports what has no logical name', () => {
    expect(to('origin-left bg-right object-left-top')).toEqual(['(origin-left)', '(bg-right)', '(object-left-top)'])
  })

  it('rewrites a class string and keeps its spacing', () => {
    const c = 'flex  ml-2\n  hover:pr-3 text-lg'
    expect(fixClasses(c, findPhysicalClasses(c))).toBe('flex  ms-2\n  hover:pe-3 text-lg')
  })
})

describe('JSX', () => {
  it('finds classes in strings, templates, conditions and helpers, and fixes them', () => {
    const src = [
      'const A = () => (',
      '  <div className="ml-2 flex">',
      '    <b className={`pr-3 ${x ? "left-0" : "text-right"}`} />',
      '    <i className={cn("pl-1", on && "mr-2", { "float-left": on })} />',
      '    <u class="border-l" />',
      '  </div>',
      ')',
      'const v = clsx("rounded-l")',
    ].join('\n')
    const r = auditJsx(src)
    expect(r.findings.every((f) => f.rule === 'tailwind-physical-class')).toBe(true)
    expect(r.findings.map((f) => f.fix).sort()).toEqual(['border-s', 'float-start', 'me-2', 'ms-2', 'pe-3', 'ps-1', 'rounded-s', 'start-0', 'text-end'].sort())
    expect(r.fixed).toContain('className="ms-2 flex"')
    expect(r.fixed).toContain('`pe-3 ${x ? "start-0" : "text-end"}`')
    expect(r.fixed).toContain('cn("ps-1", on && "me-2", { "float-start": on })')
    expect(r.fixed).toContain('clsx("rounded-s")')
  })

  it('does not read other strings as classes', () => {
    expect(auditJsx('const a = "ml-2"; const B = () => <div title="ml-2" data-x="pl-1">ml-4</div>').findings).toEqual([])
    expect(auditJsx('const B = () => <div className={a === "ml-2" ? "flex" : "grid"} />').findings).toEqual([])
  })

  it('fixes inline styles', () => {
    const r = auditJsx(`const A = () => <div style={{ marginLeft: 4, paddingRight: 2, textAlign: 'left', color: 'red' }} />`)
    expect(r.findings.map((f) => f.fix)).toEqual(['marginInlineStart', 'paddingInlineEnd', 'start'])
    expect(r.fixed).toContain(`style={{ marginInlineStart: 4, paddingInlineEnd: 2, textAlign: 'start', color: 'red' }}`)
  })

  it('reports a computed left or right without rewriting it: it may be a coordinate', () => {
    const src = 'const A = () => <div style={{ left: pointer.x + 14, right: `${p}%` }} />'
    const r = auditJsx(src)
    expect(r.findings.map((f) => f.rule)).toEqual(['style-computed-position', 'style-computed-position'])
    expect(r.findings.every((f) => f.severity === 'info' && !f.fix)).toBe(true)
    expect(r.fixed).toBe(src)
    expect(auditJsx('const A = () => <div style={{ marginLeft: depth * 8 }} />').findings[0]?.fix).toBe('marginInlineStart')
    expect(auditJsx('const A = () => <div style={{ left: 4 }} />').findings[0]?.fix).toBe('insetInlineStart')
  })

  it('leaves symmetric inline styles alone', () => {
    expect(auditJsx('const A = () => <div style={{ left: 0, right: 0 }} />').findings).toEqual([])
    expect(auditJsx('const A = () => <div style={{ left: 0, right: 8 }} />').findings).toHaveLength(2)
  })

  it('flags directional icons that do not mirror', () => {
    const r = auditJsx('const A = () => <><ChevronLeft /><ArrowRight size={3} /><FaArrowLeft /><ChevronUp /><Search /><ChevronRight className="rtl:-scale-x-100" /><Back /></>')
    expect(r.findings.map((f) => f.message.slice(1, r.findings[0]!.message.indexOf('>')))).toHaveLength(3)
    expect(r.findings.every((f) => f.rule === 'icon-not-mirrored' && !f.fix)).toBe(true)
  })

  it('accepts the usual ways of mirroring', () => {
    for (const cls of ['rtl-flip', 'mirror-rtl', 'rtl:rotate-180', 'rtl:-rotate-180', 'rtl:scale-x-[-1]']) {
      expect(auditJsx(`const A = () => <ArrowLeft className="${cls}" />`).findings, cls).toEqual([])
    }
  })

  it('notes Arabic text that can reorder', () => {
    const r = auditJsx('const A = () => <p title="الإصدار 2.1 (beta)">اتصل بنا على (support@x.com)</p>')
    expect(rules(r)).toEqual(['bidi-mixed-text', 'bidi-mixed-text'])
    expect(auditJsx('const A = () => <p>مرحبا بكم</p>').findings).toEqual([])
    expect(auditJsx('const A = () => <p>Hello (world) 2.1</p>').findings).toEqual([])
  })

  it('honours rtl-ignore and survives odd code', () => {
    expect(auditJsx('const A = () => (\n  // rtl-ignore\n  <div className="ml-2" />\n)').findings).toEqual([])
    expect(auditJsx('this is not <valid code at all {{{').findings).toEqual([])
  })
})

describe('HTML', () => {
  it('requires dir on a right-to-left page', () => {
    expect(rules(auditHtml('<html lang="ar"><body>مرحبا</body></html>'))).toEqual(['html-missing-dir'])
    expect(rules(auditHtml('<html><body>مرحبا</body></html>'))).toEqual(['html-missing-dir'])
    expect(auditHtml('<html lang="ar" dir="rtl"><body>مرحبا</body></html>').findings).toEqual([])
    expect(auditHtml('<html lang="en"><body>Hello</body></html>').findings).toEqual([])
    expect(rules(auditHtml('<html dir="rtl"><body>x</body></html>'))).toEqual(['html-missing-lang'])
  })

  it('ignores Arabic that only appears in scripts', () => {
    expect(auditHtml('<html lang="en"><script>const a = "مرحبا"</script></html>').findings).toEqual([])
  })

  it('audits style blocks at their real line numbers', () => {
    const r = auditHtml('<html lang="en" dir="ltr">\n<style>\n.a { margin-left: 1px }\n</style></html>')
    expect(r.findings[0]).toMatchObject({ line: 3, rule: 'css-physical-property' })
    expect(r.fixed).toContain('margin-inline-start: 1px')
  })
})

describe('Bidi text', () => {
  const LRI = '⁦'
  const PDI = '⁩'

  it('spots risky text only', () => {
    expect(hasBidiRisk('الإصدار 2.1 (beta)')).toBe(true)
    expect(hasBidiRisk('اتصل على 0612-345678')).toBe(true)
    expect(hasBidiRisk('مرحبا')).toBe(false)
    expect(hasBidiRisk('Hello (world)')).toBe(false)
    expect(hasBidiRisk('سعر 100')).toBe(false)
  })

  it('isolates Latin and number runs, brackets included', () => {
    expect(isolate('افتح Node.js الآن')).toBe(`افتح ${LRI}Node.js${PDI} الآن`)
    expect(isolate('الإصدار (beta) هنا')).toBe(`الإصدار ${LRI}(beta)${PDI} هنا`)
    expect(isolate('رقم 0612-345678 شكرا')).toBe(`رقم ${LRI}0612-345678${PDI} شكرا`)
  })

  it('keeps sentence punctuation with the Arabic', () => {
    expect(isolate('زر example.com.')).toBe(`زر ${LRI}example.com${PDI}.`)
  })

  it('keeps Latin phrases together', () => {
    expect(isolate('اسأل Claude Code الآن')).toBe(`اسأل ${LRI}Claude Code${PDI} الآن`)
  })

  it('never changes the visible characters, is idempotent, and ignores other text', () => {
    for (const t of ['الإصدار 2.1 (beta) و(rc)', 'سعر (100 DH) فقط', '(abc الموقع', 'الموقع abc)', 'a(b) مرحبا c[d]']) {
      const once = isolate(t)
      expect(stripIsolates(once), t).toBe(t)
      expect(isolate(once), t).toBe(once)
    }
    expect(isolate('Hello (world)')).toBe('Hello (world)')
    expect(isolate('مرحبا بكم')).toBe('مرحبا بكم')
  })
})

describe('Files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rtl-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'a.css'), '.a { margin-left: 1px; transform: translateX(3px) }\n')
  writeFileSync(join(dir, 'b.tsx'), 'export const B = () => <div className="pl-1" />\n')
  writeFileSync(join(dir, 'c.test.tsx'), 'export const C = () => <div className="pl-1" />\n')
  writeFileSync(join(dir, 'd.md'), 'margin-left: 2px\n')

  it('walks a folder, skipping tests and other types', () => {
    expect(listFiles([dir]).map((f) => f.split(/[\\/]/).at(-1))).toEqual(['a.css', 'b.tsx'])
  })

  it('writes safe fixes back, keeps the rest, and is stable on a second run', () => {
    const first = auditPaths([dir], { fix: true })
    expect(first.fixedFiles).toBe(2)
    expect(first.fixedFindings).toBe(2)
    expect(readFileSync(join(dir, 'a.css'), 'utf8')).toBe('.a { margin-inline-start: 1px; transform: translateX(3px) }\n')
    expect(readFileSync(join(dir, 'b.tsx'), 'utf8')).toContain('className="ps-1"')
    const second = auditPaths([dir], { fix: true })
    expect(second.fixedFiles).toBe(0)
    expect(second.findings.map((f) => f.rule)).toEqual(['css-translate-x'])
  })
})

describe('React helpers', () => {
  it('knows which languages are right-to-left', () => {
    expect(['ar', 'ar-MA', 'fa', 'he', 'ur_PK'].every((l) => directionOf(l) === 'rtl')).toBe(true)
    expect(['fr', 'en-US', 'tr'].every((l) => directionOf(l) === 'ltr')).toBe(true)
  })

  it('sets the document direction and shares it', () => {
    const Show = () => <i>{useDirection()}</i>
    const { container, rerender } = render(
      <DirectionProvider lang="ar-MA">
        <Show />
      </DirectionProvider>,
    )
    expect(container.textContent).toBe('rtl')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar-MA')
    rerender(
      <DirectionProvider lang="fr">
        <Show />
      </DirectionProvider>,
    )
    expect(container.textContent).toBe('ltr')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('follows dir on the document', async () => {
    const Show = () => <i>{useDocumentDirection()}</i>
    document.documentElement.dir = 'ltr'
    const { container } = render(<Show />)
    expect(container.textContent).toBe('ltr')
    await act(async () => {
      document.documentElement.dir = 'rtl'
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(container.textContent).toBe('rtl')
  })

  it('isolates text in BidiText', () => {
    const { container } = render(<BidiText>افتح Node.js الآن</BidiText>)
    expect(container.textContent).toContain('⁦Node.js⁩')
  })
})
