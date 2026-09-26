// Mapa de la boca: cuadrícula de paredes, suelo, 16 dientes en arcada, restos de comida y spawns.
// Vista cenital: arriba = labios / incisivos, abajo = garganta.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MOC = root.MOC || {}).MAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Celdas de pared
  const WALL = { NONE: 0, GUM: 1, TONGUE: 2, ROOT: 3, GUM_CARIES: 4, THROAT: 5 };
  // Tipos de suelo
  const FLOOR = { FLESH: 0, GUM: 1, SALIVA: 2, PLAQUE: 3, CAVITY: 4 };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const W = 44, H = 40;
  const grid = new Uint8Array(W * H);
  const floor = new Uint8Array(W * H);
  const rnd = mulberry32(20240925);

  // ── Cavidad bucal (óvalo) y lengua ──
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const e = ((cx - 22) / 20.5) ** 2 + ((cy - 20) / 18.5) ** 2;
      let c = WALL.NONE;
      if (e >= 1) c = cy > 32 ? WALL.THROAT : (rnd() < 0.2 ? WALL.GUM_CARIES : WALL.GUM);
      else if (((cx - 22) / 5.5) ** 2 + ((cy - 25.5) / 7) ** 2 < 1) c = WALL.TONGUE;
      grid[y * W + x] = c;
    }
  }
  // Raíces expuestas (pilares / cobertura)
  [[13, 24], [30, 24], [12, 5], [31, 5]].forEach(([x, y]) => { grid[y * W + x] = WALL.ROOT; });

  // ── 16 dientes en arcada dental (forma de herradura) ──
  const KINDS = ['molar', 'molar', 'molar', 'premolar', 'premolar', 'canine', 'incisor', 'incisor',
                 'incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'molar'];
  const SIZE = {
    molar:    { r: 0.62, h: 1.15 },
    premolar: { r: 0.52, h: 0.95 },
    canine:   { r: 0.48, h: 1.45 },
    incisor:  { r: 0.52, h: 1.05 },
  };
  const ACX = 22, ACY = 21, ARX = 13, ARY = 13.5;
  const T0 = -32 * Math.PI / 180, T1 = 212 * Math.PI / 180;
  const arcPt = (t) => ({ x: ACX + ARX * Math.cos(t), y: ACY - ARY * Math.sin(t) });
  const samples = [];
  let len = 0, prev = arcPt(T0);
  for (let i = 0; i <= 2000; i++) {
    const t = T0 + (T1 - T0) * i / 2000, p = arcPt(t);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    samples.push({ t, len }); prev = p;
  }
  const teeth = [];
  for (let i = 0; i < 16; i++) {
    const target = len * i / 15;
    const s = samples.find((q) => q.len >= target) || samples[samples.length - 1];
    const p = arcPt(s.t), kind = KINDS[i];
    teeth.push({ id: i, x: p.x, y: p.y, kind, side: p.x >= 22 ? 'r' : 'l', r: SIZE[kind].r, h: SIZE[kind].h });
  }

  // ── Suelo: saliva, encía, placa, cavidades ──
  const circle = (x0, y0, r, type) => {
    for (let y = Math.floor(y0 - r); y <= y0 + r; y++)
      for (let x = Math.floor(x0 - r); x <= x0 + r; x++)
        if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x + 0.5 - x0, y + 0.5 - y0) <= r) floor[y * W + x] = type;
  };
  [[8, 29, 2.2], [36, 14, 1.6], [22, 15, 1.4], [33, 34, 1.5], [10, 9, 1.2]].forEach(([x, y, r]) => circle(x, y, r, FLOOR.SALIVA));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let dMin = 99;
      teeth.forEach((t) => { dMin = Math.min(dMin, Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y)); });
      if (dMin < 1.45) floor[y * W + x] = FLOOR.GUM;
      else if (dMin < 2.5 && rnd() < 0.3) floor[y * W + x] = FLOOR.PLAQUE;
    }
  }
  [[29, 10, 1.0], [6, 24, 0.9], [17, 36, 0.8], [37, 27, 0.8]].forEach(([x, y, r]) => circle(x, y, r, FLOOR.CAVITY));

  const isSolidCell = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || grid[cy * W + cx] !== 0;
  const solidAt = (x, y) => isSolidCell(Math.floor(x), Math.floor(y));

  // ── Spawns ──
  const spawns = {
    doc: [{ x: 19.5, y: 4.3, a: Math.PI / 2 }, { x: 24.5, y: 4.3, a: Math.PI / 2 }, { x: 22, y: 3.4, a: Math.PI / 2 }, { x: 17, y: 5, a: Math.PI / 2 },
          { x: 27, y: 5, a: Math.PI / 2 }, { x: 14.5, y: 6.5, a: Math.PI / 2 }, { x: 29.5, y: 6.5, a: Math.PI / 2 }],
    bac: [{ x: 19.5, y: 35.5, a: -Math.PI / 2 }, { x: 24.5, y: 35.5, a: -Math.PI / 2 }, { x: 22, y: 36.6, a: -Math.PI / 2 }, { x: 27, y: 34.5, a: -Math.PI / 2 },
          { x: 17, y: 34.5, a: -Math.PI / 2 }, { x: 12, y: 31, a: -Math.PI / 2 }, { x: 32, y: 31, a: -Math.PI / 2 }],
  };

  // ── Restos de comida (obstáculos bajos: se pueden saltar) ──
  const props = [
    [20, 13, 'popcorn'], [24.5, 12.3, 'chip'], [6.5, 17, 'broccoli'], [37.5, 17, 'popcorn'],
    [14.5, 33.5, 'chip'], [29.5, 33.5, 'broccoli'], [28, 16.5, 'popcorn'], [16, 16.5, 'chip'],
  ].map(([x, y, kind]) => ({ x, y, kind, r: 0.38, h: 0.45 }))
    .filter((p) => !solidAt(p.x, p.y) && teeth.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > t.r + 1.3));

  // ── Laberinto dentro de la lengua: se abre en los últimos segundos (objeto legendario en el centro) ──
  // Está en el centro de la boca para que ningún equipo tenga ventaja. 3 entradas: frente, izquierda y derecha.
  const isTongue = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === WALL.TONGUE;
  const interior = (x, y) => isTongue(x, y) && isTongue(x + 1, y) && isTongue(x - 1, y) && isTongue(x, y + 1) && isTongue(x, y - 1);
  const maze = { center: { x: 22.5, y: 25.5 }, cells: [], entrances: [] };
  const ENTR = [
    { outside: [22, 18], path: [[22, 19], [22, 20]] },   // frente (hacia los incisivos)
    { outside: [16, 29], path: [[17, 29]] },              // izquierda (atrás)
    { outside: [27, 21], path: [[26, 21], [25, 21]] },   // derecha (adelante)
  ];
  function carveMaze(seed) {
    const r = mulberry32(seed), open = new Set();
    const key = (x, y) => y * W + x;
    const isRoom = (x, y) => x % 2 === 0 && y % 2 === 1 && interior(x, y);
    const stack = [[22, 25]], seen = new Set([key(22, 25)]);
    open.add(key(22, 25));
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, x + dx / 2, y + dy / 2])
        .filter(([nx, ny, mx, my]) => isRoom(nx, ny) && interior(mx, my) && !seen.has(key(nx, ny)));
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, mx, my] = nb[Math.floor(r() * nb.length)];
      seen.add(key(nx, ny)); open.add(key(mx, my)); open.add(key(nx, ny));
      stack.push([nx, ny]);
    }
    ENTR.forEach((e) => e.path.forEach(([x, y]) => open.add(key(x, y))));
    // distancia (en celdas) desde cada entrada hasta cada celda abierta
    const fields = ENTR.map((e) => {
      const start = key(e.path[0][0], e.path[0][1]);
      const dist = new Map([[start, 1]]), q = [start];
      for (let i = 0; i < q.length; i++) {
        const c = q[i], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = key(cx + dx, cy + dy);
          if (open.has(n) && !dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); }
        }
      }
      return dist;
    });
    // distancia desde la zona de cada equipo (con el laberinto abierto)
    const fromSpawn = (sx, sy) => {
      const start = key(Math.floor(sx), Math.floor(sy)), dist = new Map([[start, 0]]), q = [start];
      const free = (c) => open.has(c) || (grid[c] === WALL.NONE);
      for (let i = 0; i < q.length; i++) {
        const c = q[i], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, n = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist.has(n) || !free(n)) continue;
          dist.set(n, dist.get(c) + 1); q.push(n);
        }
      }
      return dist;
    };
    const dDoc = fromSpawn(22, 4.3), dBac = fromSpawn(22, 35.5);
    // el objeto va en la celda más justa: igual de lejos para ambos equipos y ~16 celdas desde las entradas (≈ 5 s)
    let goal = null;
    open.forEach((c) => {
      const ds = fields.map((f) => f.get(c) || 99);
      const score = Math.abs((dDoc.get(c) || 99) - (dBac.get(c) || 99)) * 2 + Math.max(...ds.map((d) => Math.abs(d - 16)));
      if (!goal || score < goal.score) goal = { c, ds, score, doc: dDoc.get(c), bac: dBac.get(c) };
    });
    return { open, goal };
  }
  // Buscar (siempre igual en servidor y navegador) el laberinto más parejo
  let best = null;
  for (let seed = 1; seed <= 300; seed++) {
    const m = carveMaze(seed);
    if (!best || m.goal.score < best.m.goal.score) best = { seed, m };
  }
  maze.cells = [...best.m.open]; maze.dists = best.m.goal.ds; maze.seed = best.seed; maze.fromTeams = { doc: best.m.goal.doc, bac: best.m.goal.bac };
  maze.center = { x: (best.m.goal.c % W) + 0.5, y: ((best.m.goal.c / W) | 0) + 0.5 };
  maze.cells.forEach((i) => { floor[i] = FLOOR.GUM; });
  maze.entrances = ENTR.map((e) => ({ x: e.outside[0] + 0.5, y: e.outside[1] + 0.5 }));
  let mazeOpen = false;
  function setMazeOpen(open) {
    if (open === mazeOpen) return false;
    mazeOpen = open;
    maze.cells.forEach((i) => { grid[i] = open ? WALL.NONE : WALL.TONGUE; });
    return true;
  }

  return { W, H, grid, floor, teeth, props, spawns, WALL, FLOOR, isSolidCell, solidAt, mulberry32, maze, setMazeOpen, isMazeOpen: () => mazeOpen };
});
