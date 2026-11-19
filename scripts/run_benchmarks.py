"""Reproducible benchmark runner for FinLake (Ingestion & Trino SQL)."""

from __future__ import annotations

import os
import sys
import json
import csv
import time
import platform
import subprocess
import statistics
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.finlake.trino.client import TrinoClient
from src.finlake.storage.minio_client import MinIOStorageClient

RESULTS_DIR = PROJECT_ROOT / "benchmarks" / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def get_system_specs() -> dict:
    """Collects host hardware, environment, and container metadata."""
    docker_version = "unknown"
    try:
        proc = subprocess.run(["docker", "--version"], capture_output=True, text=True)
        if proc.returncode == 0:
            docker_version = proc.stdout.strip()
    except Exception:
        pass

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "os": platform.system(),
        "os_release": platform.release(),
        "processor": platform.processor(),
        "cpu_count": os.cpu_count(),
        "python_version": platform.python_version(),
        "docker_version": docker_version,
    }


def run_ingestion_scenario(
    format_type: str,
    compression: str,
    batch_size: int,
    max_rows: int = 20000,
    partition_by: str = "event_date",
) -> dict:
    """Executes a single ingestion scenario via finlake-worker container and parses results."""
    scenario_id = f"ingest_{format_type}_{compression}_b{batch_size}"
    print(f"\n  [INGESTION] Scenario '{scenario_id}' (Rows: {max_rows:,}, Batch: {batch_size:,}, Fmt: {format_type}, Codec: {compression})...")

    job_id = f"bench_{format_type}_{compression}_{batch_size}"
    cmd = [
        "docker", "run", "--rm",
        "--network", "finlake-network",
        "-v", f"{PROJECT_ROOT}:/app",
        "finlake-worker:1.0",
        "python", "-m", "src.finlake.worker.runner",
        "--job-id", job_id,
        "--format", format_type,
        "--compression", compression,
        "--batch-size", str(batch_size),
        "--partition-by", partition_by,
        "--max-rows", str(max_rows),
    ]

    start = time.perf_counter()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    duration_s = round(time.perf_counter() - start, 3)

    if proc.returncode != 0:
        raise RuntimeError(f"Ingestion scenario '{scenario_id}' failed: {proc.stderr or proc.stdout}")

    # Inspect manifest from MinIO
    storage = MinIOStorageClient(endpoint=os.getenv("MINIO_ENDPOINT_HOST", "127.0.0.1:9000"))
    manifests = storage.list_objects(prefix="manifests/paysim/transactions/")
    # Find latest manifest
    manifest_data = {}
    if manifests:
        latest = sorted(manifests, key=lambda x: x["last_modified"] or "")[-1]
        raw_manifest = storage.get_object_bytes(latest["object_name"])
        manifest_data = json.loads(raw_manifest.decode("utf-8"))

    rows_extracted = manifest_data.get("row_count_total", max_rows)
    bytes_written = manifest_data.get("bytes_total", 0)
    objects_count = manifest_data.get("objects_count", 0)

    throughput_rows = round(rows_extracted / duration_s, 2) if duration_s > 0 else 0
    throughput_bytes = round(bytes_written / duration_s, 2) if duration_s > 0 else 0
    avg_obj_size = round(bytes_written / objects_count, 2) if objects_count > 0 else 0

    return {
        "scenario_id": scenario_id,
        "format": format_type,
        "compression": compression,
        "batch_size": batch_size,
        "partition_by": partition_by,
        "max_rows": rows_extracted,
        "duration_seconds": duration_s,
        "bytes_written": bytes_written,
        "objects_count": objects_count,
        "avg_object_size_bytes": avg_obj_size,
        "throughput_rows_sec": throughput_rows,
        "throughput_bytes_sec": throughput_bytes,
    }


def run_all_ingestion_benchmarks(sample_size: int = 20000) -> list[dict]:
    """Runs the full matrix of ingestion scenarios (batch size, format, compression)."""
    print("\n" + "=" * 70)
    print("ETAPE 1 — BENCHMARK D'INGESTION (DATA PLANE)")
    print(f"Dataset de test : {sample_size:,} lignes issues de SQL Server dbo.transactions")
    print("=" * 70)

    scenarios = [
        # Batch size variations (Parquet Snappy)
        ("parquet", "snappy", 1000, "event_date"),
        ("parquet", "snappy", 5000, "event_date"),
        ("parquet", "snappy", 10000, "event_date"),
        ("parquet", "snappy", 20000, "event_date"),
        # Compression variations (batch 10,000)
        ("parquet", "zstd", 10000, "event_date"),
        ("parquet", "none", 10000, "event_date"),
        # Format variation: CSV (batch 10,000)
        ("csv", "none", 10000, "event_date"),
    ]

    results = []
    for fmt, comp, bsize, part in scenarios:
        res = run_ingestion_scenario(fmt, comp, bsize, max_rows=sample_size, partition_by=part)
        results.append(res)

    # Save to JSON
    json_path = RESULTS_DIR / "ingestion_benchmark.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Résultats bruts JSON sauvegardés dans : {json_path}")

    # Save to CSV
    csv_path = RESULTS_DIR / "ingestion_benchmark.csv"
    if results:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
            writer.writeheader()
            writer.writerows(results)
    print(f"[OK] Résultats bruts CSV sauvegardés dans : {csv_path}")

    return results


