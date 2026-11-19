"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, 
  Play, 
  Clock, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Code,
  FileSpreadsheet,
  Download,
  Bookmark,
  BookmarkCheck,
  History,
  Trash2,
  Table as TableIcon,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  Copy,
  Check,
  Sparkles,
  Layers
} from "lucide-react";
import { runTrinoQuery } from "@/lib/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

const PRESET_QUERIES = [
  {
    title: "Customer 3-Way Join (Customer + Invoice + Payment)",
    catalog: "hive",
    schema: "finlake_curated",
    sql: "SELECT c.customer_id, c.first_name || ' ' || c.last_name AS customer_name, c.city, i.invoice_id, i.invoice_date, i.amount AS invoice_amt, i.status AS inv_status, p.payment_id, p.amount AS payment_amt, p.payment_method FROM hive.finlake_curated.customer c JOIN hive.finlake_curated.invoice i ON c.customer_id = i.customer_id JOIN hive.finlake_curated.payment p ON i.invoice_id = p.invoice_id LIMIT 10",
  },
  {
    title: "Payments by Method (Volume & Count)",
    catalog: "hive",
    schema: "finlake_curated",
    sql: "SELECT payment_method, COUNT(*) AS payment_count, ROUND(SUM(amount), 2) AS total_settled, ROUND(AVG(amount), 2) AS avg_payment FROM hive.finlake_curated.payment GROUP BY payment_method ORDER BY total_settled DESC",
  },
  {
    title: "Top 10 Cities by Total Invoiced",
    catalog: "hive",
    schema: "finlake_curated",
    sql: "SELECT c.city, COUNT(DISTINCT c.customer_id) AS customers, COUNT(i.invoice_id) AS invoices, ROUND(SUM(i.amount), 2) AS total_invoiced FROM hive.finlake_curated.customer c JOIN hive.finlake_curated.invoice i ON c.customer_id = i.customer_id GROUP BY c.city ORDER BY total_invoiced DESC LIMIT 10",
  },
  {
    title: "Fraud Rate & Average Amount (PaySim)",
    catalog: "hive",
    schema: "default",
    sql: "SELECT isFraud, COUNT(*) AS tx_count, ROUND(AVG(amount), 2) AS avg_amount, ROUND(SUM(amount), 2) AS total_volume FROM raw_transactions GROUP BY isFraud",
  },
  {
    title: "Volume by Transaction Type",
    catalog: "hive",
    schema: "default",
    sql: "SELECT type, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_amount FROM raw_transactions GROUP BY type ORDER BY total_amount DESC",
  },
  {
    title: "Iceberg Snapshots Audit Log",
    catalog: "iceberg",
    schema: "finlake_iceberg",
    sql: 'SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg."transactions$snapshots" ORDER BY committed_at DESC',
  },
];

const CHART_COLORS = [
  "#8b5cf6", // Violet
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#6366f1", // Indigo
];

interface BookmarkItem {
  id: string;
  title: string;
  sql: string;
  catalog: string;
  schema: string;
  savedAt: string;
}

interface HistoryItem {
  id: string;
  sql: string;
  catalog: string;
  schema: string;
  executedAt: string;
  rowCount: number;
  durationMs: number;
  isError: boolean;
}

