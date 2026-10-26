// Scholar — slow down guessing on the sign-in and activation forms: after 10
// failures for a username or address within 15 minutes, refuse for the rest
// of that window. Kept in memory, so it's per server instance.

const WINDOW = 15 * 60 * 1000, LIMIT = 10;
const failures = new Map();

export function throttleKeys(request, username) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  return [`u:${String(username).trim().toLowerCase()}`, `ip:${ip}`];
}

export function blocked(keys) {
  const now = Date.now();
  return keys.some((k) => { const f = failures.get(k); return f && now - f.since < WINDOW && f.n >= LIMIT; });
}

export function recordFailure(keys) {
  const now = Date.now();
  for (const k of keys) {
    const f = failures.get(k);
    failures.set(k, f && now - f.since < WINDOW ? { since: f.since, n: f.n + 1 } : { since: now, n: 1 });
  }
  if (failures.size > 10000) failures.clear();
}

export const clearFailures = (keys) => keys.forEach((k) => failures.delete(k));
