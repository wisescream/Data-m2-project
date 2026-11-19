---
name: benchmark-methodology
description: Design reproducible CSV/Parquet, partitioning, compression, and batch-size experiments for FinLake.
---
# Benchmark Methodology Skill

## Mission
Measure storage and query performance fairly and explain results without overclaiming.

## Experimental dimensions
- Format: CSV vs Parquet.
- Partitioning: none vs time-based.
- Compression: none vs Snappy vs Zstandard (where supported).
- Extraction batch size: 1k, 5k, 10k, 50k rows (adapt to available RAM).
- Queries: full scan, time filter, type aggregation, fraud-label aggregation, join if derived dimensions exist.

## Rules
- Use identical input rows, schema, hardware, Docker resource limits, and query semantics.
- Separate source extraction, conversion, upload, catalog registration, and Trino query times.
- Warm up Trino and run repeated trials (minimum 3; preferably 5); report median and spread.
- Record cold/warm cache conditions; do not compare a cold run with a warm run.
- Record object count, total bytes, average object size, rows, throughput, and query latency.
- Use `EXPLAIN` to verify pruning; partitioning is not automatically faster.
- Avoid comparing different row counts or silently filtered datasets.
- Report hardware, Docker versions, dataset checksum, configuration, and exact SQL.
- Never fabricate measurements; generate tables from collected result files.
## Required outputs
Benchmark runner, machine-readable CSV/JSON results, charts, methodology, and interpretation.
