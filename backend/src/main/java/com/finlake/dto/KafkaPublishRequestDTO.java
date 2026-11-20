package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public record KafkaPublishRequestDTO(
    @JsonProperty("topic")
    String topic,

    @JsonProperty("key")
    String key,

    @JsonProperty("payload")
    @NotBlank(message = "payload is required")
    String payload,

    @JsonProperty("source_database_type")
    String sourceDatabaseType,

    @JsonProperty("entity_name")
    String entityName
) {}
