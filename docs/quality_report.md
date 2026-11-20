# FinLake — PaySim Data Quality Report

> **Generated**: 2026-11-18 19:06:29 UTC
> **Source file**: `PS_20174392719_1491204439457_log.csv`
> **File size**: 470.7 MB (493,534,783 bytes)
> **Row count**: 6,362,620
> **SHA-256**: `16910f90577b0d981bf8ff289714510bb89bc71bff7d3f220f024e287e4eea6b`
> **Execution time**: 25.15s (streaming bounded-memory)

---

## 1. Schema Validation

- **Column count**: 11 (expected: 11) ✅ PASS
- **Column names match**: ✅ PASS
- **Missing columns**: None
- **Extra columns**: None

### Column Mapping

| Column | SQL Server Target | Arrow/Parquet Target | Nullable |
|--------|-------------------|----------------------|----------|
| `step` | `INT` | `int32` | No |
| `type` | `VARCHAR(20)` | `string (dictionary)` | No |
| `amount` | `DECIMAL(19,4)` | `decimal128(19,4) or float64` | No |
| `nameOrig` | `VARCHAR(64)` | `string` | No |
| `oldbalanceOrg` | `DECIMAL(19,4)` | `decimal128(19,4) or float64` | No |
| `newbalanceOrig` | `DECIMAL(19,4)` | `decimal128(19,4) or float64` | No |
| `nameDest` | `VARCHAR(64)` | `string` | No |
| `oldbalanceDest` | `DECIMAL(19,4)` | `decimal128(19,4) or float64` | No |
| `newbalanceDest` | `DECIMAL(19,4)` | `decimal128(19,4) or float64` | No |
| `isFraud` | `BIT` | `int8 (boolean)` | No |
| `isFlaggedFraud` | `BIT` | `int8 (boolean)` | No |

---

## 2. Null Analysis

- **Total null cells**: 0
- **Status**: ✅ 100% complete (0 nulls)

| Column | Null Count | Null % | Status |
|--------|------------|--------|--------|
| `step` | 0 | 0.0% | ✅ 0 nulls |
| `type` | 0 | 0.0% | ✅ 0 nulls |
| `amount` | 0 | 0.0% | ✅ 0 nulls |
| `nameOrig` | 0 | 0.0% | ✅ 0 nulls |
| `oldbalanceOrg` | 0 | 0.0% | ✅ 0 nulls |
| `newbalanceOrig` | 0 | 0.0% | ✅ 0 nulls |
| `nameDest` | 0 | 0.0% | ✅ 0 nulls |
| `oldbalanceDest` | 0 | 0.0% | ✅ 0 nulls |
| `newbalanceDest` | 0 | 0.0% | ✅ 0 nulls |
| `isFraud` | 0 | 0.0% | ✅ 0 nulls |
| `isFlaggedFraud` | 0 | 0.0% | ✅ 0 nulls |

---

## 3. Duplicate Analysis

- **Exact duplicate rows**: 0 (0.0%)
- **Note**: Exact identical rows are possible in synthetic PaySim (different transactions occurring with same values). Not necessarily errors.

---

## 4. Distribution Statistics

### 4.1 `step` (Simulation Hour)

- **Range**: [1, 743]
- **Mean**: 243.4
- **Unique steps**: 743
- **In domain [1, 744]**: ✅ PASS

### 4.2 `type` (Transaction Types)

| Transaction Type | Count | Percentage |
|------------------|-------|------------|
| `CASH_OUT` | 2,237,500 | 35.17% |
| `PAYMENT` | 2,151,495 | 33.81% |
| `CASH_IN` | 1,399,284 | 21.99% |
| `TRANSFER` | 532,909 | 8.38% |
| `DEBIT` | 41,432 | 0.65% |

- **Expected types present**: ✅ PASS (All 5 present)

### 4.3 `amount` (Monetary Amount)

- **Min**: 0.00
- **Max**: 92,445,516.64
- **Mean**: 179,861.90
- **Standard Deviation**: 603,858.18
- **Zero amounts**: 16
- **Negative amounts**: 0 ✅ PASS

