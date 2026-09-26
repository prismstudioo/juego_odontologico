// Celular como control: nombre → equipo → espera → controles → resultados.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SECTIONS = ['join', 'team', 'wait', 'play', 'results'];
  let current = 'join';
  const show = (id) => {
    if (current === id) return;
    current = id;
    SECTIONS.forEach((s) => $(s).classList.toggle('hidden', s !== id));
    document.body.classList.toggle('playing', id === 'play');
    updateCam();
  };

  if (typeof io === 'undefined') { $('joinErr').textContent = 'No hay conexión con el servidor.'; return; }
  const socket = io();
  let myId = null, lobby = null, lastState = null;
  const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };
  $('nameInput').value = store.get('moc_name') || '';

  // ── Controles ──
  let lastSent = 0, pending = null;
  const controls = MOC.createControls($('play'), () => {
    const now = performance.now();
    if (now - lastSent > 33) send(); else if (!pending) pending = setTimeout(send, 33);
  });
  function send() {
    clearTimeout(pending); pending = null;
    lastSent = performance.now();
    if (myId) socket.emit('input', controls.input);
    controls.input.look = 0; // el giro se envía una sola vez
  }
  setInterval(() => { if (current === 'play') send(); }, 100);

  function join() {
    const name = $('nameInput').value.trim();
    if (!name) { $('joinErr').textContent = 'Escribe tu nombre'; return; }
    store.set('moc_name', name);
    ['jump', 'weapon', 'throw', 'shield'].forEach((k) => { controls.input[k] = 0; });
    socket.emit('player:join', { name, token: store.get('moc_token') }, (res) => {
      if (!res.ok) { $('joinErr').textContent = res.error; show('join'); return; }
      myId = res.id;
      store.set('moc_token', res.token);
      $('joinErr').textContent = '';
      if (lobby) route();
    });
  }
  $('joinBtn').onclick = join;
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  socket.on('connect', () => { if (store.get('moc_token') && $('nameInput').value) join(); });

  $('pickDoc').onclick = () => socket.emit('player:team', 'doc');
  $('pickBac').onclick = () => socket.emit('player:team', 'bac');
  $('changeTeamBtn').onclick = () => { socket.emit('player:leave'); myId = null; store.set('moc_token', ''); join(); };
  $('startBtn').onclick = () => socket.emit('start');
  $('againBtn').onclick = () => socket.emit('again');

  // Pantalla completa + pantalla siempre encendida al empezar a jugar
  $('play').addEventListener('pointerdown', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    }
    if (navigator.wakeLock && !window._wake) navigator.wakeLock.request('screen').then((w) => { window._wake = w; w.onrelease = () => { window._wake = null; }; }).catch(() => {});
  });

  // ── Ver mi cámara en el celular (opcional) ──
  let camOn = store.get('moc_cam') === '1', camView = null;
  const camDefault = () => { if (store.get('moc_cam') == null && lobby && lobby.mode >= 10) camOn = true; };
  const camSnaps = new MOC.SnapBuffer();
  function updateCam() {
    camDefault();
    const show = camOn && current === 'play';
    $('camBtn').classList.toggle('hidden', current !== 'play');
    $('camBtn').textContent = camOn ? '📺 OCULTAR CÁMARA' : '📺 VER MI CÁMARA';
    $('phoneCanvas').classList.toggle('hidden', !show);
    $('phoneOverlay').classList.toggle('hidden', !show);
    document.body.classList.toggle('cam', show);
    socket.emit('player:view', show);
    if (show && !camView) {
      MOC.loadAssets().then((A) => { camView = new MOC.GameView($('phoneCanvas'), $('phoneOverlay'), A, { phone: true }); });
    }
  }
  $('camBtn').onclick = () => { camOn = !camOn; store.set('moc_cam', camOn ? '1' : '0'); updateCam(); };
  socket.on('snap', (s) => {
    camSnaps.push(s);
    if (camView && s.ev && s.ev.length) camView.handleEvents(s.ev, s);
  });
  let camLast = performance.now();
  (function camFrame() {
    requestAnimationFrame(camFrame);
    const now = performance.now(), dt = Math.min(0.1, (now - camLast) / 1000);
    camLast = now;
    if (!camOn || current !== 'play' || !camView || !myId) return;
    const s = camSnaps.get();
    if (s && s.players.some((p) => p.id === myId)) camView.draw(s, [myId], dt);
  })();
  socket.on('connect', () => { if (current === 'play') updateCam(); });

  socket.on('lobby', (info) => { lobby = info; route(); });
  socket.on('me', (st) => {
    if (!st) return;
    lastState = st;
    if (st.st !== 'lobby' && lobby) lobby.state = st.st;
    route();
    if (current === 'play') controls.update(st);
  });
  socket.on('kicked', () => {
    myId = null;
    store.set('moc_token', '');
    show('join');
    $('joinErr').textContent = 'Te eliminaron de la sala. Puedes volver a entrar.';
  });
  socket.on('buzz', (type) => { if (navigator.vibrate) navigator.vibrate(type === 'kill' ? [200, 80, 200] : type === 'slimed' ? [400] : [60]); });

  function route() {
    if (!myId || !lobby) return;
    const me = lobby.players.find((p) => p.id === myId);
    if (!me) { myId = null; show('join'); return; }
    const state = lobby.state;
    if (state === 'lobby') {
      if (!me.team) {
        show('team');
        const cnt = (t) => lobby.players.filter((p) => p.team === t).length;
        $('docSlots').textContent = `${cnt('doc')}/${lobby.slots.doc}`;
        $('bacSlots').textContent = `${cnt('bac')}/${lobby.slots.bac}`;
        const humans = (t) => lobby.players.filter((p) => p.team === t && !p.bot).length;
        $('pickDoc').disabled = humans('doc') >= lobby.slots.doc;
        $('pickBac').disabled = humans('bac') >= lobby.slots.bac;
      } else {
        show('wait');
        const img = me.team === 'doc' ? `doc_${me.skin}_armed` : `bac_${me.skin}`;
        $('meCard').innerHTML = `<img src="assets/${img}.png" style="height:90px;image-rendering:pixelated" alt=""><br><span class="t-${me.team}">${esc(me.name)} · ${me.team === 'doc' ? '🦷 ODONTÓLOGO' : '🦠 BACTERIA'}</span>`;
        $('waitList').innerHTML = lobby.players.filter((p) => p.team).map((p) => `<div class="t-${p.team}">${p.team === 'doc' ? '🦷' : '🦠'} ${esc(p.name)}</div>`).join('');
        $('startBtn').classList.toggle('hidden', !lobby.canStart);
        $('waitMsg').textContent = lobby.canStart ? '¡Listos!' : `Esperando jugadores… (${lobby.players.filter((p) => p.team).length}/${lobby.mode})`;
      }
    } else if (state === 'results') {
      show('results');
      const r = lastState && lastState.res;
      if (r) {
        const mine = me.team, won = r.winner === mine;
        $('resText').innerHTML = `TIEMPO TERMINADO<br><br><span class="t-doc">🦷 LIMPIOS: ${r.clean}</span><br><span class="t-bac">🦠 CONTAMINADOS: ${r.dirty}</span><br><br>${r.winner === 'tie' ? '🤝 EMPATE' : won ? '🏆 ¡GANASTE!' : '💀 PERDISTE'}`;
      }
    } else if (me.team) show('play');
  }
})();
