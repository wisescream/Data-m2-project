# FinLake Enterprise — Multi-Tenant Data Mounting Architecture & Guide

This guide details how external enterprises (e.g. Tenant B / *Apex Retail Bank*, Tenant C / *Nordic Mobile Money*) can onboard to FinLake, mount their proprietary datasets, enforce strict data isolation, and provision tenant-scoped users with granular Role-Based Access Control (RBAC).

---

## 1. Architectural Overview

FinLake provides **Zero-Trust Multi-Tenancy** using a multi-layer isolation pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FinLake UI & Control Plane                            │
│           (Tenant Scoping, Role Enforcer, Dynamic PII Masking)              │
└───────────────────────┬───────────────────────────────┬─────────────────────┘
                        │                               │
        ┌───────────────▼──────────────┐ ┌──────────────▼──────────────┐
        │  Acme Payments Global        │ │  Apex Retail Bank EU        │
        │  Tenant: acme_corp           │ │  Tenant: apex_bank          │
        └───────────────┬──────────────┘ └──────────────┬──────────────┘
                        │                               │
┌───────────────────────▼───────────────────────────────▼─────────────────────┐
│                         Distributed Trino Engine                            │
│       hive.finlake_curated.*               hive.apex_curated.*              │
└───────────────────────┬───────────────────────────────┬─────────────────────┘
                        │                               │
┌───────────────────────▼───────────────────────────────▼─────────────────────┐
│                          Hive Metastore (HMS)                               │
│              Database: default                     Database: apex_bank      │
└───────────────────────┬───────────────────────────────┬─────────────────────┘
                        │                               │
┌───────────────────────▼───────────────────────────────▼─────────────────────┐
│                          MinIO S3 Object Storage                            │
│        s3a://finlake/curated/               s3a://finlake/tenants/apex/     │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Isolation Mechanism | Guarantee |
| :--- | :--- | :--- |
| **Identity & Access** | Tenant ID + JWT Session Claims | Users only see schemas & jobs assigned to their tenant. |
| **Query Engine** | Trino Schema Virtualization & RBAC | Cross-tenant queries are blocked at the planning layer. |
| **Catalog** | Hive Metastore distinct schemas/databases | Metadata, partitions, and statistics are scoped per tenant. |
| **Object Storage** | MinIO Bucket Prefix or Dedicated Buckets | Data files are physically segregated under distinct S3 paths. |

---

## 2. Five-Step Tenant Data Mounting Workflow

### Step 1: Register the Enterprise Tenant & Admin Identity

Register the new business tenant in `SecurityGovernanceService` (or via the Tenant Management API):

```json
{
  "tenant_id": "apex_bank",
  "tenant_name": "Apex Retail Bank EU",
  "assigned_catalog": "hive",
  "assigned_schema": "apex_curated",
  "storage_root": "s3a://finlake/tenants/apex_bank/"
}
```

Then create user identities for that tenant:
* **Analyst Persona**: `elena.analyst@apex.eu` (`role: ANALYST`, dynamic PII masking enabled).
* **Auditor Persona**: `marcus.auditor@apex.eu` (`role: AUDITOR`, unmasked access with audit logging).
* **Engineer Persona**: `lucas.engineer@apex.eu` (`role: DATA_ENGINEER`, pipeline configuration).

---

### Step 2: Mount the Enterprise Data Source

There are two primary ways an enterprise can bring data into FinLake:

#### Method A: Live JDBC Source Extraction (Transactional Databases)
If the enterprise has an operational SQL Server, PostgreSQL, MySQL, or Oracle database:
1. Register the enterprise JDBC source in FinLake:
   ```bash
   curl -X POST http://localhost:8000/sources \
     -H "Content-Type: application/json" \
     -d '{
       "connection_name": "apex-core-banking",
       "type": "sqlserver",
       "host": "apex-db.internal",
       "port": 1433,
       "database": "ApexCore",
       "auth_method": "sqlserver",
       "username": "finlake_reader",
       "password": "SecretPassword123!",
       "encrypt": true,
       "trust_server_certificate": true
     }'
   ```
   *(Ou pour PostgreSQL : `"type": "postgresql"`, `"port": 5432`, `"database": "apex_banking"`).*
