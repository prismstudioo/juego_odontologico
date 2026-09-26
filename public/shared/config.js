// Configuración del juego (compartida por servidor y navegador).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MOC = root.MOC || {}).CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // ── Valores principales ──
    GAME_DURATION: 180,          // segundos
    TOOTH_ACTION_TIME: 3,        // segundos para limpiar / ensuciar
    BACTERIA_RESPAWN_TIME: 4,
    DOCTOR_RESPAWN_TIME: 5,
    SLIME_IMMOBILIZE_TIME: 8,
    SLIME_IMMUNITY_TIME: 4,      // tras quitarse la viscosidad no puede volver a ser inmovilizado (evita cadenas infinitas)
    SLIME_COOLDOWN: 5,
    SLIME_HITS_TO_STICK: 1,      // impactos de viscosidad necesarios para inmovilizar
    SLIME_STACK_TIME: 14,        // segundos que dura el estado "pegajoso" (1er impacto) antes de perderse
    STICKY_SPEED: 0.6,
    // Habilidad de los odontólogos: escudo que bloquea viscosidad y ácido
    SHIELD_TIME: 4,
    SHIELD_COOLDOWN: 7,          // empieza a contar cuando el escudo se acaba           // velocidad mientras está pegajoso
    BOMB_LIFETIME: 20,           // segundos en el suelo para capturarla
    BOMB_HOLD_TIME: 20,          // segundos para lanzarla tras recogerla (si no, se pierde)
    BOMB_TEETH_AFFECTED: 7,
    BOMBS_PER_MATCH: 3,          // bombas neutrales: el efecto depende del equipo que la gane
    BOMB_SPAWN_WINDOW: [20, 150], // segundos transcurridos en los que pueden aparecer bombas
    MAX_PLAYERS: 14,
    // Modos (total de jugadores): 1 vs 1, 2 vs 2, 5 vs 5, 7 vs 7
    MODES: { 2: { doc: 1, bac: 1 }, 4: { doc: 2, bac: 2 }, 10: { doc: 5, bac: 5 }, 14: { doc: 7, bac: 7 } },
    COUNTDOWN: 3,

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
    BACTERIA_HP: 90,
    PICKUP_RADIUS: 0.9,

    WEAPONS: {
      none:  { team: 'doc', label: 'SIN ARMA', icon: '✋' },
      water: { team: 'doc', label: 'PISTOLA DE AGUA', icon: '💦', kind: 'projectile', speed: 11.5, damage: 45, cooldown: 0.55, range: 13, radius: 0.22 },
      drill: { team: 'doc', label: 'TALADRO DENTAL', icon: '🔩', kind: 'melee', range: 1.9, arcDeg: 70, damage: 100, cooldown: 1.1 },
      slime: { team: 'bac', label: 'VISCOSIDAD', icon: '🟢', kind: 'projectile', speed: 9.5, range: 12, radius: 0.3 },
      acid:  { team: 'bac', label: 'ÁCIDO', icon: '🧪', kind: 'projectile', speed: 10, damage: 34, cooldown: 0.9, range: 11, radius: 0.24,
               puddleRadius: 0.9, puddleTime: 3, puddleDps: 12 },
    },
    TEAM_WEAPONS: { doc: ['none', 'water'], bac: ['slime', 'acid'] }, // el taladro se quitó (casi no tenía uso)

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
    LEGEND: { warnAt: 20, openAt: 7, radius: 0.8 },
    BOOST: { firstAt: 25, every: 30, life: 15, duration: 8, speed: 1.3, actionSpeed: 1.5, radius: 0.8 },
  };
});
