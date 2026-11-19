package com.finlake.dto;

import java.util.Map;

public record HealthResponseDTO(
        String status,
        Map<String, String> services,
        String timestamp
) {}
