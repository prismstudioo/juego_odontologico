// Pantalla principal (proyector): elegir 2/4 jugadores, lobby y las cámaras de todos los jugadores.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const show = (id) => ['modeSelect', 'lobby', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id));

  if (typeof io === 'undefined') { $('noServer').classList.remove('hidden'); return; }
  const socket = io();
  let lobby = null, modeChosen = false, view = null;
  const snaps = new MOC.SnapBuffer();

  function setJoinUrls(urls) {
    $('joinUrl').innerHTML = urls.map(esc).join('<br>');
    // Código QR para entrar más rápido desde el celular
    if (typeof qrcode === 'undefined') return;
    const qr = qrcode(0, 'L');
    qr.addData(urls[0]);
    qr.make();
    // tamaño entero por cuadrito para que se vea nítido y se pueda escanear desde lejos
    const cell = Math.max(4, Math.floor(Math.min(380, window.innerHeight * 0.36) / (qr.getModuleCount() + 8)));
    $('qr').src = qr.createDataURL(cell, 4);
    $('qr').classList.remove('hidden');
  }
  setJoinUrls([location.origin + '/controller.html']);
  // Si la pantalla se abrió como "localhost", mostrar la IP de la red local para los celulares
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    fetch('/lan').then((r) => r.json()).then(({ ips }) => {
      const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
      ips.sort((a, b) => rank(a) - rank(b));
      if (ips.length) setJoinUrls(ips.map((ip) => `http://${ip}:${location.port || 80}/controller.html`));
    }).catch(() => {});
  }

  document.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => {
    MOC.Audio.unlock();
    modeChosen = true;
    socket.emit('screen:mode', +b.dataset.mode);
    show('lobby');
  }));
  $('modeBtn').onclick = () => { modeChosen = false; show('modeSelect'); };
  $('botsBtn').onclick = () => socket.emit('screen:bots', !(lobby && lobby.players.some((p) => p.bot)));
  $('startBtn').onclick = () => { MOC.Audio.unlock(); socket.emit('start'); };
  $('muteBtn').onclick = () => { MOC.Audio.unlock(); $('muteBtn').textContent = MOC.Audio.toggleMute() ? '🔇' : '🔊'; };

  socket.on('connect', () => { $('noServer').classList.add('hidden'); socket.emit('screen:hello'); });
  socket.on('disconnect', () => $('noServer').classList.remove('hidden'));

  function slotHtml(p, team) {
    if (!p) return '<div class="slot"><span class="blink">Esperando jugador…</span></div>';
    const img = team === 'doc' ? `doc_${p.skin}_idle` : `bac_${p.skin}`;
    return `<div class="slot filled"><img src="assets/${img}.png" alt=""><div>${esc(p.name)}${p.connected ? '' : '<span class="off">📵 reconectando…</span>'}</div><button class="kick-btn" data-id="${esc(p.id)}" data-name="${esc(p.name)}" title="Eliminar jugador">✖</button></div>`;
  }

  // Botón ✖ de cada lugar: eliminar a ese jugador del lobby
  document.querySelector('.teams').addEventListener('click', (e) => {
    const b = e.target.closest('.kick-btn');
    if (b && confirm(`¿Eliminar a ${b.dataset.name}?`)) socket.emit('screen:kick', b.dataset.id);
  });

  socket.on('lobby', (info) => {
    lobby = info;
    ['doc', 'bac'].forEach((team) => {
      const members = info.players.filter((p) => p.team === team);
      let html = '';
      for (let i = 0; i < info.slots[team]; i++) html += slotHtml(members[i], team);
      $(team === 'doc' ? 'slotsDoc' : 'slotsBac').innerHTML = html;
      document.querySelector('.teams').classList.toggle('many', info.slots[team] > 2);
    });
    // Si faltan jugadores se puede "jugar así" o rellenar con bots (nunca solo con bots)
    const inTeams = info.players.filter((p) => p.team).length, humans = info.players.filter((p) => p.team && !p.bot).length;
    const hasBots = info.players.some((p) => p.bot);
    $('startBtn').disabled = !info.canStart;
    $('startBtn').textContent = info.full ? '[ INICIAR PARTIDA ]' : `[ ▶ JUGAR ASÍ ${inTeams}/${info.mode} ]`;
    $('botsBtn').textContent = hasBots ? '❌ QUITAR BOTS' : '🤖 RELLENAR CON BOTS';
    $('botsBtn').classList.toggle('hidden', !hasBots && (info.full || !humans));
    const waiting = info.players.filter((p) => !p.team).length;
    let msg;
    if (!humans) msg = `Esperando jugadores reales… (escanea el QR)` + (waiting ? ` · ${waiting} eligiendo equipo` : '');
    else if (!info.canStart) msg = 'Cada equipo necesita al menos 1 jugador · o pulsa RELLENAR CON BOTS';
    else if (info.full) msg = '¡TODO LISTO! PULSA INICIAR PARTIDA';
    else msg = `Faltan ${info.mode - inTeams} jugadores: JUGAR ASÍ (el equipo con menos jugadores recibe ventaja) o RELLENAR CON BOTS` + (waiting ? ` · ${waiting} eligiendo equipo` : '');
    $('lobbyMsg').textContent = msg;
    if (info.state === 'lobby') { snaps.clear(); show(modeChosen ? 'lobby' : 'modeSelect'); }
    else show('game');
  });

  socket.on('snap', (s) => {
    snaps.push(s);
    if (view && s.ev && s.ev.length) view.handleEvents(s.ev, s);
    if (s.st !== 'lobby' && $('game').classList.contains('hidden')) show('game');
  });

  MOC.loadAssets().then((A) => {
    view = new MOC.GameView($('gameCanvas'), $('overlay'), A, { onAgain: () => socket.emit('again') });
    let last = performance.now();
    (function frame() {
      requestAnimationFrame(frame);
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if ($('game').classList.contains('hidden')) return;
      const s = snaps.get();
      if (s) view.draw(s, MOC.GameView.viewOrder(s), dt);
    })();
  });
})();
