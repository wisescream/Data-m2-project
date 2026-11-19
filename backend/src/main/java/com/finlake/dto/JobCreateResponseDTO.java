package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record JobCreateResponseDTO(
    @JsonProperty("job_id") String jobId,
    String status,
    String message,
    @JsonProperty("created_at") String createdAt
) {}
