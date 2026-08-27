const pool = require("../config/db");

const mapRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    phone: r.phone,
    staffId: r.staff_id
  };

exports.findByEmail = async (email) => {
  const { rows } = await pool.query("select * from users where email = $1", [email]);
  return mapRow(rows[0]);
};

exports.findById = async (id) => {
  const { rows } = await pool.query("select * from users where id = $1", [id]);
  return mapRow(rows[0]);
};

exports.createCustomer = async ({ name, email, passwordHash, phone }) => {
  const { rows } = await pool.query(
    `insert into users (name, email, password_hash, role, phone)
     values ($1, $2, $3, 'customer', $4) returning *`,
    [name, email, passwordHash, phone || null]
  );
  return mapRow(rows[0]);
};
