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
  ArrowRight, 
  Server, 
  Layers, 
  Table as TableIcon,
  ShieldAlert,
  HelpCircle
} from "lucide-react";
import { fetchSources, testSource, fetchTables, fetchTableSchema, DataSourceItem } from "@/lib/api";

type FilterTab = "all" | "connected" | "failed" | "untested";

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [testingId, setTestingId] = useState<string | null>(null);

  // Quick Explorer Modal / Drawer state
  const [activeExplorerSource, setActiveExplorerSource] = useState<DataSourceItem | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const loadSources = () => {
    setLoading(true);
    fetchSources()
      .then((data) => setSources(data))
      .catch((err) => console.error("Error loading sources:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSources();
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
    try {
      const res = await fetchTableSchema(sourceId, tableName);
      setSchemaInfo(res);
    } catch (err) {
      console.error("Error fetching schema:", err);
    } finally {
      setLoadingSchema(false);
    }
  };

  // Filter calculations
  const totalCount = sources.length;
  const connectedCount = sources.filter((s) => s.status === "connected").length;
  const failedCount = sources.filter((s) => s.status === "failed").length;
  const untestedCount = sources.filter((s) => s.status === "untested").length;

  const filteredSources = sources.filter((s) => {
    // Tab filter
    if (activeTab === "connected" && s.status !== "connected") return false;
    if (activeTab === "failed" && s.status !== "failed") return false;
    if (activeTab === "untested" && s.status !== "untested") return false;

    // Search query filter (matches name, host, database)
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ------------------------------------------------------------------- */}
      {/* Header Section (Wireframe Page 1)                                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Data Sources
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Connectez des bases de données externes pour explorer leurs schémas et leurs tables, puis les extraire vers le stockage.
          </p>
        </div>
        <Link
          href="/sources/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Ajouter une source
        </Link>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Zero Sources Empty State (Wireframe Page 6)                         */}
      {/* ------------------------------------------------------------------- */}
      {!loading && totalCount === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-16 text-center max-w-3xl mx-auto my-12 shadow-xl">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-5">
            <Database className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Aucune source de données pour l’instant
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
            Connectez votre première base SQL Server pour explorer ses tables et lancer des extractions. Préparez l’hôte, le port, le nom de la base et un compte en lecture.
          </p>
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-sm shadow-md transition-all"
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
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher par nom, hôte ou base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Segmented Buttons */}
            <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 shadow-inner">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "all"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Toutes</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-700/60 text-slate-300">
                  {totalCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("connected")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "connected"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Connectées</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                  {connectedCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("failed")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "failed"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>En échec</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-rose-950/80 text-rose-400 border border-rose-800/40">
                  {failedCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("untested")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "untested"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Non testées</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
                  {untestedCount}
                </span>
              </button>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Zero Search Results State (Wireframe Page 7)                    */}
          {/* --------------------------------------------------------------- */}
          {!loading && filteredSources.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center my-6">
              <div className="h-12 w-12 mx-auto rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mb-4">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Aucune source ne correspond à « {searchQuery} »
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                Vérifiez l’orthographe ou effacez la recherche. La recherche porte sur le nom de la connexion, l’hôte et la base de données.
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                Effacer la recherche
              </button>
            </div>
          ) : (
            /* ------------------------------------------------------------- */
            /* Data Sources Table (Wireframe Page 1)                         */
            /* ------------------------------------------------------------- */
            <div className="border border-slate-800 rounded-2xl bg-slate-900/60 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="text-xs uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Type</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Nom de la connexion</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Hôte / Serveur</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Base de données</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Statut</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold">Dernier test</th>
                      <th scope="col" className="px-6 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredSources.map((source) => {
                      const isTesting = testingId === source.id;
                      return (
                        <tr
                          key={source.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Type */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 text-blue-400 shrink-0" />
                              <span className="font-medium text-slate-200">
                                {source.type || "SQL Server"}
                              </span>
                            </div>
                          </td>

                          {/* Nom de la connexion */}
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-white">
                            {source.name}
                          </td>

                          {/* Hôte / Serveur */}
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-400">
                            {source.host}
                          </td>

                          {/* Base de données */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/60 font-mono text-xs text-slate-300">
                              {source.database}
                            </span>
                          </td>

                          {/* Statut Badge */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isTesting ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/60 text-blue-400 border border-blue-800/50">
                                <RotateCw className="h-3 w-3 animate-spin text-blue-400" />
                                Test en cours…
                              </div>
                            ) : source.status === "connected" ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-800/40">
                                <Check className="h-3 w-3 text-emerald-400 stroke-[3]" />
                                Connectée
                              </div>
                            ) : source.status === "failed" ? (
                              <div className="flex flex-col">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/60 text-rose-300 border border-rose-800/40 w-fit">
                                  <X className="h-3 w-3 text-rose-400 stroke-[3]" />
                                  Échec
                                </div>
                                {source.status_hint && (
                                  <span className="text-[11px] text-rose-400/80 mt-1 pl-1 leading-tight max-w-[200px] truncate" title={source.status_hint}>
                                    {source.status_hint}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/40">
                                <span>—</span>
                                Non testée
                              </div>
                            )}
                          </td>

                          {/* Dernier test */}
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                            {formatDate(source.last_tested)}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-2 justify-end">
                              <button
                                onClick={() => handleTestSource(source)}
                                disabled={isTesting}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition disabled:opacity-50"
                              >
                                {isTesting ? (
                                  <>
                                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                                    Test…
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                                    Tester
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenExplorer(source)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
                              >
                                Explorer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="px-6 py-3.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40">
                <span>{filteredSources.length} sources sur {totalCount} affichées</span>
                <span>Les statuts reflètent le dernier test</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Source Explorer Modal / Drawer                                      */}
      {/* ------------------------------------------------------------------- */}
      {activeExplorerSource && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    {activeExplorerSource.name}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {activeExplorerSource.database}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">{activeExplorerSource.host}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveExplorerSource(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Tables sidebar */}
              <div className="w-64 border-r border-slate-800 bg-slate-950/40 p-3 overflow-y-auto">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block px-2 mb-2">
                  Tables ({tables.length})
                </span>
                {loadingTables ? (
                  <div className="p-4 text-center text-xs text-slate-400">Chargement…</div>
                ) : tables.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">Aucune table trouvée</div>
                ) : (
                  <div className="space-y-1">
                    {tables.map((t) => (
                      <button
                        key={t}
                        onClick={() => handleSelectTable(activeExplorerSource.id, t)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center justify-between ${
                          selectedTable === t
                            ? "bg-blue-600/20 text-blue-300 border border-blue-500/30 font-medium"
                            : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <span className="truncate">{t}</span>
                        {selectedTable === t && <ArrowRight className="h-3 w-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Schema Viewer */}
              <div className="flex-1 p-5 overflow-y-auto">
                {selectedTable ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div>
                        <span className="text-xs text-slate-400">Table sélectionnée :</span>
                        <h4 className="text-base font-bold text-white font-mono">{selectedTable}</h4>
                      </div>
                      <Link
                        href={`/jobs?source=${activeExplorerSource.id}&table=${selectedTable}`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
                      >
                        Créer un Job d'ingestion
                      </Link>
                    </div>

                    {loadingSchema ? (
                      <div className="p-8 text-center text-xs text-slate-400">Chargement du schéma…</div>
                    ) : schemaInfo && schemaInfo.columns ? (
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 font-semibold uppercase">
                            <tr>
                              <th className="px-4 py-2.5">Colonne</th>
                              <th className="px-4 py-2.5">Type SQL</th>
                              <th className="px-4 py-2.5">Nullable</th>
                              <th className="px-4 py-2.5">Clé</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                            {schemaInfo.columns.map((c: any) => {
                              const isPk = schemaInfo.primary_keys?.includes(c.column_name);
                              return (
                                <tr key={c.column_name} className="hover:bg-slate-800/40">
                                  <td className="px-4 py-2 font-medium text-white">{c.column_name}</td>
                                  <td className="px-4 py-2 text-blue-400">{c.data_type}</td>
                                  <td className="px-4 py-2 text-slate-400">{c.is_nullable ? "OUI" : "NON"}</td>
                                  <td className="px-4 py-2">
                                    {isPk ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/40">
                                        PK
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">Schéma indisponible</div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Sélectionnez une table à gauche pour inspecter ses colonnes
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
