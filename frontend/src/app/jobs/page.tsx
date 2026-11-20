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
  const [table, setTable] = useState("transactions");
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
        table,
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> SUCCESS
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <Clock className="h-3.5 w-3.5" /> RUNNING
          </span>
        );
      case "PENDING":
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3.5 w-3.5" /> PENDING
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <Ban className="h-3.5 w-3.5" /> CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="h-3.5 w-3.5" /> FAILED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-xl shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-emerald-600" />
            Ingestion Job Dispatcher & Lifecycle
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Trigger bounded-memory streaming extractors from SQL Server into MinIO with custom formats and partition schemes.
          </p>
        </div>
        <button
          onClick={refreshJobs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-700 text-sm font-medium transition border border-zinc-200 shadow-xs"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Dispatch Form Card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
        <h2 className="text-base font-bold text-zinc-900 mb-4">Configure New Ingestion Pipeline Run</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Source Table</label>
            <select
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            >
              <option value="transactions">dbo.transactions (PaySim)</option>
              <option value="Customer">dbo.Customer</option>
              <option value="Invoice">dbo.Invoice</option>
              <option value="Payment">dbo.Payment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            >
              <option value="parquet">Apache Parquet</option>
              <option value="csv">Standard CSV</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Compression</label>
            <select
              value={compression}
              onChange={(e) => setCompression(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            >
              <option value="snappy">Snappy (Fastest)</option>
              <option value="zstd">ZSTD (High Compression)</option>
              <option value="gzip">Gzip</option>
              <option value="none">None (Raw)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Batch Size (Rows)</label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            >
              <option value={10000}>10,000 rows</option>
              <option value={50000}>50,000 rows (Standard)</option>
              <option value={100000}>100,000 rows</option>
              <option value={250000}>250,000 rows</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Partitioning</label>
            <select
              value={partitionBy}
              onChange={(e) => setPartitionBy(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            >
              <option value="none">Flat (No partition)</option>
              <option value="event_date">Partition by event_date</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Max Rows (Limit)</label>
            <input
              type="number"
              placeholder="e.g. 50000 (all if empty)"
              value={maxRows}
              onChange={(e) => setMaxRows(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
            />
          </div>

          <div className="lg:col-span-6 flex justify-end mt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white font-medium text-sm transition shadow-xs cursor-pointer"
            >
              <PlayCircle className="h-4 w-4" />
              {submitting ? "Queueing Ingestion..." : "Start Ingestion Pipeline"}
            </button>
          </div>
        </form>
      </div>

      {/* Jobs History Table */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs">
        <h2 className="text-base font-bold text-zinc-900 mb-4">Ingestion Job Execution History</h2>
        {jobs.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-sm">
            No jobs found. Dispatch a new job above to start the pipeline!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-700">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
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
              <tbody className="divide-y divide-zinc-200">
                {jobs.map((j) => (
                  <tr key={j.job_id} className="hover:bg-zinc-50 transition">
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900">{j.job_id}</td>
                    <td className="py-3 px-4 font-mono text-xs uppercase text-zinc-600">{j.format}</td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-600">{j.compression}</td>
                    <td className="py-3 px-4 text-zinc-800">{j.batch_size?.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-600">{j.partition_columns || "none"}</td>
                    <td className="py-3 px-4">{getStatusBadge(j.status)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => viewResult(j.job_id)}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 transition flex items-center gap-1 border border-zinc-200 shadow-xs"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Execution Result • {selectedResult.job_id}
              </h3>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-zinc-400 hover:text-zinc-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <p className="text-xs text-zinc-500">Total Extracted</p>
                <p className="text-lg font-bold text-zinc-900">{selectedResult.total_rows_extracted?.toLocaleString()} rows</p>
              </div>
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <p className="text-xs text-zinc-500">Written Size</p>
                <p className="text-lg font-bold text-zinc-900">{(selectedResult.total_bytes_written / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <p className="text-xs text-zinc-500">Objects Created</p>
                <p className="text-lg font-bold text-zinc-900">{selectedResult.total_objects_created} files</p>
              </div>
            </div>

            {selectedResult.manifest_path && (
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <p className="text-xs text-zinc-500">Published Manifest Path</p>
                <p className="text-xs font-mono text-emerald-700 mt-1 break-all">{selectedResult.manifest_path}</p>
              </div>
            )}

            {selectedResult.error_message && (
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                <p className="text-xs text-rose-700">Error Message</p>
                <p className="text-xs font-mono text-rose-800 mt-1">{selectedResult.error_message}</p>
              </div>
            )}

            {selectedResult.manifest && (
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 max-h-60 overflow-y-auto">
                <p className="text-xs text-zinc-500 mb-1">Manifest JSON Content</p>
                <pre className="text-xs font-mono text-zinc-800 whitespace-pre-wrap">
                  {JSON.stringify(selectedResult.manifest, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedResult(null)}
                className="px-4 py-2 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white text-sm font-semibold transition"
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
