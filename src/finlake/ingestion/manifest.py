"""Ingestion manifest definition, serialization, and validation."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone


@dataclass
class ManifestObject:
    path: str
    size_bytes: int
    sha256: str
    etag: Optional[str] = None


@dataclass
class IngestionManifest:
    job_id: str
    run_id: str
    source_table: str
    format: str
    compression: str
    partition_by: Optional[str]
    row_count_total: int
    bytes_total: int
    objects_count: int
    objects: List[Dict[str, Any]]
    started_at: str
    completed_at: str
    duration_seconds: float
    status: str

    def to_json(self, indent: int = 2) -> str:
        """Serializes manifest to JSON string."""
        return json.dumps(asdict(self), indent=indent, default=str)

    @classmethod
    def from_json(cls, json_str: str) -> IngestionManifest:
        """Deserializes manifest from JSON string."""
        data = json.loads(json_str)
        return cls(**data)

    def validate(self) -> None:
        """Validates internal consistency of the manifest."""
        if self.objects_count != len(self.objects):
            raise ValueError(
                f"Manifest objects_count ({self.objects_count}) does not match length of objects ({len(self.objects)})"
            )

        calculated_bytes = sum(obj["size_bytes"] for obj in self.objects)
        if self.bytes_total != calculated_bytes:
            raise ValueError(
                f"Manifest bytes_total ({self.bytes_total}) does not match sum of object sizes ({calculated_bytes})"
            )

        if self.row_count_total < 0:
            raise ValueError(f"Invalid row_count_total: {self.row_count_total}")

        if not self.objects:
            raise ValueError("Manifest contains no objects.")
