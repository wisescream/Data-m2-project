"""
Extracts Customer, Invoice, and Payment from SQL Server,
serializes to Parquet, uploads to MinIO, and registers the tables in Trino (Hive & Iceberg catalogs).
"""

import os
import sys
from pathlib import Path
import pymssql
import pyarrow as pa
import pyarrow.parquet as pq

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.finlake.storage.minio_client import MinIOStorageClient
from src.finlake.trino.client import TrinoClient

SQLSERVER_HOST = os.getenv("SQLSERVER_HOST", "sqlserver")
SQLSERVER_PORT = int(os.getenv("SQLSERVER_PORT", "1433"))
SQLSERVER_USER = os.getenv("SQLSERVER_USER", "sa")
SQLSERVER_PASSWORD = os.getenv("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
SQLSERVER_DB = os.getenv("SQLSERVER_DATABASE", "finlake_source")

MINIO_HOST = os.getenv("MINIO_ENDPOINT", "minio:9000")
TRINO_HOST = os.getenv("TRINO_HOST", "trino")


def extract_and_upload():
    print("=" * 60)
    print("1. EXTRACTING TABLES FROM SQL SERVER")
    print("=" * 60)

    conn = pymssql.connect(
        server=SQLSERVER_HOST,
        port=SQLSERVER_PORT,
        user=SQLSERVER_USER,
        password=SQLSERVER_PASSWORD,
        database=SQLSERVER_DB,
    )
    cursor = conn.cursor(as_dict=True)

    storage = MinIOStorageClient(endpoint=MINIO_HOST)
    storage.ensure_bucket_exists("finlake")

    out_dir = PROJECT_ROOT / "data" / "curated"
    out_dir.mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------------------
    # A. Customer
    # -------------------------------------------------------------------------
    print("Extracting dbo.Customer...")
    cursor.execute("SELECT customer_id, first_name, last_name, email, city, created_at FROM dbo.Customer ORDER BY customer_id;")
    c_rows = cursor.fetchall()

    c_table = pa.Table.from_arrays(
        [
            pa.array([r["customer_id"] for r in c_rows], type=pa.int32()),
            pa.array([r["first_name"] for r in c_rows], type=pa.string()),
            pa.array([r["last_name"] for r in c_rows], type=pa.string()),
            pa.array([r["email"] for r in c_rows], type=pa.string()),
            pa.array([r["city"] for r in c_rows], type=pa.string()),
            pa.array([r["created_at"].isoformat() if r["created_at"] else None for r in c_rows], type=pa.string()),
        ],
        names=["customer_id", "first_name", "last_name", "email", "city", "created_at"],
    )

    c_file = out_dir / "customer_001.parquet"
    pq.write_table(c_table, str(c_file), compression="snappy")
    print(f"  [OK] Saved {len(c_rows):,} rows to {c_file.name} ({c_file.stat().st_size:,} bytes)")

    storage.upload_file(str(c_file), "curated/customer/customer_001.parquet")
    print("  [OK] Uploaded to s3://finlake/curated/customer/customer_001.parquet")

    # -------------------------------------------------------------------------
    # B. Invoice
    # -------------------------------------------------------------------------
    print("\nExtracting dbo.Invoice...")
    cursor.execute("SELECT invoice_id, customer_id, invoice_date, amount, status FROM dbo.Invoice ORDER BY invoice_id;")
    i_rows = cursor.fetchall()

    i_table = pa.Table.from_arrays(
        [
            pa.array([r["invoice_id"] for r in i_rows], type=pa.int32()),
            pa.array([r["customer_id"] for r in i_rows], type=pa.int32()),
            pa.array([str(r["invoice_date"]) for r in i_rows], type=pa.string()),
            pa.array([float(r["amount"]) for r in i_rows], type=pa.float64()),
            pa.array([r["status"] for r in i_rows], type=pa.string()),
        ],
        names=["invoice_id", "customer_id", "invoice_date", "amount", "status"],
    )

    i_file = out_dir / "invoice_001.parquet"
    pq.write_table(i_table, str(i_file), compression="snappy")
    print(f"  [OK] Saved {len(i_rows):,} rows to {i_file.name} ({i_file.stat().st_size:,} bytes)")

    storage.upload_file(str(i_file), "curated/invoice/invoice_001.parquet")
    print("  [OK] Uploaded to s3://finlake/curated/invoice/invoice_001.parquet")

    # -------------------------------------------------------------------------
    # C. Payment
    # -------------------------------------------------------------------------
    print("\nExtracting dbo.Payment...")
    cursor.execute("SELECT payment_id, invoice_id, payment_date, amount, payment_method FROM dbo.Payment ORDER BY payment_id;")
    p_rows = cursor.fetchall()

    p_table = pa.Table.from_arrays(
        [
            pa.array([r["payment_id"] for r in p_rows], type=pa.int32()),
            pa.array([r["invoice_id"] for r in p_rows], type=pa.int32()),
            pa.array([r["payment_date"].isoformat() if r["payment_date"] else None for r in p_rows], type=pa.string()),
            pa.array([float(r["amount"]) for r in p_rows], type=pa.float64()),
            pa.array([r["payment_method"] for r in p_rows], type=pa.string()),
        ],
        names=["payment_id", "invoice_id", "payment_date", "amount", "payment_method"],
    )

    p_file = out_dir / "payment_001.parquet"
    pq.write_table(p_table, str(p_file), compression="snappy")
    print(f"  [OK] Saved {len(p_rows):,} rows to {p_file.name} ({p_file.stat().st_size:,} bytes)")

    storage.upload_file(str(p_file), "curated/payment/payment_001.parquet")
    print("  [OK] Uploaded to s3://finlake/curated/payment/payment_001.parquet")

    cursor.close()
    conn.close()

    # -------------------------------------------------------------------------
    # 2. Register Tables in Trino (Hive Metastore)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("2. REGISTERING IN TRINO / HIVE CATALOG")
    print("=" * 60)

    trino = TrinoClient(host=TRINO_HOST)

    # Create schema if not exists
    trino.execute("CREATE SCHEMA IF NOT EXISTS hive.finlake_curated WITH (location = 's3a://finlake/curated/')")

    # Customer
    trino.execute("DROP TABLE IF EXISTS hive.finlake_curated.customer")
    customer_ddl = """
    CREATE TABLE hive.finlake_curated.customer (
        customer_id INT,
        first_name  VARCHAR,
        last_name   VARCHAR,
        email       VARCHAR,
        city        VARCHAR,
        created_at  VARCHAR
    )
    WITH (
        format = 'PARQUET',
        external_location = 's3a://finlake/curated/customer/'
    )
    """
    trino.execute(customer_ddl.strip())
    print("[OK] Registered hive.finlake_curated.customer")

    # Invoice
    trino.execute("DROP TABLE IF EXISTS hive.finlake_curated.invoice")
    invoice_ddl = """
    CREATE TABLE hive.finlake_curated.invoice (
        invoice_id   INT,
        customer_id  INT,
        invoice_date VARCHAR,
        amount       DOUBLE,
        status       VARCHAR
    )
    WITH (
        format = 'PARQUET',
        external_location = 's3a://finlake/curated/invoice/'
    )
    """
    trino.execute(invoice_ddl.strip())
    print("[OK] Registered hive.finlake_curated.invoice")

    # Payment
    trino.execute("DROP TABLE IF EXISTS hive.finlake_curated.payment")
    payment_ddl = """
    CREATE TABLE hive.finlake_curated.payment (
        payment_id     INT,
        invoice_id     INT,
        payment_date   VARCHAR,
        amount         DOUBLE,
        payment_method VARCHAR
    )
    WITH (
        format = 'PARQUET',
        external_location = 's3a://finlake/curated/payment/'
    )
    """
    trino.execute(payment_ddl.strip())
    print("[OK] Registered hive.finlake_curated.payment")

    # -------------------------------------------------------------------------
    # 3. Register Tables in Apache Iceberg
    # -------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("3. REGISTERING IN APACHE ICEBERG CATALOG")
    print("=" * 60)

    try:
        trino.execute("CREATE SCHEMA IF NOT EXISTS iceberg.finlake_iceberg WITH (location = 's3a://finlake/iceberg/')")
        
        trino.execute("DROP TABLE IF EXISTS iceberg.finlake_iceberg.customer")
        trino.execute("CREATE TABLE iceberg.finlake_iceberg.customer AS SELECT * FROM hive.finlake_curated.customer")
        print("[OK] Registered & loaded iceberg.finlake_iceberg.customer")

        trino.execute("DROP TABLE IF EXISTS iceberg.finlake_iceberg.invoice")
        trino.execute("CREATE TABLE iceberg.finlake_iceberg.invoice AS SELECT * FROM hive.finlake_curated.invoice")
        print("[OK] Registered & loaded iceberg.finlake_iceberg.invoice")

        trino.execute("DROP TABLE IF EXISTS iceberg.finlake_iceberg.payment")
        trino.execute("CREATE TABLE iceberg.finlake_iceberg.payment AS SELECT * FROM hive.finlake_curated.payment")
        print("[OK] Registered & loaded iceberg.finlake_iceberg.payment")
    except Exception as e:
        print(f"[WARN] Iceberg creation error (non-fatal): {e}")

    # -------------------------------------------------------------------------
    # 4. Verification Multi-Table Join Query
    # -------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("4. VERIFICATION: MULTI-TABLE 3-WAY JOIN ON TRINO")
    print("=" * 60)

    join_sql = """
    SELECT 
        c.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        c.city,
        i.invoice_id,
        i.invoice_date,
        i.amount AS invoice_amount,
        i.status AS invoice_status,
        p.payment_id,
        p.amount AS payment_amount,
        p.payment_method
    FROM hive.finlake_curated.customer c
    JOIN hive.finlake_curated.invoice i ON c.customer_id = i.customer_id
    JOIN hive.finlake_curated.payment p ON i.invoice_id = p.invoice_id
    LIMIT 5
    """

    results = trino.execute_query(join_sql.strip())
    for row in results:
        print(row)

    print("\n[SUCCESS] Customer, Invoice, and Payment tables are completely operational across SQL Server, MinIO, Hive, and Trino!")


if __name__ == "__main__":
    extract_and_upload()
