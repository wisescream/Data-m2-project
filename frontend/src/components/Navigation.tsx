"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Database, 
  Layers, 
  Activity, 
  PlayCircle, 
  BarChart3, 
  Clock, 
  BookOpen,
  ShieldCheck,
  CheckCircle2, 
  AlertCircle,
  User,
  LogOut,
  LogIn,
  Building2
} from "lucide-react";
import { useState, useEffect } from "react";
import { fetchHealth, AuthSession } from "@/lib/api";

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState<string>("checking");
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((data) => setHealthStatus(data.status || "healthy"))
      .catch(() => setHealthStatus("degraded"));

    const storedAuth = typeof window !== "undefined"
      ? (localStorage.getItem("finlake_auth_session") || localStorage.getItem("finlake_auth"))
      : null;
    if (storedAuth) {
      try {
        setSession(JSON.parse(storedAuth));
      } catch (e) {
        console.error("Failed to parse auth session", e);
      }
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("finlake_auth_session");
    localStorage.removeItem("finlake_auth");
    localStorage.removeItem("finlake_active_persona");
    localStorage.removeItem("finlake_user_role");
    localStorage.removeItem("finlake_tenant_id");
    setSession(null);
    router.push("/login");
  };

  const navItems = [
    { name: "Overview", href: "/", icon: Activity },
    { name: "SQL Sources", href: "/sources", icon: Database },
    { name: "Ingestion Jobs", href: "/jobs", icon: PlayCircle },
    { name: "Trino Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Data Catalog", href: "/catalog", icon: BookOpen },
    { name: "Security & RBAC", href: "/security", icon: ShieldCheck },
    { name: "Iceberg Ledger", href: "/iceberg", icon: Clock },
    { name: "Benchmarks", href: "/benchmarks", icon: Layers },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/20">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
                  FinLake <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">Enterprise</span>
                </span>
                <p className="text-xs text-slate-400">Financial Data Lake Platform</p>
              </div>
            </Link>
          </div>

          <nav className="flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center space-x-3">
            <div className="hidden xl:flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-900 border-slate-700">
              {healthStatus === "healthy" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-400">Services Online</span>
                </>
              ) : healthStatus === "checking" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  <span className="text-amber-400">Checking...</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  <span className="text-rose-400">Degraded</span>
                </>
              )}
            </div>

            {session?.user ? (
              <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-medium text-slate-200 flex items-center justify-end gap-1">
                    <User className="h-3 w-3 text-blue-400" />
                    {session.user.full_name || session.user.username}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                    <Building2 className="h-2.5 w-2.5 text-slate-500" />
                    {session.user.tenant_name} ({session.user.role})
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
