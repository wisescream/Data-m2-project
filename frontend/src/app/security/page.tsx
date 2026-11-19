"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  Building2, 
  Users, 
  FileText, 
  Check, 
  Lock, 
  Eye, 
  EyeOff, 
  Clock, 
  Database, 
  Layers, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Key
} from "lucide-react";
import { 
  fetchTenants, 
  fetchPersonas, 
  fetchAuditLogs, 
  Tenant, 
  UserPersona, 
  AuditLog 
} from "@/lib/api";

export default function SecurityGovernancePage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [personas, setPersonas] = useState<UserPersona[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activePersona, setActivePersona] = useState<UserPersona | null>(null);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"tenants" | "rbac" | "audit">("tenants");
  const [loading, setLoading] = useState(true);
  const [refreshingAudit, setRefreshingAudit] = useState(false);

  useEffect(() => {
    loadAllSecurityData();
  }, []);

  const loadAllSecurityData = async () => {
    setLoading(true);
    try {
      const [tData, pData, aData] = await Promise.all([
        fetchTenants(),
        fetchPersonas(),
        fetchAuditLogs("ALL")
      ]);
      setTenants(tData);
      setPersonas(pData);
      setAuditLogs(aData);

      // Restore active persona from localStorage or default to Sarah (Analyst)
      const savedPersonaId = localStorage.getItem("finlake_active_persona");
      const matched = pData.find((p) => p.id === savedPersonaId) || pData[0];
      if (matched) {
        setActivePersona(matched);
      }
    } catch (err) {
      console.error("Failed to load security governance data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPersona = (p: UserPersona) => {
    setActivePersona(p);
    localStorage.setItem("finlake_active_persona", p.id);
  };

  const handleRefreshAudit = async () => {
    setRefreshingAudit(true);
    try {
      const data = await fetchAuditLogs(selectedTenantFilter);
      setAuditLogs(data);
    } catch (err) {
      console.error("Failed to refresh audit logs", err);
    } finally {
      setRefreshingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Enterprise Multi-Tenancy, RBAC & Security Governance
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Isolate enterprise workspaces, enforce dynamic PII masking, and preserve audit trails for SOC2 / GDPR compliance.
              </p>
            </div>
          </div>
        </div>

        {/* Global Security Metrics */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Workspaces</p>
            <p className="text-xl font-bold text-white mt-0.5">{tenants.length}</p>
          </div>
          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Personas</p>
            <p className="text-xl font-bold text-purple-400 mt-0.5">{personas.length}</p>
          </div>
          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Audit Records</p>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">{auditLogs.length}</p>
          </div>
        </div>
      </div>

      {/* Active Persona / Enterprise Switcher Card */}
      {activePersona && (
        <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/30 p-5 rounded-2xl shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Current Active Session Context
              </span>
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mt-1">
                {activePersona.full_name}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {activePersona.role}
                </span>
                <span className="text-xs font-normal text-slate-400">
                  ({tenants.find((t) => t.id === activePersona.tenant_id)?.name || activePersona.tenant_id})
                </span>
              </h2>
            </div>

            {/* PII Masking Status Indicator */}
            <div className="flex items-center gap-2">
              {activePersona.can_view_pii ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-semibold">
                  <Eye className="h-4 w-4" /> Unmasked PII Access (Auditor / Admin)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold">
                  <EyeOff className="h-4 w-4" /> Dynamic PII Masking Active (Analyst Role)
                </span>
              )}
            </div>
          </div>

          {/* Quick Persona Switcher Chips */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Switch Persona:
            </span>
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPersona(p)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activePersona.id === p.id
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 border border-purple-500"
                    : "bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                }`}
              >
                <span>{p.full_name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40">
                  {p.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Tab Controls */}
      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1.5 gap-1">
        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === "tenants"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Building2 className="h-4 w-4" /> Enterprise Workspaces & Isolation
        </button>
        <button
          onClick={() => setActiveTab("rbac")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === "rbac"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Key className="h-4 w-4" /> RBAC Matrix & Dynamic Masking
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === "audit"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <FileText className="h-4 w-4" /> Enterprise Audit Ledger ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Enterprise Workspaces & Tenant Isolation */}
      {activeTab === "tenants" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                        {t.tier}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-1.5">{t.name}</h3>
                      <p className="text-xs font-mono text-slate-400">Code: {t.code}</p>
                    </div>
                    <Building2 className="h-5 w-5 text-purple-400 shrink-0" />
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Assigned Catalog:</span>
                      <strong className="text-white font-mono">{t.assigned_catalog}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Assigned Schema:</span>
                      <strong className="text-purple-300 font-mono">{t.assigned_schema}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Provisioned Users:</span>
                      <strong className="text-emerald-400">{t.user_count} seats</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Onboarded:</span>
                      <strong className="text-slate-300">{t.created_at}</strong>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mb-1.5">
                      Security & Isolation Features:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {t.features.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-medium text-slate-300"
                        >
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Workspace Active
                  </span>
                  <Link
                    href="/analytics"
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                  >
                    Open Workspace <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Architecture Explanation Banner */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-400" />
              How FinLake Isolates Enterprise Data Spaces
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every enterprise tenant is provisioned with a logical workspace bound to specific Trino catalogs and MinIO S3 bucket prefix paths. Row-Level Security (RLS) and dynamic column masking are executed on the fly during query evaluation, guaranteeing that <strong>Tenant A can never inspect Tenant B’s financial transactions or PII</strong>.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: RBAC Matrix & Dynamic Masking */}
      {activeTab === "rbac" && (
        <div className="space-y-6">
          {/* Permission Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-purple-400" />
              Role-Based Access Control (RBAC) Entitlements
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Primary Purpose</th>
                    <th className="py-3 px-4">Raw PII Visibility</th>
                    <th className="py-3 px-4">SQL Analytics</th>
                    <th className="py-3 px-4">Ingestion Pipelines</th>
                    <th className="py-3 px-4">Iceberg Commit Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900">
                  <tr>
                    <td className="py-3 px-4 font-bold text-white">ANALYST</td>
                    <td className="py-3 px-4">Business analysis & reporting</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold">Masked</span></td>
                    <td className="py-3 px-4 text-emerald-400">✓ Granted</td>
                    <td className="py-3 px-4 text-slate-500">✕ Restricted</td>
                    <td className="py-3 px-4 text-slate-500">✕ Restricted</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-bold text-white">AUDITOR</td>
                    <td className="py-3 px-4">Regulatory & compliance audit</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold">Full Access</span></td>
                    <td className="py-3 px-4 text-emerald-400">✓ Granted</td>
                    <td className="py-3 px-4 text-slate-500">✕ Restricted</td>
                    <td className="py-3 px-4 text-emerald-400">✓ Granted (ACID Logs)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-bold text-white">DATA_ENGINEER</td>
                    <td className="py-3 px-4">ETL, schema drift, storage jobs</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold">Masked</span></td>
                    <td className="py-3 px-4 text-emerald-400">✓ Granted</td>
                    <td className="py-3 px-4 text-emerald-400">✓ Full Control</td>
                    <td className="py-3 px-4 text-emerald-400">✓ Granted</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-bold text-white">ADMIN</td>
                    <td className="py-3 px-4">Workspace provisioning & security</td>
                    <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold">Full Access</span></td>
                    <td className="py-3 px-4 text-emerald-400">✓ Full Control</td>
                    <td className="py-3 px-4 text-emerald-400">✓ Full Control</td>
                    <td className="py-3 px-4 text-emerald-400">✓ Full Control</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic Data Masking Example */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-emerald-400" />
              Dynamic PII Masking Preview (Analyst vs Compliance Officer)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  Auditor / Admin View (Raw Data)
                </span>
                <pre className="p-3 rounded bg-slate-900 text-xs font-mono text-slate-300 overflow-x-auto">
{`{
  "customer_id": 104,
  "first_name": "Emma",
  "last_name": "Watson",
  "email": "emma.watson@finlake.io",
  "name_orig": "C1231006815"
}`}
                </pre>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-purple-500/30 space-y-2">
                <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                  Analyst View (Dynamically Masked in Memory)
                </span>
                <pre className="p-3 rounded bg-slate-900 text-xs font-mono text-purple-200 overflow-x-auto">
{`{
  "customer_id": 104,
  "first_name": "E***",
  "last_name": "W***",
  "email": "e****@finlake.io",
  "name_orig": "C123****"
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Enterprise Query Audit Ledger */}
      {activeTab === "audit" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-400" />
                Immutable Analytical Audit Ledger
              </h3>
              <p className="text-xs text-slate-400">
                Real-time compliance record of every query executed across all enterprise workspaces.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshAudit}
                disabled={refreshingAudit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingAudit ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Tenant / Workspace</th>
                  <th className="py-2.5 px-3">User & Role</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-4">Executed SQL Query</th>
                  <th className="py-2.5 px-3">Rows</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Masking</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                      {log.timestamp}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {tenants.find((t) => t.id === log.tenant_id)?.code || log.tenant_id}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-slate-200 block">{log.user_name}</span>
                      <span className="text-[10px] font-mono text-purple-400">{log.user_role}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                      {log.catalog}.{log.schema}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-purple-200 max-w-[320px] truncate" title={log.sql}>
                      {log.sql}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-white">
                      {log.rows_returned}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {log.execution_time_ms} ms
                    </td>
                    <td className="py-2.5 px-3">
                      {log.masking_applied ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Active
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-rose-950 text-rose-300 border border-rose-800"
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
