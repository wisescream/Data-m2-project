package com.finlake.controller;

import com.finlake.dto.DashboardStatsDTO;
import com.finlake.dto.IcebergDashboardDTO;
import com.finlake.service.DashboardService;
import com.finlake.service.IcebergService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    public DashboardStatsDTO getStats() {
        return dashboardService.getDashboardStats();
    }

    @GetMapping("/iceberg")
    public IcebergDashboardDTO getIcebergDashboard() {
        return icebergService.getDashboardMetadata();
    }
}
