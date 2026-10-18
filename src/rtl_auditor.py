"""
RTL Arabic Toolkit: Layout Bug Detector & CSS Logical Properties Migrator
Inspired by modern UI/UX Pro Max standards for bidirectional (BiDi) web applications.
Features:
- Scans CSS/HTML/JSX files for physical direction properties (margin-left, text-align: left, etc.)
- Recommends or automatically converts to CSS Logical Properties (margin-inline-start, etc.)
- Detects untagged Arabic / RTL text lacking `dir="rtl"` attributes
"""

import re
from typing import Any, Dict, List, Tuple


class RTLAuditor:
    """Audits web assets for Right-to-Left styling regressions and bugs."""

    PHYSICAL_PROPERTIES_MAP = {
        r"margin-left": "margin-inline-start",
        r"margin-right": "margin-inline-end",
        r"padding-left": "padding-inline-start",
        r"padding-right": "padding-inline-end",
        r"left\s*:\s*": "inset-inline-start: ",
        r"right\s*:\s*": "inset-inline-end: ",
        r"text-align\s*:\s*left": "text-align: start",
        r"text-align\s*:\s*right": "text-align: end",
        r"float\s*:\s*left": "float: inline-start",
        r"float\s*:\s*right": "float: inline-end",
        r"border-left": "border-inline-start",
        r"border-right": "border-inline-end",
    }

    ARABIC_CHAR_PATTERN = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")

    @classmethod
    def audit_css(cls, css_content: str) -> List[Dict[str, Any]]:
        """Audits CSS content and returns occurrences of physical direction properties."""
        findings = []
        lines = css_content.splitlines()
        for idx, line in enumerate(lines, 1):
            for pattern, logical_replacement in cls.PHYSICAL_PROPERTIES_MAP.items():
                if re.search(pattern, line):
                    findings.append({
                        "line": idx,
                        "original_line": line.strip(),
                        "property_detected": pattern,
                        "suggested_fix": logical_replacement,
                        "rule": "Use CSS Logical Properties for seamless LTR/RTL support."
                    })
        return findings

    @classmethod
    def migrate_css(cls, css_content: str) -> Tuple[str, int]:
        """Automatically replaces physical CSS properties with logical equivalents."""
        migrated = css_content
        replacements_count = 0
        for pattern, replacement in cls.PHYSICAL_PROPERTIES_MAP.items():
            matches = len(re.findall(pattern, migrated))
            if matches > 0:
                migrated = re.sub(pattern, replacement, migrated)
                replacements_count += matches
        return migrated, replacements_count

    @classmethod
    def detect_missing_dir_attribute(cls, html_snippet: str) -> bool:
        """Returns True if Arabic text is present without dir='rtl' on parent tag."""
        has_arabic = bool(cls.ARABIC_CHAR_PATTERN.search(html_snippet))
        has_rtl_dir = 'dir="rtl"' in html_snippet or "dir='rtl'" in html_snippet
        return has_arabic and not has_rtl_dir
