package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record DashboardStatsDTO(
    @JsonProperty("total_source_rows") long totalSourceRows,
    @JsonProperty("total_indexed_rows") long totalIndexedRows,
    @JsonProperty("compression_gain") String compressionGain,
    @JsonProperty("partition_pruning_speedup") String partitionPruningSpeedup,
    Map<String, String> services
) {}
