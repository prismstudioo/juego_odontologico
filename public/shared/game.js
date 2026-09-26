// Simulación autoritativa de una partida de MOUTH OF CHAOS.
// La usa el servidor (multijugador) y el navegador (modo prueba de 1 dispositivo con bots).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./config'), require('./map'));
  else root.MOC.Game = factory(root.MOC.CONFIG, root.MOC.MAP);
})(typeof self !== 'undefined' ? self : this, function (C, MAP) {
  const TEAMS = ['doc', 'bac'];
  const SKINS = ['alan', 'karina'];
  const BOT_NAMES = {
    doc: ['🤖 DRA. BOT', '🤖 DR. ROBOT', '🤖 DR. MOLAR', '🤖 DRA. FLÚOR', '🤖 DR. HILO', '🤖 DRA. PASTA', '🤖 DR. BRACKET'],
    bac: ['🤖 BOT CARIES', '🤖 BOT PLACA', '🤖 BOT SARRO', '🤖 BOT ENCÍA', '🤖 BOT HALITO', '🤖 BOT MUTANS', '🤖 BOT CÁNDIDA'],
  };
  const validMode = (m) => (C.MODES[m] ? +m : 4);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const emptyInput = () => ({ mx: 0, my: 0, tx: 0, fire: false, act: false, jump: 0, weapon: 0, throw: 0, shield: 0 });

  // Línea de visión sin paredes entre dos puntos
  function lineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (MAP.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  class Game {
    constructor(opts = {}) {
      this.mode = validMode(opts.mode);
      this.players = new Map();
      this.state = 'lobby';
      this.events = [];
      this.nextId = 1;
      this.lobbyVersion = 0;
      this.resetMatch();
    }

    slots(team) { return C.MODES[this.mode][team]; }

    // ───────────── Lobby ─────────────
    setMode(mode) {
      if (this.state !== 'lobby') return;
      this.mode = validMode(mode);
      TEAMS.forEach((team) => {
        const members = this.teamMembers(team).sort((a, b) => a.isBot - b.isBot);
        members.slice(this.slots(team)).forEach((p) => {
          if (p.isBot) this.players.delete(p.id); else { p.team = null; p.skin = null; }
        });
      });
      this.lobbyVersion++;
    }

    addPlayer(info) {
      const id = info.id || 'p' + this.nextId++;
      const p = {
        id, name: String(info.name || 'Jugador').slice(0, 14), team: null, skin: null,
        isBot: !!info.isBot, connected: true,
        x: 0, y: 0, a: 0, z: 0, vz: 0, hp: 100, maxHp: 100, alive: true,
        deadT: 0, slimedT: 0, immuneT: 0, weaponIdx: 0, cds: {}, flashT: 0, stunT: 0, sticky: 0, stickyT: 0, boostT: 0, crown: false, contagionT: 0, contagionTick: 0, contagionLeft: 0,
        input: emptyInput(), seen: { jump: 0, weapon: 0, throw: 0, shield: 0 }, shieldT: 0, shieldCd: 0,
        action: null, bomb: null, bot: null,
      };
      this.players.set(id, p);
      if (info.team) this.setTeam(id, info.team);
      this.lobbyVersion++;
      return p;
    }

    removePlayer(id) {
      const p = this.players.get(id);
      if (!p) return;
      this.dropBomb(p);
      this.players.delete(id);
      this.lobbyVersion++;
    }

    teamMembers(team) { return [...this.players.values()].filter((p) => p.team === team); }

    setTeam(id, team) {
      const p = this.players.get(id);
      if (!p || this.state !== 'lobby' || !TEAMS.includes(team)) return false;
      if (p.team === team) return true;
      let members = this.teamMembers(team);
      if (members.length >= this.slots(team)) {
        // un humano puede quitarle el lugar a un bot
        const bot = !p.isBot && members.find((m) => m.isBot);
        if (!bot) return false;
        this.players.delete(bot.id);
        members = this.teamMembers(team);
      }
      p.team = team;
      p.skin = SKINS.find((s) => !members.some((m) => m.skin === s)) || SKINS[members.length % SKINS.length];
      this.lobbyVersion++;
      return true;
    }

    // Rellena los lugares libres con bots (modo solitario o si faltan jugadores)
    fillBots() {
      if (this.state !== 'lobby') return;
      TEAMS.forEach((team) => {
        let i = 0;
        while (this.teamMembers(team).length < this.slots(team)) {
          this.addPlayer({ name: BOT_NAMES[team][i++ % BOT_NAMES[team].length], team, isBot: true });
        }
      });
    }

    removeBots() {
      if (this.state !== 'lobby') return;
      [...this.players.values()].filter((p) => p.isBot).forEach((p) => this.removePlayer(p.id));
    }

    humanCount() { return [...this.players.values()].filter((p) => !p.isBot).length; }

    canStart() {
      return this.state === 'lobby' && TEAMS.every((t) => this.teamMembers(t).length === this.slots(t));
    }

    lobbyInfo() {
      return {
        mode: this.mode, state: this.state, slots: { ...C.MODES[this.mode] }, canStart: this.canStart(),
        players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, skin: p.skin, connected: p.connected, bot: p.isBot })),
      };
    }

    // ───────────── Partida ─────────────
    resetMatch() {
      const dirty = shuffle([...Array(16).keys()]).slice(0, 8);
      this.teeth = MAP.teeth.map((t) => ({ ...t, state: dirty.includes(t.id) ? 'dirty' : 'clean', crownT: 0 }));
      this.projectiles = [];
      this.zones = [];
      this.bombs = [];
      this.fungi = [];
      this.stones = [];
      this.pickups = [];
      MAP.setMazeOpen(false);
      this.blocked = null; // recalcular caminos de bots
      this.mazeOpen = false; this.legend = null; this.legendWarned = false;
      this.mazeCells = this.mazeCells || new Set(MAP.maze.cells);
      this.hazard = { fungus: C.FUNGUS.firstAt, tonsil: C.TONSIL.firstAt, boost: C.BOOST.firstAt, special: C.CROWN.firstAt };
      this.timeLeft = C.GAME_DURATION;
      this.countdown = C.COUNTDOWN;
      this.teamProgress = { doc: 0, bac: 0 };
      this.result = null;
      this.uid = 1;
      // 2 bombas por equipo, en momentos aleatorios repartidos por la partida
      const types = Array(C.BOMBS_PER_MATCH).fill('neutral');
      const [w0, w1] = C.BOMB_SPAWN_WINDOW, seg = (w1 - w0) / types.length;
      this.bombSchedule = types.map((type, i) => ({ type, at: w0 + seg * i + Math.random() * seg * 0.7 }));
    }

    start() {
      if (!this.canStart()) return false;
      this.resetMatch();
      const idx = { doc: 0, bac: 0 };
      this.players.forEach((p) => {
        if (!p.team) return;
        p.spawn = MAP.spawns[p.team][idx[p.team]++ % MAP.spawns[p.team].length];
        this.respawn(p);
        p.weaponIdx = p.team === 'doc' ? 1 : 0; // odontólogos empiezan con la pistola, bacterias con viscosidad
        p.cds = {};
        p.bot = null;
      });
      this.state = 'countdown';
      this.lastCount = C.COUNTDOWN + 1;
      this.lobbyVersion++;
      return true;
    }

    backToLobby() {
      if (this.state !== 'results') return;
      this.state = 'lobby';
      this.resetMatch();
      this.lobbyVersion++;
    }

    emit(ev) { this.events.push(ev); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    setInput(id, inp) {
      const p = this.players.get(id);
      if (!p || !inp) return;
      const i = p.input;
      i.mx = clamp(num(inp.mx), -1, 1);
      i.my = clamp(num(inp.my), -1, 1);
      i.tx = clamp(num(inp.tx), -1, 1);
      i.look = (i.look || 0) + clamp(num(inp.look), -C.MAX_LOOK_PER_INPUT, C.MAX_LOOK_PER_INPUT);
      i.fire = !!inp.fire;
      i.act = !!inp.act;
      i.jump = num(inp.jump) | 0;
      i.weapon = num(inp.weapon) | 0;
      i.throw = num(inp.throw) | 0;
      i.shield = num(inp.shield) | 0;
    }

    respawn(p) {
      const s = p.spawn;
      p.x = s.x; p.y = s.y; p.a = s.a; p.z = 0; p.vz = 0;
      p.maxHp = p.team === 'doc' ? C.DOCTOR_HP : C.BACTERIA_HP;
      p.hp = p.maxHp;
      p.alive = true; p.deadT = 0; p.slimedT = 0; p.immuneT = 0; p.action = null; p.flashT = 0;
      p.stunT = 0; p.sticky = 0; p.stickyT = 0; p.boostT = 0; p.contagionT = 0; p.shieldT = 0;
    }

    weaponOf(p) { return C.TEAM_WEAPONS[p.team][p.weaponIdx % C.TEAM_WEAPONS[p.team].length]; }

    update(dt) {
      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n < this.lastCount && n > 0) { this.lastCount = n; this.emit({ type: 'count', n }); }
        if (this.countdown <= 0) { this.state = 'playing'; this.emit({ type: 'go' }); }
        return;
      }
      if (this.state !== 'playing') return;

      this.timeLeft -= dt;
      const elapsed = C.GAME_DURATION - this.timeLeft;
      while (this.bombSchedule.length && this.bombSchedule[0].at <= elapsed) this.spawnBomb(this.bombSchedule.shift().type);

      this.players.forEach((p) => { if (p.team) { if (p.isBot) this.botThink(p, dt); this.updatePlayer(p, dt); } });
      this.updateProjectiles(dt);
      this.updateZones(dt);
      this.updateBombs(dt);
      this.updateHazards(dt, elapsed);
      this.updateLegend();

      if (this.timeLeft <= 0) this.finish();
    }

    finish() {
      this.timeLeft = 0;
      const clean = this.teeth.filter((t) => t.state === 'clean').length, dirty = 16 - clean;
      let winner = clean > dirty ? 'doc' : dirty > clean ? 'bac' : null, tiebreak = false;
      if (!winner) {
        tiebreak = true;
        const d = this.teamProgress.doc, b = this.teamProgress.bac;
        winner = d > b ? 'doc' : b > d ? 'bac' : 'tie';
      }
      this.result = { clean, dirty, winner, tiebreak, progress: { doc: Math.round(this.teamProgress.doc * 10) / 10, bac: Math.round(this.teamProgress.bac * 10) / 10 } };
      this.state = 'results';
      this.projectiles = []; this.zones = []; this.fungi = []; this.stones = []; this.pickups = [];
      this.players.forEach((p) => { p.action = null; });
      this.emit({ type: 'end', result: this.result });
      this.lobbyVersion++;
    }

    // ───────────── Jugadores ─────────────
    updatePlayer(p, dt) {
      const inp = p.input;
      p.flashT = Math.max(0, p.flashT - dt);
      for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);

      if (!p.alive) {
        p.deadT -= dt;
        if (p.deadT <= 0) { this.respawn(p); this.emit({ type: 'respawn', id: p.id }); }
        inp.look = 0;
        this.syncCounters(p);
        return;
      }
      if (p.slimedT > 0) {
        p.slimedT -= dt;
        if (p.slimedT <= 0) { p.slimedT = 0; p.immuneT = C.SLIME_IMMUNITY_TIME; this.emit({ type: 'unslimed', id: p.id }); }
      } else if (p.immuneT > 0) p.immuneT = Math.max(0, p.immuneT - dt);
      if (p.stunT > 0) p.stunT = Math.max(0, p.stunT - dt);
      if (p.stickyT > 0) { p.stickyT -= dt; if (p.stickyT <= 0) { p.stickyT = 0; p.sticky = 0; } }
      if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);
      if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shieldT = 0; p.shieldCd = C.SHIELD_COOLDOWN; } }
      else if (p.shieldCd > 0) p.shieldCd = Math.max(0, p.shieldCd - dt);
      const stuck = p.slimedT > 0 || p.stunT > 0;

      // Girar: siempre permitido (aunque esté inmovilizado puede seguir viendo)
      p.a = (p.a + inp.tx * Math.abs(inp.tx) * C.TURN_SPEED * dt + (inp.look || 0)) % TAU;
      inp.look = 0;

      // Botones de un solo toque (contadores)
      if (inp.weapon !== p.seen.weapon && !stuck) {
        p.weaponIdx = (p.weaponIdx + 1) % C.TEAM_WEAPONS[p.team].length;
        this.emit({ type: 'weapon', id: p.id, weapon: this.weaponOf(p) });
      }
      if (inp.jump !== p.seen.jump && !stuck && p.z <= 0) { p.vz = C.JUMP_VELOCITY; this.emit({ type: 'jump', id: p.id }); }
      if (inp.throw !== p.seen.throw && !stuck && p.bomb) this.throwBomb(p);
      if (inp.shield !== p.seen.shield && !stuck && p.team === 'doc' && p.shieldT <= 0 && p.shieldCd <= 0) {
        p.shieldT = C.SHIELD_TIME;
        this.emit({ type: 'shield', id: p.id });
      }
      this.syncCounters(p);

      // Salto
      if (p.z > 0 || p.vz > 0) {
        p.z += p.vz * dt; p.vz -= C.GRAVITY * dt;
        if (p.z <= 0) { p.z = 0; p.vz = 0; }
      }

      // Movimiento relativo a la vista
      if (!stuck) {
        let fwd = -inp.my, str = inp.mx;
        const mag = Math.hypot(fwd, str);
        if (mag > 1) { fwd /= mag; str /= mag; }
        if (mag > 0.08) {
          const sp = this.speedOf(p);
          const ca = Math.cos(p.a), sa = Math.sin(p.a);
          this.moveCircle(p, (ca * fwd - sa * str) * sp * dt, (sa * fwd + ca * str) * sp * dt);
        }
      }

      // Disparo
      if (inp.fire && !stuck && !(p.shieldT > 0)) this.tryFire(p); // con escudo no se puede disparar

      // Limpiar / ensuciar
      this.updateAction(p, dt, inp.act && !stuck);

      // Recoger bomba
      if (!p.bomb) {
        const b = this.bombs.find((b) => b.state === 'ground' && Math.hypot(b.x - p.x, b.y - p.y) < C.PICKUP_RADIUS);
        if (b) { b.team = p.team; b.type = p.team === 'doc' ? 'clean' : 'dirty'; b.state = 'held'; b.holder = p.id; b.t = C.BOMB_HOLD_TIME; p.bomb = b.id; this.emit({ type: 'bombPick', id: p.id, bombType: b.type }); }
      }

      // Potenciadores (flúor para odontólogos, azúcar para bacterias)
      const pk = this.pickups.find((k) => k.team === p.team && Math.hypot(k.x - p.x, k.y - p.y) < C.BOOST.radius
        && !(k.type === 'crown' && p.crown) && !(k.type === 'strain' && p.contagionT > 0));
      if (pk) {
        this.pickups = this.pickups.filter((k) => k !== pk);
        if (pk.type === 'crown') { p.crown = true; this.emit({ type: 'crownPick', id: p.id }); }
        else if (pk.type === 'strain') {
          p.contagionT = C.CONTAGION.duration; p.contagionTick = C.CONTAGION.every; p.contagionLeft = C.CONTAGION.maxTeeth;
          this.emit({ type: 'contagionStart', id: p.id });
        } else { p.boostT = C.BOOST.duration; this.emit({ type: 'boost', id: p.id, kind: pk.type }); }
      }
    }

    speedOf(p) {
      let sp = p.team === 'doc' ? C.DOCTOR_SPEED : C.BACTERIA_SPEED;
      if (p.action) sp *= 0.6;
      if (p.sticky) sp *= C.STICKY_SPEED;
      if (p.boostT > 0) sp *= C.BOOST.speed;
      if (p.z <= 0) {
        const f = MAP.floor[Math.floor(p.y) * MAP.W + Math.floor(p.x)];
        if (f === MAP.FLOOR.SALIVA) sp *= C.SALIVA_SPEED;
        else if (f === MAP.FLOOR.CAVITY) sp *= C.CAVITY_SPEED;
      }
      return sp;
    }

    syncCounters(p) { p.seen.jump = p.input.jump; p.seen.weapon = p.input.weapon; p.seen.throw = p.input.throw; p.seen.shield = p.input.shield; }

    collides(x, y, z, p) {
      const r = C.PLAYER_RADIUS;
      for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
        for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
          if (!MAP.isSolidCell(cx, cy)) continue;
          const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
          if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
        }
      for (const t of this.teeth) if ((x - t.x) ** 2 + (y - t.y) ** 2 < (t.r + r) ** 2) return true;
      if (z < C.FOOD_JUMP_HEIGHT) for (const f of MAP.props) if ((x - f.x) ** 2 + (y - f.y) ** 2 < (f.r + r) ** 2) return true;
      const rr = (C.TONSIL.rockRadius + r) ** 2;
      for (const s of this.stones) {
        if (s.state !== 'rock' || (x - s.x) ** 2 + (y - s.y) ** 2 >= rr) continue;
        if (!p || (p.x - s.x) ** 2 + (p.y - s.y) ** 2 >= rr) return true; // si ya estaba encima puede salir
      }
      return false;
    }

    moveCircle(p, dx, dy) {
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.15) || 1;
      for (let i = 0; i < steps; i++) {
        if (!this.collides(p.x + dx / steps, p.y, p.z, p)) p.x += dx / steps;
        if (!this.collides(p.x, p.y + dy / steps, p.z, p)) p.y += dy / steps;
      }
    }

    nearestTooth(p) {
      let best = null, bd = C.TOOTH_RANGE;
      for (const t of this.teeth) {
        const d = Math.hypot(t.x - p.x, t.y - p.y) - t.r;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }

    // Diente sobre el que el jugador puede actuar ahora mismo (o null)
    actionTarget(p) {
      const a = this.actionInfo(p);
      return a ? a.tooth : null;
    }

    // { tooth, kind: 'clean' | 'dirty' | 'crown' } o null
    actionInfo(p) {
      if (!p.alive || p.slimedT > 0 || p.stunT > 0 || !p.team) return null;
      const t = this.nearestTooth(p);
      if (!t) return null;
      if (p.team === 'bac') return t.state === 'clean' && t.crownT <= 0 ? { tooth: t, kind: 'dirty' } : null;
      if (t.state === 'dirty') return { tooth: t, kind: 'clean' };
      const crowned = this.teeth.filter((q) => q.crownT > 0).length;
      if (p.crown && t.crownT <= 0 && crowned < C.CROWN.maxActive) return { tooth: t, kind: 'crown' };
      return null;
    }

    // Cepa de caries: contagia dientes vecinos (en la arcada) mientras quien la lleva siga vivo
    updateContagion(p, dt) {
      if (!(p.contagionT > 0)) return;
      if (!p.alive) { p.contagionT = 0; this.emit({ type: 'contagionEnd', id: p.id }); return; }
      p.contagionT -= dt;
      p.contagionTick -= dt;
      if (p.contagionTick <= 0 && p.contagionLeft > 0) {
        p.contagionTick = C.CONTAGION.every;
        const ok = (t) => t && t.state === 'clean' && t.crownT <= 0;
        let cands = this.teeth.filter((t) => ok(t) && (this.teeth[t.id - 1] || {}).state === 'dirty' || ok(t) && (this.teeth[t.id + 1] || {}).state === 'dirty');
        if (!cands.length) cands = this.teeth.filter(ok);
        if (cands.length) {
          const t = cands[Math.floor(Math.random() * cands.length)];
          t.state = 'dirty';
          p.contagionLeft--;
          this.players.forEach((q) => { if (q.action && q.action.tooth === t.id) q.action = null; });
          this.emit({ type: 'tooth', tooth: t.id, state: 'dirty', id: p.id, contagion: true });
        }
      }
      if (p.contagionT <= 0 || p.contagionLeft <= 0) { p.contagionT = 0; this.emit({ type: 'contagionEnd', id: p.id }); }
    }

    updateAction(p, dt, holding) {
      const info = holding ? this.actionInfo(p) : null;
      if (!info) { p.action = null; return; }
      const t = info.tooth;
      if (!p.action || p.action.tooth !== t.id || p.action.kind !== info.kind) p.action = { tooth: t.id, t: 0, kind: info.kind };
      if (info.kind === 'crown') {
        p.action.t += dt / C.CROWN.placeTime;
        if (p.action.t >= 1) {
          t.crownT = C.CROWN.duration; p.crown = false; p.action = null;
          this.emit({ type: 'crown', tooth: t.id, id: p.id });
        }
        return;
      }
      const step = dt / C.TOOTH_ACTION_TIME * (p.boostT > 0 ? C.BOOST.actionSpeed : 1);
      p.action.t += step;
      this.teamProgress[p.team] += step;
      if (p.action.t >= 1) {
        t.state = p.team === 'doc' ? 'clean' : 'dirty';
        p.action = null;
        this.emit({ type: 'tooth', tooth: t.id, state: t.state, id: p.id });
      }
    }

    cancelAction(p) { p.action = null; }

    // ───────────── Armas ─────────────
    aimAngle(p, range) {
      let best = null, bestD = C.AIM_ASSIST_DEG * Math.PI / 180;
      this.players.forEach((e) => {
        if (!e.team || e.team === p.team || !e.alive) return;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > range) return;
        const diff = Math.abs(angDiff(p.a, Math.atan2(e.y - p.y, e.x - p.x)));
        if (diff < bestD && lineOfSight(p.x, p.y, e.x, e.y)) { bestD = diff; best = e; }
      });
      return best ? Math.atan2(best.y - p.y, best.x - p.x) : p.a;
    }

    tryFire(p) {
      const w = this.weaponOf(p), W = C.WEAPONS[w];
      if (!W.kind || (p.cds[w] || 0) > 0) return;
      p.cds[w] = w === 'slime' ? C.SLIME_COOLDOWN : W.cooldown;
      this.emit({ type: 'shot', id: p.id, weapon: w });
      if (W.kind === 'melee') {
        this.players.forEach((e) => {
          if (!e.team || e.team === p.team || !e.alive) return;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          const diff = Math.abs(angDiff(p.a, Math.atan2(e.y - p.y, e.x - p.x)));
          if (d < W.range + C.PLAYER_RADIUS && diff < (W.arcDeg / 2) * Math.PI / 180 && lineOfSight(p.x, p.y, e.x, e.y)) this.damage(e, W.damage, p, w);
        });
        this.fungi.forEach((f) => {
          const diff = Math.abs(angDiff(p.a, Math.atan2(f.y - p.y, f.x - p.x)));
          if (Math.hypot(f.x - p.x, f.y - p.y) < W.range + C.FUNGUS.radius && diff < (W.arcDeg / 2) * Math.PI / 180) this.hitFungus(f, p.id);
        });
        return;
      }
      const a = this.aimAngle(p, W.range);
      this.projectiles.push({
        id: this.uid++, type: w, owner: p.id, team: p.team,
        x: p.x + Math.cos(a) * 0.35, y: p.y + Math.sin(a) * 0.35, z: 0.5 + p.z,
        vx: Math.cos(a) * W.speed, vy: Math.sin(a) * W.speed, life: W.range / W.speed,
      });
    }

    updateProjectiles(dt) {
      const out = [];
      for (const pr of this.projectiles) {
        const W = C.WEAPONS[pr.type];
        let alive = true;
        pr.life -= dt;
        for (let s = 0; s < 3 && alive; s++) {
          pr.x += pr.vx * dt / 3; pr.y += pr.vy * dt / 3;
          if (MAP.solidAt(pr.x, pr.y) || this.teeth.some((t) => (pr.x - t.x) ** 2 + (pr.y - t.y) ** 2 < t.r * t.r)
            || this.stones.some((st) => st.state === 'rock' && (pr.x - st.x) ** 2 + (pr.y - st.y) ** 2 < C.TONSIL.rockRadius ** 2)) {
            alive = false;
            this.impact(pr, pr.x - pr.vx * dt / 3, pr.y - pr.vy * dt / 3);
            break;
          }
          const fg = this.fungi.find((f) => f.hp > 0 && (pr.x - f.x) ** 2 + (pr.y - f.y) ** 2 < (C.FUNGUS.radius + W.radius) ** 2);
          if (fg) {
            alive = false;
            this.emit({ type: 'impact', weapon: pr.type, x: pr.x, y: pr.y, on: 'fungus' });
            this.hitFungus(fg, pr.owner);
            break;
          }
          for (const e of this.players.values()) {
            if (!e.team || e.team === pr.team || !e.alive) continue;
            if (e.z > C.JUMP_DODGE_HEIGHT) continue; // lo esquivó saltando
            if ((pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 < (C.PLAYER_RADIUS + W.radius) ** 2) {
              alive = false;
              this.hitPlayer(e, pr);
              break;
            }
          }
        }
        if (alive && pr.life <= 0) { alive = false; this.impact(pr, pr.x, pr.y); }
        if (alive) out.push(pr);
      }
      this.projectiles = out;
    }

    impact(pr, x, y) {
      this.emit({ type: 'impact', weapon: pr.type, x, y });
      if (pr.type === 'acid') this.addZone(x, y);
    }

    addZone(x, y) {
      const W = C.WEAPONS.acid;
      this.zones.push({ id: this.uid++, x, y, r: W.puddleRadius, t: W.puddleTime });
    }

    hitPlayer(e, pr) {
      const shooter = this.players.get(pr.owner);
      // dentro del laberinto de la lengua la saliva lava la viscosidad (la carrera final es justa)
      const inMaze = this.mazeOpen && this.mazeCells.has(Math.floor(e.y) * MAP.W + Math.floor(e.x));
      if ((e.shieldT > 0 || inMaze) && pr.type === 'slime') { this.emit({ type: 'blocked', id: e.id, weapon: pr.type, x: e.x, y: e.y }); return; }
      this.emit({ type: 'impact', weapon: pr.type, x: e.x, y: e.y, on: e.id });
      this.dropBomb(e); // cualquier impacto hace soltar la bomba
      if (pr.type === 'slime') {
        this.dropBomb(e);
        if (e.slimedT <= 0 && e.immuneT <= 0) {
          e.sticky++;
          e.stickyT = C.SLIME_STACK_TIME;
          if (e.sticky >= C.SLIME_HITS_TO_STICK) {
            e.sticky = 0; e.stickyT = 0;
            e.slimedT = C.SLIME_IMMOBILIZE_TIME;
            e.action = null;
            e.vz = 0; e.z = 0;
            this.emit({ type: 'slimed', id: e.id, by: pr.owner });
          } else this.emit({ type: 'sticky', id: e.id, by: pr.owner });
        }
        return;
      }
      if (pr.type === 'acid') { this.addZone(e.x, e.y); this.dropBomb(e); }
      this.damage(e, C.WEAPONS[pr.type].damage, shooter, pr.type);
    }

    damage(e, amount, by, weapon) {
      if (!e.alive) return;
      e.hp -= amount;
      e.flashT = 0.25;
      this.emit({ type: 'hit', id: e.id, by: by && by.id, weapon });
      if (e.hp <= 0) this.kill(e, by, weapon);
    }

    kill(e, by, weapon) {
      e.hp = 0; e.alive = false; e.action = null; e.slimedT = 0; e.z = 0; e.vz = 0;
      e.deadT = e.team === 'bac' ? C.BACTERIA_RESPAWN_TIME : C.DOCTOR_RESPAWN_TIME;
      this.dropBomb(e);
      this.emit({ type: 'kill', id: e.id, by: by && by.id, weapon, x: e.x, y: e.y });
    }

    updateZones(dt) {
      const W = C.WEAPONS.acid;
      this.zones = this.zones.filter((z) => (z.t -= dt) > 0);
      for (const z of this.zones) {
        this.players.forEach((p) => {
          if (p.team !== 'doc' || !p.alive || p.z > 0.1) return;
          if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) {
            p.hp -= W.puddleDps * dt;
            p.flashT = Math.max(p.flashT, 0.1);
            if (p.hp <= 0) this.kill(p, null, 'acid');
          }
        });
      }
    }

    // ───────────── Bombas ─────────────
    bombSpot() {
      const docS = MAP.spawns.doc[0], bacS = MAP.spawns.bac[0];
      for (let tries = 0; tries < 400; tries++) {
        const x = 2 + Math.random() * (MAP.W - 4), y = 2 + Math.random() * (MAP.H - 4);
        if (MAP.solidAt(x, y) || this.collides(x, y, 0)) continue;
        // lejos de paredes
        if (MAP.solidAt(x + 0.8, y) || MAP.solidAt(x - 0.8, y) || MAP.solidAt(x, y + 0.8) || MAP.solidAt(x, y - 0.8)) continue;
        // no encima de un diente
        if (this.teeth.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + 1.2)) continue;
        // disputable: a distancia parecida de ambos spawns y no pegada a ninguno
        const dd = Math.hypot(docS.x - x, docS.y - y), db = Math.hypot(bacS.x - x, bacS.y - y);
        if (dd < 7 || db < 7 || Math.abs(dd - db) > 9 + tries / 40) continue;
        return { x, y };
      }
      return { x: 22, y: 14 };
    }

    spawnBomb(type) {
      const s = this.bombSpot();
      const b = { id: this.uid++, type, team: null, state: 'ground', x: s.x, y: s.y, z: 0, t: C.BOMB_LIFETIME, holder: null };
      this.bombs.push(b);
      this.emit({ type: 'bombSpawn', bombType: type, x: b.x, y: b.y });
    }

    dropBomb(p) {
      if (!p.bomb) return;
      const b = this.bombs.find((b) => b.id === p.bomb);
      p.bomb = null;
      if (!b) return;
      this.emit({ type: 'bombDrop', id: p.id, bombType: b.type });
      b.state = 'ground'; b.holder = null; b.t = C.BOMB_LIFETIME; b.x = p.x; b.y = p.y; b.z = 0; b.type = 'neutral'; b.team = null;
    }

    throwBomb(p) {
      const b = this.bombs.find((b) => b.id === p.bomb);
      p.bomb = null;
      if (!b) return;
      b.state = 'flying'; b.holder = null;
      b.x = p.x; b.y = p.y; b.z = 0.8 + p.z;
      b.vx = Math.cos(p.a) * C.BOMB_THROW_SPEED; b.vy = Math.sin(p.a) * C.BOMB_THROW_SPEED; b.vz = 3;
      this.emit({ type: 'bombThrow', id: p.id, bombType: b.type });
    }

    updateBombs(dt) {
      this.bombs = this.bombs.filter((b) => {
        if (b.state === 'ground') {
          b.t -= dt;
          if (b.t <= 0) { this.emit({ type: 'bombExpire', bombType: b.type }); return false; }
        } else if (b.state === 'held') {
          const h = this.players.get(b.holder);
          b.t -= dt;
          if (!h) { b.state = 'ground'; b.t = C.BOMB_LIFETIME; b.type = 'neutral'; b.team = null; return true; }
          b.x = h.x; b.y = h.y; b.z = h.z;
          if (b.t <= 0) { h.bomb = null; this.emit({ type: 'bombExpire', bombType: b.type, held: true }); return false; }
        } else if (b.state === 'flying') {
          const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
          b.z += b.vz * dt; b.vz -= C.GRAVITY * 0.8 * dt;
          if (MAP.solidAt(nx, ny) || b.z <= 0) { this.explode(b); return false; }
          b.x = nx; b.y = ny;
        }
        return true;
      });
    }

    explode(b) {
      const from = b.type === 'clean' ? 'dirty' : 'clean';
      const pool = shuffle(this.teeth.filter((t) => t.state === from && !(b.type === 'dirty' && t.crownT > 0))).slice(0, C.BOMB_TEETH_AFFECTED);
      pool.forEach((t) => { t.state = b.type; });
      this.players.forEach((p) => { if (p.action && pool.some((t) => t.id === p.action.tooth)) p.action = null; });
      this.emit({ type: 'bombExplode', bombType: b.type, x: b.x, y: b.y, teeth: pool.map((t) => t.id) });
    }

    // ───────────── Peligros del mapa: hongo, tonsilolitos, potenciadores ─────────────
    updateHazards(dt, elapsed) {
      const H = this.hazard;
      if (elapsed >= H.fungus) { H.fungus = elapsed + C.FUNGUS.every; this.spawnFungus(); }
      if (elapsed >= H.tonsil) { H.tonsil = elapsed + C.TONSIL.every * (0.7 + Math.random() * 0.6); this.spawnStones(); }
      if (elapsed >= H.boost) { H.boost = elapsed + C.BOOST.every; this.spawnBoosts(); }
      if (elapsed >= H.special) { H.special = elapsed + C.CROWN.every; this.spawnSpecial(); }
      this.teeth.forEach((t) => {
        if (t.crownT > 0) { t.crownT -= dt; if (t.crownT <= 0) { t.crownT = 0; this.emit({ type: 'crownEnd', tooth: t.id }); } }
      });
      this.players.forEach((p) => this.updateContagion(p, dt));

      const F = C.FUNGUS;
      this.fungi = this.fungi.filter((f) => {
        if (f.hp <= 0) return false;
        f.t -= dt;
        f.flashT = Math.max(0, f.flashT - dt);
        if (f.t <= 0) { this.emit({ type: 'fungusGone', x: f.x, y: f.y }); return false; }
        for (const k in f.cd) f.cd[k] -= dt;
        // persigue al jugador vivo más cercano (de cualquier equipo)
        let tgt = null, td = Infinity;
        this.players.forEach((p) => {
          if (!p.team || !p.alive) return;
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d < td) { td = d; tgt = p; }
        });
        if (!tgt) return true;
        f.repath -= dt;
        if (f.repath <= 0) { f.path = this.findPath(f.x, f.y, tgt.x, tgt.y); f.repath = 0.8; }
        let wp = f.path[0];
        if (wp && Math.hypot(wp.x - f.x, wp.y - f.y) < 0.4) { f.path.shift(); wp = f.path[0]; }
        const goal = td < 2.5 && lineOfSight(f.x, f.y, tgt.x, tgt.y) ? tgt : wp;
        if (goal) {
          const a = Math.atan2(goal.y - f.y, goal.x - f.x);
          const nx = f.x + Math.cos(a) * F.speed * dt, ny = f.y + Math.sin(a) * F.speed * dt;
          if (!MAP.solidAt(nx, f.y)) f.x = nx;
          if (!MAP.solidAt(f.x, ny)) f.y = ny;
        }
        // mordida al tocar a alguien
        this.players.forEach((p) => {
          if (!p.team || !p.alive || (f.cd[p.id] || 0) > 0) return;
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d > F.radius + C.PLAYER_RADIUS + 0.1) return;
          f.cd[p.id] = F.touchCooldown;
          const a = Math.atan2(p.y - f.y, p.x - f.x);
          this.moveCircle(p, Math.cos(a) * F.knockback, Math.sin(a) * F.knockback);
          p.action = null;
          this.dropBomb(p);
          this.emit({ type: 'fungusBite', id: p.id, x: p.x, y: p.y });
          this.damage(p, F.touchDamage, null, 'fungus');
        });
        return true;
      });

      const T = C.TONSIL;
      this.stones = this.stones.filter((s) => {
        s.t -= dt;
        if (s.state === 'warn' && s.t <= 0) {
          s.state = 'rock'; s.t = T.rockLife;
          const hit = [];
          this.players.forEach((p) => {
            if (!p.team || !p.alive) return;
            const d = Math.hypot(p.x - s.x, p.y - s.y);
            if (d > T.radius) return;
            hit.push(p.id);
            // empujar fuera de la piedra
            const min = T.rockRadius + C.PLAYER_RADIUS + 0.05;
            if (d < min) {
              const a = d > 0.01 ? Math.atan2(p.y - s.y, p.x - s.x) : Math.random() * TAU;
              const nx = s.x + Math.cos(a) * min, ny = s.y + Math.sin(a) * min;
              if (!this.collides(nx, ny, 0)) { p.x = nx; p.y = ny; }
            }
            p.stunT = T.stun; p.action = null; p.vz = 0; p.z = 0;
            this.dropBomb(p);
            this.damage(p, T.damage, null, 'tonsil');
          });
          this.emit({ type: 'stoneHit', x: s.x, y: s.y, ids: hit });
        } else if (s.state === 'rock' && s.t <= 0) return false;
        return true;
      });

      this.pickups = this.pickups.filter((k) => (k.t -= dt) > 0);
    }

    // ── Final legendario ──
    updateLegend() {
      const L = C.LEGEND;
      if (!this.legendWarned && this.timeLeft <= L.warnAt) { this.legendWarned = true; this.emit({ type: 'mazeWarn', at: L.openAt }); }
      if (!this.mazeOpen && this.timeLeft <= L.openAt) {
        this.mazeOpen = true;
        MAP.setMazeOpen(true);
        this.blocked = null;
        this.legend = { x: MAP.maze.center.x, y: MAP.maze.center.y, taken: false };
        this.emit({ type: 'mazeOpen', x: this.legend.x, y: this.legend.y });
      }
      if (!this.legend || this.legend.taken) return;
      for (const p of this.players.values()) {
        if (!p.team || !p.alive || Math.hypot(p.x - this.legend.x, p.y - this.legend.y) > L.radius) continue;
        this.legend.taken = true;
        const goal = p.team === 'doc' ? 'clean' : 'dirty';
        const changed = this.teeth.filter((t) => t.state !== goal && !(goal === 'dirty' && t.crownT > 0));
        changed.forEach((t) => { t.state = goal; });
        this.players.forEach((q) => { q.action = null; });
        this.emit({ type: 'legend', id: p.id, team: p.team, teeth: changed.map((t) => t.id) });
        break;
      }
    }

    spawnFungus() {
      const s = this.bombSpot();
      this.fungi.push({ id: this.uid++, x: s.x, y: s.y, hp: C.FUNGUS.hp, t: C.FUNGUS.life, cd: {}, path: [], repath: 0, flashT: 0 });
      this.emit({ type: 'fungusSpawn', x: s.x, y: s.y });
    }

    hitFungus(f, byId) {
      if (f.hp <= 0) return;
      f.hp -= C.FUNGUS.hitDamage;
      f.flashT = 0.2;
      if (f.hp <= 0) this.emit({ type: 'fungusDie', x: f.x, y: f.y, by: byId });
    }

    // Tonsilolitos: caen del techo cerca de los jugadores con aviso previo
    spawnStones() {
      const alive = [...this.players.values()].filter((p) => p.team && p.alive);
      const n = this.mode >= 14 ? 4 : this.mode >= 10 ? 3 : this.mode === 4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 30; tries++) {
          let x, y;
          if (alive.length && Math.random() < 0.65) {
            const p = alive[Math.floor(Math.random() * alive.length)];
            x = p.x + (Math.random() - 0.5) * 4; y = p.y + (Math.random() - 0.5) * 4;
          } else { x = 2 + Math.random() * (MAP.W - 4); y = 2 + Math.random() * (MAP.H - 4); }
          if (MAP.solidAt(x, y) || this.teeth.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + 0.8)) continue;
          if (['doc', 'bac'].some((t) => MAP.spawns[t].some((sp) => Math.hypot(sp.x - x, sp.y - y) < 2.5))) continue;
          if (this.stones.some((s) => Math.hypot(s.x - x, s.y - y) < 2)) continue;
          this.stones.push({ id: this.uid++, x, y, state: 'warn', t: C.TONSIL.warn });
          this.emit({ type: 'stoneWarn', x, y });
          break;
        }
      }
    }

    spawnSpecial() {
      [['crown', 'doc'], ['strain', 'bac']].forEach(([type, team]) => {
        const s = this.bombSpot();
        this.pickups.push({ id: this.uid++, type, team, x: s.x, y: s.y, t: C.CROWN.life });
      });
      this.emit({ type: 'specialSpawn' });
    }

    // Potenciadores parejos: uno para cada equipo al mismo tiempo
    spawnBoosts() {
      [['fluor', 'doc'], ['sugar', 'bac']].forEach(([type, team]) => {
        const s = this.bombSpot();
        this.pickups.push({ id: this.uid++, type, team, x: s.x, y: s.y, t: C.BOOST.life });
      });
      this.emit({ type: 'boostSpawn' });
    }

    // ───────────── Estado para las pantallas ─────────────
    snapshot() {
      const work = {};
      this.players.forEach((p) => {
        if (!p.action) return;
        const prog = p.action.t, w = work[p.action.tooth];
        if (!w || prog > w.p) work[p.action.tooth] = { p: prog, team: p.team };
      });
      const clean = this.teeth.filter((t) => t.state === 'clean').length;
      return {
        st: this.state, mode: this.mode, tl: Math.max(0, this.timeLeft), cd: Math.max(0, this.countdown),
        score: { clean, dirty: 16 - clean }, res: this.result,
        players: [...this.players.values()].filter((p) => p.team).map((p) => ({
          id: p.id, name: p.name, team: p.team, skin: p.skin,
          x: +p.x.toFixed(3), y: +p.y.toFixed(3), a: +p.a.toFixed(3), z: +p.z.toFixed(3),
          hp: Math.ceil(p.hp), mhp: p.maxHp, alive: p.alive, dead: +p.deadT.toFixed(2),
          slimed: +p.slimedT.toFixed(2), immune: p.immuneT > 0, w: this.weaponOf(p),
          cd: +((p.cds[this.weaponOf(p)] || 0).toFixed(2)),
          act: p.action ? +p.action.t.toFixed(3) : 0,
          canAct: !!this.actionTarget(p), bomb: p.bomb ? (this.bombs.find((b) => b.id === p.bomb) || {}).type || null : null,
          flash: p.flashT > 0, conn: p.connected, bot: p.isBot,
          shield: +p.shieldT.toFixed(2), stun: +p.stunT.toFixed(2), sticky: p.sticky, boost: +p.boostT.toFixed(1), crown: p.crown, contagion: +p.contagionT.toFixed(1),
          actKind: (this.actionInfo(p) || {}).kind || null,
        })),
        teeth: this.teeth.map((t) => ({ s: t.state === 'dirty' ? 1 : 0, c: +t.crownT.toFixed(1), p: work[t.id] ? +work[t.id].p.toFixed(3) : 0, w: work[t.id] ? work[t.id].team : null })),
        proj: this.projectiles.map((q) => ({ id: q.id, t: q.type, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2) })),
        bombs: this.bombs.map((b) => ({ id: b.id, type: b.type, st: b.state, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), t: +b.t.toFixed(1), holder: b.holder })),
        zones: this.zones.map((z) => ({ id: z.id, x: z.x, y: z.y, r: z.r, t: +z.t.toFixed(2) })),
        fungi: this.fungi.map((f) => ({ id: f.id, x: +f.x.toFixed(2), y: +f.y.toFixed(2), hp: f.hp, flash: f.flashT > 0 })),
        stones: this.stones.map((st) => ({ id: st.id, x: st.x, y: st.y, st: st.state, t: +st.t.toFixed(2) })),
        maze: this.mazeOpen, legend: this.legend && !this.legend.taken ? { x: this.legend.x, y: this.legend.y } : null,
        pickups: this.pickups.map((k) => ({ id: k.id, type: k.type, x: k.x, y: k.y, t: +k.t.toFixed(1) })),
      };
    }

    // Estado privado de un jugador (para su celular)
    privateState(id) {
      const p = this.players.get(id);
      if (!p) return null;
      const clean = this.teeth.filter((t) => t.state === 'clean').length;
      const base = { st: this.state, tl: Math.max(0, this.timeLeft), cd: Math.max(0, this.countdown), score: { clean, dirty: 16 - clean }, res: this.result };
      if (!p.team) return base;
      const w = this.weaponOf(p), W = C.WEAPONS[w];
      const bomb = p.bomb ? this.bombs.find((b) => b.id === p.bomb) : null;
      base.me = {
        team: p.team, skin: p.skin, name: p.name, hp: Math.ceil(p.hp), mhp: p.maxHp, alive: p.alive,
        dead: +p.deadT.toFixed(1), slimed: +p.slimedT.toFixed(1), weapon: w,
        cd: +((p.cds[w] || 0).toFixed(1)), cdMax: w === 'slime' ? C.SLIME_COOLDOWN : W.cooldown || 0,
        canAct: !!this.actionTarget(p), act: p.action ? +p.action.t.toFixed(2) : 0,
        bomb: bomb ? { type: bomb.type, t: +bomb.t.toFixed(1) } : null,
        shield: +p.shieldT.toFixed(1), shieldCd: +p.shieldCd.toFixed(1), stun: +p.stunT.toFixed(1), sticky: p.sticky, boost: +p.boostT.toFixed(1), crown: p.crown, contagion: +p.contagionT.toFixed(1),
        actKind: (this.actionInfo(p) || {}).kind || null,
      };
      return base;
    }

    // ───────────── Bots (solo modo prueba) ─────────────
    botThink(p, dt) {
      const bot = p.bot || (p.bot = { think: 0, path: [], goal: null, last: { x: p.x, y: p.y }, stuckT: 0, jitter: Math.random() * 6, jump: 0, weapon: 0, throw: 0, shield: 0 });
      const inp = p.input;
      inp.jump = bot.jump; inp.weapon = bot.weapon; inp.throw = bot.throw; inp.shield = bot.shield;
      inp.fire = false; inp.act = false; inp.mx = 0; inp.my = 0; inp.tx = 0;
      if (!p.alive || p.slimedT > 0 || p.stunT > 0) return;

      bot.think -= dt;
      if (p.bomb && Math.random() < dt * 0.8) { bot.throw++; inp.throw = bot.throw; }

      // Enemigo visible más cercano
      let enemy = null, ed = 9;
      this.players.forEach((e) => {
        if (!e.team || e.team === p.team || !e.alive) return;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < ed && lineOfSight(p.x, p.y, e.x, e.y)) { ed = d; enemy = e; }
      });

      // Arma adecuada
      // odontólogo bot: escudo cuando una bacteria le dispara cerca
      const threat = this.projectiles.some((q) => q.team === 'bac' && Math.hypot(q.x - p.x, q.y - p.y) < 3.5) ;
      if (p.team === 'doc' && p.shieldCd <= 0 && p.shieldT <= 0 && threat && Math.random() < 0.1) { bot.shield++; inp.shield = bot.shield; }
      const want = p.team === 'doc' ? 'water'
        : (enemy && enemy.slimedT <= 0 && enemy.immuneT <= 0 && !(p.cds.slime > 0) ? 'slime' : 'acid');
      if (this.weaponOf(p) !== want && Math.random() < dt * 3) { bot.weapon++; inp.weapon = bot.weapon; }

      let faceTo = null;
      if (enemy && (enemy.slimedT <= 0 || p.team === 'doc')) {
        faceTo = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        if (Math.abs(angDiff(p.a, faceTo)) < 0.18 && Math.random() < (p.team === 'doc' ? 0.25 : 0.7)) inp.fire = true;
      }
      // Hongo cerca: dispararle
      const fg = !faceTo && this.fungi.find((f) => Math.hypot(f.x - p.x, f.y - p.y) < 5 && lineOfSight(p.x, p.y, f.x, f.y));
      if (fg && this.weaponOf(p) !== 'none') {
        faceTo = Math.atan2(fg.y - p.y, fg.x - p.x);
        if (Math.abs(angDiff(p.a, faceTo)) < 0.2) inp.fire = true;
      }

      // Objetivo: bomba propia > diente a cambiar
      if (bot.think <= 0) {
        bot.think = 0.5;
        const myBomb = !p.bomb && this.bombs.find((b) => b.state === 'ground' && Math.hypot(b.x - p.x, b.y - p.y) < 16);
        const boost = this.pickups.find((k) => k.team === p.team && Math.hypot(k.x - p.x, k.y - p.y) < 10);
        const leg = this.legend && !this.legend.taken ? this.legend : null;
        // tras el aviso, esperar junto a la entrada más cercana de la lengua
        let gate = null;
        if (!this.mazeOpen && this.legendWarned && this.timeLeft < C.LEGEND.openAt + 4) {
          gate = MAP.maze.entrances.reduce((b, e) => (!b || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? e : b), null);
        }
        const item = leg || gate || myBomb || boost;
        let goal = item ? { x: item.x, y: item.y, tooth: null, item: true } : null;
        if (!goal) {
          const want = p.team === 'doc' ? 'clean' : 'dirty';
          const cands = this.teeth.filter((t) => t.state !== want);
          // evita ir al mismo diente que un compañero
          const taken = new Set([...this.players.values()].filter((m) => m !== p && m.team === p.team && m.bot && m.bot.goal).map((m) => m.bot.goal.tooth));
          const cost = (t) => Math.hypot(t.x - p.x, t.y - p.y) + (t.id * 7 + bot.jitter) % 5 + (taken.has(t.id) ? 12 : 0);
          cands.sort((a, b) => cost(a) - cost(b));
          const t = cands[0];
          if (t) {
            // punto de trabajo junto al diente, del lado más cercano al bot
            const ang = Math.atan2(p.y - t.y, p.x - t.x);
            let gx = t.x + Math.cos(ang) * (t.r + 0.9), gy = t.y + Math.sin(ang) * (t.r + 0.9);
            if (MAP.solidAt(gx, gy)) { gx = t.x - Math.cos(ang) * (t.r + 0.9); gy = t.y - Math.sin(ang) * (t.r + 0.9); }
            goal = { x: gx, y: gy, tooth: t.id };
          } else goal = { x: 22, y: 14, tooth: null };
        }
        bot.goal = goal;
        bot.path = this.findPath(p.x, p.y, goal.x, goal.y);
      }

      const goalT = bot.goal && bot.goal.tooth != null ? this.teeth[bot.goal.tooth] : null;
      const target = this.actionTarget(p);
      if (target && !(bot.goal && bot.goal.item) && (!goalT || target.id === goalT.id || !enemy)) {
        inp.act = true;
        if (!faceTo) faceTo = Math.atan2(target.y - p.y, target.x - p.x);
      } else if (bot.path.length) {
        let wp = bot.path[0];
        if (Math.hypot(wp.x - p.x, wp.y - p.y) < 0.45) { bot.path.shift(); wp = bot.path[0]; }
        if (wp) {
          const ma = Math.atan2(wp.y - p.y, wp.x - p.x);
          if (!faceTo) faceTo = ma;
          const rel = angDiff(p.a, ma);
          inp.my = -Math.cos(rel); inp.mx = Math.sin(rel);
        }
      }
      // Huir de la sombra de un tonsilolito que va a caer
      const danger = this.stones.find((st) => st.state === 'warn' && Math.hypot(st.x - p.x, st.y - p.y) < C.TONSIL.radius + 0.3);
      if (danger && Math.random() < 0.85) {
        const rel = angDiff(p.a, Math.atan2(p.y - danger.y, p.x - danger.x));
        inp.my = -Math.cos(rel); inp.mx = Math.sin(rel); inp.act = false;
      }
      if (faceTo != null) inp.tx = clamp(angDiff(p.a, faceTo) * 2.5, -1, 1);

      // Atascado: saltar y moverse de lado
      const moved = Math.hypot(p.x - bot.last.x, p.y - bot.last.y);
      bot.last = { x: p.x, y: p.y };
      if ((inp.mx || inp.my) && moved < 0.01) bot.stuckT += dt; else bot.stuckT = 0;
      if (bot.stuckT > 0.6) { bot.jump++; inp.jump = bot.jump; bot.think = 0; bot.stuckT = 0; inp.mx = Math.random() < 0.5 ? -1 : 1; }
    }

    // BFS en la cuadrícula (celdas bloqueadas por paredes y dientes)
    findPath(x0, y0, x1, y1) {
      const Wd = MAP.W, Hd = MAP.H;
      if (!this.blocked) {
        this.blocked = new Uint8Array(Wd * Hd);
        for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          this.blocked[y * Wd + x] = MAP.isSolidCell(x, y) || MAP.teeth.some((t) => Math.hypot(t.x - cx, t.y - cy) < t.r + 0.45) ? 1 : 0;
        }
      }
      const s = Math.floor(y0) * Wd + Math.floor(x0), gx = Math.floor(x1), gy = Math.floor(y1);
      let g = gy * Wd + gx;
      const prev = new Int32Array(Wd * Hd).fill(-1);
      prev[s] = s;
      const q = [s];
      let found = false;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        const cx = c % Wd, cy = (c / Wd) | 0;
        // si la meta está bloqueada basta con llegar a una celda vecina
        if (c === g || (this.blocked[g] && Math.abs(cx - gx) <= 1 && Math.abs(cy - gy) <= 1)) { g = c; found = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
          const n = ny * Wd + nx;
          if (prev[n] !== -1 || this.blocked[n]) continue;
          if (dx && dy && (this.blocked[cy * Wd + nx] || this.blocked[ny * Wd + cx])) continue;
          prev[n] = c; q.push(n);
        }
      }
      if (!found) return [{ x: x1, y: y1 }];
      const path = [];
      for (let c = g; c !== s; c = prev[c]) path.unshift({ x: (c % Wd) + 0.5, y: ((c / Wd) | 0) + 0.5 });
      path.push({ x: x1, y: y1 });
      return path;
    }
  }

  Game.lineOfSight = lineOfSight;
  return Game;
});
