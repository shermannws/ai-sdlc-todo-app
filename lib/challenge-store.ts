// Server-side only: ephemeral store for WebAuthn challenge values.
// Keyed by "register:<username>" or "login:<username>".
// A 5-minute TTL prevents stale challenges from being consumed.

const store = new Map<string, { challenge: string; expiresAt: number }>();

export function setChallenge(key: string, challenge: string): void {
  store.set(key, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export function getAndDeleteChallenge(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}
