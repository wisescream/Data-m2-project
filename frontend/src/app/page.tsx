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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-3">
            FinLake Architecture & Observability
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Enterprise Financial Data Lake • Migrated to Java Spring Boot 3 & Next.js 15
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium transition border border-zinc-200 shadow-2xs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/jobs"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition shadow-xs"
          >
            <PlayCircle className="h-4 w-4" />
            Launch Ingestion
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">OLTP Source</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-zinc-900 mt-3">{stats.total_source_rows.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">PaySim Transactions (SQL Server)</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Lake Rows</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-zinc-900 mt-3">{stats.total_indexed_rows.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">Indexed in MinIO / Hive / Iceberg</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Compression Gain</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-700 mt-3">{stats.compression_gain}</p>
          <p className="text-xs text-zinc-500 mt-1">Parquet ZSTD vs Raw CSV</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pruning Acceleration</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-600 mt-3">{stats.partition_pruning_speedup}</p>
          <p className="text-xs text-zinc-500 mt-1">Trino Partition Pruning vs Full Scan</p>
        </div>
      </div>

      {/* Component Status Grid */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-600" />
          Container & Service Health Topology
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-zinc-900">Microsoft SQL Server 2022</p>
              <p className="text-xs text-zinc-500 mt-0.5">Port 1433 • finlake_source</p>
              <p className="text-xs text-zinc-500 mt-2">Durable OLTP & Job Metadata Store</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              stats.services.sqlserver === "up" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stats.services.sqlserver === "up" ? "UP" : "DOWN"}
            </span>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-zinc-900">MinIO Object Storage</p>
              <p className="text-xs text-zinc-500 mt-0.5">Port 9000 • Bucket 'finlake'</p>
              <p className="text-xs text-zinc-500 mt-2">S3 Compatible Data Lake Storage</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              stats.services.minio === "up" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {stats.services.minio === "up" ? "UP" : "DOWN"}
            </span>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl flex items-start justify-between">
            <div>
              <p className="font-semibold text-zinc-900">Trino 452 Distributed SQL</p>
              <p className="text-xs text-zinc-500 mt-0.5">Port 8080 • Hive & Iceberg Catalogs</p>
              <p className="text-xs text-zinc-500 mt-2">Interactive Query Engine</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              stats.services.trino === "up" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
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
          className="group bg-white border border-zinc-200 p-5 rounded-2xl hover:border-zinc-300 hover:shadow-sm transition"
        >
          <Database className="h-6 w-6 text-zinc-700 group-hover:scale-105 transition" />
          <h3 className="font-bold text-zinc-900 mt-3 flex items-center justify-between">
            SQL Sources
            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Explore SQL Server schema, test connection, and inspect PaySim columns.</p>
        </Link>

        <Link 
          href="/jobs" 
          className="group bg-white border border-zinc-200 p-5 rounded-2xl hover:border-zinc-300 hover:shadow-sm transition"
        >
          <PlayCircle className="h-6 w-6 text-zinc-700 group-hover:scale-105 transition" />
          <h3 className="font-bold text-zinc-900 mt-3 flex items-center justify-between">
            Ingestion Jobs
            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Configure format, compression, batch size and trigger extraction.</p>
        </Link>

        <Link 
          href="/analytics" 
          className="group bg-white border border-zinc-200 p-5 rounded-2xl hover:border-zinc-300 hover:shadow-sm transition"
        >
          <BarChart3 className="h-6 w-6 text-zinc-700 group-hover:scale-105 transition" />
          <h3 className="font-bold text-zinc-900 mt-3 flex items-center justify-between">
            Trino Analytics
            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Run interactive SQL queries across Hive and Iceberg catalogs.</p>
        </Link>

        <Link 
          href="/iceberg" 
          className="group bg-white border border-zinc-200 p-5 rounded-2xl hover:border-zinc-300 hover:shadow-sm transition"
        >
          <Clock className="h-6 w-6 text-zinc-700 group-hover:scale-105 transition" />
          <h3 className="font-bold text-zinc-900 mt-3 flex items-center justify-between">
            Iceberg Ledger
            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-1 transition" />
          </h3>
          <p className="text-xs text-zinc-500 mt-1">Explore snapshot commits, schema evolution, and point-in-time travel.</p>
        </Link>
      </div>
    </div>
  );
}
