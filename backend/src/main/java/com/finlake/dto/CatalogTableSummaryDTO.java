package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record CatalogTableSummaryDTO(
    String id,
    String name,
    String catalog,
    String schema,
    String domain,
    String description,
    @JsonProperty("storage_format") String storageFormat,
    @JsonProperty("storage_layer") String storageLayer,
    @JsonProperty("total_rows") long totalRows,
    @JsonProperty("column_count") int columnCount,
    @JsonProperty("freshness_status") String freshnessStatus,
    @JsonProperty("last_updated") String lastUpdated,
    List<String> tags
) {}
