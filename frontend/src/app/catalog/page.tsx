"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  Search, 
  Database, 
  Layers, 
  Clock, 
  Tag, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Key, 
  Link2, 
  ExternalLink, 
  X, 
  ChevronRight,
  Filter,
  CheckCircle2,
  FileSpreadsheet
} from "lucide-react";
import { 
  fetchCatalogTables, 
  fetchCatalogTableDetail, 
  CatalogTableSummary, 
  CatalogTableDetail 
} from "@/lib/api";

export default function DataCatalogPage() {
  const [tables, setTables] = useState<CatalogTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  
  // Detail Modal
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableDetail, setTableDetail] = useState<CatalogTableDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalogTables();
      setTables(data);
    } catch (err: any) {
      setError(err.message || "Failed to load data catalog tables");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (tableId: string) => {
    setSelectedTableId(tableId);
    setLoadingDetail(true);
    try {
      const detail = await fetchCatalogTableDetail(tableId);
      setTableDetail(detail);
    } catch (err) {
      console.error("Failed to load table detail", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTableId(null);
    setTableDetail(null);
  };

  // Extract unique domains for filter chips
  const domains = useMemo(() => {
    const list = Array.from(new Set(tables.map((t) => t.domain)));
    return ["ALL", ...list];
  }, [tables]);

  // Filtered tables based on search query and domain
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const matchesDomain = selectedDomain === "ALL" || table.domain === selectedDomain;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        table.name.toLowerCase().includes(q) ||
        table.domain.toLowerCase().includes(q) ||
        table.description.toLowerCase().includes(q) ||
        table.tags.some((t) => t.toLowerCase().includes(q));
      return matchesDomain && matchesSearch;
    });
  }, [tables, selectedDomain, searchQuery]);

  // Aggregate stats
  const totalRowsAll = useMemo(() => tables.reduce((acc, t) => acc + t.total_rows, 0), [tables]);
  const totalColsAll = useMemo(() => tables.reduce((acc, t) => acc + t.column_count, 0), [tables]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-100 text-zinc-900 border border-zinc-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                Enterprise Data Catalog & Business Glossary
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Discover curated data assets, inspect column dictionaries, verify freshness SLAs, and launch exploratory queries.
              </p>
            </div>
          </div>
        </div>

        {/* Global Catalog Metrics */}
        <div className="flex items-center gap-3">
          <div className="bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-200 text-center">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Catalog Tables</p>
            <p className="text-xl font-bold text-zinc-900 mt-0.5">{tables.length}</p>
          </div>
          <div className="bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-200 text-center">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Documented Columns</p>
            <p className="text-xl font-bold text-purple-700 mt-0.5">{totalColsAll}</p>
          </div>
          <div className="bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-200 text-center">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Curated Records</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{totalRowsAll.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Search and Domain Filter Bar */}
      <div className="bg-white border border-zinc-200 p-4 rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search data assets by table name, domain, tag, or description..."
              className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Domain Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Domains:
          </span>
          {domains.map((dom) => (
            <button
              key={dom}
              onClick={() => setSelectedDomain(dom)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                selectedDomain === dom
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "bg-zinc-100 border border-zinc-200 text-zinc-700 hover:bg-zinc-200/70"
              }`}
            >
              {dom === "ALL" ? "All Domains" : dom}
            </button>
          ))}
        </div>
      </div>

      {/* Table Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-zinc-500 font-medium">
          Loading Data Catalog metadata...
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
          <p className="font-semibold text-rose-700">Failed to load Data Catalog</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-white border border-zinc-200 rounded-2xl">
          No data catalog assets found matching your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTables.map((table) => (
            <div
              key={table.id}
              className="bg-white border border-zinc-200 hover:border-zinc-300 rounded-2xl p-5 shadow-xs transition flex flex-col justify-between group hover:shadow-sm"
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                      {table.domain}
                    </span>
                    <h3 className="text-lg font-bold text-zinc-900 mt-1.5 group-hover:text-zinc-700 transition">
                      {table.name}
                    </h3>
                    <p className="text-xs font-mono text-zinc-500">
                      {table.catalog}.{table.schema}.{table.name}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {table.freshness_status}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-zinc-600 mt-3 line-clamp-3 leading-relaxed">
                  {table.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {table.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-[10px] font-medium text-zinc-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Storage & Structure specs */}
                <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 font-semibold block">Format</span>
                    <span className="text-zinc-700 font-medium text-[11px]">{table.storage_format}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 font-semibold block">Layer</span>
                    <span className="text-zinc-700 font-medium text-[11px]">{table.storage_layer}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 font-semibold block">Rows</span>
                    <span className="text-zinc-900 font-bold">{table.total_rows.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 font-semibold block">Columns</span>
                    <span className="text-purple-700 font-bold">{table.column_count} cols</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-5 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenDetail(table.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 text-xs font-semibold transition border border-zinc-200 shadow-2xs"
                >
                  <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
                  Dictionary
                </button>
                <Link
                  href={`/analytics?sql=${encodeURIComponent(`SELECT * FROM ${table.catalog}.${table.schema}.${table.name} LIMIT 25`)}&catalog=${table.catalog}&schema=${table.schema}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition shadow-xs"
                >
                  Explore <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deep Table Detail & Dictionary Modal */}
      {selectedTableId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 sticky top-0 bg-white/95 backdrop-blur z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-zinc-100 text-zinc-900 border border-zinc-200">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                    {tableDetail ? tableDetail.table_summary.name : "Loading Table Detail..."}
                    {tableDetail && (
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {tableDetail.table_summary.domain}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs font-mono text-zinc-500">
                    {tableDetail && `${tableDetail.table_summary.catalog}.${tableDetail.table_summary.schema}.${tableDetail.table_summary.name}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseDetail}
                className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            {loadingDetail || !tableDetail ? (
              <div className="p-12 text-center text-zinc-500">Loading column dictionary and lineage...</div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Description and Metadata bar */}
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-2">
                  <p className="text-xs text-zinc-700 leading-relaxed">
                    {tableDetail.table_summary.description}
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2 text-xs text-zinc-500 border-t border-zinc-200">
                    <span>Format: <strong className="text-zinc-900">{tableDetail.table_summary.storage_format}</strong></span>
                    <span>Storage: <strong className="text-zinc-900">{tableDetail.table_summary.storage_layer}</strong></span>
                    <span>Freshness: <strong className="text-emerald-700">{tableDetail.table_summary.freshness_status}</strong></span>
                    <span>Total Rows: <strong className="text-zinc-900">{tableDetail.table_summary.total_rows.toLocaleString()}</strong></span>
                  </div>
                </div>

                {/* Column Dictionary Table */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-zinc-700" />
                    Column Dictionary & Schema Attributes ({tableDetail.columns.length} columns)
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left text-xs text-zinc-700">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase font-mono border-b border-zinc-200">
                        <tr>
                          <th className="py-2.5 px-3">Column</th>
                          <th className="py-2.5 px-3">Data Type</th>
                          <th className="py-2.5 px-3">Key / Constraint</th>
                          <th className="py-2.5 px-3">Sensitivity</th>
                          <th className="py-2.5 px-4">Business Definition</th>
                          <th className="py-2.5 px-3">Sample Values</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {tableDetail.columns.map((col) => (
                          <tr key={col.name} className="hover:bg-zinc-50/80 transition">
                            <td className="py-2 px-3 font-mono font-bold text-zinc-900">
                              {col.name}
                            </td>
                            <td className="py-2 px-3 font-mono text-purple-700">
                              {col.type}
                            </td>
                            <td className="py-2 px-3">
                              {col.is_primary_key && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                  <Key className="h-2.5 w-2.5" /> PK
                                </span>
                              )}
                              {col.is_foreign_key && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold" title={`References ${col.references}`}>
                                  <Link2 className="h-2.5 w-2.5" /> FK
                                </span>
                              )}
                              {!col.is_primary_key && !col.is_foreign_key && (
                                <span className="text-zinc-400">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                col.pii_classification === "PII"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : col.pii_classification === "FINANCIAL"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : col.pii_classification === "SYSTEM_AUDIT"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : col.pii_classification === "RISK_LABEL"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
                              }`}>
                                {col.pii_classification}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-zinc-700 leading-relaxed">
                              {col.description}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-500">
                              {col.sample_values ? col.sample_values.join(", ") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lineage Mapping */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      Upstream Sources (Ingestion Provenance)
                    </h4>
                    <ul className="space-y-1">
                      {tableDetail.lineage_upstream.map((src) => (
                        <li key={src} className="text-xs font-mono text-purple-700 flex items-center gap-1.5">
                          <ChevronRight className="h-3 w-3 text-purple-500" /> {src}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      Downstream Dependents (Consuming Assets)
                    </h4>
                    <ul className="space-y-1">
                      {tableDetail.lineage_downstream.map((dest) => (
                        <li key={dest} className="text-xs font-mono text-blue-700 flex items-center gap-1.5">
                          <ChevronRight className="h-3 w-3 text-blue-500" /> {dest}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Sample Queries */}
                {tableDetail.sample_queries.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      Curated Analytical Sample Queries
                    </h3>
                    <div className="space-y-3">
                      {tableDetail.sample_queries.map((sq, i) => (
                        <div key={i} className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-zinc-900">{sq.title}</h4>
                            <Link
                              href={`/analytics?sql=${encodeURIComponent(sq.sql)}&catalog=${tableDetail.table_summary.catalog}&schema=${tableDetail.table_summary.schema}`}
                              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-semibold flex items-center gap-1 transition shadow-xs"
                            >
                              Run Query <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                          <p className="text-xs text-zinc-600">{sq.description}</p>
                          <pre className="p-2.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-xs text-purple-300 overflow-x-auto">
                            {sq.sql}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
