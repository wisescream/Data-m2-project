---
name: parquet-minio-storage
description: Maintain DuckDB Parquet serialization, ZSTD/Snappy compression, MinIO S3 staging/promotion, and Kafka S3 Sink storage layout.
---
# Parquet and MinIO Storage Skill

## Mission
Produce query-efficient, reproducible Parquet/CSV/NDJSON objects in `finlake-minio` (`s3://finlake/`) with atomic promotion and manifest verification.

## Storage Layout (`s3://finlake/`)
- `staging/<job_id>/` : Temporary batch uploads during active extraction.
- `raw/paysim/transactions/` : Unmodified source landing zone.
- `curated/<table_or_domain>/` : Promoted Parquet files (partitioned by `event_date=YYYY-MM-DD` when applicable).
- `curated/kafka_sink/<topic>/ingest_date=YYYY-MM-DD/` : Micro-batched events flushed by `KafkaMinioSinkService`.
- `manifests/<table>/<run_id>.json` : Published last after checksum & row count validation.
- `warehouse/` & `iceberg/` : Hive Metastore and Apache Iceberg v2 storage.

## Rules
- Use **DuckDB JDBC** (`org.duckdb:duckdb_jdbc`) inside `NativeJavaIngestionService.processAndUploadBatch` for Parquet conversion (`snappy`, `zstd`, `gzip`, `none`); never reintroduce Python/PyArrow.
- Write to `staging/` first, compute SHA-256 and byte sizes, promote atomically to `curated/`, and publish the manifest JSON last.
- Derive `event_date` from PaySim `step` (`2023-01-01T00:00:00Z + (step - 1) hours`). Never partition by high-cardinality IDs like `nameOrig` or `nameDest`.
- Ensure bucket existence (`BucketExistsArgs` / `MakeBucketArgs`) before every upload.

## Acceptance Checks
- Extraction job produces valid Parquet files under `curated/` and a matching manifest under `manifests/`.
- `POST /kafka/sink/flush` writes batched events to `curated/kafka_sink/`.
