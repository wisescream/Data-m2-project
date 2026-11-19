-- ===========================================================================
-- FinLake — SQL Server Schema Definition (Phase P2)
-- Database : finlake_source
-- ===========================================================================

-- 1. Create Database if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'finlake_source')
BEGIN
    CREATE DATABASE finlake_source;
    PRINT '[OK] Database finlake_source created.';
END
GO

USE finlake_source;
GO

-- 2. Drop existing transactions table for idempotent creation
IF OBJECT_ID('dbo.transactions', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.transactions;
    PRINT '[INFO] Existing dbo.transactions dropped for clean setup.';
END
GO

-- 3. Operational Source Table: dbo.transactions
CREATE TABLE dbo.transactions (
    ingest_row_id       BIGINT IDENTITY(1,1) NOT NULL,
    step                INT NOT NULL,
    type                VARCHAR(20) NOT NULL,
    amount              DECIMAL(19,4) NOT NULL,
    nameOrig            VARCHAR(64) NOT NULL,
    oldbalanceOrg       DECIMAL(19,4) NOT NULL,
    newbalanceOrig      DECIMAL(19,4) NOT NULL,
    nameDest            VARCHAR(64) NOT NULL,
    oldbalanceDest      DECIMAL(19,4) NOT NULL,
    newbalanceDest      DECIMAL(19,4) NOT NULL,
    isFraud             BIT NOT NULL,
    isFlaggedFraud      BIT NOT NULL,
    CONSTRAINT PK_transactions PRIMARY KEY CLUSTERED (ingest_row_id)
);
PRINT '[OK] Table dbo.transactions created successfully.';
GO

-- Create supporting indexes for deterministic extraction and filtering
CREATE NONCLUSTERED INDEX IX_transactions_step ON dbo.transactions (step) INCLUDE (ingest_row_id);
CREATE NONCLUSTERED INDEX IX_transactions_type ON dbo.transactions (type);
PRINT '[OK] Indexes on dbo.transactions created.';
GO

-- ===========================================================================
-- 4. Durable Job Metadata (Architectural Decision B)
-- ===========================================================================

IF OBJECT_ID('dbo.job_runs', 'U') IS NOT NULL
    DROP TABLE dbo.job_runs;
GO

IF OBJECT_ID('dbo.ingestion_jobs', 'U') IS NOT NULL
    DROP TABLE dbo.ingestion_jobs;
GO

CREATE TABLE dbo.ingestion_jobs (
    job_id              VARCHAR(64) NOT NULL,
    source_id           VARCHAR(64) NOT NULL,
    schema_name         VARCHAR(64) NOT NULL,
    table_name          VARCHAR(64) NOT NULL,
    format              VARCHAR(16) NOT NULL,
    compression         VARCHAR(16) NOT NULL,
    batch_size          INT NOT NULL,
    partition_columns   VARCHAR(256) NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ingestion_jobs PRIMARY KEY CLUSTERED (job_id)
);
PRINT '[OK] Table dbo.ingestion_jobs created.';
GO

CREATE TABLE dbo.job_runs (
    run_id              VARCHAR(64) NOT NULL,
    job_id              VARCHAR(64) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_rows_extracted BIGINT DEFAULT 0,
    total_bytes_written  BIGINT DEFAULT 0,
    total_objects_created INT DEFAULT 0,
    manifest_path       VARCHAR(512) NULL,
    error_message       VARCHAR(MAX) NULL,
    started_at          DATETIME2 NULL,
    completed_at        DATETIME2 NULL,
    CONSTRAINT PK_job_runs PRIMARY KEY CLUSTERED (run_id),
    CONSTRAINT FK_job_runs_job FOREIGN KEY (job_id) REFERENCES dbo.ingestion_jobs(job_id) ON DELETE CASCADE
);
PRINT '[OK] Table dbo.job_runs created.';
GO
