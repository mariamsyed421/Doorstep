import { env } from "../env.server";
import type { DeliveryResult, MessagingProvider, OutboundMessage } from "./types";

/**
 * Photon adapter (server-only).
 *
 * UNVERIFIED: Photon's documentation could not be reached while this was built, so the
 * endpoint path, payload, and signature header are configuration, not assumptions baked into
 * code. Confirm them against Photon's docs and set:
 *   PHOTON_API_BASE_URL, PHOTON_API_KEY, PHOTON_SEND_PATH (default /messages),
 *   PHOTON_WEBHOOK_SECRET, PHOTON_SIGNATURE_HEADER (default x-photon-signature),
 *   PHOTON_DEMO_RECIPIENT — every synthetic resident's message is routed to this one
 *   verified, consenting test number. Without it, nothing is sent.
 */
export function createPhotonProvider(): MessagingProvider | null {
  const base = env("PHOTON_API_BASE_URL");
  const key = env("PHOTON_API_KEY");
  const recipient = env("PHOTON_DEMO_RECIPIENT");
  if (!base || !key || !recipient) return null;
  const path = env("PHOTON_SEND_PATH") ?? "/messages";
  return {
    name: "photon",
    async send(msg: OutboundMessage): Promise<DeliveryResult> {
      try {
        const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
            "idempotency-key": msg.idempotencyKey,
          },
          body: JSON.stringify({
            to: recipient,
            channel: msg.channel,
            text: `[Doorstep demo · resident ${msg.residentId}] ${msg.text}`,
            metadata: { residentId: msg.residentId, idempotencyKey: msg.idempotencyKey },
          }),
          signal: AbortSignal.timeout(8000),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
        if (!res.ok)
          return {
            provider: "photon",
            simulated: false,
            messageId: "",
            status: "failed",
            error: `HTTP ${res.status}`,
          };
        return {
          provider: "photon",
          simulated: false,
          messageId: data.id ?? data.messageId ?? msg.idempotencyKey,
          status: "queued",
        };
      } catch (e) {
        return {
          provider: "photon",
          simulated: false,
          messageId: "",
          status: "failed",
          error: e instanceof Error ? e.message : "send failed",
        };
      }
    },
  };
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256(rawBody, secret) as hex, accepting an optional "sha256=" prefix. */
export async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(rawBody)));
  return timingSafeEqual(
    sig,
    header
      .replace(/^sha256=/, "")
      .trim()
      .toLowerCase(),
  );
}

export function webhookConfig() {
  return {
    secret: env("PHOTON_WEBHOOK_SECRET"),
    header: env("PHOTON_SIGNATURE_HEADER") ?? "x-photon-signature",
  };
}
