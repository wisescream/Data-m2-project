"""Unit and integration tests for Phase P6 (Benchmarks & Performance Report)."""

import json
import csv
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = PROJECT_ROOT / "benchmarks" / "results"
REPORT_PATH = PROJECT_ROOT / "docs" / "benchmark_report.md"


def test_system_specs_exists_and_valid():
    specs_file = RESULTS_DIR / "system_specs.json"
    assert specs_file.exists(), "system_specs.json must exist in benchmarks/results"
    with open(specs_file, "r", encoding="utf-8") as f:
        specs = json.load(f)
    assert "cpu_count" in specs and specs["cpu_count"] > 0
    assert "platform" in specs
    assert "docker_version" in specs
    assert "timestamp" in specs


def test_ingestion_benchmark_json_and_csv_exist():
    json_path = RESULTS_DIR / "ingestion_benchmark.json"
    csv_path = RESULTS_DIR / "ingestion_benchmark.csv"
    assert json_path.exists(), "ingestion_benchmark.json must exist"
    assert csv_path.exists(), "ingestion_benchmark.csv must exist"

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) >= 7, "Must contain at least 7 ingestion scenarios"

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    assert len(reader) >= 7, "CSV must contain at least 7 scenario rows"


def test_ingestion_compression_ranking():
    """Verify physical storage hierarchy: Zstd < Snappy < Uncompressed Parquet < CSV."""
    with open(RESULTS_DIR / "ingestion_benchmark.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    b10k_scenarios = {s["scenario_id"]: s["bytes_written"] for s in data if s["batch_size"] == 10000}
    assert "ingest_parquet_zstd_b10000" in b10k_scenarios
    assert "ingest_parquet_snappy_b10000" in b10k_scenarios
    assert "ingest_parquet_none_b10000" in b10k_scenarios
    assert "ingest_csv_none_b10000" in b10k_scenarios

    zstd_bytes = b10k_scenarios["ingest_parquet_zstd_b10000"]
    snappy_bytes = b10k_scenarios["ingest_parquet_snappy_b10000"]
    none_bytes = b10k_scenarios["ingest_parquet_none_b10000"]
    csv_bytes = b10k_scenarios["ingest_csv_none_b10000"]

    assert zstd_bytes < snappy_bytes, f"Zstd ({zstd_bytes}) should be smaller than Snappy ({snappy_bytes})"
    assert snappy_bytes < none_bytes, f"Snappy ({snappy_bytes}) should be smaller than Parquet None ({none_bytes})"
    assert none_bytes < csv_bytes, f"Parquet None ({none_bytes}) should be smaller than CSV ({csv_bytes})"


def test_ingestion_batch_size_tradeoff():
    """Verify small batch size creates more objects than larger batch size."""
    with open(RESULTS_DIR / "ingestion_benchmark.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    b1k = next(s for s in data if s["scenario_id"] == "ingest_parquet_snappy_b1000")
    b20k = next(s for s in data if s["scenario_id"] == "ingest_parquet_snappy_b20000")

    assert b1k["objects_count"] > b20k["objects_count"], "Batch 1k must produce more partition objects than batch 20k"
    assert b20k["throughput_rows_sec"] >= b1k["throughput_rows_sec"], "Batch 20k should have higher throughput than batch 1k"


def test_sql_benchmark_results_exist():
    json_path = RESULTS_DIR / "sql_benchmark.json"
    csv_path = RESULTS_DIR / "sql_benchmark.csv"
    assert json_path.exists(), "sql_benchmark.json must exist"
    assert csv_path.exists(), "sql_benchmark.csv must exist"

    with open(json_path, "r", encoding="utf-8") as f:
        queries = json.load(f)
    assert len(queries) == 6, f"Expected 6 SQL queries benchmarked, got {len(queries)}"

    q_ids = [q["query_id"] for q in queries]
    assert q_ids == ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]

    for q in queries:
        assert q["cold_latency_ms"] > 0, f"Query {q['query_id']} must have positive cold latency"
        assert q["warm_median_ms"] > 0, f"Query {q['query_id']} must have positive warm latency"
        assert q["rows_returned"] > 0, f"Query {q['query_id']} must return at least 1 row"


def test_sql_partition_pruning_performance():
    """Verify that Q4 (pruned partition filter) has lower warm latency than Q1 (full table scan)."""
    with open(RESULTS_DIR / "sql_benchmark.json", "r", encoding="utf-8") as f:
        queries = {q["query_id"]: q for q in json.load(f)}

    q1_warm = queries["Q1"]["warm_median_ms"]
    q4_warm = queries["Q4"]["warm_median_ms"]

    assert q4_warm < q1_warm, f"Partition-pruned query Q4 ({q4_warm}ms) must be faster than full scan Q1 ({q1_warm}ms)"


def test_benchmark_report_content():
    """Verify that docs/benchmark_report.md exists and documents the experimental findings."""
    assert REPORT_PATH.exists(), "docs/benchmark_report.md must exist"
    text = REPORT_PATH.read_text(encoding="utf-8")
    assert "Protocole Expérimental" in text
    assert "Ingestion" in text
    assert "Trino" in text
    assert "Partition Pruning" in text
    assert "Zstandard" in text
