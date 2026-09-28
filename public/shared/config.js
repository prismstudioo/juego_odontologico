// Configuración del juego (compartida por servidor y navegador).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MOC = root.MOC || {}).CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // ── Valores principales ──
    GAME_DURATION: 180,          // segundos
    TOOTH_ACTION_TIME: 3,        // segundos para limpiar / ensuciar
    BACTERIA_RESPAWN_TIME: 4,    // balance: los dos equipos reaparecen igual
    DOCTOR_RESPAWN_TIME: 4,
    SPAWN_PROTECTION: 3,         // segundos de protección al reaparecer (no recibe daño ni viscosidad)
    SPRINT_SPEED: 1.45,          // joystick empujado al tope hacia adelante = correr
    SPRINT_THRESHOLD: 0.9,
    SLIME_IMMOBILIZE_TIME: 4,    // antes 8: inmovilizar tanto tiempo era casi una muerte segura
    SLIME_IMMUNITY_TIME: 4,      // tras quitarse la viscosidad no puede volver a ser inmovilizado (evita cadenas infinitas)
    SLIME_COOLDOWN: 6,
    SLIME_HITS_TO_STICK: 1,      // impactos de viscosidad necesarios para inmovilizar
    SLIME_STACK_TIME: 14,        // segundos que dura el estado "pegajoso" (1er impacto) antes de perderse
    STICKY_SPEED: 0.6,
    // Habilidad de los odontólogos: escudo que bloquea viscosidad y ácido
    SHIELD_TIME: 3,              // ahora es automático: más corto para que no bloquee todo
    SHIELD_COOLDOWN: 9,          // empieza a contar cuando el escudo se acaba
    BOMB_LIFETIME: 20,           // segundos en el suelo para capturarla
    BOMB_HOLD_TIME: 20,          // segundos para lanzarla tras recogerla (si no, se pierde)
    BOMB_TEETH_AFFECTED: 7,
    TEETH_BOMBS_PER_MATCH: 5,    // bombas dentales (cambian 7 dientes) por partida; además sale 1 de cada bomba de efecto
    BOMB_SPAWN_WINDOW: [15, 160], // segundos transcurridos en los que pueden aparecer bombas
    // Tipos de bomba: 'teeth' cambia dientes según el equipo; las demás afectan a los enemigos de quien la lanza
    BOMB_KINDS: {
      teeth:   { icon: '💣', label: 'BOMBA DENTAL' },
      anest:   { icon: '💉', label: 'BOMBA DE ANESTESIA', radius: 3.4, stun: 3.5 },      // duerme a los enemigos
      gas:     { icon: '😂', label: 'GAS DE LA RISA', radius: 3.8, time: 6 },            // controles invertidos
      amalgam: { icon: '💥', label: 'BOMBA DE AMALGAMA', radius: 3.2, damage: 75, knockback: 1.4 },
      floss:   { icon: '🧵', label: 'BOMBA DE HILO DENTAL', radius: 3.4, time: 6, speed: 0.45 }, // enreda y frena
    },
    // Estrella: diente de oro que cualquiera puede agarrar (inmortal, súper veloz y disparo automático)
    SUPER: { count: 3, window: [30, 165], life: 18, duration: 6, speed: 1.8, cooldown: 0.4, radius: 0.9 },
    // Racha: cada eliminación da más vida y dispara más rápido; al morir se pierde
    STREAK: { max: 3, hp: 10, heal: 20, cooldown: 0.08 }, // más suave para que quien va ganando no se escape
    MAX_PLAYERS: 14,
    // Modos (total de jugadores): 1 vs 1, 2 vs 2, 5 vs 5, 7 vs 7
    MODES: { 2: { doc: 1, bac: 1 }, 4: { doc: 2, bac: 2 }, 10: { doc: 5, bac: 5 }, 14: { doc: 7, bac: 7 } },
    COUNTDOWN: 3,
    // Equipos desiguales: ventaja = (jugadores rivales / tuyos) ^ HANDICAP_POWER (probado con bots: ~50 % de victorias en 1v2, 2v3, 3v5)
    HANDICAP_POWER: 1.25,

    // ── Simulación ──
    TICK_RATE: 30,
    SNAPSHOT_RATE: 30,
    PLAYER_RADIUS: 0.3,
    DOCTOR_SPEED: 3.3,
    BACTERIA_SPEED: 3.3,
    TURN_SPEED: 2.9,             // rad/s girando con teclado
    MAX_LOOK_PER_INPUT: 1.2,     // giro máximo (rad) por mensaje al arrastrar el dedo
    TOOTH_RANGE: 1.75,           // distancia para poder limpiar / ensuciar
    JUMP_VELOCITY: 3.8,
    GRAVITY: 12,
    JUMP_DODGE_HEIGHT: 0.35,     // en el aire por encima de esto, los proyectiles pasan por debajo
    FOOD_JUMP_HEIGHT: 0.22,      // altura para pasar por encima de restos de comida
    AIM_ASSIST_DEG: 7,           // ayuda de puntería (los joysticks de celular son imprecisos)
    DOCTOR_HP: 100,
    BACTERIA_HP: 100,            // misma vida: cada arma principal necesita 3 impactos
    PICKUP_RADIUS: 0.9,

    WEAPONS: {
      none:  { team: 'doc', label: 'SIN ARMA', icon: '✋' },
      water: { team: 'doc', label: 'PISTOLA DE AGUA', icon: '💦', kind: 'projectile', speed: 11.5, damage: 40, cooldown: 0.6, range: 12, radius: 0.22 },
      drill: { team: 'doc', label: 'TALADRO DENTAL', icon: '🔩', kind: 'melee', range: 1.9, arcDeg: 70, damage: 100, cooldown: 1.1 },
      slime: { team: 'bac', label: 'VISCOSIDAD', icon: '🟢', kind: 'projectile', speed: 9.5, range: 12, radius: 0.3 },
      smg:   { team: 'all', label: 'METRALLETA', icon: '🔫', kind: 'projectile', speed: 17, damage: 7, cooldown: 0.12, range: 9, radius: 0.14, spread: 0.08 }, // corto alcance, no reemplaza al arma principal
      acid:  { team: 'bac', label: 'ÁCIDO', icon: '🧪', kind: 'projectile', speed: 10.5, damage: 36, cooldown: 0.65, range: 12, radius: 0.24,
               puddleRadius: 0.9, puddleTime: 3, puddleDps: 10 },
    },
    // el botón DISPARAR también limpia / ensucia junto a un diente, por eso ya no hace falta "sin arma"
    TEAM_WEAPONS: { doc: ['water', 'smg'], bac: ['slime', 'acid', 'smg'] },
    // Habilidades automáticas (sin botones extra)
    AUTO: { shieldDist: 3, bombTeethDelay: 1.2, bombRange: 7 },
    // Desempate: si terminan con los mismos dientes, carrera para romper la muela gigante del centro.
    // Cada disparo suma 1 a tu equipo y le resta 1 al rival. Gana el primero en llegar a HITS.
    RACE: { hits: 35, countdown: 3, time: 60, x: 22, y: 14.5, radius: 0.9, h: 1.9, weapon: 'smg', speed: 3.3 },

    BOMB_THROW_SPEED: 8,

    // ── Peligros y objetos del mapa (afectan a los dos equipos por igual) ──
    SALIVA_SPEED: 1.3,           // la saliva resbala: más rápido
    CAVITY_SPEED: 0.6,           // las caries del suelo frenan
    FUNGUS: { firstAt: 35, every: 50, life: 28, speed: 1.7, hp: 140, hitDamage: 35, touchDamage: 25, touchCooldown: 1.2, radius: 0.5, knockback: 1.6 },
    TONSIL: { firstAt: 15, every: 12, warn: 1.6, radius: 1.3, stun: 2.5, damage: 15, rockLife: 8, rockRadius: 0.45 },
    // Pareja especial: corona (odontólogos) y cepa de caries (bacterias) aparecen a la vez
    CROWN: { firstAt: 45, every: 45, life: 18, placeTime: 2, duration: 40, maxActive: 3 },
    CONTAGION: { duration: 16, every: 4, maxTeeth: 4 },
    // Final: la lengua se abre como laberinto; quien agarre el objeto legendario decide todos los dientes
    // (odontólogo = enjuague bucal: todos limpios · bacteria = coca: todos sucios, menos los que tienen corona)
    LEGEND: { warnAt: 20, openAt: 7, radius: 0.8, teeth: 4 }, // cambia 4 dientes (antes todos: decidía la partida sola)
    BOOST: { firstAt: 25, every: 30, life: 15, duration: 8, speed: 1.3, actionSpeed: 1.5, radius: 0.8 },
  };
});
