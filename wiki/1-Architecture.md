# 1. Architecture

1. Audit: scan CSS/JSX for RTL-unsafe patterns (left/right, float, hardcoded transforms on icons) and report file:line.
2. Codemod: rewrite physical CSS properties to logical ones automatically.
3. Helpers: React/Tailwind components + utilities that are RTL-correct by default.
4. Test harness: render each screen in both directions and diff screenshots to catch regressions.

## Proposed stack
- JS/TS library + CLI
- A CSS codemod to logical properties (margin-inline, inset-inline, text-align: start)
- A runtime/static audit that flags hardcoded left/right and direction leaks
- React + Tailwind helper presets
- Visual-regression test harness (Playwright) for LTR vs RTL

## Open bases to fork
- [rtlcss](https://github.com/MohammadYounes/rtlcss) — Auto-converts LTR CSS to RTL — most widely used; core engine to build on.
- [rtl-css-js](https://github.com/Andarist/rtl-css-js) — Same idea for CSS-in-JS.
- [bootstrap-v4-rtl](https://github.com/MahdiMajidzadeh/bootstrap-v4-rtl) — Reference RTL framework port.
- [rtlstyling.com](https://rtlstyling.com) — The best general RTL styling reference/guide.
