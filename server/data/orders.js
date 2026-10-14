const pool = require("../config/db");

// Every column except the receipt image itself (up to 5MB) — list queries that
// pulled in `select *` would otherwise drag every unpaid order's receipt photo
// along on every admin board load and every 30s notification poll. A one-off
// lookup of the actual bytes goes through getReceiptImage() instead, same
// pattern as menu photos (data/menuItems.js).
const COLS = `o.id, o.customer_name, o.customer_id, o.items, o.total, o.channel, o.status, o.payment_method,
  o.payment_status, o.delivery_address, o.delivery_phone, o.rider_id, o.table_number, o.subscription_id, o.created_at,
  o.delivery_lat, o.delivery_lng, o.scheduled_date, o.scheduled_slot, o.delivery_fee, o.delivery_zone, o.claimed_at, o.priority, o.receipt_mime, o.receipt_uploaded_at,
  (o.receipt_image is not null) as has_receipt`;

const BASE_SELECT = `
  select ${COLS}, s.name as rider_name
  from orders o
  left join staff s on s.id = o.rider_id
`;

const toYmd = (d) =>
  d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : String(d).slice(0, 10);

const num = (v) => (v === null || v === undefined ? null : Number(v));

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
    deliveryLat: num(r.delivery_lat),
    deliveryLng: num(r.delivery_lng),
    // pg returns a `date` as a Date at local midnight; send it back as plain YYYY-MM-DD.
    scheduledDate: r.scheduled_date ? toYmd(r.scheduled_date) : null,
    scheduledSlot: r.scheduled_slot ?? null,
    deliveryFee: num(r.delivery_fee),
    deliveryZone: r.delivery_zone ?? null,
    riderId: r.rider_id,
    riderName: r.rider_name || undefined, // present only when joined
    claimedAt: r.claimed_at ?? null,
    priority: r.priority ?? false,
    hasReceipt: r.has_receipt ?? false,
    receiptUploadedAt: r.receipt_uploaded_at ?? null,
    tableNumber: r.table_number,
    subscriptionId: r.subscription_id, // set only for an order the subscription scheduler auto-generated
    // Friendly single-field summary of "where/when" — dine-in shows the table,
    // delivery shows the address, pickup just says "Pickup".
    pickupTime: r.channel === "dine_in" ? `Table ${r.table_number || "—"}` : r.channel === "delivery" ? r.delivery_address || "Delivery" : "Pickup",
    createdAt: r.created_at
  };

exports.getAll = async () => {
  const { rows } = await pool.query(`${BASE_SELECT} order by o.created_at desc`);
  return rows.map(mapRow);
};

// Leaner alternatives to getAll() for the dashboard, which doesn't need the
// full order history just to count a few in-progress orders.
exports.getRecent = async (limit = 5) => {
  const { rows } = await pool.query(`${BASE_SELECT} order by o.created_at desc limit $1`, [limit]);
  return rows.map(mapRow);
};

const ACTIVE = "o.status not in ('delivered', 'picked_up', 'cancelled')";

exports.getActive = async () => {
  const { rows } = await pool.query(`${BASE_SELECT} where ${ACTIVE} order by o.created_at desc`);
  return rows.map(mapRow);
};

exports.countActive = async () => {
  const { rows } = await pool.query(`select count(*)::int as count from orders o where ${ACTIVE}`);
  return rows[0].count;
};

// Not-yet-paid orders that haven't been cancelled: how many, and how much.
exports.unpaidTotals = async () => {
  const { rows } = await pool.query(
    "select count(*)::int as count, coalesce(sum(total), 0) as total from orders where payment_status <> 'paid' and status <> 'cancelled'"
  );
  return { count: rows[0].count, total: Number(rows[0].total) };
};

