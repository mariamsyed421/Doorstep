import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/doorstep/http.server";
import { processInboundReply } from "@/lib/doorstep/messaging/photon.server";
import { InboundWebhookSchema } from "@/lib/doorstep/schemas";

/**
 * POST /api/webhook — inbound replies / delivery receipts.
 */
export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const p = payload as Record<string, unknown>;
        const normalized = {
          from: p["from"] ?? p["sender"] ?? p["phone"],
          text: p["text"] ?? p["body"] ?? p["message"],
          messageId: p["messageId"] ?? p["id"] ?? p["message_id"],
          channel: p["channel"] === "voice" ? "voice" : "sms",
          residentId:
            p["residentId"] ??
            (p["metadata"] as Record<string, unknown> | undefined)?.["residentId"],
        };
        const parsed = InboundWebhookSchema.safeParse(normalized);
        if (!parsed.success)
          return json({ error: "Unrecognized payload", issues: parsed.error.flatten() }, 422);
        try {
          return json(
            await processInboundReply(parsed.data.from, parsed.data.text, parsed.data.messageId),
          );
        } catch {
          return json({ error: "Sender is not an opted-in resident" }, 404);
        }
      },
    },
  },
});
