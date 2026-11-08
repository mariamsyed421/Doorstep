import { Spectrum, type SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { RESIDENTS } from "@/lib/doorstep-data";
import { classifyReply } from "../ai/service.server";
import { env } from "../env.server";
import { insertRow } from "../persistence.server";
import type { DeliveryResult, MessagingProvider, OutboundMessage } from "./types";

let appPromise: Promise<SpectrumInstance | null> | null = null;
let listenerStarted = false;

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

function demoRecipient() {
  const recipient = env("PHOTON_DEMO_RECIPIENT");
  return recipient?.trim() || null;
}

function linkedResident(recipient: string) {
  const normalized = normalizePhone(recipient);
  return RESIDENTS.find((resident) => normalizePhone(resident.profile.phone) === normalized);
}

export function photonDemoResidentId() {
  const recipient = demoRecipient();
  return recipient ? linkedResident(recipient)?.id : undefined;
}

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const projectId = env("SPECTRUM_PROJECT_ID");
      const projectSecret = env("SPECTRUM_PROJECT_SECRET");
      if (!projectId || !projectSecret) {
        console.log("[photon] Spectrum credentials are not configured");
        return null;
      }
      try {
        const configureIMessage = imessage.config as unknown as () => ReturnType<
          typeof imessage.config
        >;
        return await Spectrum({
          projectId,
          projectSecret,
          providers: [configureIMessage()],
        } as unknown as Parameters<typeof Spectrum>[0]);
      } catch (error) {
        console.log(
          "[photon] Spectrum initialization failed:",
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    })();
  }
  return appPromise;
}

function startListener(app: SpectrumInstance, recipient: string) {
  if (listenerStarted) return;
  listenerStarted = true;
  void (async () => {
    try {
      for await (const [space, message] of app.messages) {
        if (message.content.type !== "text") continue;
        if (normalizePhone(message.sender?.id ?? "") !== normalizePhone(recipient)) continue;
        const resident = linkedResident(recipient);
        if (!resident) {
          console.log(`[photon] received from ${recipient}, but no resident is linked`);
          continue;
        }
        console.log(`[photon] received text for resident ${resident.id}`);
        await processInboundReply(recipient, message.content.text, `photon:${Date.now()}`);
        void space;
      }
    } catch (error) {
      console.log("[photon] listener failed:", error instanceof Error ? error.message : error);
    }
  })();
}

function startConfiguredListener() {
  const recipient = demoRecipient();
  if (!recipient || !env("SPECTRUM_PROJECT_ID") || !env("SPECTRUM_PROJECT_SECRET")) return;
  void getApp().then((app) => {
    if (app) startListener(app, recipient);
  });
}

export async function processInboundReply(from: string, text: string, messageId: string) {
  const resident = linkedResident(from);
  if (!resident) throw new Error("No resident linked to Photon demo recipient");
  const classification = await classifyReply(text, resident.language);
  await insertRow(
    "check_ins",
    {
      resident_id: resident.id,
      incident_id: "INC-RICH-1107",
      channel: "sms",
      direction: "inbound",
      reply: text,
      classification,
      idempotency_key: `in:${messageId}`,
    },
    "idempotency_key",
  );
  return { residentId: resident.id, classification };
}

export function createPhotonProvider(): MessagingProvider | null {
  const recipient = demoRecipient();
  if (!recipient || !env("SPECTRUM_PROJECT_ID") || !env("SPECTRUM_PROJECT_SECRET")) {
    return null;
  }
  startConfiguredListener();
  return {
    name: "photon",
    async send(msg: OutboundMessage): Promise<DeliveryResult> {
      const resident = RESIDENTS.find((item) => item.id === msg.residentId);
      if (!resident || linkedResident(recipient)?.id !== resident.id) {
        return {
          provider: "photon",
          simulated: false,
          messageId: "",
          status: "failed",
          error: "Resident is not linked to PHOTON_DEMO_RECIPIENT",
        };
      }

      startConfiguredListener();
      try {
        const app = await getApp();
        if (!app) throw new Error("Spectrum is unavailable");
        startListener(app, recipient);
        const im = imessage(app);
        const user = await im.user(recipient);
        const dm = await im.space.create(user);
        await dm.send(msg.text);
        console.log(`[photon] sent to ${recipient} for resident ${msg.residentId}`);
        return {
          provider: "photon",
          simulated: false,
          messageId: msg.idempotencyKey,
          status: "queued",
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "send failed";
        console.log(`[photon] send failed for resident ${msg.residentId}: ${reason}`);
        return {
          provider: "photon",
          simulated: false,
          messageId: "",
          status: "failed",
          error: reason,
        };
      }
    },
  };
}
