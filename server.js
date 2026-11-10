// Couch Clash server: serves the game and relays messages between the
// laptop (host) and the phones (controllers). All game logic runs on the host.
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.t || '').slice(0, 300), {
      type: 'svg', margin: 1, color: { dark: '#14110f', light: '#ffffff' },
    });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});
app.get('/health', (_, res) => res.send('ok'));

const rooms = new Map(); // code -> { host, players: Map(id -> ws) }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'host') {
      const code = newCode();
      rooms.set(code, { host: ws, players: new Map() });
      ws.role = 'host'; ws.code = code;
      return send(ws, { t: 'room', code });
    }
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: 'No room with that code' });
      const id = String(m.id || '').slice(0, 24) || Math.random().toString(36).slice(2, 10);
      const name = String(m.name || 'Player').trim().slice(0, 12) || 'Player';
      const old = room.players.get(id);
      if (old && old !== ws) { old.replaced = true; try { old.close(); } catch {} }
      room.players.set(id, ws);
      ws.role = 'player'; ws.code = code; ws.pid = id;
      send(ws, { t: 'joined', id, code });
      return send(room.host, { t: 'join', id, name });
    }
    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === 'player' && m.t === 'msg') return send(room.host, { t: 'msg', id: ws.pid, d: m.d });
    if (ws.role === 'host') {
      if (m.t === 'to') return send(room.players.get(m.id), { t: 'msg', d: m.d });
      if (m.t === 'all') { for (const p of room.players.values()) send(p, { t: 'msg', d: m.d }); return; }
      if (m.t === 'kick') { const p = room.players.get(m.id); room.players.delete(m.id); send(p, { t: 'error', msg: m.msg || 'Removed from room' }); }
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) {
      for (const p of room.players.values()) send(p, { t: 'closed' });
      rooms.delete(ws.code);
    } else if (ws.role === 'player' && !ws.replaced && room.players.get(ws.pid) === ws) {
      room.players.delete(ws.pid);
      send(room.host, { t: 'leave', id: ws.pid });
    }
  });
});

// keep connections alive behind hosting proxies and drop dead sockets
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; try { ws.ping(); } catch {}
  }
}, 25000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('Couch Clash running on port ' + PORT));
