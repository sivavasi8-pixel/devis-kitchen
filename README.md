# Devi's Kitchen — food ordering platform

Full-stack single-restaurant food ordering app: owner dashboard, staff
management, inventory tracking with recipe-based auto-deduct, a full order
lifecycle across delivery/pickup/dine-in, an in-store POS, a **delivery
rider role** (claim orders, update delivery/pickup-handoff status), expense/
profit reporting, live in-app notifications, and a customer ordering flow.

Built with the same architecture as an earlier bakery-management project
(Express + PostgreSQL + React), generalized for a restaurant menu and
extended with delivery/rider support the bakery didn't need.

## Project structure

```
devis-kitchen/
  server/           Express API
    routes/         URL → controller mapping
    controllers/    Request handling
    data/           PostgreSQL queries
    db/schema.sql   Table definitions + seed data
    config/db.js    PostgreSQL connection pool
  client/           React app (Vite)
    src/pages/      Dashboard, Inventory, Staff, POS, Orders, Order, MyOrders,
                    MenuAdmin, Reports, Receipt, Rider, Login, Signup
    src/components/ Shared UI (nav, admin layout, notification bell, status badge)
    src/auth/       Auth context + protected-route wrapper
    src/cart/       Customer shopping cart context
    src/api.js      Fetch helper for the backend
```

## ⚠️ Important: use a database separate from any other app

This app expects its **own** PostgreSQL database — don't point it at a
database another app (e.g. a bakery-management app) already uses. Both apps
use similar/identical table names (`orders`, `menu_items`, `staff`,
`inventory`, `users`...), so sharing one database would mean one app's
schema changes or data resets colliding with the other's.

If you're using [Neon](https://neon.tech) and already have another app's
free project there, you can still keep everything under one Neon **project**
(same free tier) — just create a **second database** inside it:

1. Open your Neon project → **Databases** tab → **New Database**.
2. Name it something distinct, e.g. `devis_kitchen` (don't reuse the other
   app's database name, e.g. `neondb`).
3. Neon gives you a new connection string for that database — same host,
   different database name at the end:
   ```
   postgresql://user:pass@ep-xxxx.neon.tech/devis_kitchen?sslmode=require
   ```
4. Use **that** connection string as this app's `DATABASE_URL` (see below).
   Postgres keeps databases fully isolated — no query in this app can ever
   see or touch the other app's tables, even though they're in the same
   project.

If you'd rather not share a Neon project at all, creating a brand new (also
free) Neon project works exactly the same way — just use its connection
string instead.

## Running locally

You'll need Node.js 18+ installed.

**1. Set up the database**

Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` with
your **own, separate** database's connection string (see above). Then run
`server/db/schema.sql` against it — paste it into Neon's SQL Editor (make
sure the editor is pointed at the right database) or:
```
psql "$DATABASE_URL" -f server/db/schema.sql
```

**2. Start the backend**
```
cd server
npm install
npm run dev
```
Runs on http://localhost:4000 — try http://localhost:4000/api/health

**3. Start the frontend** (in a new terminal)
```
cd client
npm install
npm run dev
```
Runs on http://localhost:5173 and proxies `/api` calls to the backend.

## Authentication & roles

Every route except `/api/menu` and `/api/auth/*` requires a `Bearer <token>`
from `/api/auth/login`. Roles:

- **owner** — full access: menu, recipes, staff, reports, everything.
- **staff** — dashboard, orders, inventory, staff status, POS. Not menu/reports.
- **rider** — sees only their own assigned deliveries/pickups plus the pool
  of unassigned "ready" orders they can claim. Can move an order through
  `out_for_delivery`/`picked_up` → `delivered`, nothing earlier in the flow.
- **customer** — browse menu, place orders, view their own order history,
  cancel while still `placed`.

Tokens are JWTs signed with `JWT_SECRET`, expire after 7 days. There's no
self-serve owner/staff/rider signup — those accounts are seeded in
`server/data/users.js` / `server/db/schema.sql`. Customers self-register via
`/api/auth/signup`.

**Seeded dev logins** (see `server/db/schema.sql` for the source of truth):

| Role | Email | Password |
|---|---|---|
| Owner | owner@devis.test | owner123 |
| Staff | divya@devis.test | staff123 |
| Rider | manoj@devis.test | staff123 |
| Customer | ananya@example.com | customer123 |

## Order lifecycle

```
placed → preparing → ready → out_for_delivery → delivered   (delivery orders)
placed → preparing → ready → picked_up                       (pickup orders, rider handoff)
placed → preparing → ready → delivered                       (dine-in, no rider needed)
                                  ↳ cancelled (from any non-terminal state)
```

- **Owner/staff** advance an order from `placed` through `ready` (kitchen
  side) from the **Orders** page.
- Once an order is `ready` (and isn't dine-in), it becomes visible to riders
  as **unassigned** — any rider can claim it, or owner/staff can assign a
  specific rider from the Orders page.
- The assigned **rider** then moves it `ready → out_for_delivery → delivered`
  (delivery) or `ready → picked_up` (pickup handoff) from their own
  **My Deliveries** page (`/rider`). A rider can only touch orders assigned
  to them, and only through these later steps — not back into kitchen states.
- **Cancellation** restocks inventory the same way order creation deducted
  it (reversing the recipe-based deduction). Customers can only cancel their
  own order while it's still `placed`; owner/staff can cancel anything short
  of a terminal state (`delivered`/`picked_up`/`cancelled`).

## In-store POS & recipe-based inventory

`POST /api/orders` accepts `owner`/`staff` too, not just `customer` — the
**POS** page (`/pos`) rings up walk-in pickup/dine-in sales. Whichever role
places an order, if its items carry a `menuItemId`, the order controller
looks up each item's recipe (its ingredient BOM) and auto-deducts the
matching quantities from inventory, floored at zero — reversed on
cancellation.

## Payments & receipts

Every order carries `paymentMethod` (`cash`/`upi`/`card`) and
`paymentStatus` (`unpaid`/`paid`). No real payment gateway (simulated): a
counter sale (POS) is always paid immediately; a customer's own order is
paid immediately for `upi`/`card` (prepaid) but stays `unpaid` for `cash`
until owner/staff marks it paid. `/receipt/:id` is a printable receipt for
any order — a customer can only open their own, owner/staff/rider can open
any.

## Notifications

Computed fresh on every request (no persisted read/unread state) — owner/
staff get pending-order and low-stock alerts plus a count of ready orders
with no rider assigned; a rider gets their own active delivery/pickup
statuses; a customer gets their own active order statuses. Polled every 30s.

## Reports export

The Reports page (owner only) has "Export CSV" (client-side Blob download)
and "Print / Save as PDF" (browser print dialog, admin chrome hidden via
`@media print`).

## Deploying (free)

Same approach as the bakery app: one [Render](https://render.com) free web
service serves both the API and the built React frontend. `render.yaml` is
already set up — you'll need to set `DATABASE_URL` (your **own** database's
connection string, not shared with any other app) and `JWT_SECRET` in the
Render dashboard.

**Before this goes anywhere public:** rotate `JWT_SECRET`, and replace the
seeded owner/staff/rider passwords in `server/db/schema.sql`.
