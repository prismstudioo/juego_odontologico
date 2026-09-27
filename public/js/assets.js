// Carga de imágenes y creación de variantes (oscurecidas por distancia y con destello de daño).
(function () {
  const FILES = {
    doc_alan_idle: 'doc_alan_idle', doc_alan_armed: 'doc_alan_armed', doc_alan_slimed: 'doc_alan_slimed',
    doc_karina_idle: 'doc_karina_idle', doc_karina_armed: 'doc_karina_armed', doc_karina_slimed: 'doc_karina_slimed',
    bac_alan: 'bac_alan', bac_karina: 'bac_karina',
    incisor_clean: 'incisor_clean', incisor_dirty: 'incisor_dirty',
    molar_clean: 'molar_clean', molar_dirty_r: 'molar_dirty_r', molar_dirty_l: 'molar_dirty_l',
    canine_clean: 'canine_clean', canine_dirty_r: 'canine_dirty_r', canine_dirty_l: 'canine_dirty_l',
    bomb: 'bomb',
  };
  const SHADES = [0, 0.3, 0.52, 0.72];

  function canvasFrom(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w || src.width; c.height = h || src.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function tinted(src, color) {
    const c = canvasFrom(src), g = c.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  // Sprite con 4 niveles de oscuridad + versión "golpeado"
  function variants(src) {
    return {
      w: src.width, h: src.height,
      lv: SHADES.map((k) => (k ? tinted(src, `rgba(0,0,0,${k})`) : canvasFrom(src))),
      hit: tinted(src, 'rgba(255,70,70,0.6)'),
      green: tinted(src, 'rgba(110,230,40,0.45)'), // pegajoso
    };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar ' + url));
      img.src = url;
    });
  }

  MOC.loadAssets = async function (base = 'assets/') {
    const A = { img: {}, spr: {} };
    await Promise.all(Object.entries(FILES).map(async ([key, file]) => { A.img[key] = await loadImage(base + file + '.png'); }));
    for (const key in A.img) A.spr[key] = variants(A.img[key]);
    A.spr.bomb_clean = variants(tinted(A.img.bomb, 'rgba(70,170,255,0.35)'));
    A.spr.bomb_dirty = variants(tinted(A.img.bomb, 'rgba(90,255,60,0.4)'));
    A.spr.bomb_neutral = variants(tinted(A.img.bomb, 'rgba(255,210,60,0.3)'));
    // bombas de efecto (anestesia, gas de la risa, amalgama, hilo dental)
    A.spr.bomb_anest = variants(tinted(A.img.bomb, 'rgba(255,110,200,0.45)'));
    A.spr.bomb_gas = variants(tinted(A.img.bomb, 'rgba(170,110,255,0.5)'));
    A.spr.bomb_amalgam = variants(tinted(A.img.bomb, 'rgba(210,215,225,0.6)'));
    A.spr.bomb_floss = variants(tinted(A.img.bomb, 'rgba(255,255,255,0.55)'));
    const S = MOC.TEX.sprites;
    for (const key of ['popcorn', 'chip', 'broccoli', 'puddle', 'fungus', 'stone']) A.spr[key] = variants(S[key]);
    for (const key of ['shadow', 'sugar', 'fluor', 'crown', 'strain', 'super', 'bubble', 'legend', 'beam']) A.spr[key] = { w: S[key].width, h: S[key].height, lv: [S[key], S[key], S[key], S[key]], hit: S[key] };
    for (const key of ['water', 'slime', 'acid', 'smg']) A.spr[key] = { w: S[key].width, h: S[key].height, lv: [S[key], S[key], S[key], S[key]], hit: S[key] };
    return A;
  };
})();
