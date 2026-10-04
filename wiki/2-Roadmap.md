# 2. Roadmap

- v0.1 — audit CLI with the core rule set (file:line findings).
- v0.2 — codemod physical → logical CSS properties.
- v0.3 — React/Tailwind RTL-safe presets.
- v0.4 — Playwright visual-regression harness.

## Notes for contributors / LLM agents
- Build on rtlcss for the CSS-conversion engine instead of reimplementing it.
- Prefer CSS logical properties (inline/block) as the end state — most RTL bugs vanish once physical left/right are gone.
- The highest-value deliverable is the audit CLI: it turns an invisible problem into a checklist. Ship that first.
