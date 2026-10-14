// Opening hours, order-ahead time slots and distance-based delivery zones.
// The owner edits all of it from Settings; it lives in app_settings under the
// "orderingConfig" key as JSON. Anything missing falls back to DEFAULT_CONFIG, so
// a fresh database works without the owner touching a thing.
//
// All times are India time (matches the rest of the app's day boundaries).
const settings = require("../data/settings");
const { haversineKm } = require("./distance");
const { getStoreLocation } = require("../config/storeLocation");

const TZ = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  open: "11:00",
  close: "22:00",
  closedWeekdays: [], // 0 = Sunday ... 6 = Saturday
  slotMinutes: 30,
  daysAhead: 3,
  sameDayNoticeMinutes: 30,
  // Ordered nearest first. A delivery falls in the first zone whose maxKm covers it;
  // beyond the last zone, delivery is refused. freeAbove: 0 means "never free".
  zones: [
    { label: "Nearby (up to 3 km)", maxKm: 3, fee: 30, freeAbove: 500, minOrder: 0 },
    { label: "Further out (up to 7 km)", maxKm: 7, fee: 60, freeAbove: 800, minOrder: 200 }
  ]
};

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const isHhmm = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v));

// Validates and normalises an owner-submitted config. Throws a 400 with a plain message.
function sanitizeConfig(input) {
  const c = { ...DEFAULT_CONFIG, ...(input || {}) };
  if (!isHhmm(c.open) || !isHhmm(c.close)) throw badRequest("Opening and closing times must look like 11:00");
  if (toMinutes(c.close) <= toMinutes(c.open)) throw badRequest("Closing time must be after opening time");
  const slot = Number(c.slotMinutes);
  if (![15, 20, 30, 45, 60].includes(slot)) throw badRequest("Slot length must be 15, 20, 30, 45 or 60 minutes");
  const daysAhead = Number(c.daysAhead);
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 14) throw badRequest("Days ahead must be between 0 and 14");
  const notice = Number(c.sameDayNoticeMinutes);
  if (!Number.isFinite(notice) || notice < 0 || notice > 600) throw badRequest("Same-day notice must be between 0 and 600 minutes");
  const closed = Array.isArray(c.closedWeekdays) ? [...new Set(c.closedWeekdays.map(Number))] : [];
  if (closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw badRequest("Closed days must be weekdays 0-6");
  if (closed.length >= 7) throw badRequest("The restaurant can't be closed every day");

  const zones = (Array.isArray(c.zones) ? c.zones : []).map((z, i) => {
    const maxKm = Number(z.maxKm);
    const fee = Number(z.fee);
    const freeAbove = Number(z.freeAbove || 0);
    const minOrder = Number(z.minOrder || 0);
    if (!Number.isFinite(maxKm) || maxKm <= 0) throw badRequest(`Zone ${i + 1}: distance must be more than 0 km`);
    if (![fee, freeAbove, minOrder].every((n) => Number.isFinite(n) && n >= 0)) {
      throw badRequest(`Zone ${i + 1}: fee, free-above and minimum order must be 0 or more`);
    }
    return { label: String(z.label || `Up to ${maxKm} km`).slice(0, 60), maxKm, fee, freeAbove, minOrder };
  });
  zones.sort((a, b) => a.maxKm - b.maxKm);
  for (let i = 1; i < zones.length; i++) {
    if (zones[i].maxKm === zones[i - 1].maxKm) throw badRequest("Two zones can't have the same distance");
  }
  return { open: c.open, close: c.close, closedWeekdays: closed.sort(), slotMinutes: slot, daysAhead, sameDayNoticeMinutes: notice, zones };
}

async function getConfig() {
  const all = await settings.getAll();
  if (!all.orderingConfig) return DEFAULT_CONFIG;
  try {
    return sanitizeConfig(JSON.parse(all.orderingConfig));
  } catch {
    return DEFAULT_CONFIG; // a corrupted value must never take ordering down
  }
}

async function saveConfig(input) {
  const clean = sanitizeConfig(input);
  await settings.set("orderingConfig", JSON.stringify(clean));
  return clean;
}