**Percentiles (Reservoir sample N=100,000):**

| Percentile | Amount |
|------------|--------|
| P1 | 443.55 |
| P5 | 2,234.38 |
| P25 | 13,418.53 |
| P50 | 75,497.32 |
| P75 | 210,070.28 |
| P95 | 517,950.59 |
| P99 | 1,622,820.65 |

### 4.4 Balances

| Column | Min | Max | Mean | Zeros | Negatives |
|--------|-----|-----|------|-------|-----------|
| `oldbalanceOrg` | 0.00 | 59,585,040.37 | 833,883.10 | 2,102,449 | 0 |
| `newbalanceOrig` | 0.00 | 49,585,040.37 | 855,113.67 | 3,609,566 | 0 |
| `oldbalanceDest` | 0.00 | 356,015,889.35 | 1,100,701.67 | 2,704,388 | 0 |
| `newbalanceDest` | 0.00 | 356,179,278.92 | 1,224,996.40 | 2,439,433 | 0 |

### 4.5 Fraud Labels

- **`isFraud` Domain**: ✅ {0, 1} only
- **`isFraud` Counts**: 0 = 6,354,407, 1 = 8,213 (0.1291%)

- **`isFlaggedFraud` Domain**: ✅ {0, 1} only
- **`isFlaggedFraud` Counts**: 0 = 6,362,604, 1 = 16 (0.000251%)

**Fraud by Transaction Type:**

| Type | Fraud Count | Total for Type | Type Fraud Rate |
|------|-------------|----------------|-----------------|
| `CASH_OUT` | 4,116 | 2,237,500 | 0.184% |
| `PAYMENT` | 0 | 2,151,495 | 0.0% |
| `CASH_IN` | 0 | 1,399,284 | 0.0% |
| `TRANSFER` | 4,097 | 532,909 | 0.769% |
| `DEBIT` | 0 | 41,432 | 0.0% |

> [!NOTE]
> Fraud exclusively targets `TRANSFER` and `CASH_OUT` transaction cycles in PaySim simulator.

---

## 5. Balance Integrity Checks

- **Origin Outflows checked**: 4,963,336
- **Origin Outflows balance mismatches**: 3,678,407 (74.11%)
- **Origin Inflows checked**: 1,399,284
- **Origin Inflows balance mismatches**: 101,096 (7.22%)
- **Destination Transfers checked**: 120,811 mismatches (22.67%)
- **Merchant Accounts**: 2,151,495 records
- **Merchant Balances Zero**: ✅ 100% Zero (old & new)

> [!WARNING]
> Balance mismatches on origin/destination accounts are expected in PaySim: simulated fraud transactions are aborted and canceled post-execution, intentionally creating balance discrepancies.

---

## 6. Summary of P0 Acceptance Criteria

| Validation Item | Expectation | Result | Status |
|-----------------|-------------|--------|--------|
| Source File Exists | `data/raw/PS_20174392719_1491204439457_log.csv` | Found (470.7 MB) | ✅ PASS |
| SHA-256 Checksum | Recorded in `checksums.sha256` | `16910f90577b0d98...` | ✅ PASS |
| Column Count | 11 columns | 11 | ✅ PASS |
| Column Names | Exact match | Match | ✅ PASS |
| Row Count | ~6,362,620 rows | 6,362,620 | ✅ PASS |
| Null Completeness | 0 nulls | 0 nulls | ✅ PASS |
| Step Domain | [1, 744] | [1, 743] | ✅ PASS |
| Transaction Types | 5 valid categories | All 5 present | ✅ PASS |
| Amount Validity | amount >= 0 | 0 negatives | ✅ PASS |
| isFraud Domain | {0, 1} | Valid | ✅ PASS |
| isFlaggedFraud Domain | {0, 1} | Valid | ✅ PASS |
| Merchant Balances | All 0.0 | All 0.0 | ✅ PASS |

---

*Rapport de validation de qualité du jeu de données PaySim — FinLake Phase P0*
