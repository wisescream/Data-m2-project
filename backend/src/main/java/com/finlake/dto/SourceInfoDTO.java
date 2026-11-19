package com.finlake.dto;

public record SourceInfoDTO(
    String id,
    String name,
    String type,
    String host,
    int port,
    String database,
    String description
) {}
