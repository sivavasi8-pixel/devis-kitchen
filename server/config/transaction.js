// Runs `fn(client)` inside a single PostgreSQL transaction. Every data-layer call
// that accepts an optional `db` argument can be handed this client so a multi-step
// write (e.g. "create order + deduct its ingredients") either fully happens or
// fully doesn't — never a saved order with stock left untouched, or vice versa.
const pool = require("./db");

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
