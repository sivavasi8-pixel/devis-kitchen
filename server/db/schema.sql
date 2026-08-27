-- Devi's Kitchen — schema + seed data
-- Single restaurant. Roles: owner, staff (kitchen/cashier), rider, customer.
--
-- Run once against your database:
-- psql "$DATABASE_URL" -f server/db/schema.sql
-- (or paste into Neon's SQL Editor)

create table if not exists users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'staff', 'rider', 'customer')),
  phone text,
  staff_id integer -- links a staff/rider-role account to a row in staff.id, if any
);

-- One row per logged-in device that's opted into push notifications (see
-- server/services/push.js). A user can have several rows (phone + tablet, etc.)
-- — unlike a single fcmToken column, this doesn't silently drop a device when
-- another one enables notifications.
create table if not exists push_tokens (
  id serial primary key,
  user_id integer not null references users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user_id on push_tokens(user_id);

create table if not exists staff (
  id serial primary key,
  name text not null,
  role text not null,              -- 'Chef', 'Cashier', 'Kitchen Helper', 'Delivery Rider', 'Owner', ...
  shift text not null,
  status text not null default 'clocked_out', -- clocked_in | clocked_out | on_break | absent
  is_rider boolean not null default false      -- true for delivery riders (drives rider-assignment queries)
);

create table if not exists staff_tasks (
  id serial primary key,
  description text not null,
  assigned_to text not null,
  due text not null,
  done boolean not null default false
);

create table if not exists menu_items (
  id serial primary key,
  name text not null,
  category text not null,          -- 'starters', 'mains', 'breads', 'desserts', 'beverages', ...
  price numeric, -- null means "made to order" — priced dynamically by the customer (e.g. biryani by the kg)
  unit text not null default 'plate',
  in_stock boolean not null default true,
  description text,
  image_data bytea,
  image_mime text,
  is_veg boolean not null default true,
  spice_level text,                -- 'mild' | 'medium' | 'hot', nullable
  is_special boolean not null default false,
  special_until timestamptz,
  is_popular boolean not null default false,
  prep_minutes integer -- null/0 means "ready now"; a number means "~N min" before it's ready
);

create table if not exists menu_item_images (
  id serial primary key,
  menu_item_id integer not null references menu_items(id) on delete cascade,
  image_data bytea not null,
  image_mime text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_menu_item_images_menu_item_id on menu_item_images(menu_item_id);

create table if not exists inventory (
  id serial primary key,
  name text not null,
  unit text not null,
  quantity numeric not null default 0,
  reorder_level numeric not null default 0,
  supplier text
);

create table if not exists recipe_ingredients (
  id serial primary key,
  menu_item_id integer not null references menu_items(id) on delete cascade,
  inventory_id integer not null references inventory(id) on delete cascade,
  qty_per_unit numeric not null,
  unique (menu_item_id, inventory_id)
);

-- A customer's saved delivery addresses (optional convenience; orders also store
-- a snapshot address so editing/deleting a saved address never changes past orders).
create table if not exists addresses (
  id serial primary key,
  user_id integer not null references users(id) on delete cascade,
  label text not null default 'Home',   -- Home / Work / Other
  line1 text not null,
  line2 text,
  city text not null,
  pincode text,
  phone text,
  is_default boolean not null default false
);

create table if not exists orders (
  id serial primary key,
  customer_name text not null,
  customer_id integer references users(id),
  items jsonb not null default '[]',
  total numeric not null default 0,
  channel text not null default 'delivery' check (channel in ('delivery', 'pickup', 'dine_in')),
  status text not null default 'placed'
    check (status in ('placed', 'preparing', 'ready', 'out_for_delivery', 'picked_up', 'delivered', 'cancelled')),
  payment_method text, -- 'cash' | 'upi' | 'card'
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),

  -- Delivery-specific fields — null/unused for pickup & dine-in orders
  delivery_address text,
  delivery_phone text,
  rider_id integer references staff(id),   -- assigned rider (staff row with is_rider = true)
  table_number text,                       -- only used for dine_in

  created_at timestamptz not null default now()
);
create index if not exists idx_orders_rider_id on orders(rider_id);
create index if not exists idx_orders_status on orders(status);

create table if not exists expenses (
  id serial primary key,
  description text not null,
  amount numeric not null,
  category text not null default 'other', -- ingredients | utilities | rent | wages | delivery | other
  incurred_at date not null default current_date,
  created_by integer references users(id)
);

-- Seed data ------------------------------------------------------------------

insert into staff (id, name, role, shift, status, is_rider) values
  (1, 'Arun Kumar', 'Chef', '10am–6pm', 'clocked_in', false),
  (2, 'Divya Rao', 'Cashier', '11am–8pm', 'clocked_in', false),
  (3, 'Karthik S.', 'Kitchen Helper', '10am–6pm', 'on_break', false),
  (4, 'Manoj Verma', 'Delivery Rider', '11am–9pm', 'clocked_in', true),
  (5, 'Fatima Sheikh', 'Delivery Rider', '5pm–11pm', 'absent', true),
  (6, 'Owner', 'Owner', 'flexible', 'clocked_in', false)
on conflict (id) do nothing;
select setval('staff_id_seq', (select max(id) from staff));

