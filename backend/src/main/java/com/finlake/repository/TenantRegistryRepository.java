package com.finlake.repository;

import com.finlake.dto.TenantProvisioningEventDTO;
import com.finlake.dto.TenantResponseDTO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class TenantRegistryRepository {

    private final JdbcTemplate jdbcTemplate;

    public TenantRegistryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private final RowMapper<TenantResponseDTO> tenantRowMapper = new RowMapper<>() {
        @Override
        public TenantResponseDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
            Timestamp createdTs = rs.getTimestamp("created_at");
            Timestamp updatedTs = rs.getTimestamp("updated_at");
            return new TenantResponseDTO(
                    rs.getString("tenant_id"),
                    rs.getString("display_name"),
                    rs.getString("isolation_tier"),
                    rs.getString("vertical"),
                    rs.getString("anon_profile_id"),
                    rs.getString("kms_key_id"),
                    rs.getString("trino_catalog"),
                    rs.getString("s3_bucket"),
                    rs.getString("s3_prefix"),
                    rs.getString("status"),
                    createdTs != null ? createdTs.toLocalDateTime() : null,
                    updatedTs != null ? updatedTs.toLocalDateTime() : null
            );
        }
    };

    private final RowMapper<TenantProvisioningEventDTO> eventRowMapper = new RowMapper<>() {
        @Override
        public TenantProvisioningEventDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
            Timestamp createdTs = rs.getTimestamp("created_at");
            return new TenantProvisioningEventDTO(
                    rs.getLong("event_id"),
                    rs.getString("tenant_id"),
                    rs.getString("step"),
                    rs.getString("status"),
                    rs.getString("details"),
                    createdTs != null ? createdTs.toLocalDateTime() : null
            );
        }
    };

    public Optional<TenantResponseDTO> findById(String tenantId) {
        String sql = "SELECT tenant_id, display_name, isolation_tier, vertical, anon_profile_id, " +
                "kms_key_id, trino_catalog, s3_bucket, s3_prefix, status, created_at, updated_at " +
                "FROM dbo.tenants WHERE tenant_id = ?";
        List<TenantResponseDTO> results = jdbcTemplate.query(sql, tenantRowMapper, tenantId);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public List<TenantResponseDTO> findAll() {
        String sql = "SELECT tenant_id, display_name, isolation_tier, vertical, anon_profile_id, " +
                "kms_key_id, trino_catalog, s3_bucket, s3_prefix, status, created_at, updated_at " +
                "FROM dbo.tenants ORDER BY created_at DESC";
        return jdbcTemplate.query(sql, tenantRowMapper);
    }

    public void upsertTenant(TenantResponseDTO tenant) {
        String checkSql = "SELECT COUNT(*) FROM dbo.tenants WHERE tenant_id = ?";
        Integer count = jdbcTemplate.queryForObject(checkSql, Integer.class, tenant.tenantId());
        if (count != null && count > 0) {
            String updateSql = "UPDATE dbo.tenants SET display_name = ?, isolation_tier = ?, vertical = ?, " +
                    "anon_profile_id = ?, kms_key_id = ?, trino_catalog = ?, s3_bucket = ?, s3_prefix = ?, " +
                    "status = ?, updated_at = SYSUTCDATETIME() WHERE tenant_id = ?";
            jdbcTemplate.update(updateSql,
                    tenant.displayName(),
                    tenant.isolationTier().toLowerCase(),
                    tenant.vertical().toLowerCase(),
                    tenant.anonProfileId(),
                    tenant.kmsKeyId(),
                    tenant.trinoCatalog(),
                    tenant.s3Bucket(),
                    tenant.s3Prefix() != null ? tenant.s3Prefix() : "",
                    tenant.status().toLowerCase(),
                    tenant.tenantId()
            );
        } else {
            String insertSql = "INSERT INTO dbo.tenants (tenant_id, display_name, isolation_tier, vertical, " +
                    "anon_profile_id, kms_key_id, trino_catalog, s3_bucket, s3_prefix, status, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME(), SYSUTCDATETIME())";
            jdbcTemplate.update(insertSql,
                    tenant.tenantId(),
                    tenant.displayName(),
                    tenant.isolationTier().toLowerCase(),
                    tenant.vertical().toLowerCase(),
                    tenant.anonProfileId(),
                    tenant.kmsKeyId(),
                    tenant.trinoCatalog(),
                    tenant.s3Bucket(),
                    tenant.s3Prefix() != null ? tenant.s3Prefix() : "",
                    tenant.status().toLowerCase()
            );
        }
    }

    public void updateStatus(String tenantId, String status) {
        String sql = "UPDATE dbo.tenants SET status = ?, updated_at = SYSUTCDATETIME() WHERE tenant_id = ?";
        jdbcTemplate.update(sql, status.toLowerCase(), tenantId);
    }

    public void recordEvent(String tenantId, String step, String status, String details) {
        String sql = "INSERT INTO dbo.tenant_provisioning_events (tenant_id, step, status, details, created_at) " +
                "VALUES (?, ?, ?, ?, SYSUTCDATETIME())";
        jdbcTemplate.update(sql, tenantId, step, status, details);
    }

    public List<TenantProvisioningEventDTO> findEventsByTenantId(String tenantId) {
        String sql = "SELECT event_id, tenant_id, step, status, details, created_at " +
                "FROM dbo.tenant_provisioning_events WHERE tenant_id = ? ORDER BY event_id ASC";
        return jdbcTemplate.query(sql, eventRowMapper, tenantId);
    }
}
