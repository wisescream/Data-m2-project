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
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
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

        // 2. Secondary Live Source (mapped to finlake-postgres-source)
        sourceRegistry.put("retail-pos-pg", new DataSourceItemDTO(
                "retail-pos-pg",
                "retail-pos-pg",
                "PostgreSQL",
                "postgres-source:5432",
                5432,
                "retail_banking",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(10),
                "PostgreSQL 16.15 (Alpine)"
        ));
        sourceConfigs.put("retail-pos-pg", new SourceProbeRequestDTO(
                "retail-pos-pg", "postgresql", "postgres-source", 5432,
                "retail_banking", "postgresql", "finlake_user", "FinLake2026!StrongPass#",
                false, true, 30
        ));

        // 3. CRM Sales Source
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
        boolean isPostgres = (req.type() != null && req.type().toLowerCase().contains("postgres"))
                || (req.authMethod() != null && req.authMethod().toLowerCase().contains("postgres"))
                || (req.port() != null && (req.port() == 5432 || req.port() == 5434));

        int defaultEnginePort = isPostgres ? 5432 : defaultPort;
        String defaultEngineDb = isPostgres ? "retail_banking" : "finlake_source";
        String defaultEngineUser = isPostgres ? "finlake_user" : defaultUser;

        String host = (req.host() != null && !req.host().isBlank()) ? req.host().trim() : defaultHost;
        int port = (req.port() != null && req.port() > 0) ? req.port() : defaultEnginePort;
        String database = (req.database() != null && !req.database().isBlank()) ? req.database().trim() : defaultEngineDb;
        String user = (req.username() != null) ? req.username().trim() : defaultEngineUser;
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

        // Step 2, 3 & 4: TLS negotiation, Authenticate and Open database
        String step2Detail = encrypt
                ? (trustCert ? "Chiffrée (TLS · Certificat approuvé)" : "Chiffrée (TLS · Validation stricte)")
                : "Non chiffrée (Standard)";

        String jdbcUrl;
        if (isPostgres) {
            String sslParam = encrypt ? "sslmode=prefer" : "sslmode=disable";
            jdbcUrl = String.format("jdbc:postgresql://%s:%d/%s?%s&loginTimeout=%d&connectTimeout=%d",
                    host, port, database, sslParam, timeoutSeconds, timeoutSeconds);
        } else {
            jdbcUrl = String.format(
                    "jdbc:sqlserver://%s:%d;databaseName=%s;encrypt=%b;trustServerCertificate=%b;loginTimeout=%d;socketTimeout=%d",
                    host, port, database, encrypt, trustCert, timeoutSeconds, timeoutSeconds * 1000
            );
        }

        try (Connection conn = DriverManager.getConnection(jdbcUrl, user, pass);
             Statement stmt = conn.createStatement()) {

            // Step 2 validated
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", step2Detail, "success"));

            // Step 3: Authentication succeeded
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "success"));

            // Open database & fetch version
            String serverVersion = isPostgres ? "PostgreSQL" : "Microsoft SQL Server";
            String versionQuery = isPostgres
                    ? "SELECT version() AS ver, current_database() AS db"
                    : "SELECT @@VERSION AS ver, DB_NAME() AS db";

            try (ResultSet rs = stmt.executeQuery(versionQuery)) {
                if (rs.next()) {
                    String rawVer = rs.getString("ver");
                    if (rawVer != null) {
                        serverVersion = rawVer.split("\n")[0].trim();
                        if (serverVersion.length() > 65) serverVersion = serverVersion.substring(0, 65);
                    }
                }
            }

            // Query live tables as proof of active data access
            List<String> discoveredTables = new ArrayList<>();
            String tableQuery = isPostgres
                    ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT 6"
                    : "SELECT TOP 6 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME";
            try (Statement tblStmt = conn.createStatement();
                 ResultSet tblRs = tblStmt.executeQuery(tableQuery)) {
                while (tblRs.next()) {
                    discoveredTables.add(tblRs.getString(1));
                }
            } catch (Exception tblEx) {
                log.warn("Table discovery query failed during probe: {}", tblEx.getMessage());
            }

            String step4Detail = database + (discoveredTables.isEmpty() ? "" : " (" + discoveredTables.size() + " tables en ligne)");
            steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", step4Detail, "success"));
            long duration = System.currentTimeMillis() - start;

            return new SourceProbeResponseDTO(
                    "success",
                    "La plateforme a joint le serveur, s'est authentifiée et a ouvert " + database + ".",
                    serverVersion,
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of(),
                    discoveredTables
            );

        } catch (Exception ex) {
            long duration = System.currentTimeMillis() - start;
            String msg = ex.getMessage();

            boolean isSslFailure = msg != null && (
                    msg.contains("PKIX") ||
                    msg.contains("SSL") ||
                    msg.contains("certificate") ||
                    msg.contains("handshake") ||
                    msg.contains("CertPath") ||
                    msg.contains("valid certification path")
            );

            boolean isAuthFailure = msg != null && (
                    msg.contains("Login failed") ||
                    msg.contains("18456") ||
                    msg.contains("password authentication failed") ||
                    msg.contains("28P01") ||
                    msg.contains("authentification")
            );

            if (isSslFailure) {
                steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", "Échec TLS (certificat non approuvé)", "failed"));
                steps.add(new SourceProbeStepDTO(3, "S'authentifier", "Non exécutée, car la négociation TLS a échoué", "skipped"));
                steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", "Ignoré", "skipped"));

                return new SourceProbeResponseDTO(
                        "failed",
                        "Échec de la validation TLS/SSL. Le certificat du serveur distant n'a pas pu être validé.",
                        null,
                        duration,
                        LocalDateTime.now(),
                        steps,
                        "Erreur SSL/TLS : " + msg,
                        List.of(
                                "Activer l'option 'Faire confiance au certificat du serveur' si votre base utilise un certificat auto-signé.",
                                "Vérifier que le certificat SSL du serveur est valide et n'a pas expiré.",
                                "Désactiver l'option 'Chiffrer la connexion' si le serveur distant ne requiert pas TLS."
                        )
                );
            } else if (isAuthFailure) {
                steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", step2Detail, "success"));
                steps.add(new SourceProbeStepDTO(3, "S'authentifier", "Identifiants refusés pour " + user, "failed"));
                steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", "Non exécutée, car l'authentification a échoué", "skipped"));

                String errCode = isPostgres
                        ? "Erreur 28P01 · Password authentication failed for user '" + user + "'"
                        : "Erreur 18456 · Login failed for user '" + user + "'";
                List<String> checklist = isPostgres
                        ? List.of(
                                "Le nom d'utilisateur et le mot de passe sont valides pour PostgreSQL.",
                                "Le rôle PostgreSQL possède les privilèges de connexion.",
                                "La méthode d'authentification dans pg_hba.conf autorise cet utilisateur."
                        )
                        : List.of(
                                "Le nom d'utilisateur et le mot de passe sont saisis correctement.",
                                "Le compte est actif et n'est pas verrouillé sur le serveur.",
                                "Le serveur autorise l'authentification SQL Server, et pas seulement l'authentification Windows."
                        );

                return new SourceProbeResponseDTO(
                        "failed",
                        "Échec de la connexion à l'authentification. Le serveur a été joint, mais il a refusé le nom d'utilisateur ou le mot de passe.",
                        null,
                        duration,
                        LocalDateTime.now(),
                        steps,
                        errCode + ". Échec après " + String.format("%.1f", duration / 1000.0) + " s",
                        checklist
                );
            } else {
                steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", step2Detail, "success"));
                steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "success"));
                steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", "Impossible d'accéder à " + database, "failed"));

                return new SourceProbeResponseDTO(
                        "failed",
                        "Impossible d'ouvrir la base de données " + database + ". Vérifiez l'existence de la base et les permissions du compte.",
                        null,
                        duration,
                        LocalDateTime.now(),
                        steps,
                        "Erreur base de données : " + ex.getMessage(),
                        List.of(
                                "La base de données '" + database + "' existe bien sur l'instance.",
                                "L'utilisateur '" + user + "' dispose du droit CONNECT / USE sur cette base.",
                                "Le schéma par défaut est accessible."
                        )
                );
            }
        }
    }

    public DataSourceItemDTO registerSource(SourceProbeRequestDTO req) {
        String id = req.connectionName().toLowerCase().trim().replace(" ", "-");
        boolean isPostgres = (req.type() != null && req.type().toLowerCase().contains("postgres"))
                || (req.authMethod() != null && req.authMethod().toLowerCase().contains("postgres"))
                || (req.port() != null && (req.port() == 5432 || req.port() == 5434));
        int port = (req.port() != null && req.port() > 0) ? req.port() : (isPostgres ? 5432 : 1433);
        String hostWithPort = req.host().trim() + ":" + port;
        String typeDisplay = isPostgres ? "PostgreSQL" : "SQL Server";

        // Run live probe to determine initial status
        SourceProbeResponseDTO probe = probeConnection(req);

        DataSourceItemDTO item = new DataSourceItemDTO(
                id,
                req.connectionName().trim(),
                typeDisplay,
                hostWithPort,
                port,
                req.database().trim(),
                probe.status().equals("success") ? "connected" : "failed",
                probe.status().equals("success") ? null : probe.summary(),
                LocalDateTime.now(),
                probe.serverVersion()
        );

        sourceRegistry.put(id, item);
        sourceConfigs.put(id, req);
        log.info("Registered new data source: {} ({}) with status: {}", id, typeDisplay, item.status());
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

    private Connection getConnectionForSource(String sourceId) throws SQLException {
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        if (config == null) {
            return jdbcTemplate.getDataSource().getConnection();
        }
        boolean isPostgres = (config.type() != null && config.type().toLowerCase().contains("postgres"))
                || (config.authMethod() != null && config.authMethod().toLowerCase().contains("postgres"))
                || (config.port() != null && (config.port() == 5432 || config.port() == 5434));

        String host = (config.host() != null && !config.host().isBlank()) ? config.host().trim() : defaultHost;
        int port = (config.port() != null && config.port() > 0) ? config.port() : (isPostgres ? 5432 : defaultPort);
        String database = (config.database() != null && !config.database().isBlank()) ? config.database().trim() : (isPostgres ? "retail_banking" : "finlake_source");
        String user = (config.username() != null) ? config.username().trim() : (isPostgres ? "finlake_user" : defaultUser);
        String pass = (config.password() != null) ? config.password() : "";

        if (isPostgres) {
            String sslParam = (config.encrypt() != null && config.encrypt()) ? "sslmode=prefer" : "sslmode=disable";
            String url = String.format("jdbc:postgresql://%s:%d/%s?%s&loginTimeout=10", host, port, database, sslParam);
            return DriverManager.getConnection(url, user, pass);
        } else {
            boolean encrypt = config.encrypt() != null ? config.encrypt() : true;
            boolean trustCert = config.trustServerCertificate() != null ? config.trustServerCertificate() : true;
            String url = String.format(
                    "jdbc:sqlserver://%s:%d;databaseName=%s;encrypt=%b;trustServerCertificate=%b;loginTimeout=10",
                    host, port, database, encrypt, trustCert
            );
            return DriverManager.getConnection(url, user, pass);
        }
    }

    public TableListResponseDTO listTables(String sourceId, String schema) {
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        boolean isPostgres = config != null && (
                (config.type() != null && config.type().toLowerCase().contains("postgres")) ||
                (config.port() != null && (config.port() == 5432 || config.port() == 5434))
        );
        String targetSchema = (isPostgres && ("dbo".equalsIgnoreCase(schema) || schema == null)) ? "public" : schema;
        String validSchema = validateIdentifier(targetSchema);

        String sql = """
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
            """;
        List<String> tables = new ArrayList<>();
        try (Connection conn = getConnectionForSource(sourceId);
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, validSchema);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    tables.add(rs.getString("TABLE_NAME"));
                }
            }
        } catch (Exception e) {
            log.error("Failed to list tables for source {}: {}", sourceId, e.getMessage());
        }
        return new TableListResponseDTO(sourceId, validSchema, tables);
    }

    public TableSchemaResponseDTO describeTable(String sourceId, String schema, String table) {
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        boolean isPostgres = config != null && (
                (config.type() != null && config.type().toLowerCase().contains("postgres")) ||
                (config.port() != null && (config.port() == 5432 || config.port() == 5434))
        );
        String targetSchema = (isPostgres && ("dbo".equalsIgnoreCase(schema) || schema == null)) ? "public" : schema;
        String validSchema = validateIdentifier(targetSchema);
        String validTable = validateIdentifier(table);

        List<ColumnSchemaDTO> columns = new ArrayList<>();
        Set<String> pkSet = new HashSet<>();
        long totalRows = 0L;

        try (Connection conn = getConnectionForSource(sourceId)) {
            // 1. Primary keys
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
            try (PreparedStatement psPk = conn.prepareStatement(pkSql)) {
                psPk.setString(1, validSchema);
                psPk.setString(2, validTable);
                try (ResultSet rs = psPk.executeQuery()) {
                    while (rs.next()) {
                        pkSet.add(rs.getString("COLUMN_NAME"));
                    }
                }
            }

            // 2. Columns
            String colSql = isPostgres
                    ? """
                      SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, (c.IS_IDENTITY = 'YES') AS is_identity
                      FROM INFORMATION_SCHEMA.COLUMNS c
                      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
                      ORDER BY c.ORDINAL_POSITION
                      """
                    : """
                      SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
                             COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity
                      FROM INFORMATION_SCHEMA.COLUMNS c
                      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
                      ORDER BY c.ORDINAL_POSITION
                      """;

            try (PreparedStatement psCol = conn.prepareStatement(colSql)) {
                psCol.setString(1, validSchema);
                psCol.setString(2, validTable);
                try (ResultSet rs = psCol.executeQuery()) {
                    while (rs.next()) {
                        String colName = rs.getString("COLUMN_NAME");
                        boolean isIdentity = isPostgres ? rs.getBoolean("is_identity") : (rs.getInt("is_identity") == 1);
                        columns.add(new ColumnSchemaDTO(
                                colName,
                                rs.getString("DATA_TYPE"),
                                "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")),
                                pkSet.contains(colName),
                                isIdentity
                        ));
                    }
                }
            }

            // 3. Row count
            String countSql = isPostgres
                    ? "SELECT COUNT(*) FROM \"" + validSchema + "\".\"" + validTable + "\""
                    : "SELECT COUNT_BIG(*) FROM [" + validSchema + "].[" + validTable + "]";
            try (Statement countStmt = conn.createStatement();
                 ResultSet rs = countStmt.executeQuery(countSql)) {
                if (rs.next()) {
                    totalRows = rs.getLong(1);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to describe table {}.{} on source {}: {}", validSchema, validTable, sourceId, e.getMessage());
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
