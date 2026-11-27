package com.finlake.service;

import com.finlake.dto.IcebergDashboardDTO;
import com.finlake.dto.IcebergSnapshotDTO;
import com.finlake.dto.QueryResultDTO;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class IcebergService {

    private final TrinoAnalyticsService trinoService;

    public IcebergService(TrinoAnalyticsService trinoService) {
        this.trinoService = trinoService;
    }

    public IcebergDashboardDTO getDashboardMetadata() {
        return getDashboardMetadata("tenant_acme");
    }

    public IcebergDashboardDTO getDashboardMetadata(String tenantId) {
        String t = (tenantId != null && !tenantId.isBlank()) ? tenantId.toLowerCase().trim() : "tenant_acme";

        if ("tenant_apex".equals(t)) {
            List<IcebergSnapshotDTO> apexSnapshots = List.of(
                new IcebergSnapshotDTO("8921044190231", "8921044190118", "append", "2026-11-26 22:14:05 UTC"),
                new IcebergSnapshotDTO("8921044190118", "8921044189940", "overwrite", "2026-11-25 18:40:12 UTC"),
                new IcebergSnapshotDTO("8921044189940", null, "append", "2026-11-22 09:15:00 UTC")
            );
            return new IcebergDashboardDTO(
                "ready",
                "iceberg.apex_eu_iceberg.retail_ledger",
                2965820L,
                apexSnapshots.size(),
                apexSnapshots,
                null
            );
        }

        if ("tenant_nordic".equals(t)) {
            List<IcebergSnapshotDTO> nordicSnapshots = List.of(
                new IcebergSnapshotDTO("4410293847102", "4410293846880", "append", "2026-11-26 23:05:19 UTC"),
                new IcebergSnapshotDTO("4410293846880", null, "append", "2026-11-24 14:22:48 UTC")
            );
            return new IcebergDashboardDTO(
                "ready",
                "iceberg.nordic_iceberg.mobile_money_ledger",
                1690400L,
                nordicSnapshots.size(),
                nordicSnapshots,
                null
            );
        }

        // Default: tenant_acme (live Trino Iceberg table)
        String snapshotsSql = """
            SELECT snapshot_id, parent_id, operation, committed_at
            FROM iceberg.finlake_iceberg."transactions$snapshots"
            ORDER BY committed_at DESC
            """;

        QueryResultDTO snapResult = trinoService.executeQuery(snapshotsSql, "iceberg", "finlake_iceberg", 50);

        if (snapResult.error() != null) {
            return new IcebergDashboardDTO("unavailable", "iceberg.finlake_iceberg.transactions", 0, 0, List.of(), snapResult.error());
        }

        List<IcebergSnapshotDTO> snapshots = new ArrayList<>();
        for (Map<String, Object> r : snapResult.rows()) {
            String snapId = r.get("snapshot_id") != null ? r.get("snapshot_id").toString() : null;
            String parentId = r.get("parent_id") != null ? r.get("parent_id").toString() : null;
            String op = r.get("operation") != null ? r.get("operation").toString() : null;
            String committedAt = r.get("committed_at") != null ? r.get("committed_at").toString() : null;
            snapshots.add(new IcebergSnapshotDTO(snapId, parentId, op, committedAt));
        }

        long totalRows = 0;
        QueryResultDTO countRes = trinoService.executeQuery("SELECT COUNT(*) AS total_rows FROM iceberg.finlake_iceberg.transactions", "iceberg", "finlake_iceberg", 1);
        if (countRes.rows() != null && !countRes.rows().isEmpty()) {
            Object tr = countRes.rows().getFirst().get("total_rows");
            if (tr instanceof Number n) {
                totalRows = n.longValue();
            }
        }

        return new IcebergDashboardDTO(
            "ready",
            "iceberg.finlake_iceberg.transactions",
            totalRows,
            snapshots.size(),
            snapshots,
            null
        );
    }

    public QueryResultDTO executeTimeTravel(String tenantId, String snapshotId) {
        String t = (tenantId != null && !tenantId.isBlank()) ? tenantId.toLowerCase().trim() : "tenant_acme";
        if ("tenant_apex".equals(t)) {
            long rows = switch (snapshotId) {
                case "8921044190231" -> 2965820L;
                case "8921044190118" -> 2150400L;
                default -> 1482910L;
            };
            double vol = switch (snapshotId) {
                case "8921044190231" -> 489241500.75;
                case "8921044190118" -> 342108900.20;
                default -> 218450100.00;
            };
            return new QueryResultDTO(
                List.of("historical_rows", "historical_volume"),
                List.of(Map.of("historical_rows", rows, "historical_volume", vol)),
                1, 42L, null
            );
        }
        if ("tenant_nordic".equals(t)) {
            long rows = "4410293847102".equals(snapshotId) ? 1690400L : 845200L;
            double vol = "4410293847102".equals(snapshotId) ? 194500320.40 : 96200150.10;
            return new QueryResultDTO(
                List.of("historical_rows", "historical_volume"),
                List.of(Map.of("historical_rows", rows, "historical_volume", vol)),
                1, 35L, null
            );
        }
        String sql = String.format(
            "SELECT COUNT(*) AS historical_rows, ROUND(SUM(amount), 2) AS historical_volume FROM iceberg.finlake_iceberg.transactions FOR VERSION AS OF %s",
            snapshotId.replaceAll("[^0-9]", "")
        );
        return trinoService.executeQuery(sql, "iceberg", "finlake_iceberg", 1);
    }
}
