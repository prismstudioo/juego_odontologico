// Pantalla de juego: divide en vistas (1, 2 o 4), dibuja HUD por jugador, minimapa,
// efectos, sonidos y la capa HTML global (marcador, bombas, avisos, cuenta atrás, resultados).
(function () {
  const C = MOC.CONFIG, MAP = MOC.MAP, R = MOC.Render3D, TC = R.TEAM_COLOR;
  const FONT = '"Pixelify Sans", "Courier New", monospace';
  const TEAM_NAME = { doc: '🦷 ODONTÓLOGO', bac: '🦠 BACTERIA' };
  const BOMB_NAME = { clean: 'BOMBA DE LIMPIEZA', dirty: 'BOMBA DE CONTAMINACIÓN', neutral: 'BOMBA DENTAL' };
  // Nombre e ícono de una bomba según su tipo (las de dientes cambian de nombre según el equipo)
  const bombLabel = (kind, type) => (!kind || kind === 'teeth' ? `💣 ${BOMB_NAME[type] || BOMB_NAME.neutral}` : `${C.BOMB_KINDS[kind].icon} ${C.BOMB_KINDS[kind].label}`);
  const BOMB_FX = { // colores de partículas, destello y texto del anuncio al explotar
    anest: { cols: ['#ff7ad0', '#fff', '#ffc0e8'], flash: '#ff9ad8', text: '💉 ¡ANESTESIA!', sub: 'dormidos' },
    gas: { cols: ['#b88aff', '#e0d0ff', '#fff'], flash: '#c8a0ff', text: '😂 ¡GAS DE LA RISA!', sub: 'con controles al revés' },
    amalgam: { cols: ['#dfe4ee', '#8a93a3', '#fff', '#ffd84a'], flash: '#fff', text: '💥 ¡AMALGAMA!', sub: 'heridos' },
    floss: { cols: ['#fff', '#e8f8ff', '#9adfff'], flash: '#e8f8ff', text: '🧵 ¡HILO DENTAL!', sub: 'enredados y lentos' },
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const fmtTime = (s) => { s = Math.ceil(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function buildMinimap() {
    const c = document.createElement('canvas');
    c.width = MAP.W; c.height = MAP.H;
    const g = c.getContext('2d');
    const WALL_COL = ['', '#5a1826', '#c85a74', '#c8a870', '#5a1826', '#2a0610'];
    const FLOOR_COL = ['#2c0c14', '#4a1a26', '#2a4a60', '#5a4a1a', '#120604'];
    for (let y = 0; y < MAP.H; y++) for (let x = 0; x < MAP.W; x++) {
      const w = MAP.grid[y * MAP.W + x];
      g.fillStyle = w ? WALL_COL[w] : FLOOR_COL[MAP.floor[y * MAP.W + x]];
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  class GameView {
    constructor(canvas, overlay, assets, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.A = assets;
      this.overlay = overlay;
      this.onAgain = opts.onAgain || null;
      this.phone = !!opts.phone;
      this.targets = {};
      this.minimap = buildMinimap();
      this.lastPos = {};
      this.fx = { particles: [], recoil: {}, moving: {}, cam: {}, shakeUntil: 0, flashUntil: 0, flashColor: '', toothFlash: [], toothFlashColor: [] };
      this.cache = {};
      this.goUntil = 0;
      this.buildOverlay();
    }

    buildOverlay() {
      this.overlay.innerHTML = `
        <div class="ov-col">
          <div class="ov-top"><div class="sc sc-doc">🦷 <b>0</b></div><div class="sc-time">03:00</div><div class="sc sc-bac"><b>0</b> 🦠</div></div>
          <div class="ov-race hidden"></div>
          <div class="ov-bombs"></div>
          <div class="ov-announce"></div>
          <div class="ov-feed"></div>
        </div>
        <div class="ov-count hidden"></div>
        <div class="ov-results hidden"></div>`;
      const q = (s) => this.overlay.querySelector(s);
      this.el = { doc: q('.sc-doc b'), bac: q('.sc-bac b'), time: q('.sc-time'), bombs: q('.ov-bombs'), announce: q('.ov-announce'), feed: q('.ov-feed'), count: q('.ov-count'), results: q('.ov-results'), race: q('.ov-race') };
    }

    setText(key, el, text, html) {
      if (this.cache[key] === text) return;
      this.cache[key] = text;
      if (html) el.innerHTML = text; else el.textContent = text;
    }

    announce(html, cls = '', ms = 1800) {
      ms = Math.min(ms, cls.includes('big') ? 2200 : 1800);
      const d = document.createElement('div');
      d.className = 'ann ' + cls;
      d.innerHTML = html;
      this.el.announce.appendChild(d);
      while (this.el.announce.children.length > 2) this.el.announce.firstChild.remove();
      setTimeout(() => d.remove(), ms);
    }

    feed(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      this.el.feed.appendChild(d);
      while (this.el.feed.children.length > 3) this.el.feed.firstChild.remove();
      setTimeout(() => d.remove(), 3000);
    }

    burst(x, y, z, colors, n, speed = 2.5, size = 0.08) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
        const life = 0.4 + Math.random() * 0.6;
        this.fx.particles.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + Math.random() * 3, life, max: life, color: colors[i % colors.length], size: size * (0.6 + Math.random()) });
      }
      if (this.fx.particles.length > 600) this.fx.particles.splice(0, this.fx.particles.length - 600);
    }

    // ── Eventos del servidor → sonido, partículas y avisos ──
    handleEvents(events, snap) {
      const now = performance.now(), Au = MOC.Audio;
      const name = (id) => { const p = snap.players.find((q) => q.id === id); return p ? `<span class="t-${p.team}">${esc(p.name)}</span>` : '?'; };
      const COLORS = { smg: ['#ffe066', '#fff', '#fa3'], water: ['#bff', '#4cf', '#fff'], drill: ['#ddd', '#fd4', '#999'], slime: ['#9f4', '#5c1', '#dfa'], acid: ['#df3', '#9b1', '#ffa'] };
      for (const e of events) {
        switch (e.type) {
          case 'shot': Au.play(e.weapon); this.fx.recoil[e.id] = now; break;
          case 'impact':
            if (e.on === 'race') { this.burst(e.x, e.y, 0.9, e.team === 'doc' ? ['#fff', '#6cf', '#bef'] : ['#8f3', '#5a1', '#cf6'], 6, 2, 0.07); this.fx.raceFlash = now; break; }
            this.burst(e.x, e.y, 0.5, COLORS[e.weapon] || ['#fff'], 10); if (!e.on) Au.play('impact');
            break;
          case 'hit': Au.play('hit'); break;
          case 'kill': {
            const v = snap.players.find((p) => p.id === e.id);
            this.burst(e.x, e.y, 0.5, v && v.team === 'bac' ? ['#a6f', '#6cf', '#8f4', '#fff'] : ['#f33', '#fff', '#a00'], 40, 3.5, 0.12);
            Au.play('kill');
            const icon = C.WEAPONS[e.weapon] ? C.WEAPONS[e.weapon].icon : { fungus: '🍄', tonsil: '🪨', amalgam: '💥' }[e.weapon] || '💀';
            this.feed(e.by ? `${name(e.by)} ${icon} ${name(e.id)}` : `${icon} ${name(e.id)} cayó`);
            if (e.lost >= 2) this.feed(`💔 ${name(e.id)} perdió su racha de nivel ${e.lost}`);
            break;
          }
          case 'slimed': Au.play('slimed'); this.feed(`${name(e.by)} 🟢 inmovilizó a ${name(e.id)}`); break;
          case 'shield': Au.play('shield'); break;
          case 'blocked': Au.play('blocked'); this.burst(e.x, e.y, 0.6, ['#bff', '#7ef', '#fff'], 14, 2.5, 0.07); break;
          case 'sticky': Au.play('sticky'); this.feed(`${name(e.by)} 🟢 dejó pegajoso a ${name(e.id)} (1/2)`); break;
          case 'fungusSpawn': Au.play('fungus'); this.announce('🍄 ¡HONGO CÁNDIDA!<small>Persigue a todos · dispárale</small>', 'b-fungus', 3000); break;
          case 'fungusBite': Au.play('bite'); this.burst(e.x, e.y, 0.6, ['#d070e0', '#ffe070', '#fff'], 16); break;
          case 'fungusDie': Au.play('kill'); this.burst(e.x, e.y, 0.6, ['#d070e0', '#9a30b0', '#ffe070'], 50, 4, 0.12); this.feed(e.by ? `${name(e.by)} 🍄 eliminó al hongo` : '🍄 hongo eliminado'); break;
          case 'fungusGone': this.burst(e.x, e.y, 0.5, ['#d070e0', '#9a30b0'], 20); break;
          case 'stoneWarn': Au.play('whistle'); break;
          case 'stoneHit':
            Au.play('thud');
            this.burst(e.x, e.y, 0.3, ['#e8d898', '#fff4c8', '#a08a48'], 24, 3, 0.1);
            if (e.ids.length) { this.fx.shakeUntil = Math.max(this.fx.shakeUntil, now + 250); this.feed(`🪨 tonsilolito noqueó a ${e.ids.map(name).join(', ')}`); }
            break;
          case 'boostSpawn': this.announce('🧴 FLÚOR y 🍬 AZÚCAR<small>aparecieron en el mapa</small>', '', 2200); break;
          case 'boost': Au.play('pickup'); this.feed(`⚡ ${name(e.id)} tomó ${e.kind === 'fluor' ? '🧴 FLÚOR' : '🍬 AZÚCAR'}`); break;
          case 'specialSpawn': Au.play('bombSpawn'); this.announce('👑 CORONA y 🧫 CEPA DE CARIES<small>¡aparecieron! cada equipo tiene la suya</small>', 'big', 3000); break;
          case 'crownPick': Au.play('pickup'); this.announce(`👑 ${name(e.id)} tiene una CORONA`, 'b-clean'); break;
          case 'crown': {
            const t = MAP.teeth[e.tooth];
            Au.play('crown');
            this.burst(t.x, t.y, 1.2, ['#ffd84a', '#fff', '#e8b020'], 30, 2, 0.08);
            this.fx.toothFlash[e.tooth] = now + 800; this.fx.toothFlashColor[e.tooth] = '#ffd84a';
            this.announce('👑 ¡DIENTE PROTEGIDO CON CORONA!', 'b-clean', 2200);
            break;
          }
          case 'mazeWarn': Au.play('bombSpawn'); this.announce(`⏳ ¡EN LOS ÚLTIMOS ${e.at} SEGUNDOS SE ABRE LA LENGUA!<small>el objeto legendario puede decidir la partida</small>`, 'big b-neutral', 3000); break;
          case 'mazeOpen':
            Au.play('boom');
            this.fx.shakeUntil = now + 600;
            this.burst(e.x, e.y, 1, ['#ffd84a', '#fff', '#e8a810'], 40, 3, 0.1);
            this.announce('👅 ¡LA LENGUA SE ABRIÓ!<small>⭐ corre al centro del laberinto</small>', 'big b-neutral', 2500);
            break;
          case 'legend': {
            const doc = e.team === 'doc';
            Au.play('crown'); Au.play('boom');
            this.fx.flashUntil = now + 1200; this.fx.flashColor = doc ? '#9df' : '#6a3a10';
            this.fx.shakeUntil = now + 900;
            e.teeth.forEach((i) => { const t = MAP.teeth[i]; this.burst(t.x, t.y, 0.8, doc ? ['#fff', '#8ef', '#bef'] : ['#5a2a08', '#c86a20', '#fff'], 18, 2, 0.08); this.fx.toothFlash[i] = now + 1500; this.fx.toothFlashColor[i] = doc ? '#bff' : '#8a4a10'; });
            this.announce(doc ? `🦷🧴 ¡ENJUAGUE BUCAL LEGENDARIO!<small>${name(e.id)} limpió todos los dientes</small>` : `🦠🥤 ¡COCA LEGENDARIA!<small>${name(e.id)} ensució todos los dientes</small>`, 'big b-' + (doc ? 'clean' : 'dirty'), 3000);
            break;
          }
          case 'contagionStart': Au.play('dirty'); this.announce(`🧫 ¡${name(e.id)} esparce CARIES!<small>Elimínalo para detener el contagio</small>`, 'b-dirty', 3000); break;
          case 'contagionEnd': this.feed(`🧫 el contagio de ${name(e.id)} terminó`); break;
          case 'tooth': {
            const t = MAP.teeth[e.tooth], clean = e.state === 'clean';
            this.burst(t.x, t.y, 0.8, clean ? ['#fff', '#8ef', '#4cf'] : ['#9f4', '#cc3', '#6a1'], 26, 2, 0.07);
            this.fx.toothFlash[e.tooth] = now + 400;
            this.fx.toothFlashColor[e.tooth] = clean ? '#bff' : '#9f4';
            Au.play(clean ? 'clean' : 'dirty');
            break;
          }
          case 'bombSpawn': Au.play('bombSpawn'); this.announce(`${bombLabel(e.kind, 'neutral')}<small>${!e.kind || e.kind === 'teeth' ? 'la gana el equipo que la agarre' : 'agárrala y lánzala a los rivales'}</small>`, 'b-neutral', 3000); break;
          case 'bombPick': Au.play('bombPick'); this.announce(`${name(e.id)} tiene la ${bombLabel(e.kind, e.bombType)}`, 'b-' + e.bombType); break;
          case 'superSpawn': Au.play('bombSpawn'); this.announce('⭐ ¡DIENTE DE ORO!<small>cualquiera puede agarrarlo: inmortal, súper veloz y disparo automático</small>', 'big b-neutral', 3000); break;
          case 'superPick': {
            Au.play('crown'); Au.play('pickup');
            const p = snap.players.find((q) => q.id === e.id);
            if (p) this.burst(p.x, p.y, 0.8, ['#ffd84a', '#ff6ad5', '#6af0ff', '#fff'], 40, 3, 0.1);
            this.announce(`⭐ ¡${name(e.id)} ES INVENCIBLE!<small>${C.SUPER.duration} segundos · ¡huyan!</small>`, 'big b-neutral', 2500);
            break;
          }
          case 'superEnd': this.feed(`⭐ se acabó la estrella de ${name(e.id)}`); break;
          case 'levelUp': {
            Au.play('pickup');
            const p = snap.players.find((q) => q.id === e.id);
            if (p) this.burst(p.x, p.y, 1, ['#ffe066', '#fff', '#fa3'], 20, 2, 0.07);
            this.feed(`⬆️ ${name(e.id)} sube a NIVEL ${e.lv} <small>(+vida, +cadencia)</small>`);
            break;
          }
          case 'bombDrop': this.announce(`¡${name(e.id)} soltó la bomba!`, 'b-' + e.bombType); break;
          case 'bombThrow': Au.play('bombThrow'); break;
          case 'bombExpire': this.announce(e.held ? '💨 La bomba se desactivó (no la lanzaron a tiempo)' : '💨 La bomba desapareció', '', 2000); break;
          case 'bombExplode': {
            if (e.kind && e.kind !== 'teeth') {
              const F = BOMB_FX[e.kind];
              Au.play('boom');
              this.fx.shakeUntil = now + (e.kind === 'amalgam' ? 800 : 500);
              this.fx.flashUntil = now + 700; this.fx.flashColor = F.flash;
              this.burst(e.x, e.y, 0.5, F.cols, 90, 6, 0.15);
              // anillo de partículas que marca el radio del efecto
              for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; this.burst(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, 0.2, F.cols, 1, 0.5, 0.1); }
              this.announce(`${F.text}<small>${e.ids.length ? e.ids.map(name).join(', ') + ' ' + F.sub : 'no alcanzó a nadie'}</small>`, 'big b-' + (e.team === 'doc' ? 'clean' : 'dirty'), 2600);
              break;
            }
            const clean = e.bombType === 'clean';
            Au.play('boom');
            this.fx.shakeUntil = now + 700;
            this.fx.flashUntil = now + 900;
            this.fx.flashColor = clean ? '#9df' : '#8f3';
            this.burst(e.x, e.y, 0.5, clean ? ['#fff', '#6cf', '#bef'] : ['#8f3', '#5a1', '#cf6'], 80, 6, 0.15);
            e.teeth.forEach((i) => {
              const t = MAP.teeth[i];
              this.burst(t.x, t.y, 0.8, clean ? ['#fff', '#8ef'] : ['#9f4', '#cc3'], 20, 2, 0.08);
              this.fx.toothFlash[i] = now + 1200;
              this.fx.toothFlashColor[i] = clean ? '#bff' : '#9f4';
            });
            this.announce(`${clean ? '🦷 LIMPIEZA MASIVA' : '🦠 CONTAMINACIÓN MASIVA'}<small>${e.teeth.length} dientes cambiaron</small>`, 'big b-' + e.bombType, 3200);
            break;
          }
          case 'raceStart':
            Au.play('bombSpawn');
            this.fx.flashUntil = now + 600; this.fx.flashColor = '#ffe066';
            this.announce(`⚖️ ¡EMPATE! CARRERA DE LA MUELA<small>dispárale: ${e.hits} disparos la rompen · cada disparo le resta al rival</small>`, 'big b-neutral', 4000);
            break;
          case 'raceBreak': {
            const doc = e.team === 'doc';
            Au.play('boom'); Au.play('crown');
            this.fx.shakeUntil = now + 900; this.fx.flashUntil = now + 1000; this.fx.flashColor = doc ? '#9df' : '#8f3';
            this.burst(e.x, e.y, 1, doc ? ['#fff', '#6cf', '#bef', '#ffe066'] : ['#8f3', '#5a1', '#cf6', '#ffe066'], 140, 7, 0.16);
            break;
          }
          case 'count': Au.play('count'); break;
          case 'go': Au.play('go'); this.goUntil = now + 900; break;
          case 'end': Au.play('end'); break;
          case 'jump': Au.play('jump'); break;
          case 'weapon': Au.play('weapon'); break;
        }
      }
    }

    // n vistas: 1 = completa, 2 = lado a lado, más = 2 filas (arriba odontólogos, abajo bacterias)
    layout(n) {
      const W = this.canvas.width, H = this.canvas.height, g = 4;
      const rows = n <= 2 ? 1 : 2, cols = Math.ceil(n / rows);
      const w = (W - g * (cols - 1)) / cols, h = (H - g * (rows - 1)) / rows;
      const rects = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) rects.push({ x: c * (w + g), y: r * (h + g), w, h });
      return rects;
    }

    // Modos grandes (5v5, 7v7): cámara aérea grande a la izquierda y cámaras de jugadores a la derecha
    layoutFor(ids, snap) {
      if (ids[0] !== 'aerial') return this.layout(ids.length);
      const W = this.canvas.width, H = this.canvas.height, g = 4;
      const aw = Math.round(Math.min(W * 0.45, H * 1.05));
      this.aerialCx = aw / 2;
      const rects = [{ x: 0, y: 0, w: aw, h: H }];
      const x0 = aw + g, rw = W - x0, hh = (H - g) / 2;
      ['doc', 'bac'].forEach((team, ti) => {
        const n = ids.filter((id) => { const p = snap.players.find((q) => q.id === id); return p && p.team === team; }).length;
        const rows = n > 1 ? 2 : 1, cols = Math.max(1, Math.ceil(n / rows));
        const w = (rw - g * (cols - 1)) / cols, h = (hh - g * (rows - 1)) / rows;
        for (let i = 0; i < n; i++) rects.push({ x: x0 + (i % cols) * (w + g), y: ti * (hh + g) + Math.floor(i / cols) * (h + g), w, h });
      });
      return rects;
    }

    // Orden de las cámaras: fila de odontólogos y fila de bacterias (null = casilla vacía → mapa)
    static viewOrder(snap) {
      const docs = snap.players.filter((p) => p.team === 'doc').map((p) => p.id);
      const bacs = snap.players.filter((p) => p.team === 'bac').map((p) => p.id);
      if (docs.length <= 1 && bacs.length <= 1) return [...docs, ...bacs];
      if (docs.length + bacs.length >= 8) return ['aerial', ...docs, ...bacs];
      const cols = Math.max(docs.length, bacs.length);
      const pad = (a) => a.concat(Array(cols - a.length).fill(null));
      return [...pad(docs), ...pad(bacs)];
    }

    // Fondo de la cámara aérea: la boca vista desde arriba con las mismas texturas (con relieve en las paredes)
    aerialBase() {
      if (this._aerial) return this._aerial;
      const TEX = MOC.TEX, TS = TEX.TS, P = 12;
      const c = document.createElement('canvas');
      c.width = MAP.W * P; c.height = MAP.H * P;
      const g = c.getContext('2d');
      const img = g.createImageData(c.width, c.height), buf = new Uint32Array(img.data.buffer);
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const cx = (x / P) | 0, cy = (y / P) | 0, i = cy * MAP.W + cx;
        const wall = MAP.grid[i], tex = wall ? TEX.walls[wall] : TEX.floors[MAP.floor[i]];
        let col = tex[(((y % P) * TS / P) | 0) * TS + (((x % P) * TS / P) | 0)];
        if (wall) { // oscurecer paredes y resaltar el borde superior (relieve)
          const below = cy + 1 < MAP.H && !MAP.grid[i + MAP.W];
          const k = below && y % P > P - 4 ? 0.45 : 0.75;
          col = (255 << 24) | ((((col >> 16) & 255) * k) << 16) | ((((col >> 8) & 255) * k) << 8) | ((col & 255) * k);
        }
        buf[y * c.width + x] = col;
      }
      g.putImageData(img, 0, 0);
      return (this._aerial = c);
    }

    // Casilla sin jugador (modo 7): cámara aérea en vivo para el público
    drawAerial(ctx, r, snap, now) {
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.fillStyle = '#12040a'; ctx.fillRect(r.x, r.y, r.w, r.h);
      const head = 30;
      const k = Math.min(r.w / MAP.W, (r.h - head) / (MAP.H - 2)); // píxeles por celda
      const mx = r.x + (r.w - MAP.W * k) / 2, my = r.y + (r.h - head - (MAP.H - 2) * k) / 2 - k;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.aerialBase(), mx, my, MAP.W * k, MAP.H * k);
      const X = (x) => mx + x * k, Y = (y) => my + y * k;
      const draw = (spr, x, y, h, alpha = 1) => {
        const img = spr.lv[0], w = h * spr.w / spr.h;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, X(x) - w * k / 2, Y(y) - h * k, w * k, h * k);
        ctx.globalAlpha = 1;
      };
      // sombras de tonsilolitos, charcos de ácido
      (snap.zones || []).forEach((z) => { ctx.fillStyle = 'rgba(190,230,40,0.5)'; ctx.beginPath(); ctx.arc(X(z.x), Y(z.y), z.r * k, 0, 7); ctx.fill(); });
      (snap.stones || []).forEach((st) => {
        if (st.st !== 'warn') return;
        ctx.strokeStyle = Math.floor(now / 120) % 2 ? '#f22' : '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(st.x), Y(st.y), C.TONSIL.radius * k, 0, 7); ctx.stroke();
      });
      // objetos ordenados de arriba a abajo para que se tapen bien
      const items = [];
      MAP.teeth.forEach((t, i) => items.push({ y: t.y, f: () => {
        const st = snap.teeth[i];
        draw(R.toothSprite(this.A, t, st.s === 1), t.x, t.y + 0.4, t.h * 1.25);
        if (st.c > 0) draw(this.A.spr.crown, t.x, t.y + 0.4 - t.h * 1.2, 0.6);
        if (st.p > 0) {
          ctx.fillStyle = '#000'; ctx.fillRect(X(t.x) - k, Y(t.y) + 0.5 * k, 2 * k, 0.35 * k);
          ctx.fillStyle = TC[st.w]; ctx.fillRect(X(t.x) - k, Y(t.y) + 0.5 * k, 2 * k * st.p, 0.35 * k);
        }
      } }));
      MAP.props.forEach((p) => items.push({ y: p.y, f: () => draw(this.A.spr[p.kind], p.x, p.y + 0.2, 0.6) }));
      (snap.stones || []).forEach((st) => { if (st.st === 'rock') items.push({ y: st.y, f: () => draw(this.A.spr.stone, st.x, st.y + 0.2, 0.8) }); });
      (snap.pickups || []).forEach((q) => items.push({ y: q.y, f: () => draw(this.A.spr[q.type], q.x, q.y + 0.2, 0.8) }));
      snap.bombs.forEach((b) => { if (b.st !== 'held') items.push({ y: b.y, f: () => draw(this.A.spr[R.bombKey(b.type, b.kind)], b.x, b.y + 0.2 - (b.z || 0), 1.1) }); });
      if (snap.legend) items.push({ y: snap.legend.y, f: () => draw(this.A.spr.legend, snap.legend.x, snap.legend.y + 0.3, 1.3) });
      if (snap.race) items.push({ y: C.RACE.y, f: () => draw(R.raceSprite(this.A, snap.race), C.RACE.x, C.RACE.y + 0.5, C.RACE.h * 1.3) });
      (snap.fungi || []).forEach((f) => items.push({ y: f.y, f: () => draw(this.A.spr.fungus, f.x, f.y + 0.3, 1.6) }));
      snap.players.forEach((p) => {
        if (!p.alive) return;
        items.push({ y: p.y, f: () => {
          ctx.strokeStyle = TC[p.team]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(X(p.x), Y(p.y) + 0.3 * k, 0.55 * k, 0.28 * k, 0, 0, 7); ctx.stroke();
          if (p.sup > 0) { ctx.strokeStyle = ['#ffd84a', '#ff6ad5', '#6af0ff'][Math.floor(now / 80) % 3]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y - 0.5), 1.2 * k, 0, 7); ctx.stroke(); ctx.strokeStyle = TC[p.team]; ctx.lineWidth = 2; }
          if (p.shield > 0) { ctx.strokeStyle = '#7ef'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y - 0.5), 1.1 * k, 0, 7); ctx.stroke(); ctx.strokeStyle = TC[p.team]; ctx.lineWidth = 2; }
          ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y) + 0.3 * k); ctx.lineTo(X(p.x + Math.cos(p.a) * 1.1), Y(p.y + Math.sin(p.a) * 1.1) + 0.3 * k); ctx.stroke();
          const spr = R.playerSprite(this.A, p);
          ctx.globalAlpha = p.stun > 0 && Math.floor(now / 90) % 2 ? 0.5 : 1;
          ctx.drawImage(p.sticky > 0 && spr.green ? spr.green : p.flash ? spr.hit : spr.lv[0], X(p.x) - 0.8 * k * spr.w / spr.h, Y(p.y + 0.3 - p.z) - 1.6 * k, 1.6 * k * spr.w / spr.h, 1.6 * k);
          ctx.globalAlpha = 1;
          if (p.bomb) draw(this.A.spr[R.bombKey(p.bomb, p.bk)], p.x, p.y - 1.4 - p.z, 0.7);
          this.outlined(ctx, (p.sup > 0 ? '⭐' : '') + (p.lv > 0 ? `⬆${p.lv} ` : '') + p.name, X(p.x), Y(p.y - 1.5 - p.z), Math.max(7, k * 0.45), TC[p.team]);
        } });
      });
      items.sort((a, b) => a.y - b.y).forEach((it) => it.f());
      (snap.proj || []).forEach((q) => { ctx.fillStyle = q.t === 'smg' ? '#ffe066' : q.t === 'water' ? '#6cf' : q.t === 'slime' ? '#7d2' : '#df3'; ctx.fillRect(X(q.x) - 0.15 * k, Y(q.y) - 0.15 * k, 0.3 * k, 0.3 * k); });
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(r.x, r.y + r.h - head, r.w, head);
      this.outlined(ctx, '📡 CÁMARA AÉREA · EN VIVO', r.x + r.w / 2, r.y + r.h - head / 2, Math.min(13, r.w / 28), '#ffe066');
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4; ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      ctx.restore();
    }

    // Movimiento de cámara por jugador: pasos, inclinación al girar/moverse de lado, retroceso,
    // aterrizaje, mareo del gas y FOV más amplio con velocidad
    camState(me, dt, now) {
      const c = this.fx.cam[me.id] || (this.fx.cam[me.id] = { x: me.x, y: me.y, z: me.z, a: me.a, spd: 0, side: 0, turn: 0, phase: 0, roll: 0, land: 0, fov: 0, kick: 0, lastShot: 0 });
      const inv = dt > 0.0005 ? 1 / dt : 0;
      let vx = (me.x - c.x) * inv, vy = (me.y - c.y) * inv;
      if (Math.hypot(vx, vy) > 15) { vx = 0; vy = 0; } // reaparición: sin saltos de cámara
      const ca = Math.cos(me.a), sa = Math.sin(me.a);
      const side = -vx * sa + vy * ca, spd = Math.hypot(vx, vy);
      const turn = clamp(angDiff(c.a, me.a) * inv, -8, 8);
      const k = Math.min(1, dt * 10);
      c.spd += (spd - c.spd) * k; c.side += (side - c.side) * k; c.turn += (turn - c.turn) * Math.min(1, dt * 12);
      const walk = me.z <= 0 && me.alive ? clamp(c.spd / 3.3, 0, 1.6) : 0;
      c.phase += dt * (4 + c.spd * 2.2) * (walk > 0.05 ? 1 : 0);
      // aterrizaje tras un salto
      if (c.z > 0.08 && me.z <= 0) c.land = Math.min(1, c.z * 1.5 + 0.5);
      c.land = Math.max(0, c.land - dt * 3.5);
      // retroceso del disparo
      const rec = this.fx.recoil[me.id];
      if (rec && rec !== c.lastShot) { c.lastShot = rec; c.kick = Math.min(1.5, c.kick + 1); }
      c.kick = Math.max(0, c.kick - dt * 7);
      // inclinación: al girar, al moverse de lado, mareado por el gas, o caído al morir
      let roll = clamp(-c.turn * 0.02 - c.side * 0.012, -0.1, 0.1);
      if (me.dizzy > 0) roll += Math.sin(now / 380) * 0.14;
      if (me.stun > 0) roll += Math.sin(now / 520) * 0.06;
      if (!me.alive) roll = 0.38;
      c.roll += (roll - c.roll) * Math.min(1, dt * (me.alive ? 7 : 3));
      const fov = (me.sup > 0 ? 0.22 : me.boost > 0 ? 0.08 : 0) + clamp((c.spd - 3.3) * 0.04, 0, 0.12);
      c.fov += (fov - c.fov) * Math.min(1, dt * 5);
      c.x = me.x; c.y = me.y; c.z = me.z; c.a = me.a;
      const breathe = Math.sin(now / 900) * 0.006;
      c.wobX = Math.cos(c.phase) * walk; c.wobY = Math.sin(c.phase * 2) * walk;
      c.bobX = c.wobX * 0.035; c.bobY = c.wobY * 0.03 + breathe;
      c.eye = -c.land * 0.14;
      c.pitch = c.kick * 0.035 + c.land * 0.03 + (me.dizzy > 0 ? Math.sin(now / 450) * 0.04 : 0);
      c.yaw = me.dizzy > 0 ? Math.sin(now / 610) * 0.08 : 0;
      return c;
    }

    target(i, rect) {
      const RH = clamp(Math.round(rect.h / 3), 120, 210);
      const RW = Math.max(80, Math.round(RH * rect.w / rect.h));
      let t = this.targets[i];
      if (!t || t.W !== RW || t.H !== RH) t = this.targets[i] = R.makeTarget(RW, RH);
      return t;
    }

    // Dibuja todo. viewIds: ids de los jugadores a mostrar (en orden de cuadrante).
    draw(snap, viewIds, dt) {
      const cw = Math.floor(window.innerWidth), ch = Math.floor(window.innerHeight);
      if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
      const ctx = this.ctx, now = performance.now();
      if (this.mazeShown !== !!snap.maze) {
        this.mazeShown = !!snap.maze;
        MAP.setMazeOpen(this.mazeShown);
        this.minimap = buildMinimap();
        this._aerial = null;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#12040a';
      ctx.fillRect(0, 0, cw, ch);

      // movimiento (para balanceo de cámara) y partículas
      snap.players.forEach((p) => {
        const l = this.lastPos[p.id];
        this.fx.moving[p.id] = !!l && Math.hypot(p.x - l.x, p.y - l.y) > 0.004;
        this.lastPos[p.id] = { x: p.x, y: p.y };
      });
      this.fx.particles = this.fx.particles.filter((p) => {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 9 * dt;
        if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; }
        return p.life > 0;
      });

      const rects = this.layoutFor(viewIds, snap);
      viewIds.forEach((id, i) => {
        const me = snap.players.find((p) => p.id === id), rect = rects[i];
        if (!rect) return;
        if (!me) { this.drawAerial(ctx, rect, snap, now); return; }
        const T = this.target(i, rect);
        const cam = this.camState(me, dt, now);
        const tags = R.render(T, this.A, snap, me, this.fx, now);
        if (Math.abs(cam.roll) > 0.002) {
          // inclinar la vista y agrandarla lo justo para que no se vean las esquinas
          const t = Math.abs(cam.roll), sc = Math.cos(t) + Math.sin(t) * Math.max(rect.w / rect.h, rect.h / rect.w);
          ctx.save();
          ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
          ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
          ctx.rotate(cam.roll); ctx.scale(sc, sc);
          ctx.drawImage(T.canvas, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
          ctx.restore();
        } else ctx.drawImage(T.canvas, rect.x, rect.y, rect.w, rect.h);
        this.drawHud(ctx, rect, T, me, snap, tags, now);
      });
      this.bigLayout = viewIds[0] === 'aerial';
      this.updateOverlay(snap, viewIds.length, now);
    }

    outlined(ctx, text, x, y, size, color, align = 'center') {
      size *= 1.3;
      ctx.font = `bold ${Math.round(size)}px ${FONT}`;
      ctx.textAlign = align;
      ctx.lineWidth = Math.max(2, size / 4);
      ctx.strokeStyle = '#000';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    drawHud(ctx, r, T, me, snap, tags, now) {
      const s = clamp(Math.min(r.h / 540, r.w / 700), 0.45, 1.6);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, col = TC[me.team];
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.textBaseline = 'middle';

      // Nombres y timers sobre los sprites
      for (const t of tags) {
        const size = clamp(34 * s / Math.max(1.2, t.depth), 8, (t.big ? 20 : 14) * s);
        this.outlined(ctx, t.text, r.x + t.x * r.w / T.W, r.y + t.y * r.h / T.H - size, size, t.color);
      }

      // Mira
      if (me.alive) {
        const L = 11 * s, G = 5 * s, th = Math.max(2, 3 * s);
        ctx.fillStyle = '#000';
        [[-G - L, -th / 2 - 1, L + 2, th + 2], [G - 1, -th / 2 - 1, L + 2, th + 2], [-th / 2 - 1, -G - L, th + 2, L + 2], [-th / 2 - 1, G - 1, th + 2, L + 2]].forEach(([x, y, w, h]) => ctx.fillRect(cx + x, cy + y, w, h));
        ctx.fillStyle = me.slimed > 0 ? '#9f4' : col;
        [[-G - L, -th / 2, L, th], [G, -th / 2, L, th], [-th / 2, -G - L, th, L], [-th / 2, G, th, L]].forEach(([x, y, w, h]) => ctx.fillRect(cx + x, cy + y, w, h));
        ctx.fillRect(cx - th / 2, cy - th / 2, th, th);
      }

      const pad = 12 * s;
      if (!this.phone) {
      // Panel superior izquierdo: nombre + equipo
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(r.x + pad, r.y + pad, 250 * s, 52 * s);
      ctx.fillStyle = col; ctx.fillRect(r.x + pad, r.y + pad, 6 * s, 52 * s);
      this.outlined(ctx, me.name.toUpperCase(), r.x + pad + 16 * s, r.y + pad + 17 * s, 15 * s, '#fff', 'left');
      this.outlined(ctx, TEAM_NAME[me.team], r.x + pad + 16 * s, r.y + pad + 38 * s, 11 * s, col, 'left');
      if (me.conn === false) this.outlined(ctx, '📵 SIN CONEXIÓN', r.x + pad + 16 * s, r.y + pad + 70 * s, 11 * s, '#f66', 'left');
      const efx = [];
      if (me.prot > 0) efx.push(`✨ PROTEGIDO ${Math.ceil(me.prot)}s`);
      if (me.sup > 0) efx.push(`⭐ INVENCIBLE ${Math.ceil(me.sup)}s`);
      if (me.lv > 0) efx.push(`⬆️ NIVEL ${me.lv}`);
      if (me.dizzy > 0) efx.push(`😂 AL REVÉS ${Math.ceil(me.dizzy)}s`);
      if (me.slow > 0) efx.push(`🧵 ENREDADO ${Math.ceil(me.slow)}s`);
      if (me.boost > 0) efx.push(`⚡ ${me.team === 'doc' ? 'FLÚOR' : 'AZÚCAR'} ${Math.ceil(me.boost)}s`);
      if (me.crown) efx.push('👑 CORONA LISTA');
      if (me.contagion > 0) efx.push(`🧫 CONTAGIANDO ${Math.ceil(me.contagion)}s`);
      if (efx.length) this.outlined(ctx, efx.join('  '), r.x + pad + 6 * s, r.y + pad + (me.conn === false ? 92 : 70) * s, 10 * s, '#ffe066', 'left');

      // Barra inferior (estilo Doom)
      const bh = 58 * s, by = r.y + r.h - bh;
      ctx.fillStyle = 'rgba(10,0,4,0.72)';
      ctx.fillRect(r.x, by, r.w, bh);
      ctx.fillStyle = col; ctx.fillRect(r.x, by, r.w, 3 * s);
      // Vida
      const hpW = Math.min(200 * s, r.w * 0.28), hpX = r.x + pad, hpY = by + 30 * s;
      this.outlined(ctx, `♥ ${me.hp}`, hpX, by + 16 * s, 13 * s, me.hp < 35 ? '#f55' : '#fff', 'left');
      ctx.fillStyle = '#300'; ctx.fillRect(hpX, hpY, hpW, 14 * s);
      ctx.fillStyle = me.hp < 35 ? '#f33' : me.team === 'doc' ? '#4f8' : '#8f3';
      ctx.fillRect(hpX, hpY, hpW * clamp(me.hp / me.mhp, 0, 1), 14 * s);
      // Arma
      const W = C.WEAPONS[me.w];
      this.outlined(ctx, me.sup > 0 ? '⭐ DISPARO AUTOMÁTICO' : `${W.icon} ${W.label}`, cx, by + 18 * s, 12 * s, '#ffe066');
      if (me.cd > 0.05 && !(me.sup > 0)) {
        const max = me.w === 'slime' ? C.SLIME_COOLDOWN : W.cooldown;
        const bw = Math.min(180 * s, r.w * 0.26);
        ctx.fillStyle = '#222'; ctx.fillRect(cx - bw / 2, by + 32 * s, bw, 10 * s);
        ctx.fillStyle = '#fa3'; ctx.fillRect(cx - bw / 2, by + 32 * s, bw * (1 - me.cd / max), 10 * s);
        if (max > 2) this.outlined(ctx, `RECARGA ${Math.ceil(me.cd)}s`, cx, by + 50 * s, 9 * s, '#fa3');
      }
      // Estado
      let state = 'ACTIVO', stCol = '#8f8';
      if (!me.alive) { state = `ELIMINADO ${Math.ceil(me.dead)}s`; stCol = '#f55'; }
      else if (me.slimed > 0) { state = `INMOVILIZADO ${Math.ceil(me.slimed)}s`; stCol = '#9f4'; }
      else if (me.stun > 0) { state = me.stunK === 'anest' ? `💉 ANESTESIADO ${Math.ceil(me.stun)}s` : `💫 NOQUEADO ${Math.ceil(me.stun)}s`; stCol = me.stunK === 'anest' ? '#ff9ad8' : '#ffe066'; }
      else if (me.sup > 0) { state = `⭐ INVENCIBLE ${Math.ceil(me.sup)}s`; stCol = '#ffd84a'; }
      else if (me.shield > 0) { state = `🛡️ ESCUDO ${Math.ceil(me.shield)}s`; stCol = '#7ef'; }
      else if (me.run) { state = '🏃 CORRIENDO'; stCol = '#ffe066'; }
      else if (me.act > 0) { state = `${me.actKind === 'crown' ? 'CORONA' : me.team === 'doc' ? 'LIMPIANDO' : 'ENSUCIANDO'} ${Math.round(me.act * 100)}%`; stCol = col; }
      else if (me.sticky > 0) { state = `🟢 PEGAJOSO ${me.sticky}/${C.SLIME_HITS_TO_STICK}`; stCol = '#9f4'; }
      else if (me.z > 0) state = 'SALTANDO';
      this.outlined(ctx, state, r.x + r.w - pad, by + 18 * s, 12 * s, stCol, 'right');
      if (me.bomb) {
        const b = snap.bombs.find((q) => q.holder === me.id);
        const blink = Math.floor(now / 300) % 2 ? '#fff' : me.bomb === 'clean' ? TC.doc : TC.bac;
        this.outlined(ctx, `${me.bk && me.bk !== 'teeth' ? C.BOMB_KINDS[me.bk].icon : '💣'} ¡LÁNZALA! ${b ? Math.ceil(b.t) : ''}s`, r.x + r.w - pad, by + 40 * s, 11 * s, blink, 'right');
      }

      }

      // Mensajes centrales
      if (!me.alive) {
        this.outlined(ctx, 'ELIMINADO', cx, cy - 30 * s, 30 * s, '#f44');
        this.outlined(ctx, `REAPARECES EN ${Math.ceil(me.dead)}`, cx, cy + 14 * s, 14 * s, '#fff');
      } else if (me.slimed > 0) {
        this.outlined(ctx, '¡INMOVILIZADO!', cx, cy - 60 * s, 24 * s, '#9f4');
        this.outlined(ctx, String(Math.ceil(me.slimed)), cx, cy + 60 * s, 34 * s, '#fff');
      } else if (me.stun > 0) {
        const anest = me.stunK === 'anest';
        this.outlined(ctx, anest ? '💉 ¡ANESTESIADO!' : '💫 ¡NOQUEADO!', cx, cy - 50 * s, 24 * s, anest ? '#ff9ad8' : '#ffe066');
        this.outlined(ctx, anest ? 'Te durmió una bomba de anestesia' : 'Te cayó un tonsilolito', cx, cy + 44 * s, 11 * s, '#fff');
      } else if (me.dizzy > 0 && now % 2000 < 1400) {
        this.outlined(ctx, '😂 ¡CONTROLES AL REVÉS!', cx, cy - 60 * s, 16 * s, '#c8a0ff');
      } else if (me.act > 0) {
        const bw = 220 * s;
        ctx.fillStyle = '#000'; ctx.fillRect(cx - bw / 2 - 3, cy + 48 * s - 3, bw + 6, 18 * s + 6);
        ctx.fillStyle = col; ctx.fillRect(cx - bw / 2, cy + 48 * s, bw * me.act, 18 * s);
        this.outlined(ctx, me.actKind === 'crown' ? '👑 PONIENDO CORONA…' : me.team === 'doc' ? '🪥 LIMPIANDO…' : '🦠 ENSUCIANDO…', cx, cy + 34 * s, 12 * s, '#fff');
      } else if (me.canAct && !snap.race) {
        const pulse = 0.6 + Math.sin(now / 180) * 0.4;
        ctx.globalAlpha = pulse;
        this.outlined(ctx, me.actKind === 'crown' ? 'MANTÉN DISPARAR PARA PONER 👑 CORONA' : me.team === 'doc' ? 'MANTÉN DISPARAR PARA 🪥 LIMPIAR' : 'MANTÉN DISPARAR PARA 🦠 ENSUCIAR', cx, cy + 56 * s, 13 * s, me.actKind === 'crown' ? '#ffd84a' : col);
        ctx.globalAlpha = 1;
      }
      if (me.alive && me.prot > 0) this.outlined(ctx, `✨ PROTEGIDO ${Math.ceil(me.prot)}s`, cx, cy - 80 * s, 14 * s, Math.floor(now / 150) % 2 ? '#fff' : '#ffe066');
      else if (me.alive && me.run) this.outlined(ctx, '🏃 CORRIENDO', cx, cy - 80 * s, 11 * s, '#ffe066');

      // Minimapa
      const mh = Math.min(r.h * 0.3, r.w * 0.3), mw = mh * MAP.W / MAP.H;
      const mx = r.x + r.w - mw - pad, my = r.y + pad + (this.phone ? r.h * 0.13 : 0), k = mh / MAP.H;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.minimap, mx, my, mw, mh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(mx, my, mw, mh);
      MAP.teeth.forEach((t, i) => {
        ctx.fillStyle = snap.teeth[i].c > 0 ? '#ffd84a' : snap.teeth[i].s ? '#9c3' : '#fff';
        ctx.fillRect(mx + (t.x - 0.6) * k, my + (t.y - 0.6) * k, 1.2 * k, 1.2 * k);
      });
      (snap.stones || []).forEach((st) => {
        ctx.fillStyle = st.st === 'warn' ? (Math.floor(now / 120) % 2 ? '#f22' : '#fff') : '#e8d898';
        ctx.fillRect(mx + (st.x - 0.5) * k, my + (st.y - 0.5) * k, k, k);
      });
      (snap.pickups || []).forEach((q) => {
        ctx.fillStyle = q.type === 'super' ? ['#ffd84a', '#ff6ad5', '#6af0ff'][Math.floor(now / 150) % 3] : { sugar: '#8dff3a', strain: '#8dff3a', fluor: '#3ec5ff', crown: '#ffd84a' }[q.type];
        ctx.fillRect(mx + (q.x - 0.5) * k, my + (q.y - 0.5) * k, k, k);
      });
      if (snap.race) { ctx.fillStyle = Math.floor(now / 200) % 2 ? '#ffe066' : '#fff'; ctx.beginPath(); ctx.arc(mx + C.RACE.x * k, my + C.RACE.y * k, 1.8 * k, 0, 7); ctx.fill(); }
      if (snap.legend && Math.floor(now / 200) % 2) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(mx + snap.legend.x * k, my + snap.legend.y * k, 1.6 * k, 0, 7); ctx.fill(); }
      (snap.fungi || []).forEach((f) => {
        ctx.fillStyle = '#e07af0';
        ctx.beginPath(); ctx.arc(mx + f.x * k, my + f.y * k, 1.2 * k, 0, 7); ctx.fill();
      });
      snap.bombs.forEach((b) => {
        if (Math.floor(now / 250) % 2) return;
        ctx.fillStyle = R.BOMB_COLOR[b.kind] || (b.type === 'clean' ? TC.doc : b.type === 'dirty' ? TC.bac : '#ffd84a');
        ctx.beginPath(); ctx.arc(mx + b.x * k, my + b.y * k, 1.3 * k, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      });
      snap.players.forEach((p) => {
        if (!p.alive) return;
        const isMe = p.id === me.id, sz = (isMe ? 1.3 : 0.9) * k;
        ctx.fillStyle = isMe ? '#ff0' : TC[p.team];
        ctx.beginPath();
        ctx.moveTo(mx + p.x * k + Math.cos(p.a) * sz * 1.6, my + p.y * k + Math.sin(p.a) * sz * 1.6);
        ctx.lineTo(mx + p.x * k + Math.cos(p.a + 2.4) * sz, my + p.y * k + Math.sin(p.a + 2.4) * sz);
        ctx.lineTo(mx + p.x * k + Math.cos(p.a - 2.4) * sz, my + p.y * k + Math.sin(p.a - 2.4) * sz);
        ctx.fill();
      });

      // Borde del cuadrante
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      ctx.restore();
    }

    updateOverlay(snap, nViews, now) {
      this.overlay.dataset.views = this.bigLayout ? 'big' : nViews > 2 ? 'grid' : nViews;
      if (this.bigLayout) this.overlay.style.setProperty('--acx', this.aerialCx + 'px');
      this.setText('doc', this.el.doc, String(snap.score.clean));
      this.setText('bac', this.el.bac, String(snap.score.dirty));
      this.setText('time', this.el.time, fmtTime(snap.tl));
      this.el.time.classList.toggle('urgent', snap.st === 'playing' && snap.tl <= 10);

      // Bombas activas
      const names = {};
      snap.players.forEach((p) => { names[p.id] = p.name; });
      const html = snap.bombs.map((b) => {
        if (b.st === 'ground') return `<div class="bb b-neutral">${bombLabel(b.kind, 'neutral')} LIBRE <b>${Math.ceil(b.t)}</b> ¡AGÁRRALA!</div>`;
        if (b.st === 'held') return `<div class="bb b-${b.type}">${b.type === 'clean' ? '🦷' : '🦠'} ${bombLabel(b.kind, b.type)} · ${esc(names[b.holder] || '')} <b>${Math.ceil(b.t)}s</b></div>`;
        return `<div class="bb b-${b.type}">${bombLabel(b.kind, b.type)} ¡EN EL AIRE!</div>`;
      }).join('') + snap.players.filter((p) => p.sup > 0).map((p) => `<div class="bb b-neutral">⭐ INVENCIBLE · ${esc(p.name)} <b>${Math.ceil(p.sup)}s</b></div>`).join('') + snap.players.filter((p) => p.contagion > 0).map((p) => `<div class="bb b-dirty">🧫 CONTAGIO · ${esc(p.name)} <b>${Math.ceil(p.contagion)}s</b></div>`).join('');
      this.setText('bombs', this.el.bombs, html, true);

      // Carrera de desempate: barras de cada equipo hacia la muela
      this.el.race.classList.toggle('hidden', !snap.race);
      if (snap.race) {
        const H = C.RACE.hits, rc = snap.race;
        this.setText('race', this.el.race, `<div class="rc-title">⚖️ DESEMPATE · ¡ROMPE LA MUELA! (${H})</div>
          <div class="rc-row t-doc">🦷 <i><em style="width:${rc.doc / H * 100}%"></em></i><b>${rc.doc}</b></div>
          <div class="rc-row t-bac">🦠 <i><em style="width:${rc.bac / H * 100}%"></em></i><b>${rc.bac}</b></div>`, true);
      }

      // Cuenta atrás
      let count = '';
      if (snap.st === 'countdown') count = String(Math.max(1, Math.ceil(snap.cd)));
      else if (snap.race && snap.race.cd > 0) count = String(Math.max(1, Math.ceil(snap.race.cd)));
      else if (this.goUntil > now) count = 'GO!';
      this.el.count.classList.toggle('hidden', !count);
      this.setText('count', this.el.count, count);

      // Resultados: pantalla final con el equipo ganador
      const showRes = snap.st === 'results' && snap.res;
      this.el.results.classList.toggle('hidden', !showRes);
      if (showRes) {
        const r = snap.res, w = r.winner, lose = w === 'doc' ? 'bac' : 'doc';
        const key = JSON.stringify(r); // las instantáneas llegan como objetos nuevos: comparar por contenido
        if (this.cache.resObj !== key) {
          this.cache.resObj = key;
          this.el.results.className = 'ov-results win-' + w;
          const col = w === 'doc' ? ['#3ec5ff', '#fff', '#bef', '#ffe066'] : ['#8dff3a', '#fff', '#cf6', '#ffe066'];
          const conf = Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${col[i % col.length]};animation-duration:${2.2 + (i % 7) * 0.45}s;animation-delay:-${(i % 11) * 0.37}s"></i>`).join('');
          const img = (t, sk) => `assets/${t === 'doc' ? `doc_${sk}_armed` : `bac_${sk}`}.png`;
          const winners = (r.players || []).filter((p) => p.team === w);
          const heroes = (winners.length ? winners : [{ skin: 'alan' }, { skin: 'karina' }]).slice(0, 5).map((p) => `<img src="${img(w, p.skin || 'alan')}" alt="">`).join('');
          const rows = (r.players || []).slice(0, 8).map((p) => `<tr class="${p.id === r.mvp ? 'mvp' : ''}"><td class="t-${p.team}">${p.id === r.mvp ? '⭐ ' : ''}${esc(p.name)}</td><td>${p.kills}</td><td>${p.teeth}</td>${r.race ? `<td>${p.race}</td>` : ''}</tr>`).join('');
          const n = { doc: r.clean, bac: r.dirty };
          this.el.results.innerHTML = `<div class="confetti">${conf}</div><div class="final t-${w}">
            <div class="f-tag">${r.race ? '⚖️ DESEMPATE DE LA MUELA' : '⏱️ TIEMPO TERMINADO'}</div>
            <div class="f-trophy">🏆</div>
            <h1>${w === 'doc' ? '¡GANAN LOS<br>ODONTÓLOGOS!' : '¡GANAN LAS<br>BACTERIAS!'}</h1>
            <div class="f-heroes">${heroes}</div>
            <div class="f-bars">
              <div class="f-bar t-doc ${lose === 'doc' ? 'lose' : ''}">🦷 DIENTES LIMPIOS<b>${n.doc}</b></div>
              <div class="f-bar t-bac ${lose === 'bac' ? 'lose' : ''}">🦠 CONTAMINADOS<b>${n.bac}</b></div>
            </div>
            ${r.race ? `<div class="f-race">Empataron en dientes → la muela: 🦷 ${r.race.doc} vs ${r.race.bac} 🦠${r.race.timeout ? ' (se acabó el tiempo)' : ' · ¡ROTA!'}</div>` : ''}
            ${rows ? `<table class="f-table"><tr><th>JUGADOR</th><th>💀 BAJAS</th><th>🦷 DIENTES</th>${r.race ? '<th>🎯 MUELA</th>' : ''}</tr>${rows}</table>` : ''}
            ${this.onAgain ? '<button class="btn btn-big again">JUGAR OTRA VEZ</button>' : ''}
          </div>`;
          const btn = this.el.results.querySelector('.again');
          if (btn) btn.onclick = () => this.onAgain();
        }
      } else this.cache.resObj = null;
    }
  }

  MOC.GameView = GameView;
})();
