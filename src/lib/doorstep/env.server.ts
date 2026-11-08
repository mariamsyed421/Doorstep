import { config } from "dotenv";
import path from "node:path";
import { RESIDENTS } from "@/lib/doorstep-data";

config({ path: path.resolve(process.cwd(), ".env"), override: true });

/** Server-only environment access. Never import from browser code. */
export function env(name: string): string | undefined {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function environmentDebug() {
  return {
    spectrumProjectId: Boolean(process.env["SPECTRUM_PROJECT_ID"]),
    spectrumProjectSecret: Boolean(process.env["SPECTRUM_PROJECT_SECRET"]),
    photonDemoRecipient: Boolean(process.env["PHOTON_DEMO_RECIPIENT"]),
    nvidiaApiKey: Boolean(process.env["NVIDIA_API_KEY"]),
    cwd: process.cwd(),
  };
}

export function integrationStatus() {
  const recipient = env("PHOTON_DEMO_RECIPIENT")?.replace(/\D/g, "");
  const photonResidentId =
    recipient && RESIDENTS.find((r) => r.profile.phone.replace(/\D/g, "") === recipient)?.id;
  return {
    aiProvider: (env("AI_PROVIDER") ?? "nemotron") as "nemotron" | "gemini",
    nemotron: Boolean(env("NVIDIA_API_KEY")),
    gemini: Boolean(env("LOVABLE_API_KEY") || env("GEMINI_API_KEY")),
    photon: Boolean(
      env("SPECTRUM_PROJECT_ID") && env("SPECTRUM_PROJECT_SECRET") && env("PHOTON_DEMO_RECIPIENT"),
    ),
    photonResidentId,
    supabase: Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")),
    fema: env("FEMA_SHELTERS_DISABLED") !== "true",
  };
}
