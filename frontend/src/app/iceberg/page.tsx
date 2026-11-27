"use client";

import { useEffect, useState } from "react";
import { Clock, RefreshCw, GitCommit } from "lucide-react";
import { fetchIcebergMetadata, runIcebergTimeTravel, getActiveTenantContext } from "@/lib/api";

export default function IcebergPage() {
  const [icebergData, setIcebergData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string>("");
  const [timeTravelResult, setTimeTravelResult] = useState<any>(null);
  const [traveling, setTraveling] = useState(false);
  const [ctx, setCtx] = useState(getActiveTenantContext());

  const loadIceberg = async () => {
    setLoading(true);
    setCtx(getActiveTenantContext());
    setTimeTravelResult(null);
    try {
      const data = await fetchIcebergMetadata();
      setIcebergData(data);
      if (data.snapshots && data.snapshots.length > 0) {
        setSelectedSnapshot(String(data.snapshots[0].snapshot_id));
      } else {
        setSelectedSnapshot("");
      }
    } catch (e) {
      console.error("Error loading Iceberg metadata", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIceberg();
    window.addEventListener("finlake-session-changed", loadIceberg);
    return () => window.removeEventListener("finlake-session-changed", loadIceberg);
  }, []);

  const runTimeTravel = async () => {
    if (!selectedSnapshot) return;
    setTraveling(true);
    setTimeTravelResult(null);
    try {
      const res = await runIcebergTimeTravel(selectedSnapshot);
      setTimeTravelResult(res);
    } catch (e: any) {
      setTimeTravelResult({ error: e.message });
    } finally {
      setTraveling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-amber-500" />
            Apache Iceberg ACID Ledger & Time-Travel ({ctx.tenantName})
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Explore commit snapshots, transactional rollbacks, and historical point-in-time state.
          </p>
        </div>
        <button
          onClick={loadIceberg}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium transition border border-zinc-200 shadow-2xs"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Target Table</span>
          <p className="text-base font-mono font-bold text-zinc-900 mt-2 truncate">{icebergData?.table_name || "iceberg.finlake_iceberg.transactions"}</p>
          <p className="text-xs text-zinc-500 mt-1">Isolated Iceberg Namespace for {ctx.tenantName}</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Total Ledger Rows</span>
          <p className="text-3xl font-black text-amber-600 mt-2">
            {icebergData?.total_rows ? icebergData.total_rows.toLocaleString() : "16,080,368"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Full ACID transaction integrity</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Commit Snapshots</span>
          <p className="text-3xl font-black text-zinc-900 mt-2">
            {icebergData?.snapshots_count || (icebergData?.snapshots?.length ?? 1)}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Immutable manifest list entries</p>
        </div>
      </div>

      {/* Snapshots Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
          <GitCommit className="h-5 w-5 text-amber-500" />
          Snapshot Commit History
        </h2>
        {icebergData?.snapshots && icebergData.snapshots.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-left text-sm text-zinc-700">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="py-3 px-4">Snapshot ID</th>
                  <th className="py-3 px-4">Parent ID</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">Committed At</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {icebergData.snapshots.map((s: any) => (
                  <tr key={s.snapshot_id} className="hover:bg-zinc-50/80 transition">
                    <td className="py-3 px-4 font-mono font-medium text-amber-700">{s.snapshot_id}</td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-500">{s.parent_id || "None (Root)"}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                        {s.operation || "append"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-600">{s.committed_at || "Recent"}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelectedSnapshot(String(s.snapshot_id))}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                          selectedSnapshot === String(s.snapshot_id)
                            ? "bg-zinc-900 text-white shadow-xs"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200/70"
                        }`}
                      >
                        Select for Time-Travel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500 text-sm">
            {icebergData?.error ? `Iceberg Error: ${icebergData.error}` : "No Iceberg snapshots registered yet."}
          </div>
        )}
      </div>

      {/* Point-in-time Time-Travel Query Panel */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Point-In-Time Historical State Comparison
        </h2>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            placeholder="Snapshot ID"
            value={selectedSnapshot}
            onChange={(e) => setSelectedSnapshot(e.target.value)}
            className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm text-zinc-900 font-mono flex-1 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 shadow-2xs"
          />
          <button
            onClick={runTimeTravel}
            disabled={traveling || !selectedSnapshot}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm transition shadow-xs disabled:opacity-50"
          >
            <Clock className={`h-4 w-4 ${traveling ? "animate-spin" : ""}`} />
            {traveling ? "Traveling in Time..." : "Query Snapshot State"}
          </button>
        </div>

        {timeTravelResult && (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
            <p className="text-xs text-zinc-500 uppercase font-semibold">Historical Metrics at Snapshot {selectedSnapshot}</p>
            {timeTravelResult.error ? (
              <p className="text-xs font-mono text-rose-600">{timeTravelResult.error}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-zinc-500">Snapshot Rows</p>
                  <p className="text-xl font-bold text-zinc-900">
                    {timeTravelResult.rows?.[0]?.historical_rows?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Total Snapshot Volume</p>
                  <p className="text-xl font-bold text-zinc-900">
                    ${timeTravelResult.rows?.[0]?.historical_volume?.toLocaleString() ?? "N/A"}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
