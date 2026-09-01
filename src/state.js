export const PENDING_TTL_MS = 48 * 60 * 60 * 1000;

export function addPendingDraft(pending, id, item, now = new Date()) {
  pending[id] = { ...item, pendingSince: now.toISOString() };
  return pending[id];
}

export function pruneExpiredPending(pending, now = new Date()) {
  const remaining = {};
  for (const [id, item] of Object.entries(pending || {})) {
    const pendingSince = Date.parse(item.pendingSince);
    // Pending records from before this field existed are preserved rather than
    // risk losing an administrator's draft during an upgrade.
    if (!Number.isFinite(pendingSince) || now.getTime() - pendingSince <= PENDING_TTL_MS) {
      remaining[id] = item;
    }
  }
  return remaining;
}
