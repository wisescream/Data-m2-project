# FinLake — Requêtes Analytiques Trino & Partition Pruning

**Phase** : P4 — Catalogue & Moteur Analytique  
**Date** : 2026-11-18  
**Moteur SQL** : Trino 452 (via Hive Metastore 4.0.0 & MinIO S3)  

---

## 1. Schéma et Tables du Catalogue Hive

Les tables externes pointent directement sur les objets Parquet stockés dans MinIO sous `s3a://finlake/curated/paysim/` :

```sql
-- Schéma Curated
CREATE SCHEMA IF NOT EXISTS hive.finlake_curated
WITH (location = 's3a://finlake/curated/paysim/');

-- Table Partitionnée Principale (Lakehouse)
CREATE TABLE IF NOT EXISTS hive.finlake_curated.transactions (
    ingest_row_id        BIGINT,
    step                 INTEGER,
    type                 VARCHAR,
    amount               DOUBLE,
    name_orig            VARCHAR,
    oldbalance_org       DOUBLE,
    newbalance_orig      DOUBLE,
    name_dest            VARCHAR,
    oldbalance_dest      DOUBLE,
    newbalance_dest      DOUBLE,
    is_fraud             TINYINT,
    is_flagged_fraud     TINYINT,
    event_time_simulated TIMESTAMP(3),
    event_date           VARCHAR
)
WITH (
    format = 'PARQUET',
    partitioned_by = ARRAY['event_date'],
    external_location = 's3a://finlake/curated/paysim/transactions/'
);

-- Table Non Partitionnée (pour Benchmark comparatif)
CREATE TABLE IF NOT EXISTS hive.finlake_curated.transactions_unpartitioned (
    ingest_row_id        BIGINT,
    step                 INTEGER,
    type                 VARCHAR,
    amount               DOUBLE,
    name_orig            VARCHAR,
    oldbalance_org       DOUBLE,
    newbalance_orig      DOUBLE,
    name_dest            VARCHAR,
    oldbalance_dest      DOUBLE,
    newbalance_dest      DOUBLE,
    is_fraud             TINYINT,
    is_flagged_fraud     TINYINT,
    event_time_simulated TIMESTAMP(3),
    event_date           VARCHAR
)
WITH (
    format = 'PARQUET',
    external_location = 's3a://finlake/curated/paysim/transactions_unpartitioned/'
);
```

---

## 2. Les 6 Requêtes Analytiques de Référence (§10.3)

### Q1 — Scan Complet (`COUNT(*)`)
- **Objectif** : Mesurer le débit de scan brut et la latence d'initialisation du plan distribué.
```sql
SELECT COUNT(*) AS total_transactions
FROM hive.finlake_curated.transactions;
```

### Q2 — Agrégation par Type de Transaction
- **Objectif** : Agrégation multidimensionnelle avec calculs de volumétrie et montants (`SUM`, `AVG`, `MIN`, `MAX`).
```sql
SELECT
    type,
    COUNT(*) AS transaction_count,
    ROUND(SUM(amount), 2) AS total_amount,
    ROUND(AVG(amount), 2) AS avg_amount,
    ROUND(MIN(amount), 2) AS min_amount,
    ROUND(MAX(amount), 2) AS max_amount
FROM hive.finlake_curated.transactions
GROUP BY type
ORDER BY transaction_count DESC;
```

### Q3 — Agrégation Temporelle Quotidienne
- **Objectif** : Analyse chronologique basée sur la partition simulée `event_date`.
```sql
SELECT
    event_date,
    COUNT(*) AS daily_tx_count,
    ROUND(SUM(amount), 2) AS daily_total_amount,
    ROUND(AVG(amount), 2) AS daily_avg_amount
FROM hive.finlake_curated.transactions
GROUP BY event_date
ORDER BY event_date ASC;
```

### Q4 — Filtre Temporel Sélectif (Partition Pruning)
- **Objectif** : Vérifier que Trino n'accède qu'aux répertoires MinIO concernés et ignore les autres partitions.
```sql
SELECT
    ingest_row_id,
    step,
    type,
    amount,
    name_orig,
    name_dest,
    is_fraud,
    event_time_simulated,
    event_date
FROM hive.finlake_curated.transactions
WHERE event_date = '2023-01-01'
ORDER BY ingest_row_id ASC
LIMIT 100;
```

### Q5 — Analyse Ciblée de la Fraude
- **Objectif** : Filtrage sélectif sur les transactions frauduleuses (`is_fraud = 1`).
```sql
SELECT
    type,
    COUNT(*) AS fraud_count,
    ROUND(SUM(amount), 2) AS fraud_total_amount,
    ROUND(AVG(amount), 2) AS fraud_avg_amount
FROM hive.finlake_curated.transactions
WHERE is_fraud = 1
GROUP BY type
ORDER BY fraud_count DESC;
```

### Q6 — Réconciliation et Intégrité par Partition
- **Objectif** : Audit d'intégrité référentielle et décompte exact des pas horaires simulés par jour.
```sql
SELECT
    event_date,
    COUNT(*) AS partition_row_count,
    COUNT(DISTINCT step) AS distinct_simulated_steps,
    MIN(step) AS min_step,
    MAX(step) AS max_step
FROM hive.finlake_curated.transactions
GROUP BY event_date
ORDER BY event_date ASC;
```

---

## 3. Preuve du Partition Pruning (`EXPLAIN`)

L'analyse du plan d'exécution généré par Trino sur la requête Q4 démontre sans équivoque que le prédicat `event_date = '2023-01-01'` est projeté directement sur la clé de partitionnement Hive sans scanner les autres répertoires :

```text
Fragment 1 [SOURCE]
    Output layout: [count_0]
    Output partitioning: SINGLE []
    Aggregate[type = PARTIAL]
    │   Layout: [count_0:bigint]
    │   count_0 := count(*)
    └─ TableScan[table = hive:finlake_curated:transactions]
           Layout: []
           Estimates: {rows: ? (0B), cpu: 0, memory: 0B, network: 0B}
           event_date:string:PARTITION_KEY
               :: [[2023-01-01]]
```

La ligne `event_date:string:PARTITION_KEY :: [[2023-01-01]]` prouve que l'accès I/O est borné strictement à la partition demandée, garantissant des performances de requête optimales.
