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
}
