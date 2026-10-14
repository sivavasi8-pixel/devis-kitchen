const pool = require("../config/db");

const mapRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    phone: r.phone,
    staffId: r.staff_id,
    pinHash: r.pin_hash,
    pinResetRequestedAt: r.pin_reset_requested_at
  };

exports.findByEmail = async (email) => {
  const { rows } = await pool.query("select * from users where lower(email) = lower($1)", [email]);
  return mapRow(rows[0]);
};

exports.findById = async (id) => {
  const { rows } = await pool.query("select * from users where id = $1", [Number(id)]);
  return mapRow(rows[0]);
};

exports.createCustomer = async ({ name, email, passwordHash, phone, pinHash }) => {
  const { rows } = await pool.query(
    `insert into users (name, email, password_hash, role, phone, pin_hash)
     values ($1, $2, $3, 'customer', $4, $5) returning *`,
    [name, email, passwordHash, phone || null, pinHash || null]
  );
  return mapRow(rows[0]);
};

// Self-service: a logged-in user editing their own name/phone from My Account.
exports.updateProfile = async (id, { name, phone }) => {
  const { rows } = await pool.query("update users set name = $1, phone = $2 where id = $3 returning *", [
    name,
    phone,
    Number(id)
  ]);
  return mapRow(rows[0]);
};

// Password reset / change (self-service or admin-initiated).
exports.resetPassword = async (id, newPasswordHash) => {
  const { rows } = await pool.query("update users set password_hash = $1 where id = $2 returning *", [
    newPasswordHash,
    Number(id)
  ]);
  return mapRow(rows[0]);
};
exports.adminSetPassword = exports.resetPassword;

// Flag the account so admins can see it in the Customers page and reset the PIN.
exports.requestPinReset = async (id) => {
  const { rows } = await pool.query("update users set pin_reset_requested_at = now() where id = $1 returning *", [
    Number(id)
  ]);
  return mapRow(rows[0]);
};

// Set a new PIN (admin, or the customer from My Account) — clears the request flag in the same statement.
exports.adminSetPin = async (id, newPinHash) => {
  const { rows } = await pool.query(
    "update users set pin_hash = $1, pin_reset_requested_at = null where id = $2 returning *",
    [newPinHash, Number(id)]
  );
  return mapRow(rows[0]);
};

// All customer accounts — used by the admin Customers page.
exports.getAllCustomers = async () => {
  const { rows } = await pool.query("select * from users where role = 'customer' order by id asc");
  return rows.map(mapRow);
};
