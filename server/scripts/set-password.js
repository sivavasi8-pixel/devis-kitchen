// Set a new password for any account, straight in the database.
//
// Still useful for:
//   - Owner/staff accounts (they have no PIN, so the admin Customers page can't help them)
//   - True break-glass scenarios where the admin UI itself is unreachable
//
// For day-to-day customer password resets, use the Customers page in the admin console.
//
//   cd server
//   node scripts/set-password.js owner@devis.test 'a-new-long-password'
//
// Needs DATABASE_URL (from server/.env locally, or paste your Neon connection
// string into the environment). Use it to replace the demo passwords that are
// published in this repo — the live site refuses those in production.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: node scripts/set-password.js <email> <new-password>");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Please use at least 10 characters.");
    process.exit(1);
  }
  if (!pool) {
    console.error("DATABASE_URL isn't set — add it to server/.env first.");
    process.exit(1);
  }
  const { rowCount } = await pool.query("update users set password_hash = $1 where lower(email) = lower($2)", [
    bcrypt.hashSync(password, 10),
    email
  ]);
  console.log(rowCount ? `Password updated for ${email}.` : `No account found for ${email}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
