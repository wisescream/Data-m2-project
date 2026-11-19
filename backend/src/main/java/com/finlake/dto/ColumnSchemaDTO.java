package com.finlake.dto;

public record ColumnSchemaDTO(
    String name,
    String type,
    boolean nullable,
    boolean is_primary_key,
    boolean is_identity
) {}
