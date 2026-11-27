---
name: paysim-data-model
description: Interpret, validate, stage, and model the PaySim synthetic mobile-money dataset and complementary polyglot schemas in FinLake.
---
# PaySim & Polyglot Data Model Skill

## Mission
Keep PaySim and FinLake's complementary multi-tenant schemas accurate, clearly labeled as synthetic, and free of invented production claims.

## PaySim Core Facts
- **Source table**: `dbo.transactions` in `finlake_source` (`finlake-sqlserver`), ~6,362,620 rows, 11 columns, 744 hourly `step` values.
- **Columns**: `step`, `type` (`CASH_IN`, `CASH_OUT`, `DEBIT`, `PAYMENT`, `TRANSFER`), `amount`, `nameOrig`, `oldbalanceOrg`, `newbalanceOrig`, `nameDest`, `oldbalanceDest`, `newbalanceDest`, `isFraud`, `isFlaggedFraud`.
- **Synthetic Timestamp Rule**: `event_date` is derived from `step` using base time `2023-01-01T00:00:00Z + (step - 1) hours` in `NativeJavaIngestionService`. Always label it as simulated time, never real calendar dates.

## Complementary Schemas
- **Acme Relational (`finlake-sqlserver` / `hive.finlake_curated`)**: `Customer`, `Invoice`, `Payment`, `transactions`, plus `kafka_polyglot_events`.
- **Apex EU (`finlake-postgres-source` / MongoDB / Redis)**: `retail_banking` (`retail_customers`, `retail_banking_tx`), `customer_profiles` (KYC BSON), `session_token` (Redis).
- **Nordic Mobile Money (`finlake-kafka` / Cassandra / InfluxDB)**: `mobile_money_events`, `mobile_tx_by_account`, `ingestion_throughput_tps`.

## Rules
- Never label PaySim monetary amounts with an assumed real currency (USD/EUR/MAD) unless explicitly referencing the separate `retail_banking` or `nordic_ledger` schemas.
- Treat `nameOrig` and `nameDest` as pseudonymous simulation IDs, subject to dynamic masking when anonymized by `Admin` or `Data Owner`.
- Never use `isFraud` or post-cancellation balance columns (`oldbalanceOrg`, `newbalanceOrig`, etc.) to train an unverified ML model in core scope.
