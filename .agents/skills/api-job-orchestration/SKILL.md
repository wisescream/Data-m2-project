---
name: api-job-orchestration
description: Build FinLake REST endpoints and reliable asynchronous extraction job lifecycle.
---
# API and Job Orchestration Skill

## Mission
Expose source discovery and asynchronous extraction through a small REST API.

## Required endpoints
- GET /health
- GET /sources
- POST /sources/{source_id}/test
- GET /sources/{source_id}/tables
- GET /sources/{source_id}/tables/{table}/schema
- POST /storage/jobs
- GET /storage/jobs/{job_id}
- GET /storage/jobs/{job_id}/result
- POST /storage/jobs/{job_id}/retry (optional)
- POST /storage/jobs/{job_id}/cancel (optional)

## Rules
- Use FastAPI, Pydantic request/response schemas, OpenAPI, and structured logs.
- POST job creation returns 202 Accepted and a job identifier; processing occurs in a worker.
- Validate format, table, partition columns, batch size, compression, and source identifier.
- Keep job state in a durable local metadata store (SQLite is acceptable for the local single-node project) or SQL Server metadata schema if approved.
- Define state transitions: PENDING -> RUNNING -> SUCCEEDED / FAILED / CANCELLED.
- Make result endpoint return row counts, object keys, bytes, format, partition columns, timings, and checksum/manifest reference.
- Never return credentials or raw financial rows from job status endpoints.
- Add pagination to metadata endpoints where needed and consistent error responses.
## Required outputs
OpenAPI spec, API tests, job state diagram, and curl examples.
