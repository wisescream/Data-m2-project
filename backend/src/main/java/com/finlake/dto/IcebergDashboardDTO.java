package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record IcebergDashboardDTO(
    String status,
    String table,
    @JsonProperty("total_rows") long totalRows,
    @JsonProperty("snapshots_count") int snapshotsCount,
    List<IcebergSnapshotDTO> snapshots,
    String error
) {}
