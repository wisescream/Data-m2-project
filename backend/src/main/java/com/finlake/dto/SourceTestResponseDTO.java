package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SourceTestResponseDTO(
    String source_id,
    String status,
    String server_version,
    String database,
    String error
) {}
