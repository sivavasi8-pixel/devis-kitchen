// Small, idempotent schema updates applied at startup, so a deploy brings an
// existing database (e.g. your Neon instance) up to date without anyone pasting
// SQL by hand. Every statement must be safe to run again on every boot.
// New databases get the base tables from db/schema.sql.
const pool = require("../config/db");

const MIGRATIONS = [
  // Customer PIN — used for self-service password reset (email + PIN + new password).
  // Nullable so existing accounts aren't broken; set at signup going forward.
  "alter table users add column if not exists pin_hash text",
  // Flag set when a customer can't remember their PIN and asks an admin to reset it.
  // Cleared (along with pin_hash) when an admin resets the PIN from the Customers page.
  "alter table users add column if not exists pin_reset_requested_at timestamptz",
  // A customer's saved delivery addresses — like any ecommerce checkout's address
  // book. One is marked default (addresses data layer enforces only one per user);
  // lat/lng are set when the address came from "use my current location" or a
  // map pin rather than typed by hand. (Separate from the older, unused
  // `addresses` table in schema.sql, which has a different shape.)
  `create table if not exists customer_addresses (
     id serial primary key,
     user_id integer not null references users(id) on delete cascade,
     label text not null default 'Home',
     address text not null,
     phone text,
     lat numeric,
     lng numeric,
     is_default boolean not null default false,
     created_at timestamptz not null default now()
   )`,
  "create index if not exists idx_customer_addresses_user_id on customer_addresses(user_id)",
  // The precise coordinates when a delivery order was placed with "use my
  // current location" or a saved address that has them — lets staff and riders
  // open the exact drop point in Maps. Null for pickup/dine-in orders and for
  // addresses typed by hand that couldn't be geocoded.
  "alter table orders add column if not exists delivery_lat numeric",
  "alter table orders add column if not exists delivery_lng numeric",
  // When a rider took the order — claiming is an atomic "only if still
  // unclaimed" update (see data/orders.js claim()), so two riders racing for the
  // same order can't both win it.
  "alter table orders add column if not exists claimed_at timestamptz",
  // Owner/staff can flag a delivery as urgent — the rider screen sorts priority
  // orders to the top, ahead of plain distance-from-shop ordering.
  "alter table orders add column if not exists priority boolean not null default false",
  // A customer-uploaded screenshot of their UPI/bank payment confirmation —
  // owner/staff review it before marking the order paid. Nullable: cash orders
  // and in-store POS sales never have one.
  "alter table orders add column if not exists receipt_image bytea",
  "alter table orders add column if not exists receipt_mime text",
  "alter table orders add column if not exists receipt_uploaded_at timestamptz",
  // Small key/value store for shop-wide settings editable from the admin
  // Settings page (UPI VPA for the checkout QR, shop address/location) — kept
  // out of source code since it's real business info, not a code constant.
  `create table if not exists app_settings (
     key text primary key,
     value text,
     updated_at timestamptz not null default now()
   )`,
  // What an ingredient actually costs to buy — lets ingredient spend be computed
  // from real recipe-driven consumption instead of only hand-typed Expenses rows.
  // Nullable: existing ingredients just show no cost data until the owner fills it in.
  "alter table inventory add column if not exists cost_per_unit numeric",
  // Order-ahead scheduling and delivery zones: the booked day/slot (both null for an
  // "as soon as possible" order), and the delivery fee + zone label that were charged.
  "alter table orders add column if not exists scheduled_date date",
  "alter table orders add column if not exists scheduled_slot text",
  "alter table orders add column if not exists delivery_fee numeric",
  "alter table orders add column if not exists delivery_zone text",
  // A log of every quantity change, not just the live number itself — the live
  // "quantity" column answers "how much is left"; this answers "what happened
  // to it" (an order deducting it, an order being cancelled and giving it back,
  // or someone correcting/restocking it by hand).
  `create table if not exists inventory_movements (
     id serial primary key,
     inventory_id integer not null references inventory(id) on delete cascade,
     change numeric not null,
     reason text not null check (reason in ('order_deduct', 'order_restock', 'manual_set', 'manual_adjust')),
     reference text,
     created_at timestamptz not null default now()
   )`,
  "create index if not exists idx_inventory_movements_inventory_id on inventory_movements(inventory_id, created_at desc)"
];

async function migrate() {
  if (!pool) return;
  for (const sql of MIGRATIONS) await pool.query(sql);
}

module.exports = { migrate };
