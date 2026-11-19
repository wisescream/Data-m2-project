package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record CatalogColumnDTO(
    String name,
    String type,
    String description,
    @JsonProperty("is_primary_key") boolean isPrimaryKey,
    @JsonProperty("is_foreign_key") boolean isForeignKey,
    String references,
    @JsonProperty("pii_classification") String piiClassification,
    @JsonProperty("sample_values") List<String> sampleValues
) {}

