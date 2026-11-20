-- FinLake Secondary Relational Source (PostgreSQL)
-- Sample Retail Banking / POS schema

CREATE TABLE IF NOT EXISTS retail_customers (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    segment VARCHAR(50) NOT NULL,
    country VARCHAR(10) DEFAULT 'FRA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS retail_transactions (
    transaction_id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES retail_customers(customer_id),
    amount NUMERIC(12, 2) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'COMPLETED',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO retail_customers (customer_name, segment, country) VALUES
('Acme Retail Store 101', 'Enterprise', 'FRA'),
('NovaMart Supermarket', 'Enterprise', 'FRA'),
('Boutique Bio Paris', 'SMB', 'FRA');

INSERT INTO retail_transactions (customer_id, amount, transaction_type, status) VALUES
(1, 1542.50, 'CARD_PAYMENT', 'COMPLETED'),
(1, 320.00, 'REFUND', 'COMPLETED'),
(2, 8940.10, 'WIRE_TRANSFER', 'COMPLETED'),
(3, 75.80, 'CONTACTLESS', 'COMPLETED');
