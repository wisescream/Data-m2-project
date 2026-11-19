package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record JobCreateRequestDTO(
    @JsonProperty("source_id") String sourceId,
    @JsonProperty("schema_name") String schemaName,
    String table,
    String format,
    String compression,
    @JsonProperty("batch_size") Integer batchSize,
    @JsonProperty("partition_by") List<String> partitionBy,
    @JsonProperty("max_rows") Long maxRows
) {
    public JobCreateRequestDTO {
        if (sourceId == null) sourceId = "sqlserver-paysim";
        if (schemaName == null) schemaName = "dbo";
        if (table == null) table = "raw_transactions";
        if (format == null) format = "parquet";
        if (compression == null) compression = "snappy";
        if (batchSize == null) batchSize = 50000;
    }
}
