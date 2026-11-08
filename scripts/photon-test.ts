import "dotenv/config"; // loads your keys from .env
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

// Connect to Photon using SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET from .env
const app = await Spectrum({
  providers: [imessage.config()],
});

console.log("Photon test bot is listening...");

// Wait for incoming messages and reply to each one
for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    console.log(`Got: ${message.content.text} from ${message.sender?.id}`);
    await space.send("Doorstep test: got your message!");
  }
}