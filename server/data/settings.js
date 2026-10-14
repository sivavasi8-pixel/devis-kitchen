// Shop-wide settings, backed by PostgreSQL — a small key/value store so new
// settings don't need a schema change each time (see server/db/migrate.js).
const pool = require("../config/db");

module.exports = {
  getAll: async () => {
    const { rows } = await pool.query("select key, value from app_settings");
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return map;
  },
  set: async (key, value) => {
    await pool.query(
      `insert into app_settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value]
    );
  }
};
