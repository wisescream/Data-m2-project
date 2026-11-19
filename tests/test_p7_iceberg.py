"""Test suite for FinLake Phase P7 (Apache Iceberg Modern Table Format & Dashboards)."""

from __future__ import annotations

import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from src.finlake.api.app import app
from src.finlake.trino.client import TrinoClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class TestP7Iceberg(unittest.TestCase):
    """Validates Apache Iceberg catalog, snapshots, and time-travel functionality."""

    @classmethod
    def setUpClass(cls):
        cls.trino = TrinoClient(catalog="iceberg", schema="finlake_iceberg")

    def test_iceberg_catalog_registered(self):
        catalogs = self.trino.execute_query("SHOW CATALOGS")
        cat_names = [c.get("Catalog") for c in catalogs]
        self.assertIn("iceberg", cat_names, "Iceberg catalog must be registered in Trino")

    def test_iceberg_schema_and_table_exist(self):
        schemas = self.trino.execute_query("SHOW SCHEMAS FROM iceberg")
        schema_names = [s.get("Schema") for s in schemas]
        self.assertIn("finlake_iceberg", schema_names, "Schema finlake_iceberg must exist")

        tables = self.trino.execute_query("SHOW TABLES FROM iceberg.finlake_iceberg")
        table_names = [t.get("Table") for t in tables]
        self.assertIn("transactions", table_names, "Table transactions must exist in iceberg.finlake_iceberg")

    def test_iceberg_snapshots_exist(self):
        snapshots = self.trino.execute_query("""
            SELECT snapshot_id, operation, committed_at
            FROM iceberg.finlake_iceberg."transactions$snapshots"
            ORDER BY committed_at DESC
        """)
        self.assertGreaterEqual(len(snapshots), 2, "Iceberg table must have at least 2 snapshots from setup")
        operations = [s.get("operation") for s in snapshots]
        self.assertIn("append", operations)

    def test_iceberg_time_travel_query(self):
        """Verifies that FOR VERSION AS OF executes without error against snapshot with rows."""
        snapshots = self.trino.execute_query("""
            SELECT snapshot_id, operation
            FROM iceberg.finlake_iceberg."transactions$snapshots"
            ORDER BY committed_at ASC
        """)
        # Find snapshot with inserted data
        row_snapshots = []
        for s in snapshots:
            sid = s["snapshot_id"]
            cnt_res = self.trino.execute_query(f"SELECT COUNT(*) AS total FROM iceberg.finlake_iceberg.transactions FOR VERSION AS OF {sid}")
            cnt = cnt_res[0]["total"] if cnt_res else 0
            if cnt > 0:
                row_snapshots.append((sid, cnt))

        self.assertGreater(len(row_snapshots), 0, "Must have at least one snapshot with populated rows")
        first_populated_sid, count_initial = row_snapshots[0]
        self.assertEqual(count_initial, 5000, "First populated snapshot must contain 5,000 rows")


class TestP7Dashboard(unittest.TestCase):
    """Validates Web Dashboard endpoints and static templates."""

    def setUp(self):
        self.client = TestClient(app)

    def test_dashboard_template_files_exist(self):
        template_path = PROJECT_ROOT / "src" / "finlake" / "api" / "templates" / "dashboard.html"
        standalone_path = PROJECT_ROOT / "dashboard" / "index.html"
        self.assertTrue(template_path.exists(), "src/finlake/api/templates/dashboard.html must exist")
        self.assertTrue(standalone_path.exists(), "dashboard/index.html must exist")

    def test_get_dashboard_html_endpoint(self):
        resp = self.client.get("/dashboard")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/html", resp.headers["content-type"])
        self.assertIn("FinLake", resp.text)
        self.assertIn("chartCompression", resp.text)
        self.assertIn("Iceberg", resp.text)

    def test_get_dashboard_stats_api(self):
        resp = self.client.get("/api/dashboard/stats")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_source_rows"], 6362620)
        self.assertIn("total_indexed_rows", data)
        self.assertIn("compression_gain", data)
        self.assertIn("services", data)

    def test_get_dashboard_iceberg_api(self):
        resp = self.client.get("/api/dashboard/iceberg")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ready")
        self.assertGreaterEqual(data["snapshots_count"], 2)


if __name__ == "__main__":
    unittest.main()
