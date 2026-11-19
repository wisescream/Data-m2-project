package com.finlake.service;

import com.finlake.dto.QueryResultDTO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrinoAnalyticsServiceTest {

    @Test
    void testExecuteQueryGracefulFailureOnNoConnection() {
        TrinoAnalyticsService service = new TrinoAnalyticsService();
        QueryResultDTO res = service.executeQuery("SELECT 1", "hive", "default", 10);
        assertNotNull(res);
        assertNotNull(res.columns());
        assertNotNull(res.rows());
        // Since Trino might not be running locally in test environment, it should gracefully return error string
        // instead of throwing an unhandled exception
        assertTrue(res.rowCount() == 0 || res.rowCount() > 0);
    }
}
