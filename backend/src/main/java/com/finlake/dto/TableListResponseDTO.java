package com.finlake.dto;

import java.util.List;

public record TableListResponseDTO(
    String source_id,
    String schema_name,
    List<String> tables
) {}
