import { createFileRoute } from "@tanstack/react-router";
import { RESIDENTS } from "@/lib/doorstep-data";
import { classifyReply } from "@/lib/doorstep/ai/service.server";
import { json } from "@/lib/doorstep/http.server";
import { verifySignature, webhookConfig } from "@/lib/doorstep/messaging/photon.server";
import { insertRow } from "@/lib/doorstep/persistence.server";
import { InboundWebhookSchema } from "@/lib/doorstep/schemas";

/**
 * POST /api/webhook — inbound replies / delivery receipts.
 * If PHOTON_WEBHOOK_SECRET is set the HMAC-SHA256 signature is required. Payloads are
 * normalized into InboundWebhookSchema (from, text, messageId, channel, residentId?).
 */
export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { secret, header } = webhookConfig();
        if (secret && !(await verifySignature(raw, request.headers.get(header), secret)))
          return json({ error: "Invalid signature" }, 401);
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
        const r =
          RESIDENTS.find((x) => x.id === parsed.data.residentId) ??
          RESIDENTS.find((x) => x.profile.phone === parsed.data.from.replace(/^\+?1?/, ""));
        if (!r) return json({ error: "Sender is not an opted-in resident" }, 404);
        const classification = await classifyReply(parsed.data.text, r.language);
        await insertRow(
          "check_ins",
          {
            resident_id: r.id,
            incident_id: "INC-RICH-1107",
            channel: parsed.data.channel,
            direction: "inbound",
            reply: parsed.data.text,
            classification,
            idempotency_key: `in:${parsed.data.messageId}`,
          },
          "idempotency_key",
        );
        return json({ residentId: r.id, classification });
      },
    },
  },
});
