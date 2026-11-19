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
      
      // Redirect to analytics
      router.push("/analytics");
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
      <div className="max-w-md w-full space-y-8 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        {/* Branding Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 mb-3 shadow-lg">
            <Database className="h-8 w-8 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            FinLake Enterprise Access
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sign in to your isolated enterprise workspace and query curated financial data.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
              Username / Corporate Email
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sarah.analyst or admin"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 shadow-inner"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm transition shadow-lg shadow-purple-600/30 active:scale-95 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Workspace"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* 1-Click Demo Accounts */}
        <div className="pt-4 border-t border-slate-800 space-y-2.5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            Or Click to Load Demo Credentials:
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-purple-500/50 transition cursor-pointer"
                 onClick={() => selectDemoAccount("sarah.analyst", "FinLake2026!")}>
              <div>
                <span className="font-bold text-white block">Sarah Connor (Acme Payments)</span>
                <span className="text-[11px] text-emerald-400">Analyst • Default Dataset • Dynamic Masking</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-400">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-purple-500/50 transition cursor-pointer"
                 onClick={() => selectDemoAccount("david.auditor", "FinLake2026!")}>
              <div>
                <span className="font-bold text-white block">David Miller (Acme Payments)</span>
                <span className="text-[11px] text-amber-400">Auditor • Unmasked PII Access</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-400">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-purple-500/50 transition cursor-pointer"
                 onClick={() => selectDemoAccount("admin", "FinLake2026!")}>
              <div>
                <span className="font-bold text-white block">Alex Chen (Acme Payments)</span>
                <span className="text-[11px] text-purple-400">Administrator • Full Access</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-400">Load</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-purple-500/50 transition cursor-pointer"
                 onClick={() => selectDemoAccount("elena.engineer", "FinLake2026!")}>
              <div>
                <span className="font-bold text-white block">Elena Rostova (Apex Bank EU)</span>
                <span className="text-[11px] text-blue-400">Data Engineer • Isolated Tenant B</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-900 text-slate-400">Load</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
