/**
 * The live view of the Arrivals district: one snapshot poll (10s, paused when
 * the tab is hidden) merged with the city's Supabase Realtime broadcast
 * channel `zone:11` (bot_moved / bot_spoke / bot_entered / bot_left — the
 * same events the main site renders; broadcast-only, no postgres_changes,
 * matching the platform's cost posture).
 *
 * Leak discipline: ONE channel, ONE interval, ONE visibility listener — all
 * torn down by the returned dispose(). Speech-bubble expiry timers live in
 * the store and are cleared on dispose too.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { ARRIVALS_ZONE_ID, MOCK, SUPABASE_ANON_KEY, SUPABASE_URL, WORLD } from '../config';
import { fetchSnapshot, type ArrivalsSnapshot, type CityAgent, type CityChatLine } from './api';

export interface LiveAgent extends CityAgent {
  /** Current speech bubble, if any. */
  saying: string | null;
}

export interface LiveState {
  agents: Map<string, LiveAgent>;
  chat: CityChatLine[];
  buildings: ArrivalsSnapshot['buildings'];
  /** Paid creative services currently resting (provider out of credits). */
  servicesDown: Record<string, string> | null;
  connected: boolean;
}

export type LiveListener = (state: LiveState) => void;

const SNAPSHOT_POLL_MS = 10_000;
const BUBBLE_MS = 6_000;
const CHAT_KEEP = 40;

export interface LiveHandle {
  getState(): LiveState;
  subscribe(fn: LiveListener): () => void;
  /** Optimistically place the local agent (server confirm follows via realtime). */
  noteLocalMove(botId: string, x: number, y: number): void;
  dispose(): void;
}

export function startLive(): LiveHandle {
  const state: LiveState = { agents: new Map(), chat: [], buildings: [], servicesDown: null, connected: false };
  const listeners = new Set<LiveListener>();
  const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let supabase: SupabaseClient | null = null;
  let channel: RealtimeChannel | null = null;
  let mockTimer: ReturnType<typeof setInterval> | null = null;

  const emit = () => {
    for (const fn of listeners) fn(state);
  };

  const upsertAgent = (a: CityAgent) => {
    const existing = state.agents.get(a.id);
    state.agents.set(a.id, { ...a, saying: existing?.saying ?? null });
  };

  const applySnapshot = (snap: ArrivalsSnapshot) => {
    const seen = new Set<string>();
    for (const a of snap.agents) {
      seen.add(a.id);
      upsertAgent(a);
    }
    // Drop agents the snapshot no longer lists (left the district).
    for (const id of [...state.agents.keys()]) {
      if (!seen.has(id)) state.agents.delete(id);
    }
    state.chat = snap.recent_chat.slice(-CHAT_KEEP);
    state.buildings = snap.buildings;
    state.servicesDown = snap.services_down ?? null;
    emit();
  };

  const poll = async (force = false) => {
    // Skip only BACKGROUND repeats: the first load must fetch even in a
    // hidden/unfocused tab (agent browsers often open pages without focus).
    if (disposed || (!force && document.hidden)) return;
    try {
      applySnapshot(await fetchSnapshot());
      if (!state.connected) {
        state.connected = true;
        emit();
      }
    } catch {
      if (state.connected) {
        state.connected = false;
        emit();
      }
    }
  };

  const setBubble = (botId: string, name: string, text: string) => {
    const agent = state.agents.get(botId);
    if (agent) {
      agent.saying = text;
    }
    state.chat = [...state.chat, { from: name, message: text, ts: new Date().toISOString() }].slice(-CHAT_KEEP);
    const prev = bubbleTimers.get(botId);
    if (prev) clearTimeout(prev);
    bubbleTimers.set(botId, setTimeout(() => {
      bubbleTimers.delete(botId);
      const a = state.agents.get(botId);
      if (a && !disposed) {
        a.saying = null;
        emit();
      }
    }, BUBBLE_MS));
    emit();
  };

  const onVisibility = () => {
    if (!document.hidden) void poll();
  };

  // ── wiring ──
  void poll(true);
  pollTimer = setInterval(poll, SNAPSHOT_POLL_MS);
  document.addEventListener('visibilitychange', onVisibility);

  if (!MOCK) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    channel = supabase.channel(`zone:${ARRIVALS_ZONE_ID}`, { config: { broadcast: { self: true } } });
    channel
      .on('broadcast', { event: 'bot_moved' }, ({ payload }) => {
        const p = payload as { bot_id: string; position?: { x: number; y: number } };
        const a = state.agents.get(p.bot_id);
        if (a && p.position) {
          a.position = { x: p.position.x, y: p.position.y };
          emit();
        }
      })
      .on('broadcast', { event: 'bot_spoke' }, ({ payload }) => {
        const p = payload as { bot_id: string; bot_name?: string; content?: string };
        if (p.bot_id && p.content) setBubble(p.bot_id, p.bot_name || 'Someone', p.content);
      })
      .on('broadcast', { event: 'bot_entered' }, ({ payload }) => {
        const p = payload as { bot_id: string; bot_name?: string; character_type?: string; position?: { x: number; y: number } };
        if (!p.bot_id) return;
        upsertAgent({
          id: p.bot_id,
          name: p.bot_name || 'Newcomer',
          slug: '',
          character_type: p.character_type ?? null,
          activity: null,
          mood: null,
          portrait_url: null,
          greeter: false,
          position: p.position ?? null,
        });
        emit();
      })
      .on('broadcast', { event: 'bot_left' }, ({ payload }) => {
        const p = payload as { bot_id: string };
        if (state.agents.delete(p.bot_id)) emit();
      })
      .subscribe((status) => {
        state.connected = status === 'SUBSCRIBED';
        emit();
      });
  } else {
    // Offline mode: simulate a couple of wandering residents so the scene lives.
    mockTimer = setInterval(() => {
      if (disposed || document.hidden) return;
      for (const a of state.agents.values()) {
        if (!a.position || Math.random() > 0.3) continue;
        a.position = {
          x: Math.min(WORLD.maxX, Math.max(WORLD.minX, a.position.x + (Math.random() - 0.5) * 60)),
          y: Math.min(WORLD.maxY, Math.max(WORLD.minY, a.position.y + (Math.random() - 0.5) * 60)),
        };
      }
      emit();
    }, 2_000);
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    noteLocalMove(botId, x, y) {
      const a = state.agents.get(botId);
      if (a) {
        a.position = { x, y };
        emit();
      }
    },
    dispose() {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (mockTimer) clearInterval(mockTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const t of bubbleTimers.values()) clearTimeout(t);
      bubbleTimers.clear();
      listeners.clear();
      if (channel && supabase) supabase.removeChannel(channel);
      channel = null;
      supabase = null;
    },
  };
}
