"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
  Layers,
  ShieldCheck,
  Eye,
  EyeOff
} from "lucide-react";
import { runTrinoQuery, generateSqlFromPrompt, getActiveTenantContext } from "@/lib/api";
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
    schema: "finlake_curated",
    sql: "SELECT is_fraud, COUNT(*) AS tx_count, ROUND(AVG(amount), 2) AS avg_amount, ROUND(SUM(amount), 2) AS total_volume FROM hive.finlake_curated.transactions GROUP BY is_fraud",
  },
  {
    title: "Volume by Transaction Type",
    catalog: "hive",
    schema: "finlake_curated",
    sql: "SELECT type, COUNT(*) AS tx_count, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_amount FROM hive.finlake_curated.transactions GROUP BY type ORDER BY total_amount DESC",
  },
  {
    title: "Iceberg Snapshots Audit Log",
    catalog: "iceberg",
    schema: "finlake_iceberg",
    sql: 'SELECT snapshot_id, parent_id, operation, committed_at FROM iceberg.finlake_iceberg."transactions$snapshots" ORDER BY committed_at DESC',
  },
  {
    title: "Cross-DB Federated JOIN: PostgreSQL + MongoDB KYC",
    catalog: "federated",
    schema: "public",
    sql: "SELECT * FROM postgresql.public.transactions p JOIN mongodb.customer_profiles.customer_profiles m ON p.customer_id = m.customer_id",
  },
  {
    title: "Cross-DB Federated JOIN: SQL Server + Kafka Events",
    catalog: "federated",
    schema: "dbo",
    sql: "SELECT * FROM hive.finlake_curated.Customer c JOIN kafka.finlake_polyglot.events k ON c.email = k.email",
  },
  {
    title: "MongoDB Document Store: Customer Profiles",
    catalog: "mongodb",
    schema: "customer_profiles",
    sql: "SELECT _id, customer_id, first_name, last_name, email, kyc_tier, iban FROM mongodb.customer_profiles.customer_profiles",
  },
  {
    title: "Redis Key-Value Store: Active Sessions",
    catalog: "redis",
    schema: "db0",
    sql: "SELECT redis_key, ttl_seconds, email, name_orig, last_active_ip FROM redis.db0.session_token",
  },
  {
    title: "Cassandra Wide-Column: Nordic Mobile Ledger",
    catalog: "cassandra",
    schema: "nordic_ledger",
    sql: "SELECT account_id, tx_ts, name_orig, amount, currency FROM cassandra.nordic_ledger.mobile_tx_by_account",
  },
  {
    title: "InfluxDB Time-Series: Gateway TPS & Latency",
    catalog: "influxdb",
    schema: "mobile_tps_metrics",
    sql: "SELECT time, source_node, tps_value, latency_ms FROM influxdb.mobile_tps_metrics.ingestion_throughput_tps",
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
  const [schema, setSchema] = useState("finlake_curated");
  const [sql, setSql] = useState(
    "SELECT payment_method, COUNT(*) AS payment_count, ROUND(SUM(amount), 2) AS total_settled, ROUND(AVG(amount), 2) AS avg_payment FROM hive.finlake_curated.payment GROUP BY payment_method ORDER BY total_settled DESC"
  );
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Visualization state
  const [viewMode, setViewMode] = useState<"table" | "bar" | "line" | "area" | "pie">("table");
  const [xAxisKey, setXAxisKey] = useState<string>("");
  const [yAxisKey, setYAxisKey] = useState<string>("");

  // AI Copilot state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Bookmarks & History
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const savedBm = localStorage.getItem("finlake_query_bookmarks");
      if (savedBm) setBookmarks(JSON.parse(savedBm));

      const savedHist = localStorage.getItem("finlake_query_history");
      if (savedHist) setHistory(JSON.parse(savedHist));
    } catch (e) {
      console.warn("Could not load stored bookmarks or history", e);
    }
  }, []);

  const saveBookmarksToStorage = (updated: BookmarkItem[]) => {
    setBookmarks(updated);
    try {
      localStorage.setItem("finlake_query_bookmarks", JSON.stringify(updated));
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

  // Aggregate KPI summary metrics from current result set
  const kpiStats = useMemo(() => {
    if (!result || !result.rows || result.rows.length === 0) return null;
    const totalRows = result.rows.length;
    let sumMetric = 0;
    let hasMetric = false;
    if (yAxisKey) {
      const vals = result.rows.map((r: any) => Number(r[yAxisKey])).filter((v: number) => !isNaN(v));
      if (vals.length > 0) {
        sumMetric = vals.reduce((a: number, b: number) => a + b, 0);
        hasMetric = true;
      }
    }
    const distinctGroups = xAxisKey ? new Set(result.rows.map((r: any) => String(r[xAxisKey]))).size : 0;
    return {
      totalRows,
      sumMetric: hasMetric ? sumMetric : null,
      avgMetric: hasMetric && totalRows > 0 ? sumMetric / totalRows : null,
      distinctGroups,
      metricName: yAxisKey,
      groupName: xAxisKey,
    };
  }, [result, yAxisKey, xAxisKey]);

  const getSecurityContext = () => {
    const ctx = getActiveTenantContext();
    return { tenantId: ctx.tenantId, userRole: ctx.userRole, userId: ctx.userId, userName: ctx.userName };
  };

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    setExecuting(true);
    setResult(null);
    const start = Date.now();
    const secContext = getSecurityContext();

    try {
      const data = await runTrinoQuery(sql, catalog, schema, 1000, secContext);
      setResult(data);

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

  const handleAskAi = async (promptOverride?: string) => {
    const textToAsk = (promptOverride || aiPrompt).trim();
    if (!textToAsk) return;
    setAiGenerating(true);
    try {
      const generated = await generateSqlFromPrompt(textToAsk);
      setAiResult(generated);
      setSql(generated.sql);
      setCatalog(generated.catalog);
      setSchema(generated.schema);
    } catch (err: any) {
      console.error("AI SQL generation error:", err);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyAndRunAi = async (overrideResult?: any) => {
    const target = overrideResult || aiResult;
    if (!target) return;
    setSql(target.sql);
    setCatalog(target.catalog);
    setSchema(target.schema);
    if (target.suggested_chart) {
      setViewMode(target.suggested_chart);
    }
    if (target.suggested_x) {
      setXAxisKey(target.suggested_x);
    }
    if (target.suggested_y) {
      setYAxisKey(target.suggested_y);
    }

    setExecuting(true);
    setResult(null);
    const start = Date.now();
    const secContext = getSecurityContext();
    try {
      const data = await runTrinoQuery(target.sql, target.catalog, target.schema, 1000, secContext);
      setResult(data);

      const newHistItem: HistoryItem = {
        id: "hist_" + Date.now(),
        sql: target.sql.trim(),
        catalog: target.catalog,
        schema: target.schema,
        executedAt: new Date().toLocaleTimeString(),
        rowCount: data.rows ? data.rows.length : 0,
        durationMs: data.execution_time_ms || (Date.now() - start),
        isError: !!data.error
      };
      saveHistoryToStorage([newHistItem, ...history.slice(0, 14)]);
    } catch (err: any) {
      const errRes = { error: err.message, columns: [], rows: [] };
      setResult(errRes);
    } finally {
      setExecuting(false);
    }
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
      {/* ------------------------------------------------------------------- */}
      {/* Page Header (Wireframe Card Style)                                  */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-xl shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-600" />
            Trino Distributed Visual Data Explorer
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Execute ANSI SQL, visualize multi-dimensional aggregates, bookmark insights, and export analytical batches.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium transition border border-zinc-200 shadow-xs"
            title="View Query History"
          >
            <History className="h-4 w-4 text-purple-600" />
            <span className="hidden sm:inline">History</span> ({history.length})
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium transition border border-zinc-200 shadow-xs"
            title="Bookmark Current Query"
          >
            <Bookmark className="h-4 w-4 text-amber-500" />
            <span className="hidden sm:inline">Bookmark</span>
          </button>
          <button
            onClick={handleRunQuery}
            disabled={executing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white font-semibold text-sm transition shadow-xs disabled:opacity-50"
          >
            <Play className={`h-4 w-4 text-purple-400 ${executing ? "animate-spin" : ""}`} />
            {executing ? "Executing..." : "Execute SQL"}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* AI Copilot: Text-to-SQL Assistant Card                              */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white border border-purple-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                FinLake AI Copilot
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  Natural Language to SQL
                </span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Ask analytical questions in plain English — the copilot generates optimized ANSI SQL and visual chart configs.
              </p>
            </div>
          </div>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAskAi()}
            placeholder="e.g. 'Show top 5 cities by invoiced revenue' or 'Analyze fraud vs non-fraud transaction volume'..."
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-purple-600 focus:bg-white transition"
          />
          <button
            onClick={() => handleAskAi()}
            disabled={aiGenerating || !aiPrompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition shadow-xs disabled:opacity-50 shrink-0"
          >
            <Sparkles className={`h-4 w-4 ${aiGenerating ? "animate-spin" : ""}`} />
            {aiGenerating ? "Translating..." : "Ask AI"}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1">Suggestions:</span>
          {[
            { label: "💳 Payments by Method", prompt: "Show payment volume and count by payment method" },
            { label: "🏙️ Top Cities by Revenue", prompt: "Find top 10 cities by total invoiced revenue" },
            { label: "🚨 Fraud Rate Breakdown", prompt: "Analyze fraud vs legitimate transactions volume" },
            { label: "📑 Invoices by Status", prompt: "Group invoices by status with counts and totals" },
            { label: "👥 Customer 3-Way Join", prompt: "Show customer details with invoices and settled payments" },
            { label: "🧊 Iceberg Commit Snapshots", prompt: "Show latest Iceberg committed snapshots audit log" },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => {
                setAiPrompt(chip.prompt);
                handleAskAi(chip.prompt);
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700 hover:text-zinc-900 transition shadow-xs font-medium"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* AI Result Card */}
        {aiResult && (
          <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-purple-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                  Catalog: {aiResult.catalog}
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                  Schema: {aiResult.schema}
                </span>
                {aiResult.suggested_chart && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold uppercase text-[10px]">
                    Recommended: {aiResult.suggested_chart}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleApplyAndRunAi()}
                disabled={executing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-xs disabled:opacity-50"
              >
                <Play className={`h-3 w-3 ${executing ? "animate-spin" : ""}`} />
                {executing ? "Executing..." : "Apply & Run Query"}
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              <strong className="text-purple-300 font-medium">Copilot Logic: </strong>
              {aiResult.explanation}
            </p>
            <div className="p-3 rounded-lg bg-black border border-zinc-800 font-mono text-xs text-purple-300 overflow-x-auto leading-relaxed">
              {aiResult.sql}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Bookmarks Bar                                                       */}
      {/* ------------------------------------------------------------------- */}
      {bookmarks.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center gap-2 overflow-x-auto shadow-xs">
          <span className="text-xs text-amber-600 font-semibold flex items-center gap-1 shrink-0 px-1">
            <BookmarkCheck className="h-3.5 w-3.5" /> Bookmarks:
          </span>
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-50 border border-zinc-200 hover:border-purple-400 text-xs font-medium text-zinc-700 shrink-0 transition"
            >
              <button
                onClick={() => handleLoadBookmark(bm)}
                className="hover:text-purple-600 truncate max-w-[200px]"
                title={bm.title + " - " + bm.sql}
              >
                {bm.title}
              </button>
              <button
                onClick={() => handleDeleteBookmark(bm.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                title="Remove Bookmark"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Preset Queries                                                      */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mr-1">Presets:</span>
        {PRESET_QUERIES.map((preset) => (
          <button
            key={preset.title}
            onClick={() => loadPreset(preset)}
            className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-400 text-xs font-medium text-zinc-700 hover:text-zinc-900 transition shadow-xs"
          >
            {preset.title}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Enterprise Workspace & PII Security Banner                         */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white border border-zinc-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-purple-600" />
          <span className="text-zinc-500">Enterprise Workspace:</span>
          <strong className="text-zinc-900 font-mono">{getSecurityContext().tenantId === "tenant_apex" ? "Apex Retail Bank EU" : "Acme Payments Global"}</strong>
          <span className="text-zinc-300">•</span>
          <span className="text-zinc-500">Active Persona:</span>
          <strong className="text-purple-700 font-semibold">{getSecurityContext().userName} ({getSecurityContext().userRole})</strong>
        </div>
        <div className="flex items-center gap-3">
          {getSecurityContext().userRole === "ANALYST" || getSecurityContext().userRole === "DATA_ENGINEER" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              <EyeOff className="h-3 w-3" /> Dynamic PII Masking Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              <Eye className="h-3 w-3" /> Unmasked Auditor Mode
            </span>
          )}
          <Link
            href="/security"
            className="text-[11px] text-zinc-700 hover:text-zinc-900 font-semibold underline"
          >
            Switch Persona →
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Query Editor Box                                                    */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 uppercase font-semibold">Catalog:</label>
              <select
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-xs text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
              >
                <option value="hive">hive (MinIO External)</option>
                <option value="iceberg">iceberg (ACID Lakehouse)</option>
                <option value="federated">federated (Multi-DB Cross-JOIN)</option>
                <option value="postgresql">postgresql (Retail Banking)</option>
                <option value="mongodb">mongodb (Document Store)</option>
                <option value="redis">redis (Key-Value Cache)</option>
                <option value="kafka">kafka (Event Stream)</option>
                <option value="cassandra">cassandra (Wide-Column)</option>
                <option value="influxdb">influxdb (Time-Series)</option>
                <option value="minio">minio (S3 Objects)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 uppercase font-semibold">Schema:</label>
              <select
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-xs text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
              >
                <option value="finlake_curated">finlake_curated</option>
                <option value="default">default</option>
                <option value="finlake_iceberg">finlake_iceberg</option>
              </select>
            </div>
          </div>
          <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
            <Code className="h-3.5 w-3.5" /> ANSI SQL Compatible
          </span>
        </div>

        <div className="relative">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={5}
            className="w-full bg-[#0b0f19] border border-zinc-800 rounded-xl p-4 font-mono text-sm text-purple-200 focus:outline-none focus:border-purple-500 resize-y shadow-inner leading-relaxed"
            placeholder="SELECT * FROM hive.finlake_curated.transactions LIMIT 10"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Query Results & Visual Explorer                                     */}
      {/* ------------------------------------------------------------------- */}
      {result && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-6 shadow-xs">
          {/* Action Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                Exploration Workbench
              </h2>
              {/* Tab Selector */}
              <div className="flex items-center bg-zinc-100 border border-zinc-200 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    viewMode === "table" ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" /> Table
                </button>
                <button
                  onClick={() => setViewMode("bar")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    viewMode === "bar" ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Bar
                </button>
                <button
                  onClick={() => setViewMode("line")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    viewMode === "line" ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <LineChartIcon className="h-3.5 w-3.5" /> Line
                </button>
                <button
                  onClick={() => setViewMode("area")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    viewMode === "area" ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <AreaChartIcon className="h-3.5 w-3.5" /> Area
                </button>
                <button
                  onClick={() => setViewMode("pie")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    viewMode === "pie" ? "bg-white text-zinc-900 shadow-xs font-semibold" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <PieChartIcon className="h-3.5 w-3.5" /> Donut
                </button>
              </div>
            </div>

            {/* Metrics & Exports */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 text-xs text-zinc-600 bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200">
                {result.execution_time_ms !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-purple-600" />
                    <strong className="text-zinc-900">{result.execution_time_ms} ms</strong>
                  </span>
                )}
                {result.row_count !== undefined && (
                  <span>
                    Rows: <strong className="text-zinc-900">{result.row_count}</strong>
                  </span>
                )}
              </div>

              {/* Export Buttons */}
              <button
                onClick={handleExportCSV}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition border border-zinc-200 shadow-xs disabled:opacity-40"
                title="Download CSV"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                CSV
              </button>
              <button
                onClick={handleExportJSON}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition border border-zinc-200 shadow-xs disabled:opacity-40"
                title="Download JSON"
              >
                <Download className="h-3.5 w-3.5 text-blue-600" />
                JSON
              </button>
              <button
                onClick={handleCopyClipboard}
                disabled={!result.rows || result.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition border border-zinc-200 shadow-xs disabled:opacity-40"
                title="Copy Results JSON"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-zinc-500" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {result.error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-mono">
              <p className="font-semibold text-rose-700 mb-1 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Query Execution Error
              </p>
              {result.error}
            </div>
          ) : result.rows && result.rows.length > 0 ? (
            <div className="space-y-6">
              {/* Executive KPI Summary Cards */}
              {kpiStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Total Rows</p>
                    <p className="text-xl font-bold text-zinc-900 mt-0.5">{kpiStats.totalRows.toLocaleString()}</p>
                  </div>
                  {kpiStats.groupName && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                        Distinct ({kpiStats.groupName})
                      </p>
                      <p className="text-xl font-bold text-blue-600 mt-0.5">{kpiStats.distinctGroups}</p>
                    </div>
                  )}
                  {kpiStats.sumMetric !== null && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                        Sum ({kpiStats.metricName})
                      </p>
                      <p className="text-xl font-bold text-emerald-600 mt-0.5">
                        {kpiStats.sumMetric.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                  {kpiStats.avgMetric !== null && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                        Avg ({kpiStats.metricName})
                      </p>
                      <p className="text-xl font-bold text-purple-600 mt-0.5">
                        {kpiStats.avgMetric.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TABLE VIEW */}
              {viewMode === "table" && (
                <div className="overflow-x-auto max-h-[480px] rounded-xl border border-zinc-200">
                  <table className="w-full text-left text-sm text-zinc-700">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 sticky top-0 border-b border-zinc-200">
                      <tr>
                        {result.columns.map((col: string) => (
                          <th key={col} className="py-3 px-4 font-mono font-semibold tracking-wide">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {result.rows.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-zinc-50 transition">
                          {result.columns.map((col: string) => (
                            <td key={col} className="py-2.5 px-4 font-mono text-xs">
                              {row[col] !== null ? String(row[col]) : <span className="text-zinc-400 italic">NULL</span>}
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
                  <div className="flex flex-wrap items-center gap-4 bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 uppercase font-semibold">X-Axis (Category / Dimension):</span>
                      <select
                        value={xAxisKey}
                        onChange={(e) => setXAxisKey(e.target.value)}
                        className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-zinc-900 font-mono focus:outline-none"
                      >
                        {result.columns.map((col: string) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 uppercase font-semibold">Y-Axis (Metric / Value):</span>
                      <select
                        value={yAxisKey}
                        onChange={(e) => setYAxisKey(e.target.value)}
                        className="bg-white border border-zinc-200 rounded-lg px-2.5 py-1 text-zinc-900 font-mono focus:outline-none"
                      >
                        {result.columns.map((col: string) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>

                    <span className="text-zinc-400 italic ml-auto">Showing up to top 30 records</span>
                  </div>

                  {/* Chart Rendering Container */}
                  <div className="h-96 w-full bg-white p-4 rounded-xl border border-zinc-200 shadow-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      {viewMode === "bar" ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.6} />
                          <XAxis dataKey={xAxisKey} stroke="#71717a" fontSize={11} tickLine={false} />
                          <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "0.5rem", color: "#18181b", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.6} />
                          <XAxis dataKey={xAxisKey} stroke="#71717a" fontSize={11} tickLine={false} />
                          <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "0.5rem", color: "#18181b", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Line type="monotone" dataKey={yAxisKey} stroke="#10b981" strokeWidth={3} dot={{ fill: "#10b981", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      ) : viewMode === "area" ? (
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.6} />
                          <XAxis dataKey={xAxisKey} stroke="#71717a" fontSize={11} tickLine={false} />
                          <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "0.5rem", color: "#18181b", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                            formatter={(value: any) => [Number(value).toLocaleString(), yAxisKey]}
                          />
                          <Area type="monotone" dataKey={yAxisKey} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                        </AreaChart>
                      ) : (
                        <PieChart>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", borderRadius: "0.5rem", color: "#18181b", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
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
            <div className="py-12 text-center text-zinc-400 text-sm">
              Query executed successfully but returned 0 rows.
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Bookmark Modal                                                      */}
      {/* ------------------------------------------------------------------- */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-amber-500" /> Bookmark Current Query
            </h3>
            <p className="text-xs text-zinc-500">
              Save this SQL query and catalog configuration for instant access.
            </p>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase mb-1">Bookmark Name</label>
              <input
                type="text"
                value={bookmarkTitle}
                onChange={(e) => setBookmarkTitle(e.target.value)}
                placeholder="e.g. Q4 Invoices by Method"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3.5 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-medium"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                disabled={!bookmarkTitle.trim()}
                className="px-5 py-2 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* History Modal                                                       */}
      {/* ------------------------------------------------------------------- */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" /> Recent Query History
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-zinc-400 hover:text-zinc-700 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto space-y-2.5 py-4 flex-1">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-8">No recent queries in history.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs space-y-1.5 hover:border-zinc-400 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-zinc-500">
                        {h.catalog}.{h.schema} · {h.executedAt}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        h.isError ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {h.isError ? "ERROR" : `${h.rowCount} rows · ${h.durationMs} ms`}
                      </span>
                    </div>
                    <p className="font-mono text-zinc-800 truncate">{h.sql}</p>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setCatalog(h.catalog);
                          setSchema(h.schema);
                          setSql(h.sql);
                          setShowHistoryModal(false);
                        }}
                        className="text-zinc-900 font-semibold underline text-[11px]"
                      >
                        Load to Editor
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
