---
name: finlake-architecture
description: Design and review the FinLake local financial data lake architecture, component boundaries, contracts, and Docker topology.
---
# FinLake Architecture Skill

## Mission
Keep the solution aligned with the approved architecture: SQL Server -> ingestion API/worker -> Parquet/CSV -> MinIO -> Hive Metastore -> Trino. Everything runs locally with Docker Compose.

## Rules
- Preserve a clear separation between API control plane and ingestion worker/data plane.
- Do not make HTTP request handlers perform long-running extraction synchronously.
- Use SQL Server as the operational source and MinIO as object storage; do not silently replace either.
- Use Hive Metastore + Trino Hive connector for the baseline Parquet tables. Treat Iceberg as an optional extension, not a prerequisite.
- Keep credentials in environment variables; commit only `.env.example`.
- Define service health checks, persistent volumes, explicit networks, restart policies, and resource-conscious defaults.
- Explain every new infrastructure dependency and its operational purpose before adding it.
- Avoid Kubernetes, Spark, Kafka, Airflow, or paid cloud services unless the project scope explicitly changes.
## Required outputs
For architecture changes, update `docs/architecture.md`, `docker-compose.yml`, configuration examples, and a Mermaid diagram. Record trade-offs and assumptions.
## Acceptance
A fresh clone can be started locally from documented commands; all service dependencies and ports are documented; no secrets are committed.
