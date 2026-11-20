# FinLake — Architecture Technique et Topologie Docker

**Version** : 2.0  
**Phase** : Architecture Unifiée Multi-Sources & Plan de Contrôle Java 21  
**Mise à jour** : 2026-11-20  

---

## 1. Vue d'Ensemble des Composants

FinLake est une plateforme data lake locale conteneurisée bâtie sur une pile open-source robuste intégrant le plan de contrôle Spring Boot 3.3.5 / Java 21 et le frontend Next.js 15 :

```mermaid
flowchart TD
    subgraph Host["Environnement Hôte"]
        ENV[".env"]
        CLI["Maven & Java 21 LTS / PowerShell"]
    end

    subgraph Network["Docker Bridge Network : finlake-network"]
        subgraph Sources["Sources Relationnelles Opérationnelles"]
            SQLS[("finlake-sqlserver\nmcr.microsoft.com/mssql/server:2022-latest\nPort: 1433\nfinlake-sqlserver-data")]
            PG_SRC[("finlake-postgres-source\npostgres:16-alpine\nPort: 5434:5432\nfinlake-postgres-source-data")]
        end

        subgraph ControlPlane["Plan de Contrôle & Ingestion (Java 21)"]
            BACKEND["finlake-backend\nSpring Boot 3.3.5 (Java 21 JRE)\nPort: 8000\nREST API, 4-Step Probe, Native Worker"]
        end

        subgraph Storage["Stockage Objet S3"]
            MINIO["finlake-minio\nalpine/minio:RELEASE.2025-10-15T17-29-55Z\nPorts: 9000 (S3 API), 9001 (Console)\nfinlake-minio-data"]
            MINIO_INIT["finlake-minio-init\nBootstrap bucket 'finlake'"]
            MINIO_INIT -.-> MINIO
        end

        subgraph Catalog["Catalogue de Métadonnées"]
            PG[("finlake-metastore-db\npostgres:16.4-alpine\nPort hôte : 5433:5432\nfinlake-metastore-db-data")]
            HMS["finlake-hive-metastore\napache/hive:4.0.0\nPort: 9083 (Thrift)"]
            HMS -->|JDBC| PG
            HMS -->|S3A| MINIO
        end

        subgraph QueryEngine["Moteur de Requêtes SQL"]
            TRINO["finlake-trino\ntrinodb/trino:452\nPort: 8080 (Web UI & REST)"]
            TRINO -->|Thrift Metastore| HMS
            TRINO -->|S3 Vectorized Scan| MINIO
        end

        subgraph Presentation["Interface Utilisateur"]
            FRONTEND["finlake-frontend\nNext.js 15 Standalone (Node 20)\nPort: 3000\nTableau de bord, Data Sources, Analytics"]
        end
    end

    BACKEND -->|Keyset Pagination O(1)| SQLS
    BACKEND -->|JDBC Probe & Discovery| PG_SRC
    BACKEND -->|S3 SDK Staging ➔ Curated| MINIO
    BACKEND -->|JDBC Dynamic Querying| TRINO
    FRONTEND -->|REST / JSON| BACKEND
```

---

## 2. Rôles et Responsabilités des Services

