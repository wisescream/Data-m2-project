-- ===========================================================================
-- FinLake — Reference Analytical Queries (§10.3)
-- Standard Analytical Workload on hive.finlake_curated.transactions
-- ===========================================================================

-- Q1: Full Table Scan
-- Objectif : Mesurer la vitesse de scan brut sur l'ensemble des colonnes/lignes.
-- Description : Compte total des lignes enregistrées dans la table Parquet.
SELECT
    COUNT(*) AS total_transactions
FROM hive.finlake_curated.transactions;

-- Q2: Group By Transaction Type
-- Objectif : Agrégation multidimensionnelle avec calculs de métriques financières.
-- Description : Répartition du volume et des montants cumulés et moyens par type de transaction.
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

-- Q3: Simulated Temporal Aggregation (Daily Trend)
-- Objectif : Analyse chronologique basée sur les partitions temporelles event_date.
-- Description : Décompte journalier des volumes et flux monétaires globaux.
SELECT
    event_date,
    COUNT(*) AS daily_tx_count,
    ROUND(SUM(amount), 2) AS daily_total_amount,
    ROUND(AVG(amount), 2) AS daily_avg_amount
FROM hive.finlake_curated.transactions
GROUP BY event_date
ORDER BY event_date ASC;

-- Q4: Temporal Filter with Partition Pruning
-- Objectif : Vérifier que le moteur Trino applique le partition pruning et élimine les répertoires hors filtre.
-- Description : Sélection ciblée sur une partition précise (event_date = '2023-01-01').
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

-- Q5: Fraud Target Analysis
-- Objectif : Filtre sélectif sur les transactions frauduleuses et ratios d'impact.
-- Description : Analyse des transferts et retraits frauduleux identifiés par type.
SELECT
    type,
    COUNT(*) AS fraud_count,
    ROUND(SUM(amount), 2) AS fraud_total_amount,
    ROUND(AVG(amount), 2) AS fraud_avg_amount
FROM hive.finlake_curated.transactions
WHERE is_fraud = 1
GROUP BY type
ORDER BY fraud_count DESC;

-- Q6: Partition Reconciliation and Lineage
-- Objectif : Vérification de complétude et d'intégrité référentielle par partition.
-- Description : Distribution exhaustive des lignes par partition event_date.
SELECT
    event_date,
    COUNT(*) AS partition_row_count,
    COUNT(DISTINCT step) AS distinct_simulated_steps,
    MIN(step) AS min_step,
    MAX(step) AS max_step
FROM hive.finlake_curated.transactions
GROUP BY event_date
ORDER BY event_date ASC;
