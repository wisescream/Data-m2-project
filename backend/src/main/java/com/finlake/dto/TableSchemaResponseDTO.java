package com.finlake.dto;

import java.util.List;

public record TableSchemaResponseDTO(
    String source_id,
    String schema_name,
    String table_name,
    long total_rows,
    int column_count,
    List<String> primary_key,
    List<ColumnSchemaDTO> columns
) {}
