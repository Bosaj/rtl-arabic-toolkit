# RTL Arabic Toolkit

> Finds and fixes the right-to-left layout bugs that keep coming back in Arabic web apps: an audit CLI, a codemod to logical properties, a runtime check that compares a page with its mirror image, and React and CSS helpers.

**Author:** Oussama Elhadji (`@Bosaj`) <oussousselhadji@gmail.com>.

```text
src/components/Hero.tsx:14:9   error  "ml-4" doesn't flip in RTL: use "ms-4".  tailwind-physical-class
src/components/Hero.tsx:22:7   warn   <ChevronLeft> points in a direction, so it must mirror in RTL. Add className="rtl:-scale-x-100".  icon-not-mirrored
src/styles.css:80:3            error  "margin-left" doesn't flip in RTL: use "margin-inline-start".  css-physical-property
src/styles.css:91:3            warn   "padding: 0 8px 0 0" sets left and right separately, so it won't flip. Use the -block and -inline longhands.  css-asymmetric-shorthand

42 files: 2 errors, 2 warnings, 0 notes. 2 can be fixed with --fix.
```

---

## Problem

Arabic layouts keep breaking: mirrored icons, wrong alignment, hardcoded left and right, punctuation jumping to the wrong end of a sentence. Tools like `rtlcss` convert stylesheets, but nothing tells you what is broken across a React and Tailwind codebase, or checks the page as it really renders.

## Quick start

```bash
npm install
npm run build
```

```bash
node dist/cli.js path/to/your/app/src
```

```bash
node dist/cli.js --fix path/to/your/app/src
```

```bash
node dist/cli.js check http://localhost:5173 --out rtl-check
```

Installed in a project, the command is `npx rtl-audit`. It isn't published on npm yet.

## 1. Audit

`rtl-audit [paths]` reads `.css`, `.scss`, `.html`, `.jsx` and `.tsx`, parsing each one properly rather than searching text, and reports `file:line:column`. It exits with 1 on errors, so it can guard CI.

| Rule | Level | Finds | `--fix` |
|---|---|---|---|
| `css-physical-property` | error | `margin-left`, `left`, `border-left`, `border-top-left-radius`… | ✓ |
| `css-physical-value` | error | `text-align: left`, `float: right`, `clear: left` | ✓ |
| `tailwind-physical-class` | error | `ml-4`, `pr-2`, `left-0`, `text-right`, `rounded-l-lg`, in `className`, templates, conditions, `cn()`, `clsx()`, `cva()`… | ✓ |
| `style-physical-property`, `style-physical-value` | error | `style={{ marginLeft: 4, textAlign: 'left' }}` | ✓ |
| `style-computed-position` | info | `style={{ left: pointer.x }}`: it may be a coordinate, so a person decides | |
| `html-missing-dir` | error | An Arabic page whose `<html>` has no `dir` | |
| `icon-not-mirrored` | warn | `<ChevronLeft>`, `<ArrowRight>`, `<FaArrowLeft>`… with no `rtl:` flip | |
| `css-asymmetric-shorthand` | warn | `padding: 0 8px 0 0`, `border-radius: 4px 0 0 4px` | |
| `css-physical-position` | warn | `background-position: left`, `transform-origin: right` | |
| `css-hardcoded-direction` | warn | `direction: ltr` in CSS | |
| `html-missing-lang` | warn | `dir="rtl"` without `lang` | |
| `css-row-reverse`, `css-translate-x`, `bidi-mixed-text` | info | Common workarounds and text that can reorder | |

**It avoids false alarms.** These are correct, so they aren't reported:

- Symmetric pairs: `left: 0; right: 0`, `ml-auto mr-auto`, `pl-4 pr-4`.
- Centring: `left: 50%` with `translateX(-50%)`, `left-1/2 -translate-x-1/2`.
- Code written for one direction: `[dir="rtl"] .a`, `:dir(rtl)`, `.rtl .a`, `rtl:ml-2`, `ltr:text-left`, a family the same class string already handles with `rtl:` and `ltr:`, and a rule that sets its own `direction`.
- Small drifts inside `@keyframes`.
- Anything with a comment containing `rtl-ignore`, on that line or the line above.

Run on my own apps, it takes well under a second per app. Reading the first results on this real code is what added the skips above, and the rule that a computed `left` is never rewritten, because it is often a coordinate.

| App | Files | Errors | Warnings | Notes |
|---|---|---|---|---|
| Hsabli | 12 | 0 | 0 | 1 |
| Inbox Bubble Map | 15 | 0 | 0 | 6 |
| L7ot | 29 | 24 | 4 | 5 |
| Shajara | 25 | 2 | 1 | 3 |
| Tarawih Display | 8 | 0 | 1 | 0 |

