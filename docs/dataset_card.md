# FinLake — PaySim Dataset Card

---

## Dataset Identity

| Field | Value |
|-------|-------|
| **Name** | PaySim — Synthetic Financial Datasets for Fraud Detection |
| **Version** | 1 (original public release) |
| **Creator** | Edgar Lopez-Rojas, Ahmad Elmir, Stefan Axelsson |
| **Simulator** | PaySim (mobile money transaction simulator) |
| **Primary source** | [Kaggle: ealaxi/paysim1](https://www.kaggle.com/datasets/ealaxi/paysim1) |
| **Mirror** | [Hugging Face: LordNR/AMLGraphX-Paysim](https://huggingface.co/datasets/LordNR/AMLGraphX-Paysim) |
| **Reference article** | [PMC 12036017](https://pmc.ncbi.nlm.nih.gov/articles/PMC12036017/) |
| **License** | CC BY-SA 4.0 (verify on Kaggle source page) |
| **Size** | ~470 MB (CSV), ~6,362,620 rows × 11 columns |
| **Format** | CSV (comma-separated, header row) |

---

## Description

PaySim is a synthetic dataset that simulates mobile money transactions based on a sample of real transaction logs from a mobile money service provider in a developing country. The simulator generates realistic transaction patterns including fraudulent behavior, making it suitable for fraud detection research and data engineering exercises.

The dataset represents 30 simulated days (744 hourly steps) of mobile money activity including five transaction types: cash-in, cash-out, debit, payment, and transfer. Fraudulent transactions are injected by malicious agents that attempt to drain customer accounts via transfers and cash-outs.

---

## Purpose in FinLake

PaySim serves as the demonstration dataset for the FinLake data lake project. It provides:
- A realistic volume (~6.4M rows) for testing batch extraction and ingestion pipelines.
- Tabular structure compatible with SQL Server import.
- Multiple transaction types enabling meaningful analytical queries.
- A time dimension (`step`) for partitioning experiments.
- Fraud labels for descriptive analysis (not for ML model training in the project scope).

---

## Data Characteristics

| Characteristic | Value |
|---------------|-------|
| **Rows** | 6,362,620 (exact) |
| **Columns** | 11 |
| **Time span** | 743 steps (simulated hours, range [1, 743]) |
| **Transaction types** | CASH_IN (1,399,284), CASH_OUT (2,237,500), DEBIT (41,432), PAYMENT (2,151,495), TRANSFER (532,909) |
| **Fraud count & rate** | 8,213 frauds (0.1291% of transactions) |
| **Flagged fraud count** | 16 flagged (0.000251% of transactions) |
| **Originator accounts** | 100% start with `C` |
| **Destination accounts** | 4,211,125 `C` (customers), 2,151,495 `M` (merchants) |
| **Currency** | Not specified (simulated monetary units) |
| **File name** | `PS_20174392719_1491204439457_log.csv` (493,534,783 bytes, ~470.7 MB) |
| **SHA-256** | `16910f90577b0d981bf8ff289714510bb89bc71bff7d3f220f024e287e4eea6b` |

---

## Limitations and Warnings

> [!WARNING]
> **Synthetic data only** — This dataset does not contain real customer data, real transactions, or real financial amounts. No real-world privacy or regulatory concerns apply, but all analysis should be presented as synthetic/simulated.

- **No real identities**: `nameOrig` and `nameDest` are simulation-generated pseudonymous IDs, not real KYC data.
- **No declared currency**: Monetary amounts are in arbitrary simulation units. Do not label them as any specific currency.
- **Cancelled fraudulent transactions**: The simulator cancels fraudulent transactions after execution, creating intentional balance discrepancies. This is by design, not a data quality issue.
- **Balance leakage**: Post-transaction balance fields can indirectly reveal fraud status due to the cancellation mechanism. These should not be used as ML features without explicit leakage analysis.
- **No demographic data**: There is no customer age, gender, location, income, or any other demographic attribute. Do not invent such attributes.
- **isFlaggedFraud limitations**: The flag represents a naive threshold rule (TRANSFER > 200,000), not a sophisticated detection system.
- **Hugging Face mirror**: The HF mirror is a community copy. Verify attribution and license conditions from the original Kaggle source.

---

## Attribution

If using this dataset, please cite:

> E. A. Lopez-Rojas, A. Elmir, and S. Axelsson, "PaySim: A financial mobile money simulator for fraud detection," in *Proceedings of the 28th European Modeling and Simulation Symposium (EMSS)*, Larnaca, Cyprus, 2016.

---

## Checksum

The SHA-256 checksum of the original CSV file is recorded in `data/raw/checksums.sha256` after download. This ensures reproducibility across runs and environments.

---

## Schema Reference

See [`docs/data_dictionary.md`](data_dictionary.md) for the complete column-level data dictionary including types, constraints, and semantic notes.

---

*Dataset card prepared as part of FinLake Phase P0.*
