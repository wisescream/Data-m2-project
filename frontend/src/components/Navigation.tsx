"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Database, 
  Layers, 
  Activity, 
  PlayCircle, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";
import { useState, useEffect } from "react";
import { fetchHealth } from "@/lib/api";

export default function Navigation() {
  const pathname = usePathname();
  const [healthStatus, setHealthStatus] = useState<string>("checking");

  useEffect(() => {
    fetchHealth()
      .then((data) => setHealthStatus(data.status || "healthy"))
      .catch(() => setHealthStatus("degraded"));
  }, []);

  const navItems = [
    { name: "Overview", href: "/", icon: Activity },
    { name: "SQL Sources", href: "/sources", icon: Database },
    { name: "Ingestion Jobs", href: "/jobs", icon: PlayCircle },
    { name: "Trino Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Iceberg Ledger", href: "/iceberg", icon: Clock },
    { name: "Benchmarks", href: "/benchmarks", icon: Layers },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/20">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
                FinLake <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">Spring Boot 3 + Next.js</span>
              </span>
              <p className="text-xs text-slate-400">Financial Data Lake Platform</p>
            </div>
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
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-900 border-slate-700">
              {healthStatus === "healthy" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-400">Services Online</span>
                </>
              ) : healthStatus === "checking" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  <span className="text-amber-400">Checking Stack...</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  <span className="text-rose-400">Control Plane Ready</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
