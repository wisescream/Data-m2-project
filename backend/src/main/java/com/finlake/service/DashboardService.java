package com.finlake.service;

import com.finlake.controller.HealthController;
import com.finlake.dto.DashboardStatsDTO;
import com.finlake.dto.HealthResponseDTO;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class DashboardService {

    private final HealthController healthController;

    public DashboardService(HealthController healthController) {
        this.healthController = healthController;
    }

    public DashboardStatsDTO getDashboardStats() {
        HealthResponseDTO health = healthController.getHealth().getBody();
        Map<String, String> services = (health != null && health.services() != null)
            ? health.services()
            : Map.of("sqlserver", "unknown", "minio", "unknown", "trino", "unknown");

        return new DashboardStatsDTO(
            6362620L,
            16080368L,
            "-68.5%",
            "-92.8%",
            services
        );
    }
}
