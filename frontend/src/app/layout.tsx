import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "FinLake — Financial Transaction Data Lake",
  description: "Enterprise local financial data lake powered by SQL Server, Spring Boot, MinIO, Hive, Trino, and Apache Iceberg.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col font-sans">
        <Navigation />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
          FinLake Data Engineering Platform • PaySim Synthetic Dataset • Java 21 Spring Boot + Next.js 15
        </footer>
      </body>
    </html>
  );
}
