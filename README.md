# 🦷 MOUTH OF CHAOS 🦠

Shooter pseudo-3D (estilo Doom, pixel art) multijugador: **odontólogos vs bacterias** dentro de una boca.
Modos 1 vs 1, 2 vs 2, 5 vs 5 y 7 vs 7 (hasta 14 jugadores). Faltan jugadores → botón **RELLENAR CON BOTS**. Cada jugador usa **su celular como control**. Sin base de datos: todo vive en la memoria del servidor.

## Páginas
| Página | Para qué |
|---|---|
| `/` | Menú principal |
| `/screen.html` | Pantalla principal (proyector): elegir modo, lobby y cámaras divididas (en 5v5 y 7v7: cámara aérea grande + cámaras de jugadores) |
| `/controller.html` | Control del celular (en horizontal) |
| `/test.html` | Modo prueba de 1 dispositivo contra bots (no necesita servidor) |

## Jugar en tu PC (red local)
1. Windows: doble clic en `iniciar-servidor.bat` · Mac: doble clic en `iniciar-servidor.command`
   (o en terminal: `npm install` y luego `npm start`).
2. En la PC abre `http://localhost:3000/screen.html`.
3. En los celulares (misma WiFi) abre la dirección que aparece en la pantalla, p. ej. `http://192.168.0.35:3000/controller.html`.
   Si no conecta: permite Node.js en el firewall (red privada).

## Subir a Render
1. Sube esta carpeta a un repositorio de GitHub (`node_modules` se ignora solo).
2. En Render: **New → Web Service** → elige el repo.
3. Build command: `npm install` · Start command: `npm start` · Plan Free.
4. Abre `https://TU-APP.onrender.com/screen.html` en el proyector y `.../controller.html` en los celulares.
   (El plan gratis "duerme": la primera carga puede tardar ~1 minuto.)

## Controles del celular
Solo 3 botones para no tapar la pantalla:
- **Joystick izquierdo** = moverse · **empujarlo al tope hacia adelante = CORRER** 🏃
- **Deslizar el dedo** en cualquier otra parte = girar/apuntar
- **DISPARAR**: dispara; junto a un diente **limpia / ensucia** (o pone la 👑 corona) con el mismo botón
- **ARMA**: odontólogos 💦 pistola ↔ 🔫 metralleta · bacterias 🟢 viscosidad ↔ 🧪 ácido ↔ 🔫 metralleta
- **SALTAR**
- Automático (sin botones): 🛡️ el escudo se activa solo cuando te lanzan viscosidad; 💣 las bombas se lanzan solas (la dental al agarrarla, las de efecto hacia el rival más cercano).
- 📺 VER MI CÁMARA muestra tu vista en el celular.

Los celulares (QR) **no pueden iniciar la partida**: solo la pantalla principal inicia y vuelve a jugar. En la sala cada jugador elige su personaje dentro de su equipo.

Modo prueba con teclado: WASD mover, Shift+W correr, mouse / ← → girar, clic o J disparar (junto a un diente limpia/ensucia), Q arma, Espacio saltar, V ver todas las cámaras, M sonido.

## Reglas nuevas
- ✨ **Protección al reaparecer**: 3 s sin recibir daño ni viscosidad.
- 👥 **Jugar así o rellenar con bots**: si la sala no está llena, la pantalla puede iniciar con los que hay (mínimo 1 por equipo) o rellenar con bots. Nunca se inicia solo con bots.
- ⚖️ **Desempate (8 vs 8 dientes)**: aparece una muela gigante en el centro. Todos con la misma metralleta y la misma velocidad. Cada disparo suma 1 a tu equipo y le resta 1 al rival; el primero en llegar a **35** la rompe y gana (si pasan 60 s, gana quien lleve más).
- 🏆 Pantalla final con el equipo ganador, tabla de jugadores y MVP.

## Mecánicas del mapa (sin botones extra)
- 🛡️ **Escudo (odontólogos)**: botón ESCUDO (tecla R en solitario). 4 s inmune a la viscosidad; mientras está activo no puedes disparar. Recarga 7 s desde que se acaba.
- 🟢 **Viscosidad**: inmoviliza al primer impacto (8 s). Recarga 5 s. Después hay 4 s de inmunidad para que no se encadene.
- 📡 En 5 vs 5 y 7 vs 7 la pantalla muestra una **cámara aérea** grande en vivo para el público, y los celulares muestran la cámara de cada jugador (se puede apagar).
- 💦 **Pistola de agua**: 2 impactos para eliminar una bacteria (vida 90, reaparece en 4 s). 🧪 El ácido elimina a un odontólogo en 3 impactos.
- 💣 **Bombas neutrales** (3 por partida): la gana el equipo que la agarre. Odontólogo → limpieza masiva (7 dientes); bacteria → contaminación masiva (7 dientes, las coronas protegen). Cualquier impacto hace soltarla y vuelve a ser neutral.
- ⭐ **Final legendario**: a los 20 s hay aviso y en los **últimos 7 s la lengua se abre** como laberinto (3 entradas, ~5 s de camino). Quien agarre el objeto legendario decide: odontólogo = **enjuague bucal** (todos los dientes limpios) · bacteria = **coca** (todos sucios, menos los que tienen corona). Dentro de la lengua la saliva lava la viscosidad.
- 🍄 **Hongo Cándida**: aparece cada ~50 s y persigue al jugador más cercano (de cualquier equipo). Muerde, empuja y hace daño. Ambos equipos pueden eliminarlo.
- 🪨 **Tonsilolitos**: caen del paladar con una sombra roja de aviso. Noquean 2,5 s y quedan como roca (cobertura) unos segundos.
- 🧴 **Flúor** (odontólogos) / 🍬 **Azúcar** (bacterias): aparecen juntos. Más velocidad y limpian/ensucian más rápido durante 8 s.
- 👑 **Corona** (odontólogos): recógela y mantén LIMPIAR junto a un diente limpio → queda protegido 40 s (máx. 3 a la vez).
- 🧫 **Cepa de caries** (bacterias): aparece junto con la corona. Contagia 1 diente vecino cada 4 s (máx. 4), excepto los que tienen corona. Se detiene si eliminan a quien la lleva.
- 💧 La saliva del suelo te acelera; 🕳️ las caries del suelo te frenan.

## Configuración
Todos los tiempos están en `public/shared/config.js` (`GAME_DURATION`, `TOOTH_ACTION_TIME`, `BACTERIA_RESPAWN_TIME`, `SLIME_IMMOBILIZE_TIME`, `SLIME_COOLDOWN`, `BOMB_LIFETIME`, `BOMB_HOLD_TIME`, `MAX_PLAYERS`, daño de armas…).

## Estructura
- `server.js` – Express + Socket.IO, servidor autoritativo (30 ticks/s).
- `public/shared/` – configuración, mapa y simulación del juego (compartidos por servidor y modo prueba).
- `public/js/` – motor 3D (raycasting), HUD, sonidos sintetizados, controles táctiles y páginas.
- `public/assets/` – sprites (recortados y normalizados desde `personajes/` y `elementos/`).
