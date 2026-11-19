package com.finlake.controller;

import com.finlake.dto.QueryRequestDTO;
import com.finlake.dto.QueryResultDTO;
import com.finlake.service.TrinoAnalyticsService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final TrinoAnalyticsService trinoService;

    public AnalyticsController(TrinoAnalyticsService trinoService) {
        this.trinoService = trinoService;
    }

    @PostMapping("/query")
    public QueryResultDTO runQuery(@RequestBody QueryRequestDTO req) {
        return trinoService.executeQuery(
            req.query(),
            req.catalog(),
            req.schema(),
            req.maxRows() != null ? req.maxRows() : 1000
        );
    }
}
