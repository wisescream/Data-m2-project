# FinLake Control Plane — Guide et Exemples API REST

**Version** : 2.0  
**Phase** : Architecture Unifiée Java 21 / Spring Boot 3.3.5  
**Mise à jour** : 2026-11-20  
**Base URL** : `http://localhost:8000`  

---

## 1. Machine à États des Jobs d'Ingestion

```mermaid
stateDiagram-v2
    [*] --> PENDING : POST /storage/jobs (202 Accepted)
    PENDING --> RUNNING : Worker alloué & extraction démarrée
    RUNNING --> SUCCESS : Extraction + MinIO Staging + Promotion + Manifeste
    RUNNING --> FAILED : Erreur réseau / SQL / MinIO
    PENDING --> CANCELLED : POST /storage/jobs/{id}/cancel
    RUNNING --> CANCELLED : POST /storage/jobs/{id}/cancel
    FAILED --> PENDING : POST /storage/jobs/{id}/retry
    CANCELLED --> PENDING : POST /storage/jobs/{id}/retry
    SUCCESS --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

---

## 2. Endpoints du Module Data Sources (Wireframe-Compliant)

### 2.1 Liste des Sources Configruées (`GET /sources`)
Retourne l'ensemble des sources relationnelles avec leur statut opérationnel et les métadonnées de version.

```bash
# cURL
curl -X GET http://localhost:8000/sources

# PowerShell
Invoke-RestMethod -Uri "http://localhost:8000/sources" -Method Get | ConvertTo-Json -Depth 4
```

**Réponse (200 OK) :**
```json
[
  {
    "id": "erp-production",
    "name": "erp-production",
    "type": "SQL Server",
    "host": "sqlserver:1433",
    "port": 1433,
    "database": "finlake_source",
    "status": "connected",
    "status_hint": null,
    "last_tested": "2026-11-20T10:42:23.421",
    "server_version": "Microsoft SQL Server 2022"
  },
  {
    "id": "retail-pos-pg",
    "name": "retail-pos-pg",
    "type": "PostgreSQL",
    "host": "postgres-source:5432",
    "port": 5432,
    "database": "retail_banking",
    "status": "connected",
    "status_hint": null,
    "last_tested": "2026-11-20T12:42:58.602",
    "server_version": "PostgreSQL 16.15 on x86_64-pc-linux-musl"
  },
  {
    "id": "finance-dwh",
    "name": "finance-dwh",
    "type": "SQL Server",
    "host": "10.24.8.31:1433",
    "port": 1433,
    "database": "FinanceDW",
    "status": "failed",
    "status_hint": "Identifiants refusés par le serveur",
    "last_tested": "2026-11-19T12:42:23.421",
    "server_version": null
  }
]
```

---

### 2.2 Sonde de Connectivité en 4 Étapes (`POST /sources/probe`)
Valide la connectivité réseau, TLS, l'authentification et l'accès physique à la base de données sans rien enregistrer. Retourne les tables réelles découvertes comme preuve de connexion active.

#### Exemple A : Test Réussi (PostgreSQL)

```bash
# cURL
curl -X POST http://localhost:8000/sources/probe \
  -H "Content-Type: application/json" \
  -d '{
    "connection_name": "retail-pos-pg",
    "type": "postgresql",
    "host": "postgres-source",
    "port": 5432,
    "database": "retail_banking",
    "username": "finlake_user",
    "password": "FinLake2026!StrongPass#"
  }'
