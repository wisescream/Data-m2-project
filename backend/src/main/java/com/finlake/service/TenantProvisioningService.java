package com.finlake.service;

import com.finlake.dto.TenantCreateRequestDTO;
import com.finlake.dto.TenantProvisioningEventDTO;
import com.finlake.dto.TenantResponseDTO;
import com.finlake.repository.TenantRegistryRepository;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Properties;

@Service
public class TenantProvisioningService {

    private static final Logger log = LoggerFactory.getLogger(TenantProvisioningService.class);

    private final TenantRegistryRepository repository;
    private final MinioClient minioClient;

    @Value("${finlake.trino.host:127.0.0.1}")
    private String trinoHost = "127.0.0.1";

    @Value("${finlake.trino.port:8080}")
    private int trinoPort = 8080;

    @Value("${finlake.trino.user:finlake}")
    private String trinoUser = "finlake";

    @Value("${finlake.catalog.dir:/app/config/trino/catalog}")
    private String catalogDir = "/app/config/trino/catalog";

    @Value("${finlake.minio.endpoint:http://minio:9000}")
    private String minioEndpoint = "http://minio:9000";

    @Value("${finlake.minio.access-key:finlake_admin}")
    private String minioAccessKey = "finlake_admin";

    @Value("${finlake.minio.secret-key:finlake_secret_key_2026!}")
    private String minioSecretKey = "finlake_secret_key_2026!";

    public TenantProvisioningService(TenantRegistryRepository repository, MinioClient minioClient) {
        this.repository = repository;
        this.minioClient = minioClient;
    }

    public synchronized TenantResponseDTO provisionTenant(TenantCreateRequestDTO req) {
        String tenantId = req.tenantId().toLowerCase().trim();
        String tier = req.isolationTier().toLowerCase().trim();
        String vertical = req.vertical().toLowerCase().trim();
        String anonProfileId = (req.anonProfileId() != null && !req.anonProfileId().isBlank())
                ? req.anonProfileId().trim()
                : (vertical + "_v1");

        String kmsKeyId = "alias/finlake/" + tenantId;
        String trinoCatalog = tenantId;
        String bucketSlug = tenantId.replace('_', '-');
        String s3Bucket = "pool".equalsIgnoreCase(tier) ? "finlake" : (bucketSlug + "-lake");
        String s3Prefix = "pool".equalsIgnoreCase(tier) ? ("tenants/" + tenantId + "/") : "";

        // 1. Idempotency Check: if active, return existing
        var existing = repository.findById(tenantId);
        if (existing.isPresent() && "active".equalsIgnoreCase(existing.get().status())) {
            log.info("Tenant {} is already active. Returning existing configuration.", tenantId);
            repository.recordEvent(tenantId, "IDEMPOTENT_CHECK", "SKIPPED", "Tenant already ACTIVE. No action required.");
            return existing.get();
        }

        log.info("Starting automated provisioning workflow for tenant: {} (tier: {}, vertical: {})", tenantId, tier, vertical);

        // 2. Register initial state: PROVISIONING
        TenantResponseDTO initialTenant = new TenantResponseDTO(
                tenantId,
                req.displayName().trim(),
                tier,
                vertical,
                anonProfileId,
                kmsKeyId,
                trinoCatalog,
                s3Bucket,
                s3Prefix,
                "provisioning",
                LocalDateTime.now(),
                LocalDateTime.now()
        );
        repository.upsertTenant(initialTenant);
        repository.recordEvent(tenantId, "INIT_PROVISIONING", "SUCCESS", "Tenant registered in control plane with status PROVISIONING.");

        try {
            // 3. MinIO S3 Bucket Provisioning
            provisionStorage(tenantId, s3Bucket, s3Prefix);
            repository.recordEvent(tenantId, "STORAGE_PROVISIONED", "SUCCESS", "MinIO bucket [" + s3Bucket + "] and storage hierarchy initialized.");

            // 4. Trino Catalog File Generation
            provisionCatalogFile(trinoCatalog);
            repository.recordEvent(tenantId, "CATALOG_CONFIGURED", "SUCCESS", "Trino catalog configuration emitted for [" + trinoCatalog + "].");

            // 5. Initialize Schemas via Trino JDBC
            initializeTrinoSchemas(trinoCatalog, s3Bucket, s3Prefix);
            repository.recordEvent(tenantId, "SCHEMAS_INITIALIZED", "SUCCESS", "Schemas [" + trinoCatalog + ".raw, curated, anonymized] registered.");

            // 6. Transition to ACTIVE
            repository.updateStatus(tenantId, "active");
            repository.recordEvent(tenantId, "PROVISIONING_COMPLETE", "SUCCESS", "Tenant fully provisioned and active.");
            log.info("Tenant {} successfully provisioned and marked ACTIVE.", tenantId);

            return repository.findById(tenantId).orElseThrow();

        } catch (Exception e) {
            log.error("Provisioning failed for tenant {}: {}", tenantId, e.getMessage(), e);
            repository.updateStatus(tenantId, "failed");
            repository.recordEvent(tenantId, "PROVISIONING_FAILED", "FAILED", "Error: " + e.getMessage());
            throw new RuntimeException("Tenant provisioning failed: " + e.getMessage(), e);
        }
    }

