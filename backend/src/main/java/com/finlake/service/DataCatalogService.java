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
        refreshCountsIfNeeded();

        List<CatalogTableSummaryDTO> tables = new ArrayList<>();
        tables.add(getCustomerSummary());
        tables.add(getInvoiceSummary());
        tables.add(getPaymentSummary());
        tables.add(getTransactionsSummary());
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
            case "iceberg_snapshots", "iceberg.finlake_iceberg.snapshots" -> Optional.of(getIcebergSnapshotsDetail());
            default -> Optional.empty();
        };
    }

    public List<CatalogTableSummaryDTO> searchCatalog(String query) {
        if (query == null || query.isBlank()) {
            return getAllTables();
        }

        String q = query.toLowerCase(Locale.ROOT).trim();
        List<CatalogTableSummaryDTO> all = getAllTables();
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
}

