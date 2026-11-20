import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Data Platform — FinLake Data Lake",
  description: "Enterprise local financial data lake powered by SQL Server, PostgreSQL, Spring Boot, MinIO, Hive, Trino, and Apache Iceberg.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="light">
      <body className="min-h-screen bg-[#f8f9fa] text-zinc-900 antialiased font-sans">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
