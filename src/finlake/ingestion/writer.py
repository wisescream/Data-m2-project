"""Parquet and CSV batch serializers with partitioning and compression control."""

from __future__ import annotations

import io
import os
from typing import Dict, List, Tuple, Optional
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.csv as pacsv
import pyarrow.compute as pc


class ParquetBatchWriter:
    """Serializes PyArrow RecordBatches into Parquet byte streams or files."""

    SUPPORTED_CODECS = {"snappy", "zstd", "none", "gzip"}

    def __init__(
        self,
        compression: str = "snappy",
        partition_col: Optional[str] = "event_date",
        row_group_size: int = 50000,
        run_id: Optional[str] = None,
    ):
        clean_codec = compression.lower()
        if clean_codec not in self.SUPPORTED_CODECS:
            raise ValueError(f"Unsupported compression codec: '{compression}'. Supported: {self.SUPPORTED_CODECS}")
        self.compression = clean_codec
        self.partition_col = partition_col
        self.row_group_size = row_group_size
        self.run_id = run_id

    def serialize_batch(
        self,
        batch: pa.RecordBatch,
        batch_index: int,
    ) -> List[Tuple[str, bytes]]:
        """
        Converts a RecordBatch to one or more (relative_path, bytes) pairs.
        If partitioned, splits by distinct partition values.
        """
        table = pa.Table.from_batches([batch])
        results: List[Tuple[str, bytes]] = []
        prefix = f"{self.run_id}_" if self.run_id else ""

        if self.partition_col and self.partition_col in table.column_names:
            # Group by partition column value
            part_col = table.column(self.partition_col)
            unique_vals = pc.unique(part_col).to_pylist()

            for val in unique_vals:
                mask = pc.equal(part_col, val)
                sub_table = table.filter(mask)

                buf = io.BytesIO()
                pq.write_table(
                    sub_table,
                    buf,
                    compression="NONE" if self.compression == "none" else self.compression.upper(),
                    row_group_size=self.row_group_size,
                )
                filename = f"{prefix}part-{batch_index:05d}.parquet"
                rel_path = f"{self.partition_col}={val}/{filename}"
                results.append((rel_path, buf.getvalue()))
        else:
            # Unpartitioned table
            buf = io.BytesIO()
            pq.write_table(
                table,
                buf,
                compression="NONE" if self.compression == "none" else self.compression.upper(),
                row_group_size=self.row_group_size,
            )
            filename = f"{prefix}part-{batch_index:05d}.parquet"
            results.append((filename, buf.getvalue()))

        return results


class CSVBatchWriter:
    """Serializes PyArrow RecordBatches into CSV byte streams for benchmark comparison."""

    def __init__(
        self,
        partition_col: Optional[str] = None,
        run_id: Optional[str] = None,
    ):
        self.partition_col = partition_col
        self.run_id = run_id

    def serialize_batch(
        self,
        batch: pa.RecordBatch,
        batch_index: int,
    ) -> List[Tuple[str, bytes]]:
        """Converts a RecordBatch to (relative_path, bytes) CSV."""
        table = pa.Table.from_batches([batch])
        results: List[Tuple[str, bytes]] = []
        prefix = f"{self.run_id}_" if self.run_id else ""

        if self.partition_col and self.partition_col in table.column_names:
            part_col = table.column(self.partition_col)
            unique_vals = pc.unique(part_col).to_pylist()

            for val in unique_vals:
                mask = pc.equal(part_col, val)
                sub_table = table.filter(mask)
                buf = io.BytesIO()
                pacsv.write_csv(sub_table, buf)
                rel_path = f"{self.partition_col}={val}/{prefix}part-{batch_index:05d}.csv"
                results.append((rel_path, buf.getvalue()))
        else:
            buf = io.BytesIO()
            pacsv.write_csv(table, buf)
            filename = f"{prefix}part-{batch_index:05d}.csv"
            results.append((filename, buf.getvalue()))

        return results
