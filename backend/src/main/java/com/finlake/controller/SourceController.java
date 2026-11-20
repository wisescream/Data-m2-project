package com.finlake.controller;

import com.finlake.dto.*;
import com.finlake.service.SourceExplorerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/sources")
public class SourceController {

    private final SourceExplorerService explorerService;

    public SourceController(SourceExplorerService explorerService) {
        this.explorerService = explorerService;
    }

    @GetMapping
    public List<DataSourceItemDTO> listSources() {
        return explorerService.listConfiguredSources();
    }

    @PostMapping
    public ResponseEntity<DataSourceItemDTO> registerSource(@Valid @RequestBody SourceProbeRequestDTO request) {
        DataSourceItemDTO item = explorerService.registerSource(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(item);
    }

    @PostMapping("/probe")
    public ResponseEntity<SourceProbeResponseDTO> probeConnection(@Valid @RequestBody SourceProbeRequestDTO request) {
        SourceProbeResponseDTO probe = explorerService.probeConnection(request);
        return ResponseEntity.ok(probe);
    }

    @PostMapping("/{sourceId}/test")
    public ResponseEntity<SourceTestResponseDTO> testSource(@PathVariable String sourceId) {
        SourceTestResponseDTO res = explorerService.testSource(sourceId);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{sourceId}/tables")
    public ResponseEntity<TableListResponseDTO> listTables(
            @PathVariable String sourceId,
            @RequestParam(defaultValue = "dbo") String schema
    ) {
        try {
            TableListResponseDTO tables = explorerService.listTables(sourceId, schema);
            return ResponseEntity.ok(tables);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/{sourceId}/tables/{table}/schema")
    public ResponseEntity<TableSchemaResponseDTO> getTableSchema(
            @PathVariable String sourceId,
            @PathVariable String table,
            @RequestParam(defaultValue = "dbo") String schema
    ) {
        try {
            TableSchemaResponseDTO dto = explorerService.describeTable(sourceId, schema, table);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
