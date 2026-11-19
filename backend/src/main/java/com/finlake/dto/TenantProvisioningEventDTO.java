package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record TenantProvisioningEventDTO(
    @JsonProperty("event_id") long eventId,
    @JsonProperty("tenant_id") String tenantId,
    @JsonProperty("step") String step,
    @JsonProperty("status") String status,
    @JsonProperty("details") String details,
    @JsonProperty("created_at") LocalDateTime createdAt
) {}
