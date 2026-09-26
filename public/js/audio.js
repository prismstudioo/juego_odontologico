// Sonidos sintetizados con WebAudio (sin archivos) + ambiente de boca (zumbido, respiración, goteo).
(function () {
  let ac = null, master = null, ambient = null, muted = false;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ac.destination);
    return true;
  }

  let noiseBuf = null;
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function tone(freq, dur, { type = 'square', vol = 0.15, to = null, delay = 0 } = {}) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, { freq = 1000, q = 1, type = 'bandpass', vol = 0.2, to = null, delay = 0 } = {}) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuffer();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  const SFX = {
    water: () => { noise(0.18, { freq: 2500, to: 900, q: 2, vol: 0.18 }); tone(700, 0.08, { type: 'sine', vol: 0.08, to: 1400 }); },
    drill: () => { tone(180, 0.35, { type: 'sawtooth', vol: 0.1, to: 260 }); noise(0.3, { freq: 3000, q: 4, vol: 0.08 }); },
    slime: () => { tone(160, 0.35, { type: 'sine', vol: 0.25, to: 60 }); noise(0.3, { freq: 300, to: 120, q: 3, vol: 0.2 }); },
    acid: () => { noise(0.3, { freq: 5000, to: 2000, type: 'highpass', vol: 0.12 }); tone(400, 0.12, { type: 'triangle', vol: 0.08, to: 200 }); },
    impact: () => noise(0.12, { freq: 900, q: 1, vol: 0.12 }),
    hit: () => { tone(220, 0.12, { type: 'square', vol: 0.12, to: 110 }); },
    kill: () => { noise(0.45, { freq: 600, to: 80, q: 2, vol: 0.3 }); tone(300, 0.4, { type: 'sawtooth', vol: 0.12, to: 40 }); },
    slimed: () => { tone(90, 0.6, { type: 'sine', vol: 0.3, to: 40 }); noise(0.5, { freq: 250, q: 5, vol: 0.2 }); },
    clean: () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.08, delay: i * 0.07 })); },
    dirty: () => { [220, 185, 147].forEach((f, i) => tone(f, 0.2, { type: 'sawtooth', vol: 0.09, delay: i * 0.08 })); },
    jump: () => tone(300, 0.15, { type: 'square', vol: 0.07, to: 600 }),
    weapon: () => { tone(1200, 0.04, { vol: 0.06 }); tone(800, 0.05, { vol: 0.06, delay: 0.05 }); },
    bombSpawn: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.14, { type: 'square', vol: 0.12, delay: i * 0.16 }); },
    bombPick: () => { tone(440, 0.1, { vol: 0.1 }); tone(880, 0.2, { vol: 0.1, delay: 0.1 }); },
    bombThrow: () => noise(0.35, { freq: 400, to: 1800, q: 2, vol: 0.15 }),
    boom: () => { noise(1.6, { freq: 1200, to: 40, type: 'lowpass', q: 0.7, vol: 0.7 }); tone(70, 1.2, { type: 'sine', vol: 0.5, to: 25 }); },
    shield: () => { tone(300, 0.3, { type: 'triangle', vol: 0.12, to: 1200 }); tone(600, 0.3, { type: 'sine', vol: 0.08, to: 2400, delay: 0.05 }); },
    blocked: () => { tone(1500, 0.12, { type: 'square', vol: 0.08, to: 900 }); noise(0.08, { freq: 4000, q: 3, vol: 0.1 }); },
    sticky: () => { tone(200, 0.2, { type: 'sine', vol: 0.2, to: 90 }); },
    fungus: () => { tone(80, 0.8, { type: 'sawtooth', vol: 0.2, to: 50 }); noise(0.8, { freq: 300, q: 4, vol: 0.15 }); },
    bite: () => { noise(0.1, { freq: 1500, q: 2, vol: 0.25 }); tone(150, 0.12, { type: 'square', vol: 0.12, to: 70, delay: 0.05 }); },
    whistle: () => tone(1800, 1.4, { type: 'sine', vol: 0.06, to: 400 }),
    thud: () => { tone(90, 0.35, { type: 'sine', vol: 0.4, to: 40 }); noise(0.25, { freq: 400, type: 'lowpass', vol: 0.3 }); },
    pickup: () => { [660, 990, 1320].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.1, delay: i * 0.05 })); },
    crown: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); },
    count: () => tone(660, 0.15, { type: 'square', vol: 0.15 }),
    go: () => { tone(990, 0.4, { type: 'square', vol: 0.15 }); tone(1320, 0.4, { type: 'square', vol: 0.1, delay: 0.05 }); },
    end: () => { [523, 392, 330, 262].forEach((f, i) => tone(f, 0.35, { type: 'square', vol: 0.13, delay: i * 0.22 })); },
  };

  function startAmbient() {
    if (!ac || ambient) return;
    ambient = ac.createGain();
    ambient.gain.value = 0.9;
    ambient.connect(master);
    // zumbido grave
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const dg = ac.createGain(); dg.gain.value = 0.05;
    [55, 55.6, 82.4].forEach((f) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); });
    lp.connect(dg); dg.connect(ambient);
    // respiración (ruido filtrado con volumen oscilante)
    const s = ac.createBufferSource(); s.buffer = noiseBuffer(); s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const bg = ac.createGain(); bg.gain.value = 0.015;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.18; lg.gain.value = 0.014;
    lfo.connect(lg); lg.connect(bg.gain); lfo.start();
    s.connect(bp); bp.connect(bg); bg.connect(ambient); s.start();
    // gotas de saliva
    (function drip() {
      if (!ambient) return;
      const f = 700 + Math.random() * 700;
      tone(f, 0.12, { type: 'sine', vol: 0.05, to: f * 0.35 });
      setTimeout(drip, 1200 + Math.random() * 3200);
    })();
  }

  MOC.Audio = {
    unlock() { if (ensure()) startAmbient(); },
    play(name) { if (ac && !muted && SFX[name]) SFX[name](); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
    get muted() { return muted; },
  };
})();
