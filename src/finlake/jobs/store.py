"""Durable job and run metadata store backed by SQL Server."""

from __future__ import annotations

import os
import uuid
from typing import Dict, Any, List, Optional
import pymssql


class JobMetadataStore:
    """Provides thread-safe persistence and querying for ingestion jobs and runs in SQL Server."""

    def __init__(
        self,
        server: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        port: Optional[int] = None,
    ):
        self.server = server or os.getenv("SQLSERVER_HOST", "127.0.0.1")
        self.user = user or os.getenv("SQLSERVER_USER", "sa")
        self.password = password or os.getenv("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
        self.database = database or os.getenv("SQLSERVER_DATABASE", "finlake_source")
        self.port = port or int(os.getenv("SQLSERVER_PORT", "1433"))

    def _get_connection(self) -> pymssql.Connection:
        last_exc = None
        for attempt in range(3):
            try:
                return pymssql.connect(
                    server=self.server,
                    user=self.user,
                    password=self.password,
                    database=self.database,
                    port=self.port,
                    login_timeout=10,
                    timeout=30,
                )
            except Exception as e:
                last_exc = e
                time.sleep(0.5)
        raise last_exc

    def create_job(
        self,
        job_id: str,
        source_id: str,
        schema_name: str,
        table_name: str,
        format: str,
        compression: str,
        batch_size: int,
        partition_columns: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates or updates a job record in dbo.ingestion_jobs."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    IF NOT EXISTS (SELECT 1 FROM dbo.ingestion_jobs WHERE job_id = %s)
                    BEGIN
                        INSERT INTO dbo.ingestion_jobs (
                            job_id, source_id, schema_name, table_name,
                            format, compression, batch_size, partition_columns, status
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'PENDING');
                    END
                    ELSE
                    BEGIN
                        UPDATE dbo.ingestion_jobs
                        SET status = 'PENDING',
                            format = %s,
                            compression = %s,
                            batch_size = %s,
                            partition_columns = %s,
                            updated_at = SYSUTCDATETIME()
                        WHERE job_id = %s;
                    END
                    """,
                    (
                        job_id,
                        job_id,
                        source_id,
                        schema_name,
                        table_name,
                        format,
                        compression,
                        batch_size,
                        partition_columns or "none",
                        format,
                        compression,
                        batch_size,
                        partition_columns or "none",
                        job_id,
                    ),
                )
                conn.commit()
            return self.get_job(job_id) or {}
        finally:
            conn.close()

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a job record and its latest run details."""
        conn = self._get_connection()
        try:
            with conn.cursor(as_dict=True) as cur:
                cur.execute(
                    """
                    SELECT job_id, source_id, schema_name, table_name,
                           format, compression, batch_size, partition_columns,
                           status, created_at, updated_at
                    FROM dbo.ingestion_jobs
                    WHERE job_id = %s;
                    """,
                    (job_id,),
                )
                job = cur.fetchone()
                if not job:
                    return None

                # Format datetimes
                job["created_at"] = job["created_at"].isoformat() if job["created_at"] else None
                job["updated_at"] = job["updated_at"].isoformat() if job["updated_at"] else None

                # Fetch latest run
                cur.execute(
                    """
                    SELECT TOP 1 run_id, job_id, status, total_rows_extracted,
                           total_bytes_written, total_objects_created, manifest_path,
                           error_message, started_at, completed_at
                    FROM dbo.job_runs
                    WHERE job_id = %s
                    ORDER BY started_at DESC;
                    """,
                    (job_id,),
                )
                latest_run = cur.fetchone()
                if latest_run:
                    latest_run["started_at"] = latest_run["started_at"].isoformat() if latest_run["started_at"] else None
                    latest_run["completed_at"] = latest_run["completed_at"].isoformat() if latest_run["completed_at"] else None
                job["latest_run"] = latest_run
                return job
        finally:
            conn.close()

    def list_jobs(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Lists recent jobs with pagination."""
        conn = self._get_connection()
        try:
            with conn.cursor(as_dict=True) as cur:
                cur.execute(
                    """
                    SELECT job_id, source_id, schema_name, table_name,
                           format, compression, batch_size, partition_columns,
                           status, created_at, updated_at
                    FROM dbo.ingestion_jobs
                    ORDER BY created_at DESC
                    OFFSET %s ROWS FETCH NEXT %s ROWS ONLY;
                    """,
                    (offset, limit),
                )
                rows = cur.fetchall()
                for r in rows:
                    r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
                    r["updated_at"] = r["updated_at"].isoformat() if r["updated_at"] else None
                return rows
        finally:
            conn.close()

    def create_run(self, run_id: str, job_id: str) -> Dict[str, Any]:
        """Creates a new run entry in dbo.job_runs."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO dbo.job_runs (
                        run_id, job_id, status, started_at
                    ) VALUES (%s, %s, 'RUNNING', SYSUTCDATETIME());

                    UPDATE dbo.ingestion_jobs
                    SET status = 'RUNNING', updated_at = SYSUTCDATETIME()
                    WHERE job_id = %s;
                    """,
                    (run_id, job_id, job_id),
                )
                conn.commit()
            return {"run_id": run_id, "job_id": job_id, "status": "RUNNING"}
        finally:
            conn.close()

    def update_run_status(
        self,
        run_id: str,
        job_id: str,
        status: str,
        total_rows: int = 0,
        total_bytes: int = 0,
        total_objects: int = 0,
        manifest_path: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Updates run status and cascades parent job status."""
        conn = self._get_connection()
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
                        job_id,
                    ),
                )
                conn.commit()
        finally:
            conn.close()

    def cancel_job(self, job_id: str) -> bool:
        """Marks active runs and the job itself as CANCELLED."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE dbo.job_runs
                    SET status = 'CANCELLED',
                        error_message = 'Job execution was cancelled by user request.',
                        completed_at = SYSUTCDATETIME()
                    WHERE job_id = %s AND status IN ('PENDING', 'RUNNING');

                    UPDATE dbo.ingestion_jobs
                    SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
                    WHERE job_id = %s;
                    """,
                    (job_id, job_id),
                )
                conn.commit()
                return cur.rowcount > 0
        finally:
            conn.close()
