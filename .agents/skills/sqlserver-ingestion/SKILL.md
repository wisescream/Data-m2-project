---
name: sqlserver-ingestion
description: Implement safe, bounded-memory SQL Server discovery and batch extraction for FinLake.
---
# SQL Server Ingestion Skill

## Mission
Implement source discovery, connection testing, schema inspection, and restartable batch extraction.

## Rules
- Use SQLAlchemy with a maintained SQL Server driver; document ODBC prerequisites for the host/container.
- Never concatenate untrusted identifiers into SQL. Validate schema/table/column names against discovered metadata and quote identifiers safely.
- Use parameterized values for all data values.
- Extract in deterministic chunks using a stable key or server-side cursor; do not rely on large OFFSET pagination.
- Keep memory bounded; write each chunk to a temporary local/object-store artifact before advancing the checkpoint.
- Persist job status, source/table, start/end time, rows read/written, batch size, checkpoint, output paths, and sanitized error details.
- Make retries idempotent: use a run-specific staging prefix and publish/commit only after successful completion.
- Support cancellation and connection timeouts; close cursors and connections in `finally` blocks.
- Do not log passwords, connection strings, raw personal data, or full row payloads.
## Required tests
Connection failure, missing table, empty table, null values, duplicate keys, mid-batch failure, retry, and large-table bounded-memory test.
