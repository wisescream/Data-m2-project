"""Bounded-memory SQL Server batch extractor using keyset pagination."""

from __future__ import annotations

import os
from typing import Iterator, Optional, Dict, Any
import pymssql
import pyarrow as pa

from src.finlake.ingestion.schema import TRANSACTIONS_ARROW_SCHEMA, step_to_simulated_time


class SQLServerBatchExtractor:
    """
    Streams records from SQL Server in deterministic, bounded-memory batches
    using keyset pagination on ingest_row_id.
    """

    def __init__(
        self,
        server: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        port: Optional[int] = None,
        table_name: str = "dbo.transactions",
        batch_size: int = 50000,
    ):
        self.server = server or os.getenv("SQLSERVER_HOST", "sqlserver")
        self.user = user or os.getenv("SQLSERVER_USER", "sa")
        self.password = password or os.getenv("SQLSERVER_SA_PASSWORD", "FinLake2026!StrongPass#")
        self.database = database or os.getenv("SQLSERVER_DATABASE", "finlake_source")
        self.port = port or int(os.getenv("SQLSERVER_PORT", "1433"))
        self.table_name = table_name
        self.batch_size = max(1, batch_size)

    def extract_batches(
        self,
        start_row_id: int = 0,
        max_rows: Optional[int] = None,
    ) -> Iterator[pa.RecordBatch]:
        """
        Generator yielding PyArrow RecordBatches bounded by batch_size.
        Uses keyset pagination (WHERE ingest_row_id > last_id) for O(1) seeks.
        """
        conn = pymssql.connect(
            server=self.server,
            user=self.user,
            password=self.password,
            database=self.database,
            port=self.port,
            login_timeout=15,
            timeout=120,
        )

        last_id = start_row_id
        total_extracted = 0

        try:
            with conn.cursor() as cursor:
                while True:
                    current_limit = self.batch_size
                    if max_rows is not None:
                        remaining = max_rows - total_extracted
                        if remaining <= 0:
                            break
                        current_limit = min(current_limit, remaining)

                    query = f"""
                        SELECT TOP ({current_limit})
                            ingest_row_id,
                            step,
                            type,
                            amount,
                            nameOrig,
                            oldbalanceOrg,
                            newbalanceOrig,
                            nameDest,
                            oldbalanceDest,
                            newbalanceDest,
                            isFraud,
                            isFlaggedFraud
                        FROM {self.table_name}
                        WHERE ingest_row_id > %s
                        ORDER BY ingest_row_id ASC;
                    """
                    cursor.execute(query, (last_id,))
                    rows = cursor.fetchall()

                    if not rows:
                        break

                    # Transform rows to columnar lists for PyArrow RecordBatch
                    ingest_ids = []
                    steps = []
                    types = []
                    amounts = []
                    name_origs = []
                    oldbalance_orgs = []
                    newbalance_origs = []
                    name_dests = []
                    oldbalance_dests = []
                    newbalance_dests = []
                    is_frauds = []
                    is_flagged_frauds = []
                    event_times = []
                    event_dates = []

                    for row in rows:
                        r_id, r_step, r_type, r_amt, r_n_orig, r_old_orig, r_new_orig, r_n_dest, r_old_dest, r_new_dest, r_fraud, r_flagged = row

                        sim_time, sim_date = step_to_simulated_time(r_step)

                        ingest_ids.append(r_id)
                        steps.append(r_step)
                        types.append(r_type)
                        amounts.append(float(r_amt))
                        name_origs.append(r_n_orig)
                        oldbalance_orgs.append(float(r_old_orig))
                        newbalance_origs.append(float(r_new_orig))
                        name_dests.append(r_n_dest)
                        oldbalance_dests.append(float(r_old_dest))
                        newbalance_dests.append(float(r_new_dest))
                        is_frauds.append(int(r_fraud))
                        is_flagged_frauds.append(int(r_flagged))
                        event_times.append(sim_time)
                        event_dates.append(sim_date)

                    batch = pa.RecordBatch.from_arrays(
                        [
                            pa.array(ingest_ids, type=pa.int64()),
                            pa.array(steps, type=pa.int32()),
                            pa.array(types, type=pa.string()),
                            pa.array(amounts, type=pa.float64()),
                            pa.array(name_origs, type=pa.string()),
                            pa.array(oldbalance_orgs, type=pa.float64()),
                            pa.array(newbalance_origs, type=pa.float64()),
                            pa.array(name_dests, type=pa.string()),
                            pa.array(oldbalance_dests, type=pa.float64()),
                            pa.array(newbalance_dests, type=pa.float64()),
                            pa.array(is_frauds, type=pa.int8()),
                            pa.array(is_flagged_frauds, type=pa.int8()),
                            pa.array(event_times, type=pa.timestamp("us", tz="UTC")),
                            pa.array(event_dates, type=pa.string()),
                        ],
                        schema=TRANSACTIONS_ARROW_SCHEMA,
                    )

                    last_id = ingest_ids[-1]
                    total_extracted += len(rows)

                    yield batch

                    if max_rows is not None and total_extracted >= max_rows:
                        break
        finally:
            conn.close()
