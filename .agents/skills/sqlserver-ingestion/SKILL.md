---
name: sqlserver-ingestion
description: Maintain safe, bounded-memory JDBC & polyglot source discovery, 4-step TLS probing, and batch extraction in FinLake.
---
# SQL Server & Polyglot Ingestion Skill

## Mission
Maintain `SourceExplorerService` and `NativeJavaIngestionService` for universal source discovery, real 4-step probing, and bounded-memory extraction.

## Codebase Ownership
- `backend/src/main/java/com/finlake/service/SourceExplorerService.java`
- `backend/src/main/java/com/finlake/service/NativeJavaIngestionService.java`
- `backend/src/main/java/com/finlake/controller/SourceController.java`
- `frontend/src/app/sources/page.tsx` & `frontend/src/app/sources/new/page.tsx`

## Rules
- **4-Step Probe (`probeConnection`)**:
  1. TCP socket reachability with `connection_timeout`.
  2. Real TLS/SSL verification honoring `encrypt` and `trust_server_certificate` (do NOT mask `SunCertPathBuilderException` / PKIX failures).
  3. Authentication (`18456` SQL Server, `28P01` PostgreSQL, SCRAM-SHA-256 MongoDB, AUTH Redis, Kerberos TGT).
  4. Live catalog/table/collection/topic/realm discovery.
- **SQL Injection Prevention**: Always validate SQL identifiers via `SourceExplorerService.validateIdentifier` (`^[a-zA-Z_][a-zA-Z0-9_]*$`) and use `PreparedStatement` for metadata queries.
- **Bounded Memory**: Stream JDBC `ResultSet` with `setFetchSize(Math.min(batchSize, 5000))`, write batches to temp CSV, convert via DuckDB, upload to MinIO, and delete temp files immediately.
- **Polyglot Support**: Keep `resolveEngineType` in `frontend/src/app/sources/new/page.tsx` unified between `handleTestConnection` and `handleSaveConnection` (`sqlserver`, `postgresql`, `kafka`, `mongodb`, `redis`, `kerberos`, `minio`).
- **Never log passwords, connection strings, or raw PII**.

## Acceptance Checks
- Probing `sqlserver:1433` with `encrypt=true` and `trust_server_certificate=false` fails at Step 2 with PKIX error; with `trust_server_certificate=true` succeeds in 4 steps.
- Probing `mongodb:27017`, `redis:6379`, `kerberos:88`, `kafka:9092`, `postgres-source:5432` all succeed.
