package com.finlake.controller;

import com.finlake.dto.DashboardStatsDTO;
import com.finlake.dto.IcebergDashboardDTO;
import com.finlake.dto.QueryResultDTO;
import com.finlake.service.DashboardService;
import com.finlake.service.IcebergService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;
    private final IcebergService icebergService;

    public DashboardController(DashboardService dashboardService, IcebergService icebergService) {
        this.dashboardService = dashboardService;
        this.icebergService = icebergService;
    }

    @GetMapping("/stats")
    public DashboardStatsDTO getStats(
            @RequestParam(name = "tenant_id", required = false) String tenantId
    ) {
        return dashboardService.getDashboardStats(tenantId);
    }

    @GetMapping("/iceberg")
    public IcebergDashboardDTO getIcebergDashboard(
            @RequestParam(name = "tenant_id", required = false) String tenantId
    ) {
        return icebergService.getDashboardMetadata(tenantId);
    }

    @GetMapping("/iceberg/time-travel")
    public QueryResultDTO timeTravel(
            @RequestParam(name = "tenant_id", required = false) String tenantId,
            @RequestParam(name = "snapshot_id") String snapshotId
    ) {
        return icebergService.executeTimeTravel(tenantId, snapshotId);
    }
}
