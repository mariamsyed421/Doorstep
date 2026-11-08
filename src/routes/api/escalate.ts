import { createFileRoute } from "@tanstack/react-router";
import { RESIDENTS } from "@/lib/doorstep-data";
import { STAGES, allowed, type Stage } from "@/lib/doorstep/escalation";
import { json, parseBody } from "@/lib/doorstep/http.server";
import { messagingProvider } from "@/lib/doorstep/messaging/provider.server";
import { insertRow } from "@/lib/doorstep/persistence.server";
import { EscalateRequestSchema } from "@/lib/doorstep/schemas";

const seen = new Set<string>();

/**
 * POST /api/escalate — perform one escalation stage.
 * Stages 3–5 (third-party outreach, welfare checks) require explicit coordinator approval and
 * are only *recorded* here: Doorstep never auto-contacts third parties or dispatches responders.
 */
export const Route = createFileRoute("/api/escalate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await parseBody(request, EscalateRequestSchema);
        if ("error" in body) return body.error;
        const { residentId, idempotencyKey, coordinatorApproval } = body.data;
        const stage = body.data.stage as Stage;
        const r = RESIDENTS.find((x) => x.id === residentId);
        if (!r) return json({ error: "Unknown resident" }, 404);
        if (!allowed(r, stage))
          return json({ error: "Not permitted by resident consent / data on file" }, 403);
        const meta = STAGES[stage];
        if (meta.approval && !coordinatorApproval)
          return json({ error: "Coordinator approval required for this stage" }, 403);
        if (seen.has(idempotencyKey)) return json({ duplicate: true, stage, label: meta.label });
        seen.add(idempotencyKey);
        let delivery = null;
        if (stage === 1 || stage === 2)
          delivery = await messagingProvider().send({
            residentId,
            channel: stage === 2 ? "voice" : "sms",
            text:
              stage === 2
                ? "Automated welfare call: press 1 if safe, 2 if you need help."
                : "Checking again: reply 1 if safe, 2 if you need help.",
            idempotencyKey,
          });
        await insertRow(
          "escalation_events",
          {
            resident_id: residentId,
            incident_id: "INC-RICH-1107",
            stage,
            label: meta.label,
            approved_by: coordinatorApproval?.approvedBy ?? null,
            approved_at: coordinatorApproval?.approvedAt ?? null,
            idempotency_key: idempotencyKey,
            delivery_status: delivery?.status ?? "recorded",
          },
          "idempotency_key",
        );
        return json({
          duplicate: false,
          stage,
          label: meta.label,
          delivery,
          recordedOnly: meta.approval,
        });
      },
    },
  },
});
