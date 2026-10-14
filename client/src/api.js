const BASE = "/api";

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  // Skip the JSON content-type for FormData (image uploads) - the browser needs to set its
  // own multipart boundary, and overriding it here would break the upload silently.
  const isFormData = options.body instanceof FormData;
  const isGet = !options.method || options.method === "GET";
  // Render's free tier spins the server down after idle and takes 30-60s to wake
  // on the next request. The request that lands during that window fails outright
  // with a network-level "Failed to fetch", not an HTTP error, so it never reaches
  // the `!res.ok` check below. Retrying a GET (safe to repeat) after a short wait
  // usually succeeds once the server is awake; a mutating request is never
  // auto-retried, since a network failure doesn't guarantee the server never got it.
  const maxAttempts = isGet ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        ...options
      });
    } catch {
      if (attempt < maxAttempts) {
        await sleep(attempt * 1500);
        continue;
      }
      throw new Error("Couldn't reach the server. Check your connection and try again.");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name, email, password, phone, pin) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, phone, pin }) }),
  me: () => request("/auth/me"),
  updateProfile: (name, phone) => request("/auth/me", { method: "PATCH", body: JSON.stringify({ name, phone }) }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  changePin: (currentPassword, newPin) =>
    request("/auth/change-pin", { method: "POST", body: JSON.stringify({ currentPassword, newPin }) }),
  resetPassword: (email, pin, newPassword) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, pin, newPassword }) }),
  requestPinReset: (email) => request("/auth/request-pin-reset", { method: "POST", body: JSON.stringify({ email }) }),

  getDashboardSummary: () => request("/dashboard/summary"),
  getMenu: (category) => request(`/menu${category ? `?category=${category}` : ""}`),
  createMenuItem: (formData) => request("/menu", { method: "POST", body: formData }),
  updateMenuItem: (id, formData) => request(`/menu/${id}`, { method: "PATCH", body: formData }),
  deleteMenuItem: (id) => request(`/menu/${id}`, { method: "DELETE" }),
  updateMenuAvailability: (id, inStock) =>
    request(`/menu/${id}/availability`, { method: "PATCH", body: JSON.stringify({ inStock }) }),
  updateMenuSpecial: (id, isSpecial) =>
    request(`/menu/${id}/special`, { method: "PATCH", body: JSON.stringify({ isSpecial }) }),
  updateMenuPopular: (id, isPopular) =>
    request(`/menu/${id}/popular`, { method: "PATCH", body: JSON.stringify({ isPopular }) }),
  addMenuGalleryImage: (id, formData) => request(`/menu/${id}/images`, { method: "POST", body: formData }),
  deleteMenuGalleryImage: (id, imageId) => request(`/menu/${id}/images/${imageId}`, { method: "DELETE" }),

  getStoreStatus: () => request("/orders/store-status"),
  quoteOrder: (payload) => request("/orders/quote", { method: "POST", body: JSON.stringify(payload) }),
  getOrders: () => request("/orders"),
  getMyOrders: () => request("/orders/mine"),
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (order) => request("/orders", { method: "POST", body: JSON.stringify(order) }),
  updateOrderStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateOrderPayment: (id, paymentStatus) =>
    request(`/orders/${id}/payment`, { method: "PATCH", body: JSON.stringify({ paymentStatus }) }),
  updateOrderPriority: (id, priority) =>
    request(`/orders/${id}/priority`, { method: "PATCH", body: JSON.stringify({ priority }) }),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: "PATCH" }),
  uploadReceipt: (orderId, file) => {
    const body = new FormData();
    body.append("receipt", file);
    return request(`/orders/${orderId}/receipt`, { method: "POST", body });
  },
  // Bypasses request(): this returns image bytes, not JSON, and the <img> it
  // feeds needs a blob: URL since a plain <img src> can't carry the auth header.
  getReceiptBlob: async (orderId) => {
    const res = await fetch(`${BASE}/orders/${orderId}/receipt`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
    });
    if (!res.ok) throw new Error("Couldn't load the receipt");
    return res.blob();
  },

  // Delivery/rider-specific — not present in the reference bakery app (pickup-only),
  // added for Devi's Kitchen's delivery + rider role.
  getMyDeliveries: () => request("/orders/deliveries/mine"),
  getUnassignedDeliveries: () => request("/orders/deliveries/unassigned"),
  assignRider: (orderId, riderId) =>
    request(`/orders/${orderId}/assign-rider`, { method: "PATCH", body: JSON.stringify({ riderId }) }),
  releaseOrder: (orderId) => request(`/orders/${orderId}/release`, { method: "PATCH" }),
  getRiders: () => request("/staff/riders"),

  getInventory: () => request("/inventory"),
  createInventoryItem: (item) => request("/inventory", { method: "POST", body: JSON.stringify(item) }),
  updateInventoryItem: (id, item) => request(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(item) }),
  updateInventoryQuantity: (id, quantity) =>
    request(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  deleteInventoryItem: (id) => request(`/inventory/${id}`, { method: "DELETE" }),
  getInventoryMovements: (id) => request(`/inventory/${id}/movements`),

  getStaff: () => request("/staff"),
  createStaffMember: (member) => request("/staff", { method: "POST", body: JSON.stringify(member) }),
  deleteStaffMember: (id) => request(`/staff/${id}`, { method: "DELETE" }),
  updateStaffStatus: (id, status) =>
    request(`/staff/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateStaffShift: (id, shift) =>
    request(`/staff/${id}/shift`, { method: "PATCH", body: JSON.stringify({ shift }) }),
  getTasks: () => request("/staff/tasks"),
  createTask: (task) => request("/staff/tasks", { method: "POST", body: JSON.stringify(task) }),
  updateTask: (id, fields) => request(`/staff/tasks/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
  deleteTask: (id) => request(`/staff/tasks/${id}`, { method: "DELETE" }),

  getReports: () => request("/reports/summary"),

  getRecipe: (menuItemId) => request(`/menu/${menuItemId}/recipe`),
  updateRecipe: (menuItemId, ingredients) =>
    request(`/menu/${menuItemId}/recipe`, { method: "PUT", body: JSON.stringify({ ingredients }) }),

  getNotifications: () => request("/notifications"),

  registerPushToken: (token) => request("/push/register", { method: "POST", body: JSON.stringify({ token }) }),
  unregisterPushToken: (token) => request("/push/unregister", { method: "POST", body: JSON.stringify({ token }) }),

  getCustomers: () => request("/customers"),
  adminResetCustomerPin: (id, newPin) =>
    request(`/customers/${id}/reset-pin`, { method: "POST", body: JSON.stringify({ newPin }) }),
  adminResetCustomerPassword: (id, newPassword) =>
    request(`/customers/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) }),

  getAddresses: () => request("/addresses"),
  createAddress: (address) => request("/addresses", { method: "POST", body: JSON.stringify(address) }),
  updateAddress: (id, fields) => request(`/addresses/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
  deleteAddress: (id) => request(`/addresses/${id}`, { method: "DELETE" }),
  setDefaultAddress: (id) => request(`/addresses/${id}/default`, { method: "PATCH" }),

  // Shared across any logged-in role: Settings (owner) and the address book
  // (customer) both use these.
  reverseGeocode: (lat, lng) => request("/geocode/reverse", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  resolveMapsLink: (url) => request("/geocode/resolve-link", { method: "POST", body: JSON.stringify({ url }) }),

  getSettings: () => request("/settings"),
  updateSettings: (fields) => request("/settings", { method: "PATCH", body: JSON.stringify(fields) }),

  getExpenses: () => request("/expenses"),
  createExpense: (expense) => request("/expenses", { method: "POST", body: JSON.stringify(expense) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),

  // Meal subscriptions
  getSubscriptionPlans: () => request("/subscriptions/plans"),
  getAllSubscriptionPlans: () => request("/subscriptions/plans/all"),
  createSubscriptionPlan: (plan) => request("/subscriptions/plans", { method: "POST", body: JSON.stringify(plan) }),
  updateSubscriptionPlan: (id, fields) => request(`/subscriptions/plans/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
  deleteSubscriptionPlan: (id) => request(`/subscriptions/plans/${id}`, { method: "DELETE" }),

  getSubscriptionSettings: () => request("/subscriptions/settings"),
  updateSubscriptionDiscount: (cycle, discountPercent) =>
    request("/subscriptions/settings/discount", { method: "PATCH", body: JSON.stringify({ cycle, discountPercent }) }),
  updateSubscriptionDeliveryFee: (deliveryFeePerDay) =>
    request("/subscriptions/settings/delivery-fee", { method: "PATCH", body: JSON.stringify({ deliveryFeePerDay }) }),

  getSubscriptionEligibleItems: () => request("/subscriptions/eligible-items"),
  getSubscriptionQuote: (payload) => request("/subscriptions/quote", { method: "POST", body: JSON.stringify(payload) }),
  createSubscription: (payload) => request("/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
  getMySubscriptions: () => request("/subscriptions/mine"),
  getAllSubscriptions: () => request("/subscriptions"),
  updateSubscriptionStatus: (id, status) =>
    request(`/subscriptions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateSubscriptionPayment: (id, paymentStatus) =>
    request(`/subscriptions/${id}/payment`, { method: "PATCH", body: JSON.stringify({ paymentStatus }) })
};
