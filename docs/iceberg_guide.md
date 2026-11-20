# FinLake — Guide Apache Iceberg & Dashboards Visuels (Phase P7)

## 1. Introduction & Objectifs de l'Extension

La Phase P7 introduit deux extensions majeures à l'architecture FinLake :
1. **L'adoption d'un Table Format Moderne (Apache Iceberg)** : Passage d'un modèle de table externe Hive classique à un format de table ouvert avec garanties ACID, snapshots immuables et requêtes de voyage dans le temps (*Time-Travel*).
2. **Le Centre d'Observabilité & Dashboards Visuels** : Interface utilisateur interactive et moderne (Next.js 15 Web Dashboard et Control Plane Spring Boot 3) permettant de piloter l'infrastructure, d'explorer les métriques de benchmarks, les analyses de fraudes PaySim et le ledger Iceberg.

---

## 2. Architecture Apache Iceberg sous Trino

FinLake utilise le connecteur natif Trino 452 avec le backend de catalogue **Hive Metastore** et le stockage d'objets **MinIO S3** :

```text
Trino Query Engine (Port 8080)
   ├── Catalog: hive    (Tables Parquet externes partitionnées)
   └── Catalog: iceberg (Tables Iceberg ACID modernes)
            │
            ├── Métadonnées : Hive Metastore 4.0.0 (PostgreSQL backend)
            └── Fichiers de Données & Métadonnées : MinIO S3 (s3a://finlake/iceberg/)
```

### Configuration du Catalogue (`config/trino/catalog/iceberg.properties`)
```properties
connector.name=iceberg
iceberg.catalog.type=hive_metastore
hive.metastore.uri=thrift://hive-metastore:9083
hive.s3.endpoint=http://minio:9000
hive.s3.aws-access-key=finlake_admin
hive.s3.aws-secret-key=finlake_secret_key_2026!
hive.s3.path-style-access=true
hive.s3.ssl.enabled=false
```

---

## 3. Déclaration DDL & Partitionnement

```sql
-- Création du schéma Iceberg
CREATE SCHEMA IF NOT EXISTS iceberg.finlake_iceberg
WITH (location = 's3a://finlake/iceberg/');

-- Création de la table partitionnée par date d'événement simulée
CREATE TABLE IF NOT EXISTS iceberg.finlake_iceberg.transactions (
    ingest_row_id BIGINT,
    step INTEGER,
    type VARCHAR,
    amount DOUBLE,
    name_orig VARCHAR,
    oldbalance_org DOUBLE,
    newbalance_orig DOUBLE,
    name_dest VARCHAR,
    oldbalance_dest DOUBLE,
    newbalance_dest DOUBLE,
    is_fraud INTEGER,
    is_flagged_fraud INTEGER,
    event_time_simulated TIMESTAMP(3),
    event_date VARCHAR
)
WITH (
    partitioning = ARRAY['event_date'],
    format = 'PARQUET'
);
```

---

## 4. Garanties ACID & Démonstration du Time-Travel

### 4.1 Mutation Atomique (UPDATE)
Contrairement aux tables Hive qui nécessitent une réécriture complète des répertoires ou des partitions, Iceberg supporte les mutations atomiques au niveau de la ligne :

```sql
UPDATE iceberg.finlake_iceberg.transactions
SET is_flagged_fraud = 1
WHERE is_fraud = 1 AND amount > 50000;
```

Cette opération génère un nouveau **snapshot immuable** d'opération `overwrite` sans altérer l'intégrité des requêtes concurrentes en lecture.

### 4.2 Inspection du Ledger des Snapshots
```sql
SELECT snapshot_id, parent_id, operation, committed_at
FROM iceberg.finlake_iceberg."transactions$snapshots"
ORDER BY committed_at ASC;
```

Résultats mesurés :
| Snapshot ID | Opération | Horodatage Commit | Rôle |
| :--- | :--- | :--- | :--- |
| `1344392696380574973` | `append` | 2026-11-18 20:07:45 UTC | Initialisation de la table |
| `917406062776233544` | `append` | 2026-11-18 20:07:50 UTC | Chargement initial (5 000 lignes) |
| `3348974129906029809` | `overwrite` | 2026-11-18 20:08:24 UTC | Mutation atomique de `is_flagged_fraud` |

### 4.3 Voyage dans le Temps (*Time-Travel*)
Il est possible d'interroger la table à l'état exact du premier snapshot pour auditer l'état avant la mise à jour :

```sql
-- État avant la mise à jour (Snapshot v917406062776233544)
SELECT COUNT(*) AS total_flagged
FROM iceberg.finlake_iceberg.transactions FOR VERSION AS OF 917406062776233544
WHERE is_flagged_fraud = 1;
-- Résultat : 0 transaction marquée

-- État courant (Head / Snapshot v3348974129906029809)
SELECT COUNT(*) AS total_flagged
FROM iceberg.finlake_iceberg.transactions
WHERE is_flagged_fraud = 1;
-- Résultat : 25 transactions marquées
```

---

## 5. Dashboards Visuels & Observabilité

FinLake intègre un tableau de bord moderne et interactif développé en Next.js 15 et propulsé par le backend Spring Boot 3.3.5 :
1. **Module Iceberg Ledger (`/iceberg`)** :
   - Accessible sur : `http://localhost:3000/iceberg`
   - Affiche en direct le tableau complet des snapshots immuables, l'opération (`append`, `overwrite`), le commit timestamp et la taille des fichiers.
   - Permet d'explorer interactivement le voyage dans le temps (*Time-Travel*).
2. **Endpoint REST du Control Plane** :
   - `GET http://localhost:8000/api/dashboard/iceberg`
   - Retourne la structure JSON complète des snapshots et métadonnées d'historique de la table.

### Fonctionnalités du Dashboard :
- **Barre de santé des services** : Diagnostic en temps réel de SQL Server, PostgreSQL, MinIO, Hive Metastore et Trino.
- **Cartes KPI Exécutives** : Lignes indexées (6.36M+ PaySim), économie de compression (-68.5% en Parquet Zstandard), accélération par élagage (-92.8% de latence sur requêtes partitionnées), et snapshots Iceberg actifs.
- **Visualisations Analytiques (Recharts)** :
  - Ratios comparatifs de compression (CSV vs Parquet Zstd/Snappy/None).
  - Élagage de partition Trino (Q1 vs Q4).
  - Répartition des flux de capitaux par type de transaction (`CASH_IN`, `CASH_OUT`, `PAYMENT`, `TRANSFER`, `DEBIT`).
- **Analyse Fraude PaySim** : Confinement à 100% des fraudes dans `TRANSFER` et `CASH_OUT`.
- **Ledger Iceberg interactif** : Suivi des snapshots et inspection historique.
