"""
FinLake Schema Explorer Module.

Implements source exploration requirement F-03:
- Lists accessible schemas and tables.
- Describes table schema: column names, data types, nullability, ordinal positions, PKs.
- Safely validates identifiers to prevent SQL injection.
"""
import re
from typing import Any, Optional
from src.finlake.db.connector import SQLServerConnector

# Safe SQL identifier pattern (letters, digits, underscores)
SAFE_IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


class SchemaExplorer:
    """Explores SQL Server schemas, tables, and column metadata safely."""

    def __init__(self, connector: Optional[SQLServerConnector] = None):
        self.connector = connector or SQLServerConnector()

    @staticmethod
    def validate_identifier(name: str) -> str:
        """Validate an identifier to prevent SQL injection."""
        if not SAFE_IDENTIFIER_REGEX.match(name):
            raise ValueError(f"Invalid SQL identifier: '{name}'. Must match [a-zA-Z_][a-zA-Z0-9_]*")
        return name

    def list_schemas(self, database: Optional[str] = None) -> list[str]:
        """List all non-system schemas in the database."""
        sql = """
        SELECT schema_name 
        FROM INFORMATION_SCHEMA.SCHEMATA
        WHERE schema_name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin', 
                                  'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 
                                  'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
        ORDER BY schema_name;
        """
        rows = self.connector.execute_query(sql, database=database)
        return [r["schema_name"] for r in rows]

    def list_tables(self, schema: str = "dbo", database: Optional[str] = None) -> list[dict[str, Any]]:
        """List tables in a given schema with their row count estimate."""
        valid_schema = self.validate_identifier(schema)
        sql = """
        SELECT 
            t.TABLE_SCHEMA AS [schema],
            t.TABLE_NAME AS [table],
            t.TABLE_TYPE AS [type]
        FROM INFORMATION_SCHEMA.TABLES t
        WHERE t.TABLE_SCHEMA = %s
        ORDER BY t.TABLE_NAME;
        """
        rows = self.connector.execute_query(sql, params=(valid_schema,), database=database)
        return rows

    def describe_table(
        self, table: str, schema: str = "dbo", database: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Describe table columns: name, data type, nullability, ordinal position, primary key.
        """
        valid_schema = self.validate_identifier(schema)
        valid_table = self.validate_identifier(table)

        # Get column metadata
        col_sql = """
        SELECT 
            c.COLUMN_NAME AS name,
            c.ORDINAL_POSITION AS ordinal_position,
            c.DATA_TYPE AS data_type,
            c.CHARACTER_MAXIMUM_LENGTH AS char_max_length,
            c.NUMERIC_PRECISION AS numeric_precision,
            c.NUMERIC_SCALE AS numeric_scale,
            c.IS_NULLABLE AS is_nullable,
            COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = %s AND c.TABLE_NAME = %s
        ORDER BY c.ORDINAL_POSITION;
        """
        cols = self.connector.execute_query(col_sql, params=(valid_schema, valid_table), database=database)
        if not cols:
            raise ValueError(f"Table '{valid_schema}.{valid_table}' not found in database.")

        # Get Primary Key columns
        pk_sql = """
        SELECT kcu.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_SCHEMA = %s
          AND tc.TABLE_NAME = %s;
        """
        pk_rows = self.connector.execute_query(pk_sql, params=(valid_schema, valid_table), database=database)
        pk_cols = {r["COLUMN_NAME"] for r in pk_rows}

        # Formatted columns list
        columns_detail = []
        for c in cols:
            dt = c["data_type"]
            if dt in ("varchar", "nvarchar", "char"):
                length = c["char_max_length"]
                dt_formatted = f"{dt.upper()}({length if length != -1 else 'MAX'})"
            elif dt in ("decimal", "numeric"):
                dt_formatted = f"{dt.upper()}({c['numeric_precision']},{c['numeric_scale']})"
            else:
                dt_formatted = dt.upper()

            columns_detail.append({
                "name": c["name"],
                "ordinal_position": c["ordinal_position"],
                "data_type": dt_formatted,
                "is_nullable": c["is_nullable"] == "YES",
                "is_primary_key": c["name"] in pk_cols,
                "is_identity": bool(c.get("is_identity", 0)),
            })

        # Exact row count
        count_sql = f"SELECT COUNT(*) AS total_rows FROM [{valid_schema}].[{valid_table}];"
        count_row = self.connector.execute_query(count_sql, database=database)
        total_rows = count_row[0]["total_rows"] if count_row else 0

        return {
            "schema": valid_schema,
            "table": valid_table,
            "total_rows": total_rows,
            "primary_key": list(pk_cols),
            "column_count": len(columns_detail),
            "columns": columns_detail,
        }
