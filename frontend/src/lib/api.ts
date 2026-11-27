const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getActiveTenantContext(): {
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  userRole: string;
} {
  if (typeof window === "undefined") {
    return {
      tenantId: "tenant_acme",
      tenantName: "Acme Payments Global",
      userId: "user_alex_admin",
      userName: "Alex Chen",
      userRole: "ADMIN",
    };
  }
  try {
    const rawSession = localStorage.getItem("finlake_auth_session");
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed?.user) {
        return {
          tenantId: parsed.user.tenant_id || "tenant_acme",
          tenantName: parsed.user.tenant_name || "Acme Payments Global",
          userId: parsed.user.id || "user_sarah_analyst",
          userName: parsed.user.full_name || "Sarah Connor",
          userRole: parsed.user.role || "ANALYST",
        };
      }
    }
    const personaId = localStorage.getItem("finlake_active_persona");
    if (personaId === "user_elena_engineer") {
      return { tenantId: "tenant_apex", tenantName: "Apex Retail Bank EU", userId: personaId, userName: "Elena Rostova", userRole: "DATA_ENGINEER" };
    }
    if (personaId === "user_marcus_owner") {
      return { tenantId: "tenant_apex", tenantName: "Apex Retail Bank EU", userId: personaId, userName: "Marcus Vance", userRole: "DATA_OWNER" };
    }
    if (personaId === "user_nordic_owner") {
      return { tenantId: "tenant_nordic", tenantName: "Nordic Mobile Money Ltd", userId: personaId, userName: "Astrid Lindqvist", userRole: "DATA_OWNER" };
    }
    if (personaId === "user_nordic_analyst") {
      return { tenantId: "tenant_nordic", tenantName: "Nordic Mobile Money Ltd", userId: personaId, userName: "Sven Bergstrom", userRole: "ANALYST" };
    }
    if (personaId === "user_david_auditor") {
      return { tenantId: "tenant_acme", tenantName: "Acme Payments Global", userId: personaId, userName: "David Miller", userRole: "AUDITOR" };
    }
    if (personaId === "user_alex_admin") {
      return { tenantId: "tenant_acme", tenantName: "Acme Payments Global", userId: personaId, userName: "Alex Chen", userRole: "ADMIN" };
    }
  } catch (e) {
    console.warn("Failed to read active tenant context", e);
  }
  return {
    tenantId: "tenant_acme",
    tenantName: "Acme Payments Global",
    userId: "user_sarah_analyst",
    userName: "Sarah Connor",
    userRole: "ANALYST",
  };
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function fetchStats() {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/dashboard/stats?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export interface DataSourceItem {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  status: "connected" | "failed" | "testing" | "untested";
  status_hint?: string;
  last_tested?: string;
  server_version?: string;
}

export interface SourceProbeStep {
  id: number;
  name: string;
  detail: string;
  status: "success" | "failed" | "running" | "waiting" | "skipped";
}

export interface SourceProbeRequest {
  connection_name: string;
  type?: string;
  host: string;
  port?: number;
  database: string;
  auth_method?: string;
  username: string;
  password?: string;
  encrypt?: boolean;
  trust_server_certificate?: boolean;
  connection_timeout?: number;
}

export interface SourceProbeResponse {
  status: "success" | "failed";
  summary: string;
  server_version?: string;
  response_time_ms: number;
  tested_at: string;
  steps: SourceProbeStep[];
  technical_details?: string;
  troubleshooting_checklist: string[];
  discovered_tables?: string[];
}

export async function fetchSources(): Promise<DataSourceItem[]> {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/sources?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sources");
  return res.json();
}

export async function probeSourceConnection(data: SourceProbeRequest): Promise<SourceProbeResponse> {
  const res = await fetch(`${API_BASE_URL}/sources/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to probe source connection");
  }
  return res.json();
}

export async function registerSource(data: SourceProbeRequest): Promise<DataSourceItem> {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/sources?tenant_id=${encodeURIComponent(tenantId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to register data source");
  }
  return res.json();
}

export async function testSource(sourceId: string) {
  const res = await fetch(`${API_BASE_URL}/sources/${sourceId}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function fetchTables(sourceId: string, schema = "dbo") {
  const res = await fetch(`${API_BASE_URL}/sources/${sourceId}/tables?schema=${schema}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

export async function fetchTableSchema(sourceId: string, table: string, schema = "dbo") {
  const res = await fetch(
    `${API_BASE_URL}/sources/${sourceId}/tables/${encodeURIComponent(table)}/schema?schema=${encodeURIComponent(schema)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch table schema");
  return res.json();
}

export async function fetchSourcePreview(sourceId: string, table: string, schema = "dbo") {
  const { userId, userRole } = getActiveTenantContext();
  const res = await fetch(
    `${API_BASE_URL}/sources/${sourceId}/tables/${encodeURIComponent(table)}/preview?schema=${encodeURIComponent(schema)}`,
    {
      cache: "no-store",
      headers: {
        "X-User-Id": userId,
        "X-User-Role": userRole,
      },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch source preview");
  return res.json();
}

export async function submitJob(payload: {
  source_id: string;
  schema_name: string;
  table: string;
  format: string;
  compression: string;
  batch_size: number;
  partition_by?: string[];
  max_rows?: number;
}) {
  const res = await fetch(`${API_BASE_URL}/storage/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to submit job");
  return res.json();
}

export async function listJobs(limit = 50, offset = 0) {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/storage/jobs?limit=${limit}&offset=${offset}&tenant_id=${encodeURIComponent(tenantId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to list jobs");
  return res.json();
}

export async function fetchJobResult(jobId: string) {
  const res = await fetch(`${API_BASE_URL}/storage/jobs/${jobId}/result`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch job result");
  return res.json();
}

export async function runTrinoQuery(
  query: string, 
  catalog = "hive", 
  schema = "default", 
  maxRows = 1000,
  security?: { tenantId?: string; userRole?: string; userId?: string; userName?: string }
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (security?.tenantId) headers["X-Tenant-Id"] = security.tenantId;
  if (security?.userRole) headers["X-User-Role"] = security.userRole;
  if (security?.userId) headers["X-User-Id"] = security.userId;
  if (security?.userName) headers["X-User-Name"] = security.userName;

  const res = await fetch(`${API_BASE_URL}/api/analytics/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, catalog, schema, max_rows: maxRows }),
  });
  if (!res.ok) throw new Error("Query execution failed");
  return res.json();
}

export async function generateSqlFromPrompt(prompt: string): Promise<{
  sql: string;
  explanation: string;
  catalog: string;
  schema: string;
  suggested_chart: "table" | "bar" | "line" | "area" | "pie";
  suggested_x?: string;
  suggested_y?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("AI SQL generation failed");
  return res.json();
}

export async function fetchIcebergMetadata() {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/dashboard/iceberg?tenant_id=${encodeURIComponent(tenantId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch Iceberg metadata");
  return res.json();
}

export async function runIcebergTimeTravel(snapshotId: string) {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(
    `${API_BASE_URL}/api/dashboard/iceberg/time-travel?tenant_id=${encodeURIComponent(tenantId)}&snapshot_id=${encodeURIComponent(snapshotId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to run time-travel query");
  return res.json();
}

export interface CatalogColumn {
  name: string;
  type: string;
  description: string;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  references?: string;
  pii_classification: string;
  sample_values?: string[];
}

export interface CatalogTableSummary {
  id: string;
  name: string;
  catalog: string;
  schema: string;
  domain: string;
  description: string;
  storage_format: string;
  storage_layer: string;
  total_rows: number;
  column_count: number;
  freshness_status: string;
  last_updated: string;
  tags: string[];
}

export interface CatalogTableDetail {
  table_summary: CatalogTableSummary;
  columns: CatalogColumn[];
  sample_queries: Array<{ title: string; sql: string; description: string }>;
  lineage_upstream: string[];
  lineage_downstream: string[];
}

export async function fetchCatalogTables(): Promise<CatalogTableSummary[]> {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/catalog/tables?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch catalog tables");
  return res.json();
}

export async function fetchCatalogTableDetail(tableId: string): Promise<CatalogTableDetail> {
  const res = await fetch(`${API_BASE_URL}/api/catalog/tables/${tableId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch catalog table detail");
  return res.json();
}

export async function searchCatalog(query: string): Promise<CatalogTableSummary[]> {
  const { tenantId } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/catalog/search?q=${encodeURIComponent(query)}&tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Catalog search failed");
  return res.json();
}

// -----------------------------------------------------------------------------
// Enterprise Multi-Tenancy, RBAC & Governance
// -----------------------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  code: string;
  tier: string;
  assigned_catalog: string;
  assigned_schema: string;
  user_count: number;
  created_at: string;
  features: string[];
}

export interface UserPersona {
  id: string;
  username: string;
  full_name: string;
  email: string;
  tenant_id: string;
  role: "ADMIN" | "DATA_OWNER" | "DATA_ENGINEER" | "ANALYST" | "AUDITOR";
  permissions: string[];
  can_view_pii: boolean;
  can_manage_pipelines: boolean;
  can_view_iceberg_snapshots: boolean;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  sql: string;
  catalog: string;
  schema: string;
  rows_returned: number;
  execution_time_ms: number;
  masking_applied: boolean;
  timestamp: string;
  status: string;
}

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch(`${API_BASE_URL}/api/security/tenants`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tenants");
  return res.json();
}

export async function fetchPersonas(): Promise<UserPersona[]> {
  const res = await fetch(`${API_BASE_URL}/api/security/personas`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch user personas");
  return res.json();
}

export async function fetchAuditLogs(tenantId = "ALL"): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE_URL}/api/security/audit-logs?tenant=${tenantId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export interface AnonymizationPolicyItem {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  tenant_id: string;
  anonymized: boolean;
}

export async function fetchAnonymizationPolicies(tenantId?: string): Promise<AnonymizationPolicyItem[]> {
  const targetTenant = tenantId || getActiveTenantContext().tenantId;
  const res = await fetch(`${API_BASE_URL}/api/security/policies?tenant_id=${encodeURIComponent(targetTenant)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch anonymization policies");
  const data = await res.json();
  return data.policies || [];
}

export async function updateAnonymizationPolicy(targetUserId: string, anonymize: boolean) {
  const { userRole } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/security/policies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Role": userRole,
    },
    body: JSON.stringify({ target_user_id: targetUserId, anonymize }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update anonymization policy");
  }
  return res.json();
}

export interface ColumnAnonymizationConfig {
  auto_detected_columns: string[];
  suggested_columns: string[];
  custom_columns: string[];
}

export async function fetchAnonymizationColumns(): Promise<ColumnAnonymizationConfig> {
  const res = await fetch(`${API_BASE_URL}/api/security/columns`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch anonymization columns");
  return res.json();
}

export async function updateCustomAnonymizationColumns(columns: string[]): Promise<ColumnAnonymizationConfig> {
  const { userRole } = getActiveTenantContext();
  const res = await fetch(`${API_BASE_URL}/api/security/columns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Role": userRole,
    },
    body: JSON.stringify({ columns }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update custom anonymization columns");
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------

export interface AuthSession {
  token: string;
  user: {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: "ADMIN" | "DATA_OWNER" | "DATA_ENGINEER" | "ANALYST" | "AUDITOR";
    tenant_id: string;
    tenant_name: string;
    assigned_catalog: string;
    assigned_schema: string;
    can_view_pii: boolean;
  };
}

export async function loginUser(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Authentication failed");
  }
  return res.json();
}