insert into staff_tasks (id, description, assigned_to, due, done) values
  (1, 'Prep tandoori marinade', 'Arun Kumar', '11:00 AM', false),
  (2, 'Restock napkins & cutlery', 'Divya Rao', '2:00 PM', false),
  (3, 'Deep clean fryer', 'Karthik S.', 'done', true)
on conflict (id) do nothing;
select setval('staff_tasks_id_seq', (select max(id) from staff_tasks));

insert into menu_items (id, name, category, price, unit, in_stock, description, is_veg, spice_level) values
  (1, 'Paneer Butter Masala', 'mains', 240, 'plate', true, 'Creamy tomato gravy, cottage cheese', true, 'mild'),
  (2, 'Chicken Biryani', 'mains', 260, 'plate', true, 'Slow-cooked basmati, spiced chicken', false, 'medium'),
  (3, 'Garlic Naan', 'breads', 60, 'piece', true, 'Tandoor-baked, garlic butter brushed', true, null),
  (4, 'Veg Spring Rolls', 'starters', 150, 'plate', true, 'Crispy rolls, sweet chili dip', true, 'mild'),
  (5, 'Gulab Jamun', 'desserts', 90, 'plate (2 pc)', true, 'Warm, syrup-soaked', true, null),
  (6, 'Masala Chai', 'beverages', 40, 'cup', true, 'Spiced milk tea', true, null),
  (7, 'Biryani by the kg', 'custom', 550, 'kg', true, 'Bulk-order biryani, priced per kg — pick protein, spice level and quantity below', false, 'medium')
on conflict (id) do nothing;
select setval('menu_items_id_seq', (select max(id) from menu_items));

insert into inventory (id, name, unit, quantity, reorder_level, supplier) values
  (1, 'Paneer', 'kg', 6, 3, 'Local Dairy Co.'),
  (2, 'Chicken', 'kg', 12, 5, 'Fresh Farms'),
  (3, 'Basmati rice', 'kg', 25, 10, 'Golden Grain Traders'),
  (4, 'Refined flour (maida)', 'kg', 15, 5, 'Golden Grain Traders'),
  (5, 'Cooking oil', 'l', 8, 4, 'Sunrise Suppliers')
on conflict (id) do nothing;
select setval('inventory_id_seq', (select max(id) from inventory));

-- Dev seed logins (owner123 / staff123 / rider123 / customer123) — bcrypt hashes,
-- swap these accounts out before deploying anywhere public.
insert into users (id, name, email, password_hash, role, staff_id) values
  (1, 'Owner', 'owner@devis.test', '$2b$10$pgcAyiAuSRM4KbpoBv8nAOPuXd6OuSeh6RxyTildAq617qTDSsohy', 'owner', 6),
  (2, 'Divya Rao', 'divya@devis.test', '$2b$10$3Qg5wmC7R5xlgAcidQXf0eOdecde7DPXcKboV.jDE0wZk8zlIDEuC', 'staff', 2),
  (3, 'Manoj Verma', 'manoj@devis.test', '$2b$10$3Qg5wmC7R5xlgAcidQXf0eOdecde7DPXcKboV.jDE0wZk8zlIDEuC', 'rider', 4),
  (4, 'Ananya Iyer', 'ananya@example.com', '$2b$10$GLnAgD9I50Tp0laR2P0hkuRZ/NLJZQG0bbAkjiXSSx06Pr635xlzm', 'customer', null)
on conflict (id) do nothing;
select setval('users_id_seq', (select max(id) from users));

-- BOM: how much of each ingredient one unit of a menu item uses. Drives
-- auto-deduct on order creation (server/controllers/orderController.js).
insert into recipe_ingredients (menu_item_id, inventory_id, qty_per_unit) values
  (1, 1, 0.15), (1, 5, 0.02),                 -- Paneer Butter Masala: paneer, oil
  (2, 2, 0.2), (2, 3, 0.15), (2, 5, 0.03),    -- Chicken Biryani: chicken, rice, oil
  (3, 4, 0.08), (3, 5, 0.01),                 -- Garlic Naan: flour, oil
  (4, 4, 0.06), (4, 5, 0.03),                 -- Veg Spring Rolls: flour, oil
  (6, 5, 0.005)                               -- Masala Chai: touch of... (placeholder ratio)
on conflict (menu_item_id, inventory_id) do nothing;

insert into orders (id, customer_name, customer_id, items, total, channel, status, payment_method, payment_status, delivery_address, delivery_phone, rider_id, created_at) values
  (5001, 'Ananya Iyer', 4, '[{"menuItemId":2,"name":"Chicken Biryani","qty":1},{"menuItemId":3,"name":"Garlic Naan","qty":2}]', 380, 'delivery', 'out_for_delivery', 'upi', 'paid', '221B, Palm Residency, Indiranagar', '9876543210', 4, '2026-08-20T12:20:00Z'),
  (5002, 'Rahul M.', null, '[{"menuItemId":1,"name":"Paneer Butter Masala","qty":1}]', 240, 'pickup', 'ready', 'cash', 'paid', null, null, null, '2026-08-20T12:02:00Z'),
  (5003, 'Table 4', null, '[{"menuItemId":4,"name":"Veg Spring Rolls","qty":2},{"menuItemId":6,"name":"Masala Chai","qty":2}]', 380, 'dine_in', 'preparing', 'cash', 'unpaid', null, null, null, '2026-08-20T12:35:00Z')
on conflict (id) do nothing;
select setval('orders_id_seq', 5004);
