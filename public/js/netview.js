// Guarda las instantáneas del servidor e interpola entre ellas para que el movimiento sea suave.
// Lo usan la pantalla principal y la cámara del celular.
(function () {
  const INTERP_MS = 80;
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

  class SnapBuffer {
    constructor() { this.snaps = []; }
    push(s) {
      this.snaps.push({ t: performance.now(), s });
      if (this.snaps.length > 12) this.snaps.shift();
    }
    clear() { this.snaps.length = 0; }
    get() {
      const snaps = this.snaps;
      if (!snaps.length) return null;
      const rt = performance.now() - INTERP_MS;
      let i = snaps.length - 1;
      while (i > 0 && snaps[i - 1].t > rt) i--;
      const b = snaps[i], a = snaps[i - 1];
      if (!a || rt >= b.t) return b.s;
      const k = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t)));
      const pa = new Map(a.s.players.map((p) => [p.id, p]));
      const qa = new Map(a.s.proj.map((p) => [p.id, p]));
      return Object.assign({}, b.s, {
        players: b.s.players.map((p) => {
          const o = pa.get(p.id);
          if (!o || Math.hypot(o.x - p.x, o.y - p.y) > 3) return p; // reaparición: sin interpolar
          return Object.assign({}, p, { x: lerp(o.x, p.x, k), y: lerp(o.y, p.y, k), z: lerp(o.z, p.z, k), a: lerpAng(o.a, p.a, k) });
        }),
        proj: b.s.proj.map((p) => { const o = qa.get(p.id); return o ? Object.assign({}, p, { x: lerp(o.x, p.x, k), y: lerp(o.y, p.y, k) }) : p; }),
      });
    }
  }
  MOC.SnapBuffer = SnapBuffer;
})();
