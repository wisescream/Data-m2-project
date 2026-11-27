package com.finlake.controller;

import com.finlake.dto.AuditLogDTO;
import com.finlake.dto.TenantDTO;
import com.finlake.dto.UserPersonaDTO;
import com.finlake.service.SecurityGovernanceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/security")
public class SecurityGovernanceController {

    private final SecurityGovernanceService securityService;

    public SecurityGovernanceController(SecurityGovernanceService securityService) {
        this.securityService = securityService;
    }

    @GetMapping("/tenants")
    public List<TenantDTO> getTenants() {
        return securityService.getTenants();
    }

    @GetMapping("/personas")
    public List<UserPersonaDTO> getPersonas() {
        return securityService.getPersonas();
    }

    @GetMapping("/policies")
    public Map<String, Object> getAnonymizationPolicies(
            @RequestParam(name = "tenant_id", required = false) String tenantId
    ) {
        return securityService.getAnonymizationPolicies(tenantId);
    }

    @PostMapping("/policies")
    public ResponseEntity<Map<String, Object>> updateAnonymizationPolicy(
            @RequestBody Map<String, Object> body,
            @RequestHeader(name = "X-User-Role", defaultValue = "ANALYST") String requesterRole
    ) {
        try {
            String targetUserId = String.valueOf(body.get("target_user_id"));
            boolean anonymize = Boolean.parseBoolean(String.valueOf(body.get("anonymize")));
            return ResponseEntity.ok(securityService.updateAnonymizationPolicy(targetUserId, anonymize, requesterRole));
        } catch (SecurityException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/columns")
    public Map<String, Object> getAnonymizationColumns() {
        return securityService.getColumnAnonymizationConfig();
    }

    @PostMapping("/columns")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> updateAnonymizationColumns(
            @RequestBody Map<String, Object> body,
            @RequestHeader(name = "X-User-Role", defaultValue = "ANALYST") String requesterRole
    ) {
        try {
            Object rawCols = body.get("columns");
            List<String> columns = rawCols instanceof List<?> list
                    ? list.stream().map(String::valueOf).toList()
                    : List.of();
            return ResponseEntity.ok(securityService.updateCustomAnonymizedColumns(columns, requesterRole));
        } catch (SecurityException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/audit-logs")
    public List<AuditLogDTO> getAuditLogs(@RequestParam(name = "tenant", defaultValue = "ALL") String tenant) {
        return securityService.getAuditLogs(tenant);
    }

    @PostMapping("/audit")
    public void recordAudit(@RequestBody AuditLogDTO auditLog) {
        securityService.recordAudit(auditLog);
    }
}
