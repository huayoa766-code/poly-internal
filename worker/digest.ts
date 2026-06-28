/** Send the daily digest once and exit. Run on a daily schedule. */
import "dotenv/config";
import { sendDailyDigest } from "../src/lib/alerts";

sendDailyDigest()
  .then(() => {
    console.log("digest sent");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
