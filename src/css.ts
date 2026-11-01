import postcss, { type ChildNode, type Container, type Declaration, type Rule } from 'postcss'
import scss from 'postcss-scss'
import { ignoredLines, type FileResult, type Finding } from './types.js'

/** Physical property → logical property. Each of these flips correctly once converted. */
export const LOGICAL_PROPERTIES: Record<string, string> = {
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',
  left: 'inset-inline-start',
  right: 'inset-inline-end',
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  'border-left-width': 'border-inline-start-width',
  'border-right-width': 'border-inline-end-width',
  'border-left-color': 'border-inline-start-color',
  'border-right-color': 'border-inline-end-color',
  'border-left-style': 'border-inline-start-style',
  'border-right-style': 'border-inline-end-style',
  'border-top-left-radius': 'border-start-start-radius',
  'border-top-right-radius': 'border-start-end-radius',
  'border-bottom-left-radius': 'border-end-start-radius',
  'border-bottom-right-radius': 'border-end-end-radius',
  'scroll-margin-left': 'scroll-margin-inline-start',
  'scroll-margin-right': 'scroll-margin-inline-end',
  'scroll-padding-left': 'scroll-padding-inline-start',
  'scroll-padding-right': 'scroll-padding-inline-end',
}

/** Properties whose keyword value is physical. */
const LOGICAL_VALUES: Record<string, Record<string, string>> = {
  'text-align': { left: 'start', right: 'end' },
  float: { left: 'inline-start', right: 'inline-end' },
  clear: { left: 'inline-start', right: 'inline-end' },
}

/** A selector that already says which direction it is for is deliberate. */
const DIRECTIONAL_SELECTOR = /\[dir\b|:dir\(|\.rtl\b|\.ltr\b|:lang\(ar/i

/** Four-value shorthands whose 2nd and 4th values differ are left/right in disguise. */
const FOUR_VALUE = new Set(['margin', 'padding', 'border-width', 'border-color', 'border-style', 'inset', 'scroll-margin', 'scroll-padding'])

function splitValues(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (current) out.push(current)
      current = ''
    } else current += ch
  }
  if (current) out.push(current)
  return out.filter((v) => v !== '!important')
}

function isDeliberate(decl: Declaration): boolean {
  let node: Container | undefined = decl.parent as Container | undefined
  while (node) {
    if (node.type === 'rule' && DIRECTIONAL_SELECTOR.test((node as Rule).selector)) return true
    // The same rule fixes the direction, so its left and right are meant: .quran { direction: rtl; text-align: right }
    if (node.type === 'rule' && decl.prop !== 'direction' && (node as Rule).nodes.some((n) => n.type === 'decl' && n.prop === 'direction')) return true
    node = node.parent as Container | undefined
  }
  return false
}

function siblings(decl: Declaration): Declaration[] {
  const nodes = (decl.parent as Container | undefined)?.nodes ?? []
  return nodes.filter((n: ChildNode): n is Declaration => n.type === 'decl')
}

/**
 * `left: 0; right: 0` and `margin-left: auto; margin-right: auto` look the same in both directions,
 * and `left: 50%` with `translateX(-50%)` is centring. None of them is a bug, so none is reported.
 */
function isSymmetric(decl: Declaration): boolean {
  const prop = decl.prop.toLowerCase()
  const others = siblings(decl)
  const value = decl.value.trim()
  const partner = prop.includes('left') ? prop.replace('left', 'right') : prop.includes('right') ? prop.replace('right', 'left') : null
  if (partner && !prop.includes('radius') && others.some((d) => d.prop.toLowerCase() === partner && d.value.trim() === value)) return true
  if (prop === 'left' && value === '50%' && others.some((d) => d.prop === 'transform' && /translate(x)?\(\s*-50%/i.test(d.value))) return true
  return false
}

export function auditCss(source: string, file = 'input.css'): FileResult {
  const findings: Finding[] = []
  const ignored = ignoredLines(source)
  const isScss = file.endsWith('.scss')
  const root = isScss ? scss.parse(source, { from: file }) : postcss.parse(source, { from: file })

  const report = (decl: Declaration, rule: string, severity: Finding['severity'], message: string, fix?: string) => {
    const at = decl.source?.start
    findings.push({ file, line: at?.line ?? 1, column: at?.column ?? 1, rule, severity, message, ...(fix ? { fix } : {}) })
  }

  root.walkDecls((decl) => {
    const line = decl.source?.start?.line ?? 0
    if (ignored.has(line) || isDeliberate(decl)) return
    const prop = decl.prop.toLowerCase()
    const value = decl.value.trim()

    const logical = LOGICAL_PROPERTIES[prop]
    if (logical) {
      if (isSymmetric(decl)) return
      report(decl, 'css-physical-property', 'error', `"${prop}" doesn't flip in RTL: use "${logical}".`, `${logical}: ${value}`)
      decl.prop = logical
      return
    }

    const keyword = LOGICAL_VALUES[prop]?.[value.toLowerCase()]
    if (keyword) {
      report(decl, 'css-physical-value', 'error', `"${prop}: ${value}" doesn't flip in RTL: use "${prop}: ${keyword}".`, `${prop}: ${keyword}`)
      decl.value = keyword
      return
    }

    if (FOUR_VALUE.has(prop)) {
      const parts = splitValues(value)
      if (parts.length === 4 && parts[1] !== parts[3]) {
        report(decl, 'css-asymmetric-shorthand', 'warn', `"${prop}: ${value}" sets left and right separately, so it won't flip. Use the -block and -inline longhands.`)
      }
      return
    }
    if (prop === 'border-radius') {
      const parts = splitValues(value.split('/')[0] ?? value)
      if (parts.length === 4 && (parts[0] !== parts[1] || parts[2] !== parts[3])) {
        report(decl, 'css-asymmetric-shorthand', 'warn', `"border-radius: ${value}" sets each corner, so it won't flip. Use border-start-start-radius and friends.`)
      }
      return
    }
    if (prop === 'direction' && /^(ltr|rtl)$/i.test(value)) {
      report(decl, 'css-hardcoded-direction', 'warn', `"direction: ${value}" fixes the direction in CSS. Prefer the dir attribute, and keep this only for content that really is one-directional.`)
      return
    }
    if (prop === 'flex-direction' && /-reverse$/.test(value) && /row/.test(value)) {
      report(decl, 'css-row-reverse', 'info', `"${value}" is often an RTL workaround: dir="rtl" already reverses a flex row, so it may flip twice.`)
      return
    }
    // Inside @keyframes a small drift is decoration; only a slide across the whole element matters.
    const inKeyframes = (decl.parent?.parent as { name?: string } | undefined)?.name?.endsWith('keyframes') === true
    if ((prop === 'transform' || prop === 'translate') && inKeyframes && !/translate(x|3d)?\(\s*-?100%/i.test(value)) return
    if ((prop === 'transform' || prop === 'translate') && /translate(x|3d)?\(\s*-?[1-9]/i.test(value) && !/-50%/.test(value)) {
      report(decl, 'css-translate-x', 'info', `"${value}" moves along the physical x-axis and won't flip in RTL.`)
      return
    }
    if ((prop === 'background-position' || prop === 'background-position-x' || prop === 'transform-origin') && /\b(left|right)\b/i.test(value)) {
      report(decl, 'css-physical-position', 'warn', `"${prop}: ${value}" stays on the same side in RTL.`)
    }
  })

  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return { findings, fixed: isScss ? root.toString(scss.stringify) : root.toString() }
}
