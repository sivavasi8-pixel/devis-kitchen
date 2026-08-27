const materializer = require("./subscriptionMaterializer");

// Checked hourly rather than daily-at-midnight — cheap either way at this
// scale, and it means a Render free-tier instance that was asleep at
// midnight still catches the day's orders soon after it wakes up, instead of
// waiting a full 24h for the next scheduled run.
const RUN_INTERVAL_MS = 60 * 60 * 1000;

async function run() {
  try {
    await materializer.processDueSubscriptions();
  } catch (err) {
    console.error("[subscription scheduler] run failed:", err);
  }
}

exports.start = () => {
  run(); // once immediately — covers a day (or several, if the server was asleep) rolling over while nothing was running
  setInterval(run, RUN_INTERVAL_MS);
};
