-- ===========================================================================
-- FinLake — Trino / Hive Metastore DDL Definitions
-- External Parquet Tables on MinIO (S3)
-- ===========================================================================

-- 1. Create Curated Schema in Hive Metastore
CREATE SCHEMA IF NOT EXISTS hive.finlake_curated
WITH (
    location = 's3a://finlake/curated/paysim/'
);

-- 2. Partitioned Curated PaySim Transactions Table (Parquet)
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

-- 3. Unpartitioned Curated PaySim Transactions Table (for Benchmark comparison)
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

-- 4. Customer Parquet Table
CREATE TABLE IF NOT EXISTS hive.finlake_curated.customer (
    customer_id INT,
    first_name  VARCHAR,
    last_name   VARCHAR,
    email       VARCHAR,
    city        VARCHAR,
    created_at  VARCHAR
)
WITH (
    format = 'PARQUET',
    external_location = 's3a://finlake/curated/customer/'
);

-- 5. Invoice Parquet Table
CREATE TABLE IF NOT EXISTS hive.finlake_curated.invoice (
    invoice_id   INT,
    customer_id  INT,
    invoice_date VARCHAR,
    amount       DOUBLE,
    status       VARCHAR
)
WITH (
    format = 'PARQUET',
    external_location = 's3a://finlake/curated/invoice/'
);

-- 6. Payment Parquet Table
CREATE TABLE IF NOT EXISTS hive.finlake_curated.payment (
    payment_id     INT,
    invoice_id     INT,
    payment_date   VARCHAR,
    amount         DOUBLE,
    payment_method VARCHAR
)
WITH (
    format = 'PARQUET',
    external_location = 's3a://finlake/curated/payment/'
);
