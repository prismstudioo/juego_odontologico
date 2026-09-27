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
        superT: 0, dizzyT: 0, slowT: 0, streak: 0, stunKind: null, spawnT: 0, sprint: false,
        stats: { kills: 0, deaths: 0, teeth: 0, race: 0 },
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

    // Cada jugador elige su personaje (skin) dentro de su equipo
    setSkin(id, skin) {
      const p = this.players.get(id);
      if (!p || !p.team || this.state !== 'lobby' || !SKINS.includes(skin)) return false;
      p.skin = skin;
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

    // Se puede jugar con los equipos incompletos ("jugar así"), pero nunca solo con bots
    // y cada equipo necesita al menos un jugador.
    canStart() {
      if (this.state !== 'lobby') return false;
      const humans = [...this.players.values()].filter((p) => p.team && !p.isBot).length;
      return humans > 0 && TEAMS.every((t) => this.teamMembers(t).length > 0);
    }

    isFull() { return TEAMS.every((t) => this.teamMembers(t).length >= this.slots(t)); }

    lobbyInfo() {
      return {
        mode: this.mode, state: this.state, slots: { ...C.MODES[this.mode] }, canStart: this.canStart(), full: this.isFull(), skins: SKINS,
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
      this.race = null;
      this.uid = 1;
      // 2 bombas por equipo, en momentos aleatorios repartidos por la partida
      // bombas de distintos tipos (una de cada una, en orden aleatorio)
      const kinds = shuffle(Object.keys(C.BOMB_KINDS));
      const nb = C.BOMBS_PER_MATCH, [w0, w1] = C.BOMB_SPAWN_WINDOW, seg = (w1 - w0) / nb;
      this.bombSchedule = Array.from({ length: nb }, (_, i) => ({ kind: kinds[i % kinds.length], at: w0 + seg * i + Math.random() * seg * 0.7 }));
      // estrellas (diente de oro) repartidas por la partida
      const S = C.SUPER, sseg = (S.window[1] - S.window[0]) / S.count;
      this.superSchedule = Array.from({ length: S.count }, (_, i) => S.window[0] + sseg * i + Math.random() * sseg * 0.6);
    }

    start() {
      if (!this.canStart()) return false;
      this.resetMatch();
      // Equipos desiguales ("jugar así"): el equipo con menos jugadores recibe menos daño,
      // limpia/ensucia más rápido y sus disparos a la muela valen más, en proporción.
      const n = { doc: this.teamMembers('doc').length, bac: this.teamMembers('bac').length };
      const hk = (mine, other) => Math.min(4, Math.max(1, Math.pow(other / mine, C.HANDICAP_POWER)));
      this.handicap = { doc: hk(n.doc, n.bac), bac: hk(n.bac, n.doc) };
      const idx = { doc: 0, bac: 0 };
      this.players.forEach((p) => {
        if (!p.team) return;
        p.spawn = MAP.spawns[p.team][idx[p.team]++ % MAP.spawns[p.team].length];
        p.streak = 0;
        this.respawn(p);
        p.spawnT = 0; // al inicio ya protege la cuenta atrás
        p.weaponIdx = 0; // odontólogos empiezan con la pistola, bacterias con viscosidad
        p.cds = {};
        p.bomb = null; p.crown = false; p.contagionT = 0;
        p.stats = { kills: 0, deaths: 0, teeth: 0, race: 0 };
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
      p.superT = 0; p.dizzyT = 0; p.slowT = 0;
      p.spawnT = C.SPAWN_PROTECTION; // protección al reaparecer
      p.maxHp += (p.streak || 0) * C.STREAK.hp; p.hp = p.maxHp;
    }

    // Tiempo de recarga del arma con las mejoras de la racha y la estrella
    cooldownOf(p, w) {
      let cd = w === 'slime' ? C.SLIME_COOLDOWN : C.WEAPONS[w].cooldown || 0;
      if (this.race) return cd; // en la carrera todos disparan igual de rápido
      cd *= Math.max(0.4, 1 - (p.streak || 0) * C.STREAK.cooldown);
      if (p.superT > 0) cd *= C.SUPER.cooldown;
      return cd;
    }

    weaponOf(p) {
      if (this.race) return C.RACE.weapon;
      return C.TEAM_WEAPONS[p.team][p.weaponIdx % C.TEAM_WEAPONS[p.team].length];
    }

    update(dt) {
      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n < this.lastCount && n > 0) { this.lastCount = n; this.emit({ type: 'count', n }); }
        if (this.countdown <= 0) { this.state = 'playing'; this.emit({ type: 'go' }); }
        return;
      }
      if (this.state !== 'playing') return;
      if (this.race) return this.updateRace(dt);

      this.timeLeft -= dt;
      const elapsed = C.GAME_DURATION - this.timeLeft;
      while (this.bombSchedule.length && this.bombSchedule[0].at <= elapsed) this.spawnBomb(this.bombSchedule.shift().kind);
      while (this.superSchedule.length && this.superSchedule[0] <= elapsed) { this.superSchedule.shift(); this.spawnSuper(); }

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
      if (clean === dirty) return this.startRace(); // empate: carrera para romper la muela
      this.endMatch(clean > dirty ? 'doc' : 'bac');
    }

    endMatch(winner, race) {
      const clean = this.teeth.filter((t) => t.state === 'clean').length, dirty = 16 - clean;
      const players = [...this.players.values()].filter((p) => p.team).map((p) => ({
        id: p.id, name: p.name, team: p.team, skin: p.skin, bot: p.isBot, ...p.stats,
        score: p.stats.kills * 2 + p.stats.teeth * 3 + p.stats.race * 0.3 - p.stats.deaths * 0.5,
      })).sort((a, b) => b.score - a.score);
      const mvp = players.find((p) => p.team === winner) || null;
      this.result = {
        clean, dirty, winner, tiebreak: !!race, race: race || null, players, mvp: mvp ? mvp.id : null,
        progress: { doc: Math.round(this.teamProgress.doc * 10) / 10, bac: Math.round(this.teamProgress.bac * 10) / 10 },
      };
      this.race = null;
      this.state = 'results';
      this.projectiles = []; this.zones = []; this.fungi = []; this.stones = []; this.pickups = [];
      this.players.forEach((p) => { p.action = null; });
      this.emit({ type: 'end', result: this.result });
      this.lobbyVersion++;
    }

    hc(team) { return (this.handicap && this.handicap[team]) || 1; }

    // ───────────── Desempate: carrera para romper la muela ─────────────
    startRace() {
      const R = C.RACE;
      this.race = { doc: 0, bac: 0, cd: R.countdown, lastCount: R.countdown + 1 };
      this.timeLeft = R.time;
      this.bombs = []; this.projectiles = []; this.zones = []; this.fungi = []; this.stones = []; this.pickups = [];
      this.mazeOpen = false; this.legend = null; MAP.setMazeOpen(false); this.blocked = null;
      const idx = { doc: 0, bac: 0 };
      this.players.forEach((p) => {
        if (!p.team) return;
        const i = idx[p.team]++, side = p.team === 'doc' ? -1 : 1;
        // en fila a cada lado de la muela, todos a la misma distancia
        const row = [0, -1, 1, -2, 2, -3, 3][i % 7];
        p.spawn = { x: R.x + side * 7, y: R.y + row * 0.9, a: side < 0 ? 0 : Math.PI };
        p.streak = 0;
        this.respawn(p);
        p.spawnT = 0; p.bomb = null; p.crown = false; p.contagionT = 0; p.cds = {}; p.bot = null;
      });
      this.emit({ type: 'raceStart', hits: R.hits });
      this.lobbyVersion++;
    }

    updateRace(dt) {
      const race = this.race;
      if (race.cd > 0) {
        race.cd -= dt;
        const n = Math.ceil(race.cd);
        if (n < race.lastCount && n > 0) { race.lastCount = n; this.emit({ type: 'count', n }); }
        if (race.cd <= 0) this.emit({ type: 'go' });
      } else this.timeLeft -= dt;
      this.players.forEach((p) => { if (p.team) { if (p.isBot) this.botThink(p, dt); this.updatePlayer(p, dt); } });
      this.updateProjectiles(dt);
      if (this.race && this.timeLeft <= 0) {
        // se acabó el tiempo de la carrera: gana quien lleve más (y si siguen empatados, quien trabajó más los dientes)
        const d = race.doc, b = race.bac;
        const winner = d > b ? 'doc' : b > d ? 'bac' : this.teamProgress.doc >= this.teamProgress.bac ? 'doc' : 'bac';
        this.timeLeft = 0;
        this.endMatch(winner, { doc: Math.floor(d), bac: Math.floor(b), timeout: true });
      }
    }

    // Un disparo a la muela: suma 1 a tu equipo y le resta 1 al rival
    raceHit(pr) {
      const race = this.race, team = pr.team, other = team === 'doc' ? 'bac' : 'doc';
      const v = this.hc(team);
      race[team] = Math.min(C.RACE.hits, race[team] + v);
      race[other] = Math.max(0, race[other] - v);
      const shooter = this.players.get(pr.owner);
      if (shooter) shooter.stats.race++;
      if (race[team] >= C.RACE.hits) {
        this.emit({ type: 'raceBreak', team, id: pr.owner, x: C.RACE.x, y: C.RACE.y });
        this.endMatch(team, { doc: Math.floor(race.doc), bac: Math.floor(race.bac) });
      }
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
      if (p.dizzyT > 0) p.dizzyT = Math.max(0, p.dizzyT - dt);
      if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt);
      if (p.superT > 0) { p.superT -= dt; if (p.superT <= 0) { p.superT = 0; this.emit({ type: 'superEnd', id: p.id }); } }
      if (p.stunT <= 0) p.stunKind = null;
      if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shieldT = 0; p.shieldCd = C.SHIELD_COOLDOWN; } }
      else if (p.shieldCd > 0) p.shieldCd = Math.max(0, p.shieldCd - dt);
      if (p.spawnT > 0) p.spawnT = Math.max(0, p.spawnT - dt);
      const stuck = p.slimedT > 0 || p.stunT > 0 || (this.race && this.race.cd > 0);

      // Girar: siempre permitido (aunque esté inmovilizado puede seguir viendo)
      const inv = p.dizzyT > 0 ? -1 : 1; // gas de la risa: controles al revés
      p.a = (p.a + inv * (inp.tx * Math.abs(inp.tx) * C.TURN_SPEED * dt + (inp.look || 0))) % TAU;
      inp.look = 0;

      // Botones de un solo toque (contadores)
      if (inp.weapon !== p.seen.weapon && !stuck && !this.race) {
        p.weaponIdx = (p.weaponIdx + 1) % C.TEAM_WEAPONS[p.team].length;
        this.emit({ type: 'weapon', id: p.id, weapon: this.weaponOf(p) });
      }
      if (inp.jump !== p.seen.jump && !stuck && p.z <= 0) { p.vz = C.JUMP_VELOCITY; this.emit({ type: 'jump', id: p.id }); }
      if (inp.throw !== p.seen.throw && !stuck && p.bomb) this.throwBomb(p);
      if (inp.shield !== p.seen.shield && !stuck) this.activateShield(p);
      this.syncCounters(p);
      // Habilidades automáticas: el escudo y las bombas se activan solos (sin botones extra)
      if (!stuck && !this.race) this.autoAbilities(p);

      // Salto
      if (p.z > 0 || p.vz > 0) {
        p.z += p.vz * dt; p.vz -= C.GRAVITY * dt;
        if (p.z <= 0) { p.z = 0; p.vz = 0; }
      }

      // Movimiento relativo a la vista
      if (!stuck) {
        let fwd = -inp.my * inv, str = inp.mx * inv;
        const mag = Math.hypot(fwd, str);
        if (mag > 1) { fwd /= mag; str /= mag; }
        // Correr: joystick empujado al tope hacia adelante
        p.sprint = fwd > C.SPRINT_THRESHOLD && Math.abs(str) < 0.45 && !p.action;
        if (mag > 0.08) {
          const sp = this.speedOf(p);
          const ca = Math.cos(p.a), sa = Math.sin(p.a);
          this.moveCircle(p, (ca * fwd - sa * str) * sp * dt, (sa * fwd + ca * str) * sp * dt);
        }
      } else p.sprint = false;

      // Limpiar / ensuciar: el mismo botón de DISPARAR sirve junto a un diente
      const acting = (inp.act || inp.fire) && !stuck && !this.race && !!this.actionInfo(p);
      this.updateAction(p, dt, acting);

      // Disparo
      if (p.superT > 0 && !stuck) this.tryFire(p, p.team === 'doc' ? 'water' : 'acid'); // estrella: disparo automático
      else if (inp.fire && !stuck && !acting) this.tryFire(p);

      if (this.race) return; // en la carrera no hay objetos

      // Recoger bomba
      if (!p.bomb) {
        const b = this.bombs.find((b) => b.state === 'ground' && Math.hypot(b.x - p.x, b.y - p.y) < C.PICKUP_RADIUS);
        if (b) { b.team = p.team; b.type = p.team === 'doc' ? 'clean' : 'dirty'; b.state = 'held'; b.holder = p.id; b.t = C.BOMB_HOLD_TIME; p.bomb = b.id; this.emit({ type: 'bombPick', id: p.id, bombType: b.type, kind: b.kind }); }
      }

      // Potenciadores (flúor para odontólogos, azúcar para bacterias)
      const pk = this.pickups.find((k) => (!k.team || k.team === p.team) && Math.hypot(k.x - p.x, k.y - p.y) < C.BOOST.radius
        && !(k.type === 'crown' && p.crown) && !(k.type === 'strain' && p.contagionT > 0));
      if (pk) {
        this.pickups = this.pickups.filter((k) => k !== pk);
        if (pk.type === 'super') {
          p.superT = C.SUPER.duration; p.slimedT = 0; p.stunT = 0; p.sticky = 0; p.stickyT = 0; p.dizzyT = 0; p.slowT = 0;
          this.emit({ type: 'superPick', id: p.id });
        } else if (pk.type === 'crown') { p.crown = true; this.emit({ type: 'crownPick', id: p.id }); }
        else if (pk.type === 'strain') {
          p.contagionT = C.CONTAGION.duration; p.contagionTick = C.CONTAGION.every; p.contagionLeft = C.CONTAGION.maxTeeth;
          this.emit({ type: 'contagionStart', id: p.id });
        } else { p.boostT = C.BOOST.duration; this.emit({ type: 'boost', id: p.id, kind: pk.type }); }
      }
    }

    activateShield(p) {
      if (p.team !== 'doc' || p.shieldT > 0 || p.shieldCd > 0) return;
      p.shieldT = C.SHIELD_TIME;
      this.emit({ type: 'shield', id: p.id });
    }

    // Escudo: se activa solo cuando una viscosidad enemiga viene directo hacia ti.
    // Bombas: la dental se lanza sola al rato de agarrarla; las de efecto, hacia el rival visible más cercano.
    autoAbilities(p) {
      const A = C.AUTO;
      if (p.team === 'doc' && p.shieldT <= 0 && p.shieldCd <= 0 && p.slimedT <= 0 && p.immuneT <= 0 && p.spawnT <= 0) {
        const incoming = this.projectiles.some((q) => {
          if (q.type !== 'slime' || q.team === p.team) return false;
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
          return d < A.shieldDist && (dx * q.vx + dy * q.vy) / (d * Math.hypot(q.vx, q.vy) || 1) > 0.8;
        });
        if (incoming) this.activateShield(p);
      }
      if (!p.bomb) return;
      const b = this.bombs.find((q) => q.id === p.bomb);
      if (!b) return;
      const held = C.BOMB_HOLD_TIME - b.t;
      if (!b.kind || b.kind === 'teeth') { if (held >= A.bombTeethDelay) this.throwBomb(p); return; }
      let tgt = null, td = A.bombRange;
      this.players.forEach((e) => {
        if (!e.team || e.team === p.team || !e.alive) return;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 1.2 && d < td && lineOfSight(p.x, p.y, e.x, e.y)) { td = d; tgt = e; }
      });
      if (tgt && held > 0.4) this.throwBomb(p, Math.atan2(tgt.y - p.y, tgt.x - p.x), td);
      else if (b.t < 2) this.throwBomb(p);
    }

    speedOf(p) {
      if (this.race) return C.RACE.speed * (p.sprint ? C.SPRINT_SPEED : 1); // carrera: todos igual de rápidos
      let sp = p.team === 'doc' ? C.DOCTOR_SPEED : C.BACTERIA_SPEED;
      if (p.sprint) sp *= C.SPRINT_SPEED;
      if (p.action) sp *= 0.6;
      if (p.sticky) sp *= C.STICKY_SPEED;
      if (p.boostT > 0) sp *= C.BOOST.speed;
      if (p.slowT > 0) sp *= C.BOMB_KINDS.floss.speed;
      if (p.superT > 0) return sp * C.SUPER.speed; // la estrella ignora saliva y caries
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
      if (this.race && (x - C.RACE.x) ** 2 + (y - C.RACE.y) ** 2 < (C.RACE.radius + r) ** 2) return true;
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
      const step = dt / C.TOOTH_ACTION_TIME * (p.boostT > 0 ? C.BOOST.actionSpeed : 1) * this.hc(p.team);
      p.action.t += step;
      this.teamProgress[p.team] += step;
      if (p.action.t >= 1) {
        t.state = p.team === 'doc' ? 'clean' : 'dirty';
        p.action = null;
        p.stats.teeth++;
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

    tryFire(p, force) {
      const w = force || this.weaponOf(p), W = C.WEAPONS[w];
      if (!W.kind || (p.cds[w] || 0) > 0) return;
      p.cds[w] = this.cooldownOf(p, w);
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
      let a = this.aimAngle(p, W.range);
      if (this.race) { // ayuda de puntería hacia la muela
        const m = Math.atan2(C.RACE.y - p.y, C.RACE.x - p.x);
        a = Math.abs(angDiff(p.a, m)) < C.AIM_ASSIST_DEG * 1.5 * Math.PI / 180 ? m : p.a;
      }
      if (W.spread) a += (Math.random() - 0.5) * W.spread * 2; // la metralleta dispersa un poco
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
          if (this.race) { // carrera: los disparos solo cuentan contra la muela
            if ((pr.x - C.RACE.x) ** 2 + (pr.y - C.RACE.y) ** 2 < (C.RACE.radius + W.radius) ** 2) {
              alive = false;
              this.emit({ type: 'impact', weapon: pr.type, x: pr.x, y: pr.y, on: 'race', team: pr.team });
              this.raceHit(pr);
              if (!this.race) return; // la muela se rompió: fin de la partida
            }
            continue;
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
      if (e.superT > 0 || e.spawnT > 0) { this.emit({ type: 'blocked', id: e.id, weapon: pr.type, x: e.x, y: e.y }); return; } // estrella / recién reaparecido: inmune
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
      if (!e.alive || e.superT > 0 || e.spawnT > 0) return;
      e.hp -= amount / this.hc(e.team);
      e.flashT = 0.25;
      this.emit({ type: 'hit', id: e.id, by: by && by.id, weapon });
      if (e.hp <= 0) this.kill(e, by, weapon);
    }

    kill(e, by, weapon) {
      e.hp = 0; e.alive = false; e.action = null; e.slimedT = 0; e.z = 0; e.vz = 0;
      e.deadT = e.team === 'bac' ? C.BACTERIA_RESPAWN_TIME : C.DOCTOR_RESPAWN_TIME;
      e.dizzyT = 0; e.slowT = 0; e.superT = 0;
      const lost = e.streak || 0;
      e.streak = 0; // al morir se pierden las mejoras
      e.stats.deaths++;
      if (by && by.team && by.team !== e.team) by.stats.kills++;
      this.dropBomb(e);
      this.emit({ type: 'kill', id: e.id, by: by && by.id, weapon, x: e.x, y: e.y, lost });
      // Racha: más vida y disparo más rápido para quien elimina a un rival
      if (by && by.team && by.team !== e.team && by.alive) {
        if (by.streak < C.STREAK.max) {
          by.streak++;
          by.maxHp += C.STREAK.hp;
          this.emit({ type: 'levelUp', id: by.id, lv: by.streak });
        }
        by.hp = Math.min(by.maxHp, by.hp + C.STREAK.hp + C.STREAK.heal);
      }
    }

    updateZones(dt) {
      const W = C.WEAPONS.acid;
      this.zones = this.zones.filter((z) => (z.t -= dt) > 0);
      for (const z of this.zones) {
        this.players.forEach((p) => {
          if (p.team !== 'doc' || !p.alive || p.z > 0.1 || p.superT > 0 || p.spawnT > 0) return;
          if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) {
            p.hp -= W.puddleDps * dt / this.hc(p.team);
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

    spawnBomb(kind) {
      const s = this.bombSpot();
      const b = { id: this.uid++, type: 'neutral', kind: C.BOMB_KINDS[kind] ? kind : 'teeth', team: null, state: 'ground', x: s.x, y: s.y, z: 0, t: C.BOMB_LIFETIME, holder: null };
      this.bombs.push(b);
      this.emit({ type: 'bombSpawn', bombType: b.type, kind: b.kind, x: b.x, y: b.y });
    }

    spawnSuper() {
      const s = this.bombSpot();
      this.pickups.push({ id: this.uid++, type: 'super', team: null, x: s.x, y: s.y, t: C.SUPER.life });
      this.emit({ type: 'superSpawn', x: s.x, y: s.y });
    }

    dropBomb(p) {
      if (!p.bomb) return;
      const b = this.bombs.find((b) => b.id === p.bomb);
      p.bomb = null;
      if (!b) return;
      this.emit({ type: 'bombDrop', id: p.id, bombType: b.type });
      b.state = 'ground'; b.holder = null; b.t = C.BOMB_LIFETIME; b.x = p.x; b.y = p.y; b.z = 0; b.type = 'neutral'; b.team = null;
    }

    // ang/dist opcionales: lanzamiento automático apuntado a un rival (cae justo encima)
    throwBomb(p, ang = p.a, dist) {
      const b = this.bombs.find((b) => b.id === p.bomb);
      p.bomb = null;
      if (!b) return;
      b.state = 'flying'; b.holder = null; b.owner = p.id;
      b.x = p.x; b.y = p.y; b.z = 0.8 + p.z;
      const sp = dist ? clamp(dist / 0.83, 2, C.BOMB_THROW_SPEED) : C.BOMB_THROW_SPEED; // ~0,83 s de vuelo
      b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp; b.vz = 3;
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
      if (b.kind && b.kind !== 'teeth') return this.explodeEffect(b);
      const from = b.type === 'clean' ? 'dirty' : 'clean';
      const pool = shuffle(this.teeth.filter((t) => t.state === from && !(b.type === 'dirty' && t.crownT > 0))).slice(0, C.BOMB_TEETH_AFFECTED);
      pool.forEach((t) => { t.state = b.type; });
      this.players.forEach((p) => { if (p.action && pool.some((t) => t.id === p.action.tooth)) p.action = null; });
      this.emit({ type: 'bombExplode', bombType: b.type, kind: 'teeth', x: b.x, y: b.y, teeth: pool.map((t) => t.id) });
    }

    // Bombas de efecto: afectan a los enemigos del equipo que la lanzó dentro del radio
    explodeEffect(b) {
      const K = C.BOMB_KINDS[b.kind], ids = [];
      const thrower = this.players.get(b.owner);
      this.players.forEach((p) => {
        if (!p.team || !p.alive || p.team === b.team || p.superT > 0 || p.spawnT > 0) return;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d > K.radius || !lineOfSight(b.x, b.y, p.x, p.y)) return;
        ids.push(p.id);
        p.action = null;
        this.dropBomb(p);
        if (b.kind === 'anest') { p.stunT = K.stun; p.stunKind = 'anest'; p.vz = 0; p.z = 0; }
        else if (b.kind === 'gas') p.dizzyT = K.time;
        else if (b.kind === 'floss') { p.slowT = K.time; p.shieldT = 0; }
        else if (b.kind === 'amalgam') {
          const a = d > 0.01 ? Math.atan2(p.y - b.y, p.x - b.x) : Math.random() * TAU;
          this.moveCircle(p, Math.cos(a) * K.knockback, Math.sin(a) * K.knockback);
          this.damage(p, Math.round(K.damage * (1 - 0.5 * d / K.radius)), thrower || null, 'amalgam');
        }
      });
      this.emit({ type: 'bombExplode', bombType: b.type, kind: b.kind, team: b.team, x: b.x, y: b.y, r: K.radius, ids, teeth: [] });
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
          if (!p.team || !p.alive || p.superT > 0 || p.spawnT > 0 || (f.cd[p.id] || 0) > 0) return;
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
            if (d > T.radius || p.superT > 0 || p.spawnT > 0) return;
            hit.push(p.id);
            // empujar fuera de la piedra
            const min = T.rockRadius + C.PLAYER_RADIUS + 0.05;
            if (d < min) {
              const a = d > 0.01 ? Math.atan2(p.y - s.y, p.x - s.x) : Math.random() * TAU;
              const nx = s.x + Math.cos(a) * min, ny = s.y + Math.sin(a) * min;
              if (!this.collides(nx, ny, 0)) { p.x = nx; p.y = ny; }
            }
            p.stunT = T.stun; p.stunKind = 'tonsil'; p.action = null; p.vz = 0; p.z = 0;
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
        const changed = shuffle(this.teeth.filter((t) => t.state !== goal && !(goal === 'dirty' && t.crownT > 0))).slice(0, L.teeth);
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
          bk: p.bomb ? (this.bombs.find((b) => b.id === p.bomb) || {}).kind || null : null,
          sup: +p.superT.toFixed(2), dizzy: +p.dizzyT.toFixed(1), slow: +p.slowT.toFixed(1), lv: p.streak, stunK: p.stunKind,
          prot: +p.spawnT.toFixed(2), run: p.sprint,
        })),
        race: this.race ? { doc: Math.floor(this.race.doc), bac: Math.floor(this.race.bac), cd: +Math.max(0, this.race.cd).toFixed(2) } : null,
        teeth: this.teeth.map((t) => ({ s: t.state === 'dirty' ? 1 : 0, c: +t.crownT.toFixed(1), p: work[t.id] ? +work[t.id].p.toFixed(3) : 0, w: work[t.id] ? work[t.id].team : null })),
        proj: this.projectiles.map((q) => ({ id: q.id, t: q.type, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2) })),
        bombs: this.bombs.map((b) => ({ id: b.id, type: b.type, kind: b.kind, st: b.state, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), t: +b.t.toFixed(1), holder: b.holder })),
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
      const base = { st: this.state, tl: Math.max(0, this.timeLeft), cd: Math.max(0, this.countdown), score: { clean, dirty: 16 - clean }, res: this.result,
        race: this.race ? { doc: Math.floor(this.race.doc), bac: Math.floor(this.race.bac), cd: +Math.max(0, this.race.cd).toFixed(1) } : null };
      if (!p.team) return base;
      const w = this.weaponOf(p), W = C.WEAPONS[w];
      const bomb = p.bomb ? this.bombs.find((b) => b.id === p.bomb) : null;
      base.me = {
        team: p.team, skin: p.skin, name: p.name, hp: Math.ceil(p.hp), mhp: p.maxHp, alive: p.alive,
        dead: +p.deadT.toFixed(1), slimed: +p.slimedT.toFixed(1), weapon: w,
        cd: +((p.cds[w] || 0).toFixed(1)), cdMax: this.cooldownOf(p, w),
        canAct: !!this.actionTarget(p), act: p.action ? +p.action.t.toFixed(2) : 0,
        bomb: bomb ? { type: bomb.type, kind: bomb.kind, t: +bomb.t.toFixed(1) } : null,
        sup: +p.superT.toFixed(1), dizzy: +p.dizzyT.toFixed(1), slow: +p.slowT.toFixed(1), lv: p.streak, stunK: p.stunKind,
        shield: +p.shieldT.toFixed(1), shieldCd: +p.shieldCd.toFixed(1), stun: +p.stunT.toFixed(1), sticky: p.sticky, boost: +p.boostT.toFixed(1), crown: p.crown, contagion: +p.contagionT.toFixed(1),
        actKind: (this.actionInfo(p) || {}).kind || null,
        prot: +p.spawnT.toFixed(1), run: p.sprint, weapons: this.race ? [C.RACE.weapon] : C.TEAM_WEAPONS[p.team],
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

      // Carrera de desempate: acercarse a la muela y disparar sin parar
      if (this.race) {
        const R = C.RACE, d = Math.hypot(R.x - p.x, R.y - p.y), to = Math.atan2(R.y - p.y, R.x - p.x);
        const rel = angDiff(p.a, to);
        inp.tx = clamp(rel * 2.5, -1, 1);
        if (d > 3.5 + bot.jitter * 0.3) { inp.my = -Math.cos(rel); inp.mx = Math.sin(rel); }
        inp.fire = Math.abs(rel) < 0.15 && Math.random() < 0.8;
        return;
      }

      bot.think -= dt;
      // Enemigo visible más cercano
      let enemy = null, ed = 9;
      this.players.forEach((e) => {
        if (!e.team || e.team === p.team || !e.alive) return;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < ed && lineOfSight(p.x, p.y, e.x, e.y)) { ed = d; enemy = e; }
      });

      // Bombas de efecto: lanzarlas hacia un rival cercano; la dental, en cualquier momento
      if (p.bomb) {
        const b = this.bombs.find((q) => q.id === p.bomb);
        const effect = b && b.kind !== 'teeth';
        const aimed = enemy && ed > 2 && ed < 7 && Math.abs(angDiff(p.a, Math.atan2(enemy.y - p.y, enemy.x - p.x))) < 0.25;
        if (effect ? aimed || (b.t < 3 && Math.random() < dt * 2) : Math.random() < dt * 0.8) { bot.throw++; inp.throw = bot.throw; }
      }

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
        if (Math.abs(angDiff(p.a, faceTo)) < 0.18 && Math.random() < 0.5) inp.fire = true;
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
        const boost = this.pickups.find((k) => (!k.team || k.team === p.team) && Math.hypot(k.x - p.x, k.y - p.y) < (k.type === 'super' ? 14 : 10));
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
