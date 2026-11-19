const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE_URL}/api/dashboard/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchSources() {
  const res = await fetch(`${API_BASE_URL}/sources`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sources");
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
    `${API_BASE_URL}/sources/${sourceId}/tables/${table}/schema?schema=${schema}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch table schema");
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
  const res = await fetch(`${API_BASE_URL}/storage/jobs?limit=${limit}&offset=${offset}`, {
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

export async function runTrinoQuery(query: string, catalog = "hive", schema = "default", maxRows = 1000) {
  const res = await fetch(`${API_BASE_URL}/api/analytics/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`${API_BASE_URL}/api/dashboard/iceberg`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch Iceberg metadata");
  return res.json();
}
