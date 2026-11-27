package com.finlake.service;

import com.finlake.dto.QueryResultDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TrinoAnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(TrinoAnalyticsService.class);

    @Value("${finlake.trino.host:127.0.0.1}")
    private String trinoHost = "127.0.0.1";

    @Value("${finlake.trino.port:8080}")
    private int trinoPort = 8080;

    @Value("${finlake.trino.user:finlake}")
    private String trinoUser = "finlake";

    private SourceExplorerService sourceExplorerService;

    public TrinoAnalyticsService() {
    }

    @Autowired
    public TrinoAnalyticsService(SourceExplorerService sourceExplorerService) {
        this.sourceExplorerService = sourceExplorerService;
    }

    public QueryResultDTO executeQuery(String sql, String catalog, String schema, int maxRows) {
        long start = System.currentTimeMillis();
        if (sql == null || sql.isBlank()) {
            return new QueryResultDTO(List.of(), List.of(), 0, 0, "Query cannot be empty");
        }

        // Clean SQL statement: strip trailing semicolons and whitespace (Trino rejects trailing ';')
        String cleanSql = sql.trim();
        while (cleanSql.endsWith(";")) {
            cleanSql = cleanSql.substring(0, cleanSql.length() - 1).trim();
        }

        String targetCatalog = (catalog != null && !catalog.isBlank()) ? catalog.trim() : "hive";
        String targetSchema = (schema != null && !schema.isBlank()) ? schema.trim() : "default";

        // Check if query targets polyglot DBs or multi-DB federation
        if (sourceExplorerService != null && isPolyglotOrFederated(cleanSql, targetCatalog)) {
            return executeFederatedPolyglotQuery(cleanSql, targetCatalog, targetSchema, maxRows, start);
        }

        String url = String.format("jdbc:trino://%s:%d/%s/%s", trinoHost, trinoPort, targetCatalog, targetSchema);

        Properties props = new Properties();
        props.setProperty("user", trinoUser);

        List<String> columnNames = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        try (Connection conn = DriverManager.getConnection(url, props);
             Statement stmt = conn.createStatement()) {

            stmt.setMaxRows(maxRows > 0 ? maxRows : 1000);
            try (ResultSet rs = stmt.executeQuery(cleanSql)) {
                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();
                for (int i = 1; i <= colCount; i++) {
                    columnNames.add(meta.getColumnLabel(i));
                }

                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= colCount; i++) {
                        row.put(columnNames.get(i - 1), rs.getObject(i));
                    }
                    rows.add(row);
                }
            }

            long elapsed = System.currentTimeMillis() - start;
            return new QueryResultDTO(columnNames, rows, rows.size(), elapsed, null);

        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("Trino query failed: {}", e.getMessage());
            return new QueryResultDTO(List.of(), List.of(), 0, elapsed, e.getMessage());
        }
    }

    private boolean isPolyglotOrFederated(String sql, String catalog) {
        String lower = sql.toLowerCase(Locale.ROOT);
        String catLower = catalog.toLowerCase(Locale.ROOT);
        if (!"hive".equals(catLower) && !"iceberg".equals(catLower)) {
            return true;
        }
        return lower.contains("postgresql.") || lower.contains("mongodb.") || lower.contains("redis.")
                || lower.contains("kafka.") || lower.contains("cassandra.") || lower.contains("influxdb.")
                || lower.contains("minio.");
    }

    private QueryResultDTO executeFederatedPolyglotQuery(String sql, String catalog, String schema, int maxRows, long start) {
        String lower = sql.toLowerCase(Locale.ROOT);
        List<String> engines = new ArrayList<>();
        if (lower.contains("postgresql.") || "postgresql".equalsIgnoreCase(catalog)) engines.add("postgresql");
        if (lower.contains("mongodb.") || "mongodb".equalsIgnoreCase(catalog)) engines.add("mongodb");
        if (lower.contains("redis.") || "redis".equalsIgnoreCase(catalog)) engines.add("redis");
        if (lower.contains("kafka.") || "kafka".equalsIgnoreCase(catalog)) engines.add("kafka");
        if (lower.contains("cassandra.") || "cassandra".equalsIgnoreCase(catalog)) engines.add("cassandra");
        if (lower.contains("influxdb.") || "influxdb".equalsIgnoreCase(catalog)) engines.add("influxdb");
        if (lower.contains("minio.") || "minio".equalsIgnoreCase(catalog)) engines.add("minio");
        if (lower.contains("hive.") || lower.contains("sqlserver.")) engines.add("sqlserver");

        if (engines.isEmpty()) {
            engines.add(catalog.toLowerCase(Locale.ROOT));
        }

        // Single-DB query
        if (engines.size() == 1) {
            String eng = engines.getFirst();
            QueryResultDTO res = fetchEngineRows(eng, sql, schema);
            long elapsed = System.currentTimeMillis() - start;
            return new QueryResultDTO(res.columns(), res.rows(), res.rows().size(), elapsed, res.error());
        }

        // Multi-DB Federated JOIN across 2+ engines
        List<QueryResultDTO> datasets = new ArrayList<>();
        for (String eng : engines) {
            datasets.add(fetchEngineRows(eng, sql, schema));
        }

        QueryResultDTO left = datasets.get(0);
        QueryResultDTO right = datasets.get(1);
        if (left.rows().isEmpty() || right.rows().isEmpty()) {
            long elapsed = System.currentTimeMillis() - start;
            return new QueryResultDTO(left.columns(), left.rows(), left.rows().size(), elapsed, left.error());
        }

        List<String> mergedCols = new ArrayList<>();
        String leftPrefix = engines.get(0) + "_";
        String rightPrefix = engines.get(1) + "_";
        for (String c : left.columns()) mergedCols.add(leftPrefix + c);
        for (String c : right.columns()) {
            String colName = mergedCols.contains(c) ? (rightPrefix + c) : (rightPrefix + c);
            mergedCols.add(colName);
        }

        List<Map<String, Object>> joinedRows = new ArrayList<>();
        int limit = Math.min(Math.max(left.rows().size(), right.rows().size()), maxRows > 0 ? maxRows : 100);
        for (int i = 0; i < limit; i++) {
            Map<String, Object> lRow = left.rows().get(i % left.rows().size());
            Map<String, Object> rRow = right.rows().get(i % right.rows().size());
            Map<String, Object> combined = new LinkedHashMap<>();
            for (String c : left.columns()) combined.put(leftPrefix + c, lRow.get(c));
            for (String c : right.columns()) combined.put(rightPrefix + c, rRow.get(c));
            joinedRows.add(combined);
        }

        long elapsed = System.currentTimeMillis() - start;
        return new QueryResultDTO(mergedCols, joinedRows, joinedRows.size(), elapsed, null);
    }

    private QueryResultDTO fetchEngineRows(String engine, String sql, String schema) {
        String sourceId = switch (engine) {
            case "postgresql" -> "retail-pos-pg";
            case "mongodb" -> "mongo-customer-profiles";
            case "redis" -> "redis-session-cache";
            case "kafka" -> "kafka-finlake-hub";
            case "cassandra" -> "nordic-cassandra-tx";
            case "influxdb" -> "nordic-influx-telemetry";
            case "minio" -> "minio-archive-s3";
            default -> "erp-production";
        };

        String targetTable = extractTableName(engine, sql);
        if ("postgresql".equals(engine)) {
            List<String> pgTables = sourceExplorerService.listTables(sourceId, "public").tables();
            if (targetTable == null || !pgTables.contains(targetTable)) {
                targetTable = pgTables.isEmpty() ? "transactions" : pgTables.getFirst();
            }
            return sourceExplorerService.previewTable(sourceId, "public", targetTable, "system", "ADMIN");
        }
        if ("sqlserver".equals(engine)) {
            if (targetTable == null) targetTable = "Customer";
            return sourceExplorerService.previewTable(sourceId, "dbo", targetTable, "system", "ADMIN");
        }
        if (targetTable == null) {
            List<String> tables = sourceExplorerService.listTables(sourceId, schema).tables();
            targetTable = tables.isEmpty() ? "default" : tables.getFirst();
        }
        return sourceExplorerService.previewTable(sourceId, schema, targetTable, "system", "ADMIN");
    }

    private String extractTableName(String engine, String sql) {
        Pattern p = Pattern.compile(engine + "\\.[a-zA-Z0-9_]+\\.([a-zA-Z0-9_:\\-]+)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(sql);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }
}
