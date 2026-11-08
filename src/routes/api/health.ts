import { createFileRoute } from "@tanstack/react-router";
import { integrationStatus } from "@/lib/doorstep/env.server";
import { json } from "@/lib/doorstep/http.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, integrations: integrationStatus() }),
    },
  },
});
