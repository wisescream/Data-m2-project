package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public record QueryRequestDTO(
    String query,
    String catalog,
    String schema,
    @JsonProperty("max_rows") Integer maxRows
) {
    public QueryRequestDTO {
        if (catalog == null) catalog = "hive";
        if (schema == null) schema = "default";
        if (maxRows == null) maxRows = 1000;
    }
}
