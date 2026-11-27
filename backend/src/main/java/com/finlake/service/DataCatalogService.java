package com.finlake.service;

import com.finlake.dto.CatalogColumnDTO;
import com.finlake.dto.CatalogTableDetailDTO;
import com.finlake.dto.CatalogTableSummaryDTO;
import com.finlake.dto.QueryResultDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DataCatalogService {

    private static final Logger log = LoggerFactory.getLogger(DataCatalogService.class);

    private final TrinoAnalyticsService trinoService;
    private final Map<String, Long> rowCountCache = new ConcurrentHashMap<>();
    private long lastCacheTime = 0;

    public DataCatalogService(TrinoAnalyticsService trinoService) {
        this.trinoService = trinoService;
    }

    public List<CatalogTableSummaryDTO> getAllTables() {
        return getAllTables("tenant_acme");
    }

    public List<CatalogTableSummaryDTO> getAllTables(String tenantId) {
        refreshCountsIfNeeded();
        String t = (tenantId != null && !tenantId.isBlank()) ? tenantId.toLowerCase().trim() : "tenant_acme";

        if ("tenant_apex".equals(t)) {
            return List.of(
                getApexRetailSummary(),
                getApexMongoProfilesSummary(),
                getApexRedisCacheSummary(),
                getApexIcebergLedgerSummary()
            );
        }
        if ("tenant_nordic".equals(t)) {
            return List.of(
                getNordicKafkaSummary(),
                getNordicCassandraSummary(),
                getNordicInfluxSummary(),
                getNordicIcebergLedgerSummary()
            );
        }

        // Default: tenant_acme (Acme Payments Global)
        List<CatalogTableSummaryDTO> tables = new ArrayList<>();
        tables.add(getCustomerSummary());
        tables.add(getInvoiceSummary());
        tables.add(getPaymentSummary());
        tables.add(getTransactionsSummary());
        tables.add(getKafkaPolyglotSummary());
        tables.add(getIcebergSnapshotsSummary());
        return tables;
    }

    public Optional<CatalogTableDetailDTO> getTableDetail(String tableId) {
        refreshCountsIfNeeded();

        return switch (tableId.toLowerCase(Locale.ROOT)) {
            case "customer", "hive.finlake_curated.customer" -> Optional.of(getCustomerDetail());
            case "invoice", "hive.finlake_curated.invoice" -> Optional.of(getInvoiceDetail());
            case "payment", "hive.finlake_curated.payment" -> Optional.of(getPaymentDetail());
            case "transactions", "hive.finlake_curated.transactions" -> Optional.of(getTransactionsDetail());
            case "kafka_polyglot_events" -> Optional.of(getKafkaPolyglotDetail());
            case "iceberg_snapshots", "iceberg.finlake_iceberg.snapshots" -> Optional.of(getIcebergSnapshotsDetail());
            case "apex_retail_transactions" -> Optional.of(getApexRetailDetail());
            case "apex_mongo_profiles" -> Optional.of(getApexMongoProfilesDetail());
            case "apex_redis_cache" -> Optional.of(getApexRedisCacheDetail());
            case "apex_iceberg_ledger" -> Optional.of(getApexIcebergLedgerDetail());
            case "nordic_kafka_events" -> Optional.of(getNordicKafkaDetail());
            case "nordic_cassandra_tx" -> Optional.of(getNordicCassandraDetail());
            case "nordic_influx_tps" -> Optional.of(getNordicInfluxDetail());
            case "nordic_iceberg_ledger" -> Optional.of(getNordicIcebergLedgerDetail());
            default -> Optional.empty();
        };
    }

    public List<CatalogTableSummaryDTO> searchCatalog(String query) {
        return searchCatalog(query, "tenant_acme");
    }

    public List<CatalogTableSummaryDTO> searchCatalog(String query, String tenantId) {
        if (query == null || query.isBlank()) {
            return getAllTables(tenantId);
        }

        String q = query.toLowerCase(Locale.ROOT).trim();
        List<CatalogTableSummaryDTO> all = getAllTables(tenantId);
        List<CatalogTableSummaryDTO> results = new ArrayList<>();

        for (CatalogTableSummaryDTO table : all) {
            boolean matchesTable = table.name().toLowerCase().contains(q)
                || table.domain().toLowerCase().contains(q)
                || table.description().toLowerCase().contains(q)
                || table.tags().stream().anyMatch(t -> t.toLowerCase().contains(q));

            if (matchesTable) {
                results.add(table);
                continue;
            }

            // Check columns
            Optional<CatalogTableDetailDTO> detail = getTableDetail(table.id());
            if (detail.isPresent()) {
                boolean matchesColumn = detail.get().columns().stream().anyMatch(c ->
                    c.name().toLowerCase().contains(q) || c.description().toLowerCase().contains(q)
                );
                if (matchesColumn) {
                    results.add(table);
                }
            }
        }

        return results;
    }

    private void refreshCountsIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - lastCacheTime > 60_000) { // Refresh every 60s
            fetchLiveRowCount("customer", "SELECT count(*) AS cnt FROM hive.finlake_curated.customer");
            fetchLiveRowCount("invoice", "SELECT count(*) AS cnt FROM hive.finlake_curated.invoice");
            fetchLiveRowCount("payment", "SELECT count(*) AS cnt FROM hive.finlake_curated.payment");
            fetchLiveRowCount("transactions", "SELECT count(*) AS cnt FROM hive.finlake_curated.transactions");
            fetchLiveRowCount("iceberg_snapshots", "SELECT count(*) AS cnt FROM iceberg.finlake_iceberg.\"transactions$snapshots\"");
            lastCacheTime = now;
        }
    }

    private void fetchLiveRowCount(String tableKey, String sql) {
        try {
            QueryResultDTO res = trinoService.executeQuery(sql, "hive", "finlake_curated", 1);
            if (res.rows() != null && !res.rows().isEmpty()) {
                Object val = res.rows().get(0).get("cnt");
                if (val instanceof Number n) {
                    rowCountCache.put(tableKey, n.longValue());
                } else if (val != null) {
                    rowCountCache.put(tableKey, Long.parseLong(val.toString()));
                }
            }
        } catch (Exception e) {
            log.debug("Live count check failed for {}: {}", tableKey, e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // 1. Customer
    // -------------------------------------------------------------------------
    private CatalogTableSummaryDTO getCustomerSummary() {
        return new CatalogTableSummaryDTO(
            "customer",
            "customer",
            "hive",
            "finlake_curated",
            "Customer Operations & KYC",
            "Master registry of retail and business bank account holders, including residential geographic classification and contact identifiers.",
            "Apache Parquet (Snappy)",
            "MinIO S3 / Curated Zone",
            rowCountCache.getOrDefault("customer", 100L),
            6,
            "Fresh (< 1h)",
            "Continuous Batch",
            List.of("KYC", "PII", "Master Data", "Core Banking")
        );
    }

    private CatalogTableDetailDTO getCustomerDetail() {
        List<CatalogColumnDTO> cols = List.of(
            new CatalogColumnDTO("customer_id", "BIGINT", "Unique surrogate key identifying the retail customer.", true, false, null, "NONE", List.of("1", "2", "3")),
            new CatalogColumnDTO("first_name", "VARCHAR", "Legal given first name of customer.", false, false, null, "PII", List.of("Emma", "Liam", "Noah")),
            new CatalogColumnDTO("last_name", "VARCHAR", "Family legal surname.", false, false, null, "PII", List.of("Smith", "Johnson", "Williams")),
            new CatalogColumnDTO("email", "VARCHAR", "Primary contact electronic mail address.", false, false, null, "PII", List.of("emma.smith@finlake.io")),
            new CatalogColumnDTO("city", "VARCHAR", "Metropolitan domicile location for geographic risk profiling.", false, false, null, "GEOGRAPHIC", List.of("Paris", "London", "New York")),
            new CatalogColumnDTO("created_at", "TIMESTAMP", "Account onboarding creation timestamp.", false, false, null, "SYSTEM_AUDIT", List.of("2026-01-15 08:30:00"))
        );

        List<CatalogTableDetailDTO.SampleQueryDTO> queries = List.of(
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Customer Distribution by City",
                "SELECT city, COUNT(*) AS customer_count FROM hive.finlake_curated.customer GROUP BY city ORDER BY customer_count DESC",
                "Ranks top customer demographic geographic hubs."
            ),
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Recent Onboardings",
                "SELECT customer_id, first_name, last_name, email, city, created_at FROM hive.finlake_curated.customer ORDER BY created_at DESC LIMIT 10",
                "Displays the latest customer acquisitions."
            )
        );

        return new CatalogTableDetailDTO(
            getCustomerSummary(),
            cols,
            queries,
            List.of("sqlserver.dbo.customer"),
            List.of("hive.finlake_curated.invoice")
        );
    }

    // -------------------------------------------------------------------------
    // 2. Invoice
    // -------------------------------------------------------------------------
    private CatalogTableSummaryDTO getInvoiceSummary() {
        return new CatalogTableSummaryDTO(
            "invoice",
            "invoice",
            "hive",
            "finlake_curated",
            "Accounts Receivable & Billing",
            "Commercial billing statements issued to customers, tracking billing milestones, settlement terms, and unpaid balances.",
            "Apache Parquet (Snappy)",
            "MinIO S3 / Curated Zone",
            rowCountCache.getOrDefault("invoice", 250L),
            5,
            "Fresh (< 1h)",
            "Continuous Batch",
            List.of("Billing", "Accounts Receivable", "Revenue", "Financial Ledger")
        );
    }

    private CatalogTableDetailDTO getInvoiceDetail() {
        List<CatalogColumnDTO> cols = List.of(
            new CatalogColumnDTO("invoice_id", "BIGINT", "Unique identifier for issued invoice statements.", true, false, null, "NONE", List.of("101", "102")),
            new CatalogColumnDTO("customer_id", "BIGINT", "Foreign key reference to billing recipient customer.", false, true, "customer.customer_id", "NONE", List.of("1", "2")),
            new CatalogColumnDTO("invoice_date", "DATE", "Issuance date of billing demand.", false, false, null, "FINANCIAL", List.of("2026-02-01")),
            new CatalogColumnDTO("amount", "DOUBLE", "Total invoiced monetary amount in local settlement currency.", false, false, null, "FINANCIAL", List.of("250.00", "1240.50")),
            new CatalogColumnDTO("status", "VARCHAR", "Settlement lifecycle state (PAID, UNPAID, OVERDUE, PENDING).", false, false, null, "BUSINESS_METRIC", List.of("PAID", "OVERDUE"))
        );

        List<CatalogTableDetailDTO.SampleQueryDTO> queries = List.of(
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Accounts Receivable by Status",
                "SELECT status, COUNT(*) AS count, ROUND(SUM(amount), 2) AS total_debt FROM hive.finlake_curated.invoice GROUP BY status",
                "Breaks down accounts receivable exposure across payment statuses."
            )
        );

        return new CatalogTableDetailDTO(
            getInvoiceSummary(),
            cols,
            queries,
            List.of("sqlserver.dbo.invoice", "hive.finlake_curated.customer"),
            List.of("hive.finlake_curated.payment")
        );
    }

    // -------------------------------------------------------------------------
    // 3. Payment
    // -------------------------------------------------------------------------
    private CatalogTableSummaryDTO getPaymentSummary() {
        return new CatalogTableSummaryDTO(
            "payment",
            "payment",
            "hive",
            "finlake_curated",
            "Treasury & Payment Gateway",
            "Confirmed payment settlement transactions mapped to billing obligations, detailing payment rails and settlement timestamps.",
            "Apache Parquet (Snappy)",
            "MinIO S3 / Curated Zone",
            rowCountCache.getOrDefault("payment", 200L),
            5,
            "Fresh (< 1h)",
            "Continuous Batch",
            List.of("Treasury", "Settlement", "Payment Rails", "Cash Inflow")
        );
    }

    private CatalogTableDetailDTO getPaymentDetail() {
        List<CatalogColumnDTO> cols = List.of(
            new CatalogColumnDTO("payment_id", "BIGINT", "Primary key settlement transaction reference.", true, false, null, "NONE", List.of("501", "502")),
            new CatalogColumnDTO("invoice_id", "BIGINT", "Foreign key linking payment to matched invoice.", false, true, "invoice.invoice_id", "NONE", List.of("101", "102")),
            new CatalogColumnDTO("payment_date", "TIMESTAMP", "Exact timestamp when funds cleared banking rail.", false, false, null, "SYSTEM_AUDIT", List.of("2026-02-03 14:22:10")),
            new CatalogColumnDTO("amount", "DOUBLE", "Cleared settlement currency volume.", false, false, null, "FINANCIAL", List.of("250.00", "500.00")),
            new CatalogColumnDTO("payment_method", "VARCHAR", "Rail channel used (CREDIT_CARD, BANK_TRANSFER, CASH, PAYPAL).", false, false, null, "BUSINESS_METRIC", List.of("CREDIT_CARD", "BANK_TRANSFER"))
        );

        List<CatalogTableDetailDTO.SampleQueryDTO> queries = List.of(
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Settlement Volume by Channel",
                "SELECT payment_method, COUNT(*) AS count, ROUND(SUM(amount), 2) AS total_settled FROM hive.finlake_curated.payment GROUP BY payment_method ORDER BY total_settled DESC",
                "Calculates rail concentration and transaction volume by method."
            )
        );

        return new CatalogTableDetailDTO(
            getPaymentSummary(),
            cols,
            queries,
            List.of("sqlserver.dbo.payment", "hive.finlake_curated.invoice"),
            List.of("FinLake Analytics / Reports")
        );
    }

    // -------------------------------------------------------------------------
    // 4. Transactions (PaySim)
    // -------------------------------------------------------------------------
    private CatalogTableSummaryDTO getTransactionsSummary() {
        return new CatalogTableSummaryDTO(
            "transactions",
            "transactions",
            "hive",
            "finlake_curated",
            "Mobile Money & Fraud Analytics",
            "Synthetic mobile money ledger simulating 30 days of transactions, customer balance fluctuations, and flagged fraudulent operations.",
            "Apache Parquet (Snappy, Partitioned by type)",
            "MinIO S3 / Curated Zone",
            rowCountCache.getOrDefault("transactions", 10000L),
            11,
            "Fresh (< 1h)",
            "Batch Extracted",
            List.of("PaySim", "Mobile Money", "Fraud Detection", "Risk Monitoring", "High Volume")
        );
    }

    private CatalogTableDetailDTO getTransactionsDetail() {
        List<CatalogColumnDTO> cols = List.of(
            new CatalogColumnDTO("step", "INTEGER", "Simulated temporal time step (1 step = 1 hour). Total span represents 30 days.", false, false, null, "SYSTEM_AUDIT", List.of("1", "24", "180")),
            new CatalogColumnDTO("type", "VARCHAR", "Operation category: CASH_IN, CASH_OUT, DEBIT, PAYMENT, TRANSFER. Partition key.", false, false, null, "BUSINESS_METRIC", List.of("TRANSFER", "CASH_OUT")),
            new CatalogColumnDTO("amount", "DOUBLE", "Monetary transaction value in simulated transaction currency.", false, false, null, "FINANCIAL", List.of("181.00", "181000.00")),
            new CatalogColumnDTO("name_orig", "VARCHAR", "Customer ID originating the transfer debit.", false, false, null, "PII", List.of("C1231006815")),
            new CatalogColumnDTO("oldbalance_org", "DOUBLE", "Originating customer balance immediately prior to transaction.", false, false, null, "FINANCIAL", List.of("181.00")),
            new CatalogColumnDTO("newbalance_orig", "DOUBLE", "Originating customer balance immediately following transaction.", false, false, null, "FINANCIAL", List.of("0.00")),
            new CatalogColumnDTO("name_dest", "VARCHAR", "Recipient customer or merchant account identifier.", false, false, null, "PII", List.of("M1979787155")),
            new CatalogColumnDTO("oldbalance_dest", "DOUBLE", "Destination account balance before credit.", false, false, null, "FINANCIAL", List.of("0.00")),
            new CatalogColumnDTO("newbalance_dest", "DOUBLE", "Destination account balance after credit.", false, false, null, "FINANCIAL", List.of("0.00")),
            new CatalogColumnDTO("is_fraud", "INTEGER", "Ground truth binary indicator of illegal fraudulent transfer (1 = Fraud, 0 = Legitimate).", false, false, null, "RISK_LABEL", List.of("0", "1")),
            new CatalogColumnDTO("is_flagged_fraud", "INTEGER", "Rule-based operational compliance flag for massive transfers (> 200,000).", false, false, null, "RISK_LABEL", List.of("0", "1"))
        );

        List<CatalogTableDetailDTO.SampleQueryDTO> queries = List.of(
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Fraud vs Legitimate Class Distribution",
                "SELECT is_fraud, COUNT(*) AS count, ROUND(AVG(amount), 2) AS avg_ticket, ROUND(SUM(amount), 2) AS total_volume FROM hive.finlake_curated.transactions GROUP BY is_fraud",
                "Evaluates class imbalance and fraud loss volume."
            ),
            new CatalogTableDetailDTO.SampleQueryDTO(
                "High Risk Transfers",
                "SELECT step, type, amount, name_orig, name_dest FROM hive.finlake_curated.transactions WHERE is_fraud = 1 ORDER BY amount DESC LIMIT 15",
                "Inspects verified fraudulent accounts and theft amounts."
            )
        );

        return new CatalogTableDetailDTO(
            getTransactionsSummary(),
            cols,
            queries,
            List.of("sqlserver.dbo.transactions"),
            List.of("iceberg.finlake_iceberg.transactions", "FinLake Risk ML Models")
        );
    }

    // -------------------------------------------------------------------------
    // 5. Apache Iceberg Snapshots Ledger
    // -------------------------------------------------------------------------
    private CatalogTableSummaryDTO getIcebergSnapshotsSummary() {
        return new CatalogTableSummaryDTO(
            "iceberg_snapshots",
            "transactions$snapshots",
            "iceberg",
            "finlake_iceberg",
            "Lakehouse ACID Governance",
            "Immutable audit trail capturing table commit lineage, schema mutations, and parent-child snapshot state for time-travel queries.",
            "Apache Iceberg v2 Format",
            "MinIO S3 / Iceberg Warehouse",
            rowCountCache.getOrDefault("iceberg_snapshots", 5L),
            4,
            "Real-time",
            "On Commit",
            List.of("Iceberg", "Time Travel", "ACID", "SOC2 Compliance", "Audit Trail")
        );
    }

    private CatalogTableDetailDTO getIcebergSnapshotsDetail() {
        List<CatalogColumnDTO> cols = List.of(
            new CatalogColumnDTO("snapshot_id", "BIGINT", "Unique 64-bit identifier assigned to commit version.", true, false, null, "SYSTEM_AUDIT", List.of("917406062776233544")),
            new CatalogColumnDTO("parent_id", "BIGINT", "Pointer to predecessor snapshot enabling lineage branching and time-travel rollback.", false, true, "snapshots.snapshot_id", "SYSTEM_AUDIT", List.of("null")),
            new CatalogColumnDTO("operation", "VARCHAR", "Type of ACID transaction mutation performed (append, overwrite, delete).", false, false, null, "SYSTEM_AUDIT", List.of("append")),
            new CatalogColumnDTO("committed_at", "TIMESTAMP", "Wall-clock UTC timestamp when snapshot was committed to Hive Metastore.", false, false, null, "SYSTEM_AUDIT", List.of("2026-11-19 18:40:00"))
        );

        List<CatalogTableDetailDTO.SampleQueryDTO> queries = List.of(
            new CatalogTableDetailDTO.SampleQueryDTO(
                "Audit Commit Lineage",
                "SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg.\"transactions$snapshots\" ORDER BY committed_at DESC",
                "Retrieves complete historical commit ledger for regulatory auditing."
            )
        );

        return new CatalogTableDetailDTO(
            getIcebergSnapshotsSummary(),
            cols,
            queries,
            List.of("hive.finlake_curated.transactions"),
            List.of("Regulatory Audit Dashboards", "Time-Travel Repositories")
        );
    }

    // --- Polyglot & Multi-Tenant Catalog Entries ---
    private CatalogTableSummaryDTO getKafkaPolyglotSummary() {
        return new CatalogTableSummaryDTO(
            "kafka_polyglot_events", "kafka_polyglot_events", "hive", "finlake_curated",
            "Event Streaming / Kafka Sink",
            "Unified event stream ingested from heterogeneous sources via Kafka KRaft & MinIO S3 Sink Worker.",
            "NDJSON / Parquet (ZSTD)", "MinIO S3 (curated/kafka_sink)", 10370L, 5, "Real-time", "Streaming",
            List.of("Kafka", "S3 Sink", "Polyglot", "Streaming")
        );
    }

    private CatalogTableDetailDTO getKafkaPolyglotDetail() {
        return new CatalogTableDetailDTO(
            getKafkaPolyglotSummary(),
            List.of(
                new CatalogColumnDTO("event_id", "VARCHAR", "Unique Kafka event UUID.", true, false, null, "SYSTEM_AUDIT", List.of("052222d4-ff2d")),
                new CatalogColumnDTO("timestamp", "TIMESTAMP", "Event emission UTC timestamp.", false, false, null, "SYSTEM_AUDIT", List.of("2026-11-27T01:15:00Z")),
                new CatalogColumnDTO("source_type", "VARCHAR", "Origin DB engine (MONGODB, REDIS, SQLSERVER).", false, false, null, "PUBLIC", List.of("MONGODB", "REDIS")),
                new CatalogColumnDTO("entity", "VARCHAR", "Target entity/collection name.", false, false, null, "PUBLIC", List.of("customer_profile")),
                new CatalogColumnDTO("data", "JSON", "Normalized event payload.", false, false, null, "PII", List.of("{\"customer_id\":104}"))
            ),
            List.of(new CatalogTableDetailDTO.SampleQueryDTO("Latest Kafka Sink Events", "SELECT * FROM hive.finlake_curated.transactions LIMIT 10", "Inspect streamed events.")),
            List.of("kafka://finlake.polyglot.events"),
            List.of("MinIO S3 Sink", "Trino Analytics")
        );
    }

    private CatalogTableSummaryDTO getApexRetailSummary() {
        return new CatalogTableSummaryDTO(
            "apex_retail_transactions", "retail_banking_tx", "hive", "apex_eu_curated",
            "Banking & Payments (PostgreSQL)",
            "Curated EU retail banking transactions extracted from PostgreSQL 16 (retail_banking).",
            "Apache Parquet (ZSTD)", "MinIO S3 (Apex EU Bucket)", 1482910L, 5, "Fresh (< 10m)", "Hourly",
            List.of("PostgreSQL", "GDPR", "Retail Banking", "Apex EU")
        );
    }

    private CatalogTableDetailDTO getApexRetailDetail() {
        return new CatalogTableDetailDTO(
            getApexRetailSummary(),
            List.of(
                new CatalogColumnDTO("tx_id", "BIGINT", "Primary transaction ID.", true, false, null, "SYSTEM_AUDIT", List.of("901244")),
                new CatalogColumnDTO("account_iban", "VARCHAR", "Customer IBAN (GDPR PII).", false, false, null, "PII", List.of("DE893704****")),
                new CatalogColumnDTO("amount_eur", "DECIMAL(18,2)", "Transaction amount in EUR.", false, false, null, "FINANCIAL", List.of("1240.50")),
                new CatalogColumnDTO("merchant_city", "VARCHAR", "City of POS terminal.", false, false, null, "PUBLIC", List.of("Frankfurt", "Paris")),
                new CatalogColumnDTO("created_at", "TIMESTAMP", "UTC settlement time.", false, false, null, "SYSTEM_AUDIT", List.of("2026-11-26 21:10:00"))
            ),
            List.of(new CatalogTableDetailDTO.SampleQueryDTO("EU Retail Volume", "SELECT payment_method, COUNT(*) AS cnt, ROUND(SUM(amount),2) AS total FROM hive.finlake_curated.payment GROUP BY payment_method", "Analyze EU payment methods.")),
            List.of("postgresql://postgres-source:5432/retail_banking"),
            List.of("Apex GDPR Reporting", "Trino EU Analytics")
        );
    }

    private CatalogTableSummaryDTO getApexMongoProfilesSummary() {
        return new CatalogTableSummaryDTO(
            "apex_mongo_profiles", "customer_profiles", "hive", "apex_eu_curated",
            "Document Store (MongoDB)",
            "Semi-structured KYC customer profiles and merchant metadata ingested from MongoDB via Kafka Sink.",
            "Apache Parquet (Snappy)", "MinIO S3 (Apex EU Bucket)", 245000L, 5, "Fresh (< 30m)", "Streaming",
            List.of("MongoDB", "NoSQL", "Document", "KYC", "PII")
        );
    }

    private CatalogTableDetailDTO getApexMongoProfilesDetail() {
        return new CatalogTableDetailDTO(
            getApexMongoProfilesSummary(),
            List.of(
                new CatalogColumnDTO("_id", "VARCHAR", "MongoDB BSON ObjectId.", true, false, null, "SYSTEM_AUDIT", List.of("6745a1b2c3d4e5001")),
                new CatalogColumnDTO("first_name", "VARCHAR", "Customer first name (PII).", false, false, null, "PII", List.of("Lukas")),
                new CatalogColumnDTO("last_name", "VARCHAR", "Customer last name (PII).", false, false, null, "PII", List.of("Weber")),
                new CatalogColumnDTO("email", "VARCHAR", "Verified KYC email (PII).", false, false, null, "PII", List.of("lukas.weber@apexbank.eu")),
                new CatalogColumnDTO("kyc_tier", "VARCHAR", "AML/KYC compliance tier.", false, false, null, "RISK_LABEL", List.of("TIER_3_VERIFIED"))
            ),
            List.of(new CatalogTableDetailDTO.SampleQueryDTO("KYC Profiles Sample", "SELECT customer_id, first_name, last_name, email, city FROM hive.finlake_curated.customer LIMIT 10", "Inspect KYC profiles with dynamic PII masking.")),
            List.of("mongodb://mongo-cluster.corp.internal:27017/customer_profiles"),
            List.of("Kafka MinIO S3 Sink", "AML Compliance")
        );
    }

    private CatalogTableSummaryDTO getApexRedisCacheSummary() {
        return new CatalogTableSummaryDTO(
            "apex_redis_cache", "session_cache_snapshots", "hive", "apex_eu_curated",
            "Key-Value Store (Redis)",
            "In-memory authentication & rate-limit session snapshots streamed from Redis to MinIO.",
            "Apache Parquet (ZSTD)", "MinIO S3 (Apex EU Bucket)", 84200L, 4, "Real-time", "Every 15m",
            List.of("Redis", "Key-Value", "Sessions", "Security")
        );
    }

    private CatalogTableDetailDTO getApexRedisCacheDetail() {
        return new CatalogTableDetailDTO(
            getApexRedisCacheSummary(),
            List.of(
                new CatalogColumnDTO("redis_key", "VARCHAR", "Redis keyspace identifier.", true, false, null, "SYSTEM_AUDIT", List.of("session:token:u901")),
                new CatalogColumnDTO("ttl_seconds", "BIGINT", "Remaining key TTL.", false, false, null, "SYSTEM_AUDIT", List.of("3540")),
                new CatalogColumnDTO("email", "VARCHAR", "Session owner email (PII).", false, false, null, "PII", List.of("lukas.weber@apexbank.eu")),
                new CatalogColumnDTO("last_active_ip", "VARCHAR", "Client IPv4 address.", false, false, null, "PII", List.of("185.22.14.9"))
            ),
            List.of(new CatalogTableDetailDTO.SampleQueryDTO("Active Sessions", "SELECT * FROM hive.finlake_curated.customer LIMIT 5", "Inspect session metadata.")),
            List.of("redis://redis-cache.corp.internal:6379/db0"),
            List.of("Security Audit Ledger")
        );
    }

    private CatalogTableSummaryDTO getApexIcebergLedgerSummary() {
        return new CatalogTableSummaryDTO(
            "apex_iceberg_ledger", "retail_ledger$snapshots", "iceberg", "apex_eu_iceberg",
            "Lakehouse ACID Governance",
            "Apex EU immutable Iceberg commit ledger for GDPR-compliant retail banking time-travel.",
            "Apache Iceberg v2 Format", "MinIO S3 (Apex EU Iceberg)", 2965820L, 4, "Real-time", "On Commit",
            List.of("Iceberg", "GDPR", "ACID", "Apex EU")
        );
    }

    private CatalogTableDetailDTO getApexIcebergLedgerDetail() {
        return new CatalogTableDetailDTO(
            getApexIcebergLedgerSummary(),
            List.of(
                new CatalogColumnDTO("snapshot_id", "BIGINT", "Apex EU commit snapshot ID.", true, false, null, "SYSTEM_AUDIT", List.of("8921044190231")),
                new CatalogColumnDTO("parent_id", "BIGINT", "Previous snapshot ID.", false, true, null, "SYSTEM_AUDIT", List.of("8921044190118")),
                new CatalogColumnDTO("operation", "VARCHAR", "ACID operation.", false, false, null, "SYSTEM_AUDIT", List.of("append")),
                new CatalogColumnDTO("committed_at", "TIMESTAMP", "Commit timestamp.", false, false, null, "SYSTEM_AUDIT", List.of("2026-11-26 22:14:05"))
            ),
            List.of(),
            List.of("hive.apex_eu_curated.retail_banking_tx"),
            List.of("GDPR Audit Dashboard")
        );
    }

    private CatalogTableSummaryDTO getNordicKafkaSummary() {
        return new CatalogTableSummaryDTO(
            "nordic_kafka_events", "mobile_money_events", "hive", "nordic_curated",
            "Event Streaming (Kafka KRaft)",
            "Real-time Nordic mobile-money transfer events streamed via Kafka KRaft to MinIO Parquet.",
            "Apache Parquet (ZSTD)", "MinIO S3 (Nordic Bucket)", 845200L, 4, "Real-time", "Streaming",
            List.of("Kafka", "Mobile Money", "Nordic", "Streaming")
        );
    }

    private CatalogTableDetailDTO getNordicKafkaDetail() {
        return new CatalogTableDetailDTO(
            getNordicKafkaSummary(),
            List.of(
                new CatalogColumnDTO("event_id", "VARCHAR", "Transfer event UUID.", true, false, null, "SYSTEM_AUDIT", List.of("nordic_ev_101")),
                new CatalogColumnDTO("name_orig", "VARCHAR", "Sender wallet ID (PII).", false, false, null, "PII", List.of("C771200412")),
                new CatalogColumnDTO("amount", "DECIMAL(18,2)", "Transfer amount (SEK/NOK).", false, false, null, "FINANCIAL", List.of("4250.00")),
                new CatalogColumnDTO("is_fraud", "INTEGER", "Fraud risk flag.", false, false, null, "RISK_LABEL", List.of("0", "1"))
            ),
            List.of(new CatalogTableDetailDTO.SampleQueryDTO("Nordic Fraud Breakdown", "SELECT is_fraud, COUNT(*) AS cnt, ROUND(AVG(amount),2) AS avg_amt FROM hive.finlake_curated.transactions GROUP BY is_fraud", "Analyze fraud rates.")),
            List.of("kafka://kafka:9092/finlake.transactions.events"),
            List.of("Nordic Risk Engine")
        );
    }

    private CatalogTableSummaryDTO getNordicCassandraSummary() {
        return new CatalogTableSummaryDTO(
            "nordic_cassandra_tx", "mobile_tx_by_account", "hive", "nordic_curated",
            "Wide-Column Store (Cassandra)",
            "High-throughput partitioned mobile-money ledger extracted from Apache Cassandra 4.1.",
            "Apache Parquet (Snappy)", "MinIO S3 (Nordic Bucket)", 845200L, 4, "Fresh (< 1h)", "Daily",
            List.of("Cassandra", "Wide-Column", "NoSQL", "Nordic")
        );
    }

    private CatalogTableDetailDTO getNordicCassandraDetail() {
        return new CatalogTableDetailDTO(
            getNordicCassandraSummary(),
            List.of(
                new CatalogColumnDTO("account_id", "VARCHAR", "Partition key account.", true, false, null, "PII", List.of("ACC_SE_8812")),
                new CatalogColumnDTO("tx_ts", "TIMESTAMP", "Clustering timestamp.", true, false, null, "SYSTEM_AUDIT", List.of("2026-11-27T01:12:00Z")),
                new CatalogColumnDTO("amount", "DECIMAL(18,2)", "Transaction amount.", false, false, null, "FINANCIAL", List.of("4250.00")),
                new CatalogColumnDTO("currency", "VARCHAR", "Nordic currency code.", false, false, null, "PUBLIC", List.of("SEK", "NOK"))
            ),
            List.of(),
            List.of("cassandra://cassandra-nordic.corp.internal:9042/nordic_ledger"),
            List.of("Nordic Iceberg Ledger")
        );
    }

    private CatalogTableSummaryDTO getNordicInfluxSummary() {
        return new CatalogTableSummaryDTO(
            "nordic_influx_tps", "ingestion_throughput_tps", "hive", "nordic_curated",
            "Time-Series (InfluxDB)",
            "Gateway TPS & Kafka Sink latency telemetry archived from InfluxDB 2.7.",
            "Apache Parquet (ZSTD)", "MinIO S3 (Nordic Bucket)", 520400L, 4, "Real-time", "Hourly",
            List.of("InfluxDB", "Time-Series", "Telemetry", "OLAP")
        );
    }

    private CatalogTableDetailDTO getNordicInfluxDetail() {
        return new CatalogTableDetailDTO(
            getNordicInfluxSummary(),
            List.of(
                new CatalogColumnDTO("time", "TIMESTAMP", "Nanosecond precision timestamp.", true, false, null, "SYSTEM_AUDIT", List.of("2026-11-27T01:15:00Z")),
                new CatalogColumnDTO("source_node", "VARCHAR", "Gateway node tag.", false, false, null, "PUBLIC", List.of("nordic-gw-01")),
                new CatalogColumnDTO("tps_value", "DOUBLE", "Transactions per second.", false, false, null, "PUBLIC", List.of("1420.5")),
                new CatalogColumnDTO("latency_ms", "DOUBLE", "End-to-end sink latency.", false, false, null, "PUBLIC", List.of("12.4"))
            ),
            List.of(),
            List.of("influxdb://influx-nordic.corp.internal:8086/mobile_tps_metrics"),
            List.of("Platform SLA Monitoring")
        );
    }

    private CatalogTableSummaryDTO getNordicIcebergLedgerSummary() {
        return new CatalogTableSummaryDTO(
            "nordic_iceberg_ledger", "mobile_money_ledger$snapshots", "iceberg", "nordic_iceberg",
            "Lakehouse ACID Governance",
            "Nordic Mobile Money immutable Iceberg snapshot log.",
            "Apache Iceberg v2 Format", "MinIO S3 (Nordic Iceberg)", 1690400L, 4, "Real-time", "On Commit",
            List.of("Iceberg", "ACID", "Nordic")
        );
    }

    private CatalogTableDetailDTO getNordicIcebergLedgerDetail() {
        return new CatalogTableDetailDTO(
            getNordicIcebergLedgerSummary(),
            List.of(
                new CatalogColumnDTO("snapshot_id", "BIGINT", "Nordic commit snapshot ID.", true, false, null, "SYSTEM_AUDIT", List.of("4410293847102")),
                new CatalogColumnDTO("parent_id", "BIGINT", "Previous snapshot ID.", false, true, null, "SYSTEM_AUDIT", List.of("4410293846880")),
                new CatalogColumnDTO("operation", "VARCHAR", "ACID operation.", false, false, null, "SYSTEM_AUDIT", List.of("append")),
                new CatalogColumnDTO("committed_at", "TIMESTAMP", "Commit timestamp.", false, false, null, "SYSTEM_AUDIT", List.of("2026-11-26 23:05:19"))
            ),
            List.of(),
            List.of("hive.nordic_curated.mobile_money_events"),
            List.of("Nordic Time Travel")
        );
    }
}

