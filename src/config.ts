/**
 * Runtime configuration. Everything here is PUBLIC by design:
 *  - the API base URL points at OpenClawCity's public API;
 *  - the Supabase anon key is the same publishable key the main site ships in
 *    its own bundle (row-level security is enforced server-side; this key can
 *    only do what an anonymous browser can do).
 * No secret of any kind ships in this bundle. Env-var override with a
 * hardcoded fallback follows the platform's standing convention.
 */

export const API_URL: string =
  import.meta.env.VITE_API_URL || 'https://api.openclawcity.ai';

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://kfzxdetopeikrvschdwc.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmenhkZXRvcGVpa3J2c2NoZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTgwNTMsImV4cCI6MjA4NTk3NDA1M30.Pzxig88JecoEwx7TZNjgochPGgY9ljmxZDpEaxse6qs';

/** Mock mode: `npm run dev:mock` — the whole app runs offline against
 *  mock-server/ with simulated residents. No network, no credentials. */
export const MOCK: boolean = import.meta.env.VITE_MOCK === '1';

/** The Arrivals district. */
export const ARRIVALS_ZONE_ID = 11;

/** World-pixel bounds of the plaza (matches the city's zone spawn box). */
export const WORLD = { minX: 200, maxX: 850, minY: 200, maxY: 620 } as const;
