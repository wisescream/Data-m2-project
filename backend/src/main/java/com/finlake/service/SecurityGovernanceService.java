package com.finlake.service;

import com.finlake.dto.AuditLogDTO;
import com.finlake.dto.QueryResultDTO;
import com.finlake.dto.TenantDTO;
import com.finlake.dto.UserPersonaDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SecurityGovernanceService {

    private static final Logger log = LoggerFactory.getLogger(SecurityGovernanceService.class);
    private static final DateTimeFormatter ISO_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private final Map<String, TenantDTO> tenants = new ConcurrentHashMap<>();
    private final Map<String, UserPersonaDTO> personas = new ConcurrentHashMap<>();
    private final List<AuditLogDTO> auditLedger = new CopyOnWriteArrayList<>();
    // Data Owner anonymization overrides: userId -> true (anonymized) / false (unmasked)
    private final Map<String, Boolean> userAnonymizationPolicies = new ConcurrentHashMap<>();

    public SecurityGovernanceService() {
        initTenantsAndPersonas();
    }

    private void initTenantsAndPersonas() {
        // 1. Tenants (Enterprise Workspaces)
        TenantDTO acme = new TenantDTO(
            "tenant_acme",
            "Acme Payments Global",
            "ACME-PAY",
            "Enterprise Tier",
            "hive",
            "finlake_curated",
            12,
            "2026-01-10",
            List.of("Dynamic PII Masking", "Custom Schema Namespace", "Iceberg Audit Vault", "Trino MPP Allocation")
        );

        TenantDTO apex = new TenantDTO(
            "tenant_apex",
            "Apex Retail Bank EU",
            "APEX-EU",
            "Banking Tier (GDPR)",
            "hive",
            "finlake_curated",
            25,
            "2026-01-20",
            List.of("Strict GDPR Masking", "Audit Trail Preservation", "Single Tenant Storage Bucket", "Time Travel Engine")
        );

        TenantDTO nordic = new TenantDTO(
            "tenant_nordic",
            "Nordic Mobile Money Ltd",
            "NORDIC-MOM",
            "FinTech Tier",
            "hive",
            "finlake_curated",
            8,
            "2026-02-01",
            List.of("PaySim Analytics", "Fraud Scoring Models", "High-Throughput Ingestion")
        );

        tenants.put(acme.id(), acme);
        tenants.put(apex.id(), apex);
        tenants.put(nordic.id(), nordic);

        // 2. Sample Personas
        UserPersonaDTO sarah = new UserPersonaDTO(
            "user_sarah_analyst",
            "sarah.analyst",
            "Sarah Connor",
            "sarah.c@acmepayments.com",
            acme.id(),
            "ANALYST",
            List.of("READ_QUERIES", "CREATE_CHARTS", "EXPORT_CSV", "SAVE_BOOKMARKS"),
            false, // Cannot view raw PII -> Dynamic Masking Active
            false,
            false
        );

        UserPersonaDTO david = new UserPersonaDTO(
            "user_david_auditor",
            "david.auditor",
            "David Miller",
            "david.m@acmepayments.com",
            acme.id(),
            "AUDITOR",
            List.of("READ_QUERIES", "VIEW_UNMASKED_PII", "INSPECT_AUDIT_LOGS", "TIME_TRAVEL_ICEBERG"),
            true, // Can view raw PII
            false,
            true
        );

        UserPersonaDTO alex = new UserPersonaDTO(
            "user_alex_admin",
            "alex.admin",
            "Alex Chen",
            "alex.c@acmepayments.com",
            acme.id(),
            "ADMIN",
            List.of("ALL_PERMISSIONS", "MANAGE_WORKSPACE", "MANAGE_USERS", "VIEW_UNMASKED_PII", "TRIGGER_PIPELINES"),
            true,
            true,
            true
        );

        UserPersonaDTO elena = new UserPersonaDTO(
            "user_elena_engineer",
            "elena.engineer",
            "Elena Rostova",
            "elena.r@apexbank.eu",
            apex.id(),
            "DATA_ENGINEER",
            List.of("RUN_INGESTION_JOBS", "MODIFY_TABLE_METADATA", "READ_QUERIES", "INSPECT_PARTITIONS"),
            false,
            true,
            true
        );

        UserPersonaDTO marcus = new UserPersonaDTO(
            "user_marcus_owner",
            "marcus.owner",
            "Marcus Vance",
            "marcus.v@apexbank.eu",
            apex.id(),
            "DATA_OWNER",
            List.of("ALL_PERMISSIONS", "MANAGE_ANONYMIZATION", "VIEW_UNMASKED_PII", "READ_QUERIES", "TRIGGER_PIPELINES"),
            true,
            true,
            true
        );

        UserPersonaDTO nordicLead = new UserPersonaDTO(
            "user_nordic_owner",
            "nordic.lead",
            "Astrid Lindqvist",
            "astrid.l@nordicmoney.se",
            nordic.id(),
            "DATA_OWNER",
            List.of("ALL_PERMISSIONS", "MANAGE_ANONYMIZATION", "VIEW_UNMASKED_PII", "READ_QUERIES", "TRIGGER_PIPELINES"),
            true,
            true,
            true
        );

        UserPersonaDTO nordicAnalyst = new UserPersonaDTO(
            "user_nordic_analyst",
            "sven.analyst",
            "Sven Bergstrom",
            "sven.b@nordicmoney.se",
            nordic.id(),
            "ANALYST",
            List.of("READ_QUERIES", "CREATE_CHARTS", "EXPORT_CSV"),
            false,
            false,
            false
        );

        personas.put(sarah.id(), sarah);
        personas.put(david.id(), david);
        personas.put(alex.id(), alex);
        personas.put(elena.id(), elena);
        personas.put(marcus.id(), marcus);
        personas.put(nordicLead.id(), nordicLead);
        personas.put(nordicAnalyst.id(), nordicAnalyst);

        // Initialize default anonymization policy per user
        for (UserPersonaDTO p : personas.values()) {
            userAnonymizationPolicies.put(p.id(), !p.canViewPii());
        }

        // Initial sample audit logs
        auditLedger.add(new AuditLogDTO(
            "aud_1",
            acme.id(),
            sarah.id(),
            sarah.fullName(),
            sarah.role(),
            "SELECT c.customer_id, c.first_name, c.email FROM hive.finlake_curated.customer c LIMIT 10",
            "hive",
            "finlake_curated",
            10,
            245,
            true,
            "2026-11-19 18:30:15",
            "SUCCESS"
        ));

        auditLedger.add(new AuditLogDTO(
            "aud_2",
            acme.id(),
            david.id(),
            david.fullName(),
            david.role(),
            "SELECT * FROM iceberg.finlake_iceberg.\"transactions$snapshots\"",
            "iceberg",
            "finlake_iceberg",
            3,
            180,
            false,
            "2026-11-19 18:45:00",
            "SUCCESS"
        ));
    }

    public List<TenantDTO> getTenants() {
        return new ArrayList<>(tenants.values());
    }

    public List<UserPersonaDTO> getPersonas() {
        return personas.values().stream()
            .map(p -> {
                boolean isAnon = userAnonymizationPolicies.getOrDefault(p.id(), !p.canViewPii());
                return new UserPersonaDTO(
                    p.id(), p.username(), p.fullName(), p.email(), p.tenantId(),
                    p.role(), p.permissions(), !isAnon, p.canManagePipelines(), p.canViewIcebergSnapshots()
                );
            })
            .toList();
    }

    public Optional<UserPersonaDTO> getPersona(String personaId) {
        UserPersonaDTO p = personas.get(personaId);
        if (p == null) return Optional.empty();
        boolean isAnon = userAnonymizationPolicies.getOrDefault(p.id(), !p.canViewPii());
        return Optional.of(new UserPersonaDTO(
            p.id(), p.username(), p.fullName(), p.email(), p.tenantId(),
            p.role(), p.permissions(), !isAnon, p.canManagePipelines(), p.canViewIcebergSnapshots()
        ));
    }

    public Map<String, Object> getAnonymizationPolicies(String tenantId) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (UserPersonaDTO p : getPersonas()) {
            if (tenantId != null && !tenantId.isBlank() && !"ALL".equalsIgnoreCase(tenantId)
                    && !p.tenantId().equalsIgnoreCase(tenantId)) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("user_id", p.id());
            entry.put("username", p.username());
            entry.put("full_name", p.fullName());
            entry.put("role", p.role());
            entry.put("tenant_id", p.tenantId());
            entry.put("anonymized", userAnonymizationPolicies.getOrDefault(p.id(), !p.canViewPii()));
            list.add(entry);
        }
        return Map.of("policies", list);
    }

    public Map<String, Object> updateAnonymizationPolicy(String targetUserId, boolean anonymize, String requesterRole) {
        if (!"DATA_OWNER".equalsIgnoreCase(requesterRole) && !"ADMIN".equalsIgnoreCase(requesterRole)) {
            throw new SecurityException("Access denied: Only DATA_OWNER or ADMIN can modify anonymization policies.");
        }
        UserPersonaDTO target = personas.get(targetUserId);
        if (target == null) {
            throw new IllegalArgumentException("User not found: " + targetUserId);
        }
        userAnonymizationPolicies.put(targetUserId, anonymize);
        log.info("Data Owner ({}) set anonymization for user {} ({}) to {}", requesterRole, target.username(), target.role(), anonymize);
        return Map.of(
            "status", "UPDATED",
            "user_id", targetUserId,
            "username", target.username(),
            "anonymized", anonymize
        );
    }

    public boolean shouldAnonymizeUser(String userId, String role) {
        if (userId != null && userAnonymizationPolicies.containsKey(userId)) {
            return userAnonymizationPolicies.get(userId);
        }
        return "ANALYST".equalsIgnoreCase(role) || "DATA_ENGINEER".equalsIgnoreCase(role);
    }

    public List<AuditLogDTO> getAuditLogs(String tenantId) {
        if (tenantId == null || tenantId.isBlank() || "ALL".equalsIgnoreCase(tenantId)) {
            return new ArrayList<>(auditLedger);
        }
        return auditLedger.stream()
            .filter(l -> l.tenantId().equalsIgnoreCase(tenantId))
            .toList();
    }

    public void recordAudit(AuditLogDTO log) {
        auditLedger.add(0, log);
        if (auditLedger.size() > 500) {
            auditLedger.remove(auditLedger.size() - 1);
        }
    }

    /**
     * Dynamic Data Masking Engine:
     * If user role does NOT have permission to view PII, mask emails, names, and account numbers.
     */
    public QueryResultDTO applyDynamicMasking(QueryResultDTO rawResult, String role) {
        return applyDynamicMasking(rawResult, null, role);
    }

    public QueryResultDTO applyDynamicMasking(QueryResultDTO rawResult, String userId, String role) {
        if (rawResult == null || rawResult.rows() == null || rawResult.rows().isEmpty()) {
            return rawResult;
        }

        // Check Data Owner policy override first, then role default
        boolean shouldMask = shouldAnonymizeUser(userId, role);
        if (!shouldMask) {
            return rawResult;
        }

        List<Map<String, Object>> maskedRows = new ArrayList<>(rawResult.rows().size());

        for (Map<String, Object> row : rawResult.rows()) {
            Map<String, Object> newRow = new LinkedHashMap<>(row);
            for (Map.Entry<String, Object> entry : row.entrySet()) {
                String key = entry.getKey().toLowerCase(Locale.ROOT);
                Object val = entry.getValue();
                if (val == null) continue;
                String strVal = val.toString();

                // Mask Email
                if (key.contains("email")) {
                    newRow.put(entry.getKey(), maskEmail(strVal));
                }
                // Mask First Name
                else if (key.equals("first_name")) {
                    newRow.put(entry.getKey(), maskName(strVal));
                }
                // Mask Last Name
                else if (key.equals("last_name")) {
                    newRow.put(entry.getKey(), maskName(strVal));
                }
                // Mask Full Name
                else if (key.contains("customer_name") || key.equals("name")) {
                    newRow.put(entry.getKey(), maskFullName(strVal));
                }
                // Mask Account Identifiers
                else if (key.equals("name_orig") || key.equals("name_dest")) {
                    newRow.put(entry.getKey(), maskAccount(strVal));
                }
            }
            maskedRows.add(newRow);
        }

        return new QueryResultDTO(
            rawResult.columns(),
            maskedRows,
            rawResult.rowCount(),
            rawResult.executionTimeMs(),
            rawResult.error()
        );
    }

    private String maskEmail(String email) {
        int atIdx = email.indexOf('@');
        if (atIdx <= 1) return "***@***.com";
        String namePart = email.substring(0, atIdx);
        String domainPart = email.substring(atIdx);
        return namePart.charAt(0) + "***" + domainPart;
    }

    private String maskName(String name) {
        if (name.length() <= 1) return "*";
        return name.charAt(0) + "***";
    }

    private String maskFullName(String fullName) {
        String[] parts = fullName.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (!sb.isEmpty()) sb.append(" ");
            sb.append(maskName(p));
        }
        return sb.toString();
    }

    private String maskAccount(String account) {
        if (account.length() <= 4) return "****";
        return account.substring(0, 4) + "****";
    }
}
