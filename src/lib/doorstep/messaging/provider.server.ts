import { RESIDENTS } from "@/lib/doorstep-data";
import { createMockProvider } from "./mock";
import { createPhotonProvider } from "./photon.server";
import type { MessagingProvider } from "./types";

let mock: MessagingProvider | null = null;
/** Photon when fully configured (incl. a single demo recipient), otherwise the mock provider. */
export function messagingProvider(): MessagingProvider {
  const photon = createPhotonProvider();
  if (photon) return photon;
  mock ??= createMockProvider((id) => RESIDENTS.find((r) => r.id === id));
  return mock;
}
