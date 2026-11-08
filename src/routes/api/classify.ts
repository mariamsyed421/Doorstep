import { createFileRoute } from "@tanstack/react-router";
import { RESIDENTS } from "@/lib/doorstep-data";
import { classifyReply } from "@/lib/doorstep/ai/service.server";
import { json, parseBody } from "@/lib/doorstep/http.server";
import { ClassifyRequestSchema } from "@/lib/doorstep/schemas";

/** POST /api/classify — AI classification of a resident reply (Nemotron → Gemini → rules). */
export const Route = createFileRoute("/api/classify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await parseBody(request, ClassifyRequestSchema);
        if ("error" in body) return body.error;
        const r = RESIDENTS.find((x) => x.id === body.data.residentId);
        const classification = await classifyReply(
          body.data.text,
          body.data.preferredLanguage ?? r?.language ?? "English",
        );
        return json({ classification });
      },
    },
  },
});
