const BASE = "/api";

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, options = {}) {
  // Skip the JSON content-type for FormData (image uploads) — the browser needs to set its
  // own multipart boundary, and overriding it here would break the upload silently.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name, email, password, phone) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, phone }) }),
  me: () => request("/auth/me"),

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

  getOrders: () => request("/orders"),
  getMyOrders: () => request("/orders/mine"),
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (order) => request("/orders", { method: "POST", body: JSON.stringify(order) }),
  updateOrderStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateOrderPayment: (id, paymentStatus) =>
    request(`/orders/${id}/payment`, { method: "PATCH", body: JSON.stringify({ paymentStatus }) }),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: "PATCH" }),

  // Delivery/rider-specific — not present in the reference bakery app (pickup-only),
  // added for Devi's Kitchen's delivery + rider role.
  getMyDeliveries: () => request("/orders/deliveries/mine"),
  getUnassignedDeliveries: () => request("/orders/deliveries/unassigned"),
  assignRider: (orderId, riderId) =>
    request(`/orders/${orderId}/assign-rider`, { method: "PATCH", body: JSON.stringify({ riderId }) }),
  getRiders: () => request("/staff/riders"),

  getInventory: () => request("/inventory"),
  createInventoryItem: (item) => request("/inventory", { method: "POST", body: JSON.stringify(item) }),
  updateInventoryItem: (id, item) => request(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(item) }),
  updateInventoryQuantity: (id, quantity) =>
    request(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  deleteInventoryItem: (id) => request(`/inventory/${id}`, { method: "DELETE" }),

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

  getExpenses: () => request("/expenses"),
  createExpense: (expense) => request("/expenses", { method: "POST", body: JSON.stringify(expense) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" })
};
