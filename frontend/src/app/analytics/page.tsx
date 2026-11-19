"use client";

import { useState } from "react";
import { 
  BarChart3, 
  Play, 
  Clock, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Code,
  FileSpreadsheet
} from "lucide-react";
import { runTrinoQuery } from "@/lib/api";

const PRESET_QUERIES = [
  {
    title: "Fraud Rate & Average Amount",
    catalog: "hive",
    schema: "default",
    sql: "SELECT isFraud, COUNT(*) AS tx_count, ROUND(AVG(amount), 2) AS avg_amount, ROUND(SUM(amount), 2) AS total_volume FROM raw_transactions GROUP BY isFraud;",
  },
  {
    title: "Volume by Transaction Type",
    catalog: "hive",
    schema: "default",
    sql: "SELECT type, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_amount FROM raw_transactions GROUP BY type ORDER BY total_amount DESC;",
  },
  {
    title: "Hourly Volume Pattern (24h Simulated)",
    catalog: "hive",
    schema: "default",
    sql: "SELECT step % 24 AS hour_of_day, COUNT(*) AS transactions, SUM(isFraud) AS fraud_events FROM raw_transactions GROUP BY step % 24 ORDER BY hour_of_day;",
  },
  {
    title: "Iceberg Snapshots Audit Log",
    catalog: "iceberg",
    schema: "finlake_iceberg",
    sql: 'SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg."transactions$snapshots" ORDER BY committed_at DESC;',
  },
];

export default function AnalyticsPage() {
  const [catalog, setCatalog] = useState("hive");
  const [schema, setSchema] = useState("default");
  const [sql, setSql] = useState(PRESET_QUERIES[0].sql);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    setExecuting(true);
    setResult(null);
    try {
      const data = await runTrinoQuery(sql, catalog, schema);
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message, columns: [], rows: [] });
    } finally {
      setExecuting(false);
    }
  };

  const loadPreset = (preset: typeof PRESET_QUERIES[0]) => {
    setCatalog(preset.catalog);
    setSchema(preset.schema);
    setSql(preset.sql);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-400" />
            Trino Distributed Query Runner
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Execute ANSI SQL queries across Parquet data in MinIO and Apache Iceberg tables.
          </p>
        </div>
        <button
          onClick={handleRunQuery}
          disabled={executing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition shadow-lg shadow-purple-600/20"
        >
          <Play className={`h-4 w-4 ${executing ? "animate-spin" : ""}`} />
          {executing ? "Executing Query..." : "Execute SQL"}
        </button>
      </div>

      {/* Preset Queries */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-400 self-center mr-2">Presets:</span>
        {PRESET_QUERIES.map((preset) => (
          <button
            key={preset.title}
            onClick={() => loadPreset(preset)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition"
          >
            {preset.title}
          </button>
        ))}
      </div>

      {/* Query Editor Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 uppercase font-semibold">Catalog:</label>
            <select
              value={catalog}
              onChange={(e) => setCatalog(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="hive">hive (MinIO External)</option>
              <option value="iceberg">iceberg (ACID Lakehouse)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 uppercase font-semibold">Schema:</label>
            <select
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            >
              <option value="default">default</option>
              <option value="finlake_iceberg">finlake_iceberg</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={5}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-sm text-purple-300 focus:outline-none focus:border-purple-500 resize-y"
            placeholder="SELECT * FROM raw_transactions LIMIT 10;"
          />
        </div>
      </div>

      {/* Query Results */}
      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-400" />
              Query Results
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {result.execution_time_ms !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-purple-400" />
                  Latency: <strong className="text-white">{result.execution_time_ms} ms</strong>
                </span>
              )}
              {result.row_count !== undefined && (
                <span>
                  Rows: <strong className="text-white">{result.row_count}</strong>
                </span>
              )}
            </div>
          </div>

          {result.error ? (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-sm font-mono">
              <p className="font-semibold text-rose-400 mb-1 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Query Execution Error
              </p>
              {result.error}
            </div>
          ) : result.rows && result.rows.length > 0 ? (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950 sticky top-0 border-b border-slate-800">
                  <tr>
                    {result.columns.map((col: string) => (
                      <th key={col} className="py-2.5 px-4 font-mono">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {result.rows.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      {result.columns.map((col: string) => (
                        <td key={col} className="py-2.5 px-4 font-mono text-xs">
                          {row[col] !== null ? String(row[col]) : <span className="text-slate-600">NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-sm">
              Query returned 0 rows.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
