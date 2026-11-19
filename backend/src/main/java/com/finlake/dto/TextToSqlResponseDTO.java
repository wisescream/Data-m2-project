package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TextToSqlResponseDTO(
    String sql,
    String explanation,
    String catalog,
    String schema,
    @JsonProperty("suggested_chart") String suggestedChart,
    @JsonProperty("suggested_x") String suggestedX,
    @JsonProperty("suggested_y") String suggestedY
) {}