2. Trigger bounded-memory batch ingestion to MinIO:
   ```bash
   curl -X POST http://localhost:8000/storage/jobs \
     -H "Content-Type: application/json" \
     -d '{
       "source_id": "apex_core_banking",
       "schema_name": "dbo",
       "table": "Accounts",
       "format": "parquet",
       "compression": "snappy",
       "batch_size": 50000,
       "partition_by": ["AccountType"]
     }'
   ```
   *The data will land directly in `s3a://finlake/tenants/apex_bank/raw/Accounts/`.*

#### Method B: Direct S3 / MinIO Prefix Mounting
If the enterprise already produces Parquet or ORC files:
1. Create a dedicated storage prefix in MinIO:
   ```bash
   mc mb local/finlake/tenants/apex_bank/curated/
   ```
2. Push existing Parquet files into the tenant folder:
   ```bash
   mc cp --recursive ./apex_data/ local/finlake/tenants/apex_bank/curated/
   ```

---

### Step 3: Register the Isolated Schema in Trino & Hive Metastore

Once data is in MinIO, create the tenant's isolated database and register the external tables in Trino:

```sql
-- 1. Create isolated schema mapped to the tenant's MinIO location
CREATE SCHEMA IF NOT EXISTS hive.apex_curated
WITH (location = 's3a://finlake/tenants/apex_bank/curated/');

-- 2. Register the tenant's tables
CREATE TABLE IF NOT EXISTS hive.apex_curated.accounts (
    account_id VARCHAR,
    customer_id VARCHAR,
    account_type VARCHAR,
    balance DOUBLE,
    currency VARCHAR,
    opened_date VARCHAR,
    is_frozen BOOLEAN
)
WITH (
    format = 'PARQUET',
    external_location = 's3a://finlake/tenants/apex_bank/curated/accounts/'
);
```

---

### Step 4: Configure Dynamic PII Masking & RBAC Rules

Configure column sensitivity tags in the FinLake Data Catalog for the new tenant's schema:

| Column | Sensitivity | Analyst Rule | Auditor Rule |
| :--- | :--- | :--- | :--- |
| `accounts.customer_id` | `PII_CONFIDENTIAL` | Partial Hash (`CUS-***-8821`) | Raw string |
| `accounts.balance` | `FINANCIAL_SENSITIVE`| Range Obfuscation / Floor | Exact amount |

FinLake's `SecurityGovernanceService` intercepts all analytical queries from `apex_bank` users and automatically enforces these rules.

---

### Step 5: Verify Query Isolation

When an analyst from **Apex Retail Bank** logs in (`elena.analyst`):
1. **Allowed**: Queries against `hive.apex_curated.*` execute instantaneously with PII masking applied.
2. **Blocked**: Queries attempting to select from `hive.finlake_curated.*` (Acme Payments' schema) are rejected with `403 Forbidden: Cross-tenant data access violation`.
3. **Audit Ledger**: The action is recorded in `SecurityGovernanceService` with tenant attribution:
   ```json
   {
     "tenant_id": "apex_bank",
     "user": "elena.analyst",
     "query": "SELECT * FROM hive.apex_curated.accounts",
     "status": "ALLOWED",
     "pii_masked": true
   }
   ```

---

## 3. Production Hardening: Dedicated MinIO Buckets & IAM Policies

For institutional multi-tenancy requiring strict compliance (e.g. SOC2, GDPR, PCI-DSS):
* Rather than folder prefixes, provision separate MinIO buckets per tenant: `s3a://tenant-acme/` and `s3a://tenant-apex/`.
* Attach MinIO IAM policies restricting Trino role credentials so that the Trino execution coordinator uses tenant-scoped STS credentials during split generation.
