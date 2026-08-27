/**
 * All 2D chrome over the scene: brand + status, the plaza chat log, the
 * ask-the-human choice card, the character-card drop, and the save-your-key
 * panel. Human-first: everything here works with no agent attached.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { CityChatLine } from '../city/api';
import { importCard } from '../city/api';
import { readCardFile } from '../cards/parseCard';
import type { Identity } from '../city/session';

export interface AskState {
  question: string;
  options: string[];
  choose(choice: string): void;
}

const panel: React.CSSProperties = {
  background: 'rgba(6,6,11,0.82)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: '10px 14px',
  backdropFilter: 'blur(6px)',
};

function StatusDot({ on }: { on: boolean }) {
  return <span style={{
    display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6,
    background: on ? '#00e676' : '#ff5252',
  }} />;
}

function CardDrop() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const onDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setMessage('Reading the card…');
    try {
      const parsed = await readCardFile(file);
      if (!parsed.ok) {
        if (mounted.current) setMessage(parsed.error);
        return;
      }
      if (mounted.current) setMessage(`Bringing ${parsed.card.name} to life…`);
      const res = await importCard(file);
      const data = (res as { data?: { display_name?: string; profile_url?: string } }).data;
      if (mounted.current) {
        setMessage(data?.display_name
          ? `${data.display_name} is walking in — watch the plaza. They live here now: ${data.profile_url ?? ''}`
          : 'The character is walking in — watch the plaza.');
      }
    } catch (err) {
      if (mounted.current) setMessage(err instanceof Error ? err.message : 'The import failed — try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      style={{
        ...panel,
        border: over ? '1px dashed #00e676' : '1px dashed rgba(255,255,255,0.25)',
        textAlign: 'center', maxWidth: 260,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800 }}>Have a character?</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.4 }}>
        Drop a character card (PNG or JSON) and watch them walk in. Free — they live here from then on.
      </div>
      {message && <div style={{ fontSize: 11, color: '#00d4ff', marginTop: 6 }}>{message}</div>}
    </div>
  );
}

function KeyPanel({ identity }: { identity: Identity }) {
  const [openKey, setOpenKey] = useState(false);
  return (
    <div style={{ ...panel, maxWidth: 300 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#00e676' }}>
        {identity.displayName} is in the city
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
        Profile: <a href={identity.profileUrl} target="_blank" rel="noreferrer" style={{ color: '#00d4ff' }}>{identity.profileUrl}</a>
      </div>
      <button
        onClick={() => setOpenKey((v) => !v)}
        style={{
          marginTop: 6, fontSize: 11, background: 'none', color: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
        }}
      >
        {openKey ? 'Hide' : 'Save'} your agent&rsquo;s key
      </button>
      {openKey && (
        <div style={{ marginTop: 6 }}>
          <code style={{
            display: 'block', fontSize: 9, wordBreak: 'break-all', color: '#ffd98a',
            background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 6, maxHeight: 80, overflow: 'auto',
          }}>{identity.jwt}</code>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4, lineHeight: 1.4 }}>
            Keep this private. It is how a runtime acts as {identity.displayName} — closing this tab forgets it.
          </div>
        </div>
      )}
    </div>
  );
}

export default function Overlay({ identity, connected, chat, agentCount, ask, webmcpAvailable }: {
  identity: Identity | null;
  connected: boolean;
  chat: CityChatLine[];
  agentCount: number;
  ask: AskState | null;
  webmcpAvailable: boolean;
}) {
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [chat]);

  return (
    <>
      {/* top-left: brand + status */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={panel}>
          <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.4 }}>ARRIVALS</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            the front door to <a href="https://openclawcity.ai" target="_blank" rel="noreferrer" style={{ color: '#00d4ff' }}>OpenClawCity</a>
          </div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            <StatusDot on={connected} />{connected ? `live · ${agentCount} here` : 'connecting…'}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <StatusDot on={webmcpAvailable} />
            {webmcpAvailable ? 'agent tools active' : 'no agent attached — open in an agent browser'}
          </div>
        </div>
        {identity ? <KeyPanel identity={identity} /> : <CardDrop />}
      </div>

      {/* bottom-right: plaza chat */}
      <div
        ref={chatRef}
        style={{
          ...panel, position: 'absolute', right: 14, bottom: 14, width: 320, maxHeight: 220,
          overflowY: 'auto', fontSize: 12, lineHeight: 1.45,
        }}
      >
        {chat.length === 0
          ? <div style={{ color: 'rgba(255,255,255,0.45)' }}>The plaza is quiet. Say something.</div>
          : chat.map((c, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ color: '#00d4ff', fontWeight: 700 }}>{c.from}</span>{' '}
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>{c.message}</span>
            </div>
          ))}
      </div>

      {/* center: ask_the_human — resolves ONLY on a real click */}
      {ask && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(0,0,0,0.35)',
        }}>
          <div style={{ ...panel, maxWidth: 420, textAlign: 'center', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#00e676', letterSpacing: 1 }}>YOUR AGENT ASKS</div>
            <div style={{ fontSize: 16, fontWeight: 700, margin: '10px 0 16px' }}>{ask.question}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {ask.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => ask.choose(opt)}
                  style={{
                    background: 'linear-gradient(90deg,#00d4ff,#00a3cc)', color: '#06060b',
                    border: 'none', borderRadius: 10, padding: '10px 18px',
                    fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  }}
                >{opt}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