| Conteneur | Image Figée | Rôle | Ports Exposés | Persistance |
|---|---|---|---|---|
| `finlake-sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | Source relationnelle PaySim (`dbo.transactions`) et persistance durable des états de jobs (`dbo.ingestion_jobs`) | 1433 | `finlake-sqlserver-data` |
| `finlake-postgres-source` | `postgres:16-alpine` | Source relationnelle secondaire multi-entreprises (`retail_banking`) avec schéma clients et transactions | 5434:5432 | `finlake-postgres-source-data` |
| `finlake-minio` | `alpine/minio:RELEASE.2025-10-15T17-29-55Z` | Stockage objet compatible S3 pour Parquet, CSV, staging et manifestes | 9000 (API), 9001 (Console) | `finlake-minio-data` |
| `finlake-minio-init` | `alpine/minio:RELEASE.2025-10-15T17-29-55Z` | Conteneur éphémère initialisant l'arborescence des préfixes S3 (`warehouse`, `raw`, `curated`, `staging`, `manifests`) | Aucun | Partagé avec MinIO |
| `finlake-metastore-db` | `postgres:16.4-alpine` | Base relationnelle PostgreSQL pour le schéma Hive Metastore | 5433 (hôte) -> 5432 (conteneur) | `finlake-metastore-db-data` |
| `finlake-hive-metastore` | `apache/hive:4.0.0` | Serveur Hive Metastore Thrift pour le catalogage des tables Parquet externes | 9083 | Stateless (stocké dans PostgreSQL) |
| `finlake-trino` | `trinodb/trino:452` | Moteur de requêtes SQL distribué interrogeant les fichiers MinIO via le catalogue Hive et Iceberg | 8080 | Stateless (catalogue monté en volume) |
| `finlake-backend` | `projet-data-finlake-backend` (Java 21) | Control Plane & Moteur d'Ingestion Natif (Spring Boot 3.3.5, REST API, Auth JWT, Groq AI Copilot) | 8000 | Stateless |
| `finlake-frontend` | `projet-data-finlake-frontend` (Node 20) | Interface utilisateur d'exploration analytique multi-entreprises (Next.js 15, Recharts, Tailwind CSS) | 3000 | Stateless |

---

## 3. Choix Techniques et Arbitrages

### Arbitrage 1 : Port PostgreSQL Metastore (`5433:5432`) et Source PostgreSQL (`5434:5432`)
- **Problème détecté** : Risque de conflit de ports sur la machine hôte si le port 5432 est utilisé par un service local.
- **Solution retenue** : Mappage sur l'hôte en `5433:5432` pour le Metastore DB et `5434:5432` pour la source relationnelle PostgreSQL. En interne sur le réseau `finlake-network`, chaque conteneur conserve son port 5432 par défaut sans aucun conflit.

### Arbitrage 2 : Image MinIO (`alpine/minio:RELEASE.2025-10-15T17-29-55Z`)
- **Problème détecté** : L'image `minio/minio` sur Docker Hub a été restreinte/rendue privée par MinIO Inc.
- **Solution retenue** : Utilisation de l'image publique officielle `alpine/minio` avec un tag de release strict et certifié amont (`RELEASE.2025-10-15T17-29-55Z`), garantissant 100% de reproductibilité sans login.

### Arbitrage 3 : Sonde Réseau et JDBC en 4 Étapes (Wireframe-Compliant)
- **Objectif** : Valider de manière transparente l'accès à n'importe quel SGBD avant enregistrement, avec diagnostic précis de chaque couche d'échec.
- **Architecture de la sonde** :
  1. *Couche Réseau* : Socket TCP non-bloquante avec timeout strict (identifie immédiatement un hôte injoignable ou un pare-feu).
  2. *Couche Chiffrement* : Négociation TLS/SSL (`encrypt=true` / `sslmode=prefer`).
  3. *Couche Sécurité/Auth* : Authentification par rôle/utilisateur (capture les erreurs `18456` SQL Server ou `28P01` PostgreSQL).
  4. *Couche Catalogue & Données* : Requête de test (`DB_NAME()` / `current_database()`) et découverte live des tables réelles (`discovered_tables`).

---

## 4. Organisation du Stockage MinIO (`s3://finlake/`)

```text
s3://finlake/
├── raw/
│   └── paysim/transactions/
│       └── ingest_date=YYYY-MM-DD/run_id=<uuid>/
├── curated/
│   └── paysim/transactions/
│       └── event_date=YYYY-MM-DD/*.parquet
├── staging/
│   └── <job_id>/
│       └── *.parquet (fichiers temporaires en cours d'écriture)
├── manifests/
│   └── paysim/transactions/
│       └── <run_id>.json (publié en dernier)
├── warehouse/
│   └── (répertoire de base Hive Metastore)
└── iceberg/
    └── finlake_iceberg/ (métadonnées et snapshots Apache Iceberg)
```

---

## 5. Moteur d'Ingestion Natif Java 21

Le Data Plane d'ingestion est implémenté directement dans le backend Spring Boot via le service `NativeIngestionService` :

### 5.1 Extraction Bounded-Memory par Keyset Pagination
- **Principe** : Utilisation d'un seek indexé `$O(1)$` sur la clé primaire ordonnée `ingest_row_id` :
  ```sql
  SELECT TOP (@batch_size) ...
  FROM dbo.transactions
  WHERE ingest_row_id > @last_row_id
  ORDER BY ingest_row_id ASC;
  ```
- **Sécurité mémoire** : Chaque batch est sérialisé en Parquet au fil de l'eau dans le répertoire temporaire `staging/` avant d'être transmis à MinIO, maintenant une empreinte mémoire constante quel que soit le volume total extrait.

### 5.2 Promotion Atomique en 3 Phases
1. **Phase 1 (Staging)** : Écriture des objets temporaires avec préfixe `staging/<job_id>/`.
2. **Phase 2 (Vérification)** : Vérification de la complétude du batch, comptage des lignes et calcul de checksum SHA-256.
3. **Phase 3 (Promotion & Manifeste)** : Copie atomique vers `curated/` et publication du manifeste JSON dans `manifests/`.