export default function AnalyticsPage() {
  const [catalog, setCatalog] = useState("hive");
  const [schema, setSchema] = useState("default");
  const [sql, setSql] = useState(PRESET_QUERIES[1].sql);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Visualization View Mode
  const [viewMode, setViewMode] = useState<"table" | "bar" | "line" | "area" | "pie">("table");
  const [xAxisKey, setXAxisKey] = useState<string>("");
  const [yAxisKey, setYAxisKey] = useState<string>("");

  // Bookmarks & History
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load bookmarks & history from localStorage
  useEffect(() => {
    try {
      const savedBms = localStorage.getItem("finlake_saved_bookmarks");
      if (savedBms) setBookmarks(JSON.parse(savedBms));
      const savedHist = localStorage.getItem("finlake_query_history");
      if (savedHist) setHistory(JSON.parse(savedHist));
    } catch (e) {
      console.warn("Could not read from localStorage", e);
    }
  }, []);

  const saveBookmarksToStorage = (updated: BookmarkItem[]) => {
    setBookmarks(updated);
    try {
      localStorage.setItem("finlake_saved_bookmarks", JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not write bookmarks to localStorage", e);
    }
  };

  const saveHistoryToStorage = (updated: HistoryItem[]) => {
    setHistory(updated);
    try {
      localStorage.setItem("finlake_query_history", JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not write history to localStorage", e);
    }
  };

  // Inspect columns and classify into categories and metrics
  const { categoricalCols, numericCols } = useMemo(() => {
    if (!result || !result.columns || !result.rows || result.rows.length === 0) {
      return { categoricalCols: [], numericCols: [] };
    }

    const firstRow = result.rows[0];
    const catCols: string[] = [];
    const numCols: string[] = [];

    result.columns.forEach((col: string) => {
      const val = firstRow[col];
      if (typeof val === "number" || (!isNaN(Number(val)) && val !== null && val !== "")) {
        numCols.push(col);
      } else {
        catCols.push(col);
      }
    });

    return { categoricalCols: catCols, numericCols: numCols };
  }, [result]);

  // Auto-select sensible X and Y axes when query result changes
  useEffect(() => {
    if (result && result.columns && result.columns.length > 0) {
      if (categoricalCols.length > 0) {
        setXAxisKey(categoricalCols[0]);
      } else {
        setXAxisKey(result.columns[0]);
      }

      if (numericCols.length > 0) {
        setYAxisKey(numericCols[0]);
      } else if (result.columns.length > 1) {
        setYAxisKey(result.columns[1]);
      }
    }
  }, [result, categoricalCols, numericCols]);

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    setExecuting(true);
    setResult(null);
    const start = Date.now();

    try {
      const data = await runTrinoQuery(sql, catalog, schema);
      setResult(data);

      // Add to history
      const newHistItem: HistoryItem = {
        id: "hist_" + Date.now(),
        sql: sql.trim(),
        catalog,
        schema,
        executedAt: new Date().toLocaleTimeString(),
        rowCount: data.rows ? data.rows.length : 0,
        durationMs: data.execution_time_ms || (Date.now() - start),
        isError: !!data.error
      };
      saveHistoryToStorage([newHistItem, ...history.slice(0, 14)]);
    } catch (err: any) {
      const errRes = { error: err.message, columns: [], rows: [] };
      setResult(errRes);

      const newHistItem: HistoryItem = {
        id: "hist_" + Date.now(),
        sql: sql.trim(),
        catalog,
        schema,
        executedAt: new Date().toLocaleTimeString(),
        rowCount: 0,
        durationMs: Date.now() - start,
        isError: true
      };
      saveHistoryToStorage([newHistItem, ...history.slice(0, 14)]);
    } finally {
      setExecuting(false);
    }
  };

  const loadPreset = (preset: typeof PRESET_QUERIES[0]) => {
    setCatalog(preset.catalog);
    setSchema(preset.schema);
    setSql(preset.sql);
  };

  const handleSaveBookmark = () => {
    if (!bookmarkTitle.trim()) return;
    const newBm: BookmarkItem = {
      id: "bm_" + Date.now(),
      title: bookmarkTitle.trim(),
      sql: sql.trim(),
      catalog,
      schema,
      savedAt: new Date().toLocaleDateString()
    };
    saveBookmarksToStorage([newBm, ...bookmarks]);
    setBookmarkTitle("");
    setShowSaveModal(false);
  };

  const handleDeleteBookmark = (id: string) => {
    saveBookmarksToStorage(bookmarks.filter((b) => b.id !== id));
  };

  const handleLoadBookmark = (bm: BookmarkItem) => {
    setCatalog(bm.catalog);
    setSchema(bm.schema);
    setSql(bm.sql);
  };

  // Export Results
  const handleExportCSV = () => {
    if (!result || !result.rows || result.rows.length === 0) return;
    const headers = result.columns.join(",");
    const rows = result.rows.map((r: any) =>
      result.columns.map((c: string) => {
        const v = r[c] !== null && r[c] !== undefined ? String(r[c]) : "";
        return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finlake_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!result || !result.rows) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result.rows, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `finlake_export_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyClipboard = () => {
    if (!result || !result.rows) return;
    navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Chart Data Preparation (Limit to top 30 records for readable rendering)
  const chartData = useMemo(() => {
    if (!result || !result.rows) return [];
    return result.rows.slice(0, 30).map((r: any) => ({
      ...r,
      [xAxisKey]: String(r[xAxisKey] ?? ""),
      [yAxisKey]: Number(r[yAxisKey]) || 0
    }));
  }, [result, xAxisKey, yAxisKey]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-400" />
            Trino Distributed Visual Data Explorer
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Execute ANSI SQL, visualize multi-dimensional aggregates, bookmark insights, and export analytical batches.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
            title="View Query History"
          >
            <History className="h-4 w-4 text-purple-400" />
            <span className="hidden sm:inline">History</span> ({history.length})
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
            title="Bookmark Current Query"
          >
            <Bookmark className="h-4 w-4 text-amber-400" />
            <span className="hidden sm:inline">Bookmark</span>
          </button>
          <button
            onClick={handleRunQuery}
            disabled={executing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition shadow-lg shadow-purple-600/25 active:scale-95 disabled:opacity-50"
          >
            <Play className={`h-4 w-4 ${executing ? "animate-spin" : ""}`} />
            {executing ? "Executing..." : "Execute SQL"}
          </button>
        </div>
      </div>

      {/* Bookmarks Bar */}
      {bookmarks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-amber-400 font-semibold flex items-center gap-1 shrink-0 px-1">
            <BookmarkCheck className="h-3.5 w-3.5" /> Bookmarks:
          </span>
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-600/50 text-xs font-medium text-slate-300 shrink-0 transition"
            >
              <button
                onClick={() => handleLoadBookmark(bm)}
                className="hover:text-purple-300 truncate max-w-[200px]"
                title={bm.title + " - " + bm.sql}
              >
                {bm.title}
              </button>
              <button
                onClick={() => handleDeleteBookmark(bm.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition"
                title="Remove Bookmark"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preset Queries */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mr-1">Presets:</span>
        {PRESET_QUERIES.map((preset) => (
          <button
            key={preset.title}
            onClick={() => loadPreset(preset)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500 text-xs font-medium text-slate-300 hover:text-white transition shadow-sm"
          >
            {preset.title}
          </button>
        ))}
      </div>

      {/* Query Editor Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 uppercase font-semibold">Catalog:</label>
              <select
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
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
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="finlake_curated">finlake_curated</option>
                <option value="default">default</option>
                <option value="finlake_iceberg">finlake_iceberg</option>
              </select>
            </div>
          </div>
          <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
            <Code className="h-3.5 w-3.5" /> ANSI SQL Compatible
          </span>
        </div>

        <div className="relative">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={5}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-sm text-purple-300 focus:outline-none focus:border-purple-500 resize-y shadow-inner leading-relaxed"
            placeholder="SELECT * FROM hive.finlake_curated.transactions LIMIT 10"
          />
        </div>
      </div>

      {/* Query Results & Visual Explorer */}
      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          {/* Action Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-400" />
                Exploration Workbench
              </h2>
              {/* Tab Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === "table" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" /> Table
                </button>
                <button
                  onClick={() => setViewMode("bar")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === "bar" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Bar
                </button>
                <button
                  onClick={() => setViewMode("line")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === "line" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <LineChartIcon className="h-3.5 w-3.5" /> Line
                </button>
                <button
                  onClick={() => setViewMode("area")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === "area" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <AreaChartIcon className="h-3.5 w-3.5" /> Area
                </button>
                <button
                  onClick={() => setViewMode("pie")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === "pie" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <PieChartIcon className="h-3.5 w-3.5" /> Donut
                </button>
              </div>
            </div>

            {/* Metrics & Exports */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                {result.execution_time_ms !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-purple-400" />
                    <strong className="text-white">{result.execution_time_ms} ms</strong>
                  </span>
                )}
                {result.row_count !== undefined && (
                  <span>
                    Rows: <strong className="text-white">{result.row_count}</strong>
                  </span>
                )}
              </div>

              {/* Export Buttons */}
              <button
                onClick={handleExportCSV}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700 disabled:opacity-40"
                title="Download CSV"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                CSV
              </button>
              <button
                onClick={handleExportJSON}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700 disabled:opacity-40"
                title="Download JSON"
              >
                <Download className="h-3.5 w-3.5 text-blue-400" />
                JSON
              </button>
              <button
                onClick={handleCopyClipboard}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700 disabled:opacity-40"
                title="Copy Results JSON"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {result.error ? (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-sm font-mono">
              <p className="font-semibold text-rose-400 mb-1 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Query Execution Error
              </p>
              {result.error}
            </div>
          ) : result.rows && result.rows.length > 0 ? (
            <div>
              {/* TABLE VIEW */}
              {viewMode === "table" && (
                <div className="overflow-x-auto max-h-[480px] rounded-xl border border-slate-800">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-950 sticky top-0 border-b border-slate-800">
                      <tr>
                        {result.columns.map((col: string) => (
                          <th key={col} className="py-3 px-4 font-mono font-semibold tracking-wide">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900">
                      {result.rows.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/50 transition">
                          {result.columns.map((col: string) => (
                            <td key={col} className="py-2.5 px-4 font-mono text-xs">
                              {row[col] !== null ? String(row[col]) : <span className="text-slate-600 italic">NULL</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* CHART VIEWS */}
              {viewMode !== "table" && (
                <div className="space-y-4">
                  {/* Axis Selectors */}
                  <div className="flex flex-wrap items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 uppercase font-semibold">X-Axis (Category / Dimension):</span>
                      <select
                        value={xAxisKey}
                        onChange={(e) => setXAxisKey(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono focus:outline-none"
                      >
                        {result.columns.map((col: string) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 uppercase font-semibold">Y-Axis (Metric / Value):</span>
                      <select
                        value={yAxisKey}
                        onChange={(e) => setYAxisKey(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono focus:outline-none"
                      >
                        {result.columns.map((col: string) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>

                    <span className="text-slate-500 italic ml-auto">Showing up to top 30 records</span>
                  </div>

                  {/* Chart Rendering Container */}
                  <div className="h-96 w-full bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <ResponsiveContainer width="100%" height="100%">
                      {viewMode === "bar" ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                          <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", color: "#fff" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Bar dataKey={yAxisKey} fill="#8b5cf6" radius={[6, 6, 0, 0]}>
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      ) : viewMode === "line" ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                          <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", color: "#fff" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Line type="monotone" dataKey={yAxisKey} stroke="#10b981" strokeWidth={3} dot={{ fill: "#10b981", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      ) : viewMode === "area" ? (
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                          <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", color: "#fff" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Area type="monotone" dataKey={yAxisKey} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                        </AreaChart>
                      ) : (
                        <PieChart>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", color: "#fff" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Legend />
                          <Pie
                            data={chartData}
                            dataKey={yAxisKey}
                            nameKey={xAxisKey}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={120}
                            paddingAngle={3}
                          >
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              Query executed successfully but returned 0 rows.
            </div>
          )}
        </div>
      )}

      {/* Bookmark Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-amber-400" /> Bookmark Current Query
            </h3>
            <p className="text-xs text-slate-400">
              Save this SQL query and catalog configuration for instant access.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Bookmark Name</label>
              <input
                type="text"
                value={bookmarkTitle}
                onChange={(e) => setBookmarkTitle(e.target.value)}
                placeholder="e.g. Q4 Invoices by Method"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                disabled={!bookmarkTitle.trim()}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <History className="h-5 w-5 text-purple-400" /> Recent Query History
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto space-y-2.5 py-4 flex-1">
              {history.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">No queries executed yet in this session.</p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 overflow-hidden">
                      <p className="font-mono text-xs text-purple-300 truncate">{item.sql}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span>{item.catalog}.{item.schema}</span>
                        <span>•</span>
                        <span>{item.executedAt}</span>
                        <span>•</span>
                        <span>{item.durationMs}ms</span>
                        <span>•</span>
                        <span className={item.isError ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                          {item.isError ? "ERROR" : `${item.rowCount} rows`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCatalog(item.catalog);
                        setSchema(item.schema);
                        setSql(item.sql);
                        setShowHistoryModal(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition shrink-0"
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between items-center border-t border-slate-800 pt-3">
              <button
                onClick={() => saveHistoryToStorage([])}
                className="text-xs text-rose-400 hover:text-rose-300 transition"
              >
                Clear History
              </button>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
