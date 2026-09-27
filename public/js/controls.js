// Controles táctiles: 2 joysticks + DISPARAR, ACCIÓN, ARMA, SALTAR y LANZAR BOMBA.
// Se usan en el celular (controller.html) y en el modo prueba con pantalla táctil.
(function () {
  const C = MOC.CONFIG;
  const FIRE_LABEL = { none: ['✋', 'SIN ARMA'], water: ['💦', 'DISPARAR'], smg: ['🔫', 'RÁFAGA'], drill: ['🔩', 'TALADRAR'], slime: ['🟢', 'VISCOSIDAD'], acid: ['🧪', 'ÁCIDO'] };

  // Impide el zoom del navegador (pellizcar con 2 dedos o doble toque): con zoom ya no se puede jugar.
  // iPhone/Safari ignora "user-scalable=no", por eso se bloquea también con eventos.
  let zoomLocked = false;
  function lockZoom() {
    if (zoomLocked) return;
    zoomLocked = true;
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, stop, { passive: false }));
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || e.scale !== undefined && e.scale !== 1) stop(e); }, { passive: false });
    document.addEventListener('dblclick', stop, { passive: false });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch < 300 && e.target.closest && e.target.closest('.controls')) stop(e); // doble toque
      lastTouch = now;
    }, { passive: false });
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, { passive: false });
    document.documentElement.style.touchAction = 'none';
  }

  MOC.createControls = function (root, onChange) {
    lockZoom();
    root.classList.add('controls');
    // Solo 3 botones: DISPARAR (también limpia / ensucia junto a un diente), ARMA y SALTAR.
    // Correr = joystick al tope hacia adelante. Escudo y bombas se activan solos (solo se muestran como indicadores).
    root.innerHTML = `
      <div class="c-top"><span class="c-hp"></span><span class="c-score"></span><span class="c-time"></span><span class="c-weapon"></span></div>
      <div class="c-badges"></div>
      <div class="c-zone c-move"><div class="stick"><div class="knob"></div><i class="run-ring"></i></div><span class="c-label">MOVER · AL TOPE ⬆ = CORRER</span></div>
      <div class="c-zone c-aim"><span class="c-label">👆 DESLIZA PARA GIRAR / APUNTAR</span></div>
      <div class="c-mid">
        <button class="cb cb-weapon"><span class="ic">🔄</span><small>ARMA</small></button>
        <button class="cb cb-jump"><span class="ic">⤴️</span><small>SALTAR</small></button>
      </div>
      <button class="cb cb-fire"><i class="cool"></i><i class="prog"></i><span class="ic">💦</span><small>DISPARAR</small></button>
      <div class="c-overlay hidden"></div>`;
    const q = (s) => root.querySelector(s);
    const input = { mx: 0, my: 0, tx: 0, look: 0, fire: false, act: false, jump: 0, weapon: 0, throw: 0, shield: 0 };
    const changed = () => onChange(input);

    // Cada dedo se sigue por su pointerId en toda la ventana (no solo en la zona),
    // así el joystick no se queda "trabado" si el dedo sale de la zona o se pierde la captura.
    const releasers = [];
    const onUp = (pidRef, fn) => {
      const handler = (e) => { if (e.pointerId === pidRef()) fn(); };
      window.addEventListener('pointerup', handler);
      window.addEventListener('pointercancel', handler);
      releasers.push(fn);
    };
    function releaseAll() { releasers.forEach((fn) => fn()); }
    // Si ya no queda ningún dedo en la pantalla, se suelta todo
    window.addEventListener('touchend', (e) => { if (e.touches.length === 0) releaseAll(); });
    window.addEventListener('touchcancel', (e) => { if (e.touches.length === 0) releaseAll(); });
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

    function stick(zone, onMove) {
      const base = zone.querySelector('.stick'), knob = zone.querySelector('.knob');
      let pid = null, ox = 0, oy = 0;
      const R = () => base.offsetWidth / 2 || 50;
      const set = (dx, dy) => {
        const r = R(), d = Math.hypot(dx, dy), k = d > r ? r / d : 1;
        knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        let vx = (dx * k) / r, vy = (dy * k) / r;
        if (Math.hypot(vx, vy) < 0.12) { vx = 0; vy = 0; }
        zone.classList.toggle('running', -vy > 0.9 && Math.abs(vx) < 0.45);
        onMove(vx, vy);
      };
      const release = () => {
        if (pid === null) return;
        pid = null;
        zone.classList.remove('active', 'running');
        knob.style.transform = '';
        base.style.left = ''; base.style.top = '';
        onMove(0, 0);
      };
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (pid !== null) release(); // un toque nuevo reemplaza al anterior (evita quedarse pegado)
        pid = e.pointerId;
        try { zone.setPointerCapture(pid); } catch (err) { /* no soportado */ }
        const zr = zone.getBoundingClientRect();
        ox = e.clientX; oy = e.clientY;
        base.style.left = (ox - zr.left) + 'px';
        base.style.top = (oy - zr.top) + 'px';
        zone.classList.add('active');
        set(0, 0);
      });
      window.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e.clientX - ox, e.clientY - oy); });
      zone.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) release(); });
      onUp(() => pid, release);
    }
    stick(q('.c-move'), (x, y) => { input.mx = +x.toFixed(2); input.my = +y.toFixed(2); changed(); });

    // Girar: arrastrar el dedo por cualquier parte libre de la pantalla (como un FPS de celular)
    (function lookArea(zone) {
      let pid = null, lastX = 0;
      const release = () => { pid = null; zone.classList.remove('active'); };
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pid = e.pointerId; lastX = e.clientX;
        try { zone.setPointerCapture(pid); } catch (err) { /* no soportado */ }
        zone.classList.add('active');
      });
      window.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        const sens = 4.2 / Math.max(320, window.innerWidth); // deslizar todo el ancho ≈ 240°
        input.look += (e.clientX - lastX) * sens;
        lastX = e.clientX;
        changed();
      });
      zone.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) release(); });
      onUp(() => pid, release);
    })(q('.c-aim'));

    function hold(btn, key) {
      let pid = null;
      const release = () => { if (pid === null) return; pid = null; input[key] = false; btn.classList.remove('pressed'); changed(); };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pid = e.pointerId;
        try { btn.setPointerCapture(pid); } catch (err) { /* no soportado */ }
        input[key] = true; btn.classList.add('pressed'); changed();
      });
      btn.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) release(); });
      onUp(() => pid, release);
    }
    function tap(btn, key) {
      btn.addEventListener('pointerdown', (e) => {
        input[key]++; btn.classList.add('pressed'); changed(); e.preventDefault();
        setTimeout(() => btn.classList.remove('pressed'), 120);
        if (navigator.vibrate) navigator.vibrate(15);
      });
    }
    hold(q('.cb-fire'), 'fire');
    tap(q('.cb-weapon'), 'weapon');
    tap(q('.cb-jump'), 'jump');
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    const cache = {};
    const set = (key, el, val, prop = 'innerHTML') => { if (cache[key] !== val) { cache[key] = val; el[prop] = val; } };
    const fmt = (s) => { s = Math.ceil(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

    function update(st) {
      const me = st && st.me;
      if (!me) return;
      root.dataset.team = me.team;
      const efx = (me.sup > 0 ? ` ⭐${Math.ceil(me.sup)}s` : '') + (me.lv > 0 ? ` ⬆${me.lv}` : '') + (me.dizzy > 0 ? ' 😂' : '') + (me.slow > 0 ? ' 🧵' : '')
        + (me.sticky > 0 ? ` 🟢${me.sticky}/2` : '') + (me.boost > 0 ? ' ⚡' : '') + (me.crown ? ' 👑' : '') + (me.contagion > 0 ? ' 🧫' : '');
      set('hp', q('.c-hp'), `♥ ${me.hp}${efx}`);
      set('score', q('.c-score'), `🦷 ${st.score.clean} · ${st.score.dirty} 🦠`);
      set('time', q('.c-time'), fmt(st.tl));
      set('weapon', q('.c-weapon'), `${C.WEAPONS[me.weapon].icon} ${C.WEAPONS[me.weapon].label}`);

      const fire = q('.cb-fire'), [ic, label] = FIRE_LABEL[me.weapon];
      const race = st.race, crown = me.actKind === 'crown', acting = !race && (me.canAct || me.act > 0);
      let fIc = ic, fLb = me.cd > 0.5 && me.cdMax > 2 ? `${label} ${Math.ceil(me.cd)}s` : label;
      if (race) { fIc = '🦷'; fLb = '¡A LA MUELA!'; }
      else if (acting) { fIc = crown ? '👑' : me.team === 'doc' ? '🪥' : '🦠'; fLb = crown ? 'CORONA' : me.team === 'doc' ? 'LIMPIAR' : 'ENSUCIAR'; }
      set('fireIc', fire.querySelector('.ic'), fIc);
      set('fireLb', fire.querySelector('small'), fLb);
      fire.classList.toggle('acting', acting);
      fire.classList.toggle('disabled', !me.alive || me.slimed > 0 || me.stun > 0);
      fire.querySelector('.cool').style.height = (!acting && me.cdMax ? Math.min(100, (me.cd / me.cdMax) * 100) : 0) + '%';
      fire.querySelector('.prog').style.width = (acting ? Math.round(me.act * 100) : 0) + '%';
      const wb = q('.cb-weapon');
      wb.classList.toggle('hidden', !!race || (me.weapons || []).length < 2);
      set('wIc', wb.querySelector('.ic'), C.WEAPONS[me.weapon].icon);
      q('.c-move').classList.toggle('sprinting', !!me.run);

      // Indicadores (no son botones): escudo automático, bomba, protección, correr
      const badges = [];
      if (me.prot > 0) badges.push(`<b class="bd-prot">✨ PROTEGIDO ${Math.ceil(me.prot)}s</b>`);
      if (me.run) badges.push('<b class="bd-run">🏃 CORRIENDO</b>');
      if (me.team === 'doc' && !race) badges.push(me.shield > 0 ? `<b class="bd-on">🛡️ ESCUDO ${Math.ceil(me.shield)}s</b>` : me.shieldCd > 0 ? `<b>🛡️ ${Math.ceil(me.shieldCd)}s</b>` : '<b class="bd-ready">🛡️ AUTO</b>');
      if (me.bomb) badges.push(`<b class="bd-bomb">${me.bomb.kind && me.bomb.kind !== 'teeth' ? C.BOMB_KINDS[me.bomb.kind].icon : '💣'} SE LANZA SOLA</b>`);
      if (race) badges.push(`<b class="bd-race">🦷 ${race.doc} · ${race.bac} 🦠 / ${C.RACE.hits}</b>`);
      set('badges', q('.c-badges'), badges.join(''));

      const ov = q('.c-overlay');
      let msg = '';
      if (!me.alive) msg = `💀 ELIMINADO<br><b>${Math.ceil(me.dead)}</b>`;
      else if (me.slimed > 0) msg = `🟢 ¡INMOVILIZADO!<br><b>${Math.ceil(me.slimed)}</b><small>puedes seguir girando</small>`;
      else if (me.stun > 0) msg = me.stunK === 'anest' ? `💉 ¡ANESTESIADO!<br><b>${Math.ceil(me.stun)}</b><small>te durmió una bomba de anestesia</small>` : `💫 ¡NOQUEADO!<br><b>${Math.ceil(me.stun)}</b><small>te cayó un tonsilolito</small>`;
      else if (st.st === 'countdown') msg = `<b>${Math.max(1, Math.ceil(st.cd))}</b>`;
      else if (race && race.cd > 0) msg = `🦷 ¡DESEMPATE!<br><b>${Math.max(1, Math.ceil(race.cd))}</b><small>dispara a la muela · ${C.RACE.hits} disparos la rompen</small>`;
      ov.classList.toggle('hidden', !msg);
      ov.classList.toggle('slime', me.slimed > 0);
      set('ov', ov, msg);
    }

    return { input, update };
  };
})();
