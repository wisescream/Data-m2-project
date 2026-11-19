package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record LoginResponseDTO(
    String token,
    @JsonProperty("user") UserInfoDTO user
) {
    public record UserInfoDTO(
        String id,
        String username,
        @JsonProperty("full_name") String fullName,
        String email,
        String role,
        @JsonProperty("tenant_id") String tenantId,
        @JsonProperty("tenant_name") String tenantName,
        @JsonProperty("assigned_catalog") String assignedCatalog,
        @JsonProperty("assigned_schema") String assignedSchema,
        @JsonProperty("can_view_pii") boolean canViewPii
    ) {}
}
