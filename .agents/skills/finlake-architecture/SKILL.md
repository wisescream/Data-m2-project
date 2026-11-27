---
name: finlake-architecture
description: Design and review the FinLake local polyglot financial data lakehouse architecture, component boundaries, and Docker Compose topology.
---
# FinLake Architecture Skill

## Mission
Maintain the local Dockerized FinLake platform: Polyglot Sources (`SQL Server 2022`, `PostgreSQL 16`, `MongoDB 7.0`, `Redis 7.2`, `Kafka 3.7 KRaft`, `Kerberos KDC`) → `Spring Boot 3.3.5 (Java 21)` Control Plane & Native Ingestion + DuckDB Parquet → `MinIO S3` → `Hive Metastore 4.0.0` & `Apache Iceberg` → `Trino 452` + Federated Router → `Next.js 15` Wireframe UI.

## Component Boundaries
- **Control Plane & Ingestion (`finlake-backend`, port `8000`)**: Java 21 / Spring Boot 3.3.5 (`backend/src/main/java/com/finlake/`). Owns REST APIs, 4-step network/TLS probes, asynchronous job dispatch, bounded-memory extraction, DuckDB Parquet conversion, Kafka producer/MinIO sink, federated query routing, and RBAC/PII masking.
- **Presentation (`finlake-frontend`, port `3000`)**: Next.js 15 App Router (`frontend/src/app/`). Uses the light Wireframe design system (`#f8f9fa`, `bg-white`, `border-zinc-200`, `#18181b`, `AppShell.tsx`).
- **Storage (`finlake-minio`, ports `9000`/`9001`)**: S3-compatible object storage initialized by `finlake-minio-init`.
- **Metadata & Query (`finlake-metastore-db` `5433:5432`, `finlake-hive-metastore` `9083`, `finlake-trino` `8080`)**: External Parquet & Iceberg tables.
- **Polyglot & Auth (`finlake-sqlserver` `1433`, `finlake-postgres-source` `5434:5432`, `finlake-mongodb` `27017`, `finlake-redis` `6379`, `finlake-kafka` `9092`, `finlake-kerberos` `88`/`749`)**: Real local Docker services on `finlake-network`.

## Rules
- Local Docker Compose only (`docker-compose.yml`); no Kubernetes, Spark, Airflow, or paid cloud services.
- Keep `kafka` in KRaft mode (no ZooKeeper, `-Xms256m -Xmx512m`) and `mongodb` wiredTiger cache bounded (`0.25` GB).
- Never expose host port `5432` directly for internal Postgres instances (use `5433` for metastore DB, `5434` for `postgres-source`).
- Keep credentials out of Git; always update `.env.example`, `docs/architecture.md`, and `docs/context.md` when topology changes.

## Acceptance Checks
- `docker compose up -d` starts all services cleanly with health checks passing.
- `GET http://localhost:8000/health` returns `"healthy"` and `http://localhost:3000` serves all 10 routes.
