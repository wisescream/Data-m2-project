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

-- Compatibility view: dbo.raw_transactions -> dbo.transactions
IF OBJECT_ID('dbo.raw_transactions', 'V') IS NOT NULL DROP VIEW dbo.raw_transactions;
GO
CREATE VIEW dbo.raw_transactions AS SELECT * FROM dbo.transactions;
GO
PRINT '[OK] Compatibility view dbo.raw_transactions created.';
GO

-- ===========================================================================
-- 3b. Relational Customer, Invoice, Payment Tables
-- ===========================================================================

IF OBJECT_ID('dbo.Payment', 'U') IS NOT NULL DROP TABLE dbo.Payment;
IF OBJECT_ID('dbo.Invoice', 'U') IS NOT NULL DROP TABLE dbo.Invoice;
IF OBJECT_ID('dbo.Customer', 'U') IS NOT NULL DROP TABLE dbo.Customer;
GO

CREATE TABLE dbo.Customer (
    customer_id     INT IDENTITY(1,1) NOT NULL,
    first_name      VARCHAR(50) NOT NULL,
    last_name       VARCHAR(50) NOT NULL,
    email           VARCHAR(100) NOT NULL,
    city            VARCHAR(50) NOT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Customer PRIMARY KEY CLUSTERED (customer_id),
    CONSTRAINT UQ_Customer_email UNIQUE (email)
);
CREATE NONCLUSTERED INDEX IX_Customer_city ON dbo.Customer (city);
CREATE NONCLUSTERED INDEX IX_Customer_created_at ON dbo.Customer (created_at);
PRINT '[OK] Table dbo.Customer created.';
GO

CREATE TABLE dbo.Invoice (
    invoice_id      INT IDENTITY(1,1) NOT NULL,
    customer_id     INT NOT NULL,
    invoice_date    DATE NOT NULL,
    amount          DECIMAL(19,4) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    CONSTRAINT PK_Invoice PRIMARY KEY CLUSTERED (invoice_id),
    CONSTRAINT FK_Invoice_Customer FOREIGN KEY (customer_id) REFERENCES dbo.Customer (customer_id) ON DELETE CASCADE,
    CONSTRAINT CK_Invoice_status CHECK (status IN ('PAID', 'PENDING', 'CANCELLED', 'OVERDUE'))
);
CREATE NONCLUSTERED INDEX IX_Invoice_customer_id ON dbo.Invoice (customer_id);
CREATE NONCLUSTERED INDEX IX_Invoice_invoice_date ON dbo.Invoice (invoice_date);
CREATE NONCLUSTERED INDEX IX_Invoice_status ON dbo.Invoice (status);
PRINT '[OK] Table dbo.Invoice created.';
GO

CREATE TABLE dbo.Payment (
    payment_id      INT IDENTITY(1,1) NOT NULL,
    invoice_id      INT NOT NULL,
    payment_date    DATETIME2 NOT NULL,
    amount          DECIMAL(19,4) NOT NULL,
    payment_method  VARCHAR(30) NOT NULL,
    CONSTRAINT PK_Payment PRIMARY KEY CLUSTERED (payment_id),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY (invoice_id) REFERENCES dbo.Invoice (invoice_id) ON DELETE CASCADE,
    CONSTRAINT CK_Payment_method CHECK (payment_method IN ('CREDIT_CARD', 'BANK_TRANSFER', 'PAYPAL', 'MOBILE_MONEY', 'CASH'))
);
CREATE NONCLUSTERED INDEX IX_Payment_invoice_id ON dbo.Payment (invoice_id);
CREATE NONCLUSTERED INDEX IX_Payment_payment_date ON dbo.Payment (payment_date);
CREATE NONCLUSTERED INDEX IX_Payment_method ON dbo.Payment (payment_method);
PRINT '[OK] Table dbo.Payment created.';
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

-- ===========================================================================
-- 5. Multi-Tenant Registry & Provisioning Audit (Phase 1)
-- ===========================================================================

IF OBJECT_ID('dbo.tenant_provisioning_events', 'U') IS NOT NULL DROP TABLE dbo.tenant_provisioning_events;
IF OBJECT_ID('dbo.tenant_data_sources', 'U') IS NOT NULL DROP TABLE dbo.tenant_data_sources;
IF OBJECT_ID('dbo.tenants', 'U') IS NOT NULL DROP TABLE dbo.tenants;
GO

CREATE TABLE dbo.tenants (
    tenant_id           VARCHAR(64) NOT NULL,
    display_name        VARCHAR(128) NOT NULL,
    isolation_tier      VARCHAR(20) NOT NULL CHECK (isolation_tier IN ('silo', 'bridge', 'pool')),
    vertical            VARCHAR(32) NOT NULL CHECK (vertical IN ('banking', 'retail', 'insurance', 'healthcare', 'telco', 'general')),
    anon_profile_id     VARCHAR(64) NOT NULL,
    kms_key_id          VARCHAR(128) NOT NULL,
    trino_catalog       VARCHAR(64) NOT NULL,
    s3_bucket           VARCHAR(128) NOT NULL,
    s3_prefix           VARCHAR(128) NOT NULL DEFAULT '',
    status              VARCHAR(20) NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'suspended', 'failed', 'offboarding')),
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_tenants PRIMARY KEY CLUSTERED (tenant_id),
    CONSTRAINT UQ_tenants_trino_catalog UNIQUE (trino_catalog)
);
CREATE NONCLUSTERED INDEX IX_tenants_vertical ON dbo.tenants (vertical);
CREATE NONCLUSTERED INDEX IX_tenants_status ON dbo.tenants (status);
GO

CREATE TABLE dbo.tenant_provisioning_events (
    event_id            BIGINT IDENTITY(1,1) NOT NULL,
    tenant_id           VARCHAR(64) NOT NULL,
    step                VARCHAR(64) NOT NULL,
    status              VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED')),
    details             VARCHAR(MAX) NULL,
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_tenant_provisioning_events PRIMARY KEY CLUSTERED (event_id),
    CONSTRAINT FK_events_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(tenant_id) ON DELETE CASCADE
);
CREATE NONCLUSTERED INDEX IX_events_tenant_id ON dbo.tenant_provisioning_events (tenant_id);
GO

CREATE TABLE dbo.tenant_data_sources (
    source_id           VARCHAR(64) NOT NULL,
    tenant_id           VARCHAR(64) NOT NULL,
    source_name         VARCHAR(128) NOT NULL,
    type                VARCHAR(32) NOT NULL,
    host                VARCHAR(128) NULL,
    port                INT NULL,
    database_name       VARCHAR(64) NULL,
    secret_ref          VARCHAR(256) NOT NULL,
    config_json         VARCHAR(MAX) NULL,
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_tenant_data_sources PRIMARY KEY CLUSTERED (source_id),
    CONSTRAINT FK_data_sources_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(tenant_id) ON DELETE CASCADE
);
CREATE NONCLUSTERED INDEX IX_data_sources_tenant ON dbo.tenant_data_sources (tenant_id);
GO
PRINT '[OK] Multi-tenant registry tables defined.';

