package com.finlake.dto;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class JobDtoTest {

    @Test
    void testDefaultValues() {
        JobCreateRequestDTO req = new JobCreateRequestDTO(null, null, null, null, null, null, null, null);
        assertEquals("sqlserver-paysim", req.sourceId());
        assertEquals("dbo", req.schemaName());
        assertEquals("transactions", req.table());
        assertEquals("parquet", req.format());
        assertEquals("snappy", req.compression());
        assertEquals(50000, req.batchSize());
    }

    @Test
    void testCustomValues() {
        JobCreateRequestDTO req = new JobCreateRequestDTO(
            "custom-source", "analytics", "tx_data", "csv", "gzip", 10000, List.of("event_date"), 5000L
        );
        assertEquals("custom-source", req.sourceId());
        assertEquals("analytics", req.schemaName());
        assertEquals("tx_data", req.table());
        assertEquals("csv", req.format());
        assertEquals("gzip", req.compression());
        assertEquals(10000, req.batchSize());
        assertEquals(5000L, req.maxRows());
        assertNotNull(req.partitionBy());
    }
}
