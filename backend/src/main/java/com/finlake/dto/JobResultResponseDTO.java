package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record JobResultResponseDTO(
    @JsonProperty("job_id") String jobId,
    @JsonProperty("run_id") String runId,
    String status,
    @JsonProperty("total_rows_extracted") long totalRowsExtracted,
    @JsonProperty("total_bytes_written") long totalBytesWritten,
    @JsonProperty("total_objects_created") int totalObjectsCreated,
    @JsonProperty("manifest_path") String manifestPath,
    Map<String, Object> manifest,
    @JsonProperty("duration_seconds") Double durationSeconds,
    @JsonProperty("started_at") String startedAt,
    @JsonProperty("completed_at") String completedAt,
    @JsonProperty("error_message") String errorMessage
) {}
