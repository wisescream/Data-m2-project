"""Unit and integration tests for FinLake Phase P3 (Ingestion Engine)."""

from __future__ import annotations

import unittest
import json
import io
from datetime import datetime, timezone
import pyarrow as pa
import pyarrow.parquet as pq

from src.finlake.ingestion.schema import (
    TRANSACTIONS_ARROW_SCHEMA,
    step_to_simulated_time,
    SIMULATED_BASE_TIME,
)
from src.finlake.ingestion.writer import ParquetBatchWriter, CSVBatchWriter
from src.finlake.ingestion.manifest import IngestionManifest
from src.finlake.storage.minio_client import MinIOStorageClient
from src.finlake.ingestion.extractor import SQLServerBatchExtractor
from src.finlake.ingestion.pipeline import IngestionPipeline


class TestP3SchemaAndTemporal(unittest.TestCase):
    """Validates schema definitions and simulated temporal mapping."""

    def test_schema_field_names_and_types(self):
        """Verifies PyArrow canonical schema contains all 14 required columns with correct types."""
        schema = TRANSACTIONS_ARROW_SCHEMA
        expected_fields = [
            ("ingest_row_id", pa.int64()),
            ("step", pa.int32()),
            ("type", pa.string()),
            ("amount", pa.float64()),
            ("name_orig", pa.string()),
            ("oldbalance_org", pa.float64()),
            ("newbalance_orig", pa.float64()),
            ("name_dest", pa.string()),
            ("oldbalance_dest", pa.float64()),
            ("newbalance_dest", pa.float64()),
            ("is_fraud", pa.int8()),
            ("is_flagged_fraud", pa.int8()),
            ("event_time_simulated", pa.timestamp("us", tz="UTC")),
            ("event_date", pa.string()),
        ]
        self.assertEqual(len(schema), len(expected_fields))
        for name, expected_type in expected_fields:
            field = schema.field(name)
            self.assertEqual(field.type, expected_type, f"Field '{name}' type mismatch.")
            self.assertFalse(field.nullable, f"Field '{name}' should not be nullable.")

    def test_step_to_simulated_time_boundaries(self):
        """Tests that step 1 is 2023-01-01 00:00:00, step 24 is day 1, step 25 is day 2, and step 743 is day 31."""
        # Step 1
        dt1, d1 = step_to_simulated_time(1)
        self.assertEqual(dt1, datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(d1, "2023-01-01")

        # Step 24 (last hour of day 1)
        dt24, d24 = step_to_simulated_time(24)
        self.assertEqual(dt24, datetime(2023, 1, 1, 23, 0, tzinfo=timezone.utc))
        self.assertEqual(d24, "2023-01-01")

        # Step 25 (first hour of day 2)
        dt25, d25 = step_to_simulated_time(25)
        self.assertEqual(dt25, datetime(2023, 1, 2, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(d25, "2023-01-02")

        # Step 743 (last step in PaySim)
        dt743, d743 = step_to_simulated_time(743)
        self.assertEqual(dt743, datetime(2023, 1, 31, 22, 0, tzinfo=timezone.utc))
        self.assertEqual(d743, "2023-01-31")


class TestP3Writers(unittest.TestCase):
    """Tests Parquet and CSV serialization and partitioning."""

    def _create_sample_batch(self, count=10) -> pa.RecordBatch:
        return pa.RecordBatch.from_arrays(
            [
                pa.array(list(range(1, count + 1)), type=pa.int64()),
                pa.array([1 if i < count // 2 else 25 for i in range(count)], type=pa.int32()),
                pa.array(["PAYMENT"] * count, type=pa.string()),
                pa.array([100.50] * count, type=pa.float64()),
                pa.array([f"C{i:07d}" for i in range(count)], type=pa.string()),
                pa.array([1000.0] * count, type=pa.float64()),
                pa.array([899.50] * count, type=pa.float64()),
                pa.array([f"M{i:07d}" for i in range(count)], type=pa.string()),
                pa.array([0.0] * count, type=pa.float64()),
                pa.array([100.50] * count, type=pa.float64()),
                pa.array([0] * count, type=pa.int8()),
                pa.array([0] * count, type=pa.int8()),
                pa.array([datetime(2023, 1, 1, tzinfo=timezone.utc) if i < count // 2 else datetime(2023, 1, 2, tzinfo=timezone.utc) for i in range(count)], type=pa.timestamp("us", tz="UTC")),
                pa.array(["2023-01-01" if i < count // 2 else "2023-01-02" for i in range(count)], type=pa.string()),
            ],
            schema=TRANSACTIONS_ARROW_SCHEMA,
        )

    def test_parquet_partitioned_serialization(self):
        """Verifies partitioned Parquet output produces separate files per partition date."""
        writer = ParquetBatchWriter(compression="snappy", partition_col="event_date", run_id="test_run")
        batch = self._create_sample_batch(10)
        results = writer.serialize_batch(batch, batch_index=1)
        self.assertEqual(len(results), 2)

        paths = [r[0] for r in results]
        self.assertIn("event_date=2023-01-01/test_run_part-00001.parquet", paths)
        self.assertIn("event_date=2023-01-02/test_run_part-00001.parquet", paths)

        # Verify readability and schema of each output Parquet file
        for _, parquet_bytes in results:
            table = pq.read_table(io.BytesIO(parquet_bytes))
            self.assertEqual(len(table), 5)
            self.assertIn("event_date", table.column_names)

    def test_parquet_compression_codecs(self):
        """Verifies snappy, zstd, and none compressors serialize successfully."""
        for codec in ["snappy", "zstd", "none"]:
            writer = ParquetBatchWriter(compression=codec, partition_col=None)
            batch = self._create_sample_batch(50)
            results = writer.serialize_batch(batch, batch_index=1)
            self.assertEqual(len(results), 1)
            table = pq.read_table(io.BytesIO(results[0][1]))
            self.assertEqual(len(table), 50)

    def test_csv_writer(self):
        """Verifies CSVBatchWriter serializes batches to valid CSV text."""
        writer = CSVBatchWriter(partition_col="event_date", run_id="test_run")
        batch = self._create_sample_batch(10)
        results = writer.serialize_batch(batch, batch_index=1)
        self.assertEqual(len(results), 2)
        csv_text = results[0][1].decode("utf-8")
        self.assertIn("ingest_row_id", csv_text)
        self.assertIn("PAYMENT", csv_text)


class TestP3Manifest(unittest.TestCase):
    """Tests IngestionManifest validation and serialization."""

    def test_manifest_validation_success(self):
        """Verifies valid manifest passes validation."""
        manifest = IngestionManifest(
            job_id="job_test",
            run_id="run_test",
            source_table="dbo.transactions",
            format="parquet",
            compression="snappy",
            partition_by="event_date",
            row_count_total=100,
            bytes_total=2048,
            objects_count=2,
            objects=[
                {"path": "s3://finlake/obj1.parquet", "size_bytes": 1024, "sha256": "abc1"},
                {"path": "s3://finlake/obj2.parquet", "size_bytes": 1024, "sha256": "abc2"},
            ],
            started_at="2026-11-18T19:00:00Z",
            completed_at="2026-11-18T19:00:01Z",
            duration_seconds=1.0,
            status="SUCCESS",
        )
        manifest.validate()
        json_str = manifest.to_json()
        roundtrip = IngestionManifest.from_json(json_str)
        self.assertEqual(roundtrip.run_id, "run_test")
        self.assertEqual(roundtrip.bytes_total, 2048)

    def test_manifest_validation_mismatch(self):
        """Verifies manifest fails if object count or byte total do not match."""
        manifest = IngestionManifest(
            job_id="job_test",
            run_id="run_test",
            source_table="dbo.transactions",
            format="parquet",
            compression="snappy",
            partition_by="event_date",
            row_count_total=100,
            bytes_total=9999,  # Mismatch!
            objects_count=1,
            objects=[{"path": "s3://finlake/obj1.parquet", "size_bytes": 1024, "sha256": "abc1"}],
            started_at="2026-11-18T19:00:00Z",
            completed_at="2026-11-18T19:00:01Z",
            duration_seconds=1.0,
            status="SUCCESS",
        )
        with self.assertRaises(ValueError):
            manifest.validate()


class TestP3StorageClient(unittest.TestCase):
    """Tests MinIO S3 client methods."""

    @classmethod
    def setUpClass(cls):
        cls.storage = MinIOStorageClient()
        cls.storage.ensure_bucket_exists()

    def test_bucket_exists(self):
        self.assertTrue(self.storage.ensure_bucket_exists())

    def test_upload_get_delete_cycle(self):
        test_key = "tests/p3_test_object.txt"
        test_bytes = b"Hello FinLake P3 Ingestion!"
        meta = self.storage.upload_bytes(test_bytes, test_key, content_type="text/plain")
        self.assertEqual(meta["size_bytes"], len(test_bytes))
        self.assertTrue(len(meta["sha256"]) == 64)

        retrieved = self.storage.get_object_bytes(test_key)
        self.assertEqual(retrieved, test_bytes)

        self.storage.delete_object(test_key)
        with self.assertRaises(RuntimeError):
            self.storage.get_object_bytes(test_key)


class TestP3EndToEndIntegration(unittest.TestCase):
    """Tests full pipeline run against SQL Server and MinIO."""

    def test_pipeline_sample_extraction_and_reconciliation(self):
        """
        Runs an end-to-end ingestion pipeline for 1,000 rows,
        verifying that extracted row count matches manifest, MinIO objects, and Parquet contents.
        """
        sample_rows = 1000
        pipeline = IngestionPipeline(
            job_id="test_p3_e2e_job",
            output_format="parquet",
            compression="snappy",
            batch_size=500,
            partition_by="event_date",
        )

        manifest = pipeline.run(start_row_id=0, max_rows=sample_rows)

        self.assertEqual(manifest.status, "SUCCESS")
        self.assertEqual(manifest.row_count_total, sample_rows)
        self.assertGreater(manifest.objects_count, 0)
        self.assertGreater(manifest.bytes_total, 0)

        # Download each curated parquet object and verify row count sum
        storage = MinIOStorageClient()
        total_rows_in_parquet = 0
        for obj in manifest.objects:
            rel_path = obj["rel_path"]
            raw_parquet = storage.get_object_bytes(rel_path)
            table = pq.read_table(io.BytesIO(raw_parquet))
            total_rows_in_parquet += len(table)

        self.assertEqual(
            total_rows_in_parquet,
            sample_rows,
            f"Reconciliation failure: expected {sample_rows} rows in Parquet, got {total_rows_in_parquet}",
        )


if __name__ == "__main__":
    unittest.main()
