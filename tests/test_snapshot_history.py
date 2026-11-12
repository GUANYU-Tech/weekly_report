from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from weekly_intel.db import Database
from weekly_intel.site_export import SiteDataExportAgent


class SnapshotHistoryTest(unittest.TestCase):
    def test_partial_database_preserves_history_and_updates_current_status(self):
        root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            database = Database(directory / "weekly.db")
            database.initialize(root / "schemas/weekly_intel.sql")
            output = directory / "department-data.json"
            old = {"issue": {"id": "old", "departmentId": "orbitinfer",
                             "isoWeek": "2026-W36", "status": "published"},
                   "trends": ["Preserved evidence"], "sections": []}
            stale = {"issue": {"id": "stale", "departmentId": "orbitinfer",
                               "isoWeek": "2026-W37", "status": "review"}}
            output.write_text(json.dumps({"departments": [
                {"id": "orbitinfer", "archive": [stale, old]}
            ]}))
            exporter = SiteDataExportAgent()
            with database.transaction() as connection:
                connection.execute("""
                    INSERT INTO weekly_issues (
                        issue_id, department_id, iso_week, window_start, window_end,
                        status, title, target_read_minutes, generated_at
                    ) VALUES ('current', 'orbitinfer', '2026-W45', '2026-11-02',
                              '2026-11-08', 'review', 'Current', 30, '2026-11-12')
                """)
                exporter.export_departments(connection, root / "config/departments", output)
                connection.execute("UPDATE weekly_issues SET status='approved'")
                exporter.export_departments(connection, root / "config/departments", output)
                archive = directory / "archive-data.json"
                archive.write_text(json.dumps({"issues": [old, stale]}))
                exporter.export_archive(connection, archive)
            data = json.loads(output.read_text())
            orbitinfer = next(d for d in data["departments"] if d["id"] == "orbitinfer")
            self.assertEqual([r["issue"]["isoWeek"] for r in orbitinfer["archive"]],
                             ["2026-W45", "2026-W37", "2026-W36"])
            self.assertEqual(orbitinfer["archive"][1], stale)
            self.assertEqual(orbitinfer["archive"][2], old)
            self.assertEqual(orbitinfer["currentReport"]["issue"]["status"], "approved")
            self.assertEqual(json.loads(archive.read_text())["issues"][2], old)

    def test_failed_collection_preserves_dated_articles_with_current_health(self):
        root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            database = Database(directory / "weekly.db")
            database.initialize(root / "schemas/weekly_intel.sql")
            output = directory / "source-data.json"
            article = {"title": "Historical article", "url": "https://example.test/old",
                       "summary": "Historical evidence", "publishedAt": "2026-09-01"}
            output.write_text(json.dumps({"accounts": [{"sourceId": "wechat_test",
                                                       "articles": [article]}]}))
            with database.transaction() as connection:
                connection.execute("""
                    INSERT INTO sources (source_id, name, source_type, connector,
                                         tier, created_at, updated_at)
                    VALUES ('wechat_test', 'Test', 'wechat', 'WechatPoolCollector',
                            'S_Core', '2026-11-12', '2026-11-12')
                """)
                connection.execute("""
                    INSERT INTO collection_runs (run_id, source_id, collector_name,
                        window_start, window_end, status, started_at, stats_json)
                    VALUES ('run', 'wechat_test', 'WechatPoolCollector', '2026-11-02',
                            '2026-11-08', 'blocked', '2026-11-12',
                            '{"health_status":"not_configured"}')
                """)
                SiteDataExportAgent().export_sources(connection, output)
            account = json.loads(output.read_text())["accounts"][0]
            self.assertEqual(account["articles"], [article])
            self.assertEqual(account["health"], "not_configured")
            self.assertEqual(account["inWindow"], 0)


if __name__ == "__main__":
    unittest.main()
