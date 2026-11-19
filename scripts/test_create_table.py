import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.finlake.trino.client import TrinoClient

client = TrinoClient()

ddl = """
CREATE TABLE IF NOT EXISTS hive.finlake_curated.transactions (
    ingest_row_id BIGINT,
    step INTEGER,
    type VARCHAR,
    amount DOUBLE,
    name_orig VARCHAR,
    oldbalance_org DOUBLE,
    newbalance_orig DOUBLE,
    name_dest VARCHAR,
    oldbalance_dest DOUBLE,
    newbalance_dest DOUBLE,
    is_fraud TINYINT,
    is_flagged_fraud TINYINT,
    event_time_simulated TIMESTAMP(3),
    event_date VARCHAR
)
WITH (
    format = 'PARQUET',
    partitioned_by = ARRAY['event_date'],
    external_location = 's3a://finlake/curated/paysim/transactions/'
)
"""

print("Creating table hive.finlake_curated.transactions...")
try:
    cols, data = client.execute(ddl)
    print("Success! Result:", cols, data)
except Exception as e:
    print("Error:", e)
