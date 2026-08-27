const { Pool } = require("pg");

// Exports the connection pool, or null if DATABASE_URL isn't set. server/data/*.js
// query Postgres directly (no in-memory fallback) — set DATABASE_URL before running.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

module.exports = pool;
