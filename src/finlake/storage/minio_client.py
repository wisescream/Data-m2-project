"""MinIO S3-compatible client for FinLake data lake."""

from __future__ import annotations

import io
import os
import hashlib
from typing import List, Dict, Any, Optional
from minio import Minio
from minio.error import S3Error


class MinIOStorageClient:
    """Provides safe S3-compatible storage operations against MinIO."""

    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        secure: bool = False,
    ):
        self.endpoint = endpoint or os.getenv("MINIO_ENDPOINT", "minio:9000")
        self.access_key = access_key or os.getenv("MINIO_ROOT_USER", "finlake_admin")
        self.secret_key = secret_key or os.getenv("MINIO_ROOT_PASSWORD", "finlake_secret_key_2026!")
        self.bucket_name = bucket_name or os.getenv("MINIO_BUCKET", "finlake")
        self.secure = secure

        self.client = Minio(
            endpoint=self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure,
        )

    def ensure_bucket_exists(self, bucket_name: Optional[str] = None) -> bool:
        """Verifies that the target bucket exists, creating it if necessary."""
        target_bucket = bucket_name or self.bucket_name
        try:
            if not self.client.bucket_exists(target_bucket):
                self.client.make_bucket(target_bucket)
            return True
        except S3Error as e:
            raise RuntimeError(f"Failed to ensure bucket '{target_bucket}' exists: {e}")

    def upload_bytes(
        self,
        data: bytes,
        object_name: str,
        content_type: str = "application/octet-stream",
        bucket_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Uploads raw bytes as an object and returns metadata (sha256, size, etag)."""
        target_bucket = bucket_name or self.bucket_name
        data_stream = io.BytesIO(data)
        data_len = len(data)
        sha256_hash = hashlib.sha256(data).hexdigest()

        try:
            result = self.client.put_object(
                bucket_name=target_bucket,
                object_name=object_name,
                data=data_stream,
                length=data_len,
                content_type=content_type,
            )
            return {
                "bucket": target_bucket,
                "object_name": object_name,
                "size_bytes": data_len,
                "sha256": sha256_hash,
                "etag": result.etag.strip('"') if result.etag else None,
            }
        except S3Error as e:
            raise RuntimeError(f"Failed to upload object '{object_name}' to '{target_bucket}': {e}")

    def upload_file(
        self,
        local_path: str,
        object_name: str,
        content_type: str = "application/octet-stream",
        bucket_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Uploads a local file to MinIO and returns metadata."""
        target_bucket = bucket_name or self.bucket_name
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")

        file_size = os.path.getsize(local_path)
        sha256_hash = hashlib.sha256()
        with open(local_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256_hash.update(chunk)

        try:
            result = self.client.fput_object(
                bucket_name=target_bucket,
                object_name=object_name,
                file_path=local_path,
                content_type=content_type,
            )
            return {
                "bucket": target_bucket,
                "object_name": object_name,
                "size_bytes": file_size,
                "sha256": sha256_hash.hexdigest(),
                "etag": result.etag.strip('"') if result.etag else None,
            }
        except S3Error as e:
            raise RuntimeError(f"Failed to upload file '{local_path}' to '{object_name}': {e}")

    def get_object_bytes(self, object_name: str, bucket_name: Optional[str] = None) -> bytes:
        """Retrieves object content as raw bytes."""
        target_bucket = bucket_name or self.bucket_name
        response = None
        try:
            response = self.client.get_object(target_bucket, object_name)
            return response.read()
        except S3Error as e:
            raise RuntimeError(f"Failed to read object '{object_name}' from '{target_bucket}': {e}")
        finally:
            if response:
                response.close()
                response.release_conn()

    def list_objects(
        self,
        prefix: str = "",
        recursive: bool = True,
        bucket_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists objects under a prefix with their size and last modified date."""
        target_bucket = bucket_name or self.bucket_name
        results = []
        try:
            objects = self.client.list_objects(target_bucket, prefix=prefix, recursive=recursive)
            for obj in objects:
                if not obj.is_dir:
                    results.append({
                        "object_name": obj.object_name,
                        "size_bytes": obj.size,
                        "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                        "etag": obj.etag.strip('"') if obj.etag else None,
                    })
            return results
        except S3Error as e:
            raise RuntimeError(f"Failed to list objects with prefix '{prefix}': {e}")

    def copy_object(
        self,
        source_object: str,
        dest_object: str,
        bucket_name: Optional[str] = None,
    ) -> None:
        """Copies an object within the same bucket."""
        from minio.commonconfig import CopySource
        target_bucket = bucket_name or self.bucket_name
        try:
            self.client.copy_object(
                bucket_name=target_bucket,
                object_name=dest_object,
                source=CopySource(target_bucket, source_object),
            )
        except S3Error as e:
            raise RuntimeError(f"Failed to copy '{source_object}' to '{dest_object}': {e}")

    def delete_object(self, object_name: str, bucket_name: Optional[str] = None) -> None:
        """Deletes a single object from MinIO."""
        target_bucket = bucket_name or self.bucket_name
        try:
            self.client.remove_object(target_bucket, object_name)
        except S3Error as e:
            raise RuntimeError(f"Failed to delete object '{object_name}': {e}")

    def promote_staging_to_curated(
        self,
        staging_prefix: str,
        curated_prefix: str,
        bucket_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Promotes objects from staging prefix to curated prefix atomically per object.
        Returns the list of promoted objects with their new curated paths.
        """
        target_bucket = bucket_name or self.bucket_name
        staged_objects = self.list_objects(prefix=staging_prefix, recursive=True, bucket_name=target_bucket)
        if not staged_objects:
            raise RuntimeError(f"No objects found in staging prefix '{staging_prefix}' to promote.")

        promoted = []
        # Ensure trailing slash normalization
        stg_pref = staging_prefix if staging_prefix.endswith("/") else staging_prefix + "/"
        cur_pref = curated_prefix if curated_prefix.endswith("/") else curated_prefix + "/"

        for obj in staged_objects:
            rel_path = obj["object_name"][len(stg_pref):]
            dest_key = cur_pref + rel_path
            self.copy_object(obj["object_name"], dest_key, bucket_name=target_bucket)
            # Remove from staging after copy
            self.delete_object(obj["object_name"], bucket_name=target_bucket)
            promoted.append({
                "source_staging": obj["object_name"],
                "curated_path": dest_key,
                "size_bytes": obj["size_bytes"],
                "etag": obj["etag"],
            })

        return promoted
