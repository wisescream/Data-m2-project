package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record JobStatusResponseDTO(
    @JsonProperty("job_id") String jobId,
    @JsonProperty("source_id") String sourceId,
    @JsonProperty("schema_name") String schemaName,
    @JsonProperty("table_name") String tableName,
    String format,
    String compression,
    @JsonProperty("batch_size") int batchSize,
    @JsonProperty("partition_columns") String partitionColumns,
    String status,
    @JsonProperty("created_at") String createdAt,
    @JsonProperty("updated_at") String updatedAt,
    @JsonProperty("latest_run") JobRunDTO latestRun
) {}
