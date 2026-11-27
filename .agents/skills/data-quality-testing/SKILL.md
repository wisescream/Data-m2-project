---
name: data-quality-testing
description: Validate source connectivity, Java backend unit tests, Next.js TypeScript builds, API contracts, and multi-tenant data isolation.
---
# Data Quality and Testing Skill

## Mission
Ensure every backend, frontend, and infrastructure change is verified before claiming completion.

## Test Suites & Commands
1. **Backend Unit Tests (Java 21 / Maven)**:
   - Command: `mvn -f backend/pom.xml test` (or `clean test`)
   - Covers: `JobDtoTest`, `FinlakeApplicationTests`, `SourceExplorerServiceTest`, `TrinoAnalyticsServiceTest`.
2. **Frontend Type-Check & Build (Next.js 15 / Turbopack)**:
   - Command (Windows PowerShell safe): `cmd /c "cd frontend && npm run build"`
   - Must compile all 10 routes (`/`, `/analytics`, `/benchmarks`, `/catalog`, `/iceberg`, `/jobs`, `/login`, `/security`, `/sources`, `/sources/new`) with 0 TypeScript errors.
3. **Live Docker End-to-End Checks**:
   - `GET http://localhost:8000/health` → `"healthy"`
   - `POST http://localhost:8000/sources/probe` → verify SQL Server TLS (`trust_server_certificate=false` fails Step 2 with PKIX, `true` succeeds) + MongoDB, Redis, Kerberos, Kafka.
   - `POST /storage/jobs` & `GET /storage/jobs?tenant_id=...` → verify polyglot ingestion & tenant filtering.
   - `POST /api/analytics/query` & `POST /api/security/policies` → verify single/multi-DB queries and `ADMIN`/`DATA_OWNER` dynamic anonymization.

## Rules
- Never report tests or services as passing unless executed after the final edit.
- Keep sensitive values and real `.env` secrets out of test fixtures and logs.
