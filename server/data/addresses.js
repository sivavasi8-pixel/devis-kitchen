// A customer's saved delivery addresses, backed by PostgreSQL.
const pool = require("../config/db");

const mapRow = (row) =>
  row && {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    address: row.address,
    phone: row.phone,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    isDefault: row.is_default,
    createdAt: row.created_at
  };

module.exports = {
  getByUserId: async (userId) => {
    const { rows } = await pool.query(
      "select * from customer_addresses where user_id = $1 order by is_default desc, id asc",
      [Number(userId)]
    );
    return rows.map(mapRow);
  },
  getById: async (id) => {
    const { rows } = await pool.query("select * from customer_addresses where id = $1", [Number(id)]);
    return mapRow(rows[0]);
  },
  // The first address a customer ever saves becomes their default automatically —
  // nobody should have to remember to flip the toggle once that moment passes.
  create: async ({ userId, label, address, phone, lat, lng, isDefault }) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows: existing } = await client.query(
        "select count(*)::int as count from customer_addresses where user_id = $1",
        [Number(userId)]
      );
      const makeDefault = Boolean(isDefault) || existing[0].count === 0;
      if (makeDefault) {
        await client.query("update customer_addresses set is_default = false where user_id = $1", [Number(userId)]);
      }
      const { rows } = await client.query(
        `insert into customer_addresses (user_id, label, address, phone, lat, lng, is_default)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [Number(userId), label || "Home", address, phone || null, lat ?? null, lng ?? null, makeDefault]
      );
      await client.query("commit");
      return mapRow(rows[0]);
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  },
  // Partial update — only fields actually passed are touched.
  update: async (id, userId, fields) => {
    const sets = [];
    const values = [];
    let i = 1;
    for (const [col, key] of [
      ["label", "label"],
      ["address", "address"],
      ["phone", "phone"],
      ["lat", "lat"],
      ["lng", "lng"]
    ]) {
      if (fields[key] !== undefined) {
        sets.push(`${col} = $${i++}`);
        values.push(fields[key]);
      }
    }
    if (sets.length === 0) return module.exports.getById(id);
    values.push(Number(id), Number(userId));
    const { rows } = await pool.query(
      `update customer_addresses set ${sets.join(", ")} where id = $${i++} and user_id = $${i} returning *`,
      values
    );
    return mapRow(rows[0]);
  },
  remove: async (id, userId) => {
    await pool.query("delete from customer_addresses where id = $1 and user_id = $2", [Number(id), Number(userId)]);
  },
  // Exactly one default per customer — unset every other row first, in the
  // same transaction, so a crash can't leave two (or zero) defaults.
  setDefault: async (id, userId) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("update customer_addresses set is_default = false where user_id = $1", [Number(userId)]);
      const { rows } = await client.query(
        "update customer_addresses set is_default = true where id = $1 and user_id = $2 returning *",
        [Number(id), Number(userId)]
      );
      await client.query("commit");
      return mapRow(rows[0]);
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
};
