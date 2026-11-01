# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-01
### Added
- `rtl-audit`, a CLI that reports right-to-left bugs in CSS, SCSS, HTML, JSX and TSX as file:line, including Tailwind classes, inline styles and icons that don't mirror.
- `--fix`, a codemod that rewrites only exact equivalents to logical properties and classes.
- `rtl-audit check <url>`, which renders a page in both directions and compares it with its mirror image, in a real browser.
- `isolate()` for mixed Arabic and Latin text, React helpers and a CSS preset.

### Changed
- CI now fails when tests or the build fail.

### Removed
- The Python regex stub, which rewrote text inside any line.

## [0.1.0] - 2026-10-18
### Added
- Initial repository scaffold: README (with architecture, roadmap and an LLM-handoff section), LICENSE, .gitignore, CONTRIBUTING, issue/PR templates, and wiki pages.
