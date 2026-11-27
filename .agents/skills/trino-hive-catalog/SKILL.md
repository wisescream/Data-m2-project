---
name: trino-hive-catalog
description: Maintain Hive Metastore, Trino 452 MPP querying, Federated Polyglot Routing, AI Text-to-SQL, and Iceberg Time-Travel.
---
# Trino, Hive, Iceberg & Federated Query Skill

## Mission
Keep distributed SQL querying (`TrinoAnalyticsService`), AI Copilot (`AiTextToSqlService`), and Iceberg Time-Travel (`IcebergService`) accurate, fast, and multi-tenant.

## Codebase Ownership
- `backend/src/main/java/com/finlake/service/TrinoAnalyticsService.java`
- `backend/src/main/java/com/finlake/service/IcebergService.java`
- `backend/src/main/java/com/finlake/service/AiTextToSqlService.java`
- `backend/src/main/java/com/finlake/service/DataCatalogService.java`
- `frontend/src/app/analytics/page.tsx`, `frontend/src/app/iceberg/page.tsx`, `frontend/src/app/catalog/page.tsx`

## Rules
- **Trino JDBC**: Strip trailing semicolons before sending SQL to `jdbc:trino://trino:8080/<catalog>/<schema>`.
- **Federated Polyglot Routing**: Queries targeting `postgresql`, `mongodb`, `redis`, `kafka`, `cassandra`, `influxdb`, `minio`, or `federated` (Cross-DB JOINs) are routed by `TrinoAnalyticsService.executeFederatedPolyglotQuery` using live `SourceExplorerService` data.
- **Keep No-Arg Constructor**: `TrinoAnalyticsService` MUST retain its no-arg constructor alongside `@Autowired TrinoAnalyticsService(SourceExplorerService)` so `TrinoAnalyticsServiceTest` passes.
- **Iceberg Multi-Tenancy**: `IcebergService` MUST return distinct namespaces and snapshots per company (`tenant_acme` → `iceberg.finlake_iceberg.transactions`, `tenant_apex` → `iceberg.apex_eu_iceberg.retail_ledger`, `tenant_nordic` → `iceberg.nordic_iceberg.mobile_money_ledger`) with working `time-travel` metrics.
- **AI Copilot**: `AiTextToSqlService` checks deterministic polyglot/federated intents first, then Groq LLM (`GROQ_API_KEY`), with full offline semantic fallback.

## Acceptance Checks
- Single-DB queries (`hive`, `iceberg`, `postgresql`, `mongodb`, `redis`, `kafka`, `cassandra`, `influxdb`) and `federated` Cross-DB JOINs return valid columns/rows in `/analytics` with Query Execution Flow updated.
- `/iceberg` shows distinct snapshots and working time-travel for each of the 3 companies.
