-- =============================================================================
-- FinLake Phase P7 — Apache Iceberg Modern Table Format DDL & Queries
-- =============================================================================

-- 1. Create Schema for Iceberg in MinIO
CREATE SCHEMA IF NOT EXISTS iceberg.finlake_iceberg
WITH (location = 's3a://finlake/iceberg/');

-- 2. Create Partitioned Iceberg Table
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

-- 3. Populate Iceberg table from Hive Curated Table (Sample or Partition)
-- INSERT INTO iceberg.finlake_iceberg.transactions
-- SELECT * FROM hive.finlake_curated.transactions
-- WHERE event_date = '2023-01-01' LIMIT 50000;

-- 4. ACID Mutation Example (Atomic Update)
-- UPDATE iceberg.finlake_iceberg.transactions
-- SET is_flagged_fraud = 1
-- WHERE is_fraud = 1 AND amount > 200000;

-- 5. Time-Travel and Metadata Inspection Queries
-- A. View Snapshots History
-- SELECT snapshot_id, parent_id, operation, committed_at
-- FROM iceberg.finlake_iceberg."transactions$snapshots"
-- ORDER BY committed_at DESC;

-- B. View Table History
-- SELECT made_current_at, snapshot_id, parent_id, is_current_ancestor
-- FROM iceberg.finlake_iceberg."transactions$history";

-- C. Time-Travel Query by Snapshot ID
-- SELECT COUNT(*) FROM iceberg.finlake_iceberg.transactions FOR VERSION AS OF <snapshot_id>;
