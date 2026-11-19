package com.finlake.controller;

import com.finlake.dto.TenantCreateRequestDTO;
import com.finlake.dto.TenantProvisioningEventDTO;
import com.finlake.dto.TenantResponseDTO;
import com.finlake.service.TenantProvisioningService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/tenants")
public class TenantProvisioningController {

    private final TenantProvisioningService provisioningService;

    public TenantProvisioningController(TenantProvisioningService provisioningService) {
        this.provisioningService = provisioningService;
    }

    @PostMapping
    public ResponseEntity<TenantResponseDTO> provisionTenant(@Valid @RequestBody TenantCreateRequestDTO request) {
        TenantResponseDTO response = provisioningService.provisionTenant(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<TenantResponseDTO>> listAllTenants() {
        return ResponseEntity.ok(provisioningService.getAllTenants());
    }

    @GetMapping("/{tenantId}")
    public ResponseEntity<TenantResponseDTO> getTenant(@PathVariable String tenantId) {
        return ResponseEntity.ok(provisioningService.getTenant(tenantId));
    }

    @GetMapping("/{tenantId}/events")
    public ResponseEntity<List<TenantProvisioningEventDTO>> getTenantEvents(@PathVariable String tenantId) {
        return ResponseEntity.ok(provisioningService.getTenantEvents(tenantId));
    }
}
