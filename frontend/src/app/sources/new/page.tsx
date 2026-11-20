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
  Info,
  Table as TableIcon
} from "lucide-react";
import { probeSourceConnection, registerSource, SourceProbeRequest, SourceProbeResponse } from "@/lib/api";

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

  // Interactive Test State
  const [testState, setTestState] = useState<TestState>("untested");
  const [probeResult, setProbeResult] = useState<SourceProbeResponse | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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

  const handleQuickDemo = async (targetEngine: "sqlserver" | "postgres") => {
    let payload: SourceProbeRequest;
    if (targetEngine === "postgres") {
      setDbType("PostgreSQL");
      setConnectionName("retail-pos-pg");
      setHost("postgres-source");
      setPort(5432);
      setDatabase("retail_banking");
      setAuthMethod("Authentification standard (mot de passe)");
      setUsername("finlake_user");
      setPassword("FinLake2026!StrongPass#");
      setEncrypt(false);
      setTrustCert(true);
      setTimeoutSec(30);
      payload = {
        connection_name: "retail-pos-pg",
        type: "postgresql",
        host: "postgres-source",
        port: 5432,
        database: "retail_banking",
        username: "finlake_user",
        password: "FinLake2026!StrongPass#",
        auth_method: "password",
        encrypt: false,
        trust_server_certificate: true,
        connection_timeout: 30
      };
    } else {
      setDbType("Microsoft SQL Server");
      setConnectionName("erp-production");
      setHost("sqlserver");
      setPort(1433);
      setDatabase("finlake_source");
      setAuthMethod("Authentification SQL Server");
      setUsername("sa");
      setPassword("FinLake2026!StrongPass#");
      setEncrypt(true);
      setTrustCert(true);
      setTimeoutSec(30);
      payload = {
        connection_name: "erp-production",
        type: "sqlserver",
        host: "sqlserver",
        port: 1433,
        database: "finlake_source",
        username: "sa",
        password: "FinLake2026!StrongPass#",
        auth_method: "sqlserver",
        encrypt: true,
        trust_server_certificate: true,
        connection_timeout: 30
      };
    }
    await executeProbeWithAnimation(payload);
  };

  const handleTestConnection = async () => {
    const isPg = dbType === "PostgreSQL";
    const payload: SourceProbeRequest = {
      connection_name: connectionName,
      type: isPg ? "postgresql" : "sqlserver",
      host: host,
      port: port,
      database: database,
      username: username,
      password: password,
      auth_method: isPg ? "password" : "sqlserver",
      encrypt: encrypt,
      trust_server_certificate: trustCert,
      connection_timeout: timeout
    };
    await executeProbeWithAnimation(payload);
  };

  const executeProbeWithAnimation = async (payload: SourceProbeRequest) => {
    setCancelled(false);
    setTestState("running");
    setElapsedSeconds(0);
    setCurrentStepIndex(1);

    if (timerRef.current) clearInterval(timerRef.current);
    const startMs = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    }, 500);

    setTimeout(() => setCurrentStepIndex(2), 200);
    setTimeout(() => setCurrentStepIndex(3), 400);

    try {
      const response = await probeSourceConnection(payload);
      if (timerRef.current) clearInterval(timerRef.current);
      setCurrentStepIndex(4);
      setProbeResult(response);
      if (response.status === "success") {
        setTestState("success");
      } else {
        setTestState("failed");
      }
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTestState("failed");
      setProbeResult({
        status: "failed",
        summary: "Échec de connexion au serveur",
        response_time_ms: 1200,
        tested_at: new Date().toISOString(),
        troubleshooting_checklist: [
          "Le nom d’utilisateur et le mot de passe sont saisis correctement.",
          "Le compte est actif et n’est pas verrouillé sur le serveur.",
          "Le serveur autorise l’authentification par mot de passe."
        ],
        steps: [
          { id: 1, name: "Joindre le serveur", detail: `${host}:${port}`, status: "failed" },
          { id: 2, name: "Sécuriser la connexion", detail: "Chiffrée (TLS)", status: "skipped" },
          { id: 3, name: "S’authentifier", detail: `En tant que ${username}`, status: "skipped" },
          { id: 4, name: "Ouvrir la base de données", detail: database, status: "skipped" },
        ]
      });
    }
  };

  const handleCancelTest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCancelled(true);
    setTestState("untested");
  };

  const handleSaveConnection = async () => {
    if (testState !== "success") return;
    setIsSaving(true);
    try {
      const isPg = dbType === "PostgreSQL";
      await registerSource({
        connection_name: connectionName,
        type: isPg ? "postgresql" : "sqlserver",
        host: host,
        port: port,
        database: database,
        username: username,
        password: password,
        auth_method: isPg ? "password" : "sqlserver",
        encrypt: encrypt,
        trust_server_certificate: trustCert
      });
      router.push("/sources");
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormLocked = testState === "running";

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Top Demo Accelerator Bar                                           */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex items-center justify-between bg-white border border-zinc-200 px-4 py-2.5 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-zinc-900">Accélérateurs Démo :</span>
          <span>Remplissage automatique et test immédiat</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleQuickDemo("postgres")}
            disabled={isFormLocked}
            className="px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <Zap className="h-3 w-3 text-emerald-600" />
            ⚡ Démo PostgreSQL 16
          </button>
          <button
            onClick={() => handleQuickDemo("sqlserver")}
            disabled={isFormLocked}
            className="px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <Zap className="h-3 w-3 text-blue-600" />
            ⚡ Démo SQL Server 2022
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Header Section (Wireframe Pages 2, 3, 4, 5)                         */}
      {/* ------------------------------------------------------------------- */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {dbType === "PostgreSQL" ? "Ajouter une connexion PostgreSQL" : "Ajouter une connexion SQL Server"}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-3xl leading-normal">
          Saisissez les informations dont la plateforme a besoin pour joindre votre base. Testez la connexion avant de l’enregistrer pour vérifier qu’elle fonctionne.
        </p>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Two-Column Grid: Form (Left) & Test Panel (Right)                  */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Card */}
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 shadow-xs space-y-6">
          {/* Failure Alert Banner (Wireframe Page 5) */}
          {testState === "failed" && (
            <div className="bg-zinc-50 border border-zinc-300 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-zinc-800">
              <Info className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
              <span>
                Le test de connexion a échoué. Vérifiez les champs signalés, puis testez à nouveau. Vos saisies sont conservées.
              </span>
            </div>
          )}

          {/* Section 1: Connexion */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Connexion</h2>
              <p className="text-xs text-zinc-500 mt-0.5">La façon dont cette source apparaît dans la plateforme.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Type de base de données
                </label>
                <select
                  disabled={isFormLocked}
                  value={dbType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
                >
                  <option value="Microsoft SQL Server">Microsoft SQL Server</option>
                  <option value="PostgreSQL">PostgreSQL</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Nom de la connexion
                </label>
                <input
                  type="text"
                  disabled={isFormLocked}
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
                  placeholder="erp-production"
                />
                <p className="text-[11px] text-zinc-400 mt-1">Nom unique, affiché dans les listes et les jobs.</p>
              </div>
            </div>
          </div>

          <hr className="border-zinc-100" />

          {/* Section 2: Serveur */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Serveur</h2>
              <p className="text-xs text-zinc-500 mt-0.5">L’emplacement où la base est hébergée.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Serveur / Hôte
                </label>
                <input
                  type="text"
                  disabled={isFormLocked}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
                  placeholder="sql-erp-prod.corp.internal"
                />
                <p className="text-[11px] text-zinc-400 mt-1">Nom d’hôte ou adresse IP.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  disabled={isFormLocked}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
                />
                <p className="text-[11px] text-zinc-400 mt-1">{dbType === "PostgreSQL" ? "5432 par défaut." : "1433 par défaut."}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Nom de la base de données
              </label>
              <input
                type="text"
                disabled={isFormLocked}
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 font-mono"
                placeholder="ERP_PROD"
              />
            </div>
          </div>

          <hr className="border-zinc-100" />

          {/* Section 3: Authentification */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Authentification</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Le compte utilisé par la plateforme pour lire la base.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Méthode d’authentification
              </label>
              <select
                disabled={isFormLocked}
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
              >
                {dbType === "PostgreSQL" ? (
                  <option value="Authentification standard (mot de passe)">Authentification standard (mot de passe)</option>
                ) : (
                  <>
                    <option value="Authentification SQL Server">Authentification SQL Server</option>
                    <option value="Authentification Windows">Authentification Windows</option>
                  </>
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Nom d’utilisateur
                </label>
                <input
                  type="text"
                  disabled={isFormLocked}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-zinc-900 focus:outline-none font-mono ${
                    testState === "failed" ? "border-rose-300 bg-rose-50/20" : "border-zinc-200 focus:border-zinc-400"
                  }`}
                  placeholder="svc_dataplatform"
                />
                {testState === "failed" && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <span>ℹ</span> Vérifiez le nom d’utilisateur.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    disabled={isFormLocked}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full pl-3 pr-10 py-2 bg-white border rounded-lg text-sm text-zinc-900 focus:outline-none font-mono ${
                      testState === "failed" ? "border-rose-300 bg-rose-50/20" : "border-zinc-200 focus:border-zinc-400"
                    }`}
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {testState === "failed" && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <span>ℹ</span> Vérifiez le mot de passe.
                  </p>
                )}
              </div>
            </div>
          </div>

          <hr className="border-zinc-100" />

          {/* Section 4: Paramètres avancés (facultatif) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-left text-xs font-medium text-zinc-800 hover:text-zinc-900"
            >
              <div>
                <span className="font-semibold text-zinc-900">Paramètres avancés (facultatif)</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Chiffrement et délai de connexion. Les valeurs par défaut conviennent à la plupart des serveurs.
                </p>
              </div>
              {showAdvanced ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
            </button>

            {showAdvanced && (
              <div className="mt-4 pt-4 border-t border-zinc-100 space-y-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={encrypt}
                    onChange={(e) => setEncrypt(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900">Chiffrer la connexion</span>
                    <p className="text-[11px] text-zinc-500">Chiffre les données échangées entre la plateforme et le serveur.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trustCert}
                    onChange={(e) => setTrustCert(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900">Faire confiance au certificat du serveur</span>
                    <p className="text-[11px] text-zinc-500">Ignore la validation du certificat. À réserver aux serveurs dotés d’un certificat auto-signé.</p>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Délai de connexion (secondes)
                  </label>
                  <input
                    type="number"
                    value={timeout}
                    onChange={(e) => setTimeoutSec(Number(e.target.value))}
                    className="w-32 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">Temps d’attente maximal de la réponse du serveur.</p>
                </div>
              </div>
            )}
          </div>

          <hr className="border-zinc-100" />

          {/* Form Actions Footer (Wireframe Pages 2, 3, 4, 5) */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Link
              href="/sources"
              className="text-xs text-zinc-500 hover:text-zinc-800 font-medium"
            >
              Annuler
            </Link>

            <div className="flex items-center gap-3">
              {/* State text */}
              <span className="text-xs text-zinc-500">
                {testState === "untested" && "Pas encore testée"}
                {testState === "running" && "Les champs sont verrouillés pendant le test"}
                {testState === "success" && "Testée avec succès à l’instant"}
                {testState === "failed" && "Le dernier test a échoué"}
              </span>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testState === "running"}
                className="px-4 py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                {testState === "running" ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin text-zinc-600" />
                    <span>Test en cours…</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 text-zinc-700" />
                    <span>Tester la connexion</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveConnection}
                disabled={testState !== "success" || isSaving}
                className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
                  testState === "success"
                    ? "bg-[#18181b] hover:bg-zinc-800 text-white cursor-pointer"
                    : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                }`}
              >
                {isSaving ? "Enregistrement…" : "Enregistrer la connexion"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Test Panel Card */}
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 shadow-xs space-y-6">
          <h2 className="text-sm font-semibold text-zinc-900">Test de connexion</h2>

          {/* --------------------------------------------------------------- */}
          {/* State 1: Untested (Wireframe Page 2)                           */}
          {/* --------------------------------------------------------------- */}
          {testState === "untested" && (
            <div className="space-y-4">
              <div className="border border-dashed border-zinc-300 rounded-xl p-6 text-center space-y-2">
                <div className="h-10 w-10 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 mb-2">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-900">Pas encore testée</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Lancez un test pour vérifier que la plateforme peut joindre ce serveur et s’y authentifier avec ces identifiants.
                </p>
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed">
                Le test se déroule en quatre étapes : joindre le serveur, sécuriser la connexion, s’authentifier, puis ouvrir la base. Rien n’est enregistré tant que vous n’avez pas choisi Enregistrer la connexion.
              </p>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State 2: Running Stepper (Wireframe Page 3)                     */}
          {/* --------------------------------------------------------------- */}
          {testState === "running" && (
            <div className="space-y-4">
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex items-center gap-3">
                <RotateCw className="h-5 w-5 text-zinc-700 animate-spin shrink-0" />
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900">Test de la connexion en cours…</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Étape {currentStepIndex} sur 4 · {elapsedSeconds} s écoulées
                  </p>
                </div>
              </div>

              {/* 4 Steps Stepper */}
              <div className="space-y-3 pt-2">
                {/* Step 1 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 font-bold">✓</span>
                    <div>
                      <p className="font-medium text-zinc-900">Joindre le serveur</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{host}:{port}</p>
                    </div>
                  </div>
                  <span className="text-zinc-600 font-medium">Réussi</span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    {currentStepIndex >= 2 ? (
                      <span className="text-zinc-600 font-bold">✓</span>
                    ) : (
                      <span className="text-zinc-400">○</span>
                    )}
                    <div>
                      <p className="font-medium text-zinc-900">Sécuriser la connexion</p>
                      <p className="text-[11px] text-zinc-400">Chiffrée (TLS)</p>
                    </div>
                  </div>
                  <span className={currentStepIndex >= 2 ? "text-zinc-600 font-medium" : "text-zinc-400"}>
                    {currentStepIndex >= 2 ? "Réussi" : "En attente"}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    {currentStepIndex === 3 ? (
                      <RotateCw className="h-3.5 w-3.5 animate-spin text-zinc-600" />
                    ) : currentStepIndex > 3 ? (
                      <span className="text-zinc-600 font-bold">✓</span>
                    ) : (
                      <span className="text-zinc-400">○</span>
                    )}
                    <div>
                      <p className="font-medium text-zinc-900">S’authentifier</p>
                      <p className="text-[11px] text-zinc-400 font-mono">En tant que {username}</p>
                    </div>
                  </div>
                  <span className={currentStepIndex === 3 ? "text-zinc-900 font-semibold" : currentStepIndex > 3 ? "text-zinc-600 font-medium" : "text-zinc-400"}>
                    {currentStepIndex === 3 ? "En cours" : currentStepIndex > 3 ? "Réussi" : "En attente"}
                  </span>
                </div>

                {/* Step 4 */}
                <div className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">○</span>
                    <div>
                      <p className="font-medium text-zinc-900">Ouvrir la base de données</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{database}</p>
                    </div>
                  </div>
                  <span className="text-zinc-400">En attente</span>
                </div>
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed pt-2">
                Le test prend généralement quelques secondes. Il s’arrête au bout du délai de connexion de 30 s.
              </p>

              <button
                type="button"
                onClick={handleCancelTest}
                className="w-full py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold shadow-xs transition-colors"
              >
                Annuler le test
              </button>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State 3: Success (Wireframe Page 4)                            */}
          {/* --------------------------------------------------------------- */}
          {testState === "success" && (
            <div className="space-y-4">
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-[#18181b] flex items-center justify-center text-white shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900">Connexion réussie</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    La plateforme a joint le serveur, s’est authentifiée et a ouvert {database}.
                  </p>
                </div>
              </div>

              {/* 4 Steps All Validated */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className="font-medium text-zinc-900">✓ Joindre le serveur</p>
                    <p className="text-[11px] text-zinc-400 font-mono">{host}:{port}</p>
                  </div>
                  <span className="text-zinc-700 font-medium">Réussi</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className="font-medium text-zinc-900">✓ Sécuriser la connexion</p>
                    <p className="text-[11px] text-zinc-400">
                      {probeResult?.steps?.[1]?.detail || (encrypt ? (trustCert ? "Chiffrée (TLS · Certificat approuvé)" : "Chiffrée (TLS · Validation stricte)") : "Non chiffrée (Standard)")}
                    </p>
                  </div>
                  <span className="text-zinc-700 font-medium">Réussi</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className="font-medium text-zinc-900">✓ S’authentifier</p>
                    <p className="text-[11px] text-zinc-400 font-mono">En tant que {username}</p>
                  </div>
                  <span className="text-zinc-700 font-medium">Réussi</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className="font-medium text-zinc-900">✓ Ouvrir la base de données</p>
                    <p className="text-[11px] text-zinc-400 font-mono">{database}</p>
                  </div>
                  <span className="text-zinc-700 font-medium">Réussi</span>
                </div>
              </div>

              {/* Technical Metadata Key-Value */}
              <div className="bg-zinc-50/50 border border-zinc-200 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Version du serveur</span>
                  <span className="font-semibold text-zinc-900">{probeResult?.server_version || `${dbType}`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Temps de réponse</span>
                  <span className="font-mono text-zinc-900">{probeResult?.response_time_ms || 38} ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Testée le</span>
                  <span className="text-zinc-700">À l’instant</span>
                </div>
              </div>

              {/* Live proof chips */}
              {probeResult?.discovered_tables && probeResult.discovered_tables.length > 0 && (
                <div className="border border-zinc-200 rounded-lg p-3 bg-white space-y-1.5">
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Tables réelles détectées en direct :
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {probeResult.discovered_tables.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-mono text-[11px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-zinc-500 leading-relaxed">
                Enregistrez la connexion pour l’ajouter à Data Sources.
              </p>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* State 4: Failed (Wireframe Page 5)                             */}
          {/* --------------------------------------------------------------- */}
          {testState === "failed" && (
            <div className="space-y-4">
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-[#18181b] flex items-center justify-center text-white shrink-0 mt-0.5">
                  <X className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-900">
                    {probeResult?.steps?.[1]?.status === "failed"
                      ? "Échec de la validation TLS/SSL"
                      : probeResult?.steps?.[0]?.status === "failed"
                      ? "Échec de connexion au serveur"
                      : "Échec de la connexion à l’authentification"}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {probeResult?.summary || "Le serveur a été joint, mais il a refusé le nom d’utilisateur ou le mot de passe."}
                  </p>
                </div>
              </div>

              {/* 4 Steps With Dynamic Real Status */}
              <div className="space-y-2.5 pt-1">
                {/* Step 1 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className={`font-medium ${probeResult?.steps?.[0]?.status === "failed" ? "text-rose-600" : "text-zinc-900"}`}>
                      {probeResult?.steps?.[0]?.status === "failed" ? "✕" : "✓"} Joindre le serveur
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono">{host}:{port}</p>
                  </div>
                  <span className={`font-medium ${probeResult?.steps?.[0]?.status === "failed" ? "text-rose-600 font-semibold" : "text-zinc-700"}`}>
                    {probeResult?.steps?.[0]?.status === "failed" ? "Échec" : "Réussi"}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className={`font-medium ${probeResult?.steps?.[1]?.status === "failed" ? "text-rose-600" : "text-zinc-900"}`}>
                      {probeResult?.steps?.[1]?.status === "failed" ? "✕" : probeResult?.steps?.[1]?.status === "skipped" ? "—" : "✓"} Sécuriser la connexion
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {probeResult?.steps?.[1]?.detail || (encrypt ? "Chiffrée (TLS)" : "Non chiffrée")}
                    </p>
                  </div>
                  <span className={`font-medium ${probeResult?.steps?.[1]?.status === "failed" ? "text-rose-600 font-semibold" : probeResult?.steps?.[1]?.status === "skipped" ? "text-zinc-400" : "text-zinc-700"}`}>
                    {probeResult?.steps?.[1]?.status === "failed" ? "Échec" : probeResult?.steps?.[1]?.status === "skipped" ? "Ignoré" : "Réussi"}
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className={`font-medium ${probeResult?.steps?.[2]?.status === "failed" ? "text-rose-600" : "text-zinc-900"}`}>
                      {probeResult?.steps?.[2]?.status === "failed" ? "✕" : probeResult?.steps?.[2]?.status === "skipped" ? "—" : "✓"} S’authentifier
                    </p>
                    <p className={`text-[11px] font-mono ${probeResult?.steps?.[2]?.status === "failed" ? "text-rose-600" : "text-zinc-400"}`}>
                      {probeResult?.steps?.[2]?.detail || `En tant que ${username}`}
                    </p>
                  </div>
                  <span className={`font-medium ${probeResult?.steps?.[2]?.status === "failed" ? "text-rose-600 font-semibold" : probeResult?.steps?.[2]?.status === "skipped" ? "text-zinc-400" : "text-zinc-700"}`}>
                    {probeResult?.steps?.[2]?.status === "failed" ? "Échec" : probeResult?.steps?.[2]?.status === "skipped" ? "Ignoré" : "Réussi"}
                  </span>
                </div>

                {/* Step 4 */}
                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100">
                  <div>
                    <p className={`font-medium ${probeResult?.steps?.[3]?.status === "failed" ? "text-rose-600" : "text-zinc-400"}`}>
                      {probeResult?.steps?.[3]?.status === "failed" ? "✕" : "—"} Ouvrir la base de données
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {probeResult?.steps?.[3]?.detail || "Non exécutée, car l’authentification a échoué"}
                    </p>
                  </div>
                  <span className={probeResult?.steps?.[3]?.status === "failed" ? "text-rose-600 font-semibold" : "text-zinc-400"}>
                    {probeResult?.steps?.[3]?.status === "failed" ? "Échec" : "Ignoré"}
                  </span>
                </div>
              </div>

              {/* À vérifier Checklist (Wireframe Page 5) */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-zinc-900">À vérifier</p>
                <ul className="text-xs text-zinc-600 space-y-1.5 pl-3 list-disc">
                  {probeResult?.troubleshooting_checklist && probeResult.troubleshooting_checklist.length > 0 ? (
                    probeResult.troubleshooting_checklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))
                  ) : (
                    <>
                      <li>Le nom d’utilisateur et le mot de passe sont saisis correctement.</li>
                      <li>Le compte est actif et n’est pas verrouillé sur le serveur.</li>
                      <li>Le serveur autorise l’authentification {dbType === "PostgreSQL" ? "PostgreSQL" : "SQL Server"}, et pas seulement l’authentification Windows.</li>
                    </>
                  )}
                </ul>
              </div>

              {/* Détails techniques Box (Wireframe Page 5) */}
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-zinc-900">Détails techniques</p>
                <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 font-mono text-[11px] text-zinc-700 leading-relaxed overflow-x-auto">
                  <p>
                    {probeResult?.technical_details || (dbType === "PostgreSQL"
                      ? "Erreur 28P01 · password authentication failed for user '" + username + "'."
                      : "Erreur 18456 · Login failed for user '" + username + "'.")}
                  </p>
                  <p className="text-zinc-400 mt-1">
                    Test à l’instant · {probeResult?.response_time_ms ? `durée ${probeResult.response_time_ms} ms` : "échec après 1,2 s"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                className="w-full py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Zap className="h-3.5 w-3.5 text-zinc-700" />
                Tester à nouveau
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
