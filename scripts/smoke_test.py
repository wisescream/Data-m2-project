#!/usr/bin/env python3
"""
FinLake P1 — Infrastructure Smoke Test.

Validates that all Docker Compose services are up, healthy, and accessible:
1. SQL Server (port 1433)
2. MinIO API (port 9000) & Console (port 9001)
3. PostgreSQL Metastore DB (port 5433)
4. Hive Metastore Thrift (port 9083)
5. Trino Distributed SQL Engine (port 8080)

Usage:
    python scripts/smoke_test.py
"""
import os
import socket
import sys
import time
import urllib.request
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Read .env if present
env_path = PROJECT_ROOT / ".env"
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

SQLSERVER_PORT = int(os.environ.get("SQLSERVER_PORT", "1433"))
MINIO_PORT = int(os.environ.get("MINIO_PORT", "9000"))
MINIO_CONSOLE_PORT = int(os.environ.get("MINIO_CONSOLE_PORT", "9001"))
METASTORE_DB_PORT = int(os.environ.get("METASTORE_DB_PORT", "5433"))
HIVE_METASTORE_PORT = int(os.environ.get("HIVE_METASTORE_PORT", "9083"))
TRINO_PORT = int(os.environ.get("TRINO_PORT", "8080"))


def check_tcp_port(host: str, port: int, timeout: float = 3.0) -> bool:
    """Test TCP socket connectivity."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        s.close()
        return True
    except Exception:
        return False


def check_http_endpoint(url: str, timeout: float = 3.0) -> tuple[bool, int, str]:
    """Test HTTP endpoint status."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FinLake-SmokeTest/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            return True, resp.status, content[:200]
    except urllib.error.HTTPError as e:
        return True, e.code, str(e)
    except Exception as e:
        return False, 0, str(e)


def main():
    print("=" * 65)
    print("  FinLake — Phase P1 Infrastructure Smoke Test")
    print("=" * 65)

    checks = []

    # 1. SQL Server
    print(f"\n[1/5] Testing SQL Server (127.0.0.1:{SQLSERVER_PORT})...")
    sql_ok = check_tcp_port("127.0.0.1", SQLSERVER_PORT)
    status_str = "✅ CONNECTED" if sql_ok else "❌ UNREACHABLE"
    print(f"      TCP Port {SQLSERVER_PORT}: {status_str}")
    checks.append(("SQL Server (1433)", sql_ok))

    # 2. MinIO
    print(f"\n[2/5] Testing MinIO S3 API (127.0.0.1:{MINIO_PORT})...")
    minio_tcp = check_tcp_port("127.0.0.1", MINIO_PORT)
    minio_http, code, _ = check_http_endpoint(f"http://127.0.0.1:{MINIO_PORT}/minio/health/live")
    minio_ok = minio_tcp and (code == 200 or minio_http)
    print(f"      TCP Port {MINIO_PORT}: {'✅ CONNECTED' if minio_tcp else '❌ UNREACHABLE'}")
    print(f"      Health Endpoint: {'✅ HTTP ' + str(code) if minio_http else '❌ FAILED'}")
    checks.append(("MinIO S3 (9000)", minio_ok))

    # 3. Metastore DB (PostgreSQL)
    print(f"\n[3/5] Testing Metastore PostgreSQL DB (127.0.0.1:{METASTORE_DB_PORT})...")
    pg_ok = check_tcp_port("127.0.0.1", METASTORE_DB_PORT)
    print(f"      TCP Port {METASTORE_DB_PORT}: {'✅ CONNECTED' if pg_ok else '❌ UNREACHABLE'}")
    checks.append(("Metastore DB (5433)", pg_ok))

    # 4. Hive Metastore Thrift
    print(f"\n[4/5] Testing Hive Metastore Thrift (127.0.0.1:{HIVE_METASTORE_PORT})...")
    hms_ok = check_tcp_port("127.0.0.1", HIVE_METASTORE_PORT)
    print(f"      Thrift Port {HIVE_METASTORE_PORT}: {'✅ CONNECTED' if hms_ok else '❌ UNREACHABLE'}")
    checks.append(("Hive Metastore (9083)", hms_ok))

    # 5. Trino
    print(f"\n[5/5] Testing Trino SQL Engine (127.0.0.1:{TRINO_PORT})...")
    trino_tcp = check_tcp_port("127.0.0.1", TRINO_PORT)
    trino_http, t_code, t_content = check_http_endpoint(f"http://127.0.0.1:{TRINO_PORT}/v1/info")
    trino_ok = trino_tcp and trino_http and (t_code == 200)
    version_info = ""
    if trino_ok:
        try:
            info = json.loads(t_content)
            version_info = f" (version: {info.get('nodeVersion', {}).get('version', 'unknown')})"
        except Exception:
            pass
    print(f"      TCP Port {TRINO_PORT}: {'✅ CONNECTED' if trino_tcp else '❌ UNREACHABLE'}")
    print(f"      Trino Info API: {'✅ HTTP 200' + version_info if trino_ok else '❌ FAILED'}")
    checks.append(("Trino SQL Engine (8080)", trino_ok))

    # Summary
    print("\n" + "=" * 65)
    print("  Infrastructure Smoke Test Summary")
    print("=" * 65)
    all_ok = True
    for name, res in checks:
        badge = "✅ PASS" if res else "❌ FAIL"
        if not res:
            all_ok = False
        print(f"  {name:<30} {badge}")
    print("=" * 65)

    if all_ok:
        print("\n[OK] All Phase P1 infrastructure services are verified and operational.")
        sys.exit(0)
    else:
        print("\n[WARNING] Some services are not yet operational. Check docker compose logs.")
        sys.exit(1)


if __name__ == "__main__":
    main()
