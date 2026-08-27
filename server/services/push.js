// Sends real push notifications (Firebase Cloud Messaging) straight from the
// server, in the same request that already changes an order's status —
// unlike the reference cricket-nets-app (Pavilion), which is a static
// frontend with no backend of its own and so needed a separate Cloudflare
// Worker just to hold this credential. This app already has an Express
// server, so the service-account credential lives here instead (see
// config/firebaseAdmin.js) and there's no relay to run or keep in sync.
const { getFirebaseApp } = require("../config/firebaseAdmin");
const pushTokens = require("../data/pushTokens");

// `data`, not `notification` — a top-level `notification` field makes the
// browser's push service auto-display its own system notification on top of
// whatever the service worker's onBackgroundMessage handler builds, which
// doubles every push. Same fix Pavilion's Worker already had to make.
async function sendToTokens(tokens, { title, body, data }) {
  if (!tokens || tokens.length === 0) return;
  const app = getFirebaseApp();
  if (!app) return; // push not configured yet — never blocks the caller

  const messaging = app.messaging();
  let res;
  try {
    res = await messaging.sendEachForMulticast({
      tokens,
      data: { title, body, ...(data || {}) }
    });
  } catch (e) {
    console.error("push send failed", e.message);
    return;
  }

  const deadTokens = [];
  res.responses.forEach((r, i) => {
    if (!r.success && r.error && r.error.code === "messaging/registration-token-not-registered") {
      deadTokens.push(tokens[i]);
    }
  });
  if (deadTokens.length > 0) await pushTokens.removeTokens(deadTokens);
}

// Fire-and-forget from the caller's point of view — a push failing or being
// unconfigured should never fail the order/status-update request it rode in
// on. Every exports.* function below swallows its own errors for this reason.
async function safe(fn) {
  try {
    await fn();
  } catch (e) {
    console.error("push notify failed", e.message);
  }
}

exports.notifyUsers = (userIds, { title, body, data }) =>
  safe(async () => {
    const tokens = await pushTokens.getTokensForUsers(userIds);
    await sendToTokens(tokens, { title, body, data });
  });

exports.notifyRole = (role, { title, body, data }) =>
  safe(async () => {
    const tokens = await pushTokens.getTokensForRole(role);
    await sendToTokens(tokens, { title, body, data });
  });

exports.notifyRoles = (roles, { title, body, data }) =>
  safe(async () => {
    const tokens = await pushTokens.getTokensForRoles(roles);
    await sendToTokens(tokens, { title, body, data });
  });

exports.notifyRolesExcludingUser = (roles, excludeUserId, { title, body, data }) =>
  safe(async () => {
    const tokens = await pushTokens.getTokensForRolesExcludingUser(roles, excludeUserId);
    await sendToTokens(tokens, { title, body, data });
  });

exports.notifyStaffId = (staffId, { title, body, data }) =>
  safe(async () => {
    const tokens = await pushTokens.getTokensForStaffId(staffId);
    await sendToTokens(tokens, { title, body, data });
  });
