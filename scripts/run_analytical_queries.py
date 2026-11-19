"""Executes and benchmarks the 6 FinLake reference analytical queries on Trino."""

from __future__ import annotations

import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.finlake.trino.client import TrinoClient


def run_benchmark_queries(client: TrinoClient | None = None) -> dict:
    trino = client or TrinoClient()
    queries_file = PROJECT_ROOT / "sql" / "analytical_queries.sql"
    sql_text = queries_file.read_text(encoding="utf-8")

    # Split queries by double comments '-- Q'
    raw_blocks = sql_text.split("-- Q")
    queries = []
    for block in raw_blocks:
        if not block.strip():
            continue
        full_block = "-- Q" + block
        lines = full_block.strip().splitlines()
        q_id = lines[0].split(":")[0].replace("--", "").strip()
        q_title = lines[0].split(":", 1)[1].strip() if ":" in lines[0] else q_id

        # SQL is everything after comment lines
        sql_lines = [l for l in lines if not l.strip().startswith("--")]
        query_sql = "\n".join(sql_lines).strip().rstrip(";")
        if query_sql:
            queries.append({"id": q_id, "title": q_title, "sql": query_sql})

    print("=" * 70)
    print("FINLAKE — EXECUTION DES 6 REQUETES ANALYTIQUES DE REFERENCE")
    print(f"Trino Base URL : {trino.base_url}")
    print(f"Catalogue / Schéma : {trino.catalog}.{trino.schema}")
    print("=" * 70)

    results_summary = {}

    for q in queries:
        q_id = q["id"]
        q_title = q["title"]
        q_sql = q["sql"]

        print(f"\n>>> [{q_id}] {q_title}")
        start = time.perf_counter()
        rows = trino.execute_query(q_sql)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        results_summary[q_id] = {
            "title": q_title,
            "duration_ms": duration_ms,
            "row_count": len(rows),
            "sample_result": rows[:3],
        }

        print(f"  Statut : SUCCÈS ({len(rows)} lignes retournées en {duration_ms} ms)")
        if rows:
            print(f"  Premier résultat : {rows[0]}")

    # Specific Partition Pruning Verification with EXPLAIN on Q4
    print("\n" + "=" * 70)
    print("VERIFICATION DU PARTITION PRUNING (EXPLAIN SUR Q4)")
    print("=" * 70)
    explain_sql = "EXPLAIN SELECT COUNT(*) FROM hive.finlake_curated.transactions WHERE event_date = '2023-01-01'"
    plan_rows = trino.execute_query(explain_sql)
    full_plan = "\n".join(r["Query Plan"] for r in plan_rows)

    has_pruning = "event_date:string:PARTITION_KEY" in full_plan and "[[2023-01-01]]" in full_plan
    print(f"Partition pruning détecté dans le plan : {'OUI (VALIDE)' if has_pruning else 'NON'}")

    return {
        "queries": results_summary,
        "partition_pruning_verified": has_pruning,
        "plan_sample": full_plan[:500],
    }


if __name__ == "__main__":
    run_benchmark_queries()
