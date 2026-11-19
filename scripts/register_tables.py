"""Automated Table and Partition Registration in Hive Metastore via Trino."""

from __future__ import annotations

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.finlake.trino.client import TrinoClient


def register_tables(client: TrinoClient | None = None) -> None:
    trino = client or TrinoClient()
    ddl_file = PROJECT_ROOT / "sql" / "trino_ddl.sql"

    print("=" * 60)
    print("FINLAKE — TRINO / HIVE CATALOG REGISTRATION")
    print(f"Trino endpoint: {trino.base_url}")
    print(f"DDL script:     {ddl_file}")
    print("=" * 60)

    # 1. Test connectivity
    diag = trino.test_connection()
    if diag.get("status") != "connected":
        raise RuntimeError(f"Cannot connect to Trino: {diag.get('error')}")
    print(f"[OK] Trino connected: version {diag.get('node_version')}, env={diag.get('environment')}")

    # 2. Execute DDL statements
    ddl_content = ddl_file.read_text(encoding="utf-8")
    statements = [stmt.strip() for stmt in ddl_content.split(";") if stmt.strip()]

    for idx, stmt in enumerate(statements, 1):
        # Extract first line for summary logging
        first_line = stmt.strip().splitlines()[0]
        print(f"\n[{idx}/{len(statements)}] Executing: {first_line[:60]}...")
        trino.execute(stmt)
        print("  [OK] Statement applied successfully.")

    # 3. Synchronize partitions for partitioned transactions table
    print("\n[SYNC] Synchronizing partition metadata from MinIO...")
    sync_call = "CALL hive.system.sync_partition_metadata(schema_name => 'finlake_curated', table_name => 'transactions', mode => 'FULL')"
    trino.execute(sync_call)
    print("  [OK] Partition metadata synchronized.")

    # 4. Verification and Discovery summary
    tables = trino.execute_query("SHOW TABLES FROM hive.finlake_curated")
    table_names = [t.get("Table") for t in tables]
    print(f"\n[CATALOG] Registered tables in hive.finlake_curated: {table_names}")

    count_res = trino.execute_query("SELECT count(*) AS total FROM hive.finlake_curated.transactions")
    total_rows = count_res[0].get("total", 0) if count_res else 0

    parts_res = trino.execute_query(
        "SELECT event_date, count(*) AS count FROM hive.finlake_curated.transactions GROUP BY event_date ORDER BY event_date"
    )
    print(f"[METRICS] Table transactions total rows: {total_rows:,}")
    print(f"[METRICS] Discovered partitions: {len(parts_res)}")
    for p in parts_res:
        print(f"  - event_date={p['event_date']}: {p['count']:,} rows")
    print("=" * 60)


if __name__ == "__main__":
    register_tables()
