// Motor pseudo-3D tipo Doom (raycasting) que dibuja la cámara de un jugador.
(function () {
  const MAP = MOC.MAP, TEX = MOC.TEX, TS = TEX.TS, C = MOC.CONFIG;
  const WALL_H = 1.5, EYE = 0.62, PLAYER_H = 1.0;
  const TEAM_COLOR = { doc: '#3ec5ff', bac: '#8dff3a' };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const shadeOf = (d) => clamp(1.25 - d * 0.085, 0.13, 1);
  const floorTex = Array.from(MAP.floor, (f) => TEX.floors[f]);

  // Destino de render por vista (búferes reutilizables)
  function makeTarget(W, H) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(W, H);
    return { W, H, canvas, ctx, img, buf: new Uint32Array(img.data.buffer), zbuf: new Float32Array(W), top: new Int16Array(W), bot: new Int16Array(W) };
  }

  function toothSprite(A, t, dirty) {
    if (!dirty) return A.spr[t.kind === 'premolar' ? 'molar_clean' : t.kind + '_clean'];
    if (t.kind === 'incisor') return A.spr.incisor_dirty;
    const k = t.kind === 'premolar' ? 'molar' : t.kind;
    return A.spr[`${k}_dirty_${t.side}`];
  }

  // Sprite de una bomba: las de dientes se tiñen por equipo, las de efecto por tipo
  const bombKey = (type, kind) => 'bomb_' + (kind && kind !== 'teeth' ? kind : type);
  const BOMB_COLOR = { anest: '#ff7ad0', gas: '#b88aff', amalgam: '#dfe4ee', floss: '#ffffff' };

  function playerSprite(A, p) {
    if (p.team === 'bac') return A.spr['bac_' + p.skin];
    if (p.slimed > 0) return A.spr[`doc_${p.skin}_slimed`];
    return A.spr[`doc_${p.skin}_${p.w === 'none' ? 'idle' : 'armed'}`];
  }

  // Dibuja la vista de "me" en target. Devuelve etiquetas (nombres, timers) para el HUD en alta resolución.
  function render(T, A, snap, me, fx, now) {
    const { W, H, buf, zbuf, top: wTop, bot: wBot, ctx } = T;
    const tags = [];
    // Cámara viva (calculada en GameView): balanceo al caminar, inclinación, retroceso, aterrizaje y FOV
    const cam = (fx.cam && fx.cam[me.id]) || { bobX: 0, bobY: 0, pitch: 0, eye: 0, fov: 0, yaw: 0 };
    const hfov = clamp(2 * Math.atan(Math.tan(20 * Math.PI / 180) * W / H), 60 * Math.PI / 180, 92 * Math.PI / 180) + cam.fov;
    const proj = (W / 2) / Math.tan(hfov / 2);
    const shakeAmt = (fx.shakeUntil > now ? 0.04 : 0) + (me.flash ? 0.012 : 0);
    const shake = shakeAmt ? (Math.random() - 0.5) * H * shakeAmt : 0;
    const horizon = H / 2 + shake + cam.pitch * H;
    const eye = (me.alive ? EYE : 0.25) + me.z + cam.bobY + cam.eye;
    const ang = me.a + cam.yaw;
    const dirX = Math.cos(ang), dirY = Math.sin(ang), rX = -dirY, rY = dirX;
    const px = me.x + rX * cam.bobX, py = me.y + rY * cam.bobX;

    // ── Paredes ──
    for (let x = 0; x < W; x++) {
      const camX = (x - W / 2 + 0.5) / proj;
      const rdx = dirX + rX * camX, rdy = dirY + rY * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
      let sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      let side = 0, cell = 0;
      for (let i = 0; i < 96; i++) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        if (mx < 0 || my < 0 || mx >= MAP.W || my >= MAP.H) { cell = 1; break; }
        cell = MAP.grid[my * MAP.W + mx];
        if (cell) break;
      }
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      let wx = side === 0 ? py + perp * rdy : px + perp * rdx;
      wx -= Math.floor(wx);
      let tx = (wx * TS) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TS - 1 - tx;
      const top = horizon - (WALL_H - eye) * proj / perp, bottom = horizon + eye * proj / perp;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, Math.ceil(bottom));
      const s = (shadeOf(perp) * (side ? 0.78 : 1) * 256) | 0;
      const tex = TEX.walls[cell] || TEX.walls[1];
      const span = bottom - top;
      for (let y = y0; y < y1; y++) {
        let ty = (((y - top) / span) * TS) | 0;
        if (ty >= TS) ty = TS - 1;
        const c = tex[ty * TS + tx];
        buf[y * W + x] = 0xff000000 | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | ((c & 255) * s >> 8);
      }
      zbuf[x] = perp; wTop[x] = y0; wBot[x] = y1;
    }

    // ── Suelo y techo (paladar) ──
    const halfW = W / 2 / proj;
    for (let y = 0; y < H; y++) {
      const isFloor = y >= horizon;
      const dist = isFloor ? eye * proj / (y - horizon + 0.5) : (WALL_H - eye) * proj / (horizon - y + 0.5);
      const s = (shadeOf(dist) * (isFloor ? 1 : 0.85) * 256) | 0;
      let fx0 = px + dist * (dirX - rX * halfW), fy0 = py + dist * (dirY - rY * halfW);
      const sx = dist * rX / proj, sy = dist * rY / proj;
      const row = y * W;
      for (let x = 0; x < W; x++, fx0 += sx, fy0 += sy) {
        if (isFloor ? y < wBot[x] : y >= wTop[x]) continue;
        const cx = Math.floor(fx0), cy = Math.floor(fy0);
        let tex;
        if (isFloor) tex = (cx >= 0 && cy >= 0 && cx < MAP.W && cy < MAP.H) ? floorTex[cy * MAP.W + cx] : TEX.floors[0];
        else tex = TEX.ceiling;
        const c = tex[(((fy0 - cy) * TS) | 0) * TS + (((fx0 - cx) * TS) | 0)];
        buf[row + x] = 0xff000000 | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | ((c & 255) * s >> 8);
      }
    }
    ctx.putImageData(T.img, 0, 0);

    // ── Sprites ──
    const list = [];
    MAP.teeth.forEach((t, i) => {
      const st = snap.teeth[i];
      list.push({ x: t.x, y: t.y, z: 0, h: t.h, spr: toothSprite(A, t, st.s === 1), bar: st.p > 0 ? st : null, glow: fx.toothFlash && fx.toothFlash[i] > now ? fx.toothFlashColor[i] : null });
      if (st.c > 0) list.push({ x: t.x, y: t.y, z: t.h - 0.08, h: 0.36, spr: A.spr.crown, bright: true, flicker: st.c < 5, tag: { text: `👑 ${Math.ceil(st.c)}`, color: '#ffd84a' } });
    });
    (snap.fungi || []).forEach((f) => list.push({ x: f.x, y: f.y, z: Math.abs(Math.sin(now / 160)) * 0.12, h: 1.15, spr: A.spr.fungus, hit: f.flash, tag: { text: '🍄 HONGO', color: '#e07af0' } }));
    (snap.stones || []).forEach((st) => {
      if (st.st === 'warn') {
        list.push({ x: st.x, y: st.y, z: 0, h: 0.1, w: C.TONSIL.radius * 2, spr: A.spr.shadow, bright: true, alpha: 0.6 + Math.sin(now / 60) * 0.3 });
        list.push({ x: st.x, y: st.y, z: Math.max(0, st.t / C.TONSIL.warn) * 4, h: 0.6, spr: A.spr.stone });
      } else list.push({ x: st.x, y: st.y, z: 0, h: 0.6, spr: A.spr.stone, alpha: Math.min(1, st.t) });
    });
    if (snap.legend) {
      const L = snap.legend;
      list.push({ x: L.x, y: L.y, z: 0, h: 5, w: 0.5, spr: A.spr.beam, bright: true, alpha: 0.7 + Math.sin(now / 150) * 0.2 });
      list.push({ x: L.x, y: L.y, z: 0.2 + Math.abs(Math.sin(now / 250)) * 0.25, h: 0.7, spr: A.spr.legend, bright: true, tag: { text: '⭐ LEGENDARIO', color: '#ffd84a', big: true } });
    }
    const PICK_TAG = { sugar: ['🍬 AZÚCAR', '#8dff3a'], fluor: ['🧴 FLÚOR', '#3ec5ff'], crown: ['👑 CORONA', '#ffd84a'], strain: ['🧫 CEPA', '#8dff3a'], super: ['⭐ DIENTE DE ORO', '#ffd84a'] };
    (snap.pickups || []).forEach((k) => k.type === 'super' && list.push({ x: k.x, y: k.y, z: 0, h: 4, w: 0.4, spr: A.spr.beam, bright: true, alpha: 0.5 + Math.sin(now / 120) * 0.2 }));
    (snap.pickups || []).forEach((k) => list.push({ x: k.x, y: k.y, z: 0.15 + Math.abs(Math.sin(now / 300 + k.id)) * 0.2, h: 0.45, spr: A.spr[k.type], bright: true,
      flicker: k.t < 4, tag: { text: `${PICK_TAG[k.type][0]} ${Math.ceil(k.t)}`, color: PICK_TAG[k.type][1] } }));
    MAP.props.forEach((p) => list.push({ x: p.x, y: p.y, z: 0, h: p.h, spr: A.spr[p.kind] }));
    snap.zones.forEach((z) => list.push({ x: z.x, y: z.y, z: 0, h: 0.12, w: z.r * 2, spr: A.spr.puddle, alpha: Math.min(1, z.t) }));
    snap.players.forEach((p) => {
      if (p.id === me.id) return;
      let h = PLAYER_H, sq = 1, alpha = 1;
      if (!p.alive) {
        const e = ((p.team === 'bac' ? C.BACTERIA_RESPAWN_TIME : C.DOCTOR_RESPAWN_TIME) - p.dead) / 0.7;
        if (e >= 1) return;
        h *= 1 - e * 0.85; sq = 1 + e * 1.2; alpha = 1 - e;
      }
      const spr = playerSprite(A, p);
      const icons = (p.sup > 0 ? '⭐' : '') + (p.stun > 0 ? (p.stunK === 'anest' ? '💉' : '💫') : '') + (p.dizzy > 0 ? '😂' : '') + (p.slow > 0 ? '🧵' : '')
        + (p.contagion > 0 ? '🧫' : '') + (p.crown ? '👑' : '') + (p.boost > 0 ? '⚡' : '') + (p.lv > 0 ? '⬆' + p.lv : '');
      const star = p.sup > 0 && p.alive;
      list.push({ x: p.x, y: p.y, z: p.z, h, sq, alpha, spr, hit: p.flash && !star, green: p.sticky > 0 || p.slow > 0, flicker: p.immune || p.stun > 0,
        glow: star ? ['#ffd84a', '#ff6ad5', '#6af0ff', '#fff'][Math.floor(now / 70) % 4] : null,
        tag: p.alive ? { text: (icons ? icons + ' ' : '') + p.name, color: star ? '#ffd84a' : TEAM_COLOR[p.team], big: star } : null });
      if (p.bomb) list.push({ x: p.x, y: p.y, z: p.z + h + 0.05, h: 0.38, spr: A.spr[bombKey(p.bomb, p.bk)] });
      if (p.shield > 0 && p.alive) list.push({ x: p.x, y: p.y, z: p.z - 0.08, h: 1.25, spr: A.spr.bubble, bright: true, flicker: p.shield < 0.8 });
    });
    snap.proj.forEach((q) => {
      const h = q.t === 'slime' ? 0.3 : q.t === 'acid' ? 0.22 : 0.18;
      list.push({ x: q.x, y: q.y, z: q.z - h / 2, h, spr: A.spr[q.t], bright: true });
    });
    snap.bombs.forEach((b) => {
      if (b.st === 'held') return;
      const z = b.st === 'ground' ? 0.08 + Math.abs(Math.sin(now / 250)) * 0.18 : b.z;
      const K = C.BOMB_KINDS[b.kind] || C.BOMB_KINDS.teeth;
      list.push({ x: b.x, y: b.y, z, h: 0.7, spr: A.spr[bombKey(b.type, b.kind)], bright: true,
        tag: b.st === 'ground' ? { text: `${K.icon} ${K.label} ${Math.ceil(b.t)}`, color: BOMB_COLOR[b.kind] || (b.type === 'clean' ? TEAM_COLOR.doc : b.type === 'dirty' ? TEAM_COLOR.bac : '#ffd84a'), big: true } : null });
    });

    for (const s of list) {
      const dx = s.x - px, dy = s.y - py;
      s.depth = dx * dirX + dy * dirY;
      s.lat = dx * rX + dy * rY;
    }
    list.sort((a, b) => b.depth - a.depth);

    for (const s of list) {
      if (s.depth < 0.2) continue;
      const scale = proj / s.depth;
      const sxc = W / 2 + s.lat * scale;
      const hpx = s.h * scale;
      const wpx = (s.w || s.h * s.spr.w / s.spr.h * (s.sq || 1)) * scale;
      const bottom = horizon + (eye - s.z) * scale, top = bottom - hpx, left = sxc - wpx / 2;
      const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + wpx));
      if (x1 <= x0) continue;
      if (s.flicker && Math.floor(now / 90) % 2) ctx.globalAlpha = 0.45;
      else ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
      const lvl = s.bright ? 0 : s.depth < 3.5 ? 0 : s.depth < 7 ? 1 : s.depth < 10 ? 2 : 3;
      const img = s.hit ? s.spr.hit : s.green && s.spr.green ? s.spr.green : s.spr.lv[lvl];
      let run = -1;
      for (let x = x0; x <= x1; x++) {
        const vis = x < x1 && zbuf[x] > s.depth;
        if (vis && run < 0) run = x;
        else if (!vis && run >= 0) {
          const sx = (run - left) / wpx * img.width, sw = (x - run) / wpx * img.width;
          ctx.drawImage(img, sx, 0, Math.max(0.01, sw), img.height, run, top, x - run, hpx);
          run = -1;
        }
      }
      ctx.globalAlpha = 1;
      const cx = clamp(Math.round(sxc), 0, W - 1);
      const centerVisible = zbuf[cx] > s.depth;
      if (s.glow && centerVisible) {
        ctx.fillStyle = s.glow;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(left, top, wpx, hpx);
        ctx.globalAlpha = 1;
      }
      if (s.bar && centerVisible) {
        const bw = Math.max(8, wpx * 0.9), bh = Math.max(2, Math.round(hpx * 0.07)), by = top - bh - 2;
        ctx.fillStyle = '#000'; ctx.fillRect(sxc - bw / 2 - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = s.bar.w === 'doc' ? TEAM_COLOR.doc : TEAM_COLOR.bac;
        ctx.fillRect(sxc - bw / 2, by, bw * Math.min(1, s.bar.p), bh);
      }
      if (s.tag && centerVisible && s.depth < 16) tags.push({ x: sxc, y: top - 1, text: s.tag.text, color: s.tag.color, big: s.tag.big, depth: s.depth });
    }

    // ── Partículas ──
    for (const p of fx.particles) {
      const dx = p.x - px, dy = p.y - py;
      const depth = dx * dirX + dy * dirY;
      if (depth < 0.6) continue;
      const scale = proj / depth, sx = W / 2 + (dx * rX + dy * rY) * scale;
      const xi = Math.round(sx);
      if (xi < 0 || xi >= W || zbuf[xi] < depth) continue;
      const sz = Math.min(H * 0.03, Math.max(1, p.size * scale));
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - sz / 2, horizon + (eye - p.z) * scale - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // ── Arma en primera persona ──
    if (me.alive) {
      const vm = TEX.viewModels[me.sup > 0 ? (me.team === 'doc' ? 'water' : 'acid') : me.w];
      if (vm) {
        const k = Math.min(H / 180, W / 190) * 1.5;
        const rec = fx.recoil && fx.recoil[me.id] ? Math.max(0, 1 - (now - fx.recoil[me.id]) / 160) : 0;
        const vw = vm.width * k, vh = vm.height * k;
        const lower = me.slimed > 0 ? vh * 0.35 : 0;
        // el arma se balancea con los pasos y se queda atrás al girar
        const swayX = (cam.wobX || 0) * 5 * k - (cam.turn || 0) * 7 * k, swayY = Math.abs(cam.wobY || 0) * 4 * k + (cam.land || 0) * 6 * k;
        ctx.drawImage(vm, W / 2 - vw / 2 + swayX + W * 0.12, H - vh + swayY + rec * 6 * k + lower, vw, vh);
        if (rec > 0.5 && (me.w === 'water' || me.w === 'acid' || me.w === 'slime')) {
          ctx.fillStyle = me.w === 'water' ? '#bff' : '#df8';
          ctx.fillRect(W / 2 + W * 0.12 - 3 * k, H - vh - 4 * k + lower, 6 * k, 6 * k);
        }
      }
    }

    // ── Efectos de pantalla ──
    if (me.slimed > 0) {
      ctx.fillStyle = 'rgba(110,220,40,0.28)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(120,230,50,0.85)';
      for (let i = 0; i < 14; i++) {
        const dx = (i * 53) % W, len = (H * 0.12) + ((i * 37) % 30) + Math.sin(now / 400 + i) * 6;
        ctx.fillRect(dx, 0, 6 + (i % 3) * 3, len);
        ctx.fillRect(dx - 2, len - 3, 10 + (i % 3) * 3, 6);
      }
    }
    if (me.shield > 0) { // borde celeste: escudo activo
      ctx.strokeStyle = 'rgba(120,230,255,0.75)'; ctx.lineWidth = Math.max(3, H * 0.025);
      ctx.strokeRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(90,200,255,0.08)'; ctx.fillRect(0, 0, W, H);
    }
    if (me.stun > 0) {
      ctx.fillStyle = 'rgba(255,230,120,0.18)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 5; i++) {
        const a = now / 300 + i * 1.256, sx = W / 2 + Math.cos(a) * W * 0.12, sy = H * 0.3 + Math.sin(a) * H * 0.05;
        ctx.fillRect(sx - 2, sy - 2, 4, 4); ctx.fillRect(sx - 5, sy, 10, 1); ctx.fillRect(sx, sy - 5, 1, 10);
      }
    }
    if (me.sticky > 0 && !(me.slimed > 0)) {
      ctx.fillStyle = 'rgba(120,230,50,0.6)';
      for (let i = 0; i < 8; i++) ctx.fillRect((i * 47) % W, 0, 5, H * 0.05 + (i % 3) * 4);
    }
    if (me.sup > 0) { // estrella: borde arcoíris dorado
      ctx.strokeStyle = ['#ffd84a', '#ff6ad5', '#6af0ff', '#fff'][Math.floor(now / 80) % 4]; ctx.lineWidth = Math.max(3, H * 0.03);
      ctx.strokeRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,216,74,0.1)'; ctx.fillRect(0, 0, W, H);
    }
    if (me.dizzy > 0) { // gas de la risa: neblina morada
      ctx.fillStyle = `rgba(170,110,255,${(0.16 + Math.sin(now / 200) * 0.06).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(220,190,255,0.5)';
      for (let i = 0; i < 7; i++) { const a = now / 700 + i * 0.9; ctx.fillRect(W / 2 + Math.cos(a) * W * 0.38, H / 2 + Math.sin(a * 1.3) * H * 0.35, 5, 5); }
    }
    if (me.slow > 0) { // hilo dental enredado
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { ctx.moveTo(0, H * (0.1 + i * 0.16)); ctx.lineTo(W, H * (0.25 + ((i * 37) % 60) / 100)); }
      ctx.stroke();
    }
    if (me.stun > 0 && me.stunK === 'anest') { ctx.fillStyle = 'rgba(255,120,200,0.2)'; ctx.fillRect(0, 0, W, H); }
    if (me.flash && !(me.sup > 0)) { ctx.fillStyle = 'rgba(255,0,0,0.28)'; ctx.fillRect(0, 0, W, H); }
    if (!me.alive) { ctx.fillStyle = 'rgba(90,0,0,0.5)'; ctx.fillRect(0, 0, W, H); }
    if (fx.flashUntil > now) {
      ctx.fillStyle = fx.flashColor;
      ctx.globalAlpha = (fx.flashUntil - now) / 900;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    return tags;
  }

  MOC.Render3D = { makeTarget, render, TEAM_COLOR, toothSprite, playerSprite, bombKey, BOMB_COLOR };
})();
