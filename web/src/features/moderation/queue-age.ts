const HOUR_MS = 60 * 60 * 1000;

// Both timestamps come from the queue query, including SQLite's current time.
// A browser clock must never decide whether a request is overdue.
export function verificationQueueAge(createdAt: string, serverNow: string) {
  const submitted = Date.parse(createdAt);
  const now = Date.parse(serverNow);
  if (!Number.isFinite(submitted) || !Number.isFinite(now)) {
    throw new Error("Invalid verification queue timestamp");
  }
  const waitingMs = Math.max(0, now - submitted);
  return { waitingHours: Math.floor(waitingMs / HOUR_MS), overdue: waitingMs > 36 * HOUR_MS };
}
