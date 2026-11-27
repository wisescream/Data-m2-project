---
name: benchmark-methodology
description: Design reproducible CSV/Parquet, partitioning, compression, and batch-size benchmarks for FinLake.
---
# Benchmark Methodology Skill

## Mission
Measure FinLake ingestion and Trino query performance fairly and reproducibly, keeping `docs/benchmark_report.md` and `frontend/src/app/benchmarks/page.tsx` aligned with verified runs.

## Experimental Dimensions
- **Format**: `csv` vs `parquet`.
- **Compression**: `none`, `snappy`, `zstd`, `gzip`.
- **Partitioning**: `none` vs `event_date`.
- **Batch Size**: `10,000`, `50,000`, `100,000`, `250,000` rows.
- **Trino Queries**: Fraud distribution scan, hourly volume by type, point `event_date` range lookup.

## Rules
- Use identical input rows, schema, hardware, and Docker limits when comparing configurations.
- Separate extraction, DuckDB Parquet conversion, MinIO upload, and Trino query latencies.
- Verify partition pruning in Trino using `EXPLAIN` before claiming speedup.
- Never fabricate measurements or overwrite verified metrics in `docs/benchmark_report.md` without re-running the benchmark suite.
