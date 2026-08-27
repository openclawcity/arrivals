/**
 * Browser-side character-card reader (ported from OpenClawCity #1707) — powers the INSTANT preview in
 * the Arrivals card drop before any sign-in. This is a light mirror of the
 * authoritative server parser (workers/src/lib/characterCard.ts): the server
 * re-parses, screens, and enforces every limit at import time; nothing here
 * is trusted. Kept dependency-free and allocation-light for the browser.
 */

export interface ClientCard {
  spec: 'v1' | 'v2' | 'v3';
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  tags: string[];
  creator: string;
  /** The raw JSON to send to the server (server does the real parse). */
  rawJson: string;
}

export const CLIENT_CARD_MAX_FILE_BYTES = 10 * 1024 * 1024;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIG.every((b, i) => bytes[i] === b);
}

/** Extract the embedded card JSON from a PNG (ccv3 preferred over chara). */
function extractPngCardJson(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let charaB64: string | null = null;
  while (off + 12 <= bytes.length) {
    const len = view.getUint32(off);
    if (len > bytes.length - off - 12) break;
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    if (type === 'tEXt') {
      const data = bytes.subarray(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      if (nul > 0) {
        let kw = '';
        for (let i = 0; i < nul; i++) kw += String.fromCharCode(data[i]);
        kw = kw.toLowerCase();
        if (kw === 'ccv3' || (kw === 'chara' && charaB64 === null)) {
          let b64 = '';
          for (let i = nul + 1; i < data.length; i++) b64 += String.fromCharCode(data[i]);
          if (kw === 'ccv3') return b64;
          charaB64 = b64;
        }
      }
    }
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return charaB64;
}

function decodeB64Utf8(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

function s(v: unknown): string { return typeof v === 'string' ? v : ''; }

function normalize(json: string): ClientCard | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.charCodeAt(0) === 0xfeff ? json.slice(1) : json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const top = parsed as Record<string, unknown>;
  let spec: ClientCard['spec'];
  let data: Record<string, unknown>;
  if (top.spec === 'chara_card_v3' && top.data && typeof top.data === 'object') { spec = 'v3'; data = top.data as Record<string, unknown>; }
  else if (top.spec === 'chara_card_v2' && top.data && typeof top.data === 'object') { spec = 'v2'; data = top.data as Record<string, unknown>; }
  else if (typeof top.name === 'string' || typeof top.first_mes === 'string') { spec = 'v1'; data = top; }
  else return null;
  const name = (s(data.nickname) || s(data.name)).trim().slice(0, 64);
  if (!name) return null;
  return {
    spec,
    name,
    description: s(data.description),
    personality: s(data.personality),
    scenario: s(data.scenario),
    firstMes: s(data.first_mes),
    tags: Array.isArray(data.tags) ? (data.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    creator: s(data.creator),
    rawJson: json,
  };
}

/** File → bytes with a FileReader fallback (older Safari, jsdom). */
async function fileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return await new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export type ClientCardResult =
  | { ok: true; card: ClientCard; artworkUrl: string | null }
  | { ok: false; error: string };

/** Parse a dropped/picked file (card PNG or JSON) in the browser. */
export async function readCardFile(file: File): Promise<ClientCardResult> {
  if (file.size > CLIENT_CARD_MAX_FILE_BYTES) {
    return { ok: false, error: 'That file is over 10 MB.' };
  }
  const bytes = await fileBytes(file);
  if (isPng(bytes)) {
    const b64 = extractPngCardJson(bytes);
    if (!b64) {
      return { ok: false, error: 'This PNG has no character data inside. Discord and most image hosts strip it — re-download the original card file from where the character was published.' };
    }
    const json = decodeB64Utf8(b64);
    const card = json ? normalize(json) : null;
    if (!card) return { ok: false, error: 'The embedded character data is damaged. Try the JSON export instead.' };
    // The card's own pixels are the avatar preview (and later the sprite).
    return { ok: true, card, artworkUrl: URL.createObjectURL(file) };
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  if (text.trimStart().startsWith('{') || text.charCodeAt(0) === 0xfeff) {
    const card = normalize(text);
    if (!card) return { ok: false, error: 'That JSON is not a character card (or has no name).' };
    return { ok: true, card, artworkUrl: null };
  }
  return { ok: false, error: 'Unsupported file. Upload the character card PNG or its JSON export.' };
}

/** Parse pasted JSON. */
export function readCardJson(text: string): ClientCardResult {
  const card = normalize(text);
  if (!card) return { ok: false, error: 'That JSON is not a character card (or has no name).' };
  return { ok: true, card, artworkUrl: null };
}

/** Build a V1 card from the Character.AI editor's four paste fields. */
export function cardFromCharacterAiFields(fields: { name: string; greeting: string; description: string; definition: string }): ClientCardResult {
  const name = fields.name.trim().slice(0, 64);
  if (!name) return { ok: false, error: 'The character needs a name.' };
  const json = JSON.stringify({
    name,
    description: fields.description.trim(),
    personality: '',
    scenario: '',
    first_mes: fields.greeting.trim(),
    mes_example: fields.definition.trim(),
  });
  const card = normalize(json);
  if (!card) return { ok: false, error: 'Could not build a character from those fields.' };
  return { ok: true, card, artworkUrl: null };
}
