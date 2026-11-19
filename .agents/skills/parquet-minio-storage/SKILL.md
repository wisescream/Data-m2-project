---
name: parquet-minio-storage
description: Write, partition, compress, and publish analytical files to MinIO safely.
---
# Parquet and MinIO Storage Skill

## Mission
Produce query-efficient and reproducible objects in MinIO.

## Rules
- Use PyArrow for Parquet writing and schema control; use CSV only for benchmark comparisons.
- Write to a staging prefix first; publish a manifest/complete marker only after all objects are uploaded and validated.
- Store source, table, ingestion date, and run ID in the object path. Partition only on query-relevant, low/medium-cardinality fields.
- For PaySim, derive a synthetic event timestamp from `step`; compare unpartitioned, day/hour and month-like groupings carefully. Do not partition by account ID.
- Avoid tiny files; benchmark target file sizes and batch-to-file mapping instead of creating one object per tiny batch.
- Test Snappy and Zstandard where supported; record codec and row-group size.
- Preserve schema metadata and nullability. Validate row counts and Parquet readability after upload.
- Use MinIO's S3-compatible endpoint explicitly; distinguish internal Docker endpoint from host console endpoint.
- Do not expose buckets publicly. Use least-privilege credentials.
## Required outputs
Storage layout, writer implementation, manifest format, validation checks, and benchmark metadata.
