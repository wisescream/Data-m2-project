package com.finlake.controller;

import com.finlake.dto.HealthResponseDTO;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    private final JdbcTemplate jdbcTemplate;
    private final MinioClient minioClient;
    private final RestTemplate restTemplate;

    @Value("${finlake.minio.bucket:finlake}")
    private String minioBucket;

    @Value("${finlake.trino.host:127.0.0.1}")
    private String trinoHost;

    @Value("${finlake.trino.port:8080}")
    private int trinoPort;

    public HealthController(JdbcTemplate jdbcTemplate, MinioClient minioClient) {
        this.jdbcTemplate = jdbcTemplate;
        this.minioClient = minioClient;
        this.restTemplate = new RestTemplate();
    }

    @GetMapping("/health")
    public ResponseEntity<HealthResponseDTO> getHealth() {
        Map<String, String> services = new LinkedHashMap<>();

        // 1. SQL Server
        try {
            Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            services.put("sqlserver", (result != null && result == 1) ? "up" : "down");
        } catch (Exception e) {
            log.warn("SQL Server health check failed: {}", e.getMessage());
            services.put("sqlserver", "down");
        }

        // 2. MinIO
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(minioBucket).build());
            services.put("minio", "up");
        } catch (Exception e) {
            log.warn("MinIO health check failed: {}", e.getMessage());
            services.put("minio", "down");
        }

        // 3. Trino
        try {
            String trinoUrl = String.format("http://%s:%d/v1/info", trinoHost, trinoPort);
            ResponseEntity<String> trinoResp = restTemplate.getForEntity(trinoUrl, String.class);
            services.put("trino", trinoResp.getStatusCode().is2xxSuccessful() ? "up" : "down");
        } catch (Exception e) {
            log.warn("Trino health check failed: {}", e.getMessage());
            services.put("trino", "down");
        }

        boolean allUp = services.values().stream().allMatch("up"::equals);
        String overallStatus = allUp ? "healthy" : "degraded";

        HealthResponseDTO response = new HealthResponseDTO(
                overallStatus,
                services,
                Instant.now().toString()
        );

        return ResponseEntity.ok(response);
    }
}
