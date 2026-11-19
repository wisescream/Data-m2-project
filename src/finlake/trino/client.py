"""High-performance Trino client for FinLake with connection pooling and transient retry."""

from __future__ import annotations

import os
import json
import time
from typing import Dict, Any, List, Optional, Tuple

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_HTTPX = False


class TrinoClient:
    """Client for executing SQL queries on Trino via its REST API."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        user: str = "finlake",
        catalog: Optional[str] = "hive",
        schema: Optional[str] = "default",
        timeout: int = 90,
    ):
        self.host = host or os.getenv("TRINO_HOST", "127.0.0.1")
        self.port = port or int(os.getenv("TRINO_PORT", "8080"))
        self.user = user
        self.catalog = catalog
        self.schema = schema
        self.timeout = timeout
        self.base_url = f"http://{self.host}:{self.port}"
        self._http_client = httpx.Client(timeout=float(timeout)) if HAS_HTTPX else None

    def close(self):
        """Close internal HTTP client resources cleanly."""
        if self._http_client:
            try:
                self._http_client.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def test_connection(self) -> Dict[str, Any]:
        """Tests connectivity to Trino info endpoint and catalog discovery."""
        info_url = f"{self.base_url}/v1/info"
        try:
            if self._http_client:
                resp = self._http_client.get(info_url)
                data = resp.json()
            else:
                req = urllib.request.Request(info_url)
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))

            return {
                "status": "connected",
                "host": self.host,
                "port": self.port,
                "node_version": data.get("nodeVersion", {}).get("version"),
                "environment": data.get("environment"),
            }
        except Exception as e:
            return {
                "status": "failed",
                "host": self.host,
                "port": self.port,
                "error": str(e),
            }

    def execute(self, sql: str) -> Tuple[List[str], List[List[Any]]]:
        """
        Executes an arbitrary SQL statement against Trino.
        Returns a tuple of (column_names, rows).
        """
        statement_url = f"{self.base_url}/v1/statement"
        headers = {
            "X-Trino-User": self.user,
            "Content-Type": "text/plain",
        }
        if self.catalog:
            headers["X-Trino-Catalog"] = self.catalog
        if self.schema:
            headers["X-Trino-Schema"] = self.schema

        if self._http_client:
            return self._execute_httpx(statement_url, sql, headers)
        else:
            return self._execute_urllib(statement_url, sql, headers)

    def _execute_httpx(self, url: str, sql: str, headers: Dict[str, str]) -> Tuple[List[str], List[List[Any]]]:
        result = {}
        for attempt in range(4):
            try:
                resp = self._http_client.post(url, content=sql.encode("utf-8"), headers=headers)
                if resp.status_code >= 400:
                    raise RuntimeError(f"Trino HTTP error {resp.status_code}: {resp.text}")
                result = resp.json()
                break
            except Exception:
                if attempt == 3:
                    raise
                try:
                    self._http_client.close()
                except Exception:
                    pass
                self._http_client = httpx.Client(timeout=float(self.timeout))
                time.sleep(1.0)

        column_names: List[str] = []
        rows: List[List[Any]] = []
        next_uri = result.get("nextUri")

        while next_uri:
            poll_data = None
            for poll_attempt in range(4):
                try:
                    poll_resp = self._http_client.get(next_uri, headers={"X-Trino-User": self.user})
                    poll_data = poll_resp.json()
                    break
                except Exception:
                    if poll_attempt == 3:
                        raise
                    try:
                        self._http_client.close()
                    except Exception:
                        pass
                    self._http_client = httpx.Client(timeout=float(self.timeout))
                    time.sleep(1.0)

            if not poll_data:
                break

            if "columns" in poll_data and not column_names:
                column_names = [col["name"] for col in poll_data["columns"]]

            if "data" in poll_data:
                rows.extend(poll_data["data"])

            if "error" in poll_data:
                err = poll_data["error"]
                err_msg = err.get("message", "Unknown Trino error")
                err_type = err.get("errorType", "UNKNOWN")
                raise RuntimeError(f"Trino [{err_type}]: {err_msg}")

            next_uri = poll_data.get("nextUri")

        return column_names, rows

    def _execute_urllib(self, url: str, sql: str, headers: Dict[str, str]) -> Tuple[List[str], List[List[Any]]]:
        req = urllib.request.Request(url, data=sql.encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        column_names: List[str] = []
        rows: List[List[Any]] = []
        next_uri = result.get("nextUri")

        while next_uri:
            poll_req = urllib.request.Request(next_uri, headers={"X-Trino-User": self.user})
            with urllib.request.urlopen(poll_req, timeout=self.timeout) as poll_resp:
                poll_data = json.loads(poll_resp.read().decode("utf-8"))

            if "columns" in poll_data and not column_names:
                column_names = [col["name"] for col in poll_data["columns"]]

            if "data" in poll_data:
                rows.extend(poll_data["data"])

            if "error" in poll_data:
                err = poll_data["error"]
                err_msg = err.get("message", "Unknown Trino error")
                err_type = err.get("errorType", "UNKNOWN")
                raise RuntimeError(f"Trino [{err_type}]: {err_msg}")

            next_uri = poll_data.get("nextUri")

        return column_names, rows

    def execute_query(self, sql: str) -> List[Dict[str, Any]]:
        """Executes a query and returns results as a list of column-keyed dictionaries."""
        cols, rows = self.execute(sql)
        return [dict(zip(cols, row)) for row in rows]
