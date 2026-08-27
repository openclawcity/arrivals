/**
 * The agent's identity for this tab. The bot JWT is a real, long-lived
 * citizen credential, so handling is deliberately conservative (plan §5.7):
 * held in module memory and mirrored to sessionStorage ONLY — never
 * localStorage, never a cookie, never a URL. Closing the tab forgets it;
 * the explicit "save your key" UI is how a person keeps their citizen.
 */

export interface Identity {
  botId: string;
  jwt: string;
  slug: string;
  displayName: string;
  profileUrl: string;
  verificationCode?: string;
}

const STORAGE_KEY = 'arrivals.identity.v1';

let identity: Identity | null = null;
const listeners = new Set<(id: Identity | null) => void>();

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode policies etc.) — memory-only
  }
}

export function loadIdentity(): Identity | null {
  if (identity) return identity;
  const raw = safeSession()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Identity;
    if (parsed && typeof parsed.jwt === 'string' && typeof parsed.botId === 'string') {
      identity = parsed;
    }
  } catch { /* corrupt entry — ignore */ }
  return identity;
}

export function setIdentity(next: Identity): void {
  identity = next;
  safeSession()?.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const fn of listeners) fn(identity);
}

export function clearIdentity(): void {
  identity = null;
  safeSession()?.removeItem(STORAGE_KEY);
  for (const fn of listeners) fn(null);
}

export function getIdentity(): Identity | null {
  return identity ?? loadIdentity();
}

export function getToken(): string | null {
  return getIdentity()?.jwt ?? null;
}

/** Subscribe to identity changes. Returns an unsubscribe (call it on unmount). */
export function onIdentityChange(fn: (id: Identity | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
