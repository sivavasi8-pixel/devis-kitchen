const slotLabel = (slot) => {
  const [h, m] = slot.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

// "Today, 7:30 PM", "Thu 15 Oct, 1:00 PM", or null for an as-soon-as-possible order.
export const scheduleLabel = (o) => {
  if (!o.scheduledDate || !o.scheduledSlot) return null;
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const tomorrowIst = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const day =
    o.scheduledDate === todayIst
      ? "Today"
      : o.scheduledDate === tomorrowIst
        ? "Tomorrow"
        : new Date(`${o.scheduledDate}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${slotLabel(o.scheduledSlot)}`;
};