## 2. Codemod

`--fix` rewrites only what has an exact logical equivalent, and leaves formatting and comments alone: PostCSS for CSS, and precise text edits in JSX. The rest stays in the report for a person to decide. Run it twice and the second run changes nothing.

Tailwind's logical utilities need Tailwind 3.3 or later.

## 3. Runtime check

`rtl-audit check <url>` needs Playwright (`npm install playwright`). It opens the page in LTR and RTL, and:

- compares each element's box with where its mirror image should be, reporting the outermost element that is off;
- reports a page that scrolls sideways only in RTL;
- gives the share of pixels that differ from the mirrored page, and with `--out` saves `ltr.png`, `rtl.png` and `diff.png`.

Text never matches exactly pixel for pixel, so the box geometry decides pass or fail, and the images are the evidence. It finds what static analysis can't: JavaScript layout and third-party CSS. Parts with their own `dir`, `aria-hidden` decoration and the insides of SVGs are skipped.

## 4. Bidi text

Mixed Arabic and Latin goes wrong around neutral characters: `(Node.js)` loses its bracket, a phone number splits. `isolate()` wraps each left-to-right run in Unicode isolates, changing no visible character. It is safe to call twice.

```ts
import { isolate, stripIsolates, hasBidiRisk } from 'rtl-arabic-toolkit/bidi'

isolate('الإصدار (beta) هنا')
```

## 5. React and CSS helpers

```tsx
import { BidiText, DirectionProvider, Mirror, useDirection } from 'rtl-arabic-toolkit/react'

<DirectionProvider lang="ar-MA">
  <Mirror><ChevronLeft /></Mirror>
  <BidiText>افتح Node.js الآن</BidiText>
</DirectionProvider>
```

`rtl-arabic-toolkit/preset.css` adds `.mirror-rtl`, `.ltr-run` for phone numbers and code, `.auto-dir` for user text, and sensible defaults such as `letter-spacing: normal` on Arabic, which otherwise breaks the joined letters apart.

## Architecture

```
src/css.ts        PostCSS rules for CSS and SCSS
src/tailwind.ts   physical → logical class map, with the skip rules
src/jsx.ts        Babel AST: classes, inline styles, icons, mixed text
src/html.ts       <html dir/lang>, <style> blocks
src/audit.ts      file walking and writing fixes
src/check.ts      LTR/RTL mirror comparison in a real browser
src/bidi.ts       isolate() and friends
src/react.tsx     provider and components
src/cli.ts        the rtl-audit command
presets/rtl.css   the CSS preset
```

## Development

```bash
npm test
```

```bash
npm run typecheck
```

The mirror-check tests need a browser and are skipped without one. Set `CHROME` to a Chrome or Chromium path to run them.

## Roadmap

- [x] v0.1 — audit CLI with file:line findings — [#1](https://github.com/Bosaj/rtl-arabic-toolkit/issues/1)
- [x] v0.2 — codemod to logical properties, icon analysis — [#2](https://github.com/Bosaj/rtl-arabic-toolkit/issues/2), [#8](https://github.com/Bosaj/rtl-arabic-toolkit/issues/8), [#9](https://github.com/Bosaj/rtl-arabic-toolkit/issues/9)
- [x] v0.3 — React and CSS presets, bidi sanitizer — [#3](https://github.com/Bosaj/rtl-arabic-toolkit/issues/3), [#10](https://github.com/Bosaj/rtl-arabic-toolkit/issues/10)
- [x] v0.4 — LTR/RTL comparison in a real browser — [#4](https://github.com/Bosaj/rtl-arabic-toolkit/issues/4), [#11](https://github.com/Bosaj/rtl-arabic-toolkit/issues/11)
- [ ] Vue and Svelte files; publish on npm

## For LLM agents & contributors continuing this project

- A false alarm costs more than a missed bug: people switch a noisy linter off. Every new rule needs tests for what it must *not* report.
- `--fix` rewrites only exact equivalents. If a change could alter the layout in LTR, make it report-only.
- Follow Conventional Commits (see `CONTRIBUTING.md`).

## 📄 License
**Proprietary & Commercial Software License** — All Rights Reserved © 2026 Oussama Elhadji (`@Bosaj`) <[oussousselhadji@gmail.com](mailto:oussousselhadji@gmail.com)>.

Unauthorized copying, distribution, resale, or reverse engineering is strictly prohibited. See [LICENSE](LICENSE) for full legal terms.
