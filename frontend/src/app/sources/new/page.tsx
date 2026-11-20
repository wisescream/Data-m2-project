"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Database, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  EyeOff, 
  Zap, 
  Check, 
  X, 
  RotateCw, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  ShieldCheck,
  Server
} from "lucide-react";
import { probeSourceConnection, registerSource, SourceProbeRequest, SourceProbeResponse, SourceProbeStep } from "@/lib/api";

type TestState = "untested" | "running" | "success" | "failed";

export default function NewSourcePage() {
  const router = useRouter();

  // Form Fields
  const [connectionName, setConnectionName] = useState("erp-production");
  const [dbType, setDbType] = useState("Microsoft SQL Server");
  const [host, setHost] = useState("sqlserver");
  const [port, setPort] = useState(1433);
  const [database, setDatabase] = useState("finlake_source");
  const [authMethod, setAuthMethod] = useState("Authentification SQL Server");
  const [username, setUsername] = useState("sa");
  const [password, setPassword] = useState("FinLake2026!StrongPass#");
  const [showPassword, setShowPassword] = useState(false);

  // Advanced Options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const [trustCert, setTrustCert] = useState(true);
  const [timeout, setTimeoutSec] = useState(30);

  const handleTypeChange = (newType: string) => {
    setDbType(newType);
    setTestState("untested");
    setProbeResult(null);
    if (newType === "PostgreSQL") {
      setConnectionName("retail-pos-pg");
      setHost("postgres-source");
      setPort(5432);
      setDatabase("retail_banking");
      setAuthMethod("Authentification standard (mot de passe)");
      setUsername("finlake_user");
      setPassword("FinLake2026!StrongPass#");
    } else {
      setConnectionName("erp-production");
      setHost("sqlserver");
      setPort(1433);
      setDatabase("finlake_source");
      setAuthMethod("Authentification SQL Server");
      setUsername("sa");
      setPassword("FinLake2026!StrongPass#");
    }
  };

  // Interactive Test State
  const [testState, setTestState] = useState<TestState>("untested");
  const [probeResult, setProbeResult] = useState<SourceProbeResponse | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Timer Ref for animated testing progress
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRunTest = async () => {
    setTestState("running");
    setProbeResult(null);
    setElapsedSeconds(0);
    setCurrentStepIndex(1);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const payload: SourceProbeRequest = {
      connection_name: connectionName,
      type: dbType.toLowerCase().includes("postgres") ? "postgresql" : "sqlserver",
      host: host,
      port: Number(port),
      database: database,
      auth_method: dbType.toLowerCase().includes("postgres") ? "postgresql" : "sqlserver",
      username: username,
      password: password,
      encrypt: encrypt,
      trust_server_certificate: trustCert,
      connection_timeout: Number(timeout)
    };

    try {
      const res = await probeSourceConnection(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      setProbeResult(res);
      setTestState(res.status === "success" ? "success" : "failed");
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTestState("failed");
      setProbeResult({
        status: "failed",
        summary: "Impossible de joindre le serveur. Vérifiez les paramètres de connexion.",
        response_time_ms: 1200,
        tested_at: new Date().toISOString(),
        steps: [
          { id: 1, name: "Joindre le serveur", detail: `${host}:${port} (${err.message})`, status: "failed" },
          { id: 2, name: "Sécuriser la connexion", detail: encrypt ? "Chiffrée (TLS)" : "Standard", status: "skipped" },
          { id: 3, name: "S'authentifier", detail: `En tant que ${username}`, status: "skipped" },
          { id: 4, name: "Ouvrir la base de données", detail: database, status: "skipped" },
        ],
        technical_details: `Erreur : ${err.message}`,
        troubleshooting_checklist: [
          "Le serveur d'hôte et le port sont joignables sur le réseau.",
          "Les pare-feu autorisent la connexion.",
          "Les identifiants SQL Server sont corrects."
        ]
      });
    }
  };

  const handleCancelTest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTestState("untested");
  };

  const handleSaveConnection = async () => {
    setIsSaving(true);
    try {
      const payload: SourceProbeRequest = {
        connection_name: connectionName,
        type: dbType.toLowerCase().includes("postgres") ? "postgresql" : "sqlserver",
        host: host,
        port: Number(port),
        database: database,
        auth_method: dbType.toLowerCase().includes("postgres") ? "postgresql" : "sqlserver",
        username: username,
        password: password,
        encrypt: encrypt,
        trust_server_certificate: trustCert,
        connection_timeout: Number(timeout)
      };
      await registerSource(payload);
      router.push("/sources");
    } catch (err) {
      console.error("Failed to save connection:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Breadcrumb Navigation                                               */}
      {/* ------------------------------------------------------------------- */}
      <nav className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/sources" className="hover:text-white transition">
          Data Sources
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-600" />
        <span className="text-slate-200 font-medium">Ajouter une connexion SQL Server</span>
      </nav>

      {/* ------------------------------------------------------------------- */}
      {/* Page Title & Subtitle                                               */}
      {/* ------------------------------------------------------------------- */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Ajouter une connexion SQL Server
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
          Saisissez les informations dont la plateforme a besoin pour joindre votre base. Testez la connexion avant de l’enregistrer pour vérifier qu’elle fonctionne.
        </p>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Global Error Alert Banner (Wireframe Page 5)                        */}
      {/* ------------------------------------------------------------------- */}
      {testState === "failed" && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 shadow-lg flex items-start gap-3">
          <Info className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Le test de connexion a échoué. Vérifiez les champs signalés, puis testez à nouveau. Vos saisies sont conservées.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Main 2-Column Layout (Form 2/3 + Test Panel 1/3)                    */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ================================================================= */}
        {/* LEFT COLUMN: Connection Form (8 Cols)                             */}
        {/* ================================================================= */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-800/80">
          <div className="p-6 space-y-6">
            {/* Section 1: Connexion */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Connexion</h3>
                <p className="text-xs text-slate-400 mt-0.5">La façon dont cette source apparaît dans la plateforme.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Type de base de données
                  </label>
                  <div className="relative">
                    <select
                      disabled={testState === "running"}
                      value={dbType}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    >
                      <option value="Microsoft SQL Server">Microsoft SQL Server</option>
                      <option value="PostgreSQL">PostgreSQL</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                      <ChevronRight className="h-3 w-3 rotate-90" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom de la connexion
                  </label>
                  <input
                    type="text"
                    disabled={testState === "running"}
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="erp-production"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 transition"
                  />
                  <span className="block text-[11px] text-slate-500 mt-1">
                    Nom unique, affiché dans les listes et les jobs.
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Serveur */}
            <div className="space-y-4 pt-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Serveur</h3>
                <p className="text-xs text-slate-400 mt-0.5">L’emplacement où la base est hébergée.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Serveur / Hôte
                  </label>
                  <input
                    type="text"
                    disabled={testState === "running"}
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="sql-erp-prod.corp.internal"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 transition"
                  />
                  <span className="block text-[11px] text-slate-500 mt-1">
                    Nom d’hôte ou adresse IP.
                  </span>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Port
                  </label>
                  <input
                    type="number"
                    disabled={testState === "running"}
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="1433"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 transition"
                  />
                  <span className="block text-[11px] text-slate-500 mt-1">
                    1433 par défaut.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nom de la base de données
                </label>
                <input
                  type="text"
                  disabled={testState === "running"}
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="ERP_PROD"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 transition"
                />
              </div>
            </div>

            {/* Section 3: Authentification */}
            <div className="space-y-4 pt-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Authentification</h3>
                <p className="text-xs text-slate-400 mt-0.5">Le compte utilisé par la plateforme pour lire la base.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Méthode d’authentification
                </label>
                <select
                  disabled={testState === "running"}
                  value={authMethod}
                  onChange={(e) => setAuthMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                >
                  <option value="Authentification SQL Server">Authentification SQL Server</option>
                  <option value="Authentification Windows / Active Directory">Authentification Windows / Active Directory</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom d’utilisateur
                  </label>
                  <input
                    type="text"
                    disabled={testState === "running"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="svc_dataplatform"
                    className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 disabled:opacity-50 transition ${
                      testState === "failed" ? "border-rose-800 focus:ring-rose-500/40" : "border-slate-800 focus:ring-blue-500/40"
                    }`}
                  />
                  {testState === "failed" && (
                    <span className="block text-[11px] text-rose-400 mt-1">
                      ⓘ Vérifiez le nom d’utilisateur.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      disabled={testState === "running"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className={`w-full pl-3 pr-10 py-2 bg-slate-950 border rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 disabled:opacity-50 transition ${
                        testState === "failed" ? "border-rose-800 focus:ring-rose-500/40" : "border-slate-800 focus:ring-blue-500/40"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {testState === "failed" && (
                    <span className="block text-[11px] text-rose-400 mt-1">
                      ⓘ Vérifiez le mot de passe.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section 4: Paramètres avancés (facultatif) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-left py-2 text-xs font-medium text-slate-300 hover:text-white transition"
              >
                <div>
                  <span className="font-bold">Paramètres avancés (facultatif)</span>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Chiffrement et délai de connexion. Les valeurs par défaut conviennent à la plupart des serveurs.
                  </p>
                </div>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-3 pb-1 border-t border-slate-800/80 mt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={encrypt}
                      onChange={(e) => setEncrypt(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="block text-xs font-medium text-slate-200">Chiffrer la connexion</span>
                      <span className="block text-[11px] text-slate-500">Chiffre les données échangées entre la plateforme et le serveur.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trustCert}
                      onChange={(e) => setTrustCert(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="block text-xs font-medium text-slate-200">Faire confiance au certificat du serveur</span>
                      <span className="block text-[11px] text-slate-500">Ignore la validation du certificat. À réserver aux serveurs dotés d’un certificat auto-signé.</span>
                    </div>
                  </label>

                  <div className="max-w-xs">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Délai de connexion (secondes)
                    </label>
                    <input
                      type="number"
                      value={timeout}
                      onChange={(e) => setTimeoutSec(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100"
                    />
                    <span className="block text-[11px] text-slate-500 mt-1">
                      Temps d’attente maximal de la réponse du serveur.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="p-4 px-6 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Link
              href="/sources"
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Annuler
            </Link>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {testState === "untested" && "Pas encore testée"}
                {testState === "running" && "Les champs sont verrouillés pendant le test"}
                {testState === "success" && (
                  <span className="text-emerald-400 font-medium">Testée avec succès à l’instant</span>
                )}
                {testState === "failed" && (
                  <span className="text-rose-400 font-medium">Le dernier test a échoué</span>
                )}
              </span>

              <button
                type="button"
                onClick={handleRunTest}
                disabled={testState === "running"}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition disabled:opacity-50"
              >
                {testState === "running" ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    Test en cours…
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    Tester la connexion
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveConnection}
                disabled={testState === "running" || isSaving}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-bold text-xs shadow-md transition disabled:opacity-40"
              >
                {isSaving ? "Enregistrement…" : "Enregistrer la connexion"}
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: Live Interactive Test Panel (4 Cols)                */}
        {/* ================================================================= */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Test de connexion
          </h3>

          {/* --------------------------------------------------------------- */}
          {/* State A: Pas encore testée (Page 2)                             */}
          {/* --------------------------------------------------------------- */}
          {testState === "untested" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
                <div className="h-10 w-10 mx-auto rounded-full bg-slate-800/80 text-amber-400 flex items-center justify-center">
                  <Zap className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-bold text-white">Pas encore testée</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Lancez un test pour vérifier que la plateforme peut joindre ce serveur et s’y authentifier avec ces identifiants.
                </p>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Le test se déroule en quatre étapes : joindre le serveur, sécuriser la connexion, s’authentifier, puis ouvrir la base. Rien n’est enregistré tant que vous n’avez pas choisi <strong>Enregistrer la connexion</strong>.
              </p>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State B: Test en cours (Page 3)                                 */}
          {/* --------------------------------------------------------------- */}
          {testState === "running" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <RotateCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  Test de la connexion en cours…
                </h4>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Étape 3 sur 4 · {elapsedSeconds} s écoulées
                </span>
              </div>

              {/* Stepper */}
              <div className="space-y-3.5 text-xs">
                {/* Step 1 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div>
                    <span className="font-medium text-slate-200 block">Joindre le serveur</span>
                    <span className="text-[10px] text-slate-500 font-mono">{host}:{port}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-400">✓ Réussi</span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div>
                    <span className="font-medium text-slate-200 block">Sécuriser la connexion</span>
                    <span className="text-[10px] text-slate-500">Chiffrée (TLS)</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-400">✓ Réussi</span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div>
                    <span className="font-medium text-blue-300 block">S’authentifier</span>
                    <span className="text-[10px] text-slate-500">En tant que {username}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-400 animate-pulse">⟳ En cours</span>
                </div>

                {/* Step 4 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 opacity-60">
                  <div>
                    <span className="font-medium text-slate-400 block">Ouvrir la base de données</span>
                    <span className="text-[10px] text-slate-500 font-mono">{database}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">En attente</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Le test prend généralement quelques secondes. Il s’arrête au bout du délai de connexion de {timeout} s.
              </p>

              <button
                type="button"
                onClick={handleCancelTest}
                className="w-full py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                Annuler le test
              </button>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State C: Connexion réussie (Page 4)                             */}
          {/* --------------------------------------------------------------- */}
          {testState === "success" && probeResult && (
            <div className="space-y-5">
              {/* Green Success Banner */}
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">Connexion réussie</h4>
                  <p className="text-[11px] text-emerald-300/80 mt-0.5 leading-relaxed">
                    {probeResult.summary}
                  </p>
                </div>
              </div>

              {/* Stepper All Green */}
              <div className="space-y-3 text-xs divide-y divide-slate-800/60">
                {probeResult.steps.map((s) => (
                  <div key={s.id} className="pt-2 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-200 block">{s.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{s.detail}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400">✓ Réussi</span>
                  </div>
                ))}
              </div>

              {/* Technical Specs */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Version du serveur</span>
                  <span className="font-medium text-white">{probeResult.server_version || "SQL Server 2022"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Temps de réponse</span>
                  <span className="font-mono text-emerald-400">{probeResult.response_time_ms} ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Testée le</span>
                  <span className="text-slate-300">
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                    }).format(new Date(probeResult.tested_at))}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Enregistrez la connexion pour l’ajouter à Data Sources.
              </p>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State D: Échec de la connexion (Page 5)                         */}
          {/* --------------------------------------------------------------- */}
          {testState === "failed" && probeResult && (
            <div className="space-y-5">
              {/* Red Error Banner */}
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-start gap-3">
                <div className="h-5 w-5 rounded-full bg-rose-900 text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                  <X className="h-3.5 w-3.5 stroke-[3]" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Échec de la connexion</h4>
                  <p className="text-[11px] text-rose-300/80 mt-0.5 leading-relaxed">
                    {probeResult.summary}
                  </p>
                </div>
              </div>

              {/* Stepper with Failure Point */}
              <div className="space-y-3 text-xs divide-y divide-slate-800/60">
                {probeResult.steps.map((s) => (
                  <div key={s.id} className="pt-2 flex items-center justify-between">
                    <div>
                      <span className={`font-medium block ${s.status === "failed" ? "text-rose-300" : "text-slate-200"}`}>
                        {s.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{s.detail}</span>
                    </div>
                    {s.status === "success" && (
                      <span className="text-[11px] font-semibold text-emerald-400">✓ Réussi</span>
                    )}
                    {s.status === "failed" && (
                      <span className="text-[11px] font-semibold text-rose-400">✕ Échec</span>
                    )}
                    {s.status === "skipped" && (
                      <span className="text-[11px] text-slate-500">Ignoré</span>
                    )}
                  </div>
                ))}
              </div>

              {/* À vérifier Checklist */}
              {probeResult.troubleshooting_checklist && probeResult.troubleshooting_checklist.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h5 className="text-xs font-bold text-slate-200">À vérifier</h5>
                  <ul className="space-y-1.5 text-[11px] text-slate-400">
                    {probeResult.troubleshooting_checklist.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                        <span className="text-slate-500">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Technical Details */}
              {probeResult.technical_details && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-400 space-y-1">
                  <span className="font-semibold text-slate-300 block">Détails techniques</span>
                  <p className="break-all">{probeResult.technical_details}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleRunTest}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Tester à nouveau
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
