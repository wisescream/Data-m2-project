"use client";

import { useEffect, useState } from "react";
import { Database, CheckCircle2, XCircle, Search, RefreshCw, Key, Shield } from "lucide-react";
import { fetchSources, testSource, fetchTables, fetchTableSchema } from "@/lib/api";

export default function SourcesPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("sqlserver-paysim");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("raw_transactions");
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  useEffect(() => {
    fetchSources()
      .then((data) => {
        setSources(data);
        if (data.length > 0) setSelectedSource(data[0].id);
      })
      .catch((err) => console.error("Error fetching sources:", err));
  }, []);

  useEffect(() => {
    if (!selectedSource) return;
    fetchTables(selectedSource)
      .then((res) => {
        setTables(res.tables || []);
        if (res.tables && res.tables.includes("raw_transactions")) {
          setSelectedTable("raw_transactions");
        } else if (res.tables && res.tables.length > 0) {
          setSelectedTable(res.tables[0]);
        }
      })
      .catch((err) => console.error("Error fetching tables:", err));
  }, [selectedSource]);

  useEffect(() => {
    if (!selectedSource || !selectedTable) return;
    setLoadingSchema(true);
    fetchTableSchema(selectedSource, selectedTable)
      .then((res) => setSchemaInfo(res))
      .catch((err) => console.error("Error fetching table schema:", err))
      .finally(() => setLoadingSchema(false));
  }, [selectedSource, selectedTable]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSource(selectedSource);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ status: "failed", error: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-400" />
            SQL Server Source Explorer
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Validate connectivity and inspect schema metadata for OLTP databases.
          </p>
        </div>
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
        >
          <RefreshCw className={`h-4 w-4 ${testing ? "animate-spin" : ""}`} />
          {testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            testResult.status === "connected"
              ? "bg-emerald-950/60 border-emerald-800 text-emerald-200"
              : "bg-rose-950/60 border-rose-800 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {testResult.status === "connected" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-400" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {testResult.status === "connected" ? "Connection Successful" : "Connection Failed"}
              </p>
              <p className="text-xs opacity-80">
                {testResult.status === "connected"
                  ? `Database: ${testResult.database} • Server Version: ${testResult.server_version}`
                  : `Error: ${testResult.error}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Explorer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Table List Sidebar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:col-span-1 space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Tables ({tables.length})
          </span>
          <div className="space-y-1">
            {tables.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTable(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                  selectedTable === t
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Column Schema Viewer */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Table: <span className="text-blue-400 font-mono">{selectedTable}</span>
              </h2>
              <p className="text-xs text-slate-400">Schema: dbo</p>
            </div>
            {schemaInfo && (
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                  Total Rows: <strong className="text-white">{schemaInfo.total_rows?.toLocaleString()}</strong>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                  Columns: <strong className="text-white">{schemaInfo.column_count}</strong>
                </span>
              </div>
            )}
          </div>

          {loadingSchema ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading column definitions...</div>
          ) : schemaInfo && schemaInfo.columns ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Column Name</th>
                    <th className="py-3 px-4">Data Type</th>
                    <th className="py-3 px-4">Nullable</th>
                    <th className="py-3 px-4">Key Constraints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {schemaInfo.columns.map((col: any) => (
                    <tr key={col.name} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-medium text-white flex items-center gap-2">
                        {col.is_primary_key && <Key className="h-3.5 w-3.5 text-amber-400" />}
                        {col.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-blue-400">{col.type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            col.nullable
                              ? "bg-slate-800 text-slate-400"
                              : "bg-amber-950 text-amber-400 border border-amber-800/40"
                          }`}
                        >
                          {col.nullable ? "NULL" : "NOT NULL"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {col.is_primary_key && (
                          <span className="text-amber-400 font-semibold mr-2">PRIMARY KEY</span>
                        )}
                        {col.is_identity && <span className="text-emerald-400">IDENTITY</span>}
                        {!col.is_primary_key && !col.is_identity && <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">Select a table to inspect columns.</div>
          )}
        </div>
      </div>
    </div>
  );
}
