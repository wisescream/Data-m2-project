package com.finlake.controller;

import com.finlake.dto.AuditLogDTO;
import com.finlake.dto.QueryRequestDTO;
import com.finlake.dto.QueryResultDTO;
import com.finlake.dto.TextToSqlRequestDTO;
import com.finlake.dto.TextToSqlResponseDTO;
import com.finlake.service.AiTextToSqlService;
import com.finlake.service.SecurityGovernanceService;
import com.finlake.service.TrinoAnalyticsService;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private static final DateTimeFormatter ISO_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private final TrinoAnalyticsService trinoService;
    private final AiTextToSqlService aiService;
    private final SecurityGovernanceService securityService;

    public AnalyticsController(TrinoAnalyticsService trinoService, 
                               AiTextToSqlService aiService,
                               SecurityGovernanceService securityService) {
        this.trinoService = trinoService;
        this.aiService = aiService;
        this.securityService = securityService;
    }

    @PostMapping("/query")
    public QueryResultDTO runQuery(
            @RequestBody QueryRequestDTO req,
            @RequestHeader(name = "X-Tenant-Id", defaultValue = "tenant_acme") String tenantId,
            @RequestHeader(name = "X-User-Role", defaultValue = "ADMIN") String userRole,
            @RequestHeader(name = "X-User-Id", defaultValue = "user_alex_admin") String userId,
            @RequestHeader(name = "X-User-Name", defaultValue = "Alex Chen") String userName
    ) {
        long startTime = System.currentTimeMillis();
        QueryResultDTO rawResult = trinoService.executeQuery(
            req.query(),
            req.catalog(),
            req.schema(),
            req.maxRows() != null ? req.maxRows() : 1000
        );

        // Apply Dynamic Data Masking based on active persona role
        boolean maskingApplicable = "ANALYST".equalsIgnoreCase(userRole) || "DATA_ENGINEER".equalsIgnoreCase(userRole);
        QueryResultDTO finalResult = securityService.applyDynamicMasking(rawResult, userRole);

        // Record Audit Trail in compliance ledger
        AuditLogDTO auditEntry = new AuditLogDTO(
            "aud_" + UUID.randomUUID().toString().substring(0, 8),
            tenantId,
            userId,
            userName,
            userRole,
            req.query(),
            req.catalog(),
            req.schema(),
            finalResult.rows() != null ? finalResult.rows().size() : 0,
            finalResult.executionTimeMs() > 0 ? finalResult.executionTimeMs() : (System.currentTimeMillis() - startTime),
            maskingApplicable && finalResult.rows() != null && !finalResult.rows().isEmpty(),
            ISO_FMT.format(Instant.now()),
            finalResult.error() == null ? "SUCCESS" : "ERROR"
        );
        securityService.recordAudit(auditEntry);

        return finalResult;
    }

    @PostMapping("/ai/generate")
    public TextToSqlResponseDTO generateSqlFromPrompt(@RequestBody TextToSqlRequestDTO req) {
        return aiService.generateSql(req);
    }
}
