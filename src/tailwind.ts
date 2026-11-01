/** Physical Tailwind utility prefix → logical one (Tailwind 3.3+ and 4). */
const PREFIXES: [string, string][] = [
  ['scroll-ml-', 'scroll-ms-'],
  ['scroll-mr-', 'scroll-me-'],
  ['scroll-pl-', 'scroll-ps-'],
  ['scroll-pr-', 'scroll-pe-'],
  ['ml-', 'ms-'],
  ['mr-', 'me-'],
  ['pl-', 'ps-'],
  ['pr-', 'pe-'],
  ['left-', 'start-'],
  ['right-', 'end-'],
  ['border-l-', 'border-s-'],
  ['border-r-', 'border-e-'],
  ['rounded-tl-', 'rounded-ss-'],
  ['rounded-tr-', 'rounded-se-'],
  ['rounded-bl-', 'rounded-es-'],
  ['rounded-br-', 'rounded-ee-'],
  ['rounded-l-', 'rounded-s-'],
  ['rounded-r-', 'rounded-e-'],
]

const EXACT: Record<string, string> = {
  'text-left': 'text-start',
  'text-right': 'text-end',
  'float-left': 'float-start',
  'float-right': 'float-end',
  'clear-left': 'clear-start',
  'clear-right': 'clear-end',
  'border-l': 'border-s',
  'border-r': 'border-e',
  'rounded-l': 'rounded-s',
  'rounded-r': 'rounded-e',
  'rounded-tl': 'rounded-ss',
  'rounded-tr': 'rounded-se',
  'rounded-bl': 'rounded-es',
  'rounded-br': 'rounded-ee',
}

/** No logical equivalent exists: report them, but there is nothing safe to rewrite to. */
const REPORT_ONLY = /^(origin-(top-|bottom-)?(left|right)|bg-(left|right)(-top|-bottom)?|object-(left|right)(-top|-bottom)?)$/

export interface ClassFix {
  from: string
  to?: string
}

interface Token {
  variants: string
  important: string
  negative: string
  utility: string
}

function parseToken(token: string): Token {
  // Variants end at the last ":" outside brackets (hover:md:ml-[calc(1px:2px)])
  let depth = 0
  let split = -1
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    else if (ch === ':' && depth === 0) split = i
  }
  const variants = token.slice(0, split + 1)
  let rest = token.slice(split + 1)
  let important = ''
  let negative = ''
  if (rest.startsWith('!')) {
    important = '!'
    rest = rest.slice(1)
  }
  if (rest.startsWith('-')) {
    negative = '-'
    rest = rest.slice(1)
  }
  return { variants, important, negative, utility: rest }
}

function logical(utility: string): string | null {
  const exact = EXACT[utility]
  if (exact) return exact
  for (const [from, to] of PREFIXES) if (utility.startsWith(from) && utility.length > from.length) return to + utility.slice(from.length)
  return null
}

/** Which side-specific family a utility belongs to, and on which side, for spotting symmetric pairs. */
function sided(utility: string): { key: string; side: 'l' | 'r' } | null {
  const m = /^(scroll-m|scroll-p|m|p)(l|r)-(.+)$/.exec(utility)
  if (m) return { key: `${m[1]}-${m[3]}`, side: m[2] as 'l' | 'r' }
  const pos = /^(left|right)-(.+)$/.exec(utility)
  if (pos) return { key: `inset-${pos[2]}`, side: pos[1] === 'left' ? 'l' : 'r' }
  const border = /^border-(l|r)(-.+)?$/.exec(utility)
  if (border) return { key: `border${border[2] ?? ''}`, side: border[1] as 'l' | 'r' }
  const round = /^rounded-(l|r)(-.+)?$/.exec(utility)
  if (round) return { key: `rounded${round[2] ?? ''}`, side: round[1] as 'l' | 'r' }
  return null
}

/**
 * The physical utilities in a class string that would not flip. Skipped because they are correct as
 * they are: anything under an rtl: or ltr: variant or a family the string already handles that way,
 * symmetric pairs (ml-auto mr-auto, left-0 right-0) and centring (left-1/2 -translate-x-1/2).
 */
export function findPhysicalClasses(classes: string): ClassFix[] {
  const tokens = classes.split(/\s+/).filter(Boolean).map((raw) => ({ raw, ...parseToken(raw) }))
  const present = new Map<string, Set<string>>()
  for (const t of tokens) {
    const s = sided(t.utility)
    if (!s) continue
    const key = `${t.variants}${t.negative}${s.key}`
    if (!present.has(key)) present.set(key, new Set())
    present.get(key)!.add(s.side)
  }
  // "right-4 rtl:right-4 ltr:left-4": the author already handles each direction for this family
  const handled = new Set<string>()
  for (const t of tokens) {
    const key = sided(t.utility)?.key
    if (key && /(^|:)(rtl|ltr):/.test(t.variants)) handled.add(key)
  }
  const fixes: ClassFix[] = []
  for (const t of tokens) {
    if (/(^|:)(rtl|ltr):/.test(t.variants)) continue
    const s = sided(t.utility)
    if (s && handled.has(s.key)) continue
    if (s && present.get(`${t.variants}${t.negative}${s.key}`)?.size === 2) continue
    if (t.utility === 'left-1/2' && tokens.some((o) => o.variants === t.variants && o.negative === '-' && o.utility === 'translate-x-1/2')) continue
    const to = logical(t.utility)
    if (to) fixes.push({ from: t.raw, to: `${t.variants}${t.important}${t.negative}${to}` })
    else if (REPORT_ONLY.test(t.utility)) fixes.push({ from: t.raw })
  }
  return fixes
}

/** Apply the safe fixes to a class string, keeping its spacing. */
export function fixClasses(classes: string, fixes: ClassFix[]): string {
  const map = new Map(fixes.filter((f) => f.to).map((f) => [f.from, f.to!]))
  return classes.replace(/\S+/g, (t) => map.get(t) ?? t)
}
