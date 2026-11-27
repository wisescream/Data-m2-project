"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Database, 
  Plus, 
  Search, 
  Zap, 
  Check, 
  X, 
  RotateCw, 
  SlidersHorizontal,
  Table as TableIcon,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { fetchSources, testSource, fetchTables, fetchTableSchema, fetchSourcePreview, getActiveTenantContext, DataSourceItem } from "@/lib/api";

type FilterTab = "all" | "connected" | "failed" | "untested";

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [testingId, setTestingId] = useState<string | null>(null);

  // Quick Explorer Drawer State
  const [activeExplorerSource, setActiveExplorerSource] = useState<DataSourceItem | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadSources = () => {
    setLoading(true);
    fetchSources()
      .then((data) => setSources(data))
      .catch((err) => console.error("Error loading sources:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSources();
    window.addEventListener("finlake-session-changed", loadSources);
    return () => window.removeEventListener("finlake-session-changed", loadSources);
  }, []);

  const handleTestSource = async (source: DataSourceItem) => {
    setTestingId(source.id);
    try {
      await testSource(source.id);
      loadSources();
    } catch (err) {
      console.error("Test failed:", err);
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenExplorer = async (source: DataSourceItem) => {
    setActiveExplorerSource(source);
    setLoadingTables(true);
    setSelectedTable(null);
    setSchemaInfo(null);
    try {
      const res = await fetchTables(source.id);
      setTables(res.tables || []);
      if (res.tables && res.tables.length > 0) {
        handleSelectTable(source.id, res.tables[0]);
      }
    } catch (err) {
      console.error("Error fetching tables for source:", err);
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleSelectTable = async (sourceId: string, tableName: string) => {
    setSelectedTable(tableName);
    setLoadingSchema(true);
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const [res, prev] = await Promise.all([
        fetchTableSchema(sourceId, tableName),
        fetchSourcePreview(sourceId, tableName).catch(() => null),
      ]);
      setSchemaInfo(res);
      setPreviewData(prev);
    } catch (err) {
      console.error("Error fetching schema:", err);
    } finally {
      setLoadingSchema(false);
      setLoadingPreview(false);
    }
  };

  // Filter calculations
  const totalCount = sources.length;
  const connectedCount = sources.filter((s) => s.status === "connected").length;
  const failedCount = sources.filter((s) => s.status === "failed").length;
  const untestedCount = sources.filter((s) => s.status === "untested").length;

  const filteredSources = sources.filter((s) => {
    if (activeTab === "connected" && s.status !== "connected") return false;
    if (activeTab === "failed" && s.status !== "failed") return false;
    if (activeTab === "untested" && s.status !== "untested") return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.host.toLowerCase().includes(q) ||
      s.database.toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Jamais";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const isSearchEmpty = Boolean(searchQuery.trim() && filteredSources.length === 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Header Section (Wireframe Page 1)                                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Data Sources
          </h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl leading-normal">
            Connectez des bases de données externes pour explorer leurs schémas et leurs tables, puis les extraire vers le stockage.
          </p>
        </div>
        <Link
          href="/sources/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white font-medium text-sm shadow-xs transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Ajouter une source
        </Link>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Zero Sources Empty State (Wireframe Page 6)                         */}
      {/* ------------------------------------------------------------------- */}
      {!loading && totalCount === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-16 text-center max-w-2xl mx-auto my-12 shadow-xs">
          <div className="h-16 w-16 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 mb-4">
            <Database className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 mb-2">
            Aucune source de données pour l’instant
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6 leading-relaxed">
            Connectez votre première base SQL Server pour explorer ses tables et lancer des extractions. Préparez l’hôte, le port, le nom de la base et un compte en lecture.
          </p>
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#18181b] hover:bg-zinc-800 text-white font-medium text-sm shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter une source
          </Link>
        </div>
      ) : (
        <>
          {/* --------------------------------------------------------------- */}
          {/* Search Bar & Filter Tabs (Wireframe Page 1)                    */}
          {/* --------------------------------------------------------------- */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, hôte ou base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs (Pills) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors whitespace-nowrap ${
                  activeTab === "all"
                    ? "bg-white border-zinc-900 text-zinc-900 font-semibold shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                Toutes <span className="ml-1 text-zinc-500">{isSearchEmpty ? 0 : totalCount}</span>
              </button>
              <button
                onClick={() => setActiveTab("connected")}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors whitespace-nowrap ${
                  activeTab === "connected"
                    ? "bg-white border-zinc-900 text-zinc-900 font-semibold shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                Connectées <span className="ml-1 text-zinc-500">{isSearchEmpty ? 0 : connectedCount}</span>
              </button>
              <button
                onClick={() => setActiveTab("failed")}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors whitespace-nowrap ${
                  activeTab === "failed"
                    ? "bg-white border-zinc-900 text-zinc-900 font-semibold shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                En échec <span className="ml-1 text-zinc-500">{isSearchEmpty ? 0 : failedCount}</span>
              </button>
              <button
                onClick={() => setActiveTab("untested")}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors whitespace-nowrap ${
                  activeTab === "untested"
                    ? "bg-white border-zinc-900 text-zinc-900 font-semibold shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                Non testées <span className="ml-1 text-zinc-500">{isSearchEmpty ? 0 : untestedCount}</span>
              </button>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Empty Search Result State (Wireframe Page 7)                    */}
          {/* --------------------------------------------------------------- */}
          {isSearchEmpty ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-16 text-center max-w-2xl mx-auto my-8 shadow-xs">
              <div className="h-16 w-16 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 mb-4">
                <Search className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 mb-2">
                Aucune source ne correspond à « {searchQuery} »
              </h2>
              <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6 leading-relaxed">
                Vérifiez l’orthographe ou effacez la recherche. La recherche porte sur le nom de la connexion, l’hôte et la base de données.
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-sm transition-colors"
              >
                Effacer la recherche
              </button>
            </div>
          ) : (
            /* ------------------------------------------------------------- */
            /* Data Sources Table (Wireframe Page 1)                         */
            /* ------------------------------------------------------------- */
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-medium text-zinc-500">
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Nom de la connexion</th>
                      <th className="py-3 px-4">Hôte / Serveur</th>
                      <th className="py-3 px-4">Base de données</th>
                      <th className="py-3 px-4">Statut</th>
                      <th className="py-3 px-4">Dernier test</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-zinc-700">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-zinc-400">
                          <RotateCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                          Chargement des sources...
                        </td>
                      </tr>
                    ) : filteredSources.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-zinc-400">
                          Aucune source trouvée dans cette catégorie.
                        </td>
                      </tr>
                    ) : (
                      filteredSources.map((source) => (
                        <tr key={source.id} className="hover:bg-zinc-50/80 transition-colors">
                          {/* Type */}
                          <td className="py-3.5 px-4 font-normal whitespace-nowrap">
                            <div className="flex items-center gap-2 text-zinc-600">
                              <Database className="h-4 w-4 text-zinc-400" />
                              <span>{source.type || "SQL Server"}</span>
                            </div>
                          </td>

                          {/* Nom de la connexion */}
                          <td className="py-3.5 px-4 font-bold text-zinc-900 whitespace-nowrap">
                            {source.name}
                          </td>

                          {/* Hôte / Serveur */}
                          <td className="py-3.5 px-4 font-mono text-xs text-zinc-600 whitespace-nowrap">
                            {source.host}
                          </td>

                          {/* Base de données */}
                          <td className="py-3.5 px-4 text-zinc-700 whitespace-nowrap">
                            {source.database}
                          </td>

                          {/* Statut */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {testingId === source.id ? (
                              <div className="flex items-center gap-1.5 text-zinc-800 text-xs">
                                <RotateCw className="h-3.5 w-3.5 animate-spin text-zinc-600" />
                                <span>Test en cours</span>
                              </div>
                            ) : source.status === "connected" ? (
                              <div className="flex items-center gap-1.5 text-zinc-900 text-sm font-medium">
                                <span className="text-zinc-600">✓</span>
                                <span>Connectée</span>
                              </div>
                            ) : source.status === "failed" ? (
                              <div>
                                <div className="flex items-center gap-1.5 text-zinc-900 text-sm font-medium">
                                  <span className="text-zinc-600">✕</span>
                                  <span>Échec</span>
                                </div>
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                  {source.status_hint || "Identifiants refusés par le serveur"}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
                                <span>—</span>
                                <span>Non testée</span>
                              </div>
                            )}
                          </td>

                          {/* Dernier test */}
                          <td className="py-3.5 px-4 text-zinc-600 text-xs whitespace-nowrap">
                            {formatDate(source.last_tested)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleTestSource(source)}
                                disabled={testingId === source.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-medium transition-colors"
                              >
                                {testingId === source.id ? (
                                  <>
                                    <RotateCw className="h-3 w-3 animate-spin text-zinc-600" />
                                    <span>Test…</span>
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-3 w-3 text-zinc-700" />
                                    <span>Tester</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenExplorer(source)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-medium transition-colors"
                              >
                                Explorer
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer (Wireframe Page 1) */}
              <div className="border-t border-zinc-200 bg-zinc-50/50 px-4 py-3 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {isSearchEmpty ? 0 : filteredSources.length} source{filteredSources.length > 1 ? "s" : ""} sur {totalCount} affichée{filteredSources.length > 1 ? "s" : ""}
                </span>
                <span>Les statuts reflètent le dernier test</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Table Explorer Side Drawer                                          */}
      {/* ------------------------------------------------------------------- */}
      {activeExplorerSource && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/30 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-zinc-200 flex flex-col">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <div>
                <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                  <Database className="h-4 w-4 text-zinc-600" />
                  {activeExplorerSource.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                  {activeExplorerSource.host} · {activeExplorerSource.database}
                </p>
              </div>
              <button
                onClick={() => setActiveExplorerSource(null)}
                className="p-1 rounded-lg hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Tables List */}
              <div className="w-52 border-r border-zinc-200 bg-zinc-50/30 overflow-y-auto p-3 space-y-1">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
                  Tables Découvertes ({tables.length})
                </p>
                {loadingTables ? (
                  <div className="py-6 text-center text-xs text-zinc-400">
                    <RotateCw className="h-4 w-4 animate-spin mx-auto mb-1" />
                    Chargement...
                  </div>
                ) : tables.length === 0 ? (
                  <p className="text-xs text-zinc-400 px-2 py-2">Aucune table visible</p>
                ) : (
                  tables.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleSelectTable(activeExplorerSource.id, t)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-2 ${
                        selectedTable === t
                          ? "bg-zinc-900 text-white font-semibold"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }`}
                    >
                      <TableIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Table Schema Viewer */}
              <div className="flex-1 p-6 overflow-y-auto">
                {selectedTable ? (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-200 mb-4">
                      <div>
                        <h4 className="font-bold text-zinc-900 font-mono text-sm">{selectedTable}</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {schemaInfo?.columns?.length || 0} colonnes · {schemaInfo?.estimated_row_count?.toLocaleString() || "N/A"} lignes
                        </p>
                      </div>
                      <Link
                        href="/jobs"
                        className="text-xs font-medium text-zinc-900 underline hover:text-zinc-600"
                      >
                        Créer un job d’ingestion →
                      </Link>
                    </div>

                    {loadingSchema ? (
                      <div className="py-12 text-center text-xs text-zinc-400">
                        <RotateCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                        Chargement du schéma...
                      </div>
                    ) : schemaInfo?.columns ? (
                      <div className="border border-zinc-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
                            <tr>
                              <th className="py-2 px-3">Colonne</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3">Clé</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 font-mono text-[11px]">
                            {schemaInfo.columns.map((col: any) => (
                              <tr key={col.column_name} className="hover:bg-zinc-50">
                                <td className="py-2 px-3 font-semibold text-zinc-800">{col.column_name}</td>
                                <td className="py-2 px-3 text-zinc-500">{col.data_type}</td>
                                <td className="py-2 px-3">
                                  {col.is_primary_key ? (
                                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 font-bold text-[10px]">PK</span>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {/* Live Data Preview with Anonymization */}
                    <div className="mt-6 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                          Aperçu des Données ({getActiveTenantContext().userRole})
                        </h5>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {previewData?.rows ? `${previewData.rows.length} enregistrements` : ""}
                        </span>
                      </div>

                      {loadingPreview ? (
                        <div className="py-6 text-center text-xs text-zinc-400">
                          Chargement des données...
                        </div>
                      ) : previewData?.error ? (
                        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                          {previewData.error}
                        </div>
                      ) : previewData?.rows && previewData.rows.length > 0 ? (
                        <div className="border border-zinc-200 rounded-lg overflow-x-auto">
                          <table className="w-full text-left text-[11px] font-mono">
                            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                              <tr>
                                {previewData.columns.map((c: string) => (
                                  <th key={c} className="py-2 px-3 whitespace-nowrap">{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-white">
                              {previewData.rows.map((r: any, idx: number) => (
                                <tr key={idx} className="hover:bg-zinc-50">
                                  {previewData.columns.map((c: string) => (
                                    <td key={c} className="py-2 px-3 text-zinc-800 whitespace-nowrap max-w-[180px] truncate">
                                      {r[c] !== null && r[c] !== undefined ? String(r[c]) : "NULL"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400">Aucun aperçu disponible pour cette table.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-zinc-400 text-xs">
                    Sélectionnez une table à gauche pour inspecter son schéma
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
