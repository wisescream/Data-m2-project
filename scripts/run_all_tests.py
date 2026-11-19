"""Unified test runner executing test suites across all phases (P0 to P6)."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def run_command(cmd: list[str], description: str) -> bool:
    print(f"\n>>> Running {description}...")
    print(f"Command: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    time.sleep(1.0)
    if result.returncode != 0:
        print(f"[FAIL] {description} failed with return code {result.returncode}")
        return False
    print(f"[PASS] {description} passed.")
    return True


def main():
    success = True

    # 1. Host test suites (P0, P1, P2)
    host_tests = [
        ([sys.executable, "-m", "unittest", "tests/test_p0_dataset.py", "-v"], "P0 Dataset Tests"),
        ([sys.executable, "-m", "unittest", "tests/test_p1_infra.py", "-v"], "P1 Infrastructure Tests"),
        ([sys.executable, "-m", "unittest", "tests/test_p2_import.py", "-v"], "P2 Import & Database Tests"),
    ]

    for cmd, desc in host_tests:
        if not run_command(cmd, desc):
            success = False

    # 2. Container test suite (P3 Ingestion Engine)
    container_cmd = [
        "docker", "run", "--rm",
        "--network", "finlake-network",
        "-v", f"{PROJECT_ROOT}:/app",
        "finlake-worker:1.0",
        "python", "-m", "unittest", "tests/test_p3_ingestion.py", "-v",
    ]

    if not run_command(container_cmd, "P3 Ingestion Engine (Containerized PyArrow & MinIO)"):
        success = False

    # 3. Host test suites (P4, P5, P6, P7)
    downstream_tests = [
        ([sys.executable, "-m", "unittest", "tests/test_p4_catalog.py", "-v"], "P4 Catalog & Trino SQL Tests"),
        ([sys.executable, "-m", "unittest", "tests/test_p5_api.py", "-v"], "P5 Control Plane API Tests"),
        ([sys.executable, "-m", "pytest", "tests/test_p6_benchmarks.py", "-v"], "P6 Benchmark & Metrics Tests"),
        ([sys.executable, "-m", "unittest", "tests/test_p7_iceberg.py", "-v"], "P7 Apache Iceberg & Dashboards Tests"),
    ]

    for cmd, desc in downstream_tests:
        if not run_command(cmd, desc):
            success = False

    if success:
        print("\n" + "=" * 60)
        print("ALL TESTS (P0, P1, P2, P3, P4, P5, P6, P7) PASSED SUCCESSFULLY!")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("ONE OR MORE TEST SUITES FAILED.")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()
