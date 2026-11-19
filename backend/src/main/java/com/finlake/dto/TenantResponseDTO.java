package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record TenantResponseDTO(
    @JsonProperty("tenant_id") String tenantId,
    @JsonProperty("display_name") String displayName,
    @JsonProperty("isolation_tier") String isolationTier,
    @JsonProperty("vertical") String vertical,
    @JsonProperty("anon_profile_id") String anonProfileId,
    @JsonProperty("kms_key_id") String kmsKeyId,
    @JsonProperty("trino_catalog") String trinoCatalog,
    @JsonProperty("s3_bucket") String s3Bucket,
    @JsonProperty("s3_prefix") String s3Prefix,
    @JsonProperty("status") String status,
    @JsonProperty("created_at") LocalDateTime createdAt,
    @JsonProperty("updated_at") LocalDateTime updatedAt
) {}
