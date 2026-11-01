#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { auditPaths } from './audit.js'
import type { Finding, Severity } from './types.js'

const HELP = `rtl-audit: find and fix right-to-left layout bugs

  rtl-audit [paths...]        report bugs as file:line (default path: .)
  rtl-audit --fix [paths...]  also rewrite what can be fixed safely
  rtl-audit check <url>       render a page in LTR and RTL and compare them

Options
  --fix              apply safe fixes (physical CSS and Tailwind to logical)
  --json             machine-readable output
  --fail-on <level>  exit 1 at this level or above: error (default), warn, info, none
  --rule <id>        only this rule (repeatable)
  --out <dir>        check: save ltr.png, rtl.png, diff.png here
  --width <px>       check: viewport width (default 1280)
  --tolerance <px>   check: how far from the mirror position is allowed (default 4)
  -h, --help         this help

Silence a line with a comment containing rtl-ignore, on that line or the line above.`

const RANK: Record<Severity | 'none', number> = { info: 1, warn: 2, error: 3, none: 99 }
const color = process.stdout.isTTY ? (code: number, s: string) => `\u001b[${code}m${s}\u001b[0m` : (_: number, s: string) => s
const LABEL: Record<Severity, string> = { error: color(31, 'error'), warn: color(33, 'warn '), info: color(36, 'info ') }

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fix: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    'fail-on': { type: 'string', default: 'error' },
    rule: { type: 'string', multiple: true },
    out: { type: 'string' },
    width: { type: 'string' },
    tolerance: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

if (positionals[0] === 'check') {
  const url = positionals[1]
  if (!url) {
    console.error('rtl-audit check needs a URL.')
    process.exit(2)
  }
  const { checkUrl } = await import('./check.js')
  const result = await checkUrl(url, {
    ...(values.width ? { width: Number(values.width) } : {}),
    ...(values.tolerance ? { tolerance: Number(values.tolerance) } : {}),
    ...(values.out ? { outDir: values.out } : {}),
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  })
  if (values.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`${result.url} at ${result.width}px: ${result.elements} elements compared, ${(result.pixelDiff * 100).toFixed(1)}% of pixels differ from the mirror image`)
    if (result.overflow.rtlOnly) console.log(`${LABEL.error}  the page scrolls sideways in RTL only (${result.overflow.rtl}px wide)`)
    for (const i of result.issues.slice(0, 40)) console.log(`${LABEL.warn}  ${i.selector} is ${i.offBy}px from its mirror position${i.text ? `  "${i.text}"` : ''}`)
    if (!result.elements) console.log('Nothing was compared: everything sits under an element with its own dir attribute, which this check skips.')
    else if (!result.issues.length && !result.overflow.rtlOnly) console.log('No layout differences found.')
  }
  process.exit(result.issues.length || result.overflow.rtlOnly ? 1 : 0)
}

const report = auditPaths(positionals.length ? positionals : ['.'], { fix: values.fix })
const rules = values.rule
const findings: Finding[] = rules?.length ? report.findings.filter((f) => rules.includes(f.rule)) : report.findings

if (values.json) {
  console.log(JSON.stringify({ ...report, findings }, null, 2))
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.column}  ${LABEL[f.severity]}  ${f.message}  ${color(90, f.rule)}`)
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length
  const fixable = findings.filter((f) => f.fix).length
  console.log(`\n${report.files} files: ${count('error')} errors, ${count('warn')} warnings, ${count('info')} notes.${values.fix ? ` Fixed ${report.fixedFindings} in ${report.fixedFiles} files.` : fixable ? ` ${fixable} can be fixed with --fix.` : ''}`)
}

const threshold = RANK[(values['fail-on'] as Severity | 'none') ?? 'error'] ?? RANK.error
const remaining = values.fix ? findings.filter((f) => !f.fix) : findings
process.exit(remaining.some((f) => RANK[f.severity] >= threshold) ? 1 : 0)
