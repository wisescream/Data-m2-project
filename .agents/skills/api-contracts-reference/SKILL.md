---
name: api-contracts-reference
description: Complete REST API contracts reference for FinLake with all exact inputs (methods, paths, headers, query params, request JSON bodies) and all outputs (status codes, response JSON schemas, error payloads).
---
# FinLake Complete API Contracts Skill

## Mission
Provide the exact, exhaustive input and output specification for every REST endpoint in `finlake-backend` (`http://localhost:8000`) so backend DTOs, frontend `frontend/src/lib/api.ts`, and `docs/api_contracts.md` never drift.

---

## 1. Health (`HealthController`)
- **`GET /health`**
  - **Inputs**: None.
  - **Output `200 OK`**:
    `{ "status": "healthy"|"degraded", "services": { "sqlserver": "up"|"down", "minio": "up"|"down", "trino": "up"|"down" }, "timestamp": "ISO-8601" }`

## 2. Authentication (`AuthController`)
- **`POST /api/auth/login`**
  - **Input JSON**: `{ "username": string, "password": string }`
  - **Output `200 OK`**:
    `{ "token": string, "user": { "id": string, "username": string, "full_name": string, "email": string, "role": "ADMIN"|"DATA_OWNER"|"DATA_ENGINEER"|"AUDITOR"|"ANALYST", "tenant_id": string, "tenant_name": string, "assigned_catalog": string, "assigned_schema": string, "can_view_pii": boolean } }`
  - **Output `401 Unauthorized`**: `{ "error": string }`

## 3. Data Sources & 4-Step Probe (`SourceController`)
- **`GET /sources`**
  - **Query Params**: `tenant_id` (optional: `tenant_acme` | `tenant_apex` | `tenant_nordic` | `ALL`).
  - **Output `200 OK`**: `Array<{ id, name, type, host, port, database, status, status_hint, last_tested, server_version }>`
- **`POST /sources/probe`**
  - **Input JSON** (`SourceProbeRequestDTO`):
    `{ "connection_name": string (required), "type": "sqlserver"|"postgresql"|"kafka"|"mongodb"|"redis"|"kerberos"|"minio"|"cassandra"|"influxdb", "host": string (required), "port": int, "database": string (required), "auth_method": string, "username": string (required), "password": string, "encrypt": boolean, "trust_server_certificate": boolean, "connection_timeout": int }`
  - **Output `200 OK`** (`SourceProbeResponseDTO`):
    `{ "status": "success"|"failed", "summary": string, "server_version": string|null, "response_time_ms": long, "tested_at": string, "steps": [{ "id": int, "name": string, "detail": string, "status": "success"|"failed"|"skipped" }], "technical_details": string|null, "troubleshooting_checklist": string[], "discovered_tables": string[] }`
- **`POST /sources`**
  - **Query Params**: `tenant_id` (optional, default `tenant_acme`).
  - **Input JSON**: `SourceProbeRequestDTO`.
  - **Output `201 Created`**: `DataSourceItemDTO`.
- **`POST /sources/{sourceId}/test`**
  - **Path Param**: `sourceId`.
  - **Output `200 OK`**: `{ "source_id": string, "status": "connected"|"failed", "server_version": string|null, "database": string|null, "error": string|null }`
- **`GET /sources/{sourceId}/tables`**
  - **Path Param**: `sourceId` | **Query Param**: `schema` (default `dbo`).
  - **Output `200 OK`**: `{ "source_id": string, "schema": string, "tables": string[] }` | **`400 Bad Request`** on invalid identifier.
- **`GET /sources/{sourceId}/tables/{table}/schema`**
  - **Path Params**: `sourceId`, `table` | **Query Param**: `schema` (default `dbo`).
  - **Output `200 OK`**: `{ "source_id": string, "schema": string, "table": string, "estimated_row_count": long, "column_count": int, "primary_keys": string[], "columns": [{ "column_name": string, "data_type": string, "is_nullable": boolean, "is_primary_key": boolean, "is_identity": boolean }] }`
- **`GET /sources/{sourceId}/tables/{table}/preview`**
  - **Path Params**: `sourceId`, `table` | **Query Param**: `schema` (default `dbo`).
  - **Headers**: `X-User-Id`, `X-User-Role` (default `ANALYST`).
  - **Output `200 OK`**: `{ "columns": string[], "rows": Array<Record<string, any>>, "row_count": int, "execution_time_ms": long, "error": string|null }` (with dynamic PII masking applied).

## 4. Storage Ingestion Jobs (`JobController`)
- **`POST /storage/jobs`**
  - **Input JSON**: `{ "source_id": string, "schema_name": string, "table": string, "format": "parquet"|"csv", "compression": "snappy"|"zstd"|"gzip"|"none", "batch_size": int, "partition_by": string[], "max_rows": long|null }`
  - **Output `202 Accepted`**: `{ "job_id": string, "status": "ACCEPTED", "message": string, "created_at": string }`
- **`GET /storage/jobs`**
  - **Query Params**: `limit` (default `50`), `offset` (default `0`), `tenant_id` (optional).
  - **Output `200 OK`**: `Array<{ job_id, source_id, schema_name, table_name, format, compression, batch_size, partition_columns, status, created_at, updated_at, latest_run }>`
