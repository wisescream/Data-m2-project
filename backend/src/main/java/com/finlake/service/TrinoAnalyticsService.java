package com.finlake.service;

import com.finlake.dto.QueryResultDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

@Service
public class TrinoAnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(TrinoAnalyticsService.class);

    @Value("${finlake.trino.host:127.0.0.1}")
    private String trinoHost = "127.0.0.1";

    @Value("${finlake.trino.port:8080}")
    private int trinoPort = 8080;

    @Value("${finlake.trino.user:finlake}")
    private String trinoUser = "finlake";

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

        String targetCatalog = (catalog != null && !catalog.isBlank()) ? catalog : "hive";
        String targetSchema = (schema != null && !schema.isBlank()) ? schema : "default";

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
}
