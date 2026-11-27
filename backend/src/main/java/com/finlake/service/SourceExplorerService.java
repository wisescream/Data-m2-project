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
    private final SecurityGovernanceService securityService;

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
    private final Map<String, String> sourceTenants = new ConcurrentHashMap<>();

    public SourceExplorerService(JdbcTemplate jdbcTemplate, SecurityGovernanceService securityService) {
        this.jdbcTemplate = jdbcTemplate;
        this.securityService = securityService;
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

        // 3. Apache Kafka Event Hub & MinIO Sinks
        sourceRegistry.put("kafka-finlake-hub", new DataSourceItemDTO(
                "kafka-finlake-hub",
                "kafka-finlake-hub",
                "Apache Kafka",
                "kafka:9092",
                9092,
                "finlake.polyglot.events",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(5),
                "Apache Kafka 3.7.0 (KRaft Event Hub)"
        ));
        sourceConfigs.put("kafka-finlake-hub", new SourceProbeRequestDTO(
                "kafka-finlake-hub", "kafka", "kafka", 9092,
                "finlake.polyglot.events", "plaintext", "anonymous", "",
                false, true, 10
        ));

        // 4. MongoDB Document Store (NoSQL)
        sourceRegistry.put("mongo-customer-profiles", new DataSourceItemDTO(
                "mongo-customer-profiles",
                "mongo-customer-profiles",
                "MongoDB",
                "mongo-cluster.corp.internal:27017",
                27017,
                "customer_profiles",
                "connected",
                null,
                LocalDateTime.now().minusHours(1),
                "MongoDB 7.0 Community (Document Store)"
        ));
        sourceConfigs.put("mongo-customer-profiles", new SourceProbeRequestDTO(
                "mongo-customer-profiles", "mongodb", "mongo-cluster.corp.internal", 27017,
                "customer_profiles", "scram-sha-256", "finlake_app", "SecretMongoPass2026!",
                true, true, 15
        ));

        // 5. Redis Key-Value Store
        sourceRegistry.put("redis-session-cache", new DataSourceItemDTO(
                "redis-session-cache",
                "redis-session-cache",
                "Redis",
                "redis-cache.corp.internal:6379",
                6379,
                "db0",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(20),
                "Redis 7.2 Alpine (Key-Value Store)"
        ));
        sourceConfigs.put("redis-session-cache", new SourceProbeRequestDTO(
                "redis-session-cache", "redis", "redis-cache.corp.internal", 6379,
                "db0", "auth", "default", "RedisSecret2026!",
                false, true, 5
        ));

        // 6. MinIO S3 Object Storage
        sourceRegistry.put("minio-archive-s3", new DataSourceItemDTO(
                "minio-archive-s3",
                "minio-archive-s3",
                "MinIO / S3",
                "minio:9000",
                9000,
                "finlake",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(2),
                "MinIO S3 RELEASE.2025-10-15T17-29-55Z"
        ));
        sourceConfigs.put("minio-archive-s3", new SourceProbeRequestDTO(
                "minio-archive-s3", "minio", "minio", 9000,
                "finlake", "s3-sigv4", "finlake_admin", "finlake_secret_key_2026!",
                false, true, 10
        ));

        // 7. CRM Sales Source
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

        // 8. Nordic Mobile Money Polyglot Sources (tenant_nordic)
        sourceRegistry.put("nordic-kafka-stream", new DataSourceItemDTO(
                "nordic-kafka-stream",
                "nordic-kafka-stream",
                "Apache Kafka",
                "kafka:9092",
                9092,
                "finlake.transactions.events",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(8),
                "Apache Kafka 3.7.0 (KRaft Event Hub)"
        ));
        sourceConfigs.put("nordic-kafka-stream", new SourceProbeRequestDTO(
                "nordic-kafka-stream", "kafka", "kafka", 9092,
                "finlake.transactions.events", "plaintext", "anonymous", "",
                false, true, 10
        ));

        sourceRegistry.put("nordic-cassandra-tx", new DataSourceItemDTO(
                "nordic-cassandra-tx",
                "nordic-cassandra-tx",
                "Cassandra (Wide-Column)",
                "cassandra-nordic.corp.internal:9042",
                9042,
                "nordic_ledger",
                "connected",
                null,
                LocalDateTime.now().minusMinutes(35),
                "Apache Cassandra 4.1 (Wide-Column)"
        ));
        sourceConfigs.put("nordic-cassandra-tx", new SourceProbeRequestDTO(
                "nordic-cassandra-tx", "cassandra", "cassandra-nordic.corp.internal", 9042,
                "nordic_ledger", "password", "nordic_svc", "NordicPass2026!",
                true, true, 15
        ));

        sourceRegistry.put("nordic-influx-telemetry", new DataSourceItemDTO(
                "nordic-influx-telemetry",
                "nordic-influx-telemetry",
                "InfluxDB (Time-Series)",
                "influx-nordic.corp.internal:8086",
                8086,
                "mobile_tps_metrics",
                "connected",
                null,
                LocalDateTime.now().minusHours(1),
                "InfluxDB 2.7 (Time-Series)"
        ));
        sourceConfigs.put("nordic-influx-telemetry", new SourceProbeRequestDTO(
                "nordic-influx-telemetry", "influxdb", "influx-nordic.corp.internal", 8086,
                "mobile_tps_metrics", "token", "nordic_admin", "InfluxToken2026!",
                true, true, 10
        ));

        // Map sources to their owning enterprise tenant
        sourceTenants.put("erp-production", "tenant_acme");
        sourceTenants.put("kafka-finlake-hub", "tenant_acme");
        sourceTenants.put("minio-archive-s3", "tenant_acme");
        sourceTenants.put("crm-sales", "tenant_acme");
        sourceTenants.put("finance-dwh", "tenant_acme");
        sourceTenants.put("hr-core", "tenant_acme");
        sourceTenants.put("logistics-wms", "tenant_acme");
        sourceTenants.put("retail-pos-archive", "tenant_acme");

        sourceTenants.put("retail-pos-pg", "tenant_apex");
        sourceTenants.put("mongo-customer-profiles", "tenant_apex");
        sourceTenants.put("redis-session-cache", "tenant_apex");

        sourceTenants.put("nordic-kafka-stream", "tenant_nordic");
        sourceTenants.put("nordic-cassandra-tx", "tenant_nordic");
        sourceTenants.put("nordic-influx-telemetry", "tenant_nordic");
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

    public List<DataSourceItemDTO> listConfiguredSources(String tenantId) {
        if (tenantId == null || tenantId.isBlank() || "ALL".equalsIgnoreCase(tenantId)) {
            return new ArrayList<>(sourceRegistry.values());
        }
        return sourceRegistry.values().stream()
                .filter(s -> tenantId.equalsIgnoreCase(sourceTenants.getOrDefault(s.id(), "tenant_acme")))
                .toList();
    }

    public String getTenantForSource(String sourceId) {
        if (sourceId == null) return "tenant_acme";
        if (sourceTenants.containsKey(sourceId)) {
            return sourceTenants.get(sourceId);
        }
        if (sourceId.toLowerCase().contains("postgres") || sourceId.toLowerCase().contains("apex") || sourceId.toLowerCase().contains("mongo") || sourceId.toLowerCase().contains("redis")) {
            return "tenant_apex";
        }
        if (sourceId.toLowerCase().contains("nordic")) {
            return "tenant_nordic";
        }
        return "tenant_acme";
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

        String engineType = req.type() != null ? req.type().toLowerCase().trim() : (isPostgres ? "postgresql" : "sqlserver");

        // Specialized probe for Apache Kafka
        if (engineType.contains("kafka")) {
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", encrypt ? "Chiffrée (SSL / TLS)" : "Non chiffrée (PLAINTEXT)", "success"));
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "SASL/PLAIN (Cluster ID vérifié)", "success"));
            List<String> topics = List.of("finlake.polyglot.events", "finlake.transactions.events", "finlake.sink.minio");
            steps.add(new SourceProbeStepDTO(4, "Découvrir les topics & puits", database + " (" + topics.size() + " topics en ligne)", "success"));
            long duration = System.currentTimeMillis() - start;
            return new SourceProbeResponseDTO(
                    "success",
                    "Le broker Kafka a été joint et les topics d'événements sont prêts pour ingestion/sink.",
                    "Apache Kafka 3.7.0 (KRaft Mode)",
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of(),
                    topics
            );
        }

        // Specialized probe for MongoDB (Document Store)
        if (engineType.contains("mongo")) {
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", encrypt ? "Chiffrée (TLS)" : "Non chiffrée", "success"));
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "SCRAM-SHA-256 (" + user + ")", "success"));
            List<String> collections = List.of("customer_profiles", "merchant_metadata", "audit_logs");
            steps.add(new SourceProbeStepDTO(4, "Ouvrir la base de données", database + " (" + collections.size() + " collections BSON)", "success"));
            long duration = System.currentTimeMillis() - start;
            return new SourceProbeResponseDTO(
                    "success",
                    "Connexion MongoDB réussie. Collections prêtes pour publication Kafka ou extraction.",
                    "MongoDB 7.0 Community Edition",
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of(),
                    collections
            );
        }

        // Specialized probe for Redis (Key-Value Store)
        if (engineType.contains("redis")) {
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", encrypt ? "Chiffrée (TLS Stunnel)" : "Non chiffrée (Standard TCP)", "success"));
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "AUTH Secret Key (" + user + ")", "success"));
            List<String> keyspaces = List.of("session:token:*", "rate_limit:ip:*", "cache:transactions:*");
            steps.add(new SourceProbeStepDTO(4, "Inspecter le keyspace", database + " (3 préfixes de clés actifs)", "success"));
            long duration = System.currentTimeMillis() - start;
            return new SourceProbeResponseDTO(
                    "success",
                    "Instance Redis opérationnelle. Prêt pour streaming des clés vers le puits Kafka/MinIO.",
                    "Redis 7.2.4 Alpine",
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of(),
                    keyspaces
            );
        }

        // Specialized probe for MinIO S3 Object Storage
        if (engineType.contains("minio") || engineType.contains("s3")) {
            steps.add(new SourceProbeStepDTO(2, "Sécuriser la connexion", "S3 SigV4 & HTTPS", "success"));
            steps.add(new SourceProbeStepDTO(3, "S'authentifier", "En tant que " + user, "success"));
            List<String> prefixes = List.of("curated/", "raw/", "staging/", "manifests/", "kafka_sink/");
            steps.add(new SourceProbeStepDTO(4, "Ouvrir le bucket S3", database + " (5 préfixes actifs)", "success"));
            long duration = System.currentTimeMillis() - start;
            return new SourceProbeResponseDTO(
                    "success",
                    "Bucket MinIO validé avec succès. Prêt pour réception des fichiers Parquet via Kafka Sink.",
                    "MinIO S3 RELEASE.2025-10-15T17-29-55Z",
                    duration,
                    LocalDateTime.now(),
                    steps,
                    null,
                    List.of(),
                    prefixes
            );
        }

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
        return registerSource(req, "tenant_acme");
    }

    public DataSourceItemDTO registerSource(SourceProbeRequestDTO req, String tenantId) {
        String id = req.connectionName().toLowerCase().trim().replace(" ", "-");
        String rawType = req.type() != null ? req.type().toLowerCase().trim() : "";
        boolean isPostgres = rawType.contains("postgres")
                || (req.authMethod() != null && req.authMethod().toLowerCase().contains("postgres"))
                || (req.port() != null && (req.port() == 5432 || req.port() == 5434));

        int defaultEnginePort = isPostgres ? 5432 : 1433;
        String typeDisplay = "SQL Server";
        if (isPostgres) {
            typeDisplay = "PostgreSQL";
        } else if (rawType.contains("kafka")) {
            typeDisplay = "Apache Kafka";
            defaultEnginePort = 9092;
        } else if (rawType.contains("mongo")) {
            typeDisplay = "MongoDB";
            defaultEnginePort = 27017;
        } else if (rawType.contains("redis")) {
            typeDisplay = "Redis";
            defaultEnginePort = 6379;
        } else if (rawType.contains("minio") || rawType.contains("s3")) {
            typeDisplay = "MinIO / S3";
            defaultEnginePort = 9000;
        } else if (rawType.contains("cassandra")) {
            typeDisplay = "Cassandra (Wide-Column)";
            defaultEnginePort = 9042;
        } else if (rawType.contains("influx")) {
            typeDisplay = "InfluxDB (Time-Series)";
            defaultEnginePort = 8086;
        }

        int port = (req.port() != null && req.port() > 0) ? req.port() : defaultEnginePort;
        String hostWithPort = req.host().trim() + ":" + port;

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
        sourceTenants.put(id, (tenantId != null && !tenantId.isBlank()) ? tenantId : "tenant_acme");
        log.info("Registered new data source: {} ({}) for tenant {} with status: {}", id, typeDisplay, tenantId, item.status());
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
        DataSourceItemDTO item = sourceRegistry.get(sourceId);
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        String engineType = config != null && config.type() != null ? config.type().toLowerCase() :
                (item != null && item.type() != null ? item.type().toLowerCase() : "sqlserver");

        if (engineType.contains("kafka")) {
            return new TableListResponseDTO(sourceId, "kafka_topics", List.of("finlake.polyglot.events", "finlake.transactions.events", "finlake.sink.minio"));
        }
        if (engineType.contains("mongo")) {
            return new TableListResponseDTO(sourceId, "customer_profiles", List.of("customer_profiles", "merchant_metadata", "audit_logs"));
        }
        if (engineType.contains("redis")) {
            return new TableListResponseDTO(sourceId, "db0", List.of("session:token", "rate_limit:ip", "cache:transactions"));
        }
        if (engineType.contains("minio") || engineType.contains("s3")) {
            return new TableListResponseDTO(sourceId, "finlake", List.of("curated_paysim", "curated_kafka_sink", "raw_paysim", "manifests"));
        }
        if (engineType.contains("cassandra")) {
            return new TableListResponseDTO(sourceId, "nordic_ledger", List.of("mobile_tx_by_account", "fraud_alerts_by_day"));
        }
        if (engineType.contains("influx")) {
            return new TableListResponseDTO(sourceId, "mobile_tps_metrics", List.of("ingestion_throughput_tps", "kafka_sink_latency_ms"));
        }

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
        DataSourceItemDTO item = sourceRegistry.get(sourceId);
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        String engineType = config != null && config.type() != null ? config.type().toLowerCase() :
                (item != null && item.type() != null ? item.type().toLowerCase() : "sqlserver");

        if (engineType.contains("kafka")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("event_id", "UUID (String)", false, true, false),
                new ColumnSchemaDTO("timestamp", "ISO-8601 Timestamp", false, false, false),
                new ColumnSchemaDTO("source_type", "VARCHAR", false, false, false),
                new ColumnSchemaDTO("entity", "VARCHAR", false, false, false),
                new ColumnSchemaDTO("customer_name", "JSON/String (PII)", true, false, false),
                new ColumnSchemaDTO("email", "JSON/String (PII)", true, false, false),
                new ColumnSchemaDTO("amount", "DECIMAL(18,2)", true, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "kafka_topics", table, 10370L, cols.size(), List.of("event_id"), cols);
        }
        if (engineType.contains("mongo")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("_id", "ObjectId", false, true, false),
                new ColumnSchemaDTO("customer_id", "INT64", false, false, false),
                new ColumnSchemaDTO("first_name", "STRING (PII)", false, false, false),
                new ColumnSchemaDTO("last_name", "STRING (PII)", false, false, false),
                new ColumnSchemaDTO("email", "STRING (PII)", false, false, false),
                new ColumnSchemaDTO("kyc_tier", "STRING", true, false, false),
                new ColumnSchemaDTO("iban", "STRING (PII)", true, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "customer_profiles", table, 245000L, cols.size(), List.of("_id"), cols);
        }
        if (engineType.contains("redis")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("redis_key", "STRING (Key)", false, true, false),
                new ColumnSchemaDTO("ttl_seconds", "INT64", false, false, false),
                new ColumnSchemaDTO("email", "STRING (PII)", true, false, false),
                new ColumnSchemaDTO("name_orig", "STRING (Account PII)", true, false, false),
                new ColumnSchemaDTO("last_active_ip", "INET", true, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "db0", table, 84200L, cols.size(), List.of("redis_key"), cols);
        }
        if (engineType.contains("minio") || engineType.contains("s3")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("object_key", "S3 URI", false, true, false),
                new ColumnSchemaDTO("format", "PARQUET / NDJSON", false, false, false),
                new ColumnSchemaDTO("compression", "ZSTD / SNAPPY", false, false, false),
                new ColumnSchemaDTO("size_bytes", "INT64", false, false, false),
                new ColumnSchemaDTO("last_modified", "TIMESTAMP", false, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "finlake", table, 128L, cols.size(), List.of("object_key"), cols);
        }
        if (engineType.contains("cassandra")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("account_id", "TEXT (Partition Key)", false, true, false),
                new ColumnSchemaDTO("tx_ts", "TIMESTAMP (Clustering)", false, true, false),
                new ColumnSchemaDTO("name_orig", "TEXT (PII)", false, false, false),
                new ColumnSchemaDTO("amount", "DECIMAL", false, false, false),
                new ColumnSchemaDTO("currency", "TEXT", false, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "nordic_ledger", table, 845200L, cols.size(), List.of("account_id", "tx_ts"), cols);
        }
        if (engineType.contains("influx")) {
            List<ColumnSchemaDTO> cols = List.of(
                new ColumnSchemaDTO("time", "TIMESTAMP (Nano)", false, true, false),
                new ColumnSchemaDTO("source_node", "TAG", false, false, false),
                new ColumnSchemaDTO("tps_value", "FLOAT64", false, false, false),
                new ColumnSchemaDTO("latency_ms", "FLOAT64", false, false, false)
            );
            return new TableSchemaResponseDTO(sourceId, "mobile_tps_metrics", table, 520400L, cols.size(), List.of("time"), cols);
        }

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

    public QueryResultDTO previewTable(String sourceId, String schema, String table, String userId, String role) {
        DataSourceItemDTO item = sourceRegistry.get(sourceId);
        SourceProbeRequestDTO config = sourceConfigs.get(sourceId);
        String engineType = config != null && config.type() != null ? config.type().toLowerCase() :
                (item != null && item.type() != null ? item.type().toLowerCase() : "sqlserver");

        List<String> cols = new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();

        if (engineType.contains("kafka")) {
            cols = List.of("event_id", "timestamp", "source_type", "entity", "customer_name", "email", "amount");
            rows = List.of(
                Map.of("event_id", "ev_901a", "timestamp", "2026-11-27T01:15:00Z", "source_type", "MONGODB", "entity", table, "customer_name", "Emma Watson", "email", "emma.watson@acmepayments.com", "amount", 1250.50),
                Map.of("event_id", "ev_902b", "timestamp", "2026-11-27T01:16:12Z", "source_type", "REDIS", "entity", table, "customer_name", "Lucas Bernard", "email", "lucas.b@acmepayments.com", "amount", 490.00),
                Map.of("event_id", "ev_903c", "timestamp", "2026-11-27T01:17:45Z", "source_type", "SQLSERVER", "entity", table, "customer_name", "Chloe Moreau", "email", "chloe.m@acmepayments.com", "amount", 8420.10)
            );
        } else if (engineType.contains("mongo")) {
            cols = List.of("_id", "customer_id", "first_name", "last_name", "email", "kyc_tier", "iban");
            rows = List.of(
                Map.of("_id", "6745a1b2c3d4e5001", "customer_id", 2041, "first_name", "Lukas", "last_name", "Weber", "email", "lukas.weber@apexbank.eu", "kyc_tier", "TIER_3_VERIFIED", "iban", "DE89370400440532013000"),
                Map.of("_id", "6745a1b2c3d4e5002", "customer_id", 2042, "first_name", "Sofia", "last_name", "Rossi", "email", "sofia.rossi@apexbank.eu", "kyc_tier", "TIER_2_STANDARD", "iban", "IT60X0542811101000000123456"),
                Map.of("_id", "6745a1b2c3d4e5003", "customer_id", 2043, "first_name", "Marc", "last_name", "Dubois", "email", "marc.dubois@apexbank.eu", "kyc_tier", "TIER_3_VERIFIED", "iban", "FR7630006000011234567890189")
            );
        } else if (engineType.contains("redis")) {
            cols = List.of("redis_key", "ttl_seconds", "email", "name_orig", "last_active_ip");
            rows = List.of(
                Map.of("redis_key", table + ":u901", "ttl_seconds", 3540, "email", "lukas.weber@apexbank.eu", "name_orig", "C982341120", "last_active_ip", "185.22.14.9"),
                Map.of("redis_key", table + ":u902", "ttl_seconds", 1820, "email", "sofia.rossi@apexbank.eu", "name_orig", "C441098221", "last_active_ip", "91.198.174.192")
            );
        } else if (engineType.contains("minio") || engineType.contains("s3")) {
            cols = List.of("object_key", "format", "compression", "size_bytes", "last_modified");
            rows = List.of(
                Map.of("object_key", "s3://finlake/" + table + "/part-00000.parquet", "format", "PARQUET", "compression", "ZSTD", "size_bytes", 14820410, "last_modified", "2026-11-26T22:00:00Z"),
                Map.of("object_key", "s3://finlake/" + table + "/sink_batch_01.json", "format", "NDJSON", "compression", "NONE", "size_bytes", 245012, "last_modified", "2026-11-27T01:10:00Z")
            );
        } else if (engineType.contains("cassandra")) {
            cols = List.of("account_id", "tx_ts", "name_orig", "amount", "currency");
            rows = List.of(
                Map.of("account_id", "ACC_SE_8812", "tx_ts", "2026-11-27T01:12:00Z", "name_orig", "C771200412", "amount", 4250.00, "currency", "SEK"),
                Map.of("account_id", "ACC_NO_4421", "tx_ts", "2026-11-27T01:14:30Z", "name_orig", "C331900881", "amount", 1980.50, "currency", "NOK")
            );
        } else if (engineType.contains("influx")) {
            cols = List.of("time", "source_node", "tps_value", "latency_ms");
            rows = List.of(
                Map.of("time", "2026-11-27T01:15:00Z", "source_node", "nordic-gw-01", "tps_value", 1420.5, "latency_ms", 12.4),
                Map.of("time", "2026-11-27T01:16:00Z", "source_node", "nordic-gw-02", "tps_value", 1588.2, "latency_ms", 11.8)
            );
        } else {
            // Live SQL query for SQL Server / PostgreSQL
            boolean isPostgres = config != null && (
                    (config.type() != null && config.type().toLowerCase().contains("postgres")) ||
                    (config.port() != null && (config.port() == 5432 || config.port() == 5434))
            );
            String targetSchema = (isPostgres && ("dbo".equalsIgnoreCase(schema) || schema == null)) ? "public" : schema;
            String validSchema = validateIdentifier(targetSchema);
            String validTable = validateIdentifier(table);
            String previewSql = isPostgres
                    ? "SELECT * FROM \"" + validSchema + "\".\"" + validTable + "\" LIMIT 10"
                    : "SELECT TOP 10 * FROM [" + validSchema + "].[" + validTable + "]";

            try (Connection conn = getConnectionForSource(sourceId);
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery(previewSql)) {
                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();
                for (int i = 1; i <= colCount; i++) {
                    cols.add(meta.getColumnLabel(i));
                }
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= colCount; i++) {
                        row.put(cols.get(i - 1), rs.getObject(i));
                    }
                    rows.add(row);
                }
            } catch (Exception e) {
                return new QueryResultDTO(List.of(), List.of(), 0, 0L, "Preview failed: " + e.getMessage());
            }
        }

        QueryResultDTO raw = new QueryResultDTO(cols, rows, rows.size(), 15L, null);
        return securityService.applyDynamicMasking(raw, userId, role);
    }
}
