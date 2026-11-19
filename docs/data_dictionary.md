# FinLake — PaySim Data Dictionary

**Version**: 1.0
**Phase**: P0 — Cadrage et dataset
**Last updated**: 2026-11-18

---

## Overview

The PaySim dataset simulates mobile money transactions based on a sample of real transaction logs from a mobile money service in an African country. It was generated using the PaySim simulator for the purpose of fraud detection research.

- **Rows**: ~6,362,620 transactions
- **Columns**: 11
- **Time span**: 744 hourly steps (simulated 30-day period)
- **Transaction types**: 5 (CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER)

> [!IMPORTANT]
> This is entirely synthetic data. Identifiers are pseudonymous simulation labels, not real customer or merchant identities. Monetary amounts have no declared currency.

---

## Column Definitions

| # | Column | CSV Type | Pandas dtype | SQL Server Type | Arrow/Parquet Type | Nullable | Description |
|---|--------|----------|-------------|-----------------|-------------------|----------|-------------|
| 1 | `step` | integer | `int64` | `INT` | `int32` | No | Simulation time unit. 1 step = 1 hour. Observed range: [1, 743] (~31 days of simulation). |
| 2 | `type` | string | `object` | `VARCHAR(20)` | `string` (dictionary-encoded) | No | Transaction type. Domain: {`CASH_IN`, `CASH_OUT`, `DEBIT`, `PAYMENT`, `TRANSFER`}. |
| 3 | `amount` | float | `float64` | `DECIMAL(19,4)` | `decimal128(19,4)` or `float64` | No | Transaction amount in unspecified simulated currency. Always ≥ 0. |
| 4 | `nameOrig` | string | `object` | `VARCHAR(64)` | `string` | No | Pseudonymous originator account identifier. Always starts with `C` (customer). |
| 5 | `oldbalanceOrg` | float | `float64` | `DECIMAL(19,4)` | `decimal128(19,4)` or `float64` | No | Originator account balance before the transaction. |
| 6 | `newbalanceOrig` | float | `float64` | `DECIMAL(19,4)` | `decimal128(19,4)` or `float64` | No | Originator account balance after the transaction. |
| 7 | `nameDest` | string | `object` | `VARCHAR(64)` | `string` | No | Pseudonymous destination account identifier. Starts with `C` (customer) or `M` (merchant). |
| 8 | `oldbalanceDest` | float | `float64` | `DECIMAL(19,4)` | `decimal128(19,4)` or `float64` | No | Destination account balance before the transaction. Set to 0 for merchant accounts (`M` prefix). |
| 9 | `newbalanceDest` | float | `float64` | `DECIMAL(19,4)` | `decimal128(19,4)` or `float64` | No | Destination account balance after the transaction. Set to 0 for merchant accounts (`M` prefix). |
| 10 | `isFraud` | integer | `int64` | `BIT` | `int8` (boolean semantics) | No | Synthetic fraud label. 1 = fraudulent transaction (simulated). 0 = legitimate. Domain: {0, 1}. |
| 11 | `isFlaggedFraud` | integer | `int64` | `BIT` | `int8` (boolean semantics) | No | Naive rule-based flag. 1 = flagged by business rule (single TRANSFER > 200,000). Domain: {0, 1}. |

---

## Semantic Notes

### `step` → Synthetic Timestamp

The `step` column maps to simulated hours. For analytical queries, a derived `event_time_simulated` column will be computed:

```
event_time_simulated = SIMULATION_START + (step - 1) × 1 hour
```

Where `SIMULATION_START` is a configurable fictitious datetime (e.g., `2023-01-01 00:00:00 UTC`). This timestamp must always be labeled as **simulated time**, never presented as a real calendar date.

### Account Identifiers

| Prefix | Meaning | Example |
|--------|---------|---------|
| `C` | Customer account (pseudonymous) | `C1234567890` |
| `M` | Merchant account (pseudonymous) | `M1234567890` |

- `nameOrig` always starts with `C` (only customers originate transactions).
- `nameDest` starts with `C` (customer) or `M` (merchant), depending on the transaction type.
- These are simulation-generated identifiers, **not** real KYC-verified entities.

### Transaction Types

| Type | Direction | Description |
|------|-----------|-------------|
| `CASH_IN` | Inflow to originator | Cash deposit into the originator's account. |
| `CASH_OUT` | Outflow from originator | Cash withdrawal from the originator's account. |
| `DEBIT` | Outflow from originator | Direct debit from the originator's account. |
| `PAYMENT` | Outflow from originator | Payment to a merchant. |
| `TRANSFER` | Outflow from originator | Transfer between customer accounts. |

### Fraud Labels

- **`isFraud`**: The ground-truth synthetic label. Fraud in PaySim occurs only on `TRANSFER` and `CASH_OUT` transactions, where malicious agents attempt to drain customer accounts.
- **`isFlaggedFraud`**: A naive rule-based flag: set to 1 for `TRANSFER` transactions exceeding 200,000 units. Very sparse.
- Fraudulent transactions are **cancelled** in the simulator after execution. This creates intentional balance discrepancies that should not be confused with data errors.

> [!CAUTION]
> Do not use `isFraud` or `isFlaggedFraud` as input features for a predictive model — they are labels. Post-transaction balance fields (`oldbalanceOrg`, `newbalanceOrig`, `oldbalanceDest`, `newbalanceDest`) may leak fraud signals due to the cancellation mechanism. Document this if creating derived features.

### Balance Fields

- For **merchant** destinations (`M` prefix), `oldbalanceDest` and `newbalanceDest` are always 0 — merchant balances are not tracked in PaySim.
- Balance mismatches between `oldbalanceOrg - amount` and `newbalanceOrig` are expected for fraudulent transactions (cancellation effect).
- Monetary amounts have **no declared currency** — do not label them as MAD, EUR, USD, or any specific currency.

---

## Derived Columns (Future Phases)

The following columns will be derived during ingestion (P3+):

| Column | Type | Derivation | Phase |
|--------|------|------------|-------|
| `ingest_row_id` | `BIGINT IDENTITY` | Auto-generated row number during SQL Server import | P2 |
| `event_time_simulated` | `DATETIME2` | `SIMULATION_START + (step - 1) hours` | P3 |
| `event_date` | `DATE` | Date portion of `event_time_simulated` | P3 (partition key) |

---

## Constraints Summary

| Constraint | Column(s) | Rule |
|-----------|-----------|------|
| NOT NULL | All columns | No nulls expected in the raw dataset |
| Domain | `type` | ∈ {CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER} |
| Domain | `isFraud`, `isFlaggedFraud` | ∈ {0, 1} |
| Range | `step` | [1, 744] |
| Non-negative | `amount` | ≥ 0 |
| Format | `nameOrig` | Starts with `C` |
| Format | `nameDest` | Starts with `C` or `M` |

---

*Data dictionary prepared as part of FinLake Phase P0.*
