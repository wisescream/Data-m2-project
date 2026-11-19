---
name: paysim-data-model
description: Interpret, validate, stage, and model the PaySim synthetic mobile-money dataset for FinLake.
---
# PaySim Data Model Skill

## Mission
Make PaySim understandable and reproducible as a financial transaction source.

## Source facts
- Dataset: PaySim / Synthetic Financial Datasets For Fraud Detection.
- Approximately 6,362,620 rows, 11 columns, 744 hourly steps.
- Synthetic mobile-money activity; not real customer or bank data.
- Transaction types: CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER.
- Fraud labels are simulation labels, not evidence of real-world fraud.

## Rules
- Preserve the raw source file unchanged in a raw/ landing zone and record checksum, source filename, ingestion timestamp, row count, and dataset version.
- Validate expected columns and types; reject or quarantine malformed rows rather than silently dropping them.
- Treat `nameOrig` and `nameDest` as pseudonymous identifiers, not real identities.
- Do not invent customer demographics, legal entities, currencies, merchants, invoices, or account attributes absent from PaySim.
- If normalized account/customer tables are created, clearly label them as derived dimensions containing only observed identifiers and derived metadata.
- Convert `step` to a documented synthetic timestamp using a fixed configurable simulation start timestamp. Never describe it as a real calendar date.
- Preserve `isFraud` and `isFlaggedFraud` as labels/flags. Do not use either as an input feature for a fraud model.
- For a future fraud-model extension, document that fraud transactions are cancelled in the simulator and avoid leakage from post-transaction balance fields (`oldbalanceOrg`, `newbalanceOrig`, `oldbalanceDest`, `newbalanceDest`) unless the experiment explicitly studies leakage.
- Keep raw monetary values and their unit semantics documented; do not assume MAD, EUR, or USD.
## Required outputs
Dataset card, source attribution, schema mapping, data dictionary, validation report, and a reproducible load script.
