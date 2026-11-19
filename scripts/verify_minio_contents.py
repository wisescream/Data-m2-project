"""Verify objects in MinIO curated and manifest prefixes."""

import json
from src.finlake.storage.minio_client import MinIOStorageClient

def main():
    client = MinIOStorageClient()
    print("--- CURATED OBJECTS ---")
    curated = client.list_objects(prefix="curated/")
    for obj in curated:
        print(f"  {obj['object_name']} ({obj['size_bytes']} bytes)")

    print("\n--- MANIFEST OBJECTS ---")
    manifests = client.list_objects(prefix="manifests/")
    for obj in manifests:
        print(f"  {obj['object_name']} ({obj['size_bytes']} bytes)")
        content = client.get_object_bytes(obj['object_name']).decode('utf-8')
        data = json.loads(content)
        print(f"    Status: {data.get('status')}, Rows: {data.get('row_count_total')}, Duration: {data.get('duration_seconds')}s")

if __name__ == "__main__":
    main()
