package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record IcebergSnapshotDTO(
    @JsonProperty("snapshot_id") Long snapshotId,
    @JsonProperty("parent_id") Long parentId,
    String operation,
    @JsonProperty("committed_at") String committedAt
) {}
