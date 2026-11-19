"""Pydantic schemas for the FinLake REST API."""

from __future__ import annotations

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., example="healthy")
    services: Dict[str, str] = Field(..., example={"sqlserver": "up", "minio": "up", "trino": "up"})
    timestamp: str


class SourceInfo(BaseModel):
    id: str = Field(..., example="sqlserver")
    type: str = Field(..., example="relational/sqlserver")
    database: str = Field(..., example="finlake_source")
    host: str = Field(..., example="127.0.0.1")
    port: int = Field(..., example=1433)
    description: str


class SourceTestResponse(BaseModel):
    source_id: str
    status: Literal["connected", "failed"]
    server_version: Optional[str] = None
    database: Optional[str] = None
    error: Optional[str] = None


class TableListResponse(BaseModel):
    source_id: str
    schema_name: str
    tables: List[str]


class ColumnSchema(BaseModel):
    name: str
    type: str
    nullable: bool
    max_length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None


class TableSchemaResponse(BaseModel):
    source_id: str
    schema_name: str
    table_name: str
    columns: List[ColumnSchema]


class JobCreateRequest(BaseModel):
    source_id: str = Field(default="sqlserver", description="Configured source ID")
    schema_name: str = Field(default="dbo", description="Database schema name")
    table: str = Field(default="transactions", description="Source table name")
    format: Literal["parquet", "csv"] = Field(default="parquet", description="Target storage format")
    compression: Literal["snappy", "zstd", "none", "gzip"] = Field(default="snappy", description="Compression codec")
    batch_size: int = Field(default=50000, gt=0, le=500000, description="Rows per extraction batch")
    partition_by: Optional[List[str]] = Field(default=["event_date"], description="List of partition columns")
    max_rows: Optional[int] = Field(default=None, gt=0, description="Optional cap on rows extracted (for tests/samples)")


class JobCreateResponse(BaseModel):
    job_id: str
    status: str = "ACCEPTED"
    message: str
    created_at: str


class JobRunInfo(BaseModel):
    run_id: str
    status: str
    total_rows_extracted: Optional[int] = 0
    total_bytes_written: Optional[int] = 0
    total_objects_created: Optional[int] = 0
    manifest_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    source_id: str
    schema_name: str
    table_name: str
    format: str
    compression: str
    batch_size: int
    partition_columns: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    latest_run: Optional[JobRunInfo] = None


class JobResultResponse(BaseModel):
    job_id: str
    run_id: Optional[str] = None
    status: str
    total_rows_extracted: int
    total_bytes_written: int
    total_objects_created: int
    manifest_path: Optional[str] = None
    manifest: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[float] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
