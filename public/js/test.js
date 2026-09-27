// Modo solitario vs bots: la partida corre en el navegador (sin servidor) con bots en los demás lugares.
(function () {
  const $ = (id) => document.getElementById(id);
  let mode = 4, game = null, human = null, view = null, quad = false;
  window.mocTestGame = () => game; // útil para depurar desde la consola

  document.querySelectorAll('#setup .mode-card').forEach((b) => b.addEventListener('click', () => {
    mode = +b.dataset.mode;
    document.querySelectorAll('#setup .mode-card').forEach((c) => { c.style.boxShadow = c === b ? '0 0 0 6px var(--gold), 10px 10px 0 #000' : ''; });
    $('setupMsg').textContent = `${mode} JUGADORES · ahora elige tu equipo`;
  }));
  document.querySelector('#setup .mode-card[data-mode="4"]').click();

  const assetsReady = MOC.loadAssets().catch((e) => { $('setupMsg').textContent = '⚠️ ' + e.message; throw e; });

  document.querySelectorAll('#teamCard [data-team]').forEach((b) => b.addEventListener('click', async () => {
    MOC.Audio.unlock();
    const A = await assetsReady;
    game = new MOC.Game({ mode });
    human = game.addPlayer({ name: $('nameInput').value.trim() || 'JUGADOR', team: b.dataset.team });
    game.fillBots();
    game.start();
    view = view || new MOC.GameView($('gameCanvas'), $('overlay'), A, { onAgain: () => { game.backToLobby(); game.start(); } });
    $('setup').classList.add('hidden');
    $('game').classList.remove('hidden');
    setTimeout(() => { $('keysHelp').style.opacity = 0; }, 12000);
  }));

  // ── Teclado y mouse ──
  const keys = {};
  const counters = { jump: 0, weapon: 0, throw: 0, shield: 0 };
  let mouseDown = false, mouseDX = 0;
  addEventListener('keydown', (e) => {
    if (!game) return;
    const k = e.key.toLowerCase();
    if (!keys[k]) {
      if (k === ' ') counters.jump++;
      if (k === 'q') counters.weapon++;
      if (k === 'f') counters.throw++;
      if (k === 'r') counters.shield++;
      if (k === 'v') quad = !quad;
      if (k === 'm') $('muteBtn').textContent = MOC.Audio.toggleMute() ? '🔇' : '🔊';
    }
    keys[k] = true;
    if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  const canvas = $('gameCanvas');
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) canvas.requestPointerLock();
    mouseDown = true;
  });
  addEventListener('mouseup', () => { mouseDown = false; });
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) mouseDX += e.movementX; });
  $('muteBtn').onclick = () => { MOC.Audio.unlock(); $('muteBtn').textContent = MOC.Audio.toggleMute() ? '🔇' : '🔊'; };

  // ── Controles táctiles (si el dispositivo es táctil) ──
  let touch = null;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    $('touch').classList.remove('hidden');
    $('keysHelp').classList.add('hidden');
    touch = MOC.createControls($('touch'), () => {});
  }

  function humanInput() {
    const k = (n) => (keys[n] ? 1 : 0);
    const inp = {
      // W camina; Shift + W corre (en el celular: joystick al tope)
      mx: k('d') - k('a'), my: k('s') - k('w') * (keys.shift ? 1 : 0.85), tx: k('arrowright') - k('arrowleft'),
      fire: mouseDown || !!keys.j, act: !!keys.e, look: mouseDX * 0.0028,
      jump: counters.jump, weapon: counters.weapon, throw: counters.throw, shield: counters.shield,
    };
    if (touch) {
      const t = touch.input;
      if (t.mx || t.my) { inp.mx = t.mx; inp.my = t.my; }
      if (t.tx) inp.tx = t.tx;
      inp.look += t.look; t.look = 0;
      inp.fire = inp.fire || t.fire; inp.act = inp.act || t.act;
      inp.jump += t.jump; inp.weapon += t.weapon; inp.throw += t.throw; inp.shield += t.shield;
    }
    mouseDX = 0;
    return inp;
  }

  // ── Bucle ──
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  (function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!game || !view) return;
    game.setInput(human.id, humanInput());
    acc += dt;
    while (acc >= STEP) { game.update(STEP); acc -= STEP; }
    const snap = game.snapshot();
    const ev = game.drainEvents();
    if (ev.length) view.handleEvents(ev, snap);
    let ids = [human.id];
    if (quad) {
      ids = MOC.GameView.viewOrder(snap);
    }
    view.draw(snap, ids, dt);
    if (touch) touch.update(game.privateState(human.id));
  })();
})();
