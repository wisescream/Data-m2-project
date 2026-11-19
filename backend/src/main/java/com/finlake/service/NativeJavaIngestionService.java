package com.finlake.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finlake.dto.JobCreateRequestDTO;
import com.finlake.repository.JobMetadataRepository;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.UploadObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.GZIPOutputStream;

@Service
public class NativeJavaIngestionService {

    private static final Logger log = LoggerFactory.getLogger(NativeJavaIngestionService.class);
    private static final Instant SIMULATED_BASE_TIME = Instant.parse("2023-01-01T00:00:00Z");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    private final DataSource dataSource;
    private final MinioClient minioClient;
    private final JobMetadataRepository repository;
    private final ObjectMapper objectMapper;

    @Value("${finlake.minio.bucket:finlake}")
    private String defaultBucket;

    public NativeJavaIngestionService(DataSource dataSource,
                                      MinioClient minioClient,
                                      JobMetadataRepository repository,
                                      ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.minioClient = minioClient;
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public void executeIngestion(String jobId, JobCreateRequestDTO req) {
        Instant startTime = Instant.now();
        String runId = "run_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        repository.createRun(runId, jobId);

        String tableName = (req.table() != null && !req.table().isBlank()) ? req.table() : "transactions";
        if (tableName.contains(".")) {
            tableName = tableName.substring(tableName.lastIndexOf('.') + 1);
        }
        if ("raw_transactions".equalsIgnoreCase(tableName)) {
            tableName = "transactions";
        }

        String format = (req.format() != null && !req.format().isBlank()) ? req.format().toLowerCase() : "parquet";
        String compression = (req.compression() != null && !req.compression().isBlank()) ? req.compression().toLowerCase() : "snappy";
        int batchSize = (req.batchSize() != null && req.batchSize() > 0) ? req.batchSize() : 50000;
        String partitionCol = (req.partitionBy() != null && !req.partitionBy().isEmpty()
                && !req.partitionBy().getFirst().equalsIgnoreCase("none"))
                ? req.partitionBy().getFirst()
                : null;
        Long maxRows = (req.maxRows() != null && req.maxRows() > 0) ? req.maxRows() : null;

        log.info("Starting pure Java ingestion: job={}, run={}, table={}, format={}, compression={}, partition={}",
                jobId, runId, tableName, format, compression, partitionCol);

        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("finlake_ingest_" + runId);

            // Ensure MinIO bucket exists
            ensureBucketExists();

            long totalRows = 0;
            long totalBytes = 0;
            List<Map<String, Object>> manifestObjects = new ArrayList<>();

            // 1. Extract from SQL Server in batches
            String selectSql = (maxRows != null)
                    ? "SELECT TOP " + maxRows + " * FROM dbo." + tableName
                    : "SELECT * FROM dbo." + tableName;

            try (Connection conn = dataSource.getConnection();
                 PreparedStatement pstmt = conn.prepareStatement(selectSql, ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {

                pstmt.setFetchSize(Math.min(batchSize, 5000));

                try (ResultSet rs = pstmt.executeQuery()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int colCount = meta.getColumnCount();
                    List<String> colNames = new ArrayList<>();
                    for (int i = 1; i <= colCount; i++) {
                        colNames.add(meta.getColumnLabel(i));
                    }

                    int stepColIdx = -1;
                    boolean hasEventDate = false;
                    for (int i = 0; i < colNames.size(); i++) {
                        if ("step".equalsIgnoreCase(colNames.get(i))) {
                            stepColIdx = i;
                        }
                        if ("event_date".equalsIgnoreCase(colNames.get(i))) {
                            hasEventDate = true;
                        }
                    }

                    boolean addEventDateCol = (stepColIdx >= 0 && !hasEventDate);
                    List<String> headerCols = new ArrayList<>(colNames);
                    if (addEventDateCol) {
                        headerCols.add("event_date");
                    }

                    // Fallback partitionCol if not present in headerCols
                    String effectivePartitionCol = partitionCol;
                    if (effectivePartitionCol != null && !effectivePartitionCol.isBlank() && !headerCols.contains(effectivePartitionCol)) {
                        log.warn("Partition column '{}' not found in table columns {}, falling back to unpartitioned.",
                                effectivePartitionCol, headerCols);
                        effectivePartitionCol = null;
                    }

                    int batchIndex = 1;
                    boolean hasMore = true;

                    while (hasMore) {
                        Path csvBatchFile = tempDir.resolve("batch_" + batchIndex + ".csv");
                        long batchRowCount = 0;

                        try (BufferedWriter bw = new BufferedWriter(new FileWriter(csvBatchFile.toFile(), StandardCharsets.UTF_8))) {
                            // Write header
                            bw.write(String.join(",", headerCols.stream().map(this::escapeCsv).toList()));
                            bw.newLine();

                            while (rs.next()) {
                                List<String> row = new ArrayList<>(colCount + (addEventDateCol ? 1 : 0));
                                Object stepVal = null;
                                for (int i = 1; i <= colCount; i++) {
                                    Object val = rs.getObject(i);
                                    if (i - 1 == stepColIdx) {
                                        stepVal = val;
                                    }
                                    row.add(val != null ? escapeCsv(val.toString()) : "");
                                }

                                if (addEventDateCol) {
                                    String eventDate = "2023-01-01";
                                    if (stepVal instanceof Number n) {
                                        int step = n.intValue();
                                        Instant evt = SIMULATED_BASE_TIME.plus(Math.max(0, step - 1), ChronoUnit.HOURS);
                                        eventDate = DATE_FORMATTER.format(evt);
                                    }
                                    row.add(escapeCsv(eventDate));
                                }

                                bw.write(String.join(",", row));
                                bw.newLine();
                                batchRowCount++;
                                totalRows++;

                                if (batchRowCount >= batchSize || (maxRows != null && totalRows >= maxRows)) {
                                    break;
                                }
                            }
                        }

                        if (batchRowCount == 0) {
                            Files.deleteIfExists(csvBatchFile);
                            break;
                        }

                        // 2. Convert batch to target format & upload to MinIO
                        List<Map<String, Object>> batchObjects = processAndUploadBatch(
                                csvBatchFile, tempDir, batchIndex, tableName, format, compression, effectivePartitionCol, jobId, runId
                        );

                        for (Map<String, Object> obj : batchObjects) {
                            manifestObjects.add(obj);
                            totalBytes += ((Number) obj.get("size_bytes")).longValue();
                        }

                        Files.deleteIfExists(csvBatchFile);
                        batchIndex++;

                        if (maxRows != null && totalRows >= maxRows) {
                            hasMore = false;
                        } else if (batchRowCount < batchSize) {
                            hasMore = false;
                        }
                    }
                }
            }

            if (totalRows == 0) {
                throw new IllegalStateException("Extraction completed with 0 rows extracted from table dbo." + tableName);
            }

            // 3. Build Manifest JSON
            Instant endTime = Instant.now();
            double durationSeconds = ChronoUnit.MILLIS.between(startTime, endTime) / 1000.0;

            String manifestKey = "manifests/" + tableName.toLowerCase() + "/" + runId + ".json";
            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("job_id", jobId);
            manifest.put("run_id", runId);
            manifest.put("source_table", "dbo." + tableName);
            manifest.put("format", format);
            manifest.put("compression", compression);
            manifest.put("partition_by", partitionCol != null ? partitionCol : "none");
            manifest.put("row_count_total", totalRows);
            manifest.put("bytes_total", totalBytes);
            manifest.put("objects_count", manifestObjects.size());
            manifest.put("objects", manifestObjects);
            manifest.put("started_at", startTime.toString());
            manifest.put("completed_at", endTime.toString());
            manifest.put("duration_seconds", durationSeconds);
            manifest.put("status", "SUCCESS");

            byte[] manifestBytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest);

            // Upload manifest to MinIO
            File manifestFile = tempDir.resolve("manifest.json").toFile();
            Files.write(manifestFile.toPath(), manifestBytes);
            minioClient.uploadObject(
                    UploadObjectArgs.builder()
                            .bucket(defaultBucket)
                            .object(manifestKey)
                            .filename(manifestFile.getAbsolutePath())
                            .contentType("application/json")
                            .build()
            );

            String fullManifestPath = "s3://" + defaultBucket + "/" + manifestKey;

            // 4. Update SQL Server metadata repository
            repository.updateRunStatus(
                    runId, jobId, "SUCCESS", totalRows, totalBytes, manifestObjects.size(), fullManifestPath, null
            );

            log.info("Pure Java Ingestion completed successfully: job={}, run={}, rows={}, bytes={}, duration={}s",
                    jobId, runId, totalRows, totalBytes, durationSeconds);

        } catch (Exception e) {
            log.error("Ingestion failed for job " + jobId, e);
            repository.updateRunStatus(runId, jobId, "FAILED", 0, 0, 0, null, e.getMessage());
        } finally {
            if (tempDir != null) {
                cleanDirectory(tempDir.toFile());
            }
        }
    }

    private List<Map<String, Object>> processAndUploadBatch(
            Path csvBatchFile,
            Path tempDir,
            int batchIndex,
            String tableName,
            String format,
            String compression,
            String partitionCol,
            String jobId,
            String runId
    ) throws Exception {
        List<Map<String, Object>> uploadedObjects = new ArrayList<>();
        String normalizedTable = tableName.toLowerCase();

        if ("parquet".equalsIgnoreCase(format)) {
            // Use DuckDB for embedded Parquet generation
            Class.forName("org.duckdb.DuckDBDriver");
            try (Connection duck = DriverManager.getConnection("jdbc:duckdb:");
                 Statement stmt = duck.createStatement()) {

                String csvPathStr = csvBatchFile.toAbsolutePath().toString().replace("\\", "/");

                if (partitionCol != null && !partitionCol.isBlank()) {
                    // Partitioned Parquet output
                    Path partOutputDir = tempDir.resolve("parquet_part_" + batchIndex);
                    Files.createDirectories(partOutputDir);
                    String outDirStr = partOutputDir.toAbsolutePath().toString().replace("\\", "/");

                    String duckSql = String.format(
                            "COPY (SELECT * FROM read_csv_auto('%s')) TO '%s' (FORMAT PARQUET, PARTITION_BY (%s), COMPRESSION '%s', OVERWRITE_OR_IGNORE)",
                            csvPathStr, outDirStr, partitionCol, compression.toUpperCase()
                    );
                    stmt.execute(duckSql);

                    // Scan generated partition files and upload
                    try (var stream = Files.walk(partOutputDir)) {
                        List<Path> files = stream.filter(Files::isRegularFile).toList();
                        for (Path p : files) {
                            String rel = partOutputDir.relativize(p).toString().replace("\\", "/");
                            // MinIO target key: curated/<table_name>/<rel>
                            String minioKey = "curated/" + (normalizedTable.equals("transactions") ? "paysim/transactions" : normalizedTable) + "/" + rel;
                            uploadedObjects.add(uploadFileToMinio(p.toFile(), minioKey, "application/vnd.apache.parquet"));
                        }
                    }
                } else {
                    // Unpartitioned Parquet output
                    String outFileName = String.format("%s_batch_%04d.parquet", normalizedTable, batchIndex);
                    Path parquetFile = tempDir.resolve(outFileName);
                    String outPathStr = parquetFile.toAbsolutePath().toString().replace("\\", "/");

                    String duckSql = String.format(
                            "COPY (SELECT * FROM read_csv_auto('%s')) TO '%s' (FORMAT PARQUET, COMPRESSION '%s')",
                            csvPathStr, outPathStr, compression.toUpperCase()
                    );
                    stmt.execute(duckSql);

                    String prefix = normalizedTable.equals("transactions") ? "curated/paysim/transactions_unpartitioned" : "curated/" + normalizedTable;
                    String minioKey = prefix + "/" + outFileName;
                    uploadedObjects.add(uploadFileToMinio(parquetFile.toFile(), minioKey, "application/vnd.apache.parquet"));
                }
            }
        } else {
            // CSV Output
            File fileToUpload;
            String minioKey;
            String contentType;

            if ("gzip".equalsIgnoreCase(compression)) {
                String outFileName = String.format("%s_batch_%04d.csv.gz", normalizedTable, batchIndex);
                File gzFile = tempDir.resolve(outFileName).toFile();
                try (FileInputStream fis = new FileInputStream(csvBatchFile.toFile());
                     GZIPOutputStream gzos = new GZIPOutputStream(new FileOutputStream(gzFile))) {
                    fis.transferTo(gzos);
                }
                fileToUpload = gzFile;
                contentType = "application/gzip";
                minioKey = "curated/" + normalizedTable + "/" + outFileName;
            } else {
                String outFileName = String.format("%s_batch_%04d.csv", normalizedTable, batchIndex);
                fileToUpload = csvBatchFile.toFile();
                contentType = "text/csv";
                minioKey = "curated/" + normalizedTable + "/" + outFileName;
            }

            uploadedObjects.add(uploadFileToMinio(fileToUpload, minioKey, contentType));
        }

        return uploadedObjects;
    }

    private Map<String, Object> uploadFileToMinio(File file, String objectKey, String contentType) throws Exception {
        long size = file.length();
        String sha256 = calculateSha256(file);

        minioClient.uploadObject(
                UploadObjectArgs.builder()
                        .bucket(defaultBucket)
                        .object(objectKey)
                        .filename(file.getAbsolutePath())
                        .contentType(contentType)
                        .build()
        );

        Map<String, Object> objMeta = new LinkedHashMap<>();
        objMeta.put("path", "s3://" + defaultBucket + "/" + objectKey);
        objMeta.put("rel_path", objectKey);
        objMeta.put("size_bytes", size);
        objMeta.put("sha256", sha256);
        return objMeta;
    }

    private void ensureBucketExists() {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(defaultBucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(defaultBucket).build());
            }
        } catch (Exception e) {
            log.warn("Could not verify/create bucket {}: {}", defaultBucket, e.getMessage());
        }
    }

    private String escapeCsv(String val) {
        if (val == null) return "";
        if (val.contains(",") || val.contains("\"") || val.contains("\n") || val.contains("\r")) {
            return "\"" + val.replace("\"", "\"\"") + "\"";
        }
        return val;
    }

    private String calculateSha256(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, n);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            return "";
        }
    }

    private void cleanDirectory(File dir) {
        if (dir.exists()) {
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.isDirectory()) {
                        cleanDirectory(f);
                    } else {
                        f.delete();
                    }
                }
            }
            dir.delete();
        }
    }
}
