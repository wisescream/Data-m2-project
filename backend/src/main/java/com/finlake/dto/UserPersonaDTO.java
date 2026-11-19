package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record UserPersonaDTO(
    String id,
    String username,
    @JsonProperty("full_name") String fullName,
    String email,
    @JsonProperty("tenant_id") String tenantId,
    String role, // ADMIN, DATA_ENGINEER, ANALYST, AUDITOR
    List<String> permissions,
    @JsonProperty("can_view_pii") boolean canViewPii,
    @JsonProperty("can_manage_pipelines") boolean canManagePipelines,
    @JsonProperty("can_view_iceberg_snapshots") boolean canViewIcebergSnapshots
) {}
