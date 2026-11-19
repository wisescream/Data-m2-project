"""Ingestion pipeline orchestrator with staging, atomic promotion, and durable tracking."""

from __future__ import annotations

import os
import uuid
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import pymssql

from src.finlake.storage.minio_client import MinIOStorageClient
from src.finlake.ingestion.extractor import SQLServerBatchExtractor
from src.finlake.ingestion.writer import ParquetBatchWriter, CSVBatchWriter
from src.finlake.ingestion.manifest import IngestionManifest


class IngestionPipeline:
    """Coordinates extraction, staging, validation, promotion, and metadata persistence."""

    def __init__(
        self,
        job_id: Optional[str] = None,
        source_table: str = "dbo.transactions",
        output_format: str = "parquet",
        compression: str = "snappy",
        batch_size: int = 50000,
        partition_by: Optional[str] = "event_date",
        storage_client: Optional[MinIOStorageClient] = None,
        sql_server_params: Optional[Dict[str, Any]] = None,
    ):
        self.job_id = job_id or f"job_{output_format}_{compression}_{batch_size}"
        self.source_table = source_table
        self.output_format = output_format.lower()
        self.compression = compression.lower()
        self.batch_size = batch_size
        self.partition_by = partition_by

        self.storage = storage_client or MinIOStorageClient()
        self.sql_params = sql_server_params or {
            "server": os.getenv("SQLSERVER_HOST", "sqlserver"),
            "user": os.getenv("SQLSERVER_USER", "sa"),
            "password": os.getenv("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#"),
            "database": os.getenv("SQLSERVER_DATABASE", "finlake_source"),
            "port": int(os.getenv("SQLSERVER_PORT", "1433")),
        }

    def _get_sql_conn(self) -> pymssql.Connection:
        return pymssql.connect(
            server=self.sql_params["server"],
            user=self.sql_params["user"],
            password=self.sql_params["password"],
            database=self.sql_params["database"],
            port=self.sql_params["port"],
            login_timeout=15,
            timeout=120,
        )

    def _init_job_in_db(self, run_id: str) -> None:
        """Ensures job entry and run record exist in SQL Server metadata tables."""
        conn = self._get_sql_conn()
        try:
            with conn.cursor() as cur:
                # Upsert job record
                cur.execute(
                    """
                    IF NOT EXISTS (SELECT 1 FROM dbo.ingestion_jobs WHERE job_id = %s)
                    BEGIN
                        INSERT INTO dbo.ingestion_jobs (
                            job_id, source_id, schema_name, table_name,
                            format, compression, batch_size, partition_columns, status
                        ) VALUES (%s, 'sqlserver', 'dbo', 'transactions', %s, %s, %s, %s, 'RUNNING');
                    END
                    ELSE
                    BEGIN
                        UPDATE dbo.ingestion_jobs
                        SET status = 'RUNNING', updated_at = SYSUTCDATETIME()
                        WHERE job_id = %s;
                    END
                    """,
                    (
                        self.job_id,
                        self.job_id,
                        self.output_format,
                        self.compression,
                        self.batch_size,
                        self.partition_by or "none",
                        self.job_id,
                    ),
                )

                # Insert run record
                cur.execute(
                    """
                    INSERT INTO dbo.job_runs (
                        run_id, job_id, status, started_at
                    ) VALUES (%s, %s, 'RUNNING', SYSUTCDATETIME());
                    """,
                    (run_id, self.job_id),
                )
                conn.commit()
        finally:
            conn.close()

    def _update_run_in_db(
        self,
        run_id: str,
        status: str,
        total_rows: int = 0,
        total_bytes: int = 0,
        total_objects: int = 0,
        manifest_path: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Updates the run record and parent job status in SQL Server."""
        conn = self._get_sql_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE dbo.job_runs
                    SET status = %s,
                        total_rows_extracted = %s,
                        total_bytes_written = %s,
                        total_objects_created = %s,
                        manifest_path = %s,
                        error_message = %s,
                        completed_at = SYSUTCDATETIME()
                    WHERE run_id = %s;

                    UPDATE dbo.ingestion_jobs
                    SET status = %s, updated_at = SYSUTCDATETIME()
                    WHERE job_id = %s;
                    """,
                    (
                        status,
                        total_rows,
                        total_bytes,
                        total_objects,
                        manifest_path,
                        error_message,
                        run_id,
                        status,
                        self.job_id,
                    ),
                )
                conn.commit()
        finally:
            conn.close()

    def run(
        self,
        start_row_id: int = 0,
        max_rows: Optional[int] = None,
    ) -> IngestionManifest:
        """
        Executes the end-to-end extraction and ingestion lifecycle:
        1. Initialize tracking in DB.
        2. Stream bounded batches from SQL Server.
        3. Serialize (Parquet/CSV) and upload to MinIO staging prefix.
        4. Validate staged objects.
        5. Atomically promote staged objects to curated lakehouse prefix.
        6. Publish manifest to manifests prefix.
        7. Update DB run status to SUCCESS.
        """
        self.storage.ensure_bucket_exists()

        now_utc = datetime.now(timezone.utc)
        run_id = f"run_{now_utc.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        self._init_job_in_db(run_id)

        start_perf = time.perf_counter()
        started_at_iso = now_utc.isoformat()

        # Storage paths
        staging_prefix = f"staging/{self.job_id}/{run_id}/"
        format_suffix = "_csv" if self.output_format == "csv" else ""
        if self.partition_by:
            curated_prefix = f"curated/paysim/transactions{format_suffix}/"
        else:
            curated_prefix = f"curated/paysim/transactions{format_suffix}_unpartitioned/"
        manifest_key = f"manifests/paysim/transactions/{run_id}.json"

        # Instantiate extractor & writer
        extractor = SQLServerBatchExtractor(
            server=self.sql_params["server"],
            user=self.sql_params["user"],
            password=self.sql_params["password"],
            database=self.sql_params["database"],
            port=self.sql_params["port"],
            table_name=self.source_table,
            batch_size=self.batch_size,
        )

        if self.output_format == "parquet":
            writer = ParquetBatchWriter(
                compression=self.compression,
                partition_col=self.partition_by,
                row_group_size=self.batch_size,
                run_id=run_id,
            )
            content_type = "application/vnd.apache.parquet"
        elif self.output_format == "csv":
            writer = CSVBatchWriter(
                partition_col=self.partition_by,
                run_id=run_id,
            )
            content_type = "text/csv"
        else:
            raise ValueError(f"Unsupported output format: '{self.output_format}'")

        staged_manifest_objects = []
        total_rows_extracted = 0
        total_bytes_staged = 0
        batch_idx = 0

        try:
            # Batch extraction & staging
            for batch in extractor.extract_batches(start_row_id=start_row_id, max_rows=max_rows):
                batch_len = len(batch)
                total_rows_extracted += batch_len
                batch_idx += 1

                serialized_items = writer.serialize_batch(batch, batch_index=batch_idx)

                for rel_path, data_bytes in serialized_items:
                    staging_object_key = staging_prefix + rel_path
                    upload_meta = self.storage.upload_bytes(
                        data=data_bytes,
                        object_name=staging_object_key,
                        content_type=content_type,
                    )
                    staged_manifest_objects.append({
                        "staging_key": staging_object_key,
                        "rel_path": rel_path,
                        "size_bytes": upload_meta["size_bytes"],
                        "sha256": upload_meta["sha256"],
                        "etag": upload_meta["etag"],
                    })
                    total_bytes_staged += upload_meta["size_bytes"]

            if total_rows_extracted == 0:
                raise RuntimeError("Extraction completed with 0 rows extracted.")

            # Validation: check all staged objects exist in MinIO and are non-empty
            staged_in_s3 = self.storage.list_objects(prefix=staging_prefix, recursive=True)
            if len(staged_in_s3) != len(staged_manifest_objects):
                raise RuntimeError(
                    f"Staging validation error: expected {len(staged_manifest_objects)} objects, found {len(staged_in_s3)} in MinIO."
                )

            # Promotion: move from staging to curated
            promoted_items = self.storage.promote_staging_to_curated(
                staging_prefix=staging_prefix,
                curated_prefix=curated_prefix,
            )

            # Manifest construction
            end_perf = time.perf_counter()
            completed_at_iso = datetime.now(timezone.utc).isoformat()
            duration_sec = round(end_perf - start_perf, 3)

            curated_objects_manifest = []
            for item, stg_meta in zip(promoted_items, staged_manifest_objects):
                curated_objects_manifest.append({
                    "path": f"s3://{self.storage.bucket_name}/{item['curated_path']}",
                    "rel_path": item["curated_path"],
                    "size_bytes": item["size_bytes"],
                    "sha256": stg_meta["sha256"],
                    "etag": item["etag"],
                })

            manifest = IngestionManifest(
                job_id=self.job_id,
                run_id=run_id,
                source_table=self.source_table,
                format=self.output_format,
                compression=self.compression,
                partition_by=self.partition_by,
                row_count_total=total_rows_extracted,
                bytes_total=total_bytes_staged,
                objects_count=len(curated_objects_manifest),
                objects=curated_objects_manifest,
                started_at=started_at_iso,
                completed_at=completed_at_iso,
                duration_seconds=duration_sec,
                status="SUCCESS",
            )
            manifest.validate()

            # Upload manifest
            manifest_json_bytes = manifest.to_json().encode("utf-8")
            self.storage.upload_bytes(
                data=manifest_json_bytes,
                object_name=manifest_key,
                content_type="application/json",
            )

            # Update DB run
            self._update_run_in_db(
                run_id=run_id,
                status="SUCCESS",
                total_rows=total_rows_extracted,
                total_bytes=total_bytes_staged,
                total_objects=len(curated_objects_manifest),
                manifest_path=f"s3://{self.storage.bucket_name}/{manifest_key}",
            )

            return manifest

        except Exception as e:
            err_msg = str(e)
            self._update_run_in_db(run_id=run_id, status="FAILED", error_message=err_msg)
            raise
