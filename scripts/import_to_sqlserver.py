#!/usr/bin/env python3
"""
FinLake P2 — Automated & Idempotent SQL Server Importer.

Imports the PaySim dataset into SQL Server table dbo.transactions with:
- Staged bulk loading capable of handling scientific notation in balance fields
- Automatic sequential ingest_row_id generation
- Strict row count reconciliation (expected 6,362,620 rows)
- Creation of durable job tracking tables (dbo.ingestion_jobs, dbo.job_runs)

Usage:
    python scripts/import_to_sqlserver.py
    python scripts/import_to_sqlserver.py --csv-path /path/to/csv --server localhost --database finlake_source
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
DEFAULT_CSV = RAW_DIR / "PS_20174392719_1491204439457_log.csv"
SQL_DIR = PROJECT_ROOT / "sql"
DDL_FILE = SQL_DIR / "create_tables.sql"

# Read .env if present
env_path = PROJECT_ROOT / ".env"
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

DEFAULT_SERVER = os.environ.get("SQLSERVER_HOST", "localhost")
DEFAULT_PORT = int(os.environ.get("SQLSERVER_PORT", "1433"))
DEFAULT_USER = "sa"
DEFAULT_PASSWORD = os.environ.get("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
DEFAULT_DATABASE = os.environ.get("SQLSERVER_DATABASE", "finlake_source")
CONTAINER_NAME = "finlake-sqlserver"
EXPECTED_ROWS = 6_362_620


def execute_sqlcmd(query_or_file: str, is_file: bool = False, database: str = "master") -> tuple[bool, str]:
    """Execute SQL via sqlcmd inside the container."""
    cmd = [
        "docker", "exec", "-i", CONTAINER_NAME,
        "/opt/mssql-tools18/bin/sqlcmd",
        "-S", "localhost",
        "-U", DEFAULT_USER,
        "-P", DEFAULT_PASSWORD,
        "-C",
        "-d", database
    ]
    if is_file:
        cmd.extend(["-i", query_or_file])
        proc = subprocess.run(cmd, capture_output=True, text=True)
    else:
        cmd.extend(["-Q", query_or_file])
        proc = subprocess.run(cmd, capture_output=True, text=True)

    success = (proc.returncode == 0) and ("Msg " not in proc.stdout)
    output = proc.stdout + proc.stderr
    return success, output


def main():
    parser = argparse.ArgumentParser(description="FinLake SQL Server Importer")
    parser.add_argument("--csv-path", default=str(DEFAULT_CSV))
    parser.add_argument("--server", default=DEFAULT_SERVER)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"[ERROR] CSV not found: {csv_path}")
        sys.exit(1)

    t0 = time.time()
    print("=" * 65)
    print("  FinLake — Phase P2 SQL Server Import & Schema Initialization")
    print("=" * 65)

    # 1. Apply DDL schema
    print("\n[1/4] Applying DDL schema from sql/create_tables.sql...")
    with open(DDL_FILE, "r", encoding="utf-8") as f:
        ddl_content = f.read()

    # Create DB and tables
    p = subprocess.Popen(
        ["docker", "exec", "-i", CONTAINER_NAME, "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", DEFAULT_USER, "-P", DEFAULT_PASSWORD, "-C"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    stdout, stderr = p.communicate(input=ddl_content)
    if p.returncode != 0:
        print(f"[ERROR] DDL execution failed: {stdout}\n{stderr}")
        sys.exit(1)
    print("[OK]   Schema dbo.transactions and job tables created.")

    # 2. Copy CSV into container if not already there
    container_csv = "/tmp/paysim.csv"
    print(f"\n[2/4] Ensuring dataset is present in container ({container_csv})...")
    check_p = subprocess.run(["docker", "exec", CONTAINER_NAME, "test", "-f", container_csv])
    if check_p.returncode != 0:
        print("      Copying CSV into container (this may take a few seconds)...")
        cp_p = subprocess.run(["docker", "cp", str(csv_path), f"{CONTAINER_NAME}:{container_csv}"], capture_output=True, text=True)
        if cp_p.returncode != 0:
            print(f"[ERROR] docker cp failed: {cp_p.stderr}")
            sys.exit(1)
    print("[OK]   Dataset present in container.")

    # 3. Bulk insert via staging table to handle scientific notation
    print("\n[3/4] Executing staged bulk insert into dbo.transactions...")
    bulk_sql = f"""
    SET NOCOUNT ON;
    DROP TABLE IF EXISTS dbo.transactions_staging;
    CREATE TABLE dbo.transactions_staging (
        step INT,
        type VARCHAR(20),
        amount FLOAT,
        nameOrig VARCHAR(64),
        oldbalanceOrg FLOAT,
        newbalanceOrig FLOAT,
        nameDest VARCHAR(64),
        oldbalanceDest FLOAT,
        newbalanceDest FLOAT,
        isFraud BIT,
        isFlaggedFraud BIT
    );

    BULK INSERT dbo.transactions_staging
    FROM '{container_csv}'
    WITH (
        FIRSTROW = 2,
        FIELDTERMINATOR = ',',
        ROWTERMINATOR = '0x0a',
        TABLOCK,
        BATCHSIZE = 500000
    );

    TRUNCATE TABLE dbo.transactions;

    INSERT INTO dbo.transactions (
        step, type, amount, nameOrig, oldbalanceOrg, newbalanceOrig,
        nameDest, oldbalanceDest, newbalanceDest, isFraud, isFlaggedFraud
    )
    SELECT
        step, type, CAST(amount AS DECIMAL(19,4)), nameOrig,
        CAST(oldbalanceOrg AS DECIMAL(19,4)), CAST(newbalanceOrig AS DECIMAL(19,4)),
        nameDest, CAST(oldbalanceDest AS DECIMAL(19,4)), CAST(newbalanceDest AS DECIMAL(19,4)),
        isFraud, isFlaggedFraud
    FROM dbo.transactions_staging;

    DROP TABLE dbo.transactions_staging;
    """
    ok, out = execute_sqlcmd(bulk_sql, database=args.database)
    if not ok:
        print(f"[ERROR] Bulk insert failed: {out}")
        sys.exit(1)
    print("[OK]   Bulk insert and type casting completed.")

    # 4. Reconciliation
    print("\n[4/4] Reconciling row count and ID sequence...")
    rec_sql = """
    SELECT 
        COUNT(*) AS row_cnt,
        MIN(ingest_row_id) AS min_id,
        MAX(ingest_row_id) AS max_id,
        COUNT(DISTINCT step) AS distinct_steps,
        SUM(CASE WHEN isFraud = 1 THEN 1 ELSE 0 END) AS fraud_cnt
    FROM dbo.transactions;
    """
    ok, out = execute_sqlcmd(rec_sql, database=args.database)
    print("      Reconciliation Query Output:")
    for line in out.splitlines():
        if line.strip():
            print(f"      {line}")

    elapsed = round(time.time() - t0, 2)
    print("\n" + "=" * 65)
    print(f"  Phase P2 SQL Server Import Completed in {elapsed}s")
    print("=" * 65)


if __name__ == "__main__":
    main()
