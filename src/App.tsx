/**
 * Arrivals — page shell. Owns the three long-lived objects and their teardown:
 * the live city feed (city/live.ts), the WebMCP tool registration
 * (webmcp/tools.ts), and the ask-the-human bridge. The page is fully usable
 * by a human with no agent present; WebMCP is additive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Scene, { DISTRICT_BUILDINGS, toScene } from './scene/Scene';
import { startLive, type LiveHandle, type LiveState } from './city/live';
import { registerArrivalsTools, type UiBridge } from './webmcp/tools';
import { getIdentity, onIdentityChange, type Identity } from './city/session';
import { getModelContext } from './webmcp/types';
import Overlay, { type AskState } from './ui/Overlay';

const ASK_TIMEOUT_MS = 60_000;
const HIGHLIGHT_MS = 8_000;

export default function App() {
  const liveRef = useRef<LiveHandle | null>(null);
  const focusRef = useRef<[number, number] | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(() => getIdentity());
  const [ask, setAsk] = useState<AskState | null>(null);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [webmcpAvailable, setWebmcpAvailable] = useState(() => getModelContext() !== null);

  // ── the live feed: one instance for the page's lifetime ──
  useEffect(() => {
    const live = startLive();
    liveRef.current = live;
    const unsub = live.subscribe((s) => setLiveState({ ...s, agents: s.agents }));
    return () => {
      unsub();
      live.dispose();
      liveRef.current = null;
    };
  }, []);

  useEffect(() => onIdentityChange(setIdentity), []);

  // ── ui bridge for the tools ──
  const findTarget = useCallback((name: string): [number, number] | null => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const live = liveRef.current;
    if (live) {
      for (const a of live.getState().agents.values()) {
        if (a.name.toLowerCase() === n && a.position) return toScene(a.position.x, a.position.y);
      }
    }
    const b = DISTRICT_BUILDINGS.find((x) => x.name.toLowerCase() === n);
    if (b) return b.pos;
    if (n === 'the fountain' || n === 'fountain') return [0, 0];
    return null;
  }, []);

  const bridge = useMemo<UiBridge>(() => ({
    askHuman(question, options) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          setAsk(null);
          resolve({ answered: false });
        }, ASK_TIMEOUT_MS);
        setAsk({
          question,
          options,
          choose(choice) {
            clearTimeout(timer);
            setAsk(null);
            resolve({ answered: true, choice });
          },
        });
      });
    },
    showHuman(target, note) {
      const pos = findTarget(target);
      if (!pos) return false;
      focusRef.current = pos;
      const key = target.trim().toLowerCase();
      setHighlights((h) => ({ ...h, [key]: note }));
      const timers = highlightTimers.current;
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        setHighlights((h) => {
          const next = { ...h };
          delete next[key];
          return next;
        });
      }, HIGHLIGHT_MS));
      return true;
    },
    lookAt(target) {
      const pos = findTarget(target);
      if (!pos) return false;
      focusRef.current = pos;
      return true;
    },
    identityChanged() {
      setIdentity(getIdentity());
    },
  }), [findTarget]);

  // ── WebMCP registration: once, torn down on unmount ──
  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    const dispose = registerArrivalsTools(live, bridge, () => setWebmcpAvailable(true));
    return dispose;
    // bridge is stable (useMemo on stable deps); live is created in the first
    // effect which runs before this one in mount order.
  }, [bridge]);

  // clear any pending highlight timers on unmount
  useEffect(() => {
    const timers = highlightTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const agents = liveState ? [...liveState.agents.values()] : [];

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <Scene
        agents={agents}
        selfId={identity?.botId ?? null}
        focusRef={focusRef}
        highlights={highlights}
      />
      <Overlay
        identity={identity}
        connected={liveState?.connected ?? false}
        chat={liveState?.chat ?? []}
        agentCount={agents.length}
        ask={ask}
        webmcpAvailable={webmcpAvailable}
        servicesDown={liveState?.servicesDown ?? null}
      />
    </div>
  );
}
