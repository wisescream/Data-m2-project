package com.finlake.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finlake.dto.TextToSqlRequestDTO;
import com.finlake.dto.TextToSqlResponseDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class AiTextToSqlService {

    private static final Logger log = LoggerFactory.getLogger(AiTextToSqlService.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(6))
        .build();

    public AiTextToSqlService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public TextToSqlResponseDTO generateSql(TextToSqlRequestDTO request) {
        if (request == null || request.prompt() == null || request.prompt().trim().isEmpty()) {
            return new TextToSqlResponseDTO(
                "SELECT * FROM hive.finlake_curated.transactions LIMIT 10",
                "Empty prompt received. Defaulting to sample transactions.",
                "hive",
                "finlake_curated",
                "table",
                null,
                null
            );
        }

        String prompt = request.prompt().trim();
        String lower = prompt.toLowerCase(Locale.ROOT);

        // 0. Check multi-database / polyglot federated intents first
        TextToSqlResponseDTO polyglotMatch = matchPolyglotOrFederatedIntent(lower);
        if (polyglotMatch != null) {
            return polyglotMatch;
        }

        // 1. Check for Groq API Key
        String groqKey = System.getenv("GROQ_API_KEY");
        if (groqKey != null && !groqKey.isBlank()) {
            try {
                TextToSqlResponseDTO groqResult = callGroq(prompt, groqKey);
                if (groqResult != null) {
                    log.info("Successfully generated SQL using Groq LLM inference for prompt: '{}'", prompt);
                    return groqResult;
                }
            } catch (Exception e) {
                log.warn("Groq LLM invocation failed, falling back to local semantic engine: {}", e.getMessage());
            }
        }

        // 2. Built-in Deterministic Semantic Natural Language Engine (100% offline fallback)
        return resolveSemanticQuery(lower, prompt);
    }

    private TextToSqlResponseDTO callGroq(String prompt, String apiKey) throws Exception {
        String systemPrompt = """
            You are an expert SQL engineer for the FinLake Trino Distributed Lakehouse.
            Respond with ONLY valid JSON with this exact structure:
            {
              "sql": "<ANSI SQL query compatible with Trino>",
              "explanation": "<short explanation of business logic>",
              "catalog": "hive or iceberg",
              "schema": "finlake_curated or finlake_iceberg",
              "suggested_chart": "bar or line or area or pie or table",
              "suggested_x": "<dimension column or null>",
              "suggested_y": "<metric column or null>"
            }

            Available Tables in hive.finlake_curated:
            1. customer (customer_id, first_name, last_name, email, city, created_at)
            2. invoice (invoice_id, customer_id, invoice_date, amount, status)
            3. payment (payment_id, invoice_id, payment_date, amount, payment_method)
            4. transactions (step, type, amount, name_orig, oldbalance_org, newbalance_orig, name_dest, oldbalance_dest, newbalance_dest, is_fraud, is_flagged_fraud)

            Available Tables in iceberg.finlake_iceberg:
            1. "transactions$snapshots" (snapshot_id, parent_id, operation, committed_at)

            Rules:
            - Always use ANSI SQL syntax compatible with Trino.
            - Fully qualify table names with catalog and schema (e.g. hive.finlake_curated.customer).
            - When joining customer, invoice, and payment, join customer.customer_id = invoice.customer_id and invoice.invoice_id = payment.invoice_id.
            - For aggregations (COUNT, SUM, AVG), always provide meaningful aliases (e.g. total_volume, count).
            - Always include a small LIMIT (e.g. LIMIT 10) on non-aggregated SELECT queries so results stay concise in table view.
            - Do not include markdown code blocks or backticks. Return raw JSON only.
            """;

        Map<String, Object> reqBody = new HashMap<>();
        reqBody.put("model", "openai/gpt-oss-120b");
        reqBody.put("temperature", 0.1);
        reqBody.put("response_format", Map.of("type", "json_object"));
        reqBody.put("messages", List.of(
            Map.of("role", "system", "content", systemPrompt),
            Map.of("role", "user", "content", prompt)
        ));

        String jsonPayload = objectMapper.writeValueAsString(reqBody);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(8))
            .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 200) {
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode choices = root.get("choices");
            if (choices != null && choices.isArray() && choices.size() > 0) {
                String content = choices.get(0).path("message").path("content").asText();
                JsonNode parsedContent = objectMapper.readTree(content);

                String sql = parsedContent.path("sql").asText();
                String explanation = parsedContent.path("explanation").asText();
                String catalog = parsedContent.path("catalog").asText("hive");
                String schema = parsedContent.path("schema").asText("finlake_curated");
                String suggestedChart = parsedContent.path("suggested_chart").asText("table");
                String suggestedX = parsedContent.hasNonNull("suggested_x") ? parsedContent.path("suggested_x").asText() : null;
                String suggestedY = parsedContent.hasNonNull("suggested_y") ? parsedContent.path("suggested_y").asText() : null;

                if (sql != null && !sql.isBlank()) {
                    return new TextToSqlResponseDTO(
                        sql,
                        explanation,
                        catalog,
                        schema,
                        suggestedChart,
                        suggestedX,
                        suggestedY
                    );
                }
            }
        } else {
            log.warn("Groq API returned HTTP {}: {}", response.statusCode(), response.body());
        }

        return null;
    }

    private TextToSqlResponseDTO resolveSemanticQuery(String lower, String rawPrompt) {
        // 0. Table Row Counts / Scale Demo (must run before customer/invoice/payment join rules)
        if (lower.contains("count") && (lower.contains("row") || lower.contains("ligne") || lower.contains("combien") || lower.contains("table") || lower.contains("scale"))) {
            return new TextToSqlResponseDTO(
                "SELECT 'transactions' AS table_name, COUNT(*) AS total_rows FROM hive.finlake_curated.transactions UNION ALL SELECT 'customer', COUNT(*) FROM hive.finlake_curated.customer UNION ALL SELECT 'invoice', COUNT(*) FROM hive.finlake_curated.invoice UNION ALL SELECT 'payment', COUNT(*) FROM hive.finlake_curated.payment",
                "Computed exact row counts across all curated Hive/Parquet tables using Parquet metadata to demonstrate Lakehouse scale in a concise table.",
                "hive",
                "finlake_curated",
                "table",
                null,
                null
            );
        }

        // 1. Payment Methods analysis
        if (lower.contains("payment") && (lower.contains("method") || lower.contains("mode") || lower.contains("settle") || lower.contains("by method"))) {
            return new TextToSqlResponseDTO(
                "SELECT payment_method, COUNT(*) AS count, ROUND(SUM(amount), 2) AS total_settled, ROUND(AVG(amount), 2) AS avg_payment FROM hive.finlake_curated.payment GROUP BY payment_method ORDER BY total_settled DESC",
                "Aggregated financial payments grouped by settlement method, calculating total settlement volume, transaction count, and average payment ticket.",
                "hive",
                "finlake_curated",
                "bar",
                "payment_method",
                "total_settled"
            );
        }

        // 2. City / Geographic revenue analysis
        if (lower.contains("city") || lower.contains("cities") || lower.contains("geograph") || lower.contains("location")) {
            int limit = extractLimit(lower, 10);
            return new TextToSqlResponseDTO(
                "SELECT c.city, COUNT(DISTINCT c.customer_id) AS customers, COUNT(i.invoice_id) AS invoices, ROUND(SUM(i.amount), 2) AS total_invoiced FROM hive.finlake_curated.customer c JOIN hive.finlake_curated.invoice i ON c.customer_id = i.customer_id GROUP BY c.city ORDER BY total_invoiced DESC LIMIT " + limit,
                "Joined Customer and Invoice entities to compute revenue distribution, invoice counts, and unique customer acquisition per city.",
                "hive",
                "finlake_curated",
                "bar",
                "city",
                "total_invoiced"
            );
        }

        // 3. Fraud / Risk analysis
        if (lower.contains("fraud") || lower.contains("suspicious") || lower.contains("risk") || lower.contains("scam")) {
            if (lower.contains("rate") || lower.contains("vs") || lower.contains("distribution") || lower.contains("ratio") || lower.contains("legitimate")) {
                return new TextToSqlResponseDTO(
                    "SELECT CASE WHEN is_fraud = 1 THEN 'Fraudulent' ELSE 'Legitimate' END AS fraud_status, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_volume, ROUND(AVG(amount), 2) AS avg_amount FROM hive.finlake_curated.transactions GROUP BY is_fraud",
                    "Segmented transaction population into Legitimate vs Fraudulent classes to evaluate fraud rates, affected volume, and average fraudulent transaction size.",
                    "hive",
                    "finlake_curated",
                    "pie",
                    "fraud_status",
                    "total_volume"
                );
            } else {
                return new TextToSqlResponseDTO(
                    "SELECT step, type, amount, name_orig, name_dest, is_fraud FROM hive.finlake_curated.transactions WHERE is_fraud = 1 ORDER BY amount DESC LIMIT 25",
                    "Filtered the curated transactions table specifically for confirmed fraudulent records, sorted by transaction value.",
                    "hive",
                    "finlake_curated",
                    "table",
                    null,
                    null
                );
            }
        }

        // 4. Invoices and Billing status
        if (lower.contains("invoice") && (lower.contains("status") || lower.contains("unpaid") || lower.contains("paid") || lower.contains("breakdown"))) {
            return new TextToSqlResponseDTO(
                "SELECT status, COUNT(*) AS invoice_count, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_invoice_amount FROM hive.finlake_curated.invoice GROUP BY status ORDER BY total_amount DESC",
                "Grouped invoices by lifecycle status (e.g. PAID, UNPAID, PENDING) to visualize settlement velocity and accounts receivable balance.",
                "hive",
                "finlake_curated",
                "pie",
                "status",
                "total_amount"
            );
        }

        // 5. Customer 3-Way Join (Customer + Invoice + Payment)
        if (lower.contains("customer") && (lower.contains("invoice") || lower.contains("payment") || lower.contains("detail") || lower.contains("join") || lower.contains("history"))) {
            int limit = extractLimit(lower, 20);
            return new TextToSqlResponseDTO(
                "SELECT c.customer_id, c.first_name || ' ' || c.last_name AS customer_name, c.city, i.invoice_id, i.invoice_date, i.amount AS invoice_amt, i.status AS inv_status, p.payment_id, p.amount AS payment_amt, p.payment_method FROM hive.finlake_curated.customer c JOIN hive.finlake_curated.invoice i ON c.customer_id = i.customer_id JOIN hive.finlake_curated.payment p ON i.invoice_id = p.invoice_id LIMIT " + limit,
                "Executed full relational 3-way join connecting Customers, their billing Invoices, and settled Payments for complete transaction provenance.",
                "hive",
                "finlake_curated",
                "table",
                null,
                null
            );
        }

        // 6. Customers list or segmentation
        if (lower.contains("customer") || lower.contains("client") || lower.contains("user")) {
            int limit = extractLimit(lower, 25);
            return new TextToSqlResponseDTO(
                "SELECT customer_id, first_name, last_name, email, city, created_at FROM hive.finlake_curated.customer ORDER BY created_at DESC LIMIT " + limit,
                "Retrieved customer master directory records with contact information and creation timestamps.",
                "hive",
                "finlake_curated",
                "table",
                null,
                null
            );
        }

        // 7. Transaction types (TRANSFER, CASH_OUT, PAYMENT, etc.)
        if (lower.contains("type") || lower.contains("transfer") || lower.contains("cash_out") || lower.contains("cash_in") || lower.contains("category")) {
            return new TextToSqlResponseDTO(
                "SELECT type, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_volume, ROUND(AVG(amount), 2) AS avg_amount FROM hive.finlake_curated.transactions GROUP BY type ORDER BY total_volume DESC",
                "Summarized transactions by financial operation type to analyze transaction distribution and total monetary volume.",
                "hive",
                "finlake_curated",
                "bar",
                "type",
                "total_volume"
            );
        }

        // 8. Temporal Trend / Time / Steps
        if (lower.contains("time") || lower.contains("trend") || lower.contains("step") || lower.contains("timeline") || lower.contains("hourly") || lower.contains("daily")) {
            int limit = extractLimit(lower, 50);
            return new TextToSqlResponseDTO(
                "SELECT step, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_volume FROM hive.finlake_curated.transactions GROUP BY step ORDER BY step ASC LIMIT " + limit,
                "Calculated temporal volume and transaction frequency progression across simulated time steps.",
                "hive",
                "finlake_curated",
                "area",
                "step",
                "total_volume"
            );
        }

        // 9. Apache Iceberg ACID Metadata & Snapshots
        if (lower.contains("iceberg") || lower.contains("snapshot") || lower.contains("audit") || lower.contains("history") || lower.contains("commit") || lower.contains("time travel")) {
            return new TextToSqlResponseDTO(
                "SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg.\"transactions$snapshots\" ORDER BY committed_at DESC LIMIT 10",
                "Queried Apache Iceberg metadata system table to inspect committed snapshot lineage and audit historical state mutations.",
                "iceberg",
                "finlake_iceberg",
                "table",
                null,
                null
            );
        }

        // 10. General Transactions fallback
        int limit = extractLimit(lower, 10);
        return new TextToSqlResponseDTO(
            "SELECT step, type, amount, name_orig, name_dest, is_fraud FROM hive.finlake_curated.transactions ORDER BY amount DESC LIMIT " + limit,
            "Interpreted natural language prompt as high-value transaction exploration, returning top records from the curated transactions table.",
            "hive",
            "finlake_curated",
            "table",
            null,
            null
        );
    }

    private int extractLimit(String text, int defaultLimit) {
        String[] words = text.split("\\s+");
        for (int i = 0; i < words.length - 1; i++) {
            if (words[i].equals("top") || words[i].equals("limit") || words[i].equals("first")) {
                try {
                    int val = Integer.parseInt(words[i + 1]);
                    if (val > 0 && val <= 1000) return val;
                } catch (NumberFormatException ignored) {}
            }
        }
        return defaultLimit;
    }

    private TextToSqlResponseDTO matchPolyglotOrFederatedIntent(String lower) {
        if ((lower.contains("postgres") && lower.contains("mongo")) || lower.contains("cross-db") || lower.contains("kyc")) {
            return new TextToSqlResponseDTO(
                "SELECT * FROM postgresql.public.retail_customers p JOIN mongodb.customer_profiles.customer_profiles m ON p.customer_id = m.customer_id",
                "Federated Cross-DB JOIN correlating PostgreSQL retail customers with MongoDB KYC document profiles.",
                "federated",
                "public",
                "table",
                null,
                null
            );
        }
        if ((lower.contains("sql server") || lower.contains("sqlserver")) && lower.contains("kafka")) {
            return new TextToSqlResponseDTO(
                "SELECT * FROM hive.finlake_curated.Customer c JOIN kafka.finlake_polyglot.events k ON c.email = k.email",
                "Federated Cross-DB JOIN linking SQL Server customers with real-time Kafka polyglot stream events.",
                "federated",
                "dbo",
                "table",
                null,
                null
            );
        }
        if (lower.contains("mongo")) {
            return new TextToSqlResponseDTO(
                "SELECT _id, customer_id, first_name, last_name, email, kyc_tier, iban FROM mongodb.customer_profiles.customer_profiles",
                "Queries semi-structured BSON customer KYC profiles from MongoDB Document Store.",
                "mongodb",
                "customer_profiles",
                "table",
                null,
                null
            );
        }
        if (lower.contains("redis")) {
            return new TextToSqlResponseDTO(
                "SELECT redis_key, ttl_seconds, email, name_orig, last_active_ip FROM redis.db0.session_token",
                "Inspects active user session keys and TTLs from Redis Key-Value Store.",
                "redis",
                "db0",
                "bar",
                "redis_key",
                "ttl_seconds"
            );
        }
        if (lower.contains("kafka")) {
            return new TextToSqlResponseDTO(
                "SELECT event_id, timestamp, source_type, entity, customer_name, email, amount FROM kafka.kafka_topics.finlake.polyglot.events",
                "Streams real-time polyglot events from Apache Kafka KRaft topic finlake.polyglot.events.",
                "kafka",
                "kafka_topics",
                "bar",
                "source_type",
                "amount"
            );
        }
        if (lower.contains("cassandra")) {
            return new TextToSqlResponseDTO(
                "SELECT account_id, tx_ts, name_orig, amount, currency FROM cassandra.nordic_ledger.mobile_tx_by_account",
                "Queries wide-column Nordic mobile-money ledger partitions from Apache Cassandra.",
                "cassandra",
                "nordic_ledger",
                "bar",
                "account_id",
                "amount"
            );
        }
        if (lower.contains("influx")) {
            return new TextToSqlResponseDTO(
                "SELECT time, source_node, tps_value, latency_ms FROM influxdb.mobile_tps_metrics.ingestion_throughput_tps",
                "Retrieves gateway TPS throughput and sink latency time-series from InfluxDB.",
                "influxdb",
                "mobile_tps_metrics",
                "line",
                "source_node",
                "tps_value"
            );
        }
        return null;
    }
}
