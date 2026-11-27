"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Lock, User, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { loginUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("sarah.analyst");
  const [password, setPassword] = useState("FinLake2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const session = await loginUser(username, password);
      // Persist auth session & active persona
      localStorage.setItem("finlake_auth_session", JSON.stringify(session));
      localStorage.setItem("finlake_active_persona", session.user.id);
      window.dispatchEvent(new Event("finlake-session-changed"));
      
      // Redirect to overview dashboard
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please verify your username and password.");
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white border border-zinc-200 p-8 rounded-2xl shadow-xl">
        {/* Branding Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-zinc-100 text-zinc-900 border border-zinc-200 mb-3 shadow-xs">
            <Database className="h-8 w-8 text-zinc-800" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
            FinLake Enterprise Access
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Sign in to your isolated enterprise workspace and query curated financial data.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-500 tracking-wider mb-1.5">
              Username / Corporate Email
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sarah.analyst or admin"
                required
                className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-500 tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 shadow-2xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm transition shadow-xs active:scale-95 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Workspace"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* 1-Click Demo Accounts */}
        <div className="pt-4 border-t border-zinc-100 space-y-2.5">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider text-center">
            Or Click to Load Demo Credentials:
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("sarah.analyst", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Sarah Connor (Acme Payments)</span>
                <span className="text-[11px] text-emerald-700 font-medium">Analyst • Default Dataset • Dynamic Masking</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("david.auditor", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">David Miller (Acme Payments)</span>
                <span className="text-[11px] text-amber-700 font-medium">Auditor • Unmasked PII Access</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("admin", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Alex Chen (Acme Payments)</span>
                <span className="text-[11px] text-purple-700 font-medium">Administrator • Full Access</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("marcus.owner", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Marcus Vance (Apex Retail Bank EU)</span>
                <span className="text-[11px] text-purple-700 font-medium">Data Owner • Full Access & Anonymization Control</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("elena.engineer", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Elena Rostova (Apex Retail Bank EU)</span>
                <span className="text-[11px] text-blue-700 font-medium">Data Engineer • Isolated Tenant B (PG / Mongo / Redis)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("nordic.lead", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Astrid Lindqvist (Nordic Mobile Money)</span>
                <span className="text-[11px] text-amber-700 font-medium">Data Owner • Isolated Tenant C (Kafka / Cassandra / Influx)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between hover:border-zinc-300 transition cursor-pointer"
                 onClick={() => selectDemoAccount("sven.analyst", "FinLake2026!")}>
              <div>
                <span className="font-bold text-zinc-900 block">Sven Bergstrom (Nordic Mobile Money)</span>
                <span className="text-[11px] text-emerald-700 font-medium">Analyst • Isolated Tenant C • Masked PII</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-white border border-zinc-200 text-zinc-600">Load</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
