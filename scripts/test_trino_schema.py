import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.finlake.trino.client import TrinoClient

client = TrinoClient()
print("Executing CREATE SCHEMA...")
try:
    cols, data = client.execute("CREATE SCHEMA IF NOT EXISTS hive.finlake_curated WITH (location = 's3a://finlake/curated/paysim/')")
    print("Success! Result:", cols, data)
except Exception as e:
    print("Error:", e)
