---
name: polyglot-security-governance
description: Maintain FinLake multi-tenancy, RBAC, Admin/Data Owner dynamic PII anonymization, Kerberos KDC, and Kafka KRaft + MinIO S3 Sinks.
---
# Polyglot Connectors, Kafka Sinks & Multi-Tenant Security Skill

## Mission
Keep FinLake's polyglot database connectors, Kafka KRaft MinIO S3 Sinks, Kerberos KDC authentication, and multi-tenant RBAC / Data Owner anonymization consistent across backend and frontend.

## Codebase Ownership
- **Backend**:
  - `SecurityGovernanceService.java` & `SecurityGovernanceController.java`: Tenants (`tenant_acme`, `tenant_apex`, `tenant_nordic`), Personas (`ADMIN`, `DATA_OWNER`, `DATA_ENGINEER`, `AUDITOR`, `ANALYST`), `userAnonymizationPolicies`, `applyDynamicMasking(rawResult, userId, role)`, and `auditLedger`.
  - `AuthService.java` & `AuthController.java`: `/api/auth/login` returning `LoginResponseDTO` with `tenant_id`, `role`, and live `can_view_pii`.
  - `KafkaConfig.java`, `KafkaMinioSinkService.java`, `KafkaController.java`: KRaft topics (`finlake.polyglot.events`, `finlake.transactions.events`), producer dispatch, and micro-batch flush to `s3://finlake/curated/kafka_sink/`.
  - `Dockerfile.kerberos` & `docker/kerberos/*`: Alpine 3.19 MIT Kerberos 5 KDC (`FINLAKE.INTERNAL`, ports `88`/`749`).
- **Frontend**:
  - `frontend/src/lib/api.ts`: `getActiveTenantContext()` reading `finlake_auth_session` / `finlake_active_persona`.
  - `frontend/src/components/AppShell.tsx`: Dynamic header badge listening to `finlake-session-changed`.
  - `frontend/src/app/security/page.tsx`: Persona switcher, RBAC matrix, Data Owner / Admin anonymization controls, and Audit Ledger.
  - `frontend/src/app/login/page.tsx`: Quick demo login cards for all 3 companies and roles.

## Rules & Invariants
1. **Tenant Isolation**:
   - Every tenant-scoped endpoint (`/api/dashboard/stats`, `/api/dashboard/iceberg`, `/sources`, `/storage/jobs`, `/api/catalog/tables`) MUST accept `tenant_id` and never leak another company's sources, jobs, catalog tables, or Iceberg snapshots.
2. **Data Owner & Admin Anonymization**:
   - Only `DATA_OWNER` or `ADMIN` may call `POST /api/security/policies`; any other role must receive `403 Forbidden`.
   - `applyDynamicMasking` MUST use `shouldAnonymizeUser(userId, role)` (checking `userAnonymizationPolicies` override first, then role default) and mask both standard columns (`email`, `first_name`, `last_name`, `customer_name`, `name_orig`, `name_dest`, `iban`) and federated prefixed columns (e.g., `mongodb_email`, `mongodb_first_name`, `mongodb_iban`).
   - Masking MUST be applied on both `/api/analytics/query` AND `/sources/{sourceId}/tables/{table}/preview`.
3. **Kafka KRaft & Polyglot Containers**:
   - Kafka runs in **KRaft mode** (`apache/kafka:3.7.0`, no ZooKeeper, `-Xms256m -Xmx512m`).
   - MongoDB (`mongo:7.0-jammy`, `--wiredTigerCacheSizeGB 0.25`), Redis (`redis:7.2-alpine`), and Kerberos (`Dockerfile.kerberos`) must remain lightweight with explicit health checks in `docker-compose.yml`.
4. **Frontend Session Sync**:
   - Whenever login or persona switching happens, update both `finlake_auth_session` and `finlake_active_persona` in `localStorage` and dispatch `window.dispatchEvent(new Event("finlake-session-changed"))`.

## Acceptance Checks
- `ADMIN` / `DATA_OWNER` can toggle anonymization for `user_david_auditor` and see masked vs unmasked rows immediately in `/analytics` and `/sources`.
- Switching between `tenant_acme`, `tenant_apex`, and `tenant_nordic` updates the AppShell header, Dashboard KPIs, Sources, Jobs, Catalog, and Iceberg snapshots.
- `GET /kafka/status`, `POST /kafka/publish`, and `POST /kafka/sink/flush` succeed and write objects to MinIO.
