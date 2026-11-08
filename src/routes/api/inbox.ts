import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/doorstep/http.server";
import { persistenceEnabled, selectRows } from "@/lib/doorstep/persistence.server";

/** GET /api/inbox?since=ISO — inbound replies persisted by the webhook (Supabase only). */
export const Route = createFileRoute("/api/inbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!persistenceEnabled()) return json({ enabled: false, replies: [] });
        const since =
          new URL(request.url).searchParams.get("since") ??
          new Date(Date.now() - 3600_000).toISOString();
        const replies = await selectRows(
          "check_ins",
          `select=id,resident_id,reply,classification,created_at&direction=eq.inbound&created_at=gt.${encodeURIComponent(since)}&order=created_at.asc&limit=50`,
        );
        return json({ enabled: true, replies });
      },
    },
  },
});
