const pool = require("../config/db");

const mapRow = (r) =>
  r && {
    id: r.id,
    customerName: r.customer_name,
    customerId: r.customer_id,
    items: r.items,
    total: Number(r.total),
    channel: r.channel,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    deliveryAddress: r.delivery_address,
    deliveryPhone: r.delivery_phone,
    riderId: r.rider_id,
    riderName: r.rider_name || undefined, // present only when joined
    tableNumber: r.table_number,
    // Friendly single-field summary of "where/when" for admin pages built
    // around the bakery's pickup-only model — dine-in shows the table,
    // delivery shows the address, pickup just says "Pickup".
    pickupTime: r.channel === "dine_in" ? `Table ${r.table_number || "—"}` : r.channel === "delivery" ? r.delivery_address || "Delivery" : "Pickup",
    createdAt: r.created_at
  };

const BASE_SELECT = `
  select o.*, s.name as rider_name
  from orders o
  left join staff s on s.id = o.rider_id
`;

exports.getAll = async () => {
  const { rows } = await pool.query(`${BASE_SELECT} order by o.created_at desc`);
  return rows.map(mapRow);
};

exports.getByCustomerId = async (customerId) => {
  const { rows } = await pool.query(`${BASE_SELECT} where o.customer_id = $1 order by o.created_at desc`, [customerId]);
  return rows.map(mapRow);
};

// Orders assigned to a given rider (staff.id), most relevant/active first.
exports.getByRiderId = async (riderId) => {
  const { rows } = await pool.query(
    `${BASE_SELECT} where o.rider_id = $1 order by
       case o.status when 'ready' then 0 when 'out_for_delivery' then 1 else 2 end,
       o.created_at desc`,
    [riderId]
  );
  return rows.map(mapRow);
};

// Orders ready for pickup/dispatch but not yet assigned a rider — the pool a rider
// (or owner/staff) can claim from.
exports.getUnassignedReady = async () => {
  const { rows } = await pool.query(
    `${BASE_SELECT} where o.status = 'ready' and o.channel in ('delivery', 'pickup') and o.rider_id is null
     order by o.created_at asc`
  );
  return rows.map(mapRow);
};

exports.getById = async (id) => {
  const { rows } = await pool.query(`${BASE_SELECT} where o.id = $1`, [id]);
  return mapRow(rows[0]);
};

exports.create = async ({
  customerName,
  customerId,
  items,
  total,
  channel,
  paymentMethod,
  paymentStatus,
  deliveryAddress,
  deliveryPhone,
  tableNumber
}) => {
  const { rows } = await pool.query(
    `insert into orders
       (customer_name, customer_id, items, total, channel, payment_method, payment_status,
        delivery_address, delivery_phone, table_number)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      customerName,
      customerId || null,
      JSON.stringify(items),
      total,
      channel,
      paymentMethod,
      paymentStatus,
      deliveryAddress || null,
      deliveryPhone || null,
      tableNumber || null
    ]
  );
  return exports.getById(rows[0].id);
};

exports.updateStatus = async (id, status) => {
  const { rows } = await pool.query("update orders set status = $1 where id = $2 returning id", [status, id]);
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.assignRider = async (id, riderId) => {
  const { rows } = await pool.query("update orders set rider_id = $1 where id = $2 returning id", [riderId, id]);
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.updatePaymentStatus = async (id, paymentStatus) => {
  const { rows } = await pool.query("update orders set payment_status = $1 where id = $2 returning id", [paymentStatus, id]);
  if (!rows[0]) return null;
  return exports.getById(id);
};
