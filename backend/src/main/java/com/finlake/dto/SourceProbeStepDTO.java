package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SourceProbeStepDTO(
    @JsonProperty("id") int id,
    @JsonProperty("name") String name,
    @JsonProperty("detail") String detail,
    @JsonProperty("status") String status
) {}
