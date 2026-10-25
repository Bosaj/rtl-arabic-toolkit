# RTL Arabic Toolkit

> A toolkit + audit CLI that finds and fixes the recurring right-to-left (Arabic) layout bugs in web apps.

**Status:** pre-alpha scaffold (no code yet). **Feasibility rating:** 6/10 — real, ongoing pain for Arabic developers.
**Author:** Oussama Elhadji (`@Bosaj`) <oussousselhadji@gmail.com>.

---

## Problem

Arabic (RTL) layouts keep breaking across apps and websites: mirrored icons, wrong text alignment, hardcoded left/right, direction leaks in flex/grid. Fixes are ad-hoc and bugs recur.

## Why build it (gap analysis)

Partial tools exist (dir="rtl", rtlcss, rtl-css-js) but there is no universal fix because the bugs are inconsistent per app. The realistic product is a library + QA-audit CLI, not a single magic switch.

## Prior art & open bases to fork

- [rtlcss](https://github.com/MohammadYounes/rtlcss) — Auto-converts LTR CSS to RTL — most widely used; core engine to build on.
- [rtl-css-js](https://github.com/Andarist/rtl-css-js) — Same idea for CSS-in-JS.
- [bootstrap-v4-rtl](https://github.com/MahdiMajidzadeh/bootstrap-v4-rtl) — Reference RTL framework port.
- [rtlstyling.com](https://rtlstyling.com) — The best general RTL styling reference/guide.

## Proposed architecture

1. Audit: scan CSS/JSX for RTL-unsafe patterns (left/right, float, hardcoded transforms on icons) and report file:line.
2. Codemod: rewrite physical CSS properties to logical ones automatically.
3. Helpers: React/Tailwind components + utilities that are RTL-correct by default.
4. Test harness: render each screen in both directions and diff screenshots to catch regressions.

## Tech stack (proposed)

- JS/TS library + CLI
- A CSS codemod to logical properties (margin-inline, inset-inline, text-align: start)
- A runtime/static audit that flags hardcoded left/right and direction leaks
- React + Tailwind helper presets
- Visual-regression test harness (Playwright) for LTR vs RTL

## Roadmap

- v0.1 — audit CLI with the core rule set (file:line findings).
- v0.2 — codemod physical → logical CSS properties.
- v0.3 — React/Tailwind RTL-safe presets.
- v0.4 — Playwright visual-regression harness.

---

## For LLM agents & contributors continuing this project

This repo is a **scaffold**: README + standard files, no implementation yet. If you are an AI agent asked to "continue developing", read this section first.

- Build on rtlcss for the CSS-conversion engine instead of reimplementing it.
- Prefer CSS logical properties (inline/block) as the end state — most RTL bugs vanish once physical left/right are gone.
- The highest-value deliverable is the audit CLI: it turns an invisible problem into a checklist. Ship that first.

**Ground rules:** keep this README in sync with reality as you build; prefer forking/reusing the bases above over greenfield code; write tests for anything correctness-critical; never commit secrets (see `.gitignore`); follow Conventional Commits (see `CONTRIBUTING.md`).

## Getting started

```bash
# nothing to run yet — this is a scaffold.
# npm install && npm run dev   # once code lands
```

## 📄 License
**Proprietary & Commercial Software License** — All Rights Reserved © 2026 Oussama Elhadji (`@Bosaj`) <[oussousselhadji@gmail.com](mailto:oussousselhadji@gmail.com)>.

Unauthorized copying, distribution, resale, or reverse engineering is strictly prohibited. See [LICENSE](LICENSE) for full legal terms.
