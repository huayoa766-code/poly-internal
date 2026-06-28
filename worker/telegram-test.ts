import "dotenv/config";
import { sendTelegram, telegramConfigured } from "../src/lib/telegram";

async function main() {
  console.log("telegram configured:", telegramConfigured());
  await sendTelegram("✅ <b>Poly Tracker</b> connected. Alerts will arrive here.");
  console.log("sent (or dry-run printed above)");
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
