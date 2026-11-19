"use client";

import { useEffect, useState } from "react";
import { 
  PlayCircle, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  FileText, 
  ChevronRight,
  RotateCcw,
  Ban
} from "lucide-react";
import { listJobs, submitJob, fetchJobResult } from "@/lib/api";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);

  // Form State
  const [format, setFormat] = useState("parquet");
  const [compression, setCompression] = useState("snappy");
  const [batchSize, setBatchSize] = useState(50000);
  const [partitionBy, setPartitionBy] = useState("none");
  const [maxRows, setMaxRows] = useState<number | "">("");

  const refreshJobs = async () => {
    setLoading(true);
    try {
      const data = await listJobs();
      setJobs(data);
    } catch (err) {
      console.error("Failed to load jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshJobs();
    const interval = setInterval(refreshJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        source_id: "sqlserver-paysim",
        schema_name: "dbo",
        table: "raw_transactions",
        format,
        compression,
        batch_size: Number(batchSize),
        partition_by: partitionBy !== "none" ? [partitionBy] : [],
      };
      if (maxRows !== "") {
        payload.max_rows = Number(maxRows);
      }
      await submitJob(payload);
      await refreshJobs();
    } catch (err: any) {
      alert("Submission error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const viewResult = async (jobId: string) => {
    try {
      const res = await fetchJobResult(jobId);
      setSelectedResult(res);
    } catch (err: any) {
      alert("Could not load result: " + err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> SUCCESS
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950 text-blue-400 border border-blue-800 animate-pulse">
            <Clock className="h-3.5 w-3.5" /> RUNNING
          </span>
        );
      case "PENDING":
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800">
            <Clock className="h-3.5 w-3.5" /> PENDING
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Ban className="h-3.5 w-3.5" /> CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950 text-rose-400 border border-rose-800">
            <XCircle className="h-3.5 w-3.5" /> FAILED
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-emerald-400" />
            Ingestion Job Dispatcher & Lifecycle
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Trigger bounded-memory streaming extractors from SQL Server into MinIO with custom formats and partition schemes.
          </p>
        </div>
        <button
          onClick={refreshJobs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition border border-slate-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Dispatch Form Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Configure New Ingestion Pipeline Run</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="parquet">Apache Parquet</option>
              <option value="csv">Standard CSV</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Compression</label>
            <select
              value={compression}
              onChange={(e) => setCompression(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="snappy">Snappy (Fastest)</option>
              <option value="zstd">ZSTD (High Compression)</option>
              <option value="gzip">Gzip</option>
              <option value="none">None (Raw)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Batch Size (Rows)</label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value={10000}>10,000 rows</option>
              <option value={50000}>50,000 rows (Standard)</option>
              <option value={100000}>100,000 rows</option>
              <option value={250000}>250,000 rows</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Partitioning</label>
            <select
              value={partitionBy}
              onChange={(e) => setPartitionBy(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="none">Flat (No partition)</option>
              <option value="event_date">Partition by event_date</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Max Rows (Limit)</label>
            <input
              type="number"
              placeholder="e.g. 50000 (all if empty)"
              value={maxRows}
              onChange={(e) => setMaxRows(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="lg:col-span-5 flex justify-end mt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-600/20"
            >
              <PlayCircle className="h-4 w-4" />
              {submitting ? "Queueing Ingestion..." : "Start Ingestion Pipeline"}
            </button>
          </div>
        </form>
      </div>

      {/* Jobs History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Ingestion Job Execution History</h2>
        {jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No jobs found. Dispatch a new job above to start the pipeline!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Compression</th>
                  <th className="py-3 px-4">Batch Size</th>
                  <th className="py-3 px-4">Partitioning</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobs.map((j) => (
                  <tr key={j.job_id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-medium text-white">{j.job_id}</td>
                    <td className="py-3 px-4 font-mono text-xs uppercase">{j.format}</td>
                    <td className="py-3 px-4 font-mono text-xs">{j.compression}</td>
                    <td className="py-3 px-4">{j.batch_size?.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs font-mono">{j.partition_columns || "none"}</td>
                    <td className="py-3 px-4">{getStatusBadge(j.status)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => viewResult(j.job_id)}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition flex items-center gap-1 border border-slate-700"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-400" />
                        Manifest
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manifest Result Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                Execution Result • {selectedResult.job_id}
              </h3>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Total Extracted</p>
                <p className="text-lg font-bold text-white">{selectedResult.total_rows_extracted?.toLocaleString()} rows</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Written Size</p>
                <p className="text-lg font-bold text-white">{(selectedResult.total_bytes_written / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Objects Created</p>
                <p className="text-lg font-bold text-white">{selectedResult.total_objects_created} files</p>
              </div>
            </div>

            {selectedResult.manifest_path && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Published Manifest Path</p>
                <p className="text-xs font-mono text-emerald-400 mt-1 break-all">{selectedResult.manifest_path}</p>
              </div>
            )}

            {selectedResult.error_message && (
              <div className="bg-rose-950/60 p-3 rounded-xl border border-rose-800">
                <p className="text-xs text-rose-300">Error Message</p>
                <p className="text-xs font-mono text-rose-200 mt-1">{selectedResult.error_message}</p>
              </div>
            )}

            {selectedResult.manifest && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-60 overflow-y-auto">
                <p className="text-xs text-slate-400 mb-1">Manifest JSON Content</p>
                <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                  {JSON.stringify(selectedResult.manifest, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedResult(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition"
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
