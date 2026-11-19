package com.finlake.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Value("${finlake.minio.endpoint:http://127.0.0.1:9000}")
    private String endpoint;

    @Value("${finlake.minio.access-key:finlake_admin}")
    private String accessKey;

    @Value("${finlake.minio.secret-key:finlake_secret_key_2026!}")
    private String secretKey;

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
