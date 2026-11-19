package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record TenantDTO(
    String id,
    String name,
    String code,
    String tier,
    @JsonProperty("assigned_catalog") String assignedCatalog,
    @JsonProperty("assigned_schema") String assignedSchema,
    @JsonProperty("user_count") int userCount,
    @JsonProperty("created_at") String createdAt,
    List<String> features
) {}
