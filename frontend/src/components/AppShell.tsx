"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Layers, 
  Database, 
  SlidersHorizontal, 
  Box, 
  Activity, 
  ChevronDown,
  BarChart3,
  BookOpen,
  ShieldCheck,
  Clock,
  ExternalLink
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { getActiveTenantContext } from "@/lib/api";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [ctx, setCtx] = useState({
    tenantId: "tenant_acme",
    tenantName: "Acme Payments Global",
    userId: "user_alex_admin",
    userName: "Alex Chen",
    userRole: "ADMIN",
  });

  useEffect(() => {
    const syncCtx = () => setCtx(getActiveTenantContext());
    syncCtx();
    window.addEventListener("finlake-session-changed", syncCtx);
    window.addEventListener("storage", syncCtx);
    return () => {
      window.removeEventListener("finlake-session-changed", syncCtx);
      window.removeEventListener("storage", syncCtx);
    };
  }, [pathname]);

  const initials = ctx.userName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "FL";

  // Derive Wireframe Breadcrumbs
  const getBreadcrumbs = () => {
    if (pathname === "/sources/new") {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/sources" className="hover:text-zinc-900 transition-colors">
            Data Sources
          </Link>
          <span className="text-zinc-400">›</span>
          <span className="font-medium text-zinc-900">Ajouter une connexion SQL Server</span>
        </div>
      );
    }
    if (pathname === "/sources") {
      return <span className="text-sm font-medium text-zinc-900">Data Sources</span>;
    }
    if (pathname === "/analytics") {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/sources" className="hover:text-zinc-900">Platform</Link>
          <span className="text-zinc-400">›</span>
          <span className="font-medium text-zinc-900">Trino Analytics</span>
        </div>
      );
    }
    if (pathname === "/jobs") {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/sources" className="hover:text-zinc-900">Storage</Link>
          <span className="text-zinc-400">›</span>
          <span className="font-medium text-zinc-900">Storage Jobs</span>
        </div>
      );
    }
    return <span className="text-sm font-medium text-zinc-900">Data Platform</span>;
  };

  const primaryNav = [
    { name: "Overview", href: "/", icon: Layers, isMain: false },
    { name: "Data Sources", href: "/sources", icon: Database, isMain: true },
    { name: "Source Explorer", href: "/sources?explorer=true", icon: SlidersHorizontal, isMain: false },
    { name: "Storage", href: "http://localhost:9001", icon: Box, external: true },
    { name: "Storage Jobs", href: "/jobs", icon: Activity, isMain: false },
  ];

  const secondaryNav = [
    { name: "Trino Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Data Catalog", href: "/catalog", icon: BookOpen },
    { name: "Security & RBAC", href: "/security", icon: ShieldCheck },
    { name: "Iceberg Ledger", href: "/iceberg", icon: Clock },
    { name: "Benchmarks", href: "/benchmarks", icon: Layers },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-sans text-zinc-900">
      {/* ------------------------------------------------------------------- */}
      {/* Fixed Left Sidebar (Wireframe Navigation)                           */}
      {/* ------------------------------------------------------------------- */}
      <aside className="w-60 bg-white border-r border-zinc-200 flex flex-col fixed inset-y-0 left-0 z-30">
        {/* Logo & App Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-zinc-100">
          <div className="h-8 w-8 bg-[#18181b] rounded-lg flex items-center justify-center text-white shadow-xs">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-bold text-base tracking-tight text-zinc-900">
            Data Platform
          </span>
        </div>

        {/* Primary Wireframe Navigation Menu */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.name === "Data Sources" && pathname.startsWith("/sources"));
            
            if (item.external) {
              return (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-zinc-500" />
                    <span>{item.name}</span>
                  </div>
                  <ExternalLink className="h-3 w-3 text-zinc-400" />
                </a>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white border border-zinc-200 text-zinc-900 shadow-xs font-semibold"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-zinc-900" : "text-zinc-500"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}

          {/* Extended Platform Section */}
          <div className="pt-6 pb-2 px-3">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              FinLake Analytics
            </p>
          </div>

          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900 font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer / Info */}
        <div className="p-4 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>FinLake v2.0</span>
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Online
          </span>
        </div>
      </aside>

      {/* ------------------------------------------------------------------- */}
      {/* Main Layout Area                                                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col pl-60">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-zinc-200 px-8 flex items-center justify-between sticky top-0 z-20">
          <div>{getBreadcrumbs()}</div>

          {/* Active Company & User Profile Badge */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-medium text-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              {ctx.tenantName}
            </span>

            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
                <div className="text-left hidden md:block">
                  <span className="text-sm font-medium text-zinc-900 block leading-tight">{ctx.userName}</span>
                  <span className="text-[10px] font-mono text-zinc-500 block leading-tight">{ctx.userRole}</span>
                </div>
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-xl shadow-lg py-1.5 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-zinc-100">
                    <p className="font-semibold text-zinc-900">{ctx.userName}</p>
                    <p className="text-zinc-500 font-mono text-[11px]">{ctx.userRole} · {ctx.tenantName}</p>
                  </div>
                  <Link
                    href="/security"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-2 text-zinc-700 hover:bg-zinc-50"
                  >
                    Gestion Multi-Tenant & Anonymisation
                  </Link>
                  <Link
                    href="/analytics"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-2 text-zinc-700 hover:bg-zinc-50"
                  >
                    Console Analytique
                  </Link>
                  <div className="border-t border-zinc-100 my-1"></div>
                  <Link
                    href="/login"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-2 text-rose-600 hover:bg-rose-50 font-medium"
                  >
                    Changer de compte / Entreprise
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
