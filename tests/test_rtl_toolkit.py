import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
from rtl_auditor import RTLAuditor


class TestRTLAuditor(unittest.TestCase):
    def test_audit_css_finds_physical_properties(self):
        css = """.btn {
            margin-left: 10px;
            text-align: left;
        }"""
        findings = RTLAuditor.audit_css(css)
        self.assertEqual(len(findings), 2)
        props = [f["property_detected"] for f in findings]
        self.assertIn("margin-left", props)

    def test_migrate_css(self):
        css = ".card { margin-left: 16px; padding-right: 8px; }"
        migrated, count = RTLAuditor.migrate_css(css)
        self.assertEqual(count, 2)
        self.assertIn("margin-inline-start: 16px", migrated)
        self.assertIn("padding-inline-end: 8px", migrated)

    def test_detect_missing_dir_attribute(self):
        bad_html = "<div>مرحبا بكم في المغرب</div>"
        good_html = '<div dir="rtl">مرحبا بكم في المغرب</div>'
        self.assertTrue(RTLAuditor.detect_missing_dir_attribute(bad_html))
        self.assertFalse(RTLAuditor.detect_missing_dir_attribute(good_html))


if __name__ == "__main__":
    unittest.main()
