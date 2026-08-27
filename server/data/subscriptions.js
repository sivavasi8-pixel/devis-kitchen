const pool = require("../config/db");

const mapRow = (r) =>
  r && {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name || undefined, // present only when joined
    customerEmail: r.customer_email || undefined,
    planId: r.plan_id,
    planName: r.plan_name || undefined, // present only when joined
    channel: r.channel,
    deliveryAddress: r.delivery_address,
    deliveryPhone: r.delivery_phone,
    status: r.status,
    cycleStartDate: r.cycle_start_date,
    cycleDays: r.cycle_days,
    selections: r.selections,
    foodSubtotal: Number(r.food_subtotal),
    discountPercent: Number(r.discount_percent),
    deliveryFeeTotal: Number(r.delivery_fee_total),
    totalAmount: Number(r.total_amount),
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    createdAt: r.created_at
  };

const BASE_SELECT = `
  select s.*, p.name as plan_name, u.name as customer_name, u.email as customer_email
  from subscriptions s
  join subscription_plans p on p.id = s.plan_id
  join users u on u.id = s.customer_id
`;

exports.create = async ({
  customerId,
  planId,
  channel,
  deliveryAddress,
  deliveryPhone,
  cycleStartDate,
  cycleDays,
  selections,
  foodSubtotal,
  discountPercent,
  deliveryFeeTotal,
  totalAmount,
  paymentMethod,
  paymentStatus
}) => {
  const { rows } = await pool.query(
    `insert into subscriptions
       (customer_id, plan_id, channel, delivery_address, delivery_phone, cycle_start_date, cycle_days,
        selections, food_subtotal, discount_percent, delivery_fee_total, total_amount, payment_method, payment_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     returning id`,
    [
      customerId,
      planId,
      channel,
      deliveryAddress || null,
      deliveryPhone || null,
      cycleStartDate,
      cycleDays,
      JSON.stringify(selections),
      foodSubtotal,
      discountPercent,
      deliveryFeeTotal,
      totalAmount,
      paymentMethod,
      paymentStatus
    ]
  );
  return exports.getById(rows[0].id);
};

exports.getById = async (id) => {
  const { rows } = await pool.query(`${BASE_SELECT} where s.id = $1`, [id]);
  return mapRow(rows[0]);
};

exports.getByCustomerId = async (customerId) => {
  const { rows } = await pool.query(`${BASE_SELECT} where s.customer_id = $1 order by s.created_at desc`, [customerId]);
  return rows.map(mapRow);
};

exports.getAll = async () => {
  const { rows } = await pool.query(`${BASE_SELECT} order by s.created_at desc`);
  return rows.map(mapRow);
};

exports.updateStatus = async (id, status) => {
  const { rows } = await pool.query("update subscriptions set status = $1 where id = $2 returning id", [status, id]);
  if (!rows[0]) return null;
  return exports.getById(id);
};

exports.updatePaymentStatus = async (id, paymentStatus) => {
  const { rows } = await pool.query("update subscriptions set payment_status = $1 where id = $2 returning id", [paymentStatus, id]);
  if (!rows[0]) return null;
  return exports.getById(id);
};
