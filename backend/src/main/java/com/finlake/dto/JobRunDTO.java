package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record JobRunDTO(
    @JsonProperty("run_id") String runId,
    @JsonProperty("job_id") String jobId,
    String status,
    @JsonProperty("total_rows_extracted") long totalRowsExtracted,
    @JsonProperty("total_bytes_written") long totalBytesWritten,
    @JsonProperty("total_objects_created") int totalObjectsCreated,
    @JsonProperty("manifest_path") String manifestPath,
    @JsonProperty("error_message") String errorMessage,
    @JsonProperty("started_at") String startedAt,
    @JsonProperty("completed_at") String completedAt
) {}