```

```powershell
# PowerShell
$body = @{
    connection_name = "retail-pos-pg"
    type = "postgresql"
    host = "postgres-source"
    port = 5432
    database = "retail_banking"
    username = "finlake_user"
    password = "FinLake2026!StrongPass#"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/sources/probe" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

**Réponse (200 OK — Succès) :**
```json
{
  "status": "success",
  "summary": "La plateforme a joint le serveur, s'est authentifiée et a ouvert retail_banking.",
  "server_version": "PostgreSQL 16.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine",
  "response_time_ms": 284,
  "tested_at": "2026-11-20T12:42:33.363865",
  "steps": [
    { "id": 1, "name": "Joindre le serveur", "detail": "postgres-source:5432", "status": "success" },
    { "id": 2, "name": "Sécuriser la connexion", "detail": "Chiffrée (TLS)", "status": "success" },
    { "id": 3, "name": "S'authentifier", "detail": "En tant que finlake_user", "status": "success" },
    { "id": 4, "name": "Ouvrir la base de données", "detail": "retail_banking (2 tables en ligne)", "status": "success" }
  ],
  "technical_details": null,
  "troubleshooting_checklist": [],
  "discovered_tables": [
    "retail_customers",
    "retail_transactions"
  ]
}
```

#### Exemple B : Échec d'Authentification (SQL Server)

```bash
curl -X POST http://localhost:8000/sources/probe \
  -H "Content-Type: application/json" \
  -d '{
    "connection_name": "erp-production",
    "type": "sqlserver",
    "host": "sqlserver",
    "port": 1433,
    "database": "finlake_source",
    "username": "sa",
    "password": "WrongPassword!"
  }'
```

**Réponse (200 OK — Échec diagnostiqué) :**
```json
{
  "status": "failed",
  "summary": "Échec de la connexion à l'authentification. Le serveur a été joint, mais il a refusé le nom d'utilisateur ou le mot de passe.",
  "server_version": null,
  "response_time_ms": 50,
  "tested_at": "2026-11-20T12:30:17.353",
  "steps": [
    { "id": 1, "name": "Joindre le serveur", "detail": "sqlserver:1433", "status": "success" },
    { "id": 2, "name": "Sécuriser la connexion", "detail": "Chiffrée (TLS)", "status": "success" },
    { "id": 3, "name": "S'authentifier", "detail": "Identifiants refusés pour sa", "status": "failed" },
    { "id": 4, "name": "Ouvrir la base de données", "detail": "Non exécutée, car l'authentification a échoué", "status": "skipped" }
  ],
  "technical_details": "Erreur 18456 · Login failed for user 'sa'. Échec après 0.1 s",
  "troubleshooting_checklist": [
    "Le nom d'utilisateur et le mot de passe sont saisis correctement.",
    "Le compte est actif et n'est pas verrouillé sur le serveur.",
    "Le serveur autorise l'authentification SQL Server, et pas seulement l'authentification Windows."
  ]
}
```

---

### 2.3 Enregistrement d'une Nouvelle Source (`POST /sources`)
Enregistre durablement une source relationnelle dans le registre de la plateforme.

```powershell
$body = @{
    connection_name = "retail-pos-pg"
    type = "postgresql"
    host = "postgres-source"
    port = 5432
    database = "retail_banking"
    username = "finlake_user"
    password = "FinLake2026!StrongPass#"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/sources" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json
```

**Réponse (201 Created) :**
```json
{
  "id": "retail-pos-pg",
  "name": "retail-pos-pg",
  "type": "PostgreSQL",
  "host": "postgres-source:5432",
  "port": 5432,
  "database": "retail_banking",
  "status": "connected",
  "status_hint": null,
  "last_tested": "2026-11-20T12:42:58.602",
  "server_version": "PostgreSQL 16.15 on x86_64-pc-linux-musl"
}
```

---

### 2.4 Liste Dynamique des Tables (`GET /sources/{id}/tables`)

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/sources/retail-pos-pg/tables" -Method Get | ConvertTo-Json
```

**Réponse (200 OK) :**
```json
{
  "source_id": "retail-pos-pg",
  "schema_name": "public",
  "tables": [
    "retail_customers",
    "retail_transactions"
  ]
}
```

---

### 2.5 Inspection du Schéma d'une Table (`GET /sources/{id}/tables/{table}/schema`)

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/sources/retail-pos-pg/tables/retail_customers/schema" -Method Get | ConvertTo-Json -Depth 4
```

**Réponse (200 OK) :**
```json
{
  "source_id": "retail-pos-pg",
  "schema_name": "public",
  "table_name": "retail_customers",
  "total_rows": 3,
  "column_count": 5,
  "primary_key": [
    "customer_id"
  ],
  "columns": [
    { "name": "customer_id", "type": "integer", "nullable": false, "is_primary_key": true, "is_identity": false },
    { "name": "customer_name", "type": "character varying", "nullable": false, "is_primary_key": false, "is_identity": false },
    { "name": "segment", "type": "character varying", "nullable": false, "is_primary_key": false, "is_identity": false },
    { "name": "country", "type": "character varying", "nullable": true, "is_primary_key": false, "is_identity": false },
    { "name": "created_at", "type": "timestamp without time zone", "nullable": true, "is_primary_key": false, "is_identity": false }
  ]
}
```

---

## 3. Endpoints des Jobs d'Ingestion Parquet

### 3.1 Soumission d'un Job d'Ingestion (`POST /storage/jobs`)

```powershell
$jobReq = @{
    source_id = "erp-production"
    schema_name = "dbo"
    table = "transactions"
    format = "parquet"
    compression = "snappy"
    batch_size = 50000
    max_rows = 100000
    partition_by = @("event_date")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/storage/jobs" -Method Post -Body $jobReq -ContentType "application/json" | ConvertTo-Json
```

**Réponse (202 Accepted) :**
```json
{
  "job_id": "job_d98f7e2a-1b4c-4e89-a9a3-5b8d7c2a1e0f",
  "status": "PENDING",
  "source_id": "erp-production",
  "table": "transactions",
  "format": "parquet",
  "compression": "snappy",
  "batch_size": 50000,
  "max_rows": 100000,
  "created_at": "2026-11-20T12:00:00Z"
}
```

### 3.2 Suivi d'État d'un Job (`GET /storage/jobs/{id}`)

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/storage/jobs/job_d98f7e2a-1b4c-4e89-a9a3-5b8d7c2a1e0f" -Method Get | ConvertTo-Json
```

---

## 4. Endpoints Analytiques & Copilot IA

### 4.1 Exécution de Requête Trino (`POST /api/analytics/query`)

```powershell
$queryReq = @{
    sql = "SELECT type, COUNT(*) AS count_tx, ROUND(AVG(amount), 2) AS avg_amt FROM hive.finlake_curated.transactions GROUP BY type ORDER BY count_tx DESC"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/analytics/query" -Method Post -Body $queryReq -ContentType "application/json" | ConvertTo-Json -Depth 4
```

### 4.2 Copilot IA Text-to-SQL (`POST /api/copilot/sql`)

```powershell
$copilotReq = @{
    prompt = "Montre-moi les 5 types de transactions les plus fréquents et leur montant moyen"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/copilot/sql" -Method Post -Body $copilotReq -ContentType "application/json" | ConvertTo-Json
```
