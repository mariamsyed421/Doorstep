import { env } from "./env.server";

/**
 * Optional Supabase persistence over PostgREST (no extra dependency). Active only when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set server-side. The schema lives in
 * docs/supabase-schema.sql and must be applied through Lovable (see AGENTS.md).
 */
function config() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

export const persistenceEnabled = () => config() !== null;

export async function insertRow(table: string, row: Record<string, unknown>, onConflict?: string) {
  const c = config();
  if (!c) return { ok: false as const, skipped: true as const };
  const res = await fetch(
    `${c.url}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`,
    {
      method: "POST",
      headers: {
        apikey: c.key,
        authorization: `Bearer ${c.key}`,
        "content-type": "application/json",
        prefer: onConflict ? "resolution=ignore-duplicates,return=minimal" : "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!res.ok) console.warn(`[supabase] insert ${table} failed: ${res.status}`);
  return { ok: res.ok, skipped: false as const };
}

export async function selectRows<T>(table: string, query: string): Promise<T[]> {
  const c = config();
  if (!c) return [];
  const res = await fetch(`${c.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: c.key, authorization: `Bearer ${c.key}` },
    signal: AbortSignal.timeout(6000),
  });
  return res.ok ? ((await res.json()) as T[]) : [];
}
