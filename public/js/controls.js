// Controles táctiles: 2 joysticks + DISPARAR, ACCIÓN, ARMA, SALTAR y LANZAR BOMBA.
// Se usan en el celular (controller.html) y en el modo prueba con pantalla táctil.
(function () {
  const C = MOC.CONFIG;
  const FIRE_LABEL = { none: ['✋', 'SIN ARMA'], water: ['💦', 'DISPARAR'], drill: ['🔩', 'TALADRAR'], slime: ['🟢', 'VISCOSIDAD'], acid: ['🧪', 'ÁCIDO'] };

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
    root.innerHTML = `
      <div class="c-top"><span class="c-hp"></span><span class="c-score"></span><span class="c-time"></span><span class="c-weapon"></span></div>
      <div class="c-zone c-move"><div class="stick"><div class="knob"></div></div><span class="c-label">MOVER</span></div>
      <div class="c-zone c-aim"><span class="c-label">👆 DESLIZA EN CUALQUIER PARTE PARA GIRAR / APUNTAR</span></div>
      <div class="c-mid">
        <button class="cb cb-weapon"><span class="ic">🔄</span><small>ARMA</small></button>
        <button class="cb cb-jump"><span class="ic">⤴️</span><small>SALTAR</small></button>
        <button class="cb cb-shield hidden"><i class="cool"></i><span class="ic">🛡️</span><small>ESCUDO</small></button>
        <button class="cb cb-bomb hidden"><span class="ic">💣</span><small>LANZAR</small><em></em></button>
      </div>
      <button class="cb cb-act disabled"><i class="prog"></i><span class="ic">🪥</span><small>LIMPIAR</small></button>
      <button class="cb cb-fire"><i class="cool"></i><span class="ic">💦</span><small>DISPARAR</small></button>
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
        onMove(vx, vy);
      };
      const release = () => {
        if (pid === null) return;
        pid = null;
        zone.classList.remove('active');
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
    hold(q('.cb-act'), 'act');
    tap(q('.cb-weapon'), 'weapon');
    tap(q('.cb-jump'), 'jump');
    tap(q('.cb-bomb'), 'throw');
    tap(q('.cb-shield'), 'shield');
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    const cache = {};
    const set = (key, el, val, prop = 'innerHTML') => { if (cache[key] !== val) { cache[key] = val; el[prop] = val; } };
    const fmt = (s) => { s = Math.ceil(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

    function update(st) {
      const me = st && st.me;
      if (!me) return;
      root.dataset.team = me.team;
      const efx = (me.sticky > 0 ? ` 🟢${me.sticky}/2` : '') + (me.boost > 0 ? ' ⚡' : '') + (me.crown ? ' 👑' : '') + (me.contagion > 0 ? ' 🧫' : '');
      set('hp', q('.c-hp'), `♥ ${me.hp}${efx}`);
      set('score', q('.c-score'), `🦷 ${st.score.clean} · ${st.score.dirty} 🦠`);
      set('time', q('.c-time'), fmt(st.tl));
      set('weapon', q('.c-weapon'), `${C.WEAPONS[me.weapon].icon} ${C.WEAPONS[me.weapon].label}`);

      const fire = q('.cb-fire'), [ic, label] = FIRE_LABEL[me.weapon];
      set('fireIc', fire.querySelector('.ic'), ic);
      set('fireLb', fire.querySelector('small'), me.cd > 0.5 && me.cdMax > 2 ? `${label} ${Math.ceil(me.cd)}s` : label);
      fire.classList.toggle('disabled', me.weapon === 'none' || !me.alive || me.slimed > 0 || me.stun > 0);
      fire.querySelector('.cool').style.height = (me.cdMax ? Math.min(100, (me.cd / me.cdMax) * 100) : 0) + '%';
      set('wIc', q('.cb-weapon .ic'), C.WEAPONS[me.weapon].icon);

      const act = q('.cb-act');
      const crown = me.actKind === 'crown';
      set('actIc', act.querySelector('.ic'), crown ? '👑' : me.team === 'doc' ? '🪥' : '🦠');
      set('actLb', act.querySelector('small'), crown ? 'CORONA' : me.team === 'doc' ? 'LIMPIAR' : 'ENSUCIAR');
      act.classList.toggle('disabled', !me.canAct && !me.act);
      act.querySelector('.prog').style.width = Math.round(me.act * 100) + '%';

      const sh = q('.cb-shield');
      sh.classList.toggle('hidden', me.team !== 'doc');
      if (me.team === 'doc') {
        sh.classList.toggle('active', me.shield > 0);
        sh.classList.toggle('disabled', !(me.shield > 0) && (me.shieldCd > 0 || !me.alive || me.slimed > 0 || me.stun > 0));
        sh.querySelector('.cool').style.height = (me.shieldCd > 0 ? Math.min(100, me.shieldCd / C.SHIELD_COOLDOWN * 100) : 0) + '%';
        set('shLb', sh.querySelector('small'), me.shield > 0 ? `ACTIVO ${Math.ceil(me.shield)}s` : me.shieldCd > 0 ? `${Math.ceil(me.shieldCd)}s` : 'ESCUDO');
      }
      const bomb = q('.cb-bomb');
      bomb.classList.toggle('hidden', !me.bomb);
      if (me.bomb) { bomb.dataset.type = me.bomb.type; set('bombT', bomb.querySelector('em'), Math.ceil(me.bomb.t) + 's'); }

      const ov = q('.c-overlay');
      let msg = '';
      if (!me.alive) msg = `💀 ELIMINADO<br><b>${Math.ceil(me.dead)}</b>`;
      else if (me.slimed > 0) msg = `🟢 ¡INMOVILIZADO!<br><b>${Math.ceil(me.slimed)}</b><small>puedes seguir girando</small>`;
      else if (me.stun > 0) msg = `💫 ¡NOQUEADO!<br><b>${Math.ceil(me.stun)}</b><small>te cayó un tonsilolito</small>`;
      else if (st.st === 'countdown') msg = `<b>${Math.max(1, Math.ceil(st.cd))}</b>`;
      ov.classList.toggle('hidden', !msg);
      ov.classList.toggle('slime', me.slimed > 0);
      set('ov', ov, msg);
    }

    return { input, update };
  };
})();
