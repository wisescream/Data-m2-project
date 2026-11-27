---
name: execution-flow-maintenance
description: Maintain FinLake end-to-end execution flows across Source Discovery, Ingestion Pipelines, Kafka Sinks, Federated Trino Queries, and UI Flow Visualizations.
---
# Execution Flow & Pipeline Maintenance Skill

## Mission
Keep all 4 core execution flows synchronized between backend services, Docker containers, and frontend Execution Flow UI components (`/jobs`, `/analytics`, `/sources`).

## 1. Flow A — 4-Step Source Probe & Polyglot Discovery
```text
UI (/sources/new)
  └─> POST /sources/probe (SourceController -> SourceExplorerService.probeConnection)
        ├─ Step 1: TCP Socket reachability (host:port, timeout = connection_timeout)
        ├─ Step 2: TLS/SSL handshake (encrypt + trust_server_certificate -> real PKIX check)
        ├─ Step 3: Engine Authentication (SQL Server 18456, PG 28P01, Mongo SCRAM, Redis AUTH, Kerberos TGT)
        └─ Step 4: Live Catalog Discovery (tables / collections / topics / keyspaces / principals)
  └─> POST /sources?tenant_id=... (resolveEngineType MUST match probeConnection type)
```
**Maintenance rules**:
- `resolveEngineType` in `frontend/src/app/sources/new/page.tsx` MUST be shared by both `handleTestConnection` and `handleSaveConnection`.
- Whenever a new DB engine is added to `SourceExplorerService`, update: `initSeedSources`, `probeConnection`, `registerSource`, `getSourceType`, `listTables`, `describeTable`, `previewTable`, and `frontend/src/app/sources/new/page.tsx`.

## 2. Flow B — Ingestion Pipeline Execution Flow (`/jobs`)
```text
UI (/jobs: Source + Table + Format + Compression + BatchSize + Partitioning)
  └─> POST /storage/jobs (202 Accepted)
        └─> JobOrchestrationService.submitJob -> dbo.ingestion_jobs (SQL Server)
              └─> Async ExecutorService -> NativeJavaIngestionService.executeIngestion
                    ├─ If SQL (SQL Server / PostgreSQL): JDBC stream (setFetchSize <= 5000) -> temp CSV
                    ├─ If Polyglot (Mongo/Redis/Kafka/Cassandra/Influx/MinIO): SourceExplorerService.previewTable -> temp CSV
                    ├─ DuckDB JDBC: temp CSV -> Parquet (Snappy/ZSTD/Gzip) or CSV
                    ├─ MinIO S3: staging/<job_id>/ -> curated/<table>/ + manifests/<table>/<run_id>.json (SHA-256)
                    └─ dbo.job_runs + dbo.ingestion_jobs -> SUCCESS / FAILED
```
**UI Component**: `Pipeline Execution Flow` in `frontend/src/app/jobs/page.tsx` (5 cards: `1. Source Extract` → `2. Memory Batching` → `3. Serialization` → `4. Object Sink` → `5. Catalog & Manifest`).

## 3. Flow C — Polyglot Kafka KRaft & MinIO S3 Sink Flow
```text
Producer / Source Event
  └─> POST /kafka/publish (KafkaController -> KafkaMinioSinkService.publish)
        ├─ KafkaTemplate.send(topic, key, enrichedJson) -> finlake-kafka:9092 (KRaft)
        └─ Buffer in topicBuffers (auto-flush when >= 10 messages)
              └─> POST /kafka/sink/flush (or auto-flush)
                    └─> MinIO PutObject -> s3://finlake/curated/kafka_sink/<topic>/ingest_date=YYYY-MM-DD/*.json
```

## 4. Flow D — Trino & Federated Query Execution Flow (`/analytics`)
```text
UI (/analytics + AI Copilot + active X-Tenant-Id / X-User-Id / X-User-Role headers)
  └─> POST /api/analytics/query (AnalyticsController.runQuery)
        ├─ If hive/iceberg only -> TrinoAnalyticsService -> Trino 452 MPP (jdbc:trino://trino:8080)
        ├─ If polyglot or multi-DB JOIN (federated) -> TrinoAnalyticsService.executeFederatedPolyglotQuery
        ├─ SecurityGovernanceService.applyDynamicMasking(rawResult, userId, userRole)
        │     └─ Checks userAnonymizationPolicies (Admin / Data Owner override) -> masks email/name/iban/account
        └─ SecurityGovernanceService.recordAudit -> immutable auditLedger
```
**UI Component**: `Query Execution Flow` in `frontend/src/app/analytics/page.tsx` (5 cards: `1. Security & RBAC` → `2. Query Router` → `3. Compute Engine` → `4. PII Anonymization` → `5. Visual Workbench`).

## Maintenance Checklist
- After any change to a flow, update `frontend/src/app/jobs/page.tsx` or `analytics/page.tsx` flow cards if step labels/contracts changed, run `mvn -f backend/pom.xml test`, run `cmd /c "cd frontend && npm run build"`, and verify live in Docker.
