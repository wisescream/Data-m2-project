package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record CatalogTableDetailDTO(
    @JsonProperty("table_summary") CatalogTableSummaryDTO tableSummary,
    List<CatalogColumnDTO> columns,
    @JsonProperty("sample_queries") List<SampleQueryDTO> sampleQueries,
    @JsonProperty("lineage_upstream") List<String> lineageUpstream,
    @JsonProperty("lineage_downstream") List<String> lineageDownstream
) {
    public record SampleQueryDTO(
        String title,
        String sql,
        String description
    ) {}
}
