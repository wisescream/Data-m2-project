package com.finlake.controller;

import com.finlake.dto.AuditLogDTO;
import com.finlake.dto.TenantDTO;
import com.finlake.dto.UserPersonaDTO;
import com.finlake.service.SecurityGovernanceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    @GetMapping("/audit-logs")
    public List<AuditLogDTO> getAuditLogs(@RequestParam(name = "tenant", defaultValue = "ALL") String tenant) {
        return securityService.getAuditLogs(tenant);
    }

    @PostMapping("/audit")
    public void recordAudit(@RequestBody AuditLogDTO auditLog) {
        securityService.recordAudit(auditLog);
    }
}
