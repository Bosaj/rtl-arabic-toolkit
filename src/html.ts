import { hasArabic } from './bidi.js'
import { auditCss } from './css.js'
import { ignoredLines, type FileResult, type Finding } from './types.js'

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length

/** HTML: the document's direction, plus any <style> blocks. */
export function auditHtml(source: string, file = 'input.html'): FileResult {
  const findings: Finding[] = []
  const ignored = ignoredLines(source)
  const html = /<html\b[^>]*>/i.exec(source)
  const text = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
  if (html) {
    const tag = html[0]
    const lang = /\blang=["']?(ar|fa|he|ur|ps|ku)\b/i.test(tag)
    const hasDir = /\bdir=/i.test(tag)
    if (!hasDir && (lang || hasArabic(text))) {
      const line = lineOf(source, html.index)
      if (!ignored.has(line)) findings.push({ file, line, column: 1, rule: 'html-missing-dir', severity: 'error', message: 'This page is in a right-to-left language, but <html> has no dir attribute.' })
    }
    if (hasDir && /\bdir=["']?rtl/i.test(tag) && !/\blang=/i.test(tag)) {
      const line = lineOf(source, html.index)
      if (!ignored.has(line)) findings.push({ file, line, column: 1, rule: 'html-missing-lang', severity: 'warn', message: 'dir="rtl" without lang: screen readers and fonts need the language too.' })
    }
  }

  let fixed = source
  const blocks = [...source.matchAll(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi)]
  for (const block of blocks.reverse()) {
    const css = block[2] ?? ''
    const start = (block.index ?? 0) + (block[1]?.length ?? 0)
    const result = auditCss(css, file)
    const offset = lineOf(source, start) - 1
    findings.push(...result.findings.map((f) => ({ ...f, line: f.line + offset })))
    fixed = fixed.slice(0, start) + result.fixed + fixed.slice(start + css.length)
  }
  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return { findings, fixed }
}
