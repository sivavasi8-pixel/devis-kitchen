// Online UPI/card payments aren't auto-confirmed yet (no gateway), so an unpaid
// UPI/card order is "awaiting confirmation", not "pay on pickup/delivery".
export const paymentLabel = (o) =>
  o.paymentStatus === "paid"
    ? "Paid"
    : o.paymentMethod === "upi" || o.paymentMethod === "card"
      ? "Payment awaiting confirmation"
      : o.channel === "delivery"
        ? "Pay on delivery"
        : "Pay on pickup";
