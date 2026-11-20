package com.finlake.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import java.util.List;

public record SourceProbeResponseDTO(
    @JsonProperty("status") String status,
    @JsonProperty("summary") String summary,
    @JsonProperty("server_version") String serverVersion,
    @JsonProperty("response_time_ms") long responseTimeMs,
    @JsonProperty("tested_at") LocalDateTime testedAt,
    @JsonProperty("steps") List<SourceProbeStepDTO> steps,
    @JsonProperty("technical_details") String technicalDetails,
    @JsonProperty("troubleshooting_checklist") List<String> troubleshootingChecklist,
    @JsonProperty("discovered_tables") List<String> discoveredTables
) {
    public SourceProbeResponseDTO(
            String status,
            String summary,
            String serverVersion,
            long responseTimeMs,
            LocalDateTime testedAt,
            List<SourceProbeStepDTO> steps,
            String technicalDetails,
            List<String> troubleshootingChecklist
    ) {
        this(status, summary, serverVersion, responseTimeMs, testedAt, steps, technicalDetails, troubleshootingChecklist, List.of());
    }
}
