import type { Channel } from "@/lib/doorstep-data";

export interface OutboundMessage {
  residentId: string;
  channel: Channel;
  text: string;
  idempotencyKey: string;
}

export interface DeliveryResult {
  provider: "mock" | "photon";
  simulated: boolean;
  messageId: string;
  status: "queued" | "delivered" | "failed";
  error?: string;
}

export interface MessagingProvider {
  name: "mock" | "photon";
  send(msg: OutboundMessage): Promise<DeliveryResult>;
}
