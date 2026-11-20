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
      <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <Layers className="h-6 w-6 text-purple-600" />
          Ingestion & Query Performance Benchmarks
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          Empirical measurements across storage formats, compression codecs, batch sizes, and Trino partition pruning.
        </p>
      </div>

      {/* Ingestion Matrix */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-emerald-600" />
          Storage Codec & Compression Efficiency
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm text-zinc-700">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Compression</th>
                <th className="py-3 px-4">Batch Size</th>
                <th className="py-3 px-4">Storage Footprint</th>
                <th className="py-3 px-4">Compression Gain</th>
                <th className="py-3 px-4">Extraction Throughput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {ingestionBenchmarks.map((b) => (
                <tr key={`${b.format}-${b.compression}`} className="hover:bg-zinc-50/80 transition">
                  <td className="py-3 px-4 font-mono font-medium text-zinc-900">{b.format}</td>
                  <td className="py-3 px-4 font-mono text-xs uppercase text-zinc-600">{b.compression}</td>
                  <td className="py-3 px-4 text-zinc-600">{b.batch}</td>
                  <td className="py-3 px-4 font-mono font-bold text-purple-700">{b.size}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {b.ratio}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-blue-700 font-semibold">{b.throughput}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Query Speedup Matrix */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Trino Partition Pruning Acceleration (event_date)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm text-zinc-700">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="py-3 px-4">Query Scenario</th>
                <th className="py-3 px-4">Unpartitioned Latency</th>
                <th className="py-3 px-4">Partitioned Latency</th>
                <th className="py-3 px-4">Latency Reduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {queryBenchmarks.map((q) => (
                <tr key={q.query} className="hover:bg-zinc-50/80 transition">
                  <td className="py-3 px-4 font-medium text-zinc-900">{q.query}</td>
                  <td className="py-3 px-4 font-mono text-rose-600">{q.unpartitioned}</td>
                  <td className="py-3 px-4 font-mono text-emerald-700 font-bold">{q.partitioned}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
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
