package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record TenantCreateRequestDTO(
    @JsonProperty("tenant_id")
    @NotBlank(message = "tenant_id is required")
    @Pattern(regexp = "^[a-z0-9_]{3,32}$", message = "tenant_id must be 3-32 lowercase alphanumeric or underscore characters")
    String tenantId,

    @JsonProperty("display_name")
    @NotBlank(message = "display_name is required")
    String displayName,

    @JsonProperty("isolation_tier")
    @NotBlank(message = "isolation_tier is required")
    @Pattern(regexp = "^(?i)(silo|bridge|pool)$", message = "isolation_tier must be 'silo', 'bridge', or 'pool'")
    String isolationTier,

    @JsonProperty("vertical")
    @NotBlank(message = "vertical is required")
    @Pattern(regexp = "^(?i)(banking|retail|insurance|healthcare|telco|general)$", message = "vertical must be a recognized industry vertical")
    String vertical,

    @JsonProperty("anon_profile_id")
    String anonProfileId
) {}
