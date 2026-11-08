import { createFileRoute } from "@tanstack/react-router";
import { fetchShelters } from "@/lib/doorstep/fema.server";
import { json } from "@/lib/doorstep/http.server";

/** GET /api/shelters — FEMA NSS shelters near Richardson, or labeled synthetic fallback. */
export const Route = createFileRoute("/api/shelters")({
  server: {
    handlers: {
      GET: async () => json(await fetchShelters()),
    },
  },
});
