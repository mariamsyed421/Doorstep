import { createFileRoute } from "@tanstack/react-router";
import { RESIDENTS } from "@/lib/doorstep-data";
import { summarizeCase } from "@/lib/doorstep/ai/service.server";
import { json, parseBody } from "@/lib/doorstep/http.server";
import { SummarizeRequestSchema } from "@/lib/doorstep/schemas";

/** POST /api/summarize — coordinator case summary from facts the client already shows. */
export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await parseBody(request, SummarizeRequestSchema);
        if ("error" in body) return body.error;
        const r = RESIDENTS.find((x) => x.id === body.data.residentId);
        if (!r) return json({ error: "Unknown resident" }, 404);
        return json(await summarizeCase(r.shortName, body.data.facts));
      },
    },
  },
});
