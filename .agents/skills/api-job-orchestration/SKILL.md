---
name: api-job-orchestration
description: Maintain FinLake Spring Boot REST endpoints, DTO contracts, and asynchronous polyglot extraction job lifecycle.
---
# API and Job Orchestration Skill

## Mission
Maintain clean REST contracts (`docs/api_contracts.md`) and reliable asynchronous job execution across all database families in `finlake-backend`.

## Codebase Ownership
- **Controllers**: `HealthController`, `AuthController`, `SourceController`, `JobController`, `KafkaController`, `AnalyticsController`, `DataCatalogController`, `SecurityGovernanceController`, `DashboardController`.
- **Services**: `JobOrchestrationService`, `NativeJavaIngestionService`, `KafkaMinioSinkService`.
- **Persistence**: `JobMetadataRepository` persisting jobs and runs in SQL Server (`dbo.ingestion_jobs`, `dbo.job_runs`).
- **Frontend**: `frontend/src/lib/api.ts`, `frontend/src/app/jobs/page.tsx`.

## Rules
- Use **Spring Boot 3.3.5 + Java 21 records** (`@JsonProperty`) for all DTOs; never reintroduce Python/FastAPI.
- `POST /storage/jobs` MUST return `202 Accepted` (`JobCreateResponseDTO`) and dispatch execution asynchronously via `ExecutorService` to `NativeJavaIngestionService.executeIngestion`.
- State transitions: `PENDING` → `RUNNING` → `SUCCESS` / `FAILED` / `CANCELLED`.
- `GET /storage/jobs` MUST filter by `tenant_id` (`sourceExplorerService.getTenantForSource(j.sourceId())`) and surface newly submitted jobs at the top for every tenant (`tenant_acme`, `tenant_apex`, `tenant_nordic`).
- `GET /storage/jobs/{jobId}/result` returns row counts, MinIO object keys, byte sizes, SHA-256 checksums, and manifest URI — never raw credentials or unmasked PII rows.
- Keep `docs/api_contracts.md` synchronized whenever any endpoint, header, or DTO changes.

## Acceptance Checks
- `mvn -f backend/pom.xml test` passes (`JobDtoTest`, `FinlakeApplicationTests`, `SourceExplorerServiceTest`, `TrinoAnalyticsServiceTest`).
- Submitting a job from `/jobs` for SQL Server, PostgreSQL, MongoDB, Redis, Kafka, Cassandra, or InfluxDB transitions to `SUCCESS` and appears in the company's Storage Jobs table and Pipeline Execution Flow.
