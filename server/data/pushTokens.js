const pool = require("../config/db");

// Upsert on token, not (user_id, token) — the same device token moving to a
// different logged-in user (e.g. a shared POS tablet logging out of one
// staff account into another) should re-point to the new user, not create a
// stale duplicate row still pointing at the old one.
exports.register = async (userId, token) => {
  await pool.query(
    `insert into push_tokens (user_id, token) values ($1, $2)
     on conflict (token) do update set user_id = excluded.user_id`,
    [userId, token]
  );
};

exports.unregister = async (token) => {
  await pool.query("delete from push_tokens where token = $1", [token]);
};

// One row per device — a user with several logged-in devices gets several
// tokens back here, and every caller sends to all of them.
exports.getTokensForUsers = async (userIds) => {
  if (!userIds || userIds.length === 0) return [];
  const { rows } = await pool.query("select token from push_tokens where user_id = any($1::int[])", [userIds]);
  return rows.map((r) => r.token);
};

exports.getTokensForRole = async (role) => {
  const { rows } = await pool.query(
    `select pt.token from push_tokens pt join users u on u.id = pt.user_id where u.role = $1`,
    [role]
  );
  return rows.map((r) => r.token);
};

exports.getTokensForRoles = async (roles) => {
  const { rows } = await pool.query(
    `select pt.token from push_tokens pt join users u on u.id = pt.user_id where u.role = any($1::text[])`,
    [roles]
  );
  return rows.map((r) => r.token);
};

// Same broadcast as getTokensForRoles, minus one user — for a staff member
// ringing up their own POS sale, who doesn't need a "new order" push about
// the order they themselves just rang up.
exports.getTokensForRolesExcludingUser = async (roles, excludeUserId) => {
  const { rows } = await pool.query(
    `select pt.token from push_tokens pt join users u on u.id = pt.user_id
     where u.role = any($1::text[]) and u.id != $2`,
    [roles, excludeUserId]
  );
  return rows.map((r) => r.token);
};

// A rider is addressed by staff.id everywhere in the orders flow (rider_id
// on the orders table), but push tokens are keyed by the users table — this
// bridges the two the same way requireAuth's staffId already does.
exports.getTokensForStaffId = async (staffId) => {
  const { rows } = await pool.query(
    `select pt.token from push_tokens pt join users u on u.id = pt.user_id where u.staff_id = $1`,
    [staffId]
  );
  return rows.map((r) => r.token);
};

// Firebase reports a token as no-longer-valid rather than erroring the whole
// send — this is how those get cleaned out of the table instead of piling up
// forever and slowing every future send down.
exports.removeTokens = async (tokens) => {
  if (!tokens || tokens.length === 0) return;
  await pool.query("delete from push_tokens where token = any($1::text[])", [tokens]);
};
