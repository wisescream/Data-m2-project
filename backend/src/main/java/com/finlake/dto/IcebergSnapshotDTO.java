package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record IcebergSnapshotDTO(
    @JsonProperty("snapshot_id") String snapshotId,
    @JsonProperty("parent_id") String parentId,
    String operation,
    @JsonProperty("committed_at") String committedAt
) {}
