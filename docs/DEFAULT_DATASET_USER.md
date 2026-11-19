# FinLake Enterprise — Default Dataset Ownership & User Documentation

This document describes the identity, security posture, and access permissions for the user account dedicated to the default FinLake financial dataset (`finlake_curated` and `finlake_iceberg`).

---

## 1. Tenant & Dataset Overview

The default out-of-the-box dataset represents **Acme Payments Global**, an international payment service provider processing synthetic mobile money, customer KYC profiles, and B2B billing records.

| Attribute | Value |
| :--- | :--- |
| **Enterprise Tenant ID** | `acme_corp` |
| **Tenant Organization Name** | `Acme Payments Global` |
| **Storage Layer** | MinIO Object Storage (`s3a://finlake/curated/` & `s3a://finlake/iceberg/`) |
| **Hive Schema** | `hive.finlake_curated` |
| **Iceberg Schema** | `iceberg.finlake_iceberg` |
| **Underlying Tables** | `customer` (100 rows), `invoice` (500 rows), `payment` (1,200 rows), `transactions` (6,362,620 PaySim records), `transactions_audit` (Iceberg ACID ledger) |

---

## 2. Dedicated Enterprise User Profiles

FinLake enforces strict Role-Based Access Control (RBAC) and tenant scoping. Three dedicated accounts are provisioned for Acme Payments Global:

### A. Primary Data Explorer (Analyst Persona)
* **Username**: `sarah.analyst`
* **Default Password**: `FinLake2026!`
* **Role**: `ANALYST`
* **Tenant**: `Acme Payments Global` (`acme_corp`)
* **Access Level**:
  * **Trino Analytics Explorer**: Full interactive query execution and visualization across `hive.finlake_curated.*`.
  * **AI Copilot**: Enabled. Translates natural language prompts to Trino ANSI SQL.
  * **Dynamic Column-Level PII Masking**: **ENFORCED**.
    * Customer emails are automatically masked: `s***@finlake-example.com`.
    * Customer phone numbers are masked: `+1-***-****`.
    * Customer first names are masked: `S***`.
  * **Catalog Access**: Read-only business glossary and column descriptions.
  * **Audit Logging**: Every executed query is immutably recorded in the security audit ledger.

### B. Compliance & Audit Persona (Forensic Inspection)
* **Username**: `david.auditor`
* **Default Password**: `FinLake2026!`
* **Role**: `AUDITOR`
* **Tenant**: `Acme Payments Global` (`acme_corp`)
* **Access Level**:
  * **Raw PII Access**: **UNMASKED**. Granted explicit authority to inspect raw customer credentials, emails, and phone numbers for regulatory AML/KYC fraud investigations.
  * **Iceberg Time-Travel**: Access to historical table snapshots and rollback audit logs.
  * **Immutable Audit Trail**: All unmasking events are logged with timestamp, user IP, and query hash.

### C. Tenant Administrator
* **Username**: `admin`
* **Default Password**: `FinLake2026!`
* **Role**: `ADMIN`
* **Tenant**: `Acme Payments Global` (`acme_corp`)
* **Access Level**: Full administrative control across ingestion job triggering, catalog management, security policy overrides, and metadata sync.

---

## 3. How to Sign In via Web UI

1. Navigate to `http://localhost:3000/login`.
2. Under **Quick Demo Logins**, click **Sarah Analyst** (or enter `sarah.analyst` / `FinLake2026!`).
3. Click **Sign in to Platform**.
4. You will be redirected to the **Overview Dashboard** (`http://localhost:3000/`).
5. Open **Trino Analytics** (`/analytics`) and run:
   ```sql
   SELECT customer_id, first_name, email, phone_number, credit_limit, risk_score 
   FROM hive.finlake_curated.customer 
   LIMIT 10;
   ```
6. Observe that all sensitive PII columns are automatically obfuscated for `sarah.analyst`.

---

## 4. API Authentication (REST)

To authenticate programmatically via the FinLake Spring Boot Control Plane:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "sarah.analyst",
    "password": "FinLake2026!"
  }'
```

### Sample Response:
```json
{
  "username": "sarah.analyst",
  "fullName": "Sarah Analyst",
  "role": "ANALYST",
  "tenantId": "acme_corp",
  "tenantName": "Acme Payments Global",
  "token": "finlake_jwt_acme_corp_sarah.analyst_...",
  "expiresAt": "2026-11-20T21:00:00Z"
}
```

Include the returned `tenantId` in security audit requests or analytical execution contexts to guarantee workspace isolation.
