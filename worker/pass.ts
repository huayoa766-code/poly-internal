/** Run a single alert pass and exit. Useful for testing: `npm run pass`. */
import "dotenv/config";
import { runAlertPass } from "../src/lib/alerts";

runAlertPass()
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
