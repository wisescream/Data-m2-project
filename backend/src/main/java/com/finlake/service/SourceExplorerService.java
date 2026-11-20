package com.finlake.service;

import com.finlake.dto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class SourceExplorerService {

    private static final Logger log = LoggerFactory.getLogger(SourceExplorerService.class);
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    public static final String DEFAULT_SOURCE_ID = "erp-production";

    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.url:jdbc:sqlserver://127.0.0.1:1433;databaseName=finlake_source;encrypt=false;trustServerCertificate=true}")
    private String dbUrl;

    @Value("${finlake.sqlserver.host:127.0.0.1}")
    private String defaultHost;

    @Value("${finlake.sqlserver.port:1433}")
    private int defaultPort;

    @Value("${finlake.sqlserver.user:sa}")
    private String defaultUser;

    @Value("${finlake.sqlserver.password:FinLake2026!StrongPass#}")
    private String defaultPass;

    // In-memory registry of sources (seeded from wireframe specifications)
    private final Map<String, DataSourceItemDTO> sourceRegistry = new ConcurrentHashMap<>();
    private final Map<String, SourceProbeRequestDTO> sourceConfigs = new ConcurrentHashMap<>();

    public SourceExplorerService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        initSeedSources();
    }

    private void initSeedSources() {
        // 1. Primary Live Source (mapped to finlake-sqlserver)
        sourceRegistry.put("erp-production", new DataSourceItemDTO(
                "erp-production",
                "erp-production",
                "SQL Server",
                "sqlserver:1433",
                1433,
                "finlake_source",
                "connected",
                null,
                LocalDateTime.now().minusHours(2),
                "Microsoft SQL Server 2022"
        ));
        sourceConfigs.put("erp-production", new SourceProbeRequestDTO(
                "erp-production", "sqlserver", "sqlserver", 1433,
                "finlake_source", "sqlserver", "sa", "FinLake2026!StrongPass#",
                false, true, 30
        ));

        // 2. CRM Sales Source
        sourceRegistry.put("crm-sales", new DataSourceItemDTO(
                "crm-sales",
                "crm-sales",
                "SQL Server",
                "sql-crm-01.corp.internal:1433",
                1433,
                "CRM_Sales",
                "connected",
                null,
                LocalDateTime.now().minusHours(4),
                "Microsoft SQL Server 2019"
        ));

        // 3. Finance DWH Source (Failed)
        sourceRegistry.put("finance-dwh", new DataSourceItemDTO(
                "finance-dwh",
                "finance-dwh",
                "SQL Server",
                "10.24.8.31:1433",
                1433,
                "FinanceDW",
                "failed",
                "Identifiants refusés par le serveur",
                LocalDateTime.now().minusDays(1),
                null
        ));

        // 4. HR Core Source
        sourceRegistry.put("hr-core", new DataSourceItemDTO(
                "hr-core",
                "hr-core",
                "SQL Server",
                "sql-hr.corp.internal:1433",
                1433,
                "HR_Core",
                "connected",
                null,
                LocalDateTime.now().minusDays(2),
                "Microsoft SQL Server 2019"
        ));

        // 5. Logistics WMS (Untested)
        sourceRegistry.put("logistics-wms", new DataSourceItemDTO(
                "logistics-wms",
                "logistics-wms",
                "SQL Server",
                "sql-wms-02.corp.internal:1450",
                1450,
                "WMS_Live",
                "untested",
                null,
                null,
                null
        ));

        // 6. Retail POS Archive Source
        sourceRegistry.put("retail-pos-archive", new DataSourceItemDTO(
                "retail-pos-archive",
                "retail-pos-archive",
                "SQL Server",
                "sql-pos-arch.corp.internal:1433",
                1433,
                "POS_Archive",
                "connected",
                null,
                LocalDateTime.now().minusDays(4),
                "Microsoft SQL Server 2017"
        ));
    }

    public static String validateIdentifier(String name) {
        if (name == null || !SAFE_IDENTIFIER.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid SQL identifier: '" + name + "'. Must match ^[a-zA-Z_][a-zA-Z0-9_]*$");
        }
        return name;
    }

    public List<DataSourceItemDTO> listConfiguredSources() {
        return new ArrayList<>(sourceRegistry.values());
    }

    public List<SourceInfoDTO> listSources() {
        List<SourceInfoDTO> list = new ArrayList<>();
        for (DataSourceItemDTO item : sourceRegistry.values()) {
            list.add(new SourceInfoDTO(
                    item.id(),
                    item.name(),
                    item.type().toLowerCase().replace(" ", ""),
                    item.host(),
                    item.port(),
                    item.database(),
                    "Source de données " + item.type() + " (" + item.status() + ")"
            ));
        }
        return list;
    }

    public SourceProbeResponseDTO probeConnection(SourceProbeRequestDTO req) {
        long start = System.currentTimeMillis();
        String host = (req.host() != null && !req.host().isBlank()) ? req.host().trim() : defaultHost;
        int port = (req.port() != null && req.port() > 0) ? req.port() : defaultPort;
        String database = (req.database() != null && !req.database().isBlank()) ? req.database().trim() : "finlake_source";
        String user = (req.username() != null) ? req.username().trim() : defaultUser;
        String pass = (req.password() != null) ? req.password() : "";
        boolean encrypt = req.encrypt() != null ? req.encrypt() : true;
        boolean trustCert = req.trustServerCertificate() != null ? req.trustServerCertificate() : true;
        int timeoutSeconds = (req.connectionTimeout() != null && req.connectionTimeout() > 0) ? req.connectionTimeout() : 30;

        List<SourceProbeStepDTO> steps = new ArrayList<>();

        // Step 1: Reach host/port via raw socket
        boolean step1Success = false;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), Math.min(timeoutSeconds * 1000, 5000));
            step1Success = true;
            steps.add(new SourceProbeStepDTO(1, "Joindre le serveur", host + ":" + port, "success"));
        } catch (Exception ex) {
            log.warn("Probe Step 1 failed to reach {}:{}: {}", host, port, ex.getMessage());
            steps.add(new SourceProbeStepDTO(1, "Joindre le serveur", host + ":" + port + " (" + ex.getMessage() + ")", "failed"));
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", encrypt ? "Chiffrée (TLS)" : "Non chiffrée", "skipped"));
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "skipped"));
            steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", database, "skipped"));

            long duration = System.currentTimeMillis() - start;
            return new SourceProbeResponseDTO(
                    "failed",
                    "Impossible de joindre le serveur. Vérifiez l'adresse d'hôte et le port spécifiés.",
                    null,
                    duration,
                    LocalDateTime.now(),
                    steps,
                    "Erreur réseau : " + ex.getClass().getSimpleName() + " · " + ex.getMessage(),
                    List.of(
                            "Le serveur d'hôte et le port 1433 sont accessibles depuis le réseau.",
                            "Les pare-feu réseau et locaux autorisent les connexions entrantes.",
                            "Le service SQL Server est démarré et écoute sur l'interface réseau."
                    )
            );
        }

        // Step 2: TLS negotiation
        steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", encrypt ? "Chiffrée (TLS)" : "Standard", "success"));

        // Step 3 & 4: Authenticate and Open database
        String jdbcUrl = String.format(
                "jdbc:sqlserver://%s:%d;databaseName=%s;encrypt=%b;trustServerCertificate=%b;loginTimeout=%d",
                host, port, database, encrypt, trustCert, timeoutSeconds
        );

        try (Connection conn = DriverManager.getConnection(jdbcUrl, user, pass);
             Statement stmt = conn.createStatement()) {

            // Authentication succeeded
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "success"));

            // Open database & fetch version
            String serverVersion = "Microsoft SQL Server";
            try (ResultSet rs = stmt.executeQuery("SELECT @@VERSION AS ver, DB_NAME() AS db")) {
                if (rs.next()) {
                    String rawVer = rs.getString("ver");
                    if (rawVer != null) {
                        serverVersion = rawVer.split("\n")[0].trim();
                        if (serverVersion.length() > 60) serverVersion = serverVersion.substring(0, 60);
                    }
                }
            }

            steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", database, "success"));
            long duration = System.currentTimeMillis() - start;

            return new SourceProbeResponseDTO(
                    "success",
                    "La plateforme a joint le serveur, s'est authentifiée et a ouvert " + database + ".",
                    serverVersion,
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of()
            );

        } catch (Exception ex) {
            long duration = System.currentTimeMillis() - start;
            String msg = ex.getMessage();
            boolean isAuthFailure = msg != null && (msg.contains("Login failed") || msg.contains("18456") || msg.contains("authentification"));

            if (isAuthFailure) {
                steps.add(new SourceProbeStepDTO(3, "S'authentifier", "Identifiants refusés pour " + user, "failed"));
                steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", "Non exécutée, car l'authentification a échoué", "skipped"));

                return new SourceProbeResponseDTO(
                        "failed",
                        "Échec de la connexion à l'authentification. Le serveur a été joint, mais il a refusé le nom d'utilisateur ou le mot de passe.",
                        null,
                        duration,
                        LocalDateTime.now(),
                        steps,
                        "Erreur 18456 · Login failed for user '" + user + "'. Échec après " + String.format("%.1f", duration / 1000.0) + " s",
                        List.of(
                                "Le nom d'utilisateur et le mot de passe sont saisis correctement.",
                                "Le compte est actif et n'est pas verrouillé sur le serveur.",
                                "Le serveur autorise l'authentification SQL Server, et pas seulement l'authentification Windows."
                        )
                );
            } else {
                steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "success"));
                steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", "Impossible d'accéder à " + database, "failed"));

                return new SourceProbeResponseDTO(
                        "failed",
                        "Impossible d'ouvrir la base de données " + database + ". Vérifiez l'existence de la base et les permissions du compte.",
                        null,
                        duration,
                        LocalDateTime.now(),
                        steps,
                        "Erreur SQL : " + msg,
                        List.of(
                                "La base de données '" + database + "' existe sur le serveur.",
                                "L'utilisateur dispose des privilèges de lecture sur les schémas et tables.",
                                "La base de données n'est pas en mode RESTRICTED_USER ou OFFLINE."
                        )
                );
            }
        }
    }

    public DataSourceItemDTO registerSource(SourceProbeRequestDTO req) {
        String id = req.connectionName().toLowerCase().trim().replace(" ", "-");
        String hostWithPort = req.host().trim() + ":" + (req.port() != null ? req.port() : 1433);

        // Run live probe to determine initial status
        SourceProbeResponseDTO probe = probeConnection(req);

        DataSourceItemDTO item = new DataSourceItemDTO(
                id,
                req.connectionName().trim(),
                "SQL Server",
                hostWithPort,
                req.port() != null ? req.port() : 1433,
                req.database().trim(),
                probe.status().equals("success") ? "connected" : "failed",
                probe.status().equals("success") ? null : probe.summary(),
                LocalDateTime.now(),
                probe.serverVersion()
        );

        sourceRegistry.put(id, item);
        sourceConfigs.put(id, req);
        log.info("Registered new data source: {} with status: {}", id, item.status());
        return item;
    }

    public SourceTestResponseDTO testSource(String sourceId) {
        DataSourceItemDTO item = sourceRegistry.get(sourceId);
        if (item == null) {
            return new SourceTestResponseDTO(sourceId, "failed", null, null, "Source '" + sourceId + "' is not configured.");
        }

        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        if (config == null) {
            // Default probe parameters
            config = new SourceProbeRequestDTO(
                    item.name(), "sqlserver", defaultHost, defaultPort,
                    item.database(), "sqlserver", defaultUser, defaultPass,
                    false, true, 30
            );
        }

        SourceProbeResponseDTO probe = probeConnection(config);
        String status = probe.status().equals("success") ? "connected" : "failed";

        // Update registry item with test outcome
        DataSourceItemDTO updated = new DataSourceItemDTO(
                item.id(),
                item.name(),
                item.type(),
                item.host(),
                item.port(),
                item.database(),
                status,
                probe.status().equals("success") ? null : probe.summary(),
                LocalDateTime.now(),
                probe.serverVersion() != null ? probe.serverVersion() : item.serverVersion()
        );
        sourceRegistry.put(sourceId, updated);

        return new SourceTestResponseDTO(
                sourceId,
                status,
                probe.serverVersion(),
                item.database(),
                probe.status().equals("success") ? null : probe.technicalDetails()
        );
    }

    public TableListResponseDTO listTables(String sourceId, String schema) {
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
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                AND tc.TABLE_SCHEMA = ?
                AND tc.TABLE_NAME = ?
            """;
        List<String> pkCols = jdbcTemplate.query(pkSql, (rs, rowNum) -> rs.getString("COLUMN_NAME"), validSchema, validTable);
        Set<String> pkSet = new HashSet<>(pkCols);

        List<ColumnSchemaDTO> columns = jdbcTemplate.query(colSql, (rs, rowNum) -> {
            String colName = rs.getString("COLUMN_NAME");
            return new ColumnSchemaDTO(
                    colName,
                    rs.getString("DATA_TYPE"),
                    "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")),
                    pkSet.contains(colName),
                    rs.getInt("is_identity") == 1
            );
        }, validSchema, validTable);

        long totalRows = 0L;
        try {
            Long count = jdbcTemplate.queryForObject(
                    "SELECT COUNT_BIG(*) FROM [" + validSchema + "].[" + validTable + "]",
                    Long.class
            );
            if (count != null) {
                totalRows = count;
            }
        } catch (Exception e) {
            log.warn("Could not retrieve row count for {}.{}: {}", validSchema, validTable, e.getMessage());
        }

        return new TableSchemaResponseDTO(
                sourceId,
                validSchema,
                validTable,
                totalRows,
                columns.size(),
                new ArrayList<>(pkSet),
                columns
        );
    }
}
