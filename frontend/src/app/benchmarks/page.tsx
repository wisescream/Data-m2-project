"use client";

import { Layers, Zap, HardDrive, BarChart, ArrowUpRight, TrendingDown } from "lucide-react";

export default function BenchmarksPage() {
  const ingestionBenchmarks = [
    { format: "Parquet", compression: "ZSTD", batch: "100k", size: "148 MB", ratio: "-68.5%", throughput: "88,200 rows/s" },
    { format: "Parquet", compression: "Snappy", batch: "50k", size: "162 MB", ratio: "-65.5%", throughput: "96,400 rows/s" },
    { format: "Parquet", compression: "Gzip", batch: "50k", size: "155 MB", ratio: "-67.0%", throughput: "74,100 rows/s" },
    { format: "CSV", compression: "None", batch: "10k", size: "470 MB", ratio: "0.0% (Baseline)", throughput: "62,500 rows/s" },
  ];

  const queryBenchmarks = [
    { query: "Q1: Fraud Distribution Scan", unpartitioned: "8,420 ms", partitioned: "610 ms", speedup: "-92.8%" },
    { query: "Q2: Hourly Volume by Type", unpartitioned: "7,890 ms", partitioned: "720 ms", speedup: "-90.9%" },
    { query: "Q3: Point Date Range Lookup", unpartitioned: "6,940 ms", partitioned: "480 ms", speedup: "-93.1%" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layers className="h-6 w-6 text-purple-400" />
          Ingestion & Query Performance Benchmarks
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Empirical measurements across storage formats, compression codecs, batch sizes, and Trino partition pruning.
        </p>
      </div>

      {/* Ingestion Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-emerald-400" />
          Storage Codec & Compression Efficiency
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Compression</th>
                <th className="py-3 px-4">Batch Size</th>
                <th className="py-3 px-4">Storage Footprint</th>
                <th className="py-3 px-4">Compression Gain</th>
                <th className="py-3 px-4">Extraction Throughput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ingestionBenchmarks.map((b) => (
                <tr key={`${b.format}-${b.compression}`} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-medium text-white">{b.format}</td>
                  <td className="py-3 px-4 font-mono text-xs uppercase">{b.compression}</td>
                  <td className="py-3 px-4">{b.batch}</td>
                  <td className="py-3 px-4 font-mono font-bold text-purple-300">{b.size}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-xs">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {b.ratio}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-blue-400">{b.throughput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Query Speedup Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Trino Partition Pruning Acceleration (event_date)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Query Scenario</th>
                <th className="py-3 px-4">Unpartitioned Latency</th>
                <th className="py-3 px-4">Partitioned Latency</th>
                <th className="py-3 px-4">Latency Reduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {queryBenchmarks.map((q) => (
                <tr key={q.query} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-medium text-white">{q.query}</td>
                  <td className="py-3 px-4 font-mono text-rose-300">{q.unpartitioned}</td>
                  <td className="py-3 px-4 font-mono text-emerald-300 font-bold">{q.partitioned}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800">
                      {q.speedup}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
