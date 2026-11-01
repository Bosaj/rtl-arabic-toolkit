import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import { hasBidiRisk } from './bidi.js'
import { LOGICAL_PROPERTIES } from './css.js'
import { findPhysicalClasses, fixClasses } from './tailwind.js'
import { ignoredLines, type FileResult, type Finding } from './types.js'

/** style={{ marginLeft }} → the CSS rule table, in camelCase. */
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
const STYLE_PROPS: Record<string, string> = Object.fromEntries(Object.entries(LOGICAL_PROPERTIES).map(([k, v]) => [camel(k), camel(v)]))
const STYLE_VALUES: Record<string, Record<string, string>> = {
  textAlign: { left: 'start', right: 'end' },
  float: { left: 'inline-start', right: 'inline-end' },
  clear: { left: 'inline-start', right: 'inline-end' },
}

/** Icons that point somewhere, so they must mirror. Library names: lucide, Heroicons, Material, Phosphor, Font Awesome. */
const DIRECTIONAL_ICON =
  /^(Fa|Hi|Md|Bi|Io|Lu|Tb|Ri|Fi|Pi)?(Chevrons?|Arrows?|Caret|Angle|Angles|Move|Corner[A-Z]\w*|Keyboard(Double)?Arrow|Navigate|Long(Arrow)?|Step|Skip|Fast)?(Left|Right|Back|Forward|Before|Next|Prev|Previous)(Line|Circle|Icon|Outline|Solid|Bold|Fill|Rounded|Sharp|Ios|IosNew)*$/
const NOT_DIRECTIONAL = /^(Left|Right|Back|Forward|Next|Prev|Previous|Before|Step|Skip)(Icon)?$/
/** Classes or props that already mirror an icon. */
const MIRRORED = /rtl:(-?scale-x|-?rotate|rotate)|rtl-flip|mirror-rtl|flip-rtl|rtl-mirror/

/** Calls whose string arguments are class names. */
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classNames', 'classnames', 'twMerge', 'cva', 'cx', 'tv', 'twJoin'])
const TEXT_ATTRS = new Set(['title', 'placeholder', 'alt', 'aria-label', 'label'])

// A small structural view of the Babel AST: this file only reads the node kinds it names.
interface Node {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

function walk(node: Node, visit: (n: Node) => boolean | void) {
  if (visit(node) === false) return
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra' || key === 'comments' || key.endsWith('Comments')) continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, visit)
    } else if (isNode(value)) walk(value, visit)
  }
}

