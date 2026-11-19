#!/usr/bin/env python3
"""
FinLake P2 — Automated Validation Tests for SQL Server Import & Exploration.

Tests:
1. SQL Server connection testing and credential protection (F-01, F-02).
2. Schema & table exploration (F-03).
3. Schema compliance of dbo.transactions (types, PK, not null).
4. Full row reconciliation (COUNT(*) == 6,362,620).
5. Sequential integrity of ingest_row_id.
6. SQL injection prevention on table/schema identifiers.
7. Verification of durable job tracking tables (dbo.ingestion_jobs, dbo.job_runs).

Run via:
    python -m unittest tests/test_p2_import.py -v
"""
import unittest
from src.finlake.db.connector import SQLServerConnector
from src.finlake.db.explorer import SchemaExplorer

EXPECTED_PAYSIM_COLUMNS = [
    "ingest_row_id",
    "step",
    "type",
    "amount",
    "nameOrig",
    "oldbalanceOrg",
    "newbalanceOrig",
    "nameDest",
    "oldbalanceDest",
    "newbalanceDest",
    "isFraud",
    "isFlaggedFraud",
]


class TestSQLServerConnector(unittest.TestCase):
    """Test connection handling, credentials sanitization, and security."""

    def setUp(self):
        self.connector = SQLServerConnector()

    def test_connection_successful(self):
        diag = self.connector.test_connection()
        self.assertEqual(diag["status"], "connected")
        self.assertEqual(diag["database"], "finlake_source")
        self.assertIn("server_version", diag)
        # Ensure password is NOT leaked in diagnostic dictionary
        self.assertNotIn("password", diag)
        self.assertNotIn("_password", diag)

    def test_connection_failure_sanitized(self):
        bad_connector = SQLServerConnector(password="WrongPassword123!")
        diag = bad_connector.test_connection()
        self.assertEqual(diag["status"], "failed")
        self.assertIn("error", diag)
        # Ensure password is NOT leaked in diagnostic dictionary or error message
        self.assertNotIn("WrongPassword123!", str(diag))


class TestSchemaExplorer(unittest.TestCase):
    """Test schema discovery, table inspection, and injection protection."""

    def setUp(self):
        self.explorer = SchemaExplorer()

    def test_list_schemas(self):
        schemas = self.explorer.list_schemas()
        self.assertIn("dbo", schemas)

    def test_list_tables(self):
        tables = self.explorer.list_tables(schema="dbo")
        table_names = [t["table"] for t in tables]
        self.assertIn("transactions", table_names)
        self.assertIn("ingestion_jobs", table_names)
        self.assertIn("job_runs", table_names)

    def test_sql_injection_defense(self):
        with self.assertRaises(ValueError):
            self.explorer.validate_identifier("dbo; DROP TABLE transactions--")
        with self.assertRaises(ValueError):
            self.explorer.validate_identifier("users' OR '1'='1")

    def test_describe_transactions_schema(self):
        desc = self.explorer.describe_table("transactions", schema="dbo")
        self.assertEqual(desc["schema"], "dbo")
        self.assertEqual(desc["table"], "transactions")
        self.assertEqual(desc["column_count"], 12)
        self.assertEqual(desc["primary_key"], ["ingest_row_id"])

        col_map = {c["name"]: c for c in desc["columns"]}

        # Check all column names exist
        for col_name in EXPECTED_PAYSIM_COLUMNS:
            self.assertIn(col_name, col_map, f"Colonne {col_name} manquante")

        # Check data types
        self.assertEqual(col_map["ingest_row_id"]["data_type"], "BIGINT")
        self.assertTrue(col_map["ingest_row_id"]["is_identity"])
        self.assertTrue(col_map["ingest_row_id"]["is_primary_key"])

        self.assertEqual(col_map["step"]["data_type"], "INT")
        self.assertEqual(col_map["type"]["data_type"], "VARCHAR(20)")
        self.assertEqual(col_map["amount"]["data_type"], "DECIMAL(19,4)")
        self.assertEqual(col_map["nameOrig"]["data_type"], "VARCHAR(64)")
        self.assertEqual(col_map["oldbalanceOrg"]["data_type"], "DECIMAL(19,4)")
        self.assertEqual(col_map["newbalanceOrig"]["data_type"], "DECIMAL(19,4)")
        self.assertEqual(col_map["nameDest"]["data_type"], "VARCHAR(64)")
        self.assertEqual(col_map["oldbalanceDest"]["data_type"], "DECIMAL(19,4)")
        self.assertEqual(col_map["newbalanceDest"]["data_type"], "DECIMAL(19,4)")
        self.assertEqual(col_map["isFraud"]["data_type"], "BIT")
        self.assertEqual(col_map["isFlaggedFraud"]["data_type"], "BIT")

        # Check nullability: all columns must be NOT NULL
        for col_name, c in col_map.items():
            self.assertFalse(c["is_nullable"], f"La colonne {col_name} ne doit pas autoriser les nulls")

    def test_describe_durable_jobs_schema(self):
        jobs_desc = self.explorer.describe_table("ingestion_jobs", schema="dbo")
        self.assertEqual(jobs_desc["primary_key"], ["job_id"])

        runs_desc = self.explorer.describe_table("job_runs", schema="dbo")
        self.assertEqual(runs_desc["primary_key"], ["run_id"])


class TestDataReconciliation(unittest.TestCase):
    """Test full data integrity and row count reconciliation."""

    def setUp(self):
        self.connector = SQLServerConnector()

    def test_exact_row_count(self):
        """Source row count must strictly match 6,362,620 rows."""
        rows = self.connector.execute_query("SELECT COUNT(*) AS total FROM dbo.transactions;")
        self.assertEqual(rows[0]["total"], 6_362_620)

    def test_sequential_ingest_row_id(self):
        """ingest_row_id must be strictly sequential from 1 to 6,362,620."""
        rows = self.connector.execute_query("""
            SELECT 
                MIN(ingest_row_id) AS min_id,
                MAX(ingest_row_id) AS max_id,
                COUNT(DISTINCT ingest_row_id) AS unique_ids
            FROM dbo.transactions;
        """)
        self.assertEqual(rows[0]["min_id"], 1)
        self.assertEqual(rows[0]["max_id"], 6_362_620)
        self.assertEqual(rows[0]["unique_ids"], 6_362_620)

    def test_reconciliation_aggregates_match_p0(self):
        """Cross-check fraud counts and step domains with P0 quality report."""
        rows = self.connector.execute_query("""
            SELECT 
                SUM(CASE WHEN isFraud = 1 THEN 1 ELSE 0 END) AS fraud_cnt,
                SUM(CASE WHEN isFlaggedFraud = 1 THEN 1 ELSE 0 END) AS flagged_cnt,
                MIN(step) AS min_step,
                MAX(step) AS max_step,
                COUNT(DISTINCT type) AS distinct_types
            FROM dbo.transactions;
        """)
        stats = rows[0]
        self.assertEqual(stats["fraud_cnt"], 8_213)
        self.assertEqual(stats["flagged_cnt"], 16)
        self.assertEqual(stats["min_step"], 1)
        self.assertEqual(stats["max_step"], 743)
        self.assertEqual(stats["distinct_types"], 5)


if __name__ == "__main__":
    unittest.main()
