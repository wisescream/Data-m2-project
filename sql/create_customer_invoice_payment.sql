-- ===========================================================================
-- FinLake — Customer, Invoice, Payment Relational Schema
-- Database : finlake_source
-- ===========================================================================

USE finlake_source;
GO

-- 1. Drop existing tables if present (respecting foreign key dependency order)
IF OBJECT_ID('dbo.Payment', 'U') IS NOT NULL
    DROP TABLE dbo.Payment;
GO

IF OBJECT_ID('dbo.Invoice', 'U') IS NOT NULL
    DROP TABLE dbo.Invoice;
GO

IF OBJECT_ID('dbo.Customer', 'U') IS NOT NULL
    DROP TABLE dbo.Customer;
GO

-- 2. Customer Table
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
GO

CREATE NONCLUSTERED INDEX IX_Customer_city ON dbo.Customer (city);
CREATE NONCLUSTERED INDEX IX_Customer_created_at ON dbo.Customer (created_at);
PRINT '[OK] Table dbo.Customer created.';
GO

-- 3. Invoice Table
CREATE TABLE dbo.Invoice (
    invoice_id      INT IDENTITY(1,1) NOT NULL,
    customer_id     INT NOT NULL,
    invoice_date    DATE NOT NULL,
    amount          DECIMAL(19,4) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    CONSTRAINT PK_Invoice PRIMARY KEY CLUSTERED (invoice_id),
    CONSTRAINT FK_Invoice_Customer FOREIGN KEY (customer_id) 
        REFERENCES dbo.Customer (customer_id) ON DELETE CASCADE,
    CONSTRAINT CK_Invoice_status CHECK (status IN ('PAID', 'PENDING', 'CANCELLED', 'OVERDUE'))
);
GO

CREATE NONCLUSTERED INDEX IX_Invoice_customer_id ON dbo.Invoice (customer_id);
CREATE NONCLUSTERED INDEX IX_Invoice_invoice_date ON dbo.Invoice (invoice_date);
CREATE NONCLUSTERED INDEX IX_Invoice_status ON dbo.Invoice (status);
PRINT '[OK] Table dbo.Invoice created.';
GO

-- 4. Payment Table
CREATE TABLE dbo.Payment (
    payment_id      INT IDENTITY(1,1) NOT NULL,
    invoice_id      INT NOT NULL,
    payment_date    DATETIME2 NOT NULL,
    amount          DECIMAL(19,4) NOT NULL,
    payment_method  VARCHAR(30) NOT NULL,
    CONSTRAINT PK_Payment PRIMARY KEY CLUSTERED (payment_id),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY (invoice_id) 
        REFERENCES dbo.Invoice (invoice_id) ON DELETE CASCADE,
    CONSTRAINT CK_Payment_method CHECK (payment_method IN ('CREDIT_CARD', 'BANK_TRANSFER', 'PAYPAL', 'MOBILE_MONEY', 'CASH'))
);
GO

CREATE NONCLUSTERED INDEX IX_Payment_invoice_id ON dbo.Payment (invoice_id);
CREATE NONCLUSTERED INDEX IX_Payment_payment_date ON dbo.Payment (payment_date);
CREATE NONCLUSTERED INDEX IX_Payment_method ON dbo.Payment (payment_method);
PRINT '[OK] Table dbo.Payment created.';
GO