// --- India-time helpers ---
const istDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const istMinutes = (ms) => {
  const [h, m] = new Date(ms)
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
};
// Weekday of a YYYY-MM-DD date (0 = Sunday). Noon UTC keeps it on the same calendar date.
const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (ymd) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${WEEKDAYS[weekdayOf(ymd)]} ${d} ${MONTHS[m - 1]}`;
};
const slotLabel = (slot) => {
  const mins = toMinutes(slot);
  const h = Math.floor(mins / 60);
  return `${((h + 11) % 12) + 1}:${String(mins % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const fmtSlot = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// Every slot start inside opening hours, e.g. ["11:00", "11:30", ...]. The last slot
// must start at least one slot length before closing.
const allSlots = (config) => {
  const out = [];
  const end = toMinutes(config.close);
  for (let t = toMinutes(config.open); t + config.slotMinutes <= end; t += config.slotMinutes) out.push(fmtSlot(t));
  return out;
};

// Open right now (ASAP orders are only accepted while this is true).
function isOpenNow(config, now = Date.now()) {
  const today = istDate(now);
  if (config.closedWeekdays.includes(weekdayOf(today))) return false;
  const mins = istMinutes(now);
  return mins >= toMinutes(config.open) && mins < toMinutes(config.close);
}

// The next bookable days, each with the slots still open.
function upcomingDays(config, now = Date.now()) {
  const today = istDate(now);
  const nowMins = istMinutes(now);
  const slots = allSlots(config);
  const days = [];
  for (let i = 0; i <= config.daysAhead; i++) {
    const date = istDate(now + i * DAY_MS);
    const closed = config.closedWeekdays.includes(weekdayOf(date));
    const open = closed
      ? []
      : slots.filter((s) => date !== today || toMinutes(s) >= nowMins + config.sameDayNoticeMinutes);
    days.push({
      date,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dateLabel(date),
      closed,
      slots: open.map((s) => ({ value: s, label: slotLabel(s) }))
    });
  }
  return days;
}

// Validates a customer's timing choice. Returns { date, slot, text } (date/slot null for
// ASAP) or throws a 400. `date`/`slot` both omitted means ASAP.
function resolveSchedule(config, { date, slot }, now = Date.now()) {
  if (!date && !slot) {
    if (!isOpenNow(config, now)) {
      throw badRequest(
        `We're closed right now (open ${slotLabel(config.open)} to ${slotLabel(config.close)}). Please pick a time slot instead.`
      );
    }
    return { date: null, slot: null, text: "As soon as possible" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !allSlots(config).includes(slot)) {
    throw badRequest("Choose a valid day and time");
  }
  const day = upcomingDays(config, now).find((d) => d.date === date);
  if (!day) throw badRequest(`Orders can be booked up to ${config.daysAhead} day${config.daysAhead === 1 ? "" : "s"} ahead`);
  if (day.closed) throw badRequest("We're closed that day, please pick another");
  if (!day.slots.some((s) => s.value === slot)) throw badRequest("That time has passed or is too soon, please pick a later slot");
  return { date, slot, text: `${day.label === "Today" || day.label === "Tomorrow" ? day.label : dateLabel(date)}, ${slotLabel(slot)}` };
}

// Delivery fee for an order. `lat`/`lng` are the drop point (may be null if it couldn't be
// located) — with no coordinates we can't measure, so the outermost zone's terms apply as
// a safe default rather than refusing the order. Returns { zone, km, fee, minOrder }.
async function quoteDelivery(config, { lat, lng, itemsTotal }) {
  if (!config.zones.length) return { zone: null, km: null, fee: 0, minOrder: 0 };
  let km = null;
  let zone;
  if (lat != null && lng != null) {
    const store = await getStoreLocation();
    km = Math.round(haversineKm(store.lat, store.lng, lat, lng) * 10) / 10;
    zone = config.zones.find((z) => km <= z.maxKm);
    if (!zone) throw badRequest(`Sorry, we deliver up to ${config.zones[config.zones.length - 1].maxKm} km from the restaurant`);
  } else {
    zone = config.zones[config.zones.length - 1];
  }
  if (zone.minOrder && itemsTotal < zone.minOrder) {
    throw badRequest(`Delivery to ${zone.label} needs a minimum order of ₹${zone.minOrder}`);
  }
  const fee = zone.freeAbove && itemsTotal >= zone.freeAbove ? 0 : zone.fee;
  return { zone: zone.label, km, fee, minOrder: zone.minOrder };
}

module.exports = {
  DEFAULT_CONFIG,
  sanitizeConfig,
  getConfig,
  saveConfig,
  isOpenNow,
  upcomingDays,
  resolveSchedule,
  quoteDelivery
};
