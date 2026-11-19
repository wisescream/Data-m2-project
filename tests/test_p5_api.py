"""Automated test suite for FinLake Phase P5 (FastAPI Control Plane)."""

from __future__ import annotations

import unittest
from fastapi.testclient import TestClient
from src.finlake.api.app import app
from src.finlake.jobs.store import JobMetadataStore


class TestFinLakeAPI(unittest.TestCase):
    """Integration tests for all REST endpoints of the control plane."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_health_endpoint(self):
        """GET /health should return 200 and service health statuses."""
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("status", data)
        self.assertIn("services", data)
        self.assertEqual(data["services"].get("sqlserver"), "up")
        self.assertEqual(data["services"].get("minio"), "up")
        self.assertEqual(data["services"].get("trino"), "up")

    def test_02_sources_list(self):
        """GET /sources should list sqlserver."""
        resp = self.client.get("/sources")
        self.assertEqual(resp.status_code, 200)
        sources = resp.json()
        self.assertIsInstance(sources, list)
        source_ids = [s["id"] for s in sources]
        self.assertIn("sqlserver", source_ids)

    def test_03_sources_test_success(self):
        """POST /sources/sqlserver/test should return connected status."""
        resp = self.client.post("/sources/sqlserver/test")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "connected")
        self.assertEqual(data["source_id"], "sqlserver")
        self.assertIn("server_version", data)

    def test_04_sources_test_not_found(self):
        """POST /sources/unknown/test should return 404."""
        resp = self.client.post("/sources/unknown/test")
        self.assertEqual(resp.status_code, 404)

    def test_05_sources_tables(self):
        """GET /sources/sqlserver/tables should return dbo tables including transactions."""
        resp = self.client.get("/sources/sqlserver/tables")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["source_id"], "sqlserver")
        self.assertIn("transactions", data["tables"])

    def test_06_sources_table_schema(self):
        """GET /sources/sqlserver/tables/transactions/schema should return column metadata."""
        resp = self.client.get("/sources/sqlserver/tables/transactions/schema")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["table_name"], "transactions")
        col_names = [c["name"] for c in data["columns"]]
        self.assertIn("ingest_row_id", col_names)
        self.assertIn("step", col_names)
        self.assertIn("type", col_names)
        self.assertIn("amount", col_names)
        self.assertIn("isFraud", col_names)

    def test_07_sources_table_schema_not_found(self):
        """GET /sources/sqlserver/tables/nonexistent/schema should return 404."""
        resp = self.client.get("/sources/sqlserver/tables/nonexistent/schema")
        self.assertEqual(resp.status_code, 404)

    def test_08_create_job_validation_error(self):
        """POST /storage/jobs with invalid format or zero batch size should return 422."""
        # Invalid format
        resp = self.client.post(
            "/storage/jobs",
            json={"source_id": "sqlserver", "format": "xml", "batch_size": 1000},
        )
        self.assertEqual(resp.status_code, 422)

        # Invalid batch_size <= 0
        resp = self.client.post(
            "/storage/jobs",
            json={"source_id": "sqlserver", "format": "parquet", "batch_size": 0},
        )
        self.assertEqual(resp.status_code, 422)

    def test_09_create_job_success(self):
        """POST /storage/jobs should return 202 Accepted and a unique job_id."""
        payload = {
            "source_id": "sqlserver",
            "schema_name": "dbo",
            "table": "transactions",
            "format": "parquet",
            "compression": "snappy",
            "batch_size": 2500,
            "partition_by": ["event_date"],
            "max_rows": 500,
        }
        resp = self.client.post("/storage/jobs", json=payload)
        self.assertEqual(resp.status_code, 202)
        data = resp.json()
        self.assertEqual(data["status"], "ACCEPTED")
        self.assertIn("job_id", data)
        self.assertTrue(data["job_id"].startswith("job_"))

        # Verify job is persisted in metadata store
        job_id = data["job_id"]
        status_resp = self.client.get(f"/storage/jobs/{job_id}")
        self.assertEqual(status_resp.status_code, 200)
        job_data = status_resp.json()
        self.assertEqual(job_data["job_id"], job_id)
        self.assertEqual(job_data["format"], "parquet")

    def test_10_get_job_not_found(self):
        """GET /storage/jobs/nonexistent_id should return 404."""
        resp = self.client.get("/storage/jobs/job_does_not_exist_999")
        self.assertEqual(resp.status_code, 404)

    def test_11_cancel_job(self):
        """POST /storage/jobs/{id}/cancel should mark job CANCELLED."""
        # Create a job first
        payload = {"source_id": "sqlserver", "batch_size": 1000, "max_rows": 50}
        resp = self.client.post("/storage/jobs", json=payload)
        job_id = resp.json()["job_id"]

        cancel_resp = self.client.post(f"/storage/jobs/{job_id}/cancel")
        self.assertEqual(cancel_resp.status_code, 200)
        self.assertEqual(cancel_resp.json()["status"], "CANCELLED")

        # Verify state
        get_resp = self.client.get(f"/storage/jobs/{job_id}")
        self.assertEqual(get_resp.json()["status"], "CANCELLED")

    def test_12_retry_job(self):
        """POST /storage/jobs/{id}/retry should re-queue the job."""
        payload = {"source_id": "sqlserver", "batch_size": 1000, "max_rows": 50}
        resp = self.client.post("/storage/jobs", json=payload)
        job_id = resp.json()["job_id"]

        retry_resp = self.client.post(f"/storage/jobs/{job_id}/retry")
        self.assertEqual(retry_resp.status_code, 200)
        self.assertEqual(retry_resp.json()["status"], "ACCEPTED")

    def test_13_job_result_query(self):
        """GET /storage/jobs/{id}/result on completed job returns manifest and row counts."""
        store = JobMetadataStore()
        jobs = store.list_jobs(limit=20)
        target_job_id = None
        for j in jobs:
            job_details = store.get_job(j["job_id"])
            if (
                job_details
                and job_details.get("latest_run")
                and job_details["latest_run"].get("status") == "SUCCESS"
            ):
                target_job_id = j["job_id"]
                break

        if target_job_id:
            resp = self.client.get(f"/storage/jobs/{target_job_id}/result")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "SUCCESS")
            self.assertGreater(data["total_rows_extracted"], 0)


if __name__ == "__main__":
    unittest.main()
