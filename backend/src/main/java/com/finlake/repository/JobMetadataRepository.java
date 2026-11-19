package com.finlake.repository;

import com.finlake.dto.JobRunDTO;
import com.finlake.dto.JobStatusResponseDTO;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class JobMetadataRepository {

    private final JdbcTemplate jdbcTemplate;

    public JobMetadataRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void createOrUpdateJob(
        String jobId,
        String sourceId,
        String schemaName,
        String tableName,
        String format,
        String compression,
        int batchSize,
        String partitionColumns
    ) {
        String sql = """
            IF NOT EXISTS (SELECT 1 FROM dbo.ingestion_jobs WHERE job_id = ?)
            BEGIN
                INSERT INTO dbo.ingestion_jobs (
                    job_id, source_id, schema_name, table_name,
                    format, compression, batch_size, partition_columns, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', SYSUTCDATETIME(), SYSUTCDATETIME());
            END
            ELSE
            BEGIN
                UPDATE dbo.ingestion_jobs
                SET status = 'PENDING',
                    format = ?,
                    compression = ?,
                    batch_size = ?,
                    partition_columns = ?,
                    updated_at = SYSUTCDATETIME()
                WHERE job_id = ?;
            END
            """;
        jdbcTemplate.update(
            sql,
            jobId,
            jobId, sourceId, schemaName, tableName, format, compression, batchSize, partitionColumns,
            format, compression, batchSize, partitionColumns, jobId
        );
    }

    public Optional<JobStatusResponseDTO> getJob(String jobId) {
        String jobSql = """
            SELECT job_id, source_id, schema_name, table_name,
                   format, compression, batch_size, partition_columns,
                   status, created_at, updated_at
            FROM dbo.ingestion_jobs
            WHERE job_id = ?
            """;

        try {
            JobStatusResponseDTO baseJob = jdbcTemplate.queryForObject(jobSql, (rs, rowNum) -> {
                Timestamp created = rs.getTimestamp("created_at");
                Timestamp updated = rs.getTimestamp("updated_at");
                return new JobStatusResponseDTO(
                    rs.getString("job_id"),
                    rs.getString("source_id"),
                    rs.getString("schema_name"),
                    rs.getString("table_name"),
                    rs.getString("format"),
                    rs.getString("compression"),
                    rs.getInt("batch_size"),
                    rs.getString("partition_columns"),
                    rs.getString("status"),
                    created != null ? created.toInstant().toString() : null,
                    updated != null ? updated.toInstant().toString() : null,
                    null
                );
            }, jobId);

            if (baseJob == null) {
                return Optional.empty();
            }

            // Fetch latest run
            String runSql = """
                SELECT TOP 1 run_id, job_id, status, total_rows_extracted,
                       total_bytes_written, total_objects_created, manifest_path,
                       error_message, started_at, completed_at
                FROM dbo.job_runs
                WHERE job_id = ?
                ORDER BY started_at DESC
                """;

            List<JobRunDTO> runs = jdbcTemplate.query(runSql, (rs, rowNum) -> {
                Timestamp started = rs.getTimestamp("started_at");
                Timestamp completed = rs.getTimestamp("completed_at");
                return new JobRunDTO(
                    rs.getString("run_id"),
                    rs.getString("job_id"),
                    rs.getString("status"),
                    rs.getLong("total_rows_extracted"),
                    rs.getLong("total_bytes_written"),
                    rs.getInt("total_objects_created"),
                    rs.getString("manifest_path"),
                    rs.getString("error_message"),
                    started != null ? started.toInstant().toString() : null,
                    completed != null ? completed.toInstant().toString() : null
                );
            }, jobId);

            JobRunDTO latestRun = runs.isEmpty() ? null : runs.getFirst();
            return Optional.of(new JobStatusResponseDTO(
                baseJob.jobId(),
                baseJob.sourceId(),
                baseJob.schemaName(),
                baseJob.tableName(),
                baseJob.format(),
                baseJob.compression(),
                baseJob.batchSize(),
                baseJob.partitionColumns(),
                baseJob.status(),
                baseJob.createdAt(),
                baseJob.updatedAt(),
                latestRun
            ));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public List<JobStatusResponseDTO> listJobs(int limit, int offset) {
        String sql = """
            SELECT job_id, source_id, schema_name, table_name,
                   format, compression, batch_size, partition_columns,
                   status, created_at, updated_at
            FROM dbo.ingestion_jobs
            ORDER BY created_at DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            return new JobStatusResponseDTO(
                rs.getString("job_id"),
                rs.getString("source_id"),
                rs.getString("schema_name"),
                rs.getString("table_name"),
                rs.getString("format"),
                rs.getString("compression"),
                rs.getInt("batch_size"),
                rs.getString("partition_columns"),
                rs.getString("status"),
                created != null ? created.toInstant().toString() : null,
                updated != null ? updated.toInstant().toString() : null,
                null
            );
        }, offset, limit);
    }

    public void createRun(String runId, String jobId) {
        String sql = """
            INSERT INTO dbo.job_runs (run_id, job_id, status, started_at)
            VALUES (?, ?, 'RUNNING', SYSUTCDATETIME());

            UPDATE dbo.ingestion_jobs
            SET status = 'RUNNING', updated_at = SYSUTCDATETIME()
            WHERE job_id = ?;
            """;
        jdbcTemplate.update(sql, runId, jobId, jobId);
    }

    public void updateRunStatus(
        String runId,
        String jobId,
        String status,
        long totalRows,
        long totalBytes,
        int totalObjects,
        String manifestPath,
        String errorMessage
    ) {
        String sql = """
            UPDATE dbo.job_runs
            SET status = ?,
                total_rows_extracted = ?,
                total_bytes_written = ?,
                total_objects_created = ?,
                manifest_path = ?,
                error_message = ?,
                completed_at = SYSUTCDATETIME()
            WHERE run_id = ?;

            UPDATE dbo.ingestion_jobs
            SET status = ?, updated_at = SYSUTCDATETIME()
            WHERE job_id = ?;
            """;
        jdbcTemplate.update(
            sql,
            status, totalRows, totalBytes, totalObjects, manifestPath, errorMessage, runId,
            status, jobId
        );
    }

    public boolean cancelJob(String jobId) {
        String sql = """
            UPDATE dbo.job_runs
            SET status = 'CANCELLED',
                error_message = 'Job execution was cancelled by user request.',
                completed_at = SYSUTCDATETIME()
            WHERE job_id = ? AND status IN ('PENDING', 'RUNNING');

            UPDATE dbo.ingestion_jobs
            SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
            WHERE job_id = ?;
            """;
        int updated = jdbcTemplate.update(sql, jobId, jobId);
        return updated > 0;
    }
}
