package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public record SourceProbeRequestDTO(
    @JsonProperty("connection_name")
    @NotBlank(message = "connection_name is required")
    String connectionName,

    @JsonProperty("type")
    String type,

    @JsonProperty("host")
    @NotBlank(message = "host is required")
    String host,

    @JsonProperty("port")
    Integer port,

    @JsonProperty("database")
    @NotBlank(message = "database is required")
    String database,

    @JsonProperty("auth_method")
    String authMethod,

    @JsonProperty("username")
    @NotBlank(message = "username is required")
    String username,

    @JsonProperty("password")
    String password,

    @JsonProperty("encrypt")
    Boolean encrypt,

    @JsonProperty("trust_server_certificate")
    Boolean trustServerCertificate,

    @JsonProperty("connection_timeout")
    Integer connectionTimeout
) {}
