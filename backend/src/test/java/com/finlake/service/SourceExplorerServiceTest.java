package com.finlake.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SourceExplorerServiceTest {

    @Test
    void testValidateIdentifierValid() {
        assertEquals("raw_transactions", SourceExplorerService.validateIdentifier("raw_transactions"));
        assertEquals("dbo", SourceExplorerService.validateIdentifier("dbo"));
        assertEquals("Table123", SourceExplorerService.validateIdentifier("Table123"));
    }

    @Test
    void testValidateIdentifierSqlInjectionRejection() {
        assertThrows(IllegalArgumentException.class, () -> SourceExplorerService.validateIdentifier("raw_transactions; DROP TABLE x;--"));
        assertThrows(IllegalArgumentException.class, () -> SourceExplorerService.validateIdentifier("dbo.raw_transactions"));
        assertThrows(IllegalArgumentException.class, () -> SourceExplorerService.validateIdentifier("raw transactions"));
        assertThrows(IllegalArgumentException.class, () -> SourceExplorerService.validateIdentifier(""));
        assertThrows(IllegalArgumentException.class, () -> SourceExplorerService.validateIdentifier(null));
    }
}
