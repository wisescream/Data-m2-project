package com.finlake.controller;

import com.finlake.dto.SourceInfoDTO;
import com.finlake.dto.SourceTestResponseDTO;
import com.finlake.dto.TableListResponseDTO;
import com.finlake.dto.TableSchemaResponseDTO;
import com.finlake.service.SourceExplorerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/sources")
public class SourceController {

    private final SourceExplorerService explorerService;

    public SourceController(SourceExplorerService explorerService) {
        this.explorerService = explorerService;
    }

    @GetMapping
    public List<SourceInfoDTO> listSources() {
        return explorerService.listSources();
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
