import { createContext, useContext, useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react'
import { isolate } from './bidi.js'

export type Direction = 'rtl' | 'ltr'

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'ku', 'sd', 'yi', 'dv'])

/** The direction a language is written in: ar-MA, fa and he are RTL. */
export const directionOf = (lang: string): Direction => (RTL_LANGS.has(lang.toLowerCase().split(/[-_]/)[0] ?? '') ? 'rtl' : 'ltr')

const Context = createContext<Direction>('ltr')

/** Sets lang and dir on <html> and makes the direction available to useDirection(). */
export function DirectionProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const dir = directionOf(lang)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])
  return <Context.Provider value={dir}>{children}</Context.Provider>
}

export const useDirection = () => useContext(Context)

/** Follows dir on <html>, for pages without a provider. */
export function useDocumentDirection(): Direction {
  const [dir, setDir] = useState<Direction>(() => (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'))
  useEffect(() => {
    const read = () => setDir(document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr')
    read()
    const watcher = new MutationObserver(read)
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] })
    return () => watcher.disconnect()
  }, [])
  return dir
}

/** Mirrors whatever it holds in RTL. Use it around icons that point somewhere. */
export function Mirror({ children, className = '', ...rest }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return (
    <span {...rest} className={`mirror-rtl inline-flex ${className}`.trim()}>
      {children}
    </span>
  )
}

/** Mixed Arabic and Latin text in the right order, whatever surrounds it. */
export function BidiText({ children }: { children: string }) {
  const text = useMemo(() => isolate(children), [children])
  return <>{text}</>
}
