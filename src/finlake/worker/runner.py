"""CLI runner for FinLake Ingestion Worker."""

from __future__ import annotations

import argparse
import sys
import json
from src.finlake.ingestion.pipeline import IngestionPipeline


def parse_args(args=None):
    parser = argparse.ArgumentParser(description="FinLake Ingestion Worker")
    parser.add_argument("--job-id", type=str, default=None, help="Identifier for the ingestion job")
    parser.add_argument("--format", type=str, default="parquet", choices=["parquet", "csv"], help="Target file format")
    parser.add_argument("--compression", type=str, default="snappy", choices=["snappy", "zstd", "none", "gzip"], help="Compression codec")
    parser.add_argument("--batch-size", type=int, default=50000, help="Number of rows per batch extraction")
    parser.add_argument("--partition-by", type=str, default="event_date", help="Partition column (e.g. event_date or none)")
    parser.add_argument("--max-rows", type=int, default=None, help="Maximum rows to extract (for testing/benchmarks)")
    parser.add_argument("--start-row-id", type=int, default=0, help="Starting ingest_row_id for incremental/restart extraction")
    return parser.parse_args(args)


def main():
    args = parse_args()
    partition_col = None if args.partition_by.lower() in ("none", "null", "") else args.partition_by

    pipeline = IngestionPipeline(
        job_id=args.job_id,
        output_format=args.format,
        compression=args.compression,
        batch_size=args.batch_size,
        partition_by=partition_col,
    )

    print("=" * 60)
    print("FINLAKE INGESTION WORKER")
    print(f"Format:       {args.format.upper()}")
    print(f"Compression:  {args.compression.upper()}")
    print(f"Batch Size:   {args.batch_size}")
    print(f"Partition:    {partition_col or 'UNPARTITIONED'}")
    print(f"Max Rows:     {args.max_rows or 'ALL'}")
    print("=" * 60)

    try:
        manifest = pipeline.run(
            start_row_id=args.start_row_id,
            max_rows=args.max_rows,
        )
        print("\n[SUCCESS] Ingestion completed successfully!")
        print(f"Run ID:           {manifest.run_id}")
        print(f"Rows Extracted:   {manifest.row_count_total:,}")
        print(f"Objects Created:  {manifest.objects_count}")
        print(f"Total Bytes:      {manifest.bytes_total:,} bytes")
        print(f"Duration:         {manifest.duration_seconds:.2f} s")
        print("=" * 60)
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] Ingestion job failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
