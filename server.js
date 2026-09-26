// Servidor de MOUTH OF CHAOS: Express sirve los archivos, Socket.IO sincroniza la partida.
// Todo el estado vive en memoria (sin base de datos).
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const C = require('./public/shared/config');
const Game = require('./public/shared/game');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.send('ok'));

// IPs de la red local (para conectar los celulares cuando el servidor corre en tu PC)
function lanIps() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
}
app.get('/lan', (req, res) => res.json({ ips: lanIps() }));

const server = http.createServer(app);
const io = new Server(server);

const game = new Game({ mode: 4 });
const tokens = new Map();         // token -> id de jugador
const playerSockets = new Map();  // id de jugador -> socket
let lastLobbyVersion = -1;

function sendLobby() {
  lastLobbyVersion = game.lobbyVersion;
  io.emit('lobby', game.lobbyInfo());
}

io.on('connection', (socket) => {
  // ── Pantalla principal (proyector) ──
  socket.on('screen:hello', () => {
    socket.join('screens');
    socket.emit('lobby', game.lobbyInfo());
  });
  socket.on('screen:mode', (mode) => { game.setMode(mode); sendLobby(); });
  socket.on('screen:bots', (on) => { if (on) game.fillBots(); else game.removeBots(); sendLobby(); });
  // Expulsar a un jugador (solo en el lobby): pierde su lugar y su celular vuelve a la pantalla de nombre
  socket.on('screen:kick', (id) => {
    if (game.state !== 'lobby' || !game.players.has(id)) return;
    for (const [t, pid] of tokens) if (pid === id) tokens.delete(t);
    const s = playerSockets.get(id);
    if (s) { s.data.pid = null; s.emit('kicked'); }
    playerSockets.delete(id);
    game.removePlayer(id);
    sendLobby();
  });

  // Cualquiera (pantalla o jugador) puede iniciar / volver a jugar
  socket.on('start', () => { if (game.start()) sendLobby(); });
  socket.on('again', () => { game.backToLobby(); sendLobby(); });

  // ── Jugadores (celulares) ──
  socket.on('player:join', (data, ack) => {
    if (typeof ack !== 'function') return;
    data = data || {};
    const name = String(data.name || '').trim().slice(0, 14) || 'Jugador';
    let p = data.token && tokens.has(data.token) ? game.players.get(tokens.get(data.token)) : null;
    let token = data.token;
    if (!p) {
      if (game.state !== 'lobby') return ack({ ok: false, error: 'Hay una partida en curso. Espera a que termine.' });
      if (game.humanCount() >= C.MAX_PLAYERS) return ack({ ok: false, error: 'La sala está llena.' });
      p = game.addPlayer({ name });
      token = crypto.randomBytes(12).toString('hex');
      tokens.set(token, p.id);
    } else if (game.state === 'lobby') {
      p.name = name;
    }
    const old = playerSockets.get(p.id);
    if (old && old !== socket) old.data.pid = null;
    p.connected = true;
    p.input = { mx: 0, my: 0, tx: 0, fire: false, act: false, jump: 0, weapon: 0, throw: 0, shield: 0 };
    p.seen = { jump: 0, weapon: 0, throw: 0, shield: 0 };
    socket.data.pid = p.id;
    playerSockets.set(p.id, socket);
    game.lobbyVersion++;
    ack({ ok: true, id: p.id, token });
  });

  socket.on('player:view', (on) => { if (on) socket.join('phones'); else socket.leave('phones'); });
  socket.on('player:team', (team) => { if (socket.data.pid) game.setTeam(socket.data.pid, team); });

  socket.on('player:leave', () => {
    const id = socket.data.pid;
    if (!id) return;
    for (const [t, pid] of tokens) if (pid === id) tokens.delete(t);
    playerSockets.delete(id);
    socket.data.pid = null;
    if (game.state === 'lobby') game.removePlayer(id);
  });

  socket.on('input', (inp) => { if (socket.data.pid) game.setInput(socket.data.pid, inp); });

  socket.on('disconnect', () => {
    const id = socket.data.pid;
    if (!id || playerSockets.get(id) !== socket) return;
    playerSockets.delete(id);
    const p = game.players.get(id);
    if (!p) return;
    p.connected = false;
    p.input = { mx: 0, my: 0, tx: 0, fire: false, act: false, jump: p.seen.jump, weapon: p.seen.weapon, throw: p.seen.throw, shield: p.seen.shield };
    game.lobbyVersion++;
    // En el lobby, si no vuelve en 15 s se libera su lugar
    setTimeout(() => {
      const q = game.players.get(id);
      if (q && !q.connected && game.state === 'lobby') {
        for (const [t, pid] of tokens) if (pid === id) tokens.delete(t);
        game.removePlayer(id);
      }
    }, 15000);
  });
});

// ── Bucle del servidor ──
let last = Date.now(), tick = 0, pendingPhoneEvents = [];
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  tick++;

  const events = game.drainEvents();
  if (game.state !== 'lobby' || events.length) {
    const snap = game.snapshot();
    snap.t = now;
    snap.ev = events;
    io.to('screens').emit('snap', snap);
    // celulares: 15 por segundo (acumulando los eventos de la instantánea anterior)
    pendingPhoneEvents.push(...events);
    if (tick % 2 === 0) { io.to('phones').emit('snap', Object.assign({}, snap, { ev: pendingPhoneEvents })); pendingPhoneEvents = []; }
  }
  // Vibración en el celular del jugador afectado
  events.forEach((e) => {
    if ((e.type === 'hit' || e.type === 'slimed' || e.type === 'kill') && playerSockets.has(e.id)) playerSockets.get(e.id).emit('buzz', e.type);
  });
  // Estado privado de cada celular (10 veces por segundo)
  if (tick % 3 === 0) playerSockets.forEach((s, id) => s.emit('me', game.privateState(id)));
  if (game.lobbyVersion !== lastLobbyVersion) sendLobby();
}, 1000 / C.TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MOUTH OF CHAOS escuchando en http://localhost:${PORT}`);
  lanIps().forEach((ip) => console.log(`  Celulares (misma red WiFi): http://${ip}:${PORT}/controller.html`));
});
