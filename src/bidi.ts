/**
 * Mixed Arabic and Latin text goes wrong around neutral characters: "(Node.js)" loses its bracket,
 * "الإصدار 2.1 (beta)" reorders, a phone number splits. The Unicode fix is to isolate each
 * left-to-right run so the characters around it can't take part in its ordering.
 */

const LRI = '⁦'
const PDI = '⁩'
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const LATIN_OR_DIGIT = /[A-Za-z0-9]/
const NEUTRAL = /[()[\]{}<>:;,.!?\-–—/\\+%&*#@"'=_]/

/** A run of Latin or Western digits, with the punctuation that belongs to it, and any brackets around it. */
const LTR_RUN = /[([{]?[A-Za-z0-9+#@$€£][A-Za-z0-9.,:;@/\\_+\-–%&#'’=]*(?:[  ]+[A-Za-z0-9+#@$€£][A-Za-z0-9.,:;@/\\_+\-–%&#'’=]*)*[)\]}]?/g

export const hasArabic = (text: string) => ARABIC.test(text)

/** True when this text can display in the wrong order: Arabic, a Latin or digit run, and a neutral. */
export function hasBidiRisk(text: string): boolean {
  if (!hasArabic(text) || !LATIN_OR_DIGIT.test(text)) return false
  if (text.includes(LRI)) return false
  return NEUTRAL.test(text.replace(ARABIC, ''))
}

/** Isolate each left-to-right run in an Arabic string. Safe to call twice; other text is unchanged. */
export function isolate(text: string): string {
  if (!hasArabic(text) || text.includes(LRI)) return text
  return text.replace(LTR_RUN, (run) => {
    let body = run
    const open = /^[([{]/.exec(body)?.[0] ?? ''
    const close = /[)\]}]$/.exec(body)?.[0] ?? ''
    // An unbalanced bracket belongs to the Arabic around it, not to this run.
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
    if (open && pairs[open] !== close) {
      body = body.slice(1)
      if (close) body = body.slice(0, -1)
      return `${open}${LRI}${body}${PDI}${close}`
    }
    if (!open && close) {
      body = body.slice(0, -1)
      return `${LRI}${body}${PDI}${close}`
    }
    // Sentence punctuation at the end reads as part of the Arabic.
    const tail = /[.,:;]+$/.exec(body)?.[0] ?? ''
    if (tail) body = body.slice(0, -tail.length)
    return `${LRI}${body}${PDI}${tail}`
  })
}

/** Remove what isolate() added, for comparing or copying text. */
export const stripIsolates = (text: string) => text.replace(/[⁦⁧⁨⁩]/g, '')
