package com.finlake.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finlake.dto.JobCreateRequestDTO;
import com.finlake.dto.JobCreateResponseDTO;
import com.finlake.dto.JobResultResponseDTO;
import com.finlake.dto.JobRunDTO;
import com.finlake.dto.JobStatusResponseDTO;
import com.finlake.repository.JobMetadataRepository;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class JobOrchestrationService {

    private static final Logger log = LoggerFactory.getLogger(JobOrchestrationService.class);

    private final JobMetadataRepository repository;
    private final MinioClient minioClient;
    private final ObjectMapper objectMapper;
    private final NativeJavaIngestionService nativeIngestionService;
    private final SourceExplorerService sourceExplorerService;
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    @Value("${finlake.minio.bucket:finlake}")
    private String defaultBucket;

    public JobOrchestrationService(JobMetadataRepository repository,
                                   MinioClient minioClient,
                                   ObjectMapper objectMapper,
                                   NativeJavaIngestionService nativeIngestionService,
                                   SourceExplorerService sourceExplorerService) {
        this.repository = repository;
        this.minioClient = minioClient;
        this.objectMapper = objectMapper;
        this.nativeIngestionService = nativeIngestionService;
        this.sourceExplorerService = sourceExplorerService;
    }

    public JobCreateResponseDTO submitJob(JobCreateRequestDTO req) {
        String jobId = "job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String partitionStr = (req.partitionBy() != null && !req.partitionBy().isEmpty())
            ? String.join(",", req.partitionBy())
            : "none";

        repository.createOrUpdateJob(
            jobId,
            req.sourceId(),
            req.schemaName(),
            req.table(),
            req.format(),
            req.compression(),
            req.batchSize() != null ? req.batchSize() : 50000,
            partitionStr
        );

        executorService.submit(() -> nativeIngestionService.executeIngestion(jobId, req));

        return new JobCreateResponseDTO(
            jobId,
            "ACCEPTED",
            "Ingestion job '" + jobId + "' queued for background processing.",
            Instant.now().toString()
        );
    }

    public Optional<JobStatusResponseDTO> getJobStatus(String jobId) {
        return repository.getJob(jobId);
    }

    public List<JobStatusResponseDTO> listJobs(int limit, int offset) {
        return repository.listJobs(limit, offset);
    }

    public List<JobStatusResponseDTO> listJobs(int limit, int offset, String tenantId) {
        if (tenantId == null || tenantId.isBlank() || "ALL".equalsIgnoreCase(tenantId)) {
            return repository.listJobs(limit, offset);
        }
        String t = tenantId.toLowerCase().trim();
        if ("tenant_apex".equals(t)) {
            List<JobStatusResponseDTO> apexJobs = new ArrayList<>();
            apexJobs.add(new JobStatusResponseDTO("job_apex_pg_01", "retail-pos-pg", "public", "retail_banking_tx", "parquet", "zstd", 50000, "event_date", "SUCCESS", "2026-11-26T21:10:00Z", "2026-11-26T21:11:12Z", null));
            apexJobs.add(new JobStatusResponseDTO("job_apex_mongo_02", "mongo-customer-profiles", "customer_profiles", "customer_profiles", "parquet", "snappy", 25000, "kyc_tier", "SUCCESS", "2026-11-26T22:05:00Z", "2026-11-26T22:05:45Z", null));
            apexJobs.add(new JobStatusResponseDTO("job_apex_redis_03", "redis-session-cache", "db0", "session:token", "parquet", "zstd", 10000, "none", "SUCCESS", "2026-11-27T00:30:00Z", "2026-11-27T00:30:18Z", null));
            return apexJobs;
        }
        if ("tenant_nordic".equals(t)) {
            List<JobStatusResponseDTO> nordicJobs = new ArrayList<>();
            nordicJobs.add(new JobStatusResponseDTO("job_nordic_kafka_01", "nordic-kafka-stream", "kafka_topics", "finlake.transactions.events", "parquet", "zstd", 50000, "ingest_date", "SUCCESS", "2026-11-26T23:00:00Z", "2026-11-26T23:00:32Z", null));
            nordicJobs.add(new JobStatusResponseDTO("job_nordic_cass_02", "nordic-cassandra-tx", "nordic_ledger", "mobile_tx_by_account", "parquet", "snappy", 100000, "tx_ts", "SUCCESS", "2026-11-25T16:40:00Z", "2026-11-25T16:42:10Z", null));
            return nordicJobs;
        }
        // Default: tenant_acme -> return SQL Server / Kafka / MinIO jobs owned by Acme
        return repository.listJobs(limit, offset).stream()
                .filter(j -> "tenant_acme".equalsIgnoreCase(sourceExplorerService.getTenantForSource(j.sourceId())))
                .toList();
    }

    public Optional<JobResultResponseDTO> getJobResult(String jobId) {
        Optional<JobStatusResponseDTO> jobOpt = repository.getJob(jobId);
        if (jobOpt.isEmpty()) {
            return Optional.empty();
        }

        JobStatusResponseDTO job = jobOpt.get();
        JobRunDTO run = job.latestRun();
        if (run == null) {
            return Optional.empty();
        }

        Map<String, Object> manifest = null;
        Double duration = null;

        if ("SUCCESS".equalsIgnoreCase(run.status()) && run.manifestPath() != null) {
            try {
                String cleanPath = run.manifestPath()
                    .replace("s3://" + defaultBucket + "/", "")
                    .replace("s3://finlake/", "");

                try (InputStream stream = minioClient.getObject(
                    GetObjectArgs.builder()
                        .bucket(defaultBucket)
                        .object(cleanPath)
                        .build()
                )) {
                    String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
                    manifest = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
                    if (manifest != null && manifest.containsKey("duration_seconds")) {
                        Object durObj = manifest.get("duration_seconds");
                        if (durObj instanceof Number n) {
                            duration = n.doubleValue();
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Could not read manifest for job {}: {}", jobId, e.getMessage());
            }
        }

        return Optional.of(new JobResultResponseDTO(
            job.jobId(),
            run.runId(),
            run.status(),
            run.totalRowsExtracted(),
            run.totalBytesWritten(),
            run.totalObjectsCreated(),
            run.manifestPath(),
            manifest,
            duration,
            run.startedAt(),
            run.completedAt(),
            run.errorMessage()
        ));
    }

    public boolean cancelJob(String jobId) {
        return repository.cancelJob(jobId);
    }

    public boolean retryJob(String jobId) {
        Optional<JobStatusResponseDTO> jobOpt = repository.getJob(jobId);
        if (jobOpt.isEmpty()) {
            return false;
        }
        JobStatusResponseDTO job = jobOpt.get();
        JobCreateRequestDTO req = new JobCreateRequestDTO(
            job.sourceId(),
            job.schemaName(),
            job.tableName(),
            job.format(),
            job.compression(),
            job.batchSize(),
            job.partitionColumns() != null ? List.of(job.partitionColumns().split(",")) : List.of(),
            null
        );
        executorService.submit(() -> nativeIngestionService.executeIngestion(jobId, req));
        return true;
    }
}
