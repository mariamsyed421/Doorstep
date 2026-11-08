/** Server-only environment access. Never import from browser code. */
export function env(name: string): string | undefined {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function integrationStatus() {
  return {
    aiProvider: (env("AI_PROVIDER") ?? "nemotron") as "nemotron" | "gemini",
    nemotron: Boolean(env("NVIDIA_API_KEY")),
    gemini: Boolean(env("LOVABLE_API_KEY") || env("GEMINI_API_KEY")),
    photon: Boolean(env("PHOTON_API_KEY") && env("PHOTON_API_BASE_URL")),
    supabase: Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")),
    fema: env("FEMA_SHELTERS_DISABLED") !== "true",
  };
}
