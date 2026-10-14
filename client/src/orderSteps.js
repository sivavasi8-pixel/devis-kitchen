// Shared by the Dashboard queue and the Orders board.
// One tap moves an order to its next step. What "next" means after "ready"
// depends on how the order leaves: a delivery goes out with a rider, a pickup is
// collected at the counter, a dine-in order is served at the table.
export const nextStep = (o) => {
  switch (o.status) {
    case "placed":
      return { status: "preparing", label: "Start preparing" };
    case "preparing":
      return { status: "ready", label: "Mark ready" };
    case "ready":
      if (o.channel === "delivery") return { status: "out_for_delivery", label: "Out for delivery" };
      if (o.channel === "pickup") return { status: "picked_up", label: "Collected" };
      return { status: "delivered", label: "Served" };
    case "out_for_delivery":
      return { status: "delivered", label: "Delivered" };
    default:
      return null;
  }
};

export const isFinished = (o) => ["delivered", "picked_up", "cancelled"].includes(o.status);
