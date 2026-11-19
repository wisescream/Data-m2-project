---
name: trino-hive-catalog
description: Configure Hive Metastore and Trino to query FinLake objects in MinIO.
---
# Trino and Hive Catalog Skill

## Mission
Make registered Parquet datasets queryable through Trino SQL.

## Rules
- Explain that uploading Parquet objects to MinIO alone does not create SQL tables.
- Configure Hive Metastore and the Trino Hive connector consistently, including object-store access and warehouse location.
- Keep metastore database persistence and MinIO persistence explicit in Compose.
- Register schemas/tables with documented DDL and location/partition metadata.
- Verify discovery with `SHOW SCHEMAS`, `SHOW TABLES`, `DESCRIBE`, row counts, filters, aggregations, and joins.
- Validate partition pruning using `EXPLAIN` and controlled query comparisons.
- Avoid claiming ACID guarantees for plain Hive external Parquet tables.
- Treat Iceberg as a separate optional catalog/connector experiment with its own acceptance tests.
## Required outputs
Trino catalog configuration, metastore configuration, table DDL, SQL smoke tests, and troubleshooting notes.
