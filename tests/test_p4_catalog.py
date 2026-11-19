"""Automated test suite for FinLake Phase P4 (Hive Metastore & Trino Catalog)."""

from __future__ import annotations

import unittest
from src.finlake.trino.client import TrinoClient


class TestTrinoConnectivity(unittest.TestCase):
    """Tests Trino connection, catalogs, and version reporting."""

    @classmethod
    def setUpClass(cls):
        cls.client = TrinoClient()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "client") and cls.client:
            cls.client.close()

    def test_trino_connection_and_version(self):
        diag = self.client.test_connection()
        self.assertEqual(diag["status"], "connected", f"Trino connection failed: {diag.get('error')}")
        self.assertIn("node_version", diag)
        self.assertEqual(diag.get("environment"), "docker")

    def test_hive_catalog_registered(self):
        catalogs = self.client.execute_query("SHOW CATALOGS")
        cat_names = [c.get("Catalog") for c in catalogs]
        self.assertIn("hive", cat_names)
        self.assertIn("system", cat_names)


class TestCatalogSchemaAndTables(unittest.TestCase):
    """Validates schema and table creation in Hive Metastore via Trino."""

    @classmethod
    def setUpClass(cls):
        cls.client = TrinoClient()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "client") and cls.client:
            cls.client.close()

    def test_finlake_curated_schema_exists(self):
        schemas = self.client.execute_query("SHOW SCHEMAS FROM hive")
        schema_names = [s.get("Schema") for s in schemas]
        self.assertIn("finlake_curated", schema_names)

    def test_tables_registered(self):
        tables = self.client.execute_query("SHOW TABLES FROM hive.finlake_curated")
        table_names = [t.get("Table") for t in tables]
        self.assertIn("transactions", table_names)
        self.assertIn("transactions_unpartitioned", table_names)

    def test_transactions_schema_and_partition_key(self):
        cols = self.client.execute_query("DESCRIBE hive.finlake_curated.transactions")
        col_map = {c["Column"]: c for c in cols}

        # Check required analytical columns
        required_columns = [
            "ingest_row_id", "step", "type", "amount",
            "name_orig", "oldbalance_org", "newbalance_orig",
            "name_dest", "oldbalance_dest", "newbalance_dest",
            "is_fraud", "is_flagged_fraud", "event_time_simulated", "event_date",
        ]
        for col_name in required_columns:
            self.assertIn(col_name, col_map, f"Column '{col_name}' missing from transactions table")

        # Verify event_date is strictly marked as the partition key
        self.assertEqual(col_map["event_date"]["Extra"], "partition key")
        self.assertEqual(col_map["ingest_row_id"]["Type"], "bigint")
        self.assertEqual(col_map["amount"]["Type"], "double")


class TestAnalyticalQueries(unittest.TestCase):
    """Executes and validates the 6 reference analytical queries (§10.3)."""

    @classmethod
    def setUpClass(cls):
        cls.client = TrinoClient()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "client") and cls.client:
            cls.client.close()

    def test_q1_full_scan(self):
        """Q1: Scan complet avec COUNT(*)."""
        res = self.client.execute_query("SELECT COUNT(*) AS total FROM hive.finlake_curated.transactions")
        self.assertEqual(len(res), 1)
        total = res[0]["total"]
        self.assertGreater(total, 0)

    def test_q2_group_by_type(self):
        """Q2: Agrégation par type (PAYMENT, CASH_OUT, etc.)."""
        sql = """
            SELECT type, COUNT(*) AS cnt, SUM(amount) AS total_amount
            FROM hive.finlake_curated.transactions
            GROUP BY type
            ORDER BY cnt DESC
        """
        res = self.client.execute_query(sql)
        self.assertGreaterEqual(len(res), 1)
        types = [r["type"] for r in res]
        self.assertTrue(any(t in types for t in ["PAYMENT", "CASH_OUT", "CASH_IN", "TRANSFER", "DEBIT"]))

    def test_q3_temporal_aggregation(self):
        """Q3: Agrégation temporelle journalière."""
        sql = """
            SELECT event_date, COUNT(*) AS daily_count, SUM(amount) AS daily_amount
            FROM hive.finlake_curated.transactions
            GROUP BY event_date
            ORDER BY event_date ASC
        """
        res = self.client.execute_query(sql)
        self.assertGreaterEqual(len(res), 1)
        for r in res:
            self.assertTrue(r["event_date"].startswith("2023-01-"))
            self.assertGreater(r["daily_count"], 0)

    def test_q4_temporal_filter(self):
        """Q4: Filtre sélectif sur intervalle temporel."""
        sql = """
            SELECT ingest_row_id, step, type, amount, event_date
            FROM hive.finlake_curated.transactions
            WHERE event_date = '2023-01-01'
            LIMIT 10
        """
        res = self.client.execute_query(sql)
        self.assertGreater(len(res), 0)
        for r in res:
            self.assertEqual(r["event_date"], "2023-01-01")

    def test_q5_fraud_analysis(self):
        """Q5: Analyse des fraudes (is_fraud = 1)."""
        sql = """
            SELECT type, COUNT(*) AS fraud_count, SUM(amount) AS fraud_amount
            FROM hive.finlake_curated.transactions
            WHERE is_fraud = 1
            GROUP BY type
        """
        res = self.client.execute_query(sql)
        # Even on small test samples, query structure and types must be valid
        self.assertIsInstance(res, list)

    def test_q6_partition_reconciliation(self):
        """Q6: Réconciliation des comptes de lignes par partition."""
        sql = """
            SELECT event_date, COUNT(*) AS part_count, MIN(step) AS min_step, MAX(step) AS max_step
            FROM hive.finlake_curated.transactions
            GROUP BY event_date
            ORDER BY event_date ASC
        """
        res = self.client.execute_query(sql)
        self.assertGreaterEqual(len(res), 1)
        for r in res:
            self.assertGreater(r["part_count"], 0)
            self.assertLessEqual(r["min_step"], r["max_step"])

    def test_partition_pruning_explain_plan(self):
        """Vérifie via EXPLAIN que le partition pruning est appliqué."""
        sql = "EXPLAIN SELECT COUNT(*) FROM hive.finlake_curated.transactions WHERE event_date = '2023-01-01'"
        plan_rows = self.client.execute_query(sql)
        plan_text = "\n".join(r["Query Plan"] for r in plan_rows)

        self.assertIn("PARTITION_KEY", plan_text)
        self.assertIn("[[2023-01-01]]", plan_text)


if __name__ == "__main__":
    unittest.main()
