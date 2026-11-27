# FinLake — Contrats API REST Détaillés

**Version** : 2.1  
**Base URL (Local)** : `http://localhost:8000`  
**Backend** : Java 21 · Spring Boot 3.3.5 (`finlake-backend`)  
**Format** : JSON (`application/json`)  

---

## 1. Conventions Générales & En-têtes Multi-Tenant

### En-têtes de contexte de sécurité
Plusieurs endpoints utilisent les en-têtes HTTP suivants pour appliquer l'isolation multi-entreprises, le masquage dynamique PII et la journalisation d'audit :

| En-tête | Valeur par défaut | Description |
| :--- | :--- | :--- |
| `X-Tenant-Id` | `tenant_acme` | Identifiant de l'entreprise (`tenant_acme`, `tenant_apex`, `tenant_nordic`). |
| `X-User-Id` | `user_alex_admin` | Identifiant unique de l'utilisateur (utilisé pour vérifier les politiques d'anonymisation). |
| `X-User-Role` | `ADMIN` | Rôle RBAC : `ADMIN`, `DATA_OWNER`, `DATA_ENGINEER`, `AUDITOR`, `ANALYST`. |
| `X-User-Name` | `Alex Chen` | Nom complet enregistré dans l'Audit Ledger. |

### Codes de statut HTTP standard
* `200 OK` : Requête traitée avec succès.
* `201 Created` : Nouvelle ressource enregistrée (ex. source de données).
* `202 Accepted` : Job d'extraction asynchrone accepté et mis en file d'attente.
* `400 Bad Request` : Validation DTO échouée ou identifiant SQL/paramètre invalide.
* `401 Unauthorized` : Identifiants invalides lors de la connexion.
* `403 Forbidden` : Action réservée à `DATA_OWNER` ou `ADMIN` (ex. modification des politiques d'anonymisation).
* `404 Not Found` : Ressource (`jobId`, `tableId`) introuvable.

---

## 2. Santé du Système (`HealthController`)

### `GET /health`
Vérifie la connectivité réelle avec SQL Server (`SELECT 1`), MinIO (`bucketExists`) et Trino (`/v1/info`).

**Réponse `200 OK`** :
```json
{
  "status": "healthy",
  "services": {
    "sqlserver": "up",
    "minio": "up",
    "trino": "up"
  },
  "timestamp": "2026-11-27T07:00:00.123456Z"
}
```
*Note : `status` vaut `"degraded"` si au moins un service est `"down"`.*

---

## 3. Authentification (`AuthController`)

### `POST /api/auth/login`
Authentifie un utilisateur et retourne son contexte entreprise, son rôle RBAC et ses droits PII actuels.

**Requête** (`LoginRequestDTO`) :
```json
{
  "username": "marcus.owner",
  "password": "FinLake2026!"
}
```

**Réponse `200 OK`** (`LoginResponseDTO`) :
```json
{
  "token": "finlake_jwt_9a3b2c1d-...",
  "user": {
    "id": "user_marcus_owner",
    "username": "marcus.owner",
    "full_name": "Marcus Vance",
    "email": "marcus.v@apexbank.eu",
    "role": "DATA_OWNER",
    "tenant_id": "tenant_apex",
    "tenant_name": "Apex Retail Bank EU",
    "assigned_catalog": "hive",
    "assigned_schema": "finlake_curated",
    "can_view_pii": true
  }
}
```

**Réponse `401 Unauthorized`** :
```json
{
  "error": "Invalid username or password. Use FinLake2026! with demo accounts."
}
```

---

## 4. Sources de Données Polyglottes & Sonde 4 Étapes (`SourceController`)

### `GET /sources`
Liste les sources configurées, filtrées par entreprise.
* **Query Param** : `tenant_id` (optionnel, ex. `tenant_acme`, `tenant_apex`, `tenant_nordic`, ou `ALL`).

**Réponse `200 OK`** (`List<DataSourceItemDTO>`) :
```json
[
  {
    "id": "mongo-customer-profiles",
    "name": "mongo-customer-profiles",
    "type": "MongoDB",
    "host": "mongodb:27017",
    "port": 27017,
    "database": "customer_profiles",
    "status": "connected",
    "status_hint": null,
    "last_tested": "2026-11-27T02:40:39.245",
    "server_version": "MongoDB 7.0 Community Edition"
  }
]
```

### `POST /sources/probe`
Exécute une **sonde réelle en 4 étapes** (Socket TCP, négociation TLS/SSL, Authentification, Découverte des tables/collections/topics/realms) sans enregistrer la source.

**Requête** (`SourceProbeRequestDTO`) :
```json
{
  "connection_name": "erp-production",
  "type": "sqlserver",
  "host": "sqlserver",
  "port": 1433,
  "database": "finlake_source",
  "auth_method": "sqlserver",
  "username": "sa",
  "password": "FinLake2026!StrongPass#",
  "encrypt": true,
  "trust_server_certificate": true,
  "connection_timeout": 30
}
```
*Valeurs supportées pour `type`* : `sqlserver`, `postgresql`, `kafka`, `mongodb`, `redis`, `kerberos`, `minio`, `cassandra`, `influxdb`.

**Réponse `200 OK`** (`SourceProbeResponseDTO`) — Succès ou Échec diagnostiqué :
```json
{
  "status": "success",
  "summary": "La plateforme a joint le serveur, s'est authentifiée et a ouvert finlake_source.",
  "server_version": "Microsoft SQL Server 2022 (RTM-CU28)",
  "response_time_ms": 39,
  "tested_at": "2026-11-27T02:36:31.120",
  "steps": [
    { "id": 1, "name": "Joindre le serveur", "detail": "sqlserver:1433", "status": "success" },
    { "id": 2, "name": "Sécuriser la connexion", "detail": "Chiffrée (TLS · Certificat approuvé)", "status": "success" },
    { "id": 3, "name": "S'authentifier", "detail": "En tant que sa", "status": "success" },
    { "id": 4, "name": "Ouvrir la base de données", "detail": "finlake_source (6 tables en ligne)", "status": "success" }
  ],
  "technical_details": null,
  "troubleshooting_checklist": [],
  "discovered_tables": ["Customer", "Invoice", "Payment", "ingestion_jobs", "job_runs", "tenant_data_sources"]
}
```

### `POST /sources`
Enregistre une nouvelle source de données pour une entreprise après exécution de la sonde.
* **Query Param** : `tenant_id` (défaut `tenant_acme`).
* **Requête** : `SourceProbeRequestDTO` (identique à `/sources/probe`).
* **Réponse `201 Created`** : `DataSourceItemDTO`.

### `POST /sources/{sourceId}/test`
Relance la sonde sur une source existante et met à jour son statut.
* **Réponse `200 OK`** (`SourceTestResponseDTO`) :
```json
{
  "source_id": "mongo-customer-profiles",
  "status": "connected",
  "server_version": "MongoDB 7.0 Community Edition",
  "database": "customer_profiles",
  "error": null
}
```

### `GET /sources/{sourceId}/tables`
Liste les tables, collections, topics Kafka, keyspaces Redis ou principals Kerberos découverts.
* **Query Param** : `schema` (défaut `dbo`).
* **Réponse `200 OK`** (`TableListResponseDTO`) :
```json
{
  "source_id": "mongo-customer-profiles",
  "schema": "customer_profiles",
  "tables": ["customer_profiles", "merchant_metadata", "audit_logs"]
}
```

### `GET /sources/{sourceId}/tables/{table}/schema`
Inspecte les colonnes/attributs, types et clés primaires.
* **Query Param** : `schema` (défaut `dbo`).
* **Réponse `200 OK`** (`TableSchemaResponseDTO`) :
```json
{
  "source_id": "mongo-customer-profiles",
  "schema": "customer_profiles",
  "table": "customer_profiles",
  "estimated_row_count": 245000,
  "column_count": 7,
  "primary_keys": ["_id"],
  "columns": [
    { "column_name": "_id", "data_type": "ObjectId", "is_nullable": false, "is_primary_key": true, "is_identity": false },
    { "column_name": "email", "data_type": "STRING (PII)", "is_nullable": false, "is_primary_key": false, "is_identity": false }
  ]
}
```

### `GET /sources/{sourceId}/tables/{table}/preview`
Retourne un aperçu en direct des enregistrements pour n'importe quel moteur, **avec application du masquage dynamique PII** selon les en-têtes `X-User-Id` et `X-User-Role`.
* **Query Param** : `schema` (défaut `dbo`).
* **Headers** : `X-User-Id`, `X-User-Role`.
* **Réponse `200 OK`** (`QueryResultDTO`).

---

## 5. Orchestration des Jobs d'Ingestion (`JobController`)

### `POST /storage/jobs`
Soumet un job d'extraction asynchrone (SQL Server, PostgreSQL, MongoDB, Redis, Kafka, Cassandra, InfluxDB, MinIO) vers MinIO S3.

**Requête** (`JobCreateRequestDTO`) :
```json
{
  "source_id": "mongo-customer-profiles",
  "schema_name": "customer_profiles",
  "table": "customer_profiles",
  "format": "parquet",
  "compression": "snappy",
  "batch_size": 50000,
  "partition_by": ["event_date"],
  "max_rows": 100000
}
```

**Réponse `202 Accepted`** (`JobCreateResponseDTO`) :
```json
{
  "job_id": "job_38626126",
  "status": "ACCEPTED",
  "message": "Ingestion job 'job_38626126' queued for background processing.",
  "created_at": "2026-11-27T02:18:05Z"
}
```

### `GET /storage/jobs`
Liste les jobs d'ingestion de l'entreprise.
* **Query Params** : `limit` (défaut `50`), `offset` (défaut `0`), `tenant_id` (optionnel).
* **Réponse `200 OK`** : `List<JobStatusResponseDTO>`.

### `GET /storage/jobs/{jobId}`
Retourne l'état courant du job (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `CANCELLED`).
* **Réponse `200 OK`** (`JobStatusResponseDTO`) ou `404 Not Found`.

### `GET /storage/jobs/{jobId}/result`
Retourne les détails d'exécution et le manifeste JSON stocké dans MinIO (comptes de lignes, taille en octets, chemins S3, SHA-256).
* **Réponse `200 OK`** (`JobResultResponseDTO`) ou `404 Not Found`.

### `POST /storage/jobs/{jobId}/cancel`
Annule un job en cours ou en attente.
* **Réponse `200 OK`** : `{"job_id": "...", "status": "CANCELLED", "message": "..."}` ou `404 Not Found`.

---

## 6. Hub Kafka & Puits MinIO S3 (`KafkaController`)

### `GET /kafka/status`
Retourne l'état du broker Kafka KRaft et les métriques du MinIO S3 Sink.

**Réponse `200 OK`** (`KafkaSinkStatusDTO`) :
```json
{
  "status": "ACTIVE",
  "bootstrap_servers": "kafka:9092",
  "active_topics": ["finlake.transactions.events", "finlake.polyglot.events"],
  "total_messages_received": 10371,
  "total_batches_sunk": 43,
  "total_bytes_written_to_minio": 3854415,
  "last_sink_timestamp": "2026-11-27T02:00:00",
  "target_s3_prefix": "s3://finlake/curated/kafka_sink/",
  "topic_metrics": {
    "finlake.transactions.events": 8920,
    "finlake.polyglot.events": 1451
  }
}
```

### `POST /kafka/publish`
Publie un événement polyglotte sur un topic Kafka et l'ajoute au tampon du S3 Sink.

**Requête** (`KafkaPublishRequestDTO`) :
```json
{
  "topic": "finlake.polyglot.events",
  "key": "cust_104",
  "payload": "{\"customer_id\":104,\"name\":\"Emma Watson\",\"balance\":12500.50}",
  "source_database_type": "MONGODB",
  "entity_name": "customer_profile"
}
```

**Réponse `200 OK`** :
```json
{
  "status": "PUBLISHED",
  "topic": "finlake.polyglot.events",
  "key": "cust_104",
  "event_id": "052222d4-ff2d-46fe-a04f-62bbbc0a25f8",
  "buffered_count": 1,
  "sink_target": "s3://finlake/curated/kafka_sink/finlake.polyglot.events/"
}
```

### `POST /kafka/sink/flush`
Force l'écriture immédiate du tampon Kafka vers MinIO S3.
* **Query Param** : `topic` (défaut `finlake.polyglot.events`).
* **Réponse `200 OK`** :
```json
{
  "status": "SUCCESS",
  "topic": "finlake.polyglot.events",
  "records_sunk": 1,
  "bytes_written": 215,
  "s3_uri": "s3://finlake/curated/kafka_sink/finlake_polyglot_events/ingest_date=2026-11-27/sink_batch_....json",
  "timestamp": "2026-11-27T02:00:05.123"
}
```

---

## 7. Analytics Trino, Requêtage Fédéré & Copilot IA (`AnalyticsController`)

### `POST /api/analytics/query`
Exécute une requête SQL sur Trino (`hive`, `iceberg`), sur une source polyglotte (`postgresql`, `mongodb`, `redis`, `kafka`, `cassandra`, `influxdb`, `minio`), ou une jointure fédérée multi-bases (`federated`), en appliquant le masquage dynamique PII et l'enregistrement dans l'Audit Ledger.
* **Headers** : `X-Tenant-Id`, `X-User-Role`, `X-User-Id`, `X-User-Name`.

**Requête** (`QueryRequestDTO`) :
```json
{
  "query": "SELECT * FROM postgresql.public.retail_customers p JOIN mongodb.customer_profiles.customer_profiles m ON p.customer_id = m.customer_id",
  "catalog": "federated",
  "schema": "public",
  "max_rows": 100
}
```

**Réponse `200 OK`** (`QueryResultDTO`) :
```json
{
  "columns": ["postgresql_customer_id", "postgresql_email", "mongodb_first_name", "mongodb_iban"],
  "rows": [
    {
      "postgresql_customer_id": 2041,
      "postgresql_email": "l***@apexbank.eu",
      "mongodb_first_name": "L***",
      "mongodb_iban": "DE89****"
    }
  ],
  "row_count": 3,
  "execution_time_ms": 24,
  "error": null
}
```

### `POST /api/analytics/ai/generate`
Traduit une question en langage naturel (mono-base ou multi-bases) en requête SQL ANSI / Fédérée avec recommandation graphique.

**Requête** (`TextToSqlRequestDTO`) :
```json
{
  "prompt": "Cross-DB join PostgreSQL retail customers with MongoDB KYC profiles"
}
```

**Réponse `200 OK`** (`TextToSqlResponseDTO`) :
```json
{
  "sql": "SELECT * FROM postgresql.public.retail_customers p JOIN mongodb.customer_profiles.customer_profiles m ON p.customer_id = m.customer_id",
  "explanation": "Federated Cross-DB JOIN correlating PostgreSQL retail customers with MongoDB KYC document profiles.",
  "catalog": "federated",
  "schema": "public",
  "suggested_chart": "table",
  "suggested_x": null,
  "suggested_y": null
}
```

---

## 8. Catalogue de Données (`DataCatalogController`)

### `GET /api/catalog/tables`
* **Query Param** : `tenant_id` (filtre les tables par entreprise).
* **Réponse `200 OK`** : `List<CatalogTableSummaryDTO>`.

### `GET /api/catalog/tables/{tableId}`
* **Réponse `200 OK`** (`CatalogTableDetailDTO` avec dictionnaire des colonnes, lignage amont/aval et requêtes exemples) ou `404 Not Found`.

### `GET /api/catalog/search`
* **Query Params** : `q` (mot-clé), `tenant_id`.
* **Réponse `200 OK`** : `List<CatalogTableSummaryDTO>`.

---

## 9. Gouvernance, RBAC & Anonymisation (`SecurityGovernanceController`)

### `GET /api/security/tenants`
Retourne la liste des entreprises (`tenant_acme`, `tenant_apex`, `tenant_nordic`).

### `GET /api/security/personas`
Retourne la liste des personas avec leur état `can_view_pii` en direct.

### `GET /api/security/policies`
* **Query Param** : `tenant_id` (ou `ALL`).
* **Réponse `200 OK`** :
```json
{
  "policies": [
    {
      "user_id": "user_david_auditor",
      "username": "david.auditor",
      "full_name": "David Miller",
      "role": "AUDITOR",
      "tenant_id": "tenant_acme",
      "anonymized": false
    }
  ]
}
```

### `POST /api/security/policies`
Modifie en temps réel l'anonymisation d'un utilisateur. **Strictement réservé à `DATA_OWNER` ou `ADMIN`**.
* **Header** : `X-User-Role` (`DATA_OWNER` ou `ADMIN`).

**Requête** :
```json
{
  "target_user_id": "user_david_auditor",
  "anonymize": true
}
```

**Réponse `200 OK`** :
```json
{
  "status": "UPDATED",
  "user_id": "user_david_auditor",
  "username": "david.auditor",
  "anonymized": true
}
```
**Réponse `403 Forbidden`** (si rôle non autorisé) :
```json
{
  "error": "Access denied: Only DATA_OWNER or ADMIN can modify anonymization policies."
}
```

### `GET /api/security/audit-logs`
* **Query Param** : `tenant` (défaut `ALL`).
* **Réponse `200 OK`** : `List<AuditLogDTO>`.

---

## 10. Dashboard & Iceberg Time-Travel (`DashboardController`)

### `GET /api/dashboard/stats`
* **Query Param** : `tenant_id`.
* **Réponse `200 OK`** (`DashboardStatsDTO`) : KPIs et services actifs spécifiques à l'entreprise.

### `GET /api/dashboard/iceberg`
* **Query Param** : `tenant_id`.
* **Réponse `200 OK`** (`IcebergDashboardDTO`) : table Iceberg, nombre de lignes et snapshots distincts par entreprise.

### `GET /api/dashboard/iceberg/time-travel`
* **Query Params** : `tenant_id`, `snapshot_id`.
* **Réponse `200 OK`** (`QueryResultDTO`) : `historical_rows` et `historical_volume` à la date du snapshot.
