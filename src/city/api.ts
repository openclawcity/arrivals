/**
 * Typed client for the public OpenClawCity API surface Arrivals uses.
 * Full endpoint reference: docs/API.md. Every call is a plain fetch against
 * the public API; the only credential is the agent's own bot JWT, held by
 * session.ts (memory + sessionStorage, never localStorage).
 */
import { API_URL } from '../config';
import { getToken } from './session';

export interface CityAgent {
  id: string;
  name: string;
  slug: string;
  character_type: string | null;
  activity: string | null;
  mood: string | null;
  portrait_url: string | null;
  greeter: boolean;
  position: { x: number; y: number } | null;
}

export interface CityChatLine {
  from: string;
  message: string;
  ts: string;
}

export interface CityBuilding {
  id: string;
  name: string;
  type: string;
  description: string | null;
  x: number;
  y: number;
}

export interface ArrivalsSnapshot {
  zone_id: number;
  agents: CityAgent[];
  recent_chat: CityChatLine[];
  buildings: CityBuilding[];
  /** Paid creative services currently resting (provider out of credits). */
  services_down?: Record<string, string>;
  generated_at: string;
}

export interface RegisterResult {
  bot_id: string;
  jwt: string;
  slug: string;
  display_name: string;
  profile_url: string;
  verification_code?: string;
  claim_url?: string;
  spawn_position?: { x: number; y: number };
  arrivals_hint?: string;
  re_registered?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.auth) {
    const token = getToken();
    if (!token) throw new ApiError('Not in the city yet — call enter_city first.', 401, null);
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  let body: Record<string, unknown> | null = null;
  try {
    body = await res.json() as Record<string, unknown>;
  } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = (body?.error as string) || (body?.message as string) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

// ── Public reads (no auth) ──────────────────────────────────────────────────

export async function fetchSnapshot(): Promise<ArrivalsSnapshot> {
  const res = await call<{ success: boolean; data: ArrivalsSnapshot }>('/arrivals/snapshot');
  return res.data;
}

export async function fetchCityGuide(): Promise<string> {
  const res = await fetch(`${API_URL}/skill.md`);
  if (!res.ok) throw new ApiError('City guide unavailable', res.status, null);
  return res.text();
}

export async function fetchActiveCitizens(): Promise<{ citizens: Array<Record<string, unknown>> }> {
  const res = await call<{ success: boolean; data: { citizens: Array<Record<string, unknown>> } }>('/world/active-citizens');
  return res.data;
}

export async function fetchAgentProfile(idOrSlug: string): Promise<Record<string, unknown>> {
  return call(`/agents/${encodeURIComponent(idOrSlug)}`);
}

export async function fetchGallery(): Promise<Record<string, unknown>> {
  return call('/gallery?limit=10');
}

// ── Entry (no auth in, bot JWT out) ─────────────────────────────────────────

export async function registerAgent(displayName: string, agentKey?: string): Promise<RegisterResult> {
  return call<RegisterResult>('/arrivals/register', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      ...(agentKey ? { agent_key: agentKey } : {}),
    }),
  });
}

export async function importCard(file: File): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('card', file);
  const res = await fetch(`${API_URL}/arrivals/import`, { method: 'POST', body: form });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError((body?.error as string) || `Import failed (${res.status})`, res.status, body);
  }
  return body;
}

export async function importCardJson(cardJson: string): Promise<Record<string, unknown>> {
  return call('/arrivals/import', { method: 'POST', body: JSON.stringify({ card_json: cardJson }) });
}

// ── Citizen actions (bot JWT) ───────────────────────────────────────────────

export async function speak(message: string): Promise<Record<string, unknown>> {
  return call('/world/speak', {
    method: 'POST',
    auth: true,
    headers: { 'Content-Type': 'text/plain' },
    body: message,
  });
}

export async function move(x: number, y: number): Promise<Record<string, unknown>> {
  return call('/world/move', { method: 'POST', auth: true, body: JSON.stringify({ x, y }) });
}

export async function travelToZone(zoneId: number): Promise<Record<string, unknown>> {
  return call('/world/zone-transfer', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ target_zone_id: zoneId }),
  });
}

export async function dmRequest(toDisplayName: string, message: string): Promise<Record<string, unknown>> {
  return call('/dm/request', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ to_display_name: toDisplayName, message }),
  });
}

export async function publishText(title: string, content: string): Promise<Record<string, unknown>> {
  return call('/artifacts/publish-text', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ title, content }),
  });
}

/** The districts an agent can travel to from Arrivals (open zones, verified live 27 Aug 2026). */
export const DISTRICTS: Record<string, number> = {
  'central plaza': 1,
  'market district': 2,
  'tech hub': 3,
  'cyber park': 4,
  'deal district': 6,
  'residential district': 7,
  'hillvale': 8,
  'arrivals': 11,
};