export function auditJsx(source: string, file = 'input.tsx'): FileResult {
  const findings: Finding[] = []
  const ignored = ignoredLines(source)
  const out = new MagicString(source)
  let ast: Node
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true }).program as unknown as Node
  } catch {
    return { findings, fixed: source }
  }

  const add = (node: Node, rule: string, severity: Finding['severity'], message: string, fix?: string) => {
    const at = node.loc?.start
    if (at && ignored.has(at.line)) return false
    findings.push({ file, line: at?.line ?? 1, column: (at?.column ?? 0) + 1, rule, severity, message, ...(fix ? { fix } : {}) })
    return true
  }

  /** Check the classes in one literal piece of text, and rewrite that piece in place. */
  const checkClasses = (node: Node, text: string, from: number, context = text) => {
    const fixes = findPhysicalClasses(context)
    const here = fixes.filter((f) => text.split(/\s+/).includes(f.from))
    if (here.length === 0) return
    const live = here.filter((f) => add(node, 'tailwind-physical-class', f.to ? 'error' : 'warn', f.to ? `"${f.from}" doesn't flip in RTL: use "${f.to}".` : `"${f.from}" stays on the same side in RTL.`, f.to))
    const changed = fixClasses(text, live)
    if (changed !== text) out.overwrite(from, from + text.length, changed)
  }

  const classesIn = (value: Node | null | undefined) => {
    if (!value) return
    walk(value, (n) => {
      if (n.type === 'StringLiteral' && typeof n.start === 'number') checkClasses(n, n.value as string, n.start + 1)
      if (n.type === 'TemplateElement' && typeof n.start === 'number') {
        const raw = (n.value as { raw: string }).raw
        checkClasses(n, raw, n.start)
      }
      if (n.type === 'ConditionalExpression') {
        // only the branches hold class names; the test can hold unrelated strings
        classesIn(n.consequent as Node)
        classesIn(n.alternate as Node)
        return false
      }
      if (n.type === 'BinaryExpression') return n.operator === '+' ? undefined : false
      return undefined
    })
  }

  const checkStyle = (object: Node) => {
    for (const prop of (object.properties as Node[]) ?? []) {
      if (prop.type !== 'ObjectProperty' || prop.computed) continue
      const key = prop.key as Node
      const name = key.type === 'Identifier' ? (key.name as string) : key.type === 'StringLiteral' ? (key.value as string) : ''
      const logical = STYLE_PROPS[name]
      if (logical && typeof key.start === 'number' && typeof key.end === 'number') {
        if (name === 'left' || name === 'right') {
          const other = name === 'left' ? 'right' : 'left'
          const partner = (object.properties as Node[]).find((p) => p.type === 'ObjectProperty' && ((p.key as Node).name === other || (p.key as Node).value === other))
          if (partner && source.slice((partner.value as Node).start!, (partner.value as Node).end!) === source.slice((prop.value as Node).start!, (prop.value as Node).end!)) continue
        }
        // A computed left is usually a coordinate (a pointer, a chart), measured from the left in any
        // direction: rewriting it would break RTL. Say so, and let a person decide.
        const computed = (name === 'left' || name === 'right') && !['NumericLiteral', 'StringLiteral'].includes((prop.value as Node).type)
        if (computed) {
          add(prop, 'style-computed-position', 'info', `style "${name}" is computed. If it is a coordinate, keep it. If it is a layout offset, use "${logical}".`)
          continue
        }
        if (add(prop, 'style-physical-property', 'error', `style "${name}" doesn't flip in RTL: use "${logical}".`, logical)) out.overwrite(key.start, key.end, logical)
        continue
      }
      const value = prop.value as Node
      const to = value.type === 'StringLiteral' ? STYLE_VALUES[name]?.[value.value as string] : undefined
      if (to && typeof value.start === 'number' && typeof value.end === 'number') {
        const q = source[value.start]
        if (add(prop, 'style-physical-value', 'error', `style ${name}: "${value.value as string}" doesn't flip in RTL: use "${to}".`, to)) out.overwrite(value.start, value.end, `${q}${to}${q}`)
      }
    }
  }

  walk(ast, (node) => {
    if (node.type === 'JSXOpeningElement') {
      const nameNode = node.name as Node
      const name = nameNode.type === 'JSXIdentifier' ? (nameNode.name as string) : nameNode.type === 'JSXMemberExpression' ? (((nameNode.property as Node).name as string) ?? '') : ''
      if (/^[A-Z]/.test(name) && DIRECTIONAL_ICON.test(name) && !NOT_DIRECTIONAL.test(name)) {
        const attrs = source.slice(node.start!, node.end!)
        if (!MIRRORED.test(attrs)) add(node, 'icon-not-mirrored', 'warn', `<${name}> points in a direction, so it must mirror in RTL. Add className="rtl:-scale-x-100".`)
      }
    }
    if (node.type === 'JSXAttribute') {
      const attrName = (node.name as Node).name as string
      const value = node.value as Node | null
      if (attrName === 'className' || attrName === 'class') {
        if (value?.type === 'StringLiteral') classesIn(value)
        else if (value?.type === 'JSXExpressionContainer') classesIn(value.expression as Node)
      }
      if (attrName === 'style' && value?.type === 'JSXExpressionContainer' && (value.expression as Node).type === 'ObjectExpression') checkStyle(value.expression as Node)
      if (TEXT_ATTRS.has(attrName) && value?.type === 'StringLiteral' && hasBidiRisk(value.value as string)) {
        add(node, 'bidi-mixed-text', 'info', `This Arabic text mixes in Latin or digits next to punctuation, which can reorder. Wrap it with isolate().`)
      }
    }
    if (node.type === 'JSXText' && hasBidiRisk((node.value as string).trim())) {
      add(node, 'bidi-mixed-text', 'info', `This Arabic text mixes in Latin or digits next to punctuation, which can reorder. Wrap the run in <bdi> or use isolate().`)
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee as Node
      if (callee.type === 'Identifier' && CLASS_HELPERS.has(callee.name as string) && !isInsideClassName(node)) {
        for (const arg of node.arguments as Node[]) classesIn(arg)
      }
    }
    return undefined
  })

  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return { findings: dedupe(findings), fixed: out.toString() }

  function isInsideClassName(call: Node) {
    return classNameRanges(ast).some(([a, b]) => call.start! >= a && call.end! <= b)
  }
}

const rangeCache = new WeakMap<object, [number, number][]>()
/** Calls inside className={...} are read through the attribute, so they aren't read twice. */
function classNameRanges(ast: Node): [number, number][] {
  let ranges = rangeCache.get(ast)
  if (ranges) return ranges
  ranges = []
  walk(ast, (n) => {
    if (n.type === 'JSXAttribute' && ['className', 'class'].includes((n.name as Node).name as string) && typeof n.start === 'number' && typeof n.end === 'number') ranges!.push([n.start, n.end])
    return undefined
  })
  rangeCache.set(ast, ranges)
  return ranges
}

function dedupe(findings: Finding[]) {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.line}:${f.column}:${f.rule}:${f.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
