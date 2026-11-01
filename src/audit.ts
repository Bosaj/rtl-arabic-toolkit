import { globSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { auditCss } from './css.js'
import { auditHtml } from './html.js'
import { auditJsx } from './jsx.js'
import type { FileResult, Finding } from './types.js'

const EXTENSIONS = new Set(['.css', '.scss', '.html', '.htm', '.jsx', '.tsx'])
const SKIP = /(^|[\\/])(node_modules|dist|build|out|\.next|\.nuxt|\.vite|\.git|coverage|vendor|public[\\/]fonts)([\\/]|$)|\.min\.css$|\.d\.ts$|\.(test|spec|stories)\.[jt]sx?$/

export function auditSource(source: string, file: string): FileResult {
  const ext = extname(file).toLowerCase()
  if (ext === '.css' || ext === '.scss') return auditCss(source, file)
  if (ext === '.html' || ext === '.htm') return auditHtml(source, file)
  if (ext === '.jsx' || ext === '.tsx') return auditJsx(source, file)
  return { findings: [], fixed: source }
}

export function listFiles(paths: string[]): string[] {
  const out = new Set<string>()
  for (const path of paths) {
    let isDir = false
    try {
      isDir = statSync(path).isDirectory()
    } catch {
      /* not a path: maybe a glob */
    }
    const matches = isDir ? globSync('**/*', { cwd: path }).map((f) => join(path, String(f))) : globSync(path).map(String)
    for (const f of matches) {
      if (SKIP.test(f) || !EXTENSIONS.has(extname(f).toLowerCase())) continue
      try {
        if (statSync(f).isFile()) out.add(f)
      } catch {
        /* vanished while scanning */
      }
    }
  }
  return [...out].sort()
}

export interface AuditReport {
  files: number
  findings: Finding[]
  fixedFiles: number
  fixedFindings: number
}

/** Audit files, and optionally write every safe fix back to them. */
export function auditPaths(paths: string[], { fix = false }: { fix?: boolean } = {}): AuditReport {
  const files = listFiles(paths)
  const findings: Finding[] = []
  let fixedFiles = 0
  let fixedFindings = 0
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    let result: FileResult
    try {
      result = auditSource(source, file)
    } catch (err) {
      findings.push({ file, line: 1, column: 1, rule: 'parse-error', severity: 'info', message: `Could not read this file: ${(err as Error).message.split('\n')[0]}` })
      continue
    }
    findings.push(...result.findings)
    if (fix && result.fixed !== source) {
      writeFileSync(file, result.fixed)
      fixedFiles++
      fixedFindings += result.findings.filter((f) => f.fix).length
    }
  }
  return { files: files.length, findings, fixedFiles, fixedFindings }
}
