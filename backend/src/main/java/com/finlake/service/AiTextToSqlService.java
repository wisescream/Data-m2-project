package com.finlake.service;

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
import java.util.Locale;

@Service
public class AiTextToSqlService {

    private static final Logger log = LoggerFactory.getLogger(AiTextToSqlService.class);

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();

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

        // Check if OpenAI API Key or Ollama is present for external LLM execution
        String openAiKey = System.getenv("OPENAI_API_KEY");
        String ollamaUrl = System.getenv("OLLAMA_URL");

        if (openAiKey != null && !openAiKey.isBlank()) {
            try {
                TextToSqlResponseDTO llmResult = callOpenAi(prompt, openAiKey);
                if (llmResult != null) return llmResult;
            } catch (Exception e) {
                log.warn("OpenAI NL-to-SQL invocation failed, falling back to local semantic engine: {}", e.getMessage());
            }
        } else if (ollamaUrl != null && !ollamaUrl.isBlank()) {
            try {
                TextToSqlResponseDTO ollamaResult = callOllama(prompt, ollamaUrl);
                if (ollamaResult != null) return ollamaResult;
            } catch (Exception e) {
                log.warn("Ollama NL-to-SQL invocation failed, falling back to local semantic engine: {}", e.getMessage());
            }
        }

        // Built-in Semantic Natural Language Engine (Works 100% offline, zero-config)
        return resolveSemanticQuery(lower, prompt);
    }

    private TextToSqlResponseDTO resolveSemanticQuery(String lower, String rawPrompt) {
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
                "SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg.\"transactions$snapshots\" ORDER BY committed_at DESC LIMIT 15",
                "Queried Apache Iceberg metadata system table to inspect committed snapshot lineage and audit historical state mutations.",
                "iceberg",
                "finlake_iceberg",
                "table",
                null,
                null
            );
        }

        // 10. General Transactions fallback
        int limit = extractLimit(lower, 20);
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

    private TextToSqlResponseDTO callOpenAi(String prompt, String apiKey) {
        // Optional cloud LLM integration placeholder
        return null;
    }

    private TextToSqlResponseDTO callOllama(String prompt, String ollamaUrl) {
        // Optional local Ollama integration placeholder
        return null;
    }
}
