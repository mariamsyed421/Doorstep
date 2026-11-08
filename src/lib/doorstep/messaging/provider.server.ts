import { RESIDENTS } from "@/lib/doorstep-data";
import { createMockProvider } from "./mock";
import { createPhotonProvider } from "./photon.server";
import type { MessagingProvider } from "./types";

let mock: MessagingProvider | null = null;
/** Photon when fully configured (incl. a single demo recipient), otherwise the mock provider. */
export function messagingProvider(): MessagingProvider {
  const photon = createPhotonProvider();
  mock ??= createMockProvider((id) => RESIDENTS.find((r) => r.id === id));
  if (photon)
    return {
      name: "photon",
      async send(message) {
        const result = await photon.send(message);
        if (result.status !== "failed") return result;
        console.log(`[photon] falling back to mock: ${result.error ?? "unknown error"}`);
        return mock!.send(message);
      },
    };
  return mock;
}
