// Texturas pixel-art generadas por código (paredes, suelo, techo) y sprites pequeños
// (proyectiles, restos de comida, charcos, armas en primera persona).
(function () {
  const TS = 32; // tamaño de textura
  const rnd = MOC.MAP.mulberry32(777);
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const pack = (r, g, b) => ((255 << 24) | (clamp8(b) << 16) | (clamp8(g) << 8) | clamp8(r)) >>> 0;

  function makeTex(fn) {
    const t = new Uint32Array(TS * TS);
    const buf = new Float32Array(TS * TS * 3);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const c = fn(x, y);
      buf.set(c, (y * TS + x) * 3);
    }
    for (let i = 0; i < TS * TS; i++) t[i] = pack(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]);
    return t;
  }
  // Pinta "bultos" con luz arriba-izquierda y sombra abajo-derecha: da relieve
  function bumps(count, rMin, rMax, seed) {
    const r = MOC.MAP.mulberry32(seed), list = [];
    for (let i = 0; i < count; i++) list.push({ x: r() * TS, y: r() * TS, r: rMin + r() * (rMax - rMin) });
    return (x, y) => {
      let v = 0;
      for (const b of list) {
        for (const ox of [-TS, 0, TS]) for (const oy of [-TS, 0, TS]) {
          const dx = x + 0.5 - (b.x + ox), dy = y + 0.5 - (b.y + oy), d = Math.hypot(dx, dy);
          if (d < b.r) { const lit = -(dx + dy) / (b.r * 1.4); v += (1 - d / b.r) * 0.35 + lit * 0.5 * (1 - d / b.r); }
          else if (d < b.r + 1.2 && dx > 0 && dy > 0) v -= 0.35; // sombra proyectada
        }
      }
      return v;
    };
  }
  const noise = (a) => (rnd() - 0.5) * a;
  const mix = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  const gumBumps = bumps(9, 3, 6, 11);
  const gum = (x, y) => {
    const band = Math.sin((y + Math.sin(x * 0.4) * 2) * 0.55) * 0.12;
    const vein = Math.abs(Math.sin(x * 0.35 + y * 0.18) * 7 + Math.sin(y * 0.5) * 3 - 2) < 0.7 ? -0.28 : 0;
    const k = 0.9 + band + vein + gumBumps(x, y) * 0.5 + noise(0.08);
    const dark = y > TS - 4 ? 0.7 : 1;
    return mix([196, 72, 96], k * dark);
  };
  const tongueB = bumps(26, 1.2, 2.2, 23);
  const tongue = (x, y) => {
    const k = 0.92 + tongueB(x, y) * 0.8 + noise(0.07) + (y < 3 ? 0.12 : 0);
    const groove = Math.abs(x - 16) < 1 ? -0.25 : 0;
    return mix([222, 102, 124], k + groove);
  };
  const root = (x, y) => {
    const fib = Math.sin(x * 1.3 + Math.sin(y * 0.3) * 1.5) * 0.12;
    const knot = Math.hypot(x - 10, y - 20) < 3 ? -0.25 : Math.hypot(x - 23, y - 8) < 2 ? -0.2 : 0;
    const edge = x < 2 || x > TS - 3 ? -0.25 : 0;
    return mix([214, 186, 128], 0.9 + fib + knot + edge + noise(0.08));
  };
  const cariesSpots = [[8, 10, 4], [22, 18, 5], [14, 26, 3]];
  const gumCaries = (x, y) => {
    for (const [cx, cy, r] of cariesSpots) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r * 0.55) return mix([38, 20, 14], 1 + noise(0.2));
      if (d < r) return mix([210, 188, 84], 0.85 + (cx - x + cy - y) / (r * 6) + noise(0.1));
    }
    return gum(x, y);
  };
  const throat = (x, y) => {
    const k = 0.95 - y / TS * 0.6 + Math.sin(x * 0.7 + y * 0.2) * 0.07 + noise(0.06);
    return mix([120, 20, 40], k);
  };
  const fleshB = bumps(14, 1.5, 3.5, 41);
  const flesh = (x, y) => mix([132, 40, 56], 0.9 + fleshB(x, y) * 0.45 + noise(0.1));
  const gumFloor = (x, y) => mix([206, 98, 116], 0.92 + fleshB(x, y) * 0.3 + noise(0.08));
  const saliva = (x, y) => {
    const hl = Math.abs(Math.sin(x * 0.3 + y * 0.25) * 6 - 3) < 0.5 ? 0.35 : 0;
    const bubble = [[7, 7, 2], [22, 12, 1.5], [15, 25, 2.5], [27, 27, 1]].some(([bx, by, r]) => Math.abs(Math.hypot(x - bx, y - by) - r) < 0.6) ? 0.45 : 0;
    return mix([118, 160, 190], 0.85 + hl + bubble + noise(0.05));
  };
  const plaqueB = bumps(10, 1.5, 3, 57);
  const plaque = (x, y) => mix([196, 172, 86], 0.85 + plaqueB(x, y) * 0.5 + noise(0.15));
  const cavity = (x, y) => {
    const d = Math.hypot(x - 16, y - 16);
    const k = d < 10 ? 0.25 + d / 40 : 0.55 + noise(0.1);
    return d < 10 ? mix([60, 34, 24], k + noise(0.08)) : mix([110, 60, 40], k);
  };
  const palate = (x, y) => {
    const ridge = Math.sin((y + Math.sin(x * 0.3) * 2.5) * 0.8);
    const k = 0.8 + (ridge > 0.6 ? 0.25 : ridge < -0.7 ? -0.25 : 0) + (x === 16 ? -0.2 : 0) + noise(0.06);
    return mix([176, 62, 84], k);
  };

  const WALL = MOC.MAP.WALL, FLOOR = MOC.MAP.FLOOR;
  const walls = [];
  walls[WALL.GUM] = makeTex(gum);
  walls[WALL.TONGUE] = makeTex(tongue);
  walls[WALL.ROOT] = makeTex(root);
  walls[WALL.GUM_CARIES] = makeTex(gumCaries);
  walls[WALL.THROAT] = makeTex(throat);
  const floors = [];
  floors[FLOOR.FLESH] = makeTex(flesh);
  floors[FLOOR.GUM] = makeTex(gumFloor);
  floors[FLOOR.SALIVA] = makeTex(saliva);
  floors[FLOOR.PLAQUE] = makeTex(plaque);
  floors[FLOOR.CAVITY] = makeTex(cavity);
  const ceiling = makeTex(palate);

  // ── Sprites pequeños dibujados con píxeles ──
  function pixCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
    return c;
  }
  const blob = (w, h, cols) => pixCanvas(w, h, (g, px) => {
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2));
      if (d > 1) continue;
      const lit = (x < cx - 1 && y < cy - 1) ? 0 : d > 0.75 ? 2 : 1;
      px(x, y, cols[lit]);
    }
  });
  const sprites = {
    water: blob(8, 10, ['#e8fbff', '#58c8ff', '#1c7fd6']),
    slime: blob(12, 10, ['#e2ff9a', '#7dde2a', '#3f8f10']),
    acid: blob(9, 9, ['#fffbb0', '#d8f03a', '#7a9a10']),
    smg: blob(6, 6, ['#ffffff', '#ffe066', '#e08a10']),
    popcorn: pixCanvas(16, 14, (g, px) => {
      [[5, 6, 4], [10, 5, 4], [8, 9, 5], [4, 10, 3], [12, 10, 3]].forEach(([cx, cy, r]) => {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, x + y < -1 ? '#fffbe8' : x + y > 2 ? '#d8c088' : '#f4e6b8');
      });
      px(7, 7, '#c89040', 2, 1); px(10, 11, '#c89040', 1, 1);
    }),
    chip: pixCanvas(16, 10, (g, px) => {
      for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot((x - 8) / 8, (y - 5) / 5);
        if (d < 1) px(x, y, d > 0.8 ? '#a8641e' : (x * 3 + y * 5) % 7 === 0 ? '#c07828' : '#eeb440');
      }
    }),
    broccoli: pixCanvas(14, 16, (g, px) => {
      px(6, 9, '#8fbf50', 3, 7); px(6, 9, '#6f9f30', 1, 7);
      [[4, 5, 3], [9, 5, 3], [7, 3, 3], [7, 7, 3]].forEach(([cx, cy, r]) => {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, x + y < -1 ? '#6fd04a' : (x + y) % 2 ? '#2f7a20' : '#3f9a2a');
      });
    }),
    puddle: pixCanvas(24, 6, (g, px) => {
      for (let y = 0; y < 6; y++) for (let x = 0; x < 24; x++) {
        const d = Math.hypot((x - 12) / 12, (y - 3) / 3);
        if (d < 1) px(x, y, d > 0.8 ? '#6a8a10' : (x + y * 3) % 5 === 0 ? '#faffa0' : '#b8e030');
      }
    }),
  };

  // ── Peligros y objetos del mapa ──
  const circ = (px, cx, cy, r, col) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, typeof col === 'function' ? col(x, y) : col); };
  Object.assign(sprites, {
    // Hongo Cándida: sombrero morado con manchas y cara enojada
    fungus: pixCanvas(28, 30, (g, px) => {
      px(10, 15, '#e8dcc0', 8, 13); px(10, 15, '#fff6de', 2, 13); px(16, 15, '#b8a888', 2, 13); // tallo
      px(9, 27, '#b8a888', 10, 3);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 28; x++) {
        const d = Math.hypot((x - 14) / 14, (y - 15) / 15);
        if (d < 1 && y < 16) px(x, y, y > 12 ? '#5a1a6a' : x + y < 16 ? '#d070e0' : '#9a30b0');
      }
      [[6, 6, 2], [18, 4, 2], [12, 9, 1], [22, 10, 1]].forEach(([x, y, r]) => circ(px, x, y, r, '#ffe070'));
      px(11, 18, '#000', 2, 3); px(15, 18, '#000', 2, 3); px(10, 17, '#000', 3, 1); px(15, 17, '#000', 3, 1); // cejas enojadas
      px(11, 23, '#600', 6, 2); px(12, 23, '#fff', 1, 1); px(15, 23, '#fff', 1, 1);
    }),
    // Objeto legendario: copa dorada brillante
    legend: pixCanvas(18, 22, (g, px) => {
      for (let y = 0; y < 11; y++) for (let x = 0; x < 18; x++) {
        const d = Math.hypot((x + 0.5 - 9) / 8, (y + 0.5 - 2) / 9);
        if (d < 1) px(x, y, x < 7 && y < 6 ? '#fff6b0' : d > 0.85 ? '#a8740a' : '#ffcc22');
      }
      px(7, 10, '#e8a810', 4, 6); px(8, 10, '#fff0a0', 1, 6); px(4, 16, '#ffcc22', 10, 3); px(3, 19, '#a8740a', 12, 3); px(4, 19, '#ffd84a', 10, 1);
      px(0, 2, '#fff', 1, 1); px(16, 5, '#fff', 2, 2); px(1, 12, '#fff', 1, 1); px(15, 14, '#fff', 1, 1);
    }),
    beam: pixCanvas(8, 64, (g, px) => {
      for (let y = 0; y < 64; y++) px(1, y, `rgba(255,230,120,${(0.05 + 0.5 * y / 64).toFixed(2)})`, 6, 1);
    }),
    // Burbuja del escudo (semitransparente)
    bubble: pixCanvas(24, 30, (g, px) => {
      for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) {
        const d = Math.hypot((x + 0.5 - 12) / 12, (y + 0.5 - 15) / 15);
        if (d > 1) continue;
        px(x, y, d > 0.86 ? 'rgba(150,240,255,0.9)' : x < 9 && y < 10 && d > 0.55 ? 'rgba(255,255,255,0.55)' : 'rgba(90,200,255,0.22)');
      }
    }),
    // Tonsilolito: piedra amarillenta grumosa
    stone: pixCanvas(18, 14, (g, px) => {
      [[6, 8, 5], [11, 7, 5], [9, 5, 4], [13, 10, 3]].forEach(([cx, cy, r]) => circ(px, cx, cy, r, (x, y) => (x + y < -2 ? '#fff4c8' : x + y > 3 ? '#a08a48' : (x * 7 + y * 3) % 5 === 0 ? '#c8b060' : '#e8d898')));
    }),
    // Sombra de aviso en el suelo
    shadow: pixCanvas(32, 8, (g, px) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) {
        const d = Math.hypot((x - 16) / 16, (y - 4) / 4);
        if (d < 1) px(x, y, d > 0.8 ? '#ff2a2a' : 'rgba(0,0,0,0.55)');
      }
    }),
    sugar: pixCanvas(14, 14, (g, px) => { // cubo de azúcar
      px(1, 4, '#e8e8f0', 9, 9); px(4, 1, '#ffffff', 9, 3); px(10, 4, '#c0c0cc', 3, 9);
      px(3, 6, '#fff', 1, 1); px(6, 9, '#fff', 1, 1); px(8, 6, '#fff', 1, 1); px(12, 0, '#ffe', 2, 2);
    }),
    fluor: pixCanvas(12, 18, (g, px) => { // botella de flúor
      px(4, 0, '#fff', 4, 3); px(3, 3, '#aee8ff', 6, 2);
      px(1, 5, '#2a9ae0', 10, 13); px(2, 5, '#6cd0ff', 2, 13); px(3, 9, '#fff', 6, 4); px(4, 10, '#2a9ae0', 4, 1); px(5, 11, '#2a9ae0', 2, 1);
    }),
    crown: pixCanvas(18, 12, (g, px) => { // corona dental dorada
      px(1, 6, '#e8b020', 16, 6); px(1, 6, '#fff08a', 16, 1); px(1, 11, '#9a6a10', 16, 1);
      [[1, 1], [8, 0], [15, 1]].forEach(([x, y]) => { px(x, y + 2, '#e8b020', 2, 4); px(x, y, '#ffe060', 2, 2); });
      px(5, 3, '#e8b020', 2, 3); px(11, 3, '#e8b020', 2, 3);
      px(4, 8, '#e03a5a', 2, 2); px(8, 8, '#3ac8ff', 2, 2); px(12, 8, '#7ae040', 2, 2);
    }),
    super: pixCanvas(18, 20, (g, px) => { // estrella: diente de oro brillante
      for (let y = 0; y < 12; y++) for (let x = 2; x < 16; x++) {
        const d = Math.hypot((x + 0.5 - 9) / 7, (y + 0.5 - 7) / 6.5);
        if (d < 1) px(x, y, x < 7 && y < 6 ? '#fff8c0' : d > 0.82 ? '#b07a08' : '#ffcc22');
      }
      px(4, 11, '#ffcc22', 4, 7); px(10, 11, '#ffcc22', 4, 7); px(4, 11, '#fff0a0', 1, 6); px(13, 11, '#b07a08', 1, 7);
      px(4, 18, '#b07a08', 4, 2); px(10, 18, '#b07a08', 4, 2); px(8, 3, '#b07a08', 2, 2);
      px(0, 1, '#fff', 1, 3); px(-1, 2, '#fff', 3, 1); px(16, 12, '#fff', 1, 3); px(15, 13, '#fff', 3, 1); px(15, 0, '#fff', 2, 2);
    }),
    strain: pixCanvas(18, 12, (g, px) => { // placa de Petri con cepa de caries
      for (let y = 0; y < 12; y++) for (let x = 0; x < 18; x++) {
        const d = Math.hypot((x - 9) / 9, (y - 6) / 6);
        if (d < 1) px(x, y, d > 0.82 ? '#d8f0ff' : '#b0d060');
      }
      [[5, 5], [10, 4], [12, 7], [7, 8], [9, 6]].forEach(([x, y]) => px(x, y, '#4a7a10', 2, 2));
      px(3, 3, '#fff', 2, 1);
    }),
  });

  // ── Armas en primera persona (estilo Doom) ──
  const viewModels = {
    none: pixCanvas(60, 44, (g, px) => { // mano con cepillo de dientes
      px(30, 2, '#f4f4f4', 6, 8); px(30, 2, '#9adfff', 6, 2); px(31, 4, '#ffffff', 1, 6); px(33, 4, '#ffffff', 1, 6);
      px(31, 10, '#3ea0ff', 4, 26); px(32, 10, '#7cc8ff', 1, 26);
      px(24, 24, '#e0a878', 16, 20); px(24, 24, '#c68858', 16, 3); px(22, 30, '#d69868', 4, 14); px(38, 28, '#d69868', 4, 16);
    }),
    water: pixCanvas(70, 46, (g, px) => { // pistola de agua tipo tubo de pasta
      px(28, 0, '#dfe8ef', 14, 30); px(28, 0, '#ffffff', 3, 30); px(39, 0, '#9aa8b4', 3, 30);
      px(28, 12, '#e03838', 14, 3); px(28, 16, '#2f7fe0', 14, 3);
      px(31, -1, '#b8c4cc', 8, 3); px(33, 30, '#445', 4, 6);
      px(22, 28, '#d69868', 26, 18); px(22, 28, '#e8b080', 26, 3); px(20, 34, '#c68858', 4, 12); px(46, 32, '#c68858', 4, 14);
    }),
    drill: pixCanvas(64, 50, (g, px) => { // pieza de mano dental
      px(31, 0, '#c8c8c8', 2, 8); px(30, 6, '#f0d060', 4, 3);
      px(28, 9, '#9aa4ae', 8, 12); px(28, 9, '#dfe6ec', 2, 12);
      px(26, 21, '#6a7680', 12, 18); px(27, 21, '#aab4be', 2, 18); px(26, 26, '#303840', 12, 2);
      px(20, 34, '#d69868', 24, 16); px(20, 34, '#e8b080', 24, 3); px(18, 40, '#c68858', 4, 10); px(42, 38, '#c68858', 4, 12);
    }),
    slime: pixCanvas(64, 46, (g, px) => { // tentáculo con bola de viscosidad
      for (let y = 0; y < 46; y++) for (let x = 0; x < 64; x++) {
        const d = Math.hypot((x - 32) / 13, (y - 14) / 11);
        const arm = Math.abs(x - 32 - Math.sin(y * 0.2) * 3) < 8 - (46 - y) * 0.05 && y > 20;
        if (d < 1) px(x, y, x < 28 && y < 10 ? '#e2ff9a' : d > 0.8 ? '#3f8f10' : '#7dde2a');
        else if (arm) px(x, y, (x + y) % 6 === 0 ? '#5a3a8a' : '#8a60c8');
      }
    }),
    smg: pixCanvas(64, 50, (g, px) => { // metralleta de juguete (jeringa múltiple)
      px(29, 0, '#2a2a30', 6, 6); px(30, 0, '#6a6a78', 2, 6);
      px(25, 6, '#3a3a44', 14, 22); px(26, 6, '#8a8a9a', 3, 22); px(36, 6, '#1a1a20', 3, 22);
      px(25, 12, '#ffe066', 14, 2); px(25, 20, '#ffe066', 14, 2);
      px(38, 18, '#2a2a30', 8, 5); px(22, 26, '#2a2a30', 20, 6);
      px(20, 32, '#d69868', 24, 18); px(20, 32, '#e8b080', 24, 3); px(18, 38, '#c68858', 4, 12); px(42, 36, '#c68858', 4, 14);
    }),
    acid: pixCanvas(60, 50, (g, px) => { // frasco de ácido
      px(27, 0, '#8a6a4a', 6, 4); px(28, 4, '#cfe', 4, 8);
      for (let y = 12; y < 32; y++) for (let x = 18; x < 42; x++) {
        const d = Math.hypot((x - 30) / 12, (y - 22) / 10);
        if (d < 1) px(x, y, y < 16 ? '#dff' : d > 0.85 ? '#6a8a10' : x < 26 && y < 22 ? '#faffa0' : '#c0e830');
      }
      for (let y = 30; y < 50; y++) for (let x = 20; x < 44; x++) if (Math.abs(x - 32 - Math.sin(y * 0.3) * 2) < 9) px(x, y, (x * y) % 7 === 0 ? '#5a3a8a' : '#8a60c8');
    }),
  };

  MOC.TEX = { TS, walls, floors, ceiling, sprites, viewModels };
})();
