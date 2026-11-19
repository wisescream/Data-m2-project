# FinLake — Agent Instructions

## Project objective
Build a local, Dockerized financial transaction data lake using PaySim as a synthetic dataset:
SQL Server -> FastAPI/control plane + Python ingestion worker -> CSV/Parquet -> MinIO -> Hive Metastore -> Trino.

## Mandatory workflow
1. Read `docs/CAHIER_DES_CHARGES.md` before proposing implementation.
2. Read the relevant skill in `.agents/skills/` before modifying that domain.
3. Work phase by phase; do not implement the whole product in one pass.
4. At the start of each phase, state scope, files to change, assumptions, and acceptance checks.
5. Implement only the approved phase; run tests and report exact outcomes.
6. Update docs when behavior, configuration, API, schema, or architecture changes.
7. Do not claim a service, test, benchmark, or deployment works unless verified.

## Global constraints
- Local Docker Compose only for the core project.
- Python + FastAPI + SQLAlchemy + PyArrow; MinIO; Hive Metastore; Trino; SQL Server.
- No Kubernetes, Spark, Kafka, Airflow, cloud dependencies, or paid APIs in the baseline.
- Keep secrets out of source control; maintain `.env.example`.
- Treat PaySim as synthetic mobile-money data, not real banking/customer data.
- Never invent missing customer demographics, merchant profiles, currencies, or invoice records.
- Do not add an ML fraud model to the core scope.
- Preserve reproducibility and bounded-memory extraction.

## Skill routing
- Architecture/Compose: `.agents/skills/finlake-architecture/SKILL.md`
- Dataset/schema: `.agents/skills/paysim-data-model/SKILL.md`
- SQL Server extraction: `.agents/skills/sqlserver-ingestion/SKILL.md`
- Parquet/MinIO: `.agents/skills/parquet-minio-storage/SKILL.md`
- Trino/catalog: `.agents/skills/trino-hive-catalog/SKILL.md`
- API/jobs: `.agents/skills/api-job-orchestration/SKILL.md`
- Benchmarks: `.agents/skills/benchmark-methodology/SKILL.md`
- Quality/tests: `.agents/skills/data-quality-testing/SKILL.md`
- Docs/release: `.agents/skills/documentation-release/SKILL.md`

## Definition of done
A clean checkout can start the stack, import a sample, run an extraction job, find Parquet objects in MinIO, query the registered table in Trino, run tests, and reproduce benchmark output from documented commands.
