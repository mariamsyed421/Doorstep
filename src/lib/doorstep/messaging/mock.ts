import type { Resident } from "@/lib/doorstep-data";
import type { DeliveryResult, MessagingProvider, OutboundMessage } from "./types";

/**
 * Deterministic delivery outcome for the synthetic scenario: households in the degraded
 * cell-coverage pocket fail delivery once the communications outage is active.
 */
export function mockDeliveryOutcome(
  r: Resident,
  commsOutageActive: boolean,
): "delivered" | "failed" {
  return r.profile.commsZone === "degraded" && commsOutageActive ? "failed" : "delivered";
}

/** Mock provider: sends nothing, records everything. The default for the demo. */
export function createMockProvider(
  lookup: (id: string) => Resident | undefined,
  commsOutageActive = true,
): MessagingProvider {
  const seen = new Map<string, DeliveryResult>();
  return {
    name: "mock",
    async send(msg: OutboundMessage) {
      const prior = seen.get(msg.idempotencyKey);
      if (prior) return prior;
      const r = lookup(msg.residentId);
      const status = r ? mockDeliveryOutcome(r, commsOutageActive) : "failed";
      const result: DeliveryResult = {
        provider: "mock",
        simulated: true,
        messageId: `mock-${msg.idempotencyKey}`,
        status,
        ...(status === "failed"
          ? { error: r ? "Simulated carrier failure" : "Unknown resident" }
          : {}),
      };
      seen.set(msg.idempotencyKey, result);
      return result;
    },
  };
}
