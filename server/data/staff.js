const pool = require("../config/db");
const bcrypt = require("bcryptjs");

const mapRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    role: r.role,
    shift: r.shift,
    status: r.status,
    isRider: r.is_rider
  };

exports.getAll = async () => {
  const { rows } = await pool.query("select * from staff order by id");
  return rows.map(mapRow);
};

exports.getRiders = async () => {
  const { rows } = await pool.query("select * from staff where is_rider = true order by name");
  return rows.map(mapRow);
};

// Roster entry, optionally with a login (email + password) in the same call.
exports.create = async ({ name, role, shift, isRider, email, password }) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `insert into staff (name, role, shift, is_rider) values ($1, $2, $3, $4) returning *`,
      [name, role, shift, !!isRider]
    );
    const staffRow = rows[0];

    if (email && password) {
      const userRole = isRider ? "rider" : "staff";
      await client.query(
        `insert into users (name, email, password_hash, role, staff_id) values ($1, $2, $3, $4, $5)`,
        [name, email, bcrypt.hashSync(password, 10), userRole, staffRow.id]
      );
    }
    await client.query("commit");
    return mapRow(staffRow);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
};

exports.remove = async (id) => {
  // Deleting a roster entry cascades to their login too (no FK cascade here since
  // users.staff_id isn't a hard FK — done explicitly in one transaction instead).
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from users where staff_id = $1", [id]);
    await client.query("delete from staff where id = $1", [id]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
};

exports.updateStatus = async (id, status) => {
  const { rows } = await pool.query("update staff set status = $1 where id = $2 returning *", [status, id]);
  return mapRow(rows[0]);
};

exports.updateShift = async (id, shift) => {
  const { rows } = await pool.query("update staff set shift = $1 where id = $2 returning *", [shift, id]);
  return mapRow(rows[0]);
};

// Tasks -----------------------------------------------------------------

exports.getTasks = async () => {
  const { rows } = await pool.query("select * from staff_tasks order by id");
  return rows.map((r) => ({ id: r.id, description: r.description, assignedTo: r.assigned_to, due: r.due, done: r.done }));
};

exports.createTask = async ({ description, assignedTo, due }) => {
  const { rows } = await pool.query(
    `insert into staff_tasks (description, assigned_to, due) values ($1, $2, $3) returning *`,
    [description, assignedTo, due]
  );
  const r = rows[0];
  return { id: r.id, description: r.description, assignedTo: r.assigned_to, due: r.due, done: r.done };
};

exports.updateTask = async (id, fields) => {
  const setClauses = [];
  const values = [];
  let i = 1;
  const map = { description: "description", assignedTo: "assigned_to", due: "due", done: "done" };
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) return null;
  values.push(id);
  const { rows } = await pool.query(`update staff_tasks set ${setClauses.join(", ")} where id = $${i} returning *`, values);
  const r = rows[0];
  return r && { id: r.id, description: r.description, assignedTo: r.assigned_to, due: r.due, done: r.done };
};

exports.removeTask = async (id) => {
  await pool.query("delete from staff_tasks where id = $1", [id]);
};
