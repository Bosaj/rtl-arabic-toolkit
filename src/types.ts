export type Severity = 'error' | 'warn' | 'info'

export interface Finding {
  file: string
  line: number
  column: number
  rule: string
  severity: Severity
  message: string
  /** The safe replacement, when one exists. */
  fix?: string
}

export interface FileResult {
  findings: Finding[]
  /** The source with every safe fix applied (same as the input when there are none). */
  fixed: string
}

/** Writing `rtl-ignore` in a comment on the same line or the line above silences that line. */
export function ignoredLines(source: string): Set<number> {
  const lines = source.split(/\r?\n/)
  const ignored = new Set<number>()
  lines.forEach((text, i) => {
    if (!text.includes('rtl-ignore')) return
    ignored.add(i + 1)
    ignored.add(i + 2)
  })
  return ignored
}
