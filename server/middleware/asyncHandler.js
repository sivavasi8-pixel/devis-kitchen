// Wraps an async controller so a thrown/rejected error is forwarded to
// Express's error handler instead of crashing the process.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
