---
name: data-quality-testing
description: Validate source data, ingestion outputs, API contracts, and analytical query correctness.
---
# Data Quality and Testing Skill

## Mission
Ensure the data is complete, typed, traceable, and queryable after ingestion.

## Checks
- Required columns and supported types.
- Null counts, duplicate transaction keys (if a stable key exists), valid transaction types, non-negative amounts where expected.
- Step range and synthetic timestamp conversion.
- `isFraud` and `isFlaggedFraud` domain in {0,1}.
- Source row count = extracted row count = Parquet read-back row count.
- Partition totals reconcile to global totals.
- Object manifest matches actual MinIO objects and byte sizes.
- Trino aggregate results reconcile with local PyArrow/DuckDB reference results.
- API state transitions and failure/retry semantics.
## Rules
- Distinguish hard errors from warnings; do not silently repair source values.
- Store quality results and validation timestamp with each job.
- Use deterministic fixtures for unit tests and a small PaySim sample for integration tests.
- Keep sensitive values out of logs and test snapshots.
## Required outputs
Data-quality report, test suite, reconciliation SQL, and CI test instructions.
