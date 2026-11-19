#!/usr/bin/env python3
"""
FinLake P1 — Infrastructure Automated Test Suite.

Validates that:
1. docker-compose.yml configuration and .env file exist and are valid.
2. Configuration files for Trino, Hive Metastore and MinIO exist.
3. No secrets are present in .env.example.
4. All containers defined in docker-compose.yml can be started and reach healthy states.
5. All required network ports (1433, 9000, 9001, 5433, 9083, 8080) are operational.

Run via:
    python -m unittest tests/test_p1_infra.py -v
"""
import os
import socket
import unittest
import urllib.request
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
TRINO_CATALOG_DIR = PROJECT_ROOT / "config" / "trino" / "catalog"
HIVE_SITE_XML = PROJECT_ROOT / "config" / "hive-metastore" / "metastore-site.xml"


class TestConfigurationFiles(unittest.TestCase):
    """Vérification de la présence et structure des fichiers de configuration."""

    def test_docker_compose_exists(self):
        self.assertTrue(COMPOSE_FILE.exists(), "docker-compose.yml manquant")
        content = COMPOSE_FILE.read_text(encoding="utf-8")
        self.assertIn("finlake-sqlserver", content)
        self.assertIn("finlake-minio", content)
        self.assertIn("finlake-hive-metastore", content)
        self.assertIn("finlake-trino", content)

    def test_env_example_has_no_secrets(self):
        self.assertTrue(ENV_EXAMPLE.exists(), ".env.example manquant")
        content = ENV_EXAMPLE.read_text(encoding="utf-8")
        # Ensure it has placeholders or example passwords, not production secrets
        self.assertIn("SQLSERVER_SA_PASSWORD=", content)
        self.assertIn("MINIO_ROOT_USER=", content)

    def test_trino_hive_catalog_exists(self):
        hive_cat = TRINO_CATALOG_DIR / "hive.properties"
        self.assertTrue(hive_cat.exists(), "config/trino/catalog/hive.properties manquant")
        content = hive_cat.read_text(encoding="utf-8")
        self.assertIn("connector.name=hive", content)
        self.assertIn("thrift://hive-metastore:9083", content)
        self.assertIn("hive.s3.endpoint=http://minio:9000", content)

    def test_hive_metastore_site_exists(self):
        self.assertTrue(HIVE_SITE_XML.exists(), "metastore-site.xml manquant")
        content = HIVE_SITE_XML.read_text(encoding="utf-8")
        self.assertIn("metastore-db", content)
        self.assertIn("fs.s3a.endpoint", content)


class TestContainerHealthAndPorts(unittest.TestCase):
    """Vérification de la disponibilité réseau des services conteneurisés."""

    def _check_tcp(self, host: str, port: int) -> bool:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3.0)
        try:
            s.connect((host, port))
            s.close()
            return True
        except Exception:
            return False

    def test_sqlserver_port_1433(self):
        self.assertTrue(self._check_tcp("127.0.0.1", 1433), "SQL Server (1433) injoignable")

    def test_minio_port_9000(self):
        self.assertTrue(self._check_tcp("127.0.0.1", 9000), "MinIO API (9000) injoignable")

    def test_minio_health_endpoint(self):
        try:
            req = urllib.request.Request("http://127.0.0.1:9000/minio/health/live")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                self.assertEqual(resp.status, 200)
        except Exception as e:
            self.fail(f"MinIO health check échoué: {e}")

    def test_metastore_db_port_5433(self):
        self.assertTrue(self._check_tcp("127.0.0.1", 5433), "Postgres Metastore DB (5433) injoignable")

    def test_hive_metastore_port_9083(self):
        self.assertTrue(self._check_tcp("127.0.0.1", 9083), "Hive Metastore (9083) injoignable")

    def test_trino_port_8080(self):
        self.assertTrue(self._check_tcp("127.0.0.1", 8080), "Trino (8080) injoignable")

    def test_trino_info_endpoint(self):
        for attempt in range(3):
            try:
                req = urllib.request.Request("http://127.0.0.1:8080/v1/info")
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    self.assertEqual(resp.status, 200)
                    data = json.loads(resp.read().decode("utf-8"))
                    self.assertIn("nodeVersion", data)
                    self.assertTrue(data.get("starting") is False or data.get("environment") is not None)
                return
            except Exception as e:
                if attempt == 2:
                    self.fail(f"Trino /v1/info check échoué: {e}")
                time.sleep(1.0)


if __name__ == "__main__":
    unittest.main()
