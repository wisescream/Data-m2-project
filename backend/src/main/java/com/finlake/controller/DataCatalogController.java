package com.finlake.controller;

import com.finlake.dto.CatalogTableDetailDTO;
import com.finlake.dto.CatalogTableSummaryDTO;
import com.finlake.service.DataCatalogService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/catalog")
public class DataCatalogController {

    private final DataCatalogService catalogService;

    public DataCatalogController(DataCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/tables")
    public List<CatalogTableSummaryDTO> getAllTables() {
        return catalogService.getAllTables();
    }

    @GetMapping("/tables/{tableId}")
    public ResponseEntity<CatalogTableDetailDTO> getTableDetail(@PathVariable String tableId) {
        return catalogService.getTableDetail(tableId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public List<CatalogTableSummaryDTO> searchCatalog(@RequestParam(name = "q", defaultValue = "") String query) {
        return catalogService.searchCatalog(query);
    }
}
