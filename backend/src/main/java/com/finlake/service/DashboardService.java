package com.finlake.service;

import com.finlake.controller.HealthController;
import com.finlake.dto.DashboardStatsDTO;
import com.finlake.dto.HealthResponseDTO;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class DashboardService {

    private final HealthController healthController;

    public DashboardService(HealthController healthController) {
        this.healthController = healthController;
    }

    public DashboardStatsDTO getDashboardStats() {
        return getDashboardStats("tenant_acme");
    }

    public DashboardStatsDTO getDashboardStats(String tenantId) {
        HealthResponseDTO health = healthController.getHealth().getBody();
        Map<String, String> baseServices = (health != null && health.services() != null)
            ? health.services()
            : Map.of("sqlserver", "up", "minio", "up", "trino", "up");

        String t = (tenantId != null && !tenantId.isBlank()) ? tenantId.toLowerCase().trim() : "tenant_acme";

        if ("tenant_apex".equals(t)) {
            Map<String, String> apexServices = new LinkedHashMap<>();
            apexServices.put("postgresql", "up");
            apexServices.put("mongodb", "up");
            apexServices.put("redis", "up");
            apexServices.put("minio", baseServices.getOrDefault("minio", "up"));
            apexServices.put("trino", baseServices.getOrDefault("trino", "up"));
            return new DashboardStatsDTO(
                1482910L,
                2965820L,
                "-71.2%",
                "-89.4%",
                apexServices
            );
        } else if ("tenant_nordic".equals(t)) {
            Map<String, String> nordicServices = new LinkedHashMap<>();
            nordicServices.put("kafka", "up");
            nordicServices.put("cassandra", "up");
            nordicServices.put("influxdb", "up");
            nordicServices.put("minio", baseServices.getOrDefault("minio", "up"));
            nordicServices.put("trino", baseServices.getOrDefault("trino", "up"));
            return new DashboardStatsDTO(
                845200L,
                1690400L,
                "-64.8%",
                "-91.0%",
                nordicServices
            );
        }

        // Default: tenant_acme (Acme Payments Global)
        Map<String, String> acmeServices = new LinkedHashMap<>(baseServices);
        acmeServices.putIfAbsent("kafka", "up");
        return new DashboardStatsDTO(
            6362620L,
            16080368L,
            "-68.5%",
            "-92.8%",
            acmeServices
        );
    }
}
