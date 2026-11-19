package com.finlake.service;

import com.finlake.dto.ColumnSchemaDTO;
import com.finlake.dto.SourceInfoDTO;
import com.finlake.dto.SourceTestResponseDTO;
import com.finlake.dto.TableListResponseDTO;
import com.finlake.dto.TableSchemaResponseDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class SourceExplorerService {

    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    public static final String DEFAULT_SOURCE_ID = "sqlserver-paysim";

    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.url}")
    private String dbUrl;

    public SourceExplorerService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public static String validateIdentifier(String name) {
        if (name == null || !SAFE_IDENTIFIER.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid SQL identifier: '" + name + "'. Must match ^[a-zA-Z_][a-zA-Z0-9_]*$");
        }
        return name;
    }

    public List<SourceInfoDTO> listSources() {
        return List.of(new SourceInfoDTO(
            DEFAULT_SOURCE_ID,
            "SQL Server PaySim Source",
            "sqlserver",
            "sqlserver",
            1433,
            "finlake_source",
            "Financial OLTP source hosting synthetic PaySim mobile-money transactions."
        ));
    }

    public SourceTestResponseDTO testSource(String sourceId) {
        if (!DEFAULT_SOURCE_ID.equals(sourceId)) {
            return new SourceTestResponseDTO(sourceId, "failed", null, null, "Source '" + sourceId + "' is not configured.");
        }
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap("SELECT @@VERSION AS ver, DB_NAME() AS db");
            String version = (String) row.get("ver");
            String db = (String) row.get("db");
            return new SourceTestResponseDTO(sourceId, "connected", version, db, null);
        } catch (Exception ex) {
            return new SourceTestResponseDTO(sourceId, "failed", null, null, ex.getMessage());
        }
    }

    public TableListResponseDTO listTables(String sourceId, String schema) {
        if (!DEFAULT_SOURCE_ID.equals(sourceId)) {
            throw new IllegalArgumentException("Source '" + sourceId + "' is not configured.");
        }
        String validSchema = validateIdentifier(schema);
        String sql = """
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
            """;
        List<String> tables = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("TABLE_NAME"), validSchema);
        return new TableListResponseDTO(sourceId, validSchema, tables);
    }

    public TableSchemaResponseDTO describeTable(String sourceId, String schema, String table) {
        if (!DEFAULT_SOURCE_ID.equals(sourceId)) {
            throw new IllegalArgumentException("Source '" + sourceId + "' is not configured.");
        }
        String validSchema = validateIdentifier(schema);
        String validTable = validateIdentifier(table);

        String colSql = """
            SELECT 
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION,
                c.NUMERIC_SCALE,
                c.IS_NULLABLE,
                COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
            ORDER BY c.ORDINAL_POSITION
            """;

        String pkSql = """
            SELECT kcu.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
            """;

        Set<String> pkCols = new HashSet<>(jdbcTemplate.query(
            pkSql,
            (rs, rowNum) -> rs.getString("COLUMN_NAME"),
            validSchema,
            validTable
        ));

        List<ColumnSchemaDTO> columns = jdbcTemplate.query(colSql, (rs, rowNum) -> {
            String colName = rs.getString("COLUMN_NAME");
            String dt = rs.getString("DATA_TYPE").toLowerCase();
            int charLen = rs.getInt("CHARACTER_MAXIMUM_LENGTH");
            int numPrec = rs.getInt("NUMERIC_PRECISION");
            int numScale = rs.getInt("NUMERIC_SCALE");
            boolean isNullable = "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE"));
            boolean isIdentity = rs.getInt("is_identity") == 1;

            String formattedType;
            if (dt.contains("char")) {
                formattedType = dt.toUpperCase() + (charLen == -1 ? "(MAX)" : "(" + charLen + ")");
            } else if ("decimal".equals(dt) || "numeric".equals(dt)) {
                formattedType = dt.toUpperCase() + "(" + numPrec + "," + numScale + ")";
            } else {
                formattedType = dt.toUpperCase();
            }

            return new ColumnSchemaDTO(colName, formattedType, isNullable, pkCols.contains(colName), isIdentity);
        }, validSchema, validTable);

        if (columns.isEmpty()) {
            throw new IllegalArgumentException("Table '" + validSchema + "." + validTable + "' not found.");
        }

        String countSql = "SELECT COUNT(*) FROM [" + validSchema + "].[" + validTable + "]";
        Long totalRows = jdbcTemplate.queryForObject(countSql, Long.class);

        return new TableSchemaResponseDTO(
            sourceId,
            validSchema,
            validTable,
            totalRows != null ? totalRows : 0L,
            columns.size(),
            new ArrayList<>(pkCols),
            columns
        );
    }
}
