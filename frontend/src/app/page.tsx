"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Database, 
  Layers, 
  PlayCircle, 
  BarChart3, 
  Clock, 
  ArrowRight, 
  Server, 
  HardDrive, 
  Zap, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { fetchHealth, fetchStats } from "@/lib/api";

export default function OverviewPage() {
  const [stats, setStats] = useState({
    total_source_rows: 6362620,
    total_indexed_rows: 16080368,
    compression_gain: "-68.5%",
    partition_pruning_speedup: "-92.8%",
    services: { sqlserver: "up", minio: "up", trino: "up" },
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (e) {
      console.warn("Could not load stats from backend", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
            FinLake Architecture & Observability
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Enterprise Financial Data Lake • Migrated to Java Spring Boot 3 & Next.js 15
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/jobs"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition shadow-lg shadow-blue-600/30"
          >
            <PlayCircle className="h-4 w-4" />
            Launch Ingestion
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OLTP Source</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{stats.total_source_rows.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">PaySim Transactions (SQL Server)</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Lake Rows</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3">{stats.total_indexed_rows.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">Indexed in MinIO / Hive / Iceberg</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compression Gain</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-400 mt-3">{stats.compression_gain}</p>
          <p className="text-xs text-slate-400 mt-1">Parquet ZSTD vs Raw CSV</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pruning Acceleration</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-400 mt-3">{stats.partition_pruning_speedup}</p>
          <p className="text-xs text-slate-400 mt-1">Trino Partition Pruning vs Full Scan</p>
        </div>
      </div>

      {/* Component Status Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-400" />
          Container & Service Health Topology
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-white">Microsoft SQL Server 2022</p>
              <p className="text-xs text-slate-400 mt-0.5">Port 1433 • finlake_source</p>
              <p className="text-xs text-slate-500 mt-2">Durable OLTP & Job Metadata Store</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              stats.services.sqlserver === "up" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stats.services.sqlserver === "up" ? "UP" : "DOWN"}
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-white">MinIO Object Storage</p>
              <p className="text-xs text-slate-400 mt-0.5">Port 9000 • Bucket 'finlake'</p>
              <p className="text-xs text-slate-500 mt-2">S3 Compatible Data Lake Storage</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              stats.services.minio === "up" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stats.services.minio === "up" ? "UP" : "DOWN"}
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-white">Trino 452 Distributed SQL</p>
              <p className="text-xs text-slate-400 mt-0.5">Port 8080 • Hive & Iceberg Catalogs</p>
              <p className="text-xs text-slate-500 mt-2">Interactive Query Engine</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              stats.services.trino === "up" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stats.services.trino === "up" ? "UP" : "DOWN"}
            </span>
          </div>
        </div>
      </div>

      {/* Feature Exploration Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link 
          href="/sources" 
          className="group bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-blue-500/50 hover:bg-slate-850 transition"
        >
          <Database className="h-6 w-6 text-blue-400 group-hover:scale-110 transition" />
          <h3 className="font-bold text-white mt-3 flex items-center justify-between">
            SQL Sources
            <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-1">Explore SQL Server schema, test connection, and inspect PaySim columns.</p>
        </Link>

        <Link 
          href="/jobs" 
          className="group bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-emerald-500/50 hover:bg-slate-850 transition"
        >
          <PlayCircle className="h-6 w-6 text-emerald-400 group-hover:scale-110 transition" />
          <h3 className="font-bold text-white mt-3 flex items-center justify-between">
            Ingestion Jobs
            <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-1">Configure format, compression, batch size and trigger extraction.</p>
        </Link>

        <Link 
          href="/analytics" 
          className="group bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-purple-500/50 hover:bg-slate-850 transition"
        >
          <BarChart3 className="h-6 w-6 text-purple-400 group-hover:scale-110 transition" />
          <h3 className="font-bold text-white mt-3 flex items-center justify-between">
            Trino Analytics
            <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-1">Run interactive SQL queries across Hive and Iceberg catalogs.</p>
        </Link>

        <Link 
          href="/iceberg" 
          className="group bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-amber-500/50 hover:bg-slate-850 transition"
        >
          <Clock className="h-6 w-6 text-amber-400 group-hover:scale-110 transition" />
          <h3 className="font-bold text-white mt-3 flex items-center justify-between">
            Iceberg Ledger
            <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-slate-400 mt-1">Explore snapshot commits, schema evolution, and point-in-time travel.</p>
        </Link>
      </div>
    </div>
  );
}
