"""
FinLake Database Connector Module.

Provides safe, parameterized connection handling to SQL Server using pymssql.
Implements requirement F-01 & F-02 (connection config & testing without credential leakage).
"""
import os
import pymssql
from typing import Any, Optional


class SQLServerConnector:
    """Manages connections to SQL Server instance."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        login_timeout: int = 5,
        timeout: int = 30,
    ):
        self.host = host or os.environ.get("SQLSERVER_HOST", "127.0.0.1")
        self.port = int(port or os.environ.get("SQLSERVER_PORT", "1433"))
        self.user = user or os.environ.get("SQLSERVER_USER", "sa")
        self._password = password or os.environ.get("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
        self.database = database or os.environ.get("SQLSERVER_DATABASE", "finlake_source")
        self.login_timeout = login_timeout
        self.timeout = timeout

    def get_connection(self, database: Optional[str] = None) -> pymssql.Connection:
        """Create and return a new pymssql connection with automatic retry."""
        target_db = database or self.database
        last_exc = None
        for attempt in range(3):
            try:
                return pymssql.connect(
                    server=self.host,
                    port=self.port,
                    user=self.user,
                    password=self._password,
                    database=target_db,
                    login_timeout=self.login_timeout,
                    timeout=self.timeout,
                    as_dict=True,
                )
            except Exception as e:
                last_exc = e
                time.sleep(0.5)
        raise last_exc

    def test_connection(self) -> dict[str, Any]:
        """
        Test the SQL Server connection without exposing the password or full connection string.
        Returns sanitized diagnostic info.
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT @@VERSION AS version, DB_NAME() AS current_db;")
            row = cursor.fetchone()
            conn.close()
            return {
                "status": "connected",
                "host": self.host,
                "port": self.port,
                "user": self.user,
                "database": row["current_db"],
                "server_version": row["version"].split("\n")[0].strip(),
            }
        except Exception as e:
            return {
                "status": "failed",
                "host": self.host,
                "port": self.port,
                "user": self.user,
                "database": self.database,
                "error": str(e),
            }

    def execute_query(
        self, sql: str, params: Optional[tuple] = None, database: Optional[str] = None
    ) -> list[dict[str, Any]]:
        """Safely execute a parameterized query and return list of dict rows."""
        conn = self.get_connection(database=database)
        try:
            cursor = conn.cursor(as_dict=True)
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            rows = cursor.fetchall()
            return rows
        finally:
            conn.close()
