package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public record QueryResultDTO(
    List<String> columns,
    List<Map<String, Object>> rows,
    @JsonProperty("row_count") int rowCount,
    @JsonProperty("execution_time_ms") long executionTimeMs,
    String error
) {}
