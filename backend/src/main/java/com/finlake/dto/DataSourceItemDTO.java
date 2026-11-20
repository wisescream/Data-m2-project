package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record DataSourceItemDTO(
    @JsonProperty("id") String id,
    @JsonProperty("name") String name,
    @JsonProperty("type") String type,
    @JsonProperty("host") String host,
    @JsonProperty("port") int port,
    @JsonProperty("database") String database,
    @JsonProperty("status") String status,
    @JsonProperty("status_hint") String statusHint,
    @JsonProperty("last_tested") LocalDateTime lastTested,
    @JsonProperty("server_version") String serverVersion
) {}