def run_all_sql_benchmarks(iterations: int = 3) -> list[dict]:
    """Executes the 6 reference analytical queries with cold and warm cache timings."""
    print("\n" + "=" * 70)
    print("ETAPE 2 — BENCHMARK ANALYTIQUE SQL (TRINO 452)")
    print(f"Répétitions : 1 warmup + {iterations} itérations de mesure")
    print("=" * 70)

    trino = TrinoClient()

    # Load 6 reference queries
    queries_file = PROJECT_ROOT / "sql" / "analytical_queries.sql"
    sql_text = queries_file.read_text(encoding="utf-8")
    raw_blocks = sql_text.split("-- Q")
    queries = []
    for block in raw_blocks:
        if not block.strip():
            continue
        full_block = "-- Q" + block
        lines = full_block.strip().splitlines()
        q_id = lines[0].split(":")[0].replace("--", "").strip()
        q_title = lines[0].split(":", 1)[1].strip() if ":" in lines[0] else q_id
        sql_lines = [l for l in lines if not l.strip().startswith("--")]
        query_sql = "\n".join(sql_lines).strip().rstrip(";")
        if query_sql:
            queries.append({"id": q_id, "title": q_title, "sql": query_sql})

    results = []

    for q in queries:
        q_id = q["id"]
        q_title = q["title"]
        q_sql = q["sql"]

        print(f"\n  [QUERY] {q_id}: {q_title}")

        # Warmup execution
        warmup_start = time.perf_counter()
        warmup_rows = trino.execute_query(q_sql)
        cold_latency_ms = round((time.perf_counter() - warmup_start) * 1000, 2)
        total_rows = len(warmup_rows)

        # Repeated warm trials
        warm_latencies = []
        for i in range(iterations):
            t_start = time.perf_counter()
            _ = trino.execute_query(q_sql)
            t_ms = round((time.perf_counter() - t_start) * 1000, 2)
            warm_latencies.append(t_ms)

        median_ms = round(statistics.median(warm_latencies), 2)
        min_ms = round(min(warm_latencies), 2)
        max_ms = round(max(warm_latencies), 2)
        spread_ms = round(max_ms - min_ms, 2)

        res = {
            "query_id": q_id,
            "title": q_title,
            "cold_latency_ms": cold_latency_ms,
            "warm_median_ms": median_ms,
            "warm_min_ms": min_ms,
            "warm_max_ms": max_ms,
            "warm_spread_ms": spread_ms,
            "rows_returned": total_rows,
        }
        results.append(res)
        print(f"    Cold: {cold_latency_ms} ms | Warm Median: {median_ms} ms (min: {min_ms}, max: {max_ms})")

    # Save to JSON
    json_path = RESULTS_DIR / "sql_benchmark.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n[OK] Résultats bruts JSON sauvegardés dans : {json_path}")

    # Save to CSV
    csv_path = RESULTS_DIR / "sql_benchmark.csv"
    if results:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
            writer.writeheader()
            writer.writerows(results)
    print(f"[OK] Résultats bruts CSV sauvegardés dans : {csv_path}")

    return results


def main():
    specs = get_system_specs()
    specs_path = RESULTS_DIR / "system_specs.json"
    with open(specs_path, "w", encoding="utf-8") as f:
        json.dump(specs, f, indent=2)

    print("=" * 70)
    print("FINLAKE — PROTOCOLE DE BENCHMARK OFFICIEL")
    print(f"Machine hôte : {specs['platform']} ({specs['cpu_count']} CPUs)")
    print(f"Docker :       {specs['docker_version']}")
    print(f"Date :         {specs['timestamp']}")
    print("=" * 70)

    # 1. Ingestion Benchmark
    ingest_file = RESULTS_DIR / "ingestion_benchmark.json"
    if ingest_file.exists() and "--force" not in sys.argv:
        print("\n[INFO] Données d'ingestion existantes détectées dans benchmarks/results/ingestion_benchmark.json. Réutilisation.")
        with open(ingest_file, "r", encoding="utf-8") as f:
            ingest_results = json.load(f)
    else:
        ingest_results = run_all_ingestion_benchmarks(sample_size=20000)

    # 2. Resync Trino metadata before query benchmark
    trino = TrinoClient()
    trino.execute("CALL hive.system.sync_partition_metadata(schema_name => 'finlake_curated', table_name => 'transactions', mode => 'FULL')")

    # 3. SQL Analytics Benchmark
    sql_results = run_all_sql_benchmarks(iterations=3)

    print("\n" + "=" * 70)
    print("BENCHMARKS TERMINES AVEC SUCCES!")
    print(f"Fichiers disponibles sous : {RESULTS_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    main()