// Only orders created "today" in India time — Neon runs on UTC, which would put
// 12:00–5:30 AM IST orders on the wrong day.
exports.getToday = async () => {
  const { rows } = await pool.query(
    `${BASE_SELECT}
     where (o.created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
     order by o.created_at desc`
  );
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

// `forUpdate` locks the row for the rest of the caller's transaction, so two
// simultaneous cancel/status requests can't both act on the same old state.
// (Locks only the orders row — `of o` — since the staff join is read-only.)
exports.getById = async (id, db = pool, { forUpdate = false } = {}) => {
  const { rows } = await db.query(`${BASE_SELECT} where o.id = $1${forUpdate ? " for update of o" : ""}`, [Number(id)]);
  return mapRow(rows[0]);
};

exports.create = async (
  {
    customerName,
    customerId,
    items,
    total,
    channel,
    paymentMethod,
    paymentStatus,
    deliveryAddress,
    deliveryPhone,
    deliveryLat,
    deliveryLng,
    scheduledDate,
    scheduledSlot,
    deliveryFee,
    deliveryZone,
    tableNumber,
    subscriptionId
  },
  db = pool
) => {
  const { rows } = await db.query(
    `insert into orders
       (customer_name, customer_id, items, total, channel, payment_method, payment_status,
        delivery_address, delivery_phone, delivery_lat, delivery_lng, table_number, subscription_id,
        scheduled_date, scheduled_slot, delivery_fee, delivery_zone)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     returning id`,
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
      deliveryLat === undefined ? null : deliveryLat,
      deliveryLng === undefined ? null : deliveryLng,
      tableNumber || null,
      subscriptionId || null,
      scheduledDate || null,
      scheduledSlot || null,
      deliveryFee === undefined ? null : deliveryFee,
      deliveryZone || null
    ]
  );
  return exports.getById(rows[0].id, db);
};

exports.updateStatus = async (id, status, db = pool) => {
  const { rows } = await db.query("update orders set status = $1 where id = $2 returning id", [status, Number(id)]);
  if (!rows[0]) return null;
  return exports.getById(id, db);
};

// Owner/staff assignment — also clears any earlier claim timestamp when
// reassigning, and stamps one when a rider is set.
exports.assignRider = async (id, riderId) => {
  const { rows } = await pool.query(
    "update orders set rider_id = $1, claimed_at = case when $1::int is null then null else now() end where id = $2 returning id",
    [riderId, Number(id)]
  );
  if (!rows[0]) return null;
  return exports.getById(id);
};

// Atomic "only if still unclaimed" update — the WHERE clause is what makes two
// riders racing for the same order safe: whichever request's UPDATE actually
// matches a row wins (returns it), the loser matches zero rows (returns null).
exports.claim = async (id, riderId) => {
  const { rows } = await pool.query(
    `update orders set rider_id = $1, claimed_at = now()
     where id = $2 and status = 'ready' and channel in ('delivery', 'pickup') and rider_id is null
     returning id`,
    [Number(riderId), Number(id)]
  );
  if (!rows[0]) return null;
  return exports.getById(id);
};

// Backing out of a pickup — only the rider who holds it can release it, and
// only before it has left the shop; the order is immediately claimable again.
exports.release = async (id, riderId) => {
  const { rows } = await pool.query(
    `update orders set rider_id = null, claimed_at = null
     where id = $1 and rider_id = $2 and status = 'ready' returning id`,
    [Number(id), Number(riderId)]
  );
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.updatePaymentStatus = async (id, paymentStatus) => {
  const { rows } = await pool.query("update orders set payment_status = $1 where id = $2 returning id", [
    paymentStatus,
    Number(id)
  ]);
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.updatePriority = async (id, priority) => {
  const { rows } = await pool.query("update orders set priority = $1 where id = $2 returning id", [
    Boolean(priority),
    Number(id)
  ]);
  if (!rows[0]) return null;
  return exports.getById(id);
};

// Customer-uploaded payment receipt (screenshot of a UPI/bank confirmation) —
// owner/staff review it before marking the order paid, same "Mark paid" action
// as today, just now potentially informed by a receipt rather than blind trust.
exports.setReceipt = async (id, data, mime) => {
  const { rows } = await pool.query(
    `update orders set receipt_image = $1, receipt_mime = $2, receipt_uploaded_at = now()
     where id = $3 returning id`,
    [data, mime, Number(id)]
  );
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.getReceiptImage = async (id) => {
  const { rows } = await pool.query("select receipt_image, receipt_mime from orders where id = $1", [Number(id)]);
  const row = rows[0];
  if (!row || !row.receipt_image) return null;
  return { data: row.receipt_image, mime: row.receipt_mime };
};