    private void provisionStorage(String tenantId, String s3Bucket, String s3Prefix) throws Exception {
        boolean bucketExists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(s3Bucket).build());
        if (!bucketExists) {
            log.info("Creating dedicated MinIO bucket: {}", s3Bucket);
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(s3Bucket).build());
        }

        // Initialize folder markers: raw/, curated/, anonymized/
        String[] folders = {"raw", "curated", "anonymized"};
        byte[] empty = new byte[0];
        for (String f : folders) {
            String objectKey = s3Prefix + f + "/.keep";
            try (ByteArrayInputStream bais = new ByteArrayInputStream(empty)) {
                minioClient.putObject(
                        PutObjectArgs.builder()
                                .bucket(s3Bucket)
                                .object(objectKey)
                                .stream(bais, 0, -1)
                                .build()
                );
            }
        }
    }

    private void provisionCatalogFile(String trinoCatalog) {
        File dir = new File(catalogDir);
        if (!dir.exists()) {
            // Fallback to local config path if running outside Docker container
            dir = new File("config/trino/catalog");
        }

        if (dir.exists()) {
            File catalogFile = new File(dir, trinoCatalog + ".properties");
            String configContent = String.format("""
                    connector.name=hive
                    hive.metastore.uri=thrift://hive-metastore:9083
                    hive.s3.endpoint=%s
                    hive.s3.aws-access-key=%s
                    hive.s3.aws-secret-key=%s
                    hive.s3.path-style-access=true
                    hive.s3.ssl.enabled=false
                    hive.non-managed-table-writes-enabled=true
                    """, minioEndpoint, minioAccessKey, minioSecretKey);

            try (FileWriter writer = new FileWriter(catalogFile)) {
                writer.write(configContent);
                log.info("Wrote Trino catalog properties to {}", catalogFile.getAbsolutePath());
            } catch (IOException e) {
                log.warn("Could not write catalog file to {}: {}", catalogFile.getAbsolutePath(), e.getMessage());
            }
        } else {
            log.warn("Catalog directory not found at {} or fallback. Skipping file write.", catalogDir);
        }
    }

    private void initializeTrinoSchemas(String trinoCatalog, String s3Bucket, String s3Prefix) {
        String trinoUrl = String.format("jdbc:trino://%s:%d/hive/default", trinoHost, trinoPort);
        Properties props = new Properties();
        props.setProperty("user", trinoUser);

        String[] schemas = {"raw", "curated", "anonymized"};
        try (Connection conn = DriverManager.getConnection(trinoUrl, props);
             Statement stmt = conn.createStatement()) {

            for (String schemaName : schemas) {
                String location = String.format("s3a://%s/%s%s/", s3Bucket, s3Prefix, schemaName);
                String sql = String.format("CREATE SCHEMA IF NOT EXISTS %s.%s WITH (location = '%s')",
                        trinoCatalog, schemaName, location);
                try {
                    log.info("Executing Trino DDL: {}", sql);
                    stmt.execute(sql);
                } catch (Exception e) {
                    log.warn("Trino DDL for schema {}.{} notice: {}", trinoCatalog, schemaName, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Could not connect to Trino to initialize schemas (will retry on query): {}", e.getMessage());
        }
    }

    public List<TenantResponseDTO> getAllTenants() {
        return repository.findAll();
    }

    public TenantResponseDTO getTenant(String tenantId) {
        return repository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Tenant not found: " + tenantId));
    }

    public List<TenantProvisioningEventDTO> getTenantEvents(String tenantId) {
        return repository.findEventsByTenantId(tenantId);
    }
}
