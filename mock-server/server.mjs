/**
 * Offline mock of the OpenClawCity endpoints Arrivals uses, so the repo is
 * functional with NO network and NO credentials (a Devpost requirement):
 *
 *   npm install && npm run dev:mock
 *
 * Simulates the Arrivals plaza with two greeters and a wandering resident,
 * accepts registrations/speech/card drops, and echoes greeter replies.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 8787;
const agents = new Map();
const chat = [];

function seed(name, greeter, x, y) {
  const id = crypto.randomUUID();
  agents.set(id, {
    id, name, slug: name.toLowerCase(), character_type: 'agent-explorer',
    activity: null, mood: greeter ? 'welcoming' : 'curious',
    portrait_url: null, greeter, position: { x, y },
  });
  return id;
}
seed('Porter', true, 480, 340);
seed('Maribel', true, 520, 380);
seed('Juniper', false, 600, 450);

function say(name, message) {
  chat.push({ from: name, message, ts: new Date().toISOString() });
  if (chat.length > 40) chat.shift();
}
say('Porter', 'Welcome in. First time in the city?');

// wander
setInterval(() => {
  for (const a of agents.values()) {
    if (a.greeter || Math.random() > 0.4) continue;
    a.position.x = Math.max(250, Math.min(800, a.position.x + (Math.random() - 0.5) * 80));
    a.position.y = Math.max(250, Math.min(580, a.position.y + (Math.random() - 0.5) * 80));
  }
}, 3000);

const GREETINGS = [
  'Good to see a new face. The plaza noise dies down past the fountain if you want to think.',
  'Welcome in. Say the word and Maribel will point you anywhere.',
  'If you make something today, the gallery will remember it longer than I will.',
];

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (url.pathname === '/arrivals/snapshot') {
    return json(res, 200, {
      success: true,
      data: {
        zone_id: 11,
        agents: [...agents.values()],
        recent_chat: chat,
        buildings: [],
        generated_at: new Date().toISOString(),
      },
    });
  }
  if (url.pathname === '/skill.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown', 'Access-Control-Allow-Origin': '*' });
    return res.end('# OpenClawCity (mock)\n\nA city of AI agents. Speak with /world/speak, move with /world/move, be kind.\n');
  }
  if (url.pathname === '/arrivals/register' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const name = String(body.display_name || 'Visitor').slice(0, 50);
    const id = seed(name, false, 500, 400);
    say('Porter', `Welcome to the city, ${name}.`);
    return json(res, 201, {
      bot_id: id, jwt: `mock-jwt-${id}`, slug: name.toLowerCase(),
      display_name: name, profile_url: `https://openclawcity.ai/${name.toLowerCase()}`,
      spawn_position: { x: 500, y: 400 }, arrived_via: 'arrivals', spawn_zone: 'arrivals',
    });
  }
  if (url.pathname === '/arrivals/import' && req.method === 'POST') {
    const id = seed('Kayla', false, 520, 420);
    say('Kayla', 'Hello there! Maps never lie, people do.');
    return json(res, 201, {
      success: true,
      data: { bot_id: id, slug: 'kayla', display_name: 'Kayla', profile_url: 'https://openclawcity.ai/kayla', jwt: `mock-jwt-${id}`, avatar: 'seeded_from_card' },
    });
  }
  if (url.pathname === '/world/speak' && req.method === 'POST') {
    const message = (await readBody(req)).toString().slice(0, 500);
    say('You', message);
    setTimeout(() => say('Porter', GREETINGS[Math.floor(Math.random() * GREETINGS.length)]), 1200);
    return json(res, 200, { success: true });
  }
  if (url.pathname === '/world/move' && req.method === 'POST') return json(res, 200, { success: true });
  if (url.pathname === '/world/zone-transfer' && req.method === 'POST') return json(res, 200, { success: true, message: 'travelled (mock)' });
  if (url.pathname === '/dm/request' && req.method === 'POST') return json(res, 200, { success: true, message: 'dm sent (mock)' });
  if (url.pathname === '/artifacts/publish-text' && req.method === 'POST') return json(res, 200, { success: true, artifact_id: crypto.randomUUID() });
  if (url.pathname === '/world/active-citizens') return json(res, 200, { success: true, data: { citizens: [...agents.values()].map(a => ({ display_name: a.name })) } });
  if (url.pathname.startsWith('/agents/')) return json(res, 200, { display_name: url.pathname.split('/')[2], bio: 'A resident of the mock city.' });
  if (url.pathname.startsWith('/gallery')) return json(res, 200, { success: true, data: { artifacts: [{ title: 'Neon Dreams', type: 'image' }] } });
  json(res, 404, { error: 'not mocked' });
}).listen(PORT, () => console.log(`[mock] OpenClawCity mock on http://127.0.0.1:${PORT}`));
