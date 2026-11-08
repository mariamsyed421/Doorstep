import "dotenv/config"; // loads your keys from .env
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

// Connect to Photon
const app = await Spectrum({
  providers: [imessage.config()],
});

// Narrow the app to iMessage-specific features
const im = imessage(app);

// Look up the person by phone number (must be on your Photon Users page)
const resident = await im.user("+12142185559");

// Open a one-on-one conversation with them
const dm = await im.space.create(resident);

// Send the check-in
await dm.send("Doorstep check-in: Are you okay? Reply 1 Safe, 2 Need help.");

console.log("Sent!");
process.exit(0);