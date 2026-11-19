package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AuditLogDTO(
    String id,
    @JsonProperty("tenant_id") String tenantId,
    @JsonProperty("user_id") String userId,
    @JsonProperty("user_name") String userName,
    @JsonProperty("user_role") String userRole,
    String sql,
    String catalog,
    String schema,
    @JsonProperty("rows_returned") int rowsReturned,
    @JsonProperty("execution_time_ms") long executionTimeMs,
    @JsonProperty("masking_applied") boolean maskingApplied,
    String timestamp,
    String status
) {}
