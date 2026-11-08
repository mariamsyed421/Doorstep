import { createFileRoute } from "@tanstack/react-router";
import { RESIDENTS } from "@/lib/doorstep-data";
import { checkInTemplate } from "@/lib/doorstep/ai/rules";
import { draftCheckIn } from "@/lib/doorstep/ai/service.server";
import { json, parseBody } from "@/lib/doorstep/http.server";
import { messagingProvider } from "@/lib/doorstep/messaging/provider.server";
import { insertRow } from "@/lib/doorstep/persistence.server";
import { CheckInRequestSchema } from "@/lib/doorstep/schemas";

/** POST /api/checkin — send a check-in (stage 0/1 text, stage 2 voice) respecting consent. */
export const Route = createFileRoute("/api/checkin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await parseBody(request, CheckInRequestSchema);
        if ("error" in body) return body.error;
        const { residentId, channel, stage } = body.data;
        const r = RESIDENTS.find((x) => x.id === residentId);
        if (!r) return json({ error: "Unknown resident" }, 404);
        const c = r.profile.consent;
        if ((channel === "sms" && !c.automatedMessages) || (channel === "voice" && !c.voiceCalls))
          return json({ error: "Resident has not consented to this channel" }, 403);
        const text =
          channel === "voice"
            ? `Automated call in ${r.language}: press 1 if you are safe, 2 if you need help.`
            : stage === 2
              ? checkInTemplate(r, 1)
              : (await draftCheckIn(r.language, stage === 1 ? 1 : 0, r.shortName)).message;
        const idempotencyKey = `${residentId}:stage-${stage}:${channel}`;
        const delivery = await messagingProvider().send({
          residentId,
          channel,
          text,
          idempotencyKey,
        });
        await insertRow(
          "check_ins",
          {
            resident_id: residentId,
            incident_id: "INC-RICH-1107",
            channel,
            stage,
            message: text,
            delivery_status: delivery.status,
            provider: delivery.provider,
            idempotency_key: idempotencyKey,
          },
          "idempotency_key",
        );
        return json({ text, delivery });
      },
    },
  },
});
