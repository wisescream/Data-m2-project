package com.finlake.controller;

import com.finlake.dto.QueryRequestDTO;
import com.finlake.dto.QueryResultDTO;
import com.finlake.dto.TextToSqlRequestDTO;
import com.finlake.dto.TextToSqlResponseDTO;
import com.finlake.service.AiTextToSqlService;
import com.finlake.service.TrinoAnalyticsService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final TrinoAnalyticsService trinoService;
    private final AiTextToSqlService aiService;

    public AnalyticsController(TrinoAnalyticsService trinoService, AiTextToSqlService aiService) {
        this.trinoService = trinoService;
        this.aiService = aiService;
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

    @PostMapping("/ai/generate")
    public TextToSqlResponseDTO generateSqlFromPrompt(@RequestBody TextToSqlRequestDTO req) {
        return aiService.generateSql(req);
    }
}