- **`GET /storage/jobs/{jobId}`**
  - **Output `200 OK`**: `JobStatusResponseDTO` | **`404 Not Found`**.
- **`GET /storage/jobs/{jobId}/result`**
  - **Output `200 OK`**: `JobResultResponseDTO` (run metrics + MinIO manifest) | **`404 Not Found`**.
- **`POST /storage/jobs/{jobId}/cancel`**
  - **Output `200 OK`**: `{ "job_id": string, "status": "CANCELLED", "message": string }` | **`404 Not Found`**.

## 5. Kafka & MinIO S3 Sink (`KafkaController`)
- **`GET /kafka/status`**
  - **Output `200 OK`**: `{ "status": "ACTIVE", "bootstrap_servers": string, "active_topics": string[], "total_messages_received": long, "total_batches_sunk": long, "total_bytes_written_to_minio": long, "last_sink_timestamp": string, "target_s3_prefix": string, "topic_metrics": Record<string, long> }`
- **`POST /kafka/publish`**
  - **Input JSON**: `{ "topic": string, "key": string, "payload": string (required), "source_database_type": string, "entity_name": string }`
  - **Output `200 OK`**: `{ "status": "PUBLISHED", "topic": string, "key": string, "event_id": string, "buffered_count": int, "sink_target": string }`
- **`POST /kafka/sink/flush`**
  - **Query Param**: `topic` (default `finlake.polyglot.events`).
  - **Output `200 OK`**: `{ "status": "SUCCESS"|"NO_OP"|"ERROR", "topic": string, "records_sunk": int, "bytes_written": long, "s3_uri": string, "timestamp": string }`

## 6. Analytics & AI Copilot (`AnalyticsController`)
- **`POST /api/analytics/query`**
  - **Headers**: `X-Tenant-Id`, `X-User-Role`, `X-User-Id`, `X-User-Name`.
  - **Input JSON**: `{ "query": string, "catalog": string, "schema": string, "max_rows": int }`
  - **Output `200 OK`**: `{ "columns": string[], "rows": Array<Record<string, any>>, "row_count": int, "execution_time_ms": long, "error": string|null }`
- **`POST /api/analytics/ai/generate`**
  - **Input JSON**: `{ "prompt": string }`
  - **Output `200 OK`**: `{ "sql": string, "explanation": string, "catalog": string, "schema": string, "suggested_chart": "table"|"bar"|"line"|"area"|"pie", "suggested_x": string|null, "suggested_y": string|null }`

## 7. Data Catalog (`DataCatalogController`)
- **`GET /api/catalog/tables`**
  - **Query Param**: `tenant_id` (optional).
  - **Output `200 OK`**: `Array<CatalogTableSummaryDTO>`
- **`GET /api/catalog/tables/{tableId}`**
  - **Output `200 OK`**: `CatalogTableDetailDTO` (summary, columns, sample_queries, lineage_upstream, lineage_downstream) | **`404 Not Found`**.
- **`GET /api/catalog/search`**
  - **Query Params**: `q`, `tenant_id`.
  - **Output `200 OK`**: `Array<CatalogTableSummaryDTO>`.

## 8. Security, RBAC & Anonymization (`SecurityGovernanceController`)
- **`GET /api/security/tenants`** → **Output `200 OK`**: `Array<TenantDTO>`
- **`GET /api/security/personas`** → **Output `200 OK`**: `Array<UserPersonaDTO>`
- **`GET /api/security/policies`**
  - **Query Param**: `tenant_id` (optional).
  - **Output `200 OK`**: `{ "policies": [{ "user_id": string, "username": string, "full_name": string, "role": string, "tenant_id": string, "anonymized": boolean }] }`
- **`POST /api/security/policies`**
  - **Headers**: `X-User-Role` (MUST be `DATA_OWNER` or `ADMIN`).
  - **Input JSON**: `{ "target_user_id": string, "anonymize": boolean }`
  - **Output `200 OK`**: `{ "status": "UPDATED", "user_id": string, "username": string, "anonymized": boolean }`
  - **Output `403 Forbidden`**: `{ "error": string }` | **`400 Bad Request`**: `{ "error": string }`.
- **`GET /api/security/audit-logs`**
  - **Query Param**: `tenant` (default `ALL`).
  - **Output `200 OK`**: `Array<AuditLogDTO>`
- **`POST /api/security/audit`**
  - **Input JSON**: `AuditLogDTO` → **Output `200 OK`**.

## 9. Dashboard & Iceberg (`DashboardController`)
- **`GET /api/dashboard/stats`**
  - **Query Param**: `tenant_id` (optional).
  - **Output `200 OK`**: `{ "total_source_rows": long, "total_indexed_rows": long, "compression_gain": string, "partition_pruning_speedup": string, "services": Record<string, string> }`
- **`GET /api/dashboard/iceberg`**
  - **Query Param**: `tenant_id` (optional).
  - **Output `200 OK`**: `{ "status": string, "table": string, "total_rows": long, "snapshots_count": int, "snapshots": [{ "snapshot_id": string, "parent_id": string|null, "operation": string, "committed_at": string }], "error": string|null }`
- **`GET /api/dashboard/iceberg/time-travel`**
  - **Query Params**: `tenant_id`, `snapshot_id` (required).
  - **Output `200 OK`**: `QueryResultDTO` (`historical_rows`, `historical_volume`).
